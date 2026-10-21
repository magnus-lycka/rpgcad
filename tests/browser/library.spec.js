import { test, expect } from "../fixtures/app-test.js";
import { addCharacter } from "./helpers.js";

test("plan and level appear only in Info, in Edit and in Play", async ({
  page,
}) => {
  const info = page.getByRole("dialog", { name: "Info" });
  const openInfo = async () => {
    await page
      .getByRole("toolbar", { name: "Toolbar", exact: true })
      .getByRole("button", { name: "Info", exact: true })
      .click();
  };
  await page.goto("/?level=below&mode=edit");
  await openInfo();
  await expect(
    info.getByText("Referee building", { exact: true }),
  ).toBeVisible();
  await expect(info.getByText("below", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page
      .getByText("Referee building", { exact: true })
      .filter({ visible: true }),
  ).toHaveCount(0);
  await openInfo();
  await expect(
    info.getByText("Referee building", { exact: true }),
  ).toBeVisible();
  await expect(info.getByText("below", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/?plan=depot&mode=edit");
  await openInfo();
  await expect(info.getByText("Depot", { exact: true })).toBeVisible();
  await expect(info.getByText("Depot floor", { exact: true })).toBeVisible();
});

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
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observations",
    /^\d+$/,
  );
  await addCharacter(page, "npc", "Depot guard");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters?plan=depot")).json()).characters
          .length,
    )
    .toBe(1);
  await page.reload();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observations",
    /^\d+$/,
  );
  // Labels show only with fog off, which also confirms which plan this is.
  await page.getByRole("button", { name: "Toggle fog", exact: true }).click();
  await expect(page.locator("#viewport")).toContainText("DEPOT");
  await expect(page.locator("#viewport")).toContainText("Depot guard");
  const original = await (await request.get("/characters")).json();
  expect(original.characters.some((c) => c.name === "Depot guard")).toBe(false);
});

test("Referee edits distinct plan and level metadata while drawing identities stay stable", async ({
  page,
  request,
}) => {
  await page.goto("/library.html");
  const depotCard = page
    .getByRole("article")
    .filter({ has: page.getByRole("button", { name: "Depot", exact: true }) });
  await depotCard.getByRole("button", { name: "Edit plan metadata" }).click();
  await page.getByLabel("Plan name", { exact: true }).fill("Supply depot");
  await page.getByLabel("Plan description").fill("Orbital cargo");
  await page.getByLabel("Plan tags").fill("station\nsupplies");
  await page
    .getByRole("button", { name: "Save metadata", exact: true })
    .click();
  await page.getByRole("button", { name: "Supply depot", exact: true }).click();
  await page.getByRole("button", { name: "Edit level metadata" }).click();
  await page.getByLabel("Level name", { exact: true }).fill("Cargo floor");
  await page.getByLabel("Level description").fill("Sealed stores");
  await page.getByLabel("Level tags").fill("storage\nsecure");
  await page
    .getByRole("button", { name: "Save metadata", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Cargo floor", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Plan tags: station, supplies", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Level tags: storage, secure", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Edit", exact: true }),
  ).toHaveAttribute("href", "/?plan=depot&level=original&mode=edit");
  const plan = await (await request.get("/plan?plan=depot")).json();
  expect(plan.description).toBe("Orbital cargo");
  expect(plan.levels[0].description).toBe("Sealed stores");
  await request.patch("/metadata?plan=depot", {
    data: { name: "Depot", description: "", tags: [] },
  });
  await request.patch("/metadata?plan=depot&level=original", {
    data: { name: "Depot floor", description: "", tags: [] },
  });
});

