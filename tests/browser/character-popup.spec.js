import { test, expect } from "@playwright/test";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";

preserveBrowserFixture(test);

const ada = {
  id: "ada",
  name: "Ada",
  kind: "pc",
  level: "original",
  at: [0, 0],
  range: 6,
};

/** @param {import('@playwright/test').APIRequestContext} request */
async function seed(request, characters = [ada]) {
  const previous = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": previous.headers().etag },
    data: { characters, pov: "ada" },
  });
}

test("⌘-click opens a popup at the marker; plain click only selects it", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  const marker = page.locator('[data-character="ada"]');
  await expect(marker).toBeVisible();
  const popup = page.getByRole("dialog", { name: "Ada PC" });
  await marker.click();
  await expect(popup).toBeHidden();
  await marker.click({ modifiers: ["Meta"] });
  await expect(popup).toBeVisible();
  await expect(popup.getByLabel("Name")).toHaveValue("Ada");
  const markerBox = await marker.boundingBox();
  const popupBox = await popup.boundingBox();
  if (!markerBox || !popupBox) throw Error("Expected both boxes");
  expect(Math.abs(popupBox.x - markerBox.x)).toBeLessThan(300);
  expect(Math.abs(popupBox.y - markerBox.y)).toBeLessThan(300);
});

test("the popup closes on Escape, on a second ⌘-click and on a click elsewhere", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  const marker = page.locator('[data-character="ada"]');
  const popup = page.getByRole("dialog", { name: "Ada PC" });
  await marker.click({ modifiers: ["Meta"] });
  await expect(popup).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await marker.click({ modifiers: ["Meta"] });
  await expect(popup).toBeVisible();
  await marker.click({ modifiers: ["Meta"] });
  await expect(popup).toBeHidden();
  await marker.click({ modifiers: ["Meta"] });
  await expect(popup).toBeVisible();
  await page.mouse.click(700, 500);
  await expect(popup).toBeHidden();
});

test("a focused marker opens its popup with ⌘/Ctrl+Enter and Escape returns focus to it", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  const marker = page.locator('[data-character="ada"]');
  await marker.focus();
  await page.keyboard.press("Control+Enter");
  const popup = page.getByRole("dialog", { name: "Ada PC" });
  await expect(popup).toBeVisible();
  await expect(popup.getByLabel("Name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(marker).toBeFocused();
});

const ben = { ...ada, id: "ben", name: "Ben", at: [2, 0] };

/** @param {import('@playwright/test').APIRequestContext} request */
async function saved(request) {
  return (await (await request.get("/characters")).json()).characters;
}

/** @param {import('@playwright/test').Page} page
 * @param {string} id */
async function openPopup(page, id) {
  await page.locator(`[data-character="${id}"]`).click({ modifiers: ["Meta"] });
}

test("renaming in the popup saves on Enter and the marker shows the new name", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await openPopup(page, "ada");
  const popup = page.getByRole("dialog", { name: "Ada PC" });
  await popup.getByLabel("Name").fill("Captain Ada");
  await popup.getByLabel("Name").press("Enter");
  await expect
    .poll(async () => (await saved(request))[0].name)
    .toBe("Captain Ada");
  await expect(page.locator('[data-character="ada"]')).toContainText(
    "Captain Ada",
  );
  await expect(
    page.getByRole("dialog", { name: "Captain Ada PC" }),
  ).toBeVisible();
});

test("a duplicate or empty name is rejected visibly and the saved name is kept", async ({
  page,
  request,
}) => {
  await seed(request, [ada, ben]);
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+F");
  await openPopup(page, "ada");
  const name = page.getByRole("dialog", { name: "Ada PC" }).getByLabel("Name");
  await name.fill(" ben ");
  await name.press("Enter");
  await expect(page.getByRole("alert")).toContainText(
    /A character named “Ben” already exists in this plan\./i,
  );
  await expect(name).toHaveValue("Ada");
  expect((await saved(request)).map((c) => c.name)).toEqual(["Ada", "Ben"]);
  await name.fill("   ");
  await name.press("Enter");
  await expect(page.getByRole("alert")).toContainText(
    "A character needs a name.",
  );
  await expect(name).toHaveValue("Ada");
});

test("the visual range field saves a new range", async ({ page, request }) => {
  await seed(request);
  await page.goto("/?mode=play");
  await openPopup(page, "ada");
  const range = page
    .getByRole("dialog", { name: "Ada PC" })
    .getByLabel("Visual range (m)");
  await range.fill("4");
  await range.press("Enter");
  await expect.poll(async () => (await saved(request))[0].range).toBe(4);
});

