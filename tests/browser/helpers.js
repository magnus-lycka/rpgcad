import { expect } from "@playwright/test";

/** Double-click a marker and return its popup.
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
export async function openCharacter(page, id) {
  await page.locator(`[data-character="${id}"]`).dblclick();
  const popup = page.locator("#character-popup");
  await expect(popup).toBeVisible();
  return popup;
}

/** Add a character from the toolbar through its creation popup.
 * @param {import('@playwright/test').Page} page
 * @param {"pc"|"npc"} kind
 * @param {string} name
 * @param {number} [range] visual range, required for a PC
 */
export async function addCharacter(page, kind, name, range = 6) {
  await page
    .getByRole("toolbar", { name: "Toolbar", exact: true })
    .getByRole("button", { name: kind === "pc" ? "Add PC" : "Add NPC" })
    .click();
  const popup = page.locator("#character-popup");
  await expect(popup).toBeVisible();
  await popup.getByLabel("Name").fill(name);
  if (kind === "pc")
    await popup.getByLabel("Visual range (m)").fill(String(range));
  await popup.getByRole("button", { name: "Add character" }).click();
  await expect(popup).toBeHidden();
}
