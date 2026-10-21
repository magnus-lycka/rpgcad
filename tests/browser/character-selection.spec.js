import { test, expect, appReady } from "../fixtures/app-test.js";

const roster = [
  {
    id: "ada",
    name: "Ada",
    kind: "pc",
    level: "original",
    at: [0, 0],
    range: 6,
  },
  {
    id: "ben",
    name: "Ben",
    kind: "pc",
    level: "original",
    at: [3, 0],
    range: 3,
  },
  {
    id: "guard",
    name: "Guard",
    kind: "npc",
    level: "original",
    at: [0, 3],
    range: null,
  },
];

/** @param {import('@playwright/test').APIRequestContext} request */
async function seed(request) {
  const previous = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": previous.headers().etag },
    data: { pov: "ada", characters: roster },
  });
}

/** @param {import('@playwright/test').APIRequestContext} request */
async function saved(request) {
  return (await (await request.get("/characters")).json()).characters;
}

/** @param {import('@playwright/test').Page} page */
async function start(page) {
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.getByRole("button", { name: "Toggle fog", exact: true }).click();
  await expect(page.locator("[data-character]")).toHaveCount(3);
}

const circle = (/** @type {import('@playwright/test').Page} */ page, id) =>
  page.locator(`[data-character="${id}"] circle`);
const selected = (/** @type {import('@playwright/test').Page} */ page) =>
  page.locator('[data-character][data-selected="true"]');

test("a plain click selects one character; ⌘-click adds and removes others", async ({
  page,
  request,
}) => {
  await seed(request);
  await start(page);
  await circle(page, "ada").click();
  await expect(selected(page)).toHaveCount(1);
  await circle(page, "ben").click({ modifiers: ["Meta"] });
  await expect(selected(page)).toHaveCount(2);
  await circle(page, "guard").click({ modifiers: ["Meta"] });
  await expect(selected(page)).toHaveCount(3);
  await circle(page, "ben").click({ modifiers: ["Meta"] });
  await expect(selected(page)).toHaveCount(2);
  await expect(page.locator('[data-character="ben"]')).toHaveAttribute(
    "data-selected",
    "false",
  );
  await circle(page, "ben").click();
  await expect(selected(page)).toHaveCount(1);
  await expect(page.locator('[data-character="ben"]')).toHaveAttribute(
    "data-selected",
    "true",
  );
});

test("⌘-click does not change which PC is the POV", async ({
  page,
  request,
}) => {
  await seed(request);
  await start(page);
  await circle(page, "ben").click({ modifiers: ["Meta"] });
  await expect(page.locator('[data-character="ada"]')).toHaveAttribute(
    "data-pov",
    "true",
  );
  expect((await (await request.get("/characters")).json()).pov).toBe("ada");
});

test("clicking empty plan or pressing Escape clears the selection", async ({
  page,
  request,
}) => {
  await seed(request);
  await start(page);
  await circle(page, "ada").click();
  await circle(page, "ben").click({ modifiers: ["Meta"] });
  await page.mouse.click(760, 480);
  await expect(selected(page)).toHaveCount(0);
  await circle(page, "ada").click();
  await page.keyboard.press("Escape");
  await expect(selected(page)).toHaveCount(0);
});

test("dragging one selected character moves the whole party by the same offset", async ({
  page,
  request,
}) => {
  await seed(request);
  await start(page);
  await circle(page, "ada").click();
  await circle(page, "guard").click({ modifiers: ["Meta"] });
  const box = await circle(page, "ada").boundingBox();
  if (!box) throw Error("Expected marker");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 90, y + 45, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => (await saved(request)).find((c) => c.id === "ada").at)
    .not.toEqual([0, 0]);
  const after = await saved(request);
  const ada = after.find((c) => c.id === "ada").at;
  const guard = after.find((c) => c.id === "guard").at;
  const ben = after.find((c) => c.id === "ben").at;
  expect(ben).toEqual([3, 0]);
  expect(guard[0] - 0).toBeCloseTo(ada[0] - 0, 2);
  expect(guard[1] - 3).toBeCloseTo(ada[1] - 0, 2);
});

