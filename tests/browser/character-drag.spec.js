import { test, expect } from "@playwright/test";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";

preserveBrowserFixture(test);

/** @param {import('@playwright/test').APIRequestContext} request */
async function seed(request) {
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
          range: 6,
        },
      ],
    },
  });
}

test("a dropped marker stays where it was dropped while the save is in flight", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  const marker = page.locator('[data-character="ada"]');
  await expect(marker).toBeVisible();
  /** @type {() => void} */
  let release = () => {};
  const held = new Promise((resolve) => {
    release = () => resolve(undefined);
  });
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT") await held;
    await route.continue();
  });
  const box = await marker.boundingBox();
  if (!box) throw Error("Expected marker");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 40, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(marker).not.toHaveAttribute("transform", "translate(0 0)");
  const dropped = await marker.getAttribute("transform");
  release();
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters[0].at,
    )
    .not.toEqual([0, 0]);
  const numbers = (/** @type {string|null} */ text) =>
    (text ?? "")
      .replace("translate", "")
      .replace(/[()]/g, "")
      .trim()
      .split(" ")
      .map(Number);
  await expect
    .poll(async () => numbers(await marker.getAttribute("transform")))
    .toEqual(numbers(dropped).map((n) => expect.closeTo(n, 2)));
});

test("clicking empty plan neither moves the POV character nor reveals anything", async ({
  page,
  request,
}) => {
  await seed(request);
  const before = await (await request.get("/characters")).json();
  const exploration = await (await request.get("/exploration")).json();
  /** @type {string[]} */
  const writes = [];
  page.on("request", (req) => {
    if (["PUT", "PATCH", "POST"].includes(req.method())) writes.push(req.url());
  });
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.mouse.click(760, 480);
  await page.waitForTimeout(400);
  expect(writes).toEqual([]);
  expect(await (await request.get("/characters")).json()).toEqual(before);
  expect(await (await request.get("/exploration")).json()).toEqual(exploration);
});

test("the arrow keys still move the POV character", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Add PC" })).toBeEnabled();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters[0].at,
    )
    .toEqual([1.5, 0]);
});
