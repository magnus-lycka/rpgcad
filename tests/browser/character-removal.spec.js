import { test, expect } from "@playwright/test";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";
import { openCharacter } from "./helpers.js";
preserveBrowserFixture(test);
const ada = {
  id: "ada",
  name: "Ada",
  kind: "pc",
  level: "original",
  at: [0, 0],
  range: 4,
};
async function seed(request) {
  const previous = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": previous.headers().etag },
    data: { characters: [ada], pov: "ada" },
  });
}
test("removing a character persists directly without an Undo Remove action", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  const popup = await openCharacter(page, "ada");
  await popup
    .getByRole("button", { name: "Remove character", exact: true })
    .click();
  await expect
    .poll(async () => (await request.get("/characters")).json())
    .toEqual({ characters: [], pov: null });
  await expect(
    page.getByRole("button", {
      name: "Undo Remove",
      exact: true,
      includeHidden: true,
    }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-character]")).toHaveCount(0);
});

test("failed removal leaves the saved character intact and reports the error", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await page.route("**/characters*", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 500, body: "Failed" })
      : route.continue(),
  );
  const popup = await openCharacter(page, "ada");
  await popup
    .getByRole("button", { name: "Remove character", exact: true })
    .click();
  await expect(popup.locator("#character-action-status")).toContainText(
    "Character save failed (500)",
  );
  expect(await (await request.get("/characters")).json()).toEqual({
    characters: [ada],
    pov: "ada",
  });
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
});