test("Move to level sends the character to the chosen level", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await openPopup(page, "ada");
  await page
    .getByRole("dialog", { name: "Ada PC" })
    .getByLabel("Move to level")
    .selectOption("below");
  await expect.poll(async () => (await saved(request))[0].level).toBe("below");
  await expect(page).toHaveURL(/level=below/);
});

test("Remove character deletes it and closes the popup", async ({
  page,
  request,
}) => {
  await seed(request, [ada, ben]);
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+F");
  await openPopup(page, "ben");
  await page
    .getByRole("dialog", { name: "Ben PC" })
    .getByRole("button", { name: "Remove character", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(request)).map((c) => c.id))
    .toEqual(["ada"]);
  await expect(page.getByRole("dialog", { name: "Ben PC" })).toBeHidden();
  await expect(page.locator('[data-character="ben"]')).toHaveCount(0);
});

test("the Referee panel and its commands no longer exist", async ({ page }) => {
  await page.goto("/?mode=play");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /./,
  );
  await expect(page.locator("#gm-panel")).toHaveCount(0);
  await page.keyboard.press("Shift+G");
  await page.keyboard.press("g");
  await expect(page.getByRole("region", { name: "GM controls" })).toHaveCount(
    0,
  );
  await page.keyboard.press("/");
  const palette = page.getByRole("dialog", { name: "Commands" });
  for (const label of [
    "Referee panel",
    "Characters tab",
    "Rename character",
    "Move to level",
    "Remove character",
    "Character options",
  ]) {
    await palette.getByRole("combobox").fill(label);
    await expect(palette.getByRole("option")).toHaveCount(0);
  }
});

test("opening and closing a popup saves nothing", async ({ page, request }) => {
  await seed(request);
  const before = await (await request.get("/characters")).json();
  /** @type {string[]} */
  const writes = [];
  page.on("request", (req) => {
    if (["PUT", "PATCH", "POST"].includes(req.method())) writes.push(req.url());
  });
  await page.goto("/?mode=play");
  await openPopup(page, "ada");
  await page.keyboard.press("Escape");
  await openPopup(page, "ada");
  await openPopup(page, "ada");
  expect(writes).toEqual([]);
  expect(await (await request.get("/characters")).json()).toEqual(before);
});

test("typing shortcut characters in the popup edits text instead of running commands", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await openPopup(page, "ada");
  const name = page.getByRole("dialog", { name: "Ada PC" }).getByLabel("Name");
  await name.fill("fgrs+-");
  await name.press("Shift+E");
  await expect(page.locator("body")).toHaveAttribute("data-mode", "play");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-gm-view",
    "false",
  );
  await expect(name).toHaveValue("fgrs+-E");
});

test("the popup fits a narrow window and stays out of print", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.setViewportSize({ width: 280, height: 520 });
  await page.goto("/?mode=play");
  await openPopup(page, "ada");
  const popup = page.getByRole("dialog", { name: "Ada PC" });
  const box = await popup.boundingBox();
  if (!box) throw Error("Expected the popup");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(280);
  expect(box.y + box.height).toBeLessThanOrEqual(520);
  await page.emulateMedia({ media: "print" });
  await expect(popup).toBeHidden();
});

const toolbar = (page) =>
  page.getByRole("toolbar", { name: "Toolbar", exact: true });

test("Add PC opens a popup at once; nothing is saved until it has a name and a range", async ({
  page,
  request,
}) => {
  await page.goto("/?mode=play");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /./,
  );
  await toolbar(page)
    .getByRole("button", { name: "Add PC", exact: true })
    .click();
  const popup = page.getByRole("dialog", { name: "New PC" });
  await expect(popup).toBeVisible();
  await expect(popup.getByLabel("Name")).toBeFocused();
  await expect(popup.getByLabel("Name")).toHaveValue("");
  await expect(popup.getByLabel("Visual range (m)")).toHaveValue("");
  await expect(popup.getByLabel("Move to level")).toBeHidden();
  await expect(
    popup.getByRole("button", { name: "Remove character" }),
  ).toBeHidden();
  await popup.getByRole("button", { name: "Add character" }).click();
  await expect(page.getByRole("alert")).toContainText("needs a name");
  await popup.getByLabel("Name").fill("Ada");
  await popup.getByRole("button", { name: "Add character" }).click();
  await expect(page.getByRole("alert")).toContainText("needs a visual range");
  expect(await saved(request)).toEqual([]);
  await popup.getByLabel("Visual range (m)").fill("9");
  await popup.getByRole("button", { name: "Add character" }).click();
  await expect(popup).toBeHidden();
  await expect
    .poll(async () =>
      (await saved(request)).map(({ name, kind, range }) => ({
        name,
        kind,
        range,
      })),
    )
    .toEqual([{ name: "Ada", kind: "pc", range: 9 }]);
  await expect(page.locator("[data-character]")).toHaveCount(1);
});

