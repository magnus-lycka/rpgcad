import { test, expect } from "@playwright/test";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";

preserveBrowserFixture(test);

test("one toolbar offers Play in Edit and Stop in Play, also on Shift+E", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page).toHaveURL(/mode=play/);
  await expect(toolbar).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: "Play", exact: true }),
  ).toHaveCount(0);
  await toolbar.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page).toHaveURL(/mode=edit/);
  await page.keyboard.press("Shift+E");
  await expect(page).toHaveURL(/mode=play/);
  await expect(
    toolbar.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
});

const designTools = [
  "Export SVG",
  "Export PDF",
  "Pan",
  "Pen",
  "Components",
  "Undo drawing marks",
  "Clear marks",
];

test("file and design tools show in Edit; only Library stays in Play", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
  await expect(
    toolbar.getByRole("link", { name: "Library", exact: true }),
  ).toBeVisible();
  for (const name of designTools)
    await expect(
      toolbar.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  await page.keyboard.press("Shift+E");
  await expect(
    toolbar.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await expect(
    toolbar.getByRole("link", { name: "Library", exact: true }),
  ).toBeVisible();
  for (const name of designTools)
    await expect(
      toolbar.getByRole("button", { name, exact: true }),
    ).toBeHidden();
});

test("Export PDF opens the browser print dialog", async ({ page }) => {
  await page.addInitScript(() => {
    const win = /** @type {any} */ (window);
    win.print = () => {
      win.printed = (win.printed ?? 0) + 1;
    };
  });
  await page.goto("/?mode=edit");
  await page
    .getByRole("toolbar", { name: "Toolbar", exact: true })
    .getByRole("button", { name: "Export PDF", exact: true })
    .click();
  expect(await page.evaluate(() => /** @type {any} */ (window).printed)).toBe(
    1,
  );
});

for (const mode of ["edit", "play"]) {
  test(`zoom section works in ${mode}`, async ({ page }) => {
    await page.goto(`/?mode=${mode}`);
    await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
    const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
    for (const name of ["Calibrate", "Zoom out", "Zoom in", "Fit plan"])
      await expect(
        toolbar.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    const percent = toolbar.getByRole("spinbutton", {
      name: "Zoom percentage",
      exact: true,
    });
    const initial = Number.parseFloat(await percent.inputValue());
    await toolbar.getByRole("button", { name: "Zoom in", exact: true }).click();
    expect(Number.parseFloat(await percent.inputValue())).toBeGreaterThan(
      initial,
    );
    await toolbar
      .getByRole("button", { name: "Zoom out", exact: true })
      .click();
    await toolbar
      .getByRole("button", { name: "Zoom out", exact: true })
      .click();
    expect(Number.parseFloat(await percent.inputValue())).toBeLessThan(initial);
    await toolbar
      .getByRole("button", { name: "Fit plan", exact: true })
      .click();
    expect(Number.parseFloat(await percent.inputValue())).toBe(initial);
    await percent.fill("50");
    await percent.press("Enter");
    await expect(percent).toHaveValue("50");
    await page.locator("#viewport").focus();
    await page.keyboard.press("z");
    await expect(percent).toBeFocused();
  });
}

test("scale reads Uncalibrated until the screen is calibrated", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
  const scale = toolbar.getByLabel("Scale", { exact: true });
  await expect(scale).toHaveText("Uncalibrated");
  await toolbar.getByRole("button", { name: "Calibrate", exact: true }).click();
  await page.locator("#calibration-mm").fill("20");
  await page.locator("#calibration-scale").fill("75");
  await page.getByRole("button", { name: "Apply scale", exact: true }).click();
  await expect(scale).toHaveText("1:75");
});

const playTools = [
  "Toggle fog",
  "Reset fog / close all doors",
  "Add PC",
  "Add NPC",
];

test("fog, range and character tools show in Play and not in Edit", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
  for (const name of playTools)
    await expect(
      toolbar.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  await page.keyboard.press("Shift+E");
  await expect(
    toolbar.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  for (const name of playTools)
    await expect(
      toolbar.getByRole("button", { name, exact: true }),
    ).toBeHidden();
});

test("Toggle fog is pressed while fog hides the plan, by button and by Shift+F", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  const fog = page
    .getByRole("toolbar", { name: "Toolbar", exact: true })
    .getByRole("button", { name: "Toggle fog", exact: true });
  const viewport = page.locator("#viewport");
  await expect(fog).toHaveAttribute("aria-pressed", "true");
  await expect(viewport).toHaveAttribute("data-gm-view", "false");
  await fog.click();
  await expect(fog).toHaveAttribute("aria-pressed", "false");
  await expect(viewport).toHaveAttribute("data-gm-view", "true");
  await page.keyboard.press("Shift+F");
  await expect(fog).toHaveAttribute("aria-pressed", "true");
  await expect(viewport).toHaveAttribute("data-gm-view", "false");
  await page.keyboard.down("Shift");
  await page.keyboard.press("V");
  await page.keyboard.up("Shift");
  await expect(fog).toHaveAttribute("aria-pressed", "true");
});

for (const mode of ["edit", "play"]) {
  test(`the Help icon opens the shortcut list in ${mode}`, async ({ page }) => {
    await page.goto(`/?mode=${mode}`);
    await page
      .getByRole("toolbar", { name: "Toolbar", exact: true })
      .getByRole("button", { name: "Keyboard shortcuts", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeVisible();
  });
}

for (const mode of ["edit", "play"]) {
  test(`zoom to 100 percent by button or key in ${mode}`, async ({ page }) => {
    await page.goto(`/?mode=${mode}`);
    await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Calibrate", exact: true }),
    ).toBeEnabled();
    const percent = page.getByRole("spinbutton", {
      name: "Zoom percentage",
      exact: true,
    });
    await page.keyboard.press("+");
    await page.keyboard.press("+");
    expect(Number.parseFloat(await percent.inputValue())).not.toBe(100);
    await page.keyboard.press("0");
    await expect(percent).toHaveValue("100");
    await page.keyboard.press("-");
    await page
      .getByRole("toolbar", { name: "Toolbar", exact: true })
      .getByRole("button", { name: "Zoom to 100%", exact: true })
      .click();
    await expect(percent).toHaveValue("100");
  });
}

test("Info shows the plan and level instead of a permanent label", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await expect(page.locator("#edit-palette")).toHaveCount(0);
  await expect(page.locator("#info-plan")).toBeHidden();
  await page
    .getByRole("toolbar", { name: "Toolbar", exact: true })
    .getByRole("button", { name: "Info", exact: true })
    .click();
  const info = page.getByRole("dialog", { name: "Info" });
  await expect(info.getByText("Referee building")).toBeVisible();
  await expect(info.getByText("Ground")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(info).toBeHidden();
});

test("switching mode shows no status text", async ({ page }) => {
  await page.goto("/?mode=edit");
  await page.keyboard.press("Shift+E");
  await expect(
    page.getByText("Switch Edit / Play", { exact: true }),
  ).toBeHidden();
});

for (const [key, name] of [
  ["i", "Info"],
  ["?", "Keyboard shortcuts"],
]) {
  test(`pressing ${key} again closes ${name}`, async ({ page }) => {
    await page.goto("/?mode=edit");
    await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
    const dialog = page.getByRole("dialog", { name });
    await page.keyboard.press(key);
    await expect(dialog).toBeVisible();
    await page.keyboard.press(key);
    await expect(dialog).toBeHidden();
    await expect(page.locator("#viewport")).toBeFocused();
  });
}

for (const [button, name] of [
  ["Info", "Info"],
  ["Keyboard shortcuts", "Keyboard shortcuts"],
]) {
  test(`clicking the ${button} button again closes ${name}`, async ({
    page,
  }) => {
    await page.goto("/?mode=edit");
    await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
    const icon = page
      .getByRole("toolbar", { name: "Toolbar", exact: true })
      .getByRole("button", { name: button, exact: true });
    const box = await icon.boundingBox();
    if (!box) throw Error("Toolbar button missing");
    const dialog = page.getByRole("dialog", { name });
    await icon.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(dialog).toBeHidden();
    await expect(icon).toBeFocused();
  });
}

test("a command refused because a save is in flight says so instead of doing nothing", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
  await expect(
    toolbar.getByRole("button", { name: "Add PC", exact: true }),
  ).toBeEnabled();
  /** @type {() => void} */
  let release = () => {};
  const held = new Promise((resolve) => {
    release = () => resolve(undefined);
  });
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT") await held;
    await route.continue();
  });
  await toolbar.getByRole("button", { name: "Add PC", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "New PC" });
  await popup.getByLabel("Name").fill("Ada");
  await popup.getByLabel("Visual range (m)").fill("6");
  await popup.getByRole("button", { name: "Add character" }).click();
  await page.keyboard.press("Shift+R");
  await expect(page.getByRole("alert")).toContainText(
    "Reset fog / close all doors: Save in progress",
  );
  release();
  await expect(page.getByRole("alert")).toBeHidden();
});
