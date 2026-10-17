import { expect } from "@playwright/test";

/** Add a character from the toolbar, then give it its name in the Referee panel.
 * @param {import('@playwright/test').Page} page
 * @param {"pc"|"npc"} kind
 * @param {string} name
 */
export async function addCharacter(page, kind, name) {
  await page
    .getByRole("toolbar", { name: "Toolbar", exact: true })
    .getByRole("button", { name: kind === "pc" ? "Add PC" : "Add NPC" })
    .click();
  const field = page.getByLabel("Character name");
  await expect(field).toHaveValue(/^(PC|NPC) \d+$/);
  await field.fill(name);
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(field).toHaveValue(name.trim());
}
