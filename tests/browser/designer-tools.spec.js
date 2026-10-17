import { test, expect } from "@playwright/test";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";

preserveBrowserFixture(test);

test("Clear marks and Calibrate sit on the toolbar with no overflow menu", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
  await expect(
    toolbar.getByRole("button", { name: "Clear marks", exact: true }),
  ).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: "Calibrate", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sketch options", exact: true }),
  ).toHaveCount(0);
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
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page).toHaveURL(/level=below&mode=edit/);
  await expect(page.locator("#viewport")).toHaveAttribute("viewBox", box);
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await expect(page.locator("#gm-panel")).toBeHidden();
});

test("select controls suppress map shortcuts while editing a choice", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /./,
  );
  await page.keyboard.press("Shift+G");
  const select = page.getByLabel("Character", { exact: true });
  await select.focus();
  await expect(select).toBeFocused();
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
    "Clear marks",
    "Calibrate",
    "Fit plan",
    "Play",
  ]) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    if (!box) throw Error("Visible tool has no bounds");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await expect(
    page.getByRole("button", { name: "Calibrate", exact: true }),
  ).toBeInViewport();
  for (const name of ["Zoom in", "Zoom out", "Fit plan"]) {
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeInViewport();
  }
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.locator("#edit-palette")).toBeHidden();
  await expect(page.locator("#toolbar")).toBeHidden();
  await expect(page.locator("#print-pages svg").first()).toBeVisible();
});

test("Escape closes nested calibration without closing requested Referee controls", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
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
  await page.getByRole("button", { name: "Calibrate", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Calibrate screen scale" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Calibrate", exact: true }),
  ).toBeVisible();
});

test("Toolbar navigates by arrows without moving the Model", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
  await expect(toolbar).toBeVisible();
  const view = await page.locator("#viewport").getAttribute("viewBox");
  if (view === null) throw Error("Plan viewBox missing");
  await page.getByRole("button", { name: "Pan", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Pen", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Pen", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeFocused();
  await expect(page.locator("#viewport")).toHaveAttribute("viewBox", view);
  await expect(toolbar.locator('[tabindex="0"]')).toHaveCount(1);
});

test("toolbar has one Tab entry and exposes zoom and calibration commands", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  await page.locator("#viewport").focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeFocused();
  const undo = page.getByRole("button", {
    name: "Undo drawing marks",
    exact: true,
  });
  await expect(undo).toHaveAttribute("title", "Undo drawing marks (Mod+Z)");
  await expect(undo).toHaveAttribute("aria-keyshortcuts", "Control+Z Meta+Z");
  const calibrate = page.getByRole("button", {
    name: "Calibrate",
    exact: true,
  });
  await calibrate.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Calibrate screen scale" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(calibrate).toBeFocused();
});

test("Designer toolbar remains a Tab stop when the page starts in Play", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  await page.keyboard.press("Shift+E");
  await page.locator("#viewport").focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeFocused();
});
