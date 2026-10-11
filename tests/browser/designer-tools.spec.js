import { test, expect } from "@playwright/test";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";

preserveBrowserFixture(test);

test("Designer tools keep Clear secondary and keyboard-close its menu", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await expect(
    page.getByRole("button", { name: "Clear marks", exact: true }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Sketch options", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Clear marks", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Clear marks", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Sketch options", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("group", { name: "Design tools", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "View controls", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Designer navigation", exact: true }),
  ).toBeVisible();
});

test("Referee can return to Edit without losing the view or latest marks", async ({
  page,
  request,
}) => {
  await request.put("/sketch?level=below", {
    data: {
      strokes: [
        [
          [1, 2],
          [2, 3],
        ],
      ],
    },
  });
  await page.goto("/?level=below&mode=edit");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const box = await page.locator("#viewport").getAttribute("viewBox");
  if (box === null) throw Error("Plan viewBox missing");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("#gm-panel")).toBeHidden();
  await page.keyboard.press("Shift+G");
  await expect(
    page.getByRole("button", { name: "Return to Edit", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to Edit", exact: true })
    .click();
  await expect(page).toHaveURL(/level=below&mode=edit/);
  await expect(page.locator("#viewport")).toHaveAttribute("viewBox", box);
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await expect(page.locator("#gm-panel")).toBeHidden();
});

test("select controls suppress map shortcuts while editing a choice", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  await page.keyboard.press("Shift+G");
  await page.getByLabel("Destination level", { exact: true }).focus();
  const box = await page.locator("#viewport").getAttribute("viewBox");
  if (box === null) throw Error("Plan viewBox missing");
  await page.keyboard.press("-");
  await page.keyboard.press("Shift+E");
  await expect(page.locator("#viewport")).toHaveAttribute("viewBox", box);
  await expect(page.locator("body")).toHaveAttribute("data-mode", "play");
});

test("narrow Designer controls stay reachable and stay off printed plans", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  for (const name of [
    "Pan",
    "Pen",
    "Sketch options",
    "Zoom in",
    "Fit plan",
    "Calibrate",
    "Play",
  ]) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    if (!box) throw Error("Visible tool has no bounds");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await page
    .getByRole("button", { name: "Sketch options", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Clear marks", exact: true }),
  ).toBeInViewport();
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.locator("#edit-palette")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Clear marks", exact: true }),
  ).toBeHidden();
  await expect(page.locator("#print-pages svg").first()).toBeVisible();
});

test("Escape closes nested calibration without closing requested Referee controls", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  await page.getByRole("button", { name: "View", exact: true }).click();
  const calibrate = page.getByRole("button", {
    name: "Calibrate",
    exact: true,
  });
  await expect(calibrate).toBeEnabled();
  await calibrate.click();
  await expect(
    page.getByRole("dialog", { name: "Calibrate screen scale" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Calibrate screen scale" }),
  ).toBeHidden();
  await expect(page.locator("#gm-panel")).toBeVisible();
  await expect(calibrate).toBeFocused();
});

test("Escape from calibration closes only the topmost temporary control", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await page
    .getByRole("button", { name: "Sketch options", exact: true })
    .click();
  await page.getByRole("button", { name: "Calibrate", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Calibrate screen scale" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Clear marks", exact: true }),
  ).toBeVisible();
});
