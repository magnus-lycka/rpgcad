import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

test.beforeEach(async ({ request }) => {
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

/** @param {import("@playwright/test").Locator} viewport @param {number[]} point */
async function colour(viewport, point) {
  const at = await position(viewport, point);
  const png = PNG.sync.read(await viewport.screenshot());
  const offset = (Math.floor(at.y) * png.width + Math.floor(at.x)) * 4;
  return [...png.data.subarray(offset, offset + 3)];
}

/** @param {import("@playwright/test").Page} page @param {() => Promise<void>} action */
async function savedAction(page, action) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/exploration") &&
        response.request().method() === "PUT" &&
        response.status() === 204,
    ),
    action(),
  ]);
}

// These are characterisation tests of browser behaviour, not new features.
test("the viewer loads browser modules, shows a grid, and keeps GM controls out of the drawing", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?fog=1");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /party/,
  );
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  await expect(page.locator("#gm-panel")).toBeHidden();
  await page.keyboard.press("Shift+G");
  await expect(page.getByLabel("Sight range (m)")).toBeVisible();
  expect(errors).toEqual([]);
});

test("closed doors hide secrets, opening reveals them, and reset closes doors and persists all-fog", async ({
  page,
}) => {
  await page.goto("/?fog=1");
  const viewport = page.locator("#viewport");
  await expect(viewport).toHaveAttribute("data-observers", /party/);
  const at = await position(viewport, [0, 0]);
  await savedAction(page, () => viewport.click({ position: at }));
  await expect(viewport).toHaveAttribute("data-observations", "1");
  expect(await colour(viewport, [4.1, 0.7])).toEqual([203, 210, 206]);
  const door = await position(viewport, [3, 0]);
  await savedAction(page, () =>
    viewport.click({ position: door, modifiers: ["Shift"] }),
  );
  await expect(viewport).toHaveAttribute("data-observations", "2");
  expect(await colour(viewport, [4.1, 0.7])).toEqual([255, 255, 255]);
  await savedAction(page, () => page.keyboard.press("Shift+R"));
  await expect(viewport).toHaveAttribute("data-observations", "0");
  expect(await colour(viewport, [4.1, 0.7])).toEqual([203, 210, 206]);
  await page.reload();
  await expect(viewport).toHaveAttribute("data-observations", "0");
  await savedAction(page, () => viewport.click({ position: at }));
  await expect(viewport).toHaveAttribute("data-observations", "1");
  expect(await colour(viewport, [4.1, 0.7])).toEqual([203, 210, 206]);
});

test("GM unfog shows the plan temporarily without revealing secrets to players", async ({
  page,
}) => {
  await page.goto("/?fog=1");
  const viewport = page.locator("#viewport");
  await expect(viewport).toHaveAttribute("data-observations", "0");
  expect(await colour(viewport, [4.1, 0.7])).toEqual([203, 210, 206]);
  await page.keyboard.press("Shift+F");
  await expect(viewport).toHaveAttribute("data-gm-view", "true");
  expect(await colour(viewport, [4.1, 0.7])).toEqual([255, 255, 255]);
  await page.keyboard.press("Shift+F");
  await expect(viewport).toHaveAttribute("data-gm-view", "false");
  await expect(viewport).toHaveAttribute("data-observations", "0");
  expect(await colour(viewport, [4.1, 0.7])).toEqual([203, 210, 206]);
});

test("range entry and keyboard movement expose new areas while keeping old areas lightly marked", async ({
  page,
}) => {
  await page.goto("/?fog=1");
  const viewport = page.locator("#viewport");
  await expect(viewport).toHaveAttribute("data-observers", /party/);
  await page.keyboard.press("Shift+G");
  await page.getByLabel("Sight range (m)").fill("1.5");
  await savedAction(page, () =>
    page.getByLabel("Sight range (m)").press("Tab"),
  );
  await page.keyboard.press("Escape");
  const at = await position(viewport, [0, 0]);
  await savedAction(page, () => viewport.click({ position: at }));
  expect(await colour(viewport, [-0.7, 0.7])).toEqual([255, 255, 255]);
  await savedAction(page, () => page.keyboard.press("ArrowRight"));
  await expect(viewport).toHaveAttribute(
    "data-observers",
    /"at":\[1.5,0\],"range":1.5/,
  );
  const remembered = await colour(viewport, [-0.7, 0.7]);
  expect(remembered).not.toEqual([255, 255, 255]);
  expect(remembered.every((channel) => channel > 235)).toBe(true);
  expect(await colour(viewport, [2.2, 0.7])).toEqual([255, 255, 255]);
  await page.reload();
  await expect(viewport).toHaveAttribute(
    "data-observers",
    /"at":\[1.5,0\],"range":1.5/,
  );
});

test("browser printing produces an A4 sheet with only a 14 by 10 grid area at 20mm squares", async ({
  page,
}) => {
  await page.goto("/?region=plan");
  await expect(page.locator("#viewport [data-wall]")).not.toHaveCount(0);
  const pdf = await page.pdf({ preferCSSPageSize: true });
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  await expect(page.locator(".page")).toHaveCount(1);
  const paper = page.locator(".page > svg");
  await expect(paper).toHaveAttribute("width", "297mm");
  await expect(paper).toHaveAttribute("height", "210mm");
  const map = page.locator(".page > svg > svg");
  await expect(map).toHaveAttribute("width", "280");
  await expect(map).toHaveAttribute("height", "200");
  await expect(map).toHaveAttribute("viewBox", / 21 15$/);
  await expect(map.locator("pattern")).toHaveAttribute("width", "1.5");
  await expect(map.locator("pattern")).toHaveAttribute("height", "1.5");
  await expect(paper.locator("text")).toHaveText(["SECRET"]);
});
