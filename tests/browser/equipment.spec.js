import { test, expect } from "@playwright/test";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";

preserveBrowserFixture(test);

const definitions = {
  "console@1": {
    id: "console",
    version: 1,
    name: "Console",
    family: "console",
    defaults: { width: 0.9, length: 1.35, seatCount: 1 },
    details: { headDepth: 0.55 },
    blocksSight: false,
    access: { blocksPassage: true, frontClearance: 0.75 },
  },
  "machinery@1": {
    id: "machinery",
    version: 1,
    name: "Machinery",
    family: "machinery",
    defaults: { width: 1.5, length: 2 },
    details: { headDepth: 0.3 },
    blocksSight: true,
    access: { blocksPassage: true, frontClearance: 0.75 },
  },
};

test("saved equipment retains local settings, orientation and explicit access/sight overrides", async ({
  page,
  request,
}) => {
  const copy = await (await request.post("/duplicate?plan=depot")).json();
  const query = `?plan=${copy.id}&level=${copy.levels[0].id}`;
  const model = await (await request.get(`/model${query}`)).json();
  model.componentDefinitions = structuredClone(definitions);
  model.components = [
    {
      id: "console-a",
      definition: "console@1",
      at: [1.13, 2.27],
      rotation: 90,
      settings: { seatCount: 3 },
      access: { frontClearance: 1.1 },
    },
    { id: "console-b", definition: "console@1", at: [5.13, 2.27], rotation: 0 },
    {
      id: "motor-a",
      definition: "machinery@1",
      at: [5.17, 5.29],
      rotation: 180,
      settings: { width: 2, length: 3 },
      blocksSight: false,
      access: { blocksPassage: false },
    },
  ];
  expect((await request.put(`/model${query}`, { data: model })).status()).toBe(
    204,
  );
  await page.goto(`/${query}&mode=edit`);
  const console = page.locator('#viewport [data-component="console-a"]');
  await expect(console.locator("[data-console-seat]")).toHaveCount(3);
  await expect(
    page.locator('#viewport [data-component="console-b"] [data-console-seat]'),
  ).toHaveCount(1);
  await expect(
    page.locator('#viewport [data-component="motor-a"]'),
  ).toHaveAttribute("transform", "translate(5.17 5.29) rotate(180)");
  await page.reload();
  await expect(console.locator("[data-console-seat]")).toHaveCount(3);
  const saved = await (await request.get(`/model${query}`)).json();
  expect(saved.components).toEqual(model.components);
  expect(saved.componentDefinitions).toEqual(definitions);
  const duplicate = await (
    await request.post(`/duplicate?plan=${copy.id}`)
  ).json();
  const duplicated = await (
    await request.get(
      `/model?plan=${duplicate.id}&level=${duplicate.levels[0].id}`,
    )
  ).json();
  expect(duplicated.components).toEqual(model.components);
  expect(duplicated.componentDefinitions).toEqual(definitions);
  await page.goto(`/library.html?plan=${copy.id}`);
  await expect(
    page.locator(
      'svg[data-thumbnail] [data-component="console-a"] [data-console-seat]',
    ),
  ).toHaveCount(3);
});

test("invalid access overrides reject the whole authored save without changing data or dates", async ({
  request,
}) => {
  const copy = await (await request.post("/duplicate?plan=depot")).json();
  const query = `?plan=${copy.id}&level=${copy.levels[0].id}`;
  const model = await (await request.get(`/model${query}`)).json();
  model.componentDefinitions = structuredClone(definitions);
  model.components = [
    { id: "motor", definition: "machinery@1", at: [2, 2], rotation: 0 },
  ];
  expect((await request.put(`/model${query}`, { data: model })).status()).toBe(
    204,
  );
  const before = await (await request.get(`/plan?plan=${copy.id}`)).json();
  const invalid = structuredClone(model);
  invalid.components[0].access = { frontClearance: -1 };
  expect(
    (await request.put(`/model${query}`, { data: invalid })).status(),
  ).toBe(400);
  expect(await (await request.get(`/model${query}`)).json()).toEqual(model);
  expect(await (await request.get(`/plan?plan=${copy.id}`)).json()).toEqual(
    before,
  );
});

