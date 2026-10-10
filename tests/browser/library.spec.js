import { test, expect } from "@playwright/test";

test("Referee browses plan levels and explicitly opens edit or fullscreen play", async ({
  page,
}) => {
  await page.goto("/library.html");
  await page.getByRole("button", { name: "Referee building" }).click();
  await expect(
    page.getByRole("heading", { name: "Ground", exact: true }),
  ).toBeVisible();
  await expect(page.locator("svg[data-thumbnail]")).toHaveCount(2);
  await page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "below", exact: true }) })
    .getByRole("link", { name: "Edit", exact: true })
    .click();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "edit");
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Referee building" }).click();
  await page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Ground", exact: true }) })
    .getByRole("link", { name: "Play", exact: true })
    .click();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "play");
  await expect(
    page.getByRole("link", { name: "Library", exact: true }),
  ).toBeHidden();
  await page.keyboard.press("Shift+G");
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Plan library" }),
  ).toBeVisible();
});

test("pending drawing marks survive returning through library", async ({
  page,
  request,
}) => {
  await request.put("/sketch?level=below", {
    data: {
      strokes: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
    },
  });
  await page.goto("/?level=below&mode=edit");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Referee building" }).click();
  await page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "below", exact: true }) })
    .getByRole("link", { name: "Edit", exact: true })
    .click();
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
});

test("characters added to another plan stay there on reload and library navigation", async ({
  page,
  request,
}) => {
  await page.goto("/library.html");
  await page.getByRole("button", { name: "Depot", exact: true }).click();
  await page.getByRole("link", { name: "Play", exact: true }).click();
  await page.keyboard.press("Shift+G");
  await page.getByLabel("Character name").fill("Depot guard");
  await page.getByRole("button", { name: "Add NPC", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters?plan=depot")).json()).characters
          .length,
    )
    .toBe(1);
  await page.reload();
  await page.keyboard.press("Shift+G");
  await expect(page.getByLabel("Character").locator("option")).toContainText([
    "Choose character",
    "Depot guard",
  ]);
  const original = await (await request.get("/characters")).json();
  expect(original.characters.some((c) => c.name === "Depot guard")).toBe(false);
});
