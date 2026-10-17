import { test, expect } from "@playwright/test";
import { openCharacter } from "./helpers.js";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";
preserveBrowserFixture(test);

test("rejected POV range changes preserve visibility and saved exploration", async ({
  page,
  request,
}) => {
  const previous = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": previous.headers().etag },
    data: {
      pov: "ada",
      characters: [
        {
          id: "ada",
          name: "Ada",
          kind: "pc",
          level: "original",
          at: [0, 0],
          range: 2,
        },
        {
          id: "guard",
          name: "Guard",
          kind: "npc",
          level: "original",
          at: [4, 0],
          range: null,
        },
      ],
    },
  });
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.locator('[data-character="ada"] circle').click();
  await expect(page.locator("#reset-fog")).toBeEnabled();
  const savedCharacters = await (await request.get("/characters")).json();
  const savedExploration = await (await request.get("/exploration")).json();
  await expect(page.locator('[data-character="guard"]')).toHaveCount(0);
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 409, body: "Conflict" });
    else await route.continue();
  });
  const popup = await openCharacter(page, "ada");
  const range = popup.getByLabel("Visual range (m)");
  await range.fill("10");
  await range.dispatchEvent("change");
  await expect(page.locator("#character-action-status")).toContainText(
    "Character save failed (409)",
  );
  await expect(range).toHaveValue("2");
  await expect(page.locator('[data-character="guard"]')).toHaveCount(0);
  expect(await (await request.get("/characters")).json()).toEqual(
    savedCharacters,
  );
  expect(await (await request.get("/exploration")).json()).toEqual(
    savedExploration,
  );
});
