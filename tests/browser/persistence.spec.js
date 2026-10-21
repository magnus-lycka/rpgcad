import { test, expect } from "../fixtures/app-test.js";

/** @param {import('@playwright/test').Page} page */
async function ready(page) {
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Calibrate", exact: true }),
  ).toBeEnabled();
}

/** @param {import('@playwright/test').Page} page */
const viewBox = (page) => page.locator("#viewport").getAttribute("viewBox");

test("calibration survives a reload", async ({ page }) => {
  await page.goto("/?mode=edit");
  await ready(page);
  const scale = page.getByLabel("Scale", { exact: true });
  await expect(scale).toHaveText("Uncalibrated");
  await page.getByRole("button", { name: "Calibrate", exact: true }).click();
  await page.getByLabel("Measured length (mm)").fill("80");
  await page.getByLabel("Scale 1:", { exact: true }).fill("75");
  await page.getByRole("button", { name: "Apply scale", exact: true }).click();
  await expect(scale).toHaveText("1:75");
  const percent = page.getByRole("spinbutton", {
    name: "Zoom percentage",
    exact: true,
  });
  await expect(percent).toHaveValue("100");
  await page.reload();
  await ready(page);
  await expect(scale).toHaveText("1:75");
  await expect(percent).toHaveValue("100");
});

test("zoom and position survive a reload", async ({ page }) => {
  await page.goto("/?mode=edit");
  await ready(page);
  const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
  await toolbar.getByRole("button", { name: "Zoom in", exact: true }).click();
  await toolbar.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.mouse.move(500, 300);
  await page.mouse.down();
  await page.mouse.move(430, 340, { steps: 4 });
  await page.mouse.up();
  const before = await viewBox(page);
  await page.reload();
  await ready(page);
  expect(await viewBox(page)).toBe(before);
});

test("each level remembers its own view", async ({ page }) => {
  await page.goto("/?mode=edit&level=below");
  await ready(page);
  const fitted = await viewBox(page);
  await page.goto("/?mode=edit");
  await ready(page);
  await page
    .getByRole("toolbar", { name: "Toolbar", exact: true })
    .getByRole("button", { name: "Zoom in", exact: true })
    .click();
  const zoomed = await viewBox(page);
  expect(zoomed).not.toBe(fitted);
  await page.goto("/?mode=edit&level=below");
  await ready(page);
  expect(await viewBox(page)).toBe(fitted);
  await page.goto("/?mode=edit");
  await ready(page);
  expect(await viewBox(page)).toBe(zoomed);
});

test("corrupt stored settings are reported, not silently ignored", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("rpgcad.view.default.first", "{not json");
  });
  await page.goto("/?mode=edit");
  await expect(page.getByRole("alert")).toContainText(
    "Browser storage problem",
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "rpgcad.view.default.first",
      JSON.stringify({ x: 1, y: 2, mpp: -3 }),
    );
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("is invalid");
});