test("double-click opens a character's popup without fitting the view", async ({
  page,
  request,
}) => {
  await seed(request);
  await start(page);
  const before = await page.locator("#viewport").getAttribute("viewBox");
  await circle(page, "ben").dblclick();
  const popup = page.getByRole("dialog", { name: "Ben PC" });
  await expect(popup).toBeVisible();
  await expect(popup.getByLabel("Name")).toHaveValue("Ben");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "viewBox",
    before ?? "",
  );
});

test("Enter opens the popup, Space selects, ⌘+Space extends the selection", async ({
  page,
  request,
}) => {
  await seed(request);
  await start(page);
  await page.locator('[data-character="ben"]').focus();
  await page.keyboard.press("Space");
  await expect(selected(page)).toHaveCount(1);
  await page.locator('[data-character="guard"]').focus();
  await page.keyboard.press("Meta+Space");
  await expect(selected(page)).toHaveCount(2);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "2 characters" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator('[data-character="ada"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Ada PC" })).toBeVisible();
});

test("the group popup shows the count and offers only range and level", async ({
  page,
  request,
}) => {
  await seed(request);
  await start(page);
  await circle(page, "ada").click();
  await circle(page, "ben").click({ modifiers: ["Meta"] });
  await circle(page, "ben").dblclick();
  const popup = page.getByRole("dialog", { name: "2 characters" });
  await expect(popup).toBeVisible();
  await expect(popup.getByRole("heading")).toHaveText("2 characters selected");
  await expect(popup.getByLabel("Name")).toBeHidden();
  await expect(
    popup.getByRole("button", { name: "Remove character" }),
  ).toBeHidden();
  await expect(popup.getByLabel("Visual range (m)")).toBeVisible();
  await expect(popup.getByLabel("Move to level")).toBeVisible();
});

test("a group range applies to the PCs only", async ({ page, request }) => {
  await seed(request);
  await start(page);
  await circle(page, "ada").click();
  await circle(page, "ben").click({ modifiers: ["Meta"] });
  await circle(page, "guard").click({ modifiers: ["Meta"] });
  await circle(page, "guard").dblclick();
  const popup = page.getByRole("dialog", { name: "3 characters" });
  await popup.getByLabel("Visual range (m)").fill("8");
  await popup.getByLabel("Visual range (m)").press("Enter");
  await expect
    .poll(async () =>
      (await saved(request)).map(({ id, range }) => [id, range]),
    )
    .toEqual([
      ["ada", 8],
      ["ben", 8],
      ["guard", null],
    ]);
});

test("a selection of NPCs only has no range field", async ({
  page,
  request,
}) => {
  const previous = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": previous.headers().etag },
    data: {
      pov: "ada",
      characters: [
        roster[0],
        { ...roster[2], id: "g1", name: "G1" },
        { ...roster[2], id: "g2", name: "G2", at: [2, 3] },
      ],
    },
  });
  await start(page);
  await circle(page, "g1").click();
  await circle(page, "g2").click({ modifiers: ["Meta"] });
  await circle(page, "g2").dblclick();
  const popup = page.getByRole("dialog", { name: "2 characters" });
  await expect(popup.getByLabel("Visual range (m)")).toBeHidden();
  await expect(popup.getByLabel("Move to level")).toBeVisible();
});

test("a group level change moves every selected character", async ({
  page,
  request,
}) => {
  await seed(request);
  await start(page);
  await circle(page, "ada").click();
  await circle(page, "guard").click({ modifiers: ["Meta"] });
  await circle(page, "guard").dblclick();
  await page
    .getByRole("dialog", { name: "2 characters" })
    .getByLabel("Move to level")
    .selectOption("below");
  await expect
    .poll(async () =>
      (await saved(request)).map(({ id, level }) => [id, level]),
    )
    .toEqual([
      ["ada", "below"],
      ["ben", "original"],
      ["guard", "below"],
    ]);
  await expect(page).toHaveURL(/level=below/);
  await appReady(page);
  await circle(page, "ada").dblclick();
  await expect(
    page.getByRole("dialog", { name: "2 characters" }).getByRole("heading"),
  ).toHaveText("2 characters selected");
});

