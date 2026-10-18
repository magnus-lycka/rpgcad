import { test, expect } from "@playwright/test";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";

preserveBrowserFixture(test);

test("Edit marks every 3 m along the red axes with numbers; Play does not", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  const ticks = page.locator("[data-axis-tick]");
  await expect(ticks.first()).toBeAttached();
  const labels = await ticks.allTextContents();
  expect(labels).toEqual(expect.arrayContaining(["3", "-3"]));
  expect(labels).not.toContain("1.5");
  await page.keyboard.press("Shift+E");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  await expect(ticks).toHaveCount(0);
});

/** @param {import("@playwright/test").Locator} viewport @param {number[]} point */
async function screenPoint(viewport, point) {
  return viewport.evaluate((svg, [x, y]) => {
    if (!(svg instanceof SVGSVGElement)) throw Error("Expected plan SVG");
    const b = svg.viewBox.baseVal;
    return {
      x: ((x - b.x) * svg.clientWidth) / b.width,
      y: ((y - b.y) * svg.clientHeight) / b.height,
    };
  }, point);
}

test("Y numbers grow upward: a tick above the origin is positive", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await expect(page.locator("[data-axis-tick]").first()).toBeAttached();
  const above = await page
    .locator('[data-axis-tick][text-anchor="end"]')
    .evaluateAll((labels) =>
      labels
        .filter((label) => Number(label.getAttribute("y")) < 0)
        .map((label) => label.textContent),
    );
  expect(above).toContain("3");
  expect(above).not.toContain("-3");
});

test("Move origin arms a crosshair, a click snaps the red cross to the nearest grid crossing and saves it", async ({
  page,
  request,
}) => {
  await page.goto("/?mode=edit");
  const viewport = page.locator("#viewport");
  await expect(viewport.locator("pattern")).not.toHaveCount(0);
  const button = page.getByRole("button", { name: "Move origin", exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("body")).toHaveAttribute("data-tool", "origin");
  await viewport.click({ position: await screenPoint(viewport, [4.4, 2.3]) });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(async () => (await (await request.get("/model")).json()).origin)
    .toEqual([4.5, 3]);
  const labels = await page.locator("[data-axis-tick]").allTextContents();
  expect(labels).toEqual(expect.arrayContaining(["3", "-3"]));
});

test("Escape cancels Move origin and leaves the origin where it was", async ({
  page,
  request,
}) => {
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  const button = page.getByRole("button", { name: "Move origin", exact: true });
  await button.click();
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect((await (await request.get("/model")).json()).origin).toEqual([0, 0]);
});
