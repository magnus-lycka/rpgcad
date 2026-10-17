import { test, expect } from "@playwright/test";

test("shared palette finds and runs commands in both modes and restores focus", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport")).toContainText("SECRET");
  await page.locator("#pan-tool").focus();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Commands" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("zmi");
  await expect(dialog.getByRole("option")).toHaveCount(1);
  await expect(dialog).toContainText("Zoom in");
  const before = await page.locator("#viewport").getAttribute("viewBox");
  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#pan-tool")).toBeFocused();
  await expect(page.locator("#viewport")).not.toHaveAttribute(
    "viewBox",
    before || "",
  );
  await page.keyboard.press("Shift+E");
  await expect(page.locator("body")).toHaveAttribute("data-mode", "play");
  await page.keyboard.press("/");
  await dialog.getByRole("combobox").fill("calib");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Calibrate screen scale" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Calibrate screen scale" }),
  ).not.toBeVisible();
  await page.keyboard.press("?");
  await expect(
    page.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toContainText("Shift+L");
});

test("shared shortcuts preserve native fields, support Ctrl and Command exports and announce keyboard actions", async ({
  page,
}) => {
  await page.goto("/?mode=edit&level=below");
  await expect(page.locator("[data-calibrate]").first()).toBeEnabled();
  for (const mode of ["edit", "play"]) {
    for (const modifier of ["Control", "Meta"]) {
      const download = page.waitForEvent("download");
      await page.keyboard.press(`${modifier}+e`);
      expect((await download).suggestedFilename()).toBe("rpgcad.svg");
    }
    await page.keyboard.press("+");
    await expect(
      page.locator(mode === "edit" ? "#sketch-status" : "#fog-status"),
    ).toHaveText("Zoom in");
    await page.keyboard.press("k");
    const input = page.locator("#calibration-mm");
    await input.fill("12");
    await page.keyboard.press("Shift+E");
    await expect(page.locator("body")).toHaveAttribute("data-mode", mode);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    if (mode === "edit") await page.keyboard.press("Shift+E");
  }
  await expect(page).toHaveURL(/level=below/);
});

test("palette explains unavailable calibration while loading and Escape restores its launcher", async ({
  page,
}) => {
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/model*", async (route) => {
    await waiting;
    await route.continue();
  });
  try {
    await page.goto("/?mode=edit");
    await page.locator("#pan-tool").focus();
    await page.keyboard.press("Meta+k");
    const palette = page.getByRole("dialog", { name: "Commands" });
    await palette.getByRole("combobox").fill("calibrate");
    await expect(palette.getByRole("option")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(palette).toContainText("Plan is loading");
    await page.keyboard.press("Enter");
    await expect(palette).toBeVisible();
    const selection = await palette
      .getByRole("combobox")
      .getAttribute("aria-activedescendant");
    release();
    await expect(palette.getByRole("option")).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    await expect(palette).not.toContainText("Plan is loading");
    await expect(palette.getByRole("combobox")).toBeFocused();
    await expect(palette.getByRole("combobox")).toHaveAttribute(
      "aria-activedescendant",
      selection || "",
    );
    await page.keyboard.press("Escape");
    await expect(page.locator("#pan-tool")).toBeFocused();
  } finally {
    release();
  }
});

test("palette updates save availability without losing the selected command or focus", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /./,
  );
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/exploration*", async (route) => {
    if (route.request().method() === "PUT") {
      await waiting;
      await route.fulfill({ status: 503 });
    } else await route.continue();
  });
  try {
    await page.keyboard.press("Shift+R");
    await page.keyboard.press("/");
    const palette = page.getByRole("dialog", { name: "Commands" });
    const search = palette.getByRole("combobox");
    await search.fill("Reset fog");
    const option = palette.getByRole("option");
    await expect(option).toContainText("Save in progress");
    await expect(option).toHaveAttribute("aria-disabled", "true");
    const selection = await search.getAttribute("aria-activedescendant");
    release();
    await expect(option).toHaveAttribute("aria-disabled", "false");
    await expect(option).not.toContainText("Save in progress");
    await expect(search).toBeFocused();
    await expect(search).toHaveAttribute(
      "aria-activedescendant",
      selection || "",
    );
  } finally {
    release();
  }
});
