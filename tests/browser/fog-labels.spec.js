import { test, expect } from "../fixtures/app-test.js";

test.beforeEach(async ({ request }) => {
  const characters = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": characters.headers().etag },
    data: { characters: [], pov: null },
  });
  const previous = await request.get("/exploration");
  const saved = await request.put("/exploration", {
    headers: { "If-Match": previous.headers().etag },
    data: {
      version: 2,
      observers: [{ id: "party", at: [0, 0], range: 6 }],
      doors: {},
      observations: [],
      revisions: {},
      visibilityPaused: true,
    },
  });
  expect(saved.status()).toBe(204);
});

/** @param {import("@playwright/test").Locator} viewport @param {number[]} point */
async function position(viewport, point) {
  return viewport.evaluate((svg, [x, y]) => {
    if (!(svg instanceof SVGSVGElement)) throw Error("Expected plan SVG");
    const b = svg.viewBox.baseVal;
    return {
      x: ((x - b.x) * svg.clientWidth) / b.width,
      y: ((y - b.y) * svg.clientHeight) / b.height,
    };
  }, point);
}

/** @param {import("@playwright/test").Page} page @param {() => Promise<void>} action */
async function savedAction(page, action) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/exploration" &&
        response.request().method() === "PUT" &&
        response.status() === 204,
    ),
    action(),
  ]);
}

test("text labels are never shown in the players' fog view, even where the room is seen, but they show with fog off", async ({
  page,
}) => {
  await page.goto("/?fog=1");
  const viewport = page.locator("#viewport");
  await expect(viewport).toHaveAttribute("data-observers", /party/);
  await savedAction(page, async () =>
    viewport.click({ position: await position(viewport, [0, 0]) }),
  );
  // Open the door so the room holding the SECRET label is in plain view.
  await savedAction(page, async () =>
    viewport.click({
      position: await position(viewport, [3, 0]),
      modifiers: ["Shift"],
    }),
  );
  await expect(viewport).toHaveAttribute("data-observations", "2");
  expect(await viewport.locator("[data-wall]").count()).toBeGreaterThan(0);
  await expect(viewport).not.toContainText("SECRET");
  await expect(viewport.locator("text")).toHaveCount(0);

  await page.keyboard.press("Shift+F");
  await expect(viewport).toHaveAttribute("data-fog-on", "false");
  await expect(viewport).toContainText("SECRET");
});

test("labels stay visible in Edit, and Play hides them from the start", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport")).toContainText("SECRET");
  await page.goto("/?mode=play");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /party/,
  );
  await expect(page.locator("#viewport")).not.toContainText("SECRET");
});
