import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";

preserveBrowserFixture(test);

/** Put the POV character of the lower level at a position, with nothing explored yet.
 * @param {import("@playwright/test").APIRequestContext} request @param {number[]} at */
async function placePc(request, at) {
  const saved = await request.put("/characters", {
    headers: { "If-Match": (await request.get("/characters")).headers().etag },
    data: {
      characters: [
        { id: "pc", name: "Ada", kind: "pc", level: "below", at, range: 6 },
      ],
      pov: "pc",
    },
  });
  expect(saved.status()).toBe(204);
  const previous = await request.get("/exploration?level=below");
  const cleared = await request.put("/exploration?level=below", {
    headers: { "If-Match": previous.headers().etag },
    data: {
      version: 2,
      observers: [],
      doors: {},
      observations: [],
      revisions: {},
      visibilityPaused: true,
    },
  });
  expect(cleared.status()).toBe(204);
}

/** Click the POV marker and wait until the resulting exploration save has landed, so it cannot leak into the next test.
 * @param {import("@playwright/test").Page} page */
async function revealFromMarker(page) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/exploration" &&
        response.request().method() === "PUT" &&
        response.status() === 204,
    ),
    page.locator('[data-character="pc"]').click(),
  ]);
}

/** @param {import("@playwright/test").Locator} viewport @param {number[]} point */
async function colour(viewport, point) {
  const at = await viewport.evaluate((svg, [x, y]) => {
    if (!(svg instanceof SVGSVGElement)) throw Error("Expected plan SVG");
    const b = svg.viewBox.baseVal;
    return {
      x: ((x - b.x) * svg.clientWidth) / b.width,
      y: ((y - b.y) * svg.clientHeight) / b.height,
    };
  }, point);
  const png = PNG.sync.read(await viewport.screenshot());
  const offset = (Math.floor(at.y) * png.width + Math.floor(at.x)) * 4;
  return [...png.data.subarray(offset, offset + 3)];
}

test("Edit shows solid ground as a pattern and the floor chamber as plain floor", async ({
  page,
}) => {
  await page.goto("/?mode=edit&level=below");
  await expect(page.locator('[data-terrain="solid"]')).toHaveCount(1);
  await expect(page.locator('[data-terrain-area="chamber"]')).toHaveCount(1);
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
});

// The lower level has no walls, so only the terrain can stop the view.
test("a character on the floor chamber reveals it", async ({
  page,
  request,
}) => {
  await placePc(request, [3, 0]);
  await page.goto("/?fog=1&level=below");
  await revealFromMarker(page);
  const viewport = page.locator("#viewport");
  await expect.poll(() => colour(viewport, [1, 0.7])).toEqual([255, 255, 255]);
});

test("a character standing on solid ground beside the chamber reveals nothing", async ({
  page,
  request,
}) => {
  await placePc(request, [6, 0]);
  await page.goto("/?fog=1&level=below");
  await revealFromMarker(page);
  const viewport = page.locator("#viewport");
  await expect(viewport).toHaveAttribute("data-observations", /^[1-9]/);
  expect(await colour(viewport, [1, 0.7])).toEqual([203, 210, 206]);
  expect(await colour(viewport, [5, 0.7])).toEqual([203, 210, 206]);
});