// Characterises equipment through the existing observation/snapshot workflow.
test("machinery sight overrides affect rendered fog and remembered equipment retains observed settings", async ({
  page,
  request,
}) => {
  const copy = await (await request.post("/duplicate?plan=depot")).json();
  const query = `?plan=${copy.id}&level=${copy.levels[0].id}`;
  const model = {
    wallThickness: 0.15,
    walls: [],
    openings: [],
    labels: [
      { id: "near", at: [0, 0], text: "EQUIPMENT" },
      { id: "far", at: [9, 7], text: " " },
    ],
    componentDefinitions: structuredClone(definitions),
    components: [
      { id: "motor", definition: "machinery@1", at: [3, 2], rotation: 0 },
      { id: "console", definition: "console@1", at: [2, 5], rotation: 0 },
    ],
  };
  expect((await request.put(`/model${query}`, { data: model })).status()).toBe(
    204,
  );
  const exploration = await request.get(`/exploration${query}`);
  expect(
    (
      await request.put(`/exploration${query}`, {
        headers: { "If-Match": exploration.headers().etag },
        data: {
          version: 2,
          observers: [{ id: "party", at: [1, 3], range: 10 }],
          observations: [],
          revisions: {},
          doors: {},
          visibilityPaused: true,
        },
      })
    ).status(),
  ).toBe(204);
  await page.goto(`/${query}&mode=play`);
  const viewport = page.locator("#viewport");
  await expect(viewport).toHaveAttribute("data-observers", /party/);
  const position = (point) =>
    viewport.evaluate((svg, [x, y]) => {
      if (!(svg instanceof SVGSVGElement)) throw Error("Expected SVG");
      const b = svg.viewBox.baseVal;
      return {
        x: ((x - b.x) * svg.clientWidth) / b.width,
        y: ((y - b.y) * svg.clientHeight) / b.height,
      };
    }, point);
  const reveal = async () => {
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/exploration?") &&
          r.request().method() === "PUT" &&
          r.status() === 204,
      ),
      viewport.click({ position: await position([1, 3]) }),
    ]);
  };
  await reveal();
  const unknown = await fogColour(viewport, await position([6.1, 3.1]));
  expect(unknown).toEqual([203, 210, 206]);
  model.components[0].blocksSight = false;
  expect((await request.put(`/model${query}`, { data: model })).status()).toBe(
    204,
  );
  await expect
    .poll(async () => fogColour(viewport, await position([6.1, 3.1])))
    .toEqual([255, 255, 255]);
  await reveal();
  const old = await (await request.get(`/exploration${query}`)).json();
  expect(old.observations).toHaveLength(2);
  const observed = old.revisions[old.observations[1].revision];
  expect(observed.components[0].blocksSight).toBe(false);
  expect(observed.componentDefinitions).toEqual(definitions);
  model.components[1].settings = { seatCount: 3 };
  model.componentDefinitions["machinery@1"].details.headDepth = 0.5;
  expect((await request.put(`/model${query}`, { data: model })).status()).toBe(
    204,
  );
  const previous = await request.get(`/exploration${query}`);
  old.observers = [{ id: "party", at: [9, 7], range: 1 }];
  expect(
    (
      await request.put(`/exploration${query}`, {
        headers: { "If-Match": previous.headers().etag },
        data: old,
      })
    ).status(),
  ).toBe(204);
  await page.reload();
  await expect(
    viewport.locator(
      '[data-memory="1"] [data-component="console"] [data-console-seat]',
    ),
  ).toHaveCount(1);
  await expect(
    viewport.locator('[data-memory="1"] [data-machinery-panel]'),
  ).toHaveAttribute("height", "0.3");
  await expect(
    viewport.locator(
      'g[clip-path$="visible)"] [data-component="console"] [data-console-seat]',
    ),
  ).toHaveCount(3);
});

/** @param {import("@playwright/test").Locator} viewport @param {{x:number,y:number}} point */
async function fogColour(viewport, point) {
  const { PNG } = await import("pngjs");
  const png = PNG.sync.read(await viewport.screenshot());
  const offset = (Math.floor(point.y) * png.width + Math.floor(point.x)) * 4;
  return [...png.data.subarray(offset, offset + 3)];
}
