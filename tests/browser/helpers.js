import { expect } from "@playwright/test";

/** ⌘-click a marker and return its popup.
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
export async function openCharacter(page, id) {
  await page.locator(`[data-character="${id}"]`).click({ modifiers: ["Meta"] });
  const popup = page.locator("#character-popup");
  await expect(popup).toBeVisible();
  return popup;
}

/** Add a character from the toolbar and name it in its popup.
 * @param {import('@playwright/test').Page} page
 * @param {"pc"|"npc"} kind
 * @param {string} name
 */
export async function addCharacter(page, kind, name) {
  const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
  const fog = toolbar.getByRole("button", { name: "Toggle fog", exact: true });
  const revealed = (await fog.getAttribute("aria-pressed")) === "true";
  if (!revealed) await fog.click();
  const markers = page.locator("[data-character]");
  const count = await markers.count();
  await toolbar
    .getByRole("button", { name: kind === "pc" ? "Add PC" : "Add NPC" })
    .click();
  await expect(markers).toHaveCount(count + 1);
  const marker = page.locator('[data-character][data-selected="true"]');
  await expect(marker).toHaveCount(1);
  const id = await marker.getAttribute("data-character");
  await page.locator(`[data-character="${id}"]`).focus();
  await page.keyboard.press("Control+Enter");
  const popup = page.locator("#character-popup");
  await expect(popup).toBeVisible();
  await popup.getByLabel("Name").fill(name);
  await popup.getByLabel("Name").press("Enter");
  await expect(page.locator(`[data-character="${id}"]`)).toContainText(
    name.trim(),
  );
  await page.keyboard.press("Escape");
  if (!revealed) await fog.click();
}
