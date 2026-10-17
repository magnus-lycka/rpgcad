import { test, expect } from "@playwright/test";

const plan = {
  id: "levels-test",
  levels: [
    { id: "original", name: "Ground", order: 0 },
    { id: "below", name: "Maintenance", order: -1 },
  ],
};

/** @param {import("@playwright/test").Page} page */
async function threeLevels(page) {
  await page.route("**/plan*", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: plan });
    return route.continue();
  });
}

test("the Levels list shows levels top first, marks the current one and switches", async ({
  page,
}) => {
  await threeLevels(page);
  await page.goto("/?mode=play");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
  await toolbar.getByRole("button", { name: "Levels", exact: true }).click();
  const list = page.getByRole("dialog", { name: "Levels" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("button")).toHaveText([/Ground/, /Maintenance/]);
  await expect(list.getByRole("button", { name: /Ground/ })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await list.getByRole("button", { name: /Maintenance/ }).click();
  await expect(page).toHaveURL(/level=below/);
  await expect(page).toHaveURL(/mode=play/);
});

test("L toggles the list; PageUp and PageDown step one level and stop at the ends", async ({
  page,
}) => {
  await threeLevels(page);
  await page.goto("/?mode=play&level=below");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  const list = page.getByRole("dialog", { name: "Levels" });
  await page.keyboard.press("l");
  await expect(list).toBeVisible();
  await page.keyboard.press("l");
  await expect(list).toBeHidden();
  await page.keyboard.press("PageUp");
  await expect(page).toHaveURL(/level=original/);
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  await page.keyboard.press("PageUp");
  await expect(page.locator("#problem")).toHaveText(/top level/i);
  await page.keyboard.press("PageDown");
  await expect(page).toHaveURL(/level=below/);
});
