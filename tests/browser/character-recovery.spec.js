import { test, expect } from "@playwright/test";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";
preserveBrowserFixture(test);
const ada = {
  id: "ada",
  name: "Ada",
  kind: "pc",
  level: "original",
  at: [0, 0],
  range: 4,
};
async function state(request) {
  return (await request.get("/characters")).json();
}
async function seed(request) {
  const previous = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": previous.headers().etag },
    data: { characters: [ada], pov: "ada" },
  });
}
test("Undo Remove restores the same POV character across modes without revealing after reset", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  await page.getByRole("button", { name: "Exploration", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset fog · close all doors" })
    .click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observations",
    "0",
  );
  const exploration = await (await request.get("/exploration")).json();
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  if (
    !(await page
      .getByRole("button", { name: "Remove character", exact: true })
      .isVisible())
  )
    await page.getByText("Character options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Remove character", exact: true })
    .click();
  await expect
    .poll(() => state(request))
    .toEqual({ characters: [], pov: null });
  await page.keyboard.press("Shift+E");
  await page.keyboard.press("Shift+E");
  await page.keyboard.press("Shift+G");
  await page.getByRole("button", { name: "Undo Remove", exact: true }).click();
  await expect
    .poll(() => state(request))
    .toEqual({ characters: [ada], pov: "ada" });
  const restored = await (await request.get("/exploration")).json();
  expect(restored.observations).toEqual(exploration.observations);
  expect(restored.doors).toEqual(exploration.doors);
  expect(restored.visibilityPaused).toBe(true);
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observations",
    "0",
  );
  await expect(
    page.getByRole("button", { name: "Undo Remove", exact: true }),
  ).toBeHidden();
});

test("failed removal retains the character and offers no successful recovery", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  await page.route("**/characters", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 500, body: "Failed" })
      : route.continue(),
  );
  if (
    !(await page
      .getByRole("button", { name: "Remove character", exact: true })
      .isVisible())
  )
    await page.getByText("Character options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Remove character", exact: true })
    .click();
  await expect(page.locator("#character-recovery-status")).toContainText(
    "Removal was not saved",
  );
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  expect(await state(request)).toEqual({ characters: [ada], pov: "ada" });
  await expect(
    page.getByRole("button", { name: "Undo Remove", exact: true }),
  ).toBeHidden();
});

test("failed Undo Remove can be retried without losing the saved removal", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  if (
    !(await page
      .getByRole("button", { name: "Remove character", exact: true })
      .isVisible())
  )
    await page.getByText("Character options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Remove character", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Undo Remove", exact: true }),
  ).toBeVisible();
  await page.route("**/characters", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 500, body: "Failed" })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Undo Remove", exact: true }).click();
  await expect(page.locator("#character-recovery-status")).toContainText(
    "Recovery was not saved",
  );
  expect(await state(request)).toEqual({ characters: [], pov: null });
  await page.waitForTimeout(600);
  await page.unroute("**/characters");
  await page
    .getByRole("button", { name: "Undo Remove", exact: true })
    .click({ timeout: 2000 });
  await expect
    .poll(() => state(request))
    .toEqual({ characters: [ada], pov: "ada" });
});

test("Undo Remove cannot overwrite newer authoritative characters before polling", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  if (
    !(await page
      .getByRole("button", { name: "Remove character", exact: true })
      .isVisible())
  )
    await page.getByText("Character options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Remove character", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Undo Remove", exact: true }),
  ).toBeVisible();
  await page.route("**/characters", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 304 })
      : route.continue(),
  );
  const removed = await request.get("/characters");
  const newer = {
    characters: [{ ...ada, id: "ben", name: "Ben" }],
    pov: "ben",
  };
  await request.put("/characters", {
    headers: { "If-Match": removed.headers().etag },
    data: newer,
  });
  await page.getByRole("button", { name: "Undo Remove", exact: true }).click();
  await expect(page.locator("#character-recovery-status")).toContainText(
    "Recovery was not saved",
  );
  expect(await state(request)).toEqual(newer);
  await page.unroute("**/characters");
  await expect(
    page.getByRole("button", { name: "Undo Remove", exact: true }),
  ).toBeHidden();
  await expect(page.locator("#character-recovery-status")).toContainText(
    "Characters changed",
  );
});

test("successful character mutation invalidates Undo Remove", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  if (
    !(await page
      .getByRole("button", { name: "Remove character", exact: true })
      .isVisible())
  )
    await page.getByText("Character options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Remove character", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Undo Remove", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Character name").fill("New character");
  await page.getByRole("button", { name: "Add NPC", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Undo Remove", exact: true }),
  ).toBeHidden();
  expect((await state(request)).characters).toHaveLength(1);
});

test("recovery is keyboard reachable in a narrow window, excluded from print and scoped to its page", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 473, height: 766 });
  await seed(request);
  const other = await (
    await request.get("/characters?plan=outpost&level=cells")
  ).json();
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  if (
    !(await page
      .getByRole("button", { name: "Remove character", exact: true })
      .isVisible())
  )
    await page.getByText("Character options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Remove character", exact: true })
    .click();
  const undo = page.getByRole("button", { name: "Undo Remove", exact: true });
  await expect(undo).toBeVisible();
  await undo.focus();
  await page.emulateMedia({ media: "print" });
  await expect(undo).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await undo.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => state(request))
    .toEqual({ characters: [ada], pov: "ada" });
  expect(
    await (await request.get("/characters?plan=outpost&level=cells")).json(),
  ).toEqual(other);
  if (
    !(await page
      .getByRole("button", { name: "Remove character", exact: true })
      .isVisible())
  )
    await page.getByText("Character options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Remove character", exact: true })
    .click();
  await expect(undo).toBeVisible();
  await page.goto("/?plan=outpost&level=cells&mode=play");
  await page.keyboard.press("Shift+G");
  await expect(undo).toBeHidden();
  expect(await state(request)).toEqual({ characters: [], pov: null });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
