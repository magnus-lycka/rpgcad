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
  "Decrease default range",
  "Increase default range",
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
  await expect(
    toolbar.getByRole("spinbutton", {
      name: "Default visual range (m)",
      exact: true,
    }),
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

test("Toggle fog switches the Referee's full-plan view", async ({ page }) => {
  await page.goto("/?mode=play");
  const fog = page
    .getByRole("toolbar", { name: "Toolbar", exact: true })
    .getByRole("button", { name: "Toggle fog", exact: true });
  await expect(fog).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-gm-view",
    "false",
  );
  await fog.click();
  await expect(fog).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-gm-view",
    "true",
  );
});

test("range buttons step the saved default range by 1.5 m", async ({
  page,
  request,
}) => {
  await page.goto("/?mode=play");
  const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
  const range = toolbar.getByRole("spinbutton", {
    name: "Default visual range (m)",
    exact: true,
  });
  await expect(range).toHaveValue("6");
  await toolbar
    .getByRole("button", { name: "Increase default range", exact: true })
    .click();
  await expect(range).toHaveValue("7.5");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).defaultRange,
    )
    .toBe(7.5);
  await toolbar
    .getByRole("button", { name: "Decrease default range", exact: true })
    .click();
  await expect(range).toHaveValue("6");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).defaultRange,
    )
    .toBe(6);
});

test("Add PC and Add NPC save one character of each kind", async ({
  page,
  request,
}) => {
  await page.goto("/?mode=play");
  const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
  const kinds = async () =>
    (await (await request.get("/characters")).json()).characters.map(
      (character) => character.kind,
    );
  expect(await kinds()).toEqual([]);
  await toolbar.getByRole("button", { name: "Add PC", exact: true }).click();
  await expect.poll(kinds).toEqual(["pc"]);
  await expect(page.locator("[data-character]")).toHaveCount(1);
  await toolbar.getByRole("button", { name: "Add NPC", exact: true }).click();
  await expect.poll(kinds).toEqual(["pc", "npc"]);
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

test("Shift-< raises and < lowers the default range, whatever the layout calls them", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  const range = page.getByRole("spinbutton", {
    name: "Default visual range (m)",
    exact: true,
  });
  await expect(range).toHaveValue("6");
  await expect(
    page.getByRole("button", { name: "Add PC", exact: true }),
  ).toBeEnabled();
  await page.keyboard.down("Shift");
  await page.keyboard.press(">");
  await page.keyboard.up("Shift");
  await expect(range).toHaveValue("7.5");
  await expect(range).toBeEnabled();
  await page.keyboard.press("<");
  await expect(range).toHaveValue("6");
});

for (const mode of ["edit", "play"]) {
  test(`zoom to 100 percent by button or key in ${mode}`, async ({ page }) => {
    await page.goto(`/?mode=${mode}`);
    await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
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