test("an arrow key moves the whole selected party 1.5 m, not just the POV", async ({
  page,
  request,
}) => {
  await seed(request);
  await start(page);
  await circle(page, "ada").click();
  await circle(page, "guard").click({ modifiers: ["Meta"] });
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await saved(request)).find((c) => c.id === "ada").at)
    .toEqual([1.5, 0]);
  const after = await saved(request);
  expect(after.find((c) => c.id === "guard").at).toEqual([1.5, 3]);
  expect(after.find((c) => c.id === "ben").at).toEqual([3, 0]);
});

/** Presses a key, waits for the characters save it causes, then for the page to be idle: commands are refused while a save is in progress.
 * @param {import('@playwright/test').Page} page @param {string} key */
async function pressSaved(page, key) {
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("/characters") &&
        r.request().method() === "PUT" &&
        r.ok(),
    ),
    page.keyboard.press(key),
  ]);
  await expect(page.locator("#character-popup")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}

test("[ and ] change the range of every selected PC and leave NPCs and others alone", async ({
  page,
  request,
}) => {
  await seed(request);
  await start(page);
  await circle(page, "ada").click();
  await circle(page, "guard").click({ modifiers: ["Meta"] });
  await circle(page, "ben").click({ modifiers: ["Meta"] });
  await pressSaved(page, "]");
  let after = await saved(request);
  expect(after.find((c) => c.id === "ada").range).toBe(7.5);
  expect(after.find((c) => c.id === "ben").range).toBe(4.5);
  expect(after.find((c) => c.id === "guard").range).toBeNull();
  await pressSaved(page, "[");
  await pressSaved(page, "[");
  after = await saved(request);
  expect(after.find((c) => c.id === "ada").range).toBe(4.5);
  expect(after.find((c) => c.id === "ben").range).toBe(1.5);
});

/** Waits for the arrival's reveal to be saved, so it cannot land after the fixture is restored.
 * @param {import('@playwright/test').APIRequestContext} request */
const revealSaved = (request) =>
  expect
    .poll(
      async () =>
        (await (await request.get("/exploration?level=below")).json())
          .observations.length,
    )
    .toBe(1);

test("Shift+PageDown takes the selected characters one level down, Shift+PageUp brings them back", async ({
  page,
  request,
}) => {
  await seed(request);
  await start(page);
  await circle(page, "ada").click();
  await circle(page, "guard").click({ modifiers: ["Meta"] });
  await page.keyboard.press("Shift+PageDown");
  await expect(page).toHaveURL(/level=below/);
  await appReady(page);
  await revealSaved(request);
  expect((await saved(request)).map(({ id, level }) => [id, level])).toEqual([
    ["ada", "below"],
    ["ben", "original"],
    ["guard", "below"],
  ]);
  await expect(selected(page)).toHaveCount(2);
  await page.keyboard.press("Shift+PageUp");
  await expect(page).toHaveURL(/level=original/);
  await appReady(page);
  expect((await saved(request)).map(({ level }) => level)).toEqual([
    "original",
    "original",
    "original",
  ]);
});

test("arriving on a level reveals the POV's surroundings without a nudge", async ({
  page,
  request,
}) => {
  await seed(request);
  await start(page);
  await circle(page, "ada").click();
  await circle(page, "guard").click({ modifiers: ["Meta"] });
  await page.keyboard.press("Shift+PageDown");
  await expect(page).toHaveURL(/level=below/);
  await appReady(page);
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observations",
    "1",
  );
  await expect
    .poll(
      async () =>
        (await (await request.get("/exploration?level=below")).json())
          .observations.length,
    )
    .toBe(1);
  await expect(page).not.toHaveURL(/arrive/);
});

test("Move to level in the popup reveals the arrival level too", async ({
  page,
  request,
}) => {
  await seed(request);
  await start(page);
  await circle(page, "ada").dblclick();
  await page
    .getByRole("dialog", { name: /Ada/ })
    .getByLabel("Move to level")
    .selectOption("below");
  await expect(page).toHaveURL(/level=below/);
  await appReady(page);
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observations",
    "1",
  );
  await revealSaved(request);
});
