import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";

preserveBrowserFixture(test);

// Characterises the complete demo through the already implemented saved authoring loop.
test("demo catalogue selection, variation, reload and door fog use normal saved APIs", async ({
  page,
  request,
}) => {
  const search = await (
    await request.get("/components?q=crew%20console")
  ).json();
  expect(search.entries[0].key).toBe("console@1");
  const exact = await (
    await request.get("/components?definition=console%401")
  ).json();
  expect(exact.entries[0].definition.family).toBe("console");
  const copy = await (await request.post("/duplicate?plan=depot")).json();
  const q = `?plan=${copy.id}&level=${copy.levels[0].id}`;
  const model = JSON.parse(
    readFileSync("prototype/demos/component-demo.json", "utf8"),
  );
  expect((await request.put(`/model${q}`, { data: model })).status()).toBe(204);
  await page.goto(`/${q}&mode=edit&region=plan`);
  await expect(
    page.locator(
      '#viewport [data-component="console-three"] [data-console-seat]',
    ),
  ).toHaveCount(3);
  await expect(
    page.locator('#viewport [data-component="bed-wide"]'),
  ).toHaveAttribute("transform", "translate(4.2 0.6) rotate(90)");
  await page.reload();
  await expect(
    page.locator(
      '#viewport [data-component="console-single"] [data-console-seat]',
    ),
  ).toHaveCount(1);
  expect((await (await request.get(`/model${q}`)).json()).components).toEqual(
    model.components,
  );
  await page.goto(`/${q}&mode=play`);
  const viewport = page.locator("#viewport");
  const position = (point) =>
    viewport.evaluate((svg, [x, y]) => {
      if (!(svg instanceof SVGSVGElement)) throw Error("Expected SVG");
      const b = svg.viewBox.baseVal;
      return {
        x: ((x - b.x) * svg.clientWidth) / b.width,
        y: ((y - b.y) * svg.clientHeight) / b.height,
      };
    }, point);
  await viewport.click({ position: await position([7.5, 4.5]) });
  await expect
    .poll(
      async () =>
        (await (await request.get(`/exploration${q}`)).json()).observations
          .length,
    )
    .toBe(1);
  const colour = async () => {
    const point = await position([10.1, 4.6]);
    const png = PNG.sync.read(await viewport.screenshot());
    const i = (Math.round(point.y) * png.width + Math.round(point.x)) * 4;
    return [...png.data.subarray(i, i + 3)];
  };
  expect(await colour()).toEqual([203, 210, 206]);
  await viewport.click({
    position: await position([9, 4.5]),
    modifiers: ["Shift"],
  });
  await expect.poll(colour).toEqual([255, 255, 255]);
  await expect
    .poll(
      async () =>
        (await (await request.get(`/exploration${q}`)).json()).doors[
          "room-door"
        ],
    )
    .toBe("open");
  await page.reload();
  await expect.poll(colour).toEqual([255, 255, 255]);
});
