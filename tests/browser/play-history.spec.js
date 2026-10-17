import { test, expect } from "@playwright/test";

test("play browsing, polling and temporary GM view leave play dates unchanged", async ({
  page,
  request,
}) => {
  const roster = await request.get("/characters?plan=depot");
  await request.put("/characters?plan=depot", {
    headers: { "If-Match": roster.headers().etag },
    data: { characters: [], pov: null },
  });
  const route = "/exploration?plan=depot";
  const previous = await request.get(route);
  await request.put(route, {
    headers: { "If-Match": previous.headers().etag },
    data: {
      version: 2,
      observers: [{ id: "party", at: [0, 0], range: 6 }],
      observations: [],
      revisions: {},
      doors: {},
      visibilityPaused: false,
    },
  });
  const before = await (await request.get("/plan?plan=depot")).json();
  const saves = [];
  page.on("request", (req) => {
    if (req.method() === "PUT") saves.push(req.url());
  });
  await page.goto("/?plan=depot&mode=play");
  await expect(page.locator("#viewport")).toContainText("DEPOT");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /party/,
  );
  await page.mouse.move(800, 400);
  await page.mouse.wheel(0, -200);
  await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(900, 450);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.press("Shift+V");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-gm-view",
    "true",
  );
  await page.keyboard.press("Shift+V");
  await page.keyboard.press("Shift+E");
  await expect(page.locator("body")).toHaveAttribute("data-mode", "edit");
  await page.keyboard.press("Shift+E");
  await expect(page.locator("body")).toHaveAttribute("data-mode", "play");
  await page.route("**/model?plan=depot*", async (route) => {
    await route.fulfill({
      json: {
        wallThickness: 0.15,
        walls: [],
        openings: [],
        labels: [{ id: "label", at: [0, 0], text: "REFRESHED DEPOT" }],
      },
      headers: { ETag: '"refreshed-model"' },
    });
  });
  await page.keyboard.press("Shift+V");
  await expect(page.locator("#viewport")).toContainText("REFRESHED DEPOT");
  expect(saves).toEqual([]);
  await page.unrouteAll();
  await page.reload();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /party/,
  );
  await page.keyboard.press("Shift+G");
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Plan library" }),
  ).toBeVisible();
  const after = await (await request.get("/plan?plan=depot")).json();
  expect(after).toEqual(before);
  expect(saves).toEqual([]);
});