test("Escape cancels a new character without saving anything", async ({
  page,
  request,
}) => {
  await page.goto("/?mode=play");
  await toolbar(page)
    .getByRole("button", { name: "Add PC", exact: true })
    .click();
  const popup = page.getByRole("dialog", { name: "New PC" });
  await popup.getByLabel("Name").fill("Ghost");
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  expect(await saved(request)).toEqual([]);
  await expect(page.locator("[data-character]")).toHaveCount(0);
});

test("a new NPC needs only a name and has no visual range", async ({
  page,
  request,
}) => {
  await page.goto("/?mode=play");
  await toolbar(page)
    .getByRole("button", { name: "Add NPC", exact: true })
    .click();
  const popup = page.getByRole("dialog", { name: "New NPC" });
  await expect(popup.getByLabel("Visual range (m)")).toBeHidden();
  await popup.getByLabel("Name").fill("Guard");
  await popup.getByLabel("Name").press("Enter");
  await expect(popup).toBeHidden();
  await expect
    .poll(async () =>
      (await saved(request)).map(({ name, kind, range }) => ({
        name,
        kind,
        range,
      })),
    )
    .toEqual([{ name: "Guard", kind: "npc", range: null }]);
});

test("a duplicate name is rejected on creation and the popup stays open", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await toolbar(page)
    .getByRole("button", { name: "Add PC", exact: true })
    .click();
  const popup = page.getByRole("dialog", { name: "New PC" });
  await popup.getByLabel("Name").fill(" ada ");
  await popup.getByLabel("Visual range (m)").fill("5");
  await popup.getByRole("button", { name: "Add character" }).click();
  await expect(page.getByRole("alert")).toContainText("already exists");
  await expect(popup).toBeVisible();
  expect((await saved(request)).map((c) => c.name)).toEqual(["Ada"]);
});

test("an existing NPC's popup has no range, and a PC's range cannot be cleared", async ({
  page,
  request,
}) => {
  /** @type {any} */
  const guard = { ...ben, kind: "npc", range: null };
  await seed(request, [ada, guard]);
  await page.goto("/?mode=play");
  await page.getByRole("button", { name: "Toggle fog", exact: true }).click();
  const npc = await openCharacterPopup(page, "ben");
  await expect(npc.getByLabel("Visual range (m)")).toBeHidden();
  await page.keyboard.press("Escape");
  const pc = await openCharacterPopup(page, "ada");
  await pc.getByLabel("Visual range (m)").fill("");
  await pc.getByLabel("Visual range (m)").press("Enter");
  await expect(page.getByRole("alert")).toContainText("needs a visual range");
  await expect(pc.getByLabel("Visual range (m)")).toHaveValue("6");
  expect((await saved(request))[0].range).toBe(6);
});

test("there is no default visual range anywhere on the toolbar", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  await expect(
    toolbar(page).getByRole("spinbutton", { name: /range/i }),
  ).toHaveCount(0);
  for (const name of ["Decrease default range", "Increase default range"])
    await expect(toolbar(page).getByRole("button", { name })).toHaveCount(0);
});

/** @param {import('@playwright/test').Page} page
 * @param {string} id */
async function openCharacterPopup(page, id) {
  await page.locator(`[data-character="${id}"]`).click({ modifiers: ["Meta"] });
  return page.locator("#character-popup");
}

test("the popup never slides under the toolbar", async ({ page, request }) => {
  await seed(request);
  await page.setViewportSize({ width: 900, height: 420 });
  await page.goto("/?mode=play");
  await openPopup(page, "ada");
  const popup = await page
    .getByRole("dialog", { name: "Ada PC" })
    .boundingBox();
  const bar = await page.locator("#toolbar").boundingBox();
  if (!popup || !bar) throw Error("Expected both boxes");
  expect(popup.y).toBeGreaterThanOrEqual(bar.y + bar.height);
});
