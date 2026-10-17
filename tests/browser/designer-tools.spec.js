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
  await page.getByLabel("Zoom controls", { exact: true }).click();
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
  for (const name of ["Pan", "Pen", "Sketch options", "Play"]) {
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
  await expect(
    page.getByRole("button", { name: "Calibrate", exact: true }),
  ).toBeInViewport();
  await page.getByLabel("Zoom controls", { exact: true }).click();
  for (const name of ["Zoom in", "Zoom out", "Fit plan"]) {
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeInViewport();
  }
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
  await page.getByRole("tab", { name: "View", exact: true }).click();
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

test("compact Designer toolbar navigates by arrows without moving the Model", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  const toolbar = page.getByRole("toolbar", { name: "Designer commands" });
  await expect(toolbar).toBeVisible();
  const box = await page.locator("#edit-palette").boundingBox();
  if (!box) throw Error("Designer toolbar missing");
  // Recorded pre-change card: 511.359375 × 239.984375 CSS pixels.
  expect(box.width * box.height).toBeLessThanOrEqual(49087.304003906254);
  const view = await page.locator("#viewport").getAttribute("viewBox");
  if (view === null) throw Error("Plan viewBox missing");
  await page.getByRole("button", { name: "Pen", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Pan", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Pan", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("button", { name: "Pen", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Pen", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#viewport")).toHaveAttribute("viewBox", view);
  await expect(toolbar.locator('[tabindex="0"]')).toHaveCount(1);
});

test("toolbar has one Tab entry and exposes zoom and overflow commands", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  await page.locator("#viewport").focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Pen", exact: true }),
  ).toBeFocused();
  const undo = page.getByRole("button", {
    name: "Undo drawing marks",
    exact: true,
  });
  await expect(undo).toHaveAttribute("title", "Undo drawing marks (Mod+Z)");
  await expect(undo).toHaveAttribute("aria-keyshortcuts", "Control+Z Meta+Z");
  const percent = page.getByLabel("Zoom percentage", { exact: true });
  const initialLabel = await percent.textContent();
  const initial = Number.parseFloat(initialLabel || "");
  await page.getByLabel("Zoom controls", { exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const zoomed = Number.parseFloat((await percent.textContent()) || "");
  expect(zoomed).toBeGreaterThan(initial);
  await page.getByRole("button", { name: "Fit plan", exact: true }).click();
  await expect(percent).toHaveText(initialLabel || "");
  await expect(
    page.getByRole("button", { name: "Calibrate", exact: true }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Sketch options", exact: true })
    .click();
  await page.keyboard.press("ArrowDown");
  const calibrate = page.getByRole("button", {
    name: "Calibrate",
    exact: true,
  });
  await expect(calibrate).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Calibrate screen scale" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(calibrate).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Sketch options", exact: true }),
  ).toBeFocused();
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
    page.getByRole("button", { name: "Pen", exact: true }),
  ).toBeFocused();
});

test("one percentage control discloses zoom actions and returns focus on Escape", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeHidden();
  const zoom = page.getByLabel("Zoom controls", { exact: true });
  await zoom.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Zoom out", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(zoom).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Zoom out", exact: true }),
  ).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("link", { name: "Library", exact: true }),
  ).toBeFocused();
});