test("library defaults to recently authored plans without inventing historical dates", async ({
  page,
  request,
}) => {
  await request.patch("/metadata?plan=depot", {
    data: { description: "Recent authoring" },
  });
  await page.goto("/library.html");
  await expect(
    page
      .getByRole("article")
      .first()
      .getByRole("button", { name: "Depot", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article").first()).toContainText(
    "Created: Unknown",
  );
  await request.patch("/metadata?plan=depot", { data: { description: "" } });
});

test("Referee duplicates every level and opens the independent variation", async ({
  page,
  request,
}) => {
  await page.goto("/library.html?plan=default");
  await page
    .getByRole("button", { name: "Duplicate plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Referee building copy", exact: true }),
  ).toBeVisible();
  await expect(page.locator("svg[data-thumbnail]")).toHaveCount(2);
  const copyId = new URL(page.url()).searchParams.get("plan");
  expect(copyId).not.toBe("default");
  const copy = await (await request.get(`/plan?plan=${copyId}`)).json();
  expect(copy.levels.map((level) => level.id)).not.toContain("original");
  expect(copy.levels.map((level) => level.id)).not.toContain("below");
  const lowerCard = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "below", exact: true }),
  });
  await lowerCard.getByRole("button", { name: "Edit level metadata" }).click();
  await page.getByLabel("Level description").fill("Variation stores");
  await page
    .getByRole("button", { name: "Save metadata", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByText("Variation stores", { exact: true }),
  ).toBeVisible();
  const source = await (await request.get("/plan?plan=default")).json();
  expect(source.levels[1].description).toBe("");
  await page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "below", exact: true }) })
    .getByRole("link", { name: "Edit", exact: true })
    .click();
  await expect(page.locator("#viewport")).toContainText("LOWER LEVEL");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute("data-mode", "edit");
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page
    .getByRole("button", { name: "Referee building copy", exact: true })
    .click();
  await page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Ground", exact: true }) })
    .getByRole("link", { name: "Play", exact: true })
    .click();
  await expect(page.locator("#viewport [data-character]")).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute("data-mode", "play");
});

test("plan-only play keeps a new marker on the selected plan's first level", async ({
  page,
  request,
}) => {
  const response = await request.post("/duplicate?plan=default");
  expect(response.status()).toBe(201);
  const copy = await response.json();
  await page.goto(`/?plan=${copy.id}&mode=play`);
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observations",
    /^\d+$/,
  );
  await addCharacter(page, "pc", "Copy scout");
  await expect(page.locator("#viewport [data-character]")).toHaveCount(1);
  await expect
    .poll(
      async () =>
        (await (await request.get(`/characters?plan=${copy.id}`)).json())
          .characters.length,
    )
    .toBe(1);
  await page.goto(`/?plan=${copy.id}&level=${copy.levels[0].id}&mode=play`);
  await expect(page.locator("#viewport [data-character]")).toHaveCount(1);
  await expect(page.locator("#viewport")).toContainText("Copy scout");
});

test("opening a plan hides library filters and returning preserves their values", async ({
  page,
}) => {
  await page.goto("/library.html");
  await page.getByLabel("Search plans and levels").fill("Sector archive");
  await page.getByLabel("Required tags").fill("frontier");
  await page.getByLabel("Created from", { exact: true }).fill("2025-01-01");
  await page.getByLabel("Sort plans").selectOption("name");
  await page.getByRole("button", { name: "Citadel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Citadel", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Search plans and levels")).toBeHidden();
  await page.getByRole("button", { name: "All plans", exact: true }).click();
  await expect(page.getByLabel("Search plans and levels")).toBeVisible();
  await expect(page.getByLabel("Search plans and levels")).toHaveValue(
    "Sector archive",
  );
  await expect(page.getByLabel("Required tags")).toHaveValue("frontier");
  await expect(page.getByLabel("Created from", { exact: true })).toHaveValue(
    "2025-01-01",
  );
  await expect(page.getByLabel("Sort plans")).toHaveValue("name");
  await expect(
    page.getByRole("button", { name: "Citadel", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Outpost", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Depot", exact: true }),
  ).toHaveCount(0);
});
