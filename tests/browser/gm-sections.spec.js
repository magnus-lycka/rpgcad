import { test, expect } from "@playwright/test";
import { addCharacter } from "./helpers.js";

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
  await addCharacter(page, "pc", "Scout");
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

test("GM activities fit a narrow window, stay out of print, and Stop returns to Edit", async ({
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
  await expect(
    page.getByRole("button", { name: "Reset fog / close all doors" }),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(panel).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "edit");
  await expect(panel).toBeHidden();
});
