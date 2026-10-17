import { test, expect } from "@playwright/test";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";
preserveBrowserFixture(test);
test("component door shift-click state persists and reset closes the existing opening", async ({
  page,
  request,
}) => {
  const copy = await (await request.post("/duplicate?plan=depot")).json();
  const q = `?plan=${copy.id}&level=${copy.levels[0].id}`;
  const m = {
    wallThickness: 0.2,
    walls: [{ id: "wall", a: [3, -3], b: [3, 3] }],
    openings: [{ id: "access", wall: "wall", offset: 2.5, width: 1 }],
    labels: [],
    componentDefinitions: {
      "door@1": {
        id: "door",
        version: 1,
        name: "Wall door",
        family: "door",
        defaults: { width: 1, length: 0.06 },
        details: { leafThickness: 0.06 },
        blocksSight: true,
      },
    },
    components: [{ id: "panel", definition: "door@1", opening: "access" }],
  };
  expect((await request.put(`/model${q}`, { data: m })).status()).toBe(204);
  await page.goto(`/${q}&mode=play`);
  const viewport = page.locator("#viewport");
  const point = await viewport.evaluate((svg) => {
    if (!(svg instanceof SVGSVGElement)) throw Error("Expected SVG");
    const b = svg.viewBox.baseVal;
    return {
      x: ((3 - b.x) * svg.clientWidth) / b.width,
      y: (-b.y * svg.clientHeight) / b.height,
    };
  });
  await page.keyboard.press("Shift+V");
  await expect(
    viewport.locator('[data-door="access"]').first(),
  ).toHaveAttribute("data-door-state", "closed");
  await viewport.click({ position: point, modifiers: ["Shift"] });
  await expect(
    viewport.locator('[data-door="access"]').first(),
  ).toHaveAttribute("data-door-state", "open");
  await expect
    .poll(
      async () =>
        (await (await request.get(`/exploration${q}`)).json()).doors.access,
    )
    .toBe("open");
  await page.reload();
  await page.keyboard.press("Shift+V");
  await expect(
    viewport.locator('[data-door="access"]').first(),
  ).toHaveAttribute("data-door-state", "open");
  await page.keyboard.press("Shift+R");
  await expect
    .poll(
      async () => (await (await request.get(`/exploration${q}`)).json()).doors,
    )
    .toEqual({});
});

test("oversized component doorway authoring retains the previous valid level", async ({
  request,
}) => {
  const copy = await (await request.post("/duplicate?plan=depot")).json();
  const q = `?plan=${copy.id}&level=${copy.levels[0].id}`;
  const before = await (await request.get(`/model${q}`)).json();
  const invalid = {
    wallThickness: 0.2,
    walls: [{ id: "wall", a: [0, 0], b: [2, 0] }],
    openings: [{ id: "access", wall: "wall", offset: 0.5, width: 2 }],
    labels: [],
    componentDefinitions: {
      "door@1": {
        id: "door",
        version: 1,
        name: "Wall door",
        family: "door",
        defaults: { width: 1, length: 0.06 },
        details: { leafThickness: 0.06 },
        blocksSight: true,
      },
    },
    components: [{ id: "panel", definition: "door@1", opening: "access" }],
  };
  expect((await request.put(`/model${q}`, { data: invalid })).status()).toBe(
    400,
  );
  expect(await (await request.get(`/model${q}`)).json()).toEqual(before);
});
