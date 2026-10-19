import { test, expect } from "@playwright/test";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";

preserveBrowserFixture(test);

/** @param {import("@playwright/test").Page} page */
const sheetFill = (page) =>
  page.locator("#viewport > rect").first().getAttribute("fill");

test("Edit offers a Blueprint theme: white linework on blue, kept across reloads, absent in Play", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  const toggle = page.getByRole("button", { name: "Blueprint", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(await sheetFill(page)).toBe("#f1f5fa");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(await sheetFill(page)).toBe("#1c4f8f");
  await expect(page.locator("[data-wall]").first()).toHaveAttribute(
    "fill",
    "#eef4ff",
  );
  await page.reload();
  expect(await sheetFill(page)).toBe("#1c4f8f");
  await page.keyboard.press("Shift+E");
  await expect(page.locator("[data-axis-tick]")).toHaveCount(0);
  expect(await sheetFill(page)).not.toBe("#1c4f8f");
  await expect(
    page.getByRole("button", { name: "Blueprint", exact: true }),
  ).toBeHidden();
  await page.keyboard.press("Shift+E");
  await page.keyboard.press("b");
  expect(await sheetFill(page)).toBe("#f1f5fa");
});

test("drawing marks stay visible on the blueprint sheet", async ({ page }) => {
  await page.goto("/?mode=edit");
  await page.getByRole("button", { name: "Blueprint", exact: true }).click();
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  const box = await page.locator("#viewport").boundingBox();
  if (!box) throw Error("No viewport");
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 260);
  await page.mouse.up();
  await expect(page.locator("[data-sketch-stroke]").first()).toHaveAttribute(
    "stroke",
    "#ffd24a",
  );
});

test("exported SVG stays light while the screen is blueprint", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await page.getByRole("button", { name: "Blueprint", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  const path = await (await download).path();
  const { readFileSync } = await import("node:fs");
  const svg = readFileSync(path, "utf8");
  expect(svg).toContain("<svg");
  expect(svg).not.toContain("#1c4f8f");
  expect(svg).not.toContain("#eef4ff");
});
