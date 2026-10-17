import { test, expect } from "@playwright/test";

test("GM activities are tabs with keyboard selection rather than independent toggles", async ({
  page,
}) => {
  await page.goto("/?plan=depot&mode=play");
  await page.keyboard.press("Shift+G");
  const characters = page.getByRole("tab", { name: "Characters", exact: true });
  await expect(characters).toHaveAttribute("aria-selected", "true");
  await expect(characters).toBeFocused();
  await characters.press("ArrowRight");
  const exploration = page.getByRole("tab", {
    name: "Exploration",
    exact: true,
  });
  await expect(exploration).toBeFocused();
  await expect(exploration).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tabpanel", { name: "Exploration", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tabpanel", { name: "Characters", exact: true }),
  ).toBeHidden();
  await exploration.press("End");
  await expect(
    page.getByRole("tab", { name: "View", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(characters).toBeFocused();
});

test("character actions are unavailable until a character is selected", async ({
  page,
  request,
}) => {
  const previous = await request.get("/characters?plan=depot");
  await request.put("/characters?plan=depot", {
    headers: { "If-Match": previous.headers().etag },
    data: { characters: [], pov: null },
  });
  await page.goto("/?plan=depot&mode=play");
  await page.keyboard.press("Shift+G");
  await expect(
    page.getByLabel("Selected character visual range (m)"),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Rename", exact: true }),
  ).toBeHidden();
  await expect(page.getByLabel("Destination level")).toBeHidden();
  await page.getByLabel("Character name").fill("Scout");
  await page.getByRole("button", { name: "Add PC", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Rename", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Move to level", exact: true }),
  ).toBeDisabled();
  const current = await request.get("/characters?plan=depot");
  await request.put("/characters?plan=depot", {
    headers: { "If-Match": current.headers().etag },
    data: await previous.json(),
  });
});

test("Referee requests one GM activity at a time without saving play state", async ({
  page,
  request,
}) => {
  const before = await (await request.get("/plan?plan=depot")).json();
  const saves = [];
  page.on("request", (req) => {
    if (["PUT", "PATCH"].includes(req.method())) saves.push(req.url());
  });
  await page.goto("/?plan=depot&mode=play");
  await expect(page.locator("#viewport")).toContainText("DEPOT");
  await expect(page.getByRole("region", { name: "GM controls" })).toBeHidden();
  await page.keyboard.press("Shift+G");
  await expect(
    page.getByRole("tab", { name: "Characters", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: "Add PC", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Default visual range (m)")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "Exploration", exact: true }).click();
  await expect(page.getByLabel("Default visual range (m)")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add PC", exact: true }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "View", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Default visual range (m)")).toBeHidden();
  await page.keyboard.press("Shift+G");
  await expect(page.getByRole("region", { name: "GM controls" })).toBeHidden();
  expect(saves).toEqual([]);
  expect(await (await request.get("/plan?plan=depot")).json()).toEqual(before);
});

test("GM controls support focus, Escape from inputs, and safe shortcut typing", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  await expect(
    page.getByRole("tab", { name: "Characters", exact: true }),
  ).toBeFocused();
  await page.getByLabel("Character name").fill("fgrs+-");
  await page.getByLabel("Character name").press("Shift+E");
  await expect(page.locator("body")).toHaveAttribute("data-mode", "play");
  await page.getByLabel("Character name").press("Escape");
  await expect(page.getByRole("region", { name: "GM controls" })).toBeHidden();
  await expect(page.locator("#viewport")).toBeFocused();
  await page.keyboard.press("Shift+G");
  await page.getByLabel("Character", { exact: true }).focus();
  await page.keyboard.press("f");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-gm-view",
    "false",
  );
  await page.keyboard.press("Shift+G");
  await expect(page.getByRole("region", { name: "GM controls" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "GM controls" })).toBeHidden();
});

test("GM activities fit a narrow window, stay out of print, and offer Return to Edit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 280, height: 520 });
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  const panel = page.getByRole("region", { name: "GM controls" });
  const bounds = await panel.boundingBox();
  if (!bounds) throw Error("Expected visible GM controls");
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(280);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(280);
  await page.getByRole("tab", { name: "Exploration", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reset fog · close all doors" }),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(panel).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page
    .getByRole("button", { name: "Return to Edit", exact: true })
    .click();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "edit");
  await expect(panel).toBeHidden();
});
