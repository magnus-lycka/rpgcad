import { test, expect } from "@playwright/test";

test("Toggle fog requires Shift-F and is discoverable without stealing tab navigation", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /./,
  );
  const viewport = page.locator("#viewport");
  const fog = page.locator("#gm-view");
  const before = await viewport.getAttribute("viewBox");
  await page.keyboard.press("v");
  await page.keyboard.press("Shift+V");
  await expect(fog).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("f");
  await expect(fog).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Shift+F");
  await expect(fog).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.down("Shift");
  await page.keyboard.down("F");
  await page.keyboard.down("F");
  await page.keyboard.up("F");
  await page.keyboard.up("Shift");
  await expect(fog).toHaveAttribute("aria-pressed", "true");
  await expect(viewport).toHaveAttribute("viewBox", before || "");
  await page.keyboard.press("/");
  await page.getByRole("combobox").fill("Toggle fog");
  await expect(page.getByRole("option")).toContainText("Shift+F");
  await page.keyboard.press("Enter");
  await expect(fog).toHaveAttribute("aria-pressed", "false");
});

test("Observer movement, range and reset share palette bindings and persist", async ({
  page,
  request,
}) => {
  const previous = await request.get("/exploration");
  await request.put("/exploration", {
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
  await page.goto("/?mode=play");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /party/,
  );
  async function command(name) {
    await expect(page.locator("#reset-fog")).toBeEnabled();
    await page.keyboard.press("/");
    await page.getByRole("combobox").fill(name);
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Enter");
  }
  await command("Move Observer right");
  await expect
    .poll(
      async () =>
        (await (await request.get("/exploration")).json()).observers[0].at,
    )
    .toEqual([1.5, 0]);
  await expect(page.locator("#reset-fog")).toBeEnabled();
  await page.keyboard.press("]");
  await expect
    .poll(
      async () =>
        (await (await request.get("/exploration")).json()).observers[0].range,
    )
    .toBe(7.5);
  await command("Decrease Observer range");
  await expect
    .poll(
      async () =>
        (await (await request.get("/exploration")).json()).observers[0].range,
    )
    .toBe(6);
  await command("Reset fog");
  await expect
    .poll(
      async () =>
        (await (await request.get("/exploration")).json()).visibilityPaused,
    )
    .toBe(true);
  await page.keyboard.press("Shift+E");
  await expect(page.locator("body")).toHaveAttribute("data-mode", "edit");
  await page.keyboard.press("/");
  await page.getByRole("combobox").fill("Observer");
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("Add PC is offered by the palette and the A key and opens the creation popup", async ({
  page,
  request,
}) => {
  const previous = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": previous.headers().etag },
    data: { characters: [], pov: null },
  });
  await page.goto("/?mode=play");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /./,
  );
  await expect(page.locator("#add-pc")).toBeEnabled();
  await page.keyboard.press("/");
  await page
    .getByRole("dialog", { name: "Commands", exact: true })
    .getByRole("combobox")
    .fill("Add PC");
  await expect(
    page.getByRole("option", { name: "Add PC (A)", exact: true }),
  ).toHaveAttribute("aria-disabled", "false");
  await page.keyboard.press("Escape");
  await page.keyboard.press("a");
  await expect(page.getByRole("dialog", { name: "New PC" })).toBeVisible();
  expect((await (await request.get("/characters")).json()).characters).toEqual(
    [],
  );
});

test("door command targets a nearby Observer and explains when no opening is in reach", async ({
  page,
  request,
}) => {
  const chars = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": chars.headers().etag },
    data: { characters: [], pov: null },
  });
  const previous = await request.get("/exploration");
  await request.put("/exploration", {
    headers: { "If-Match": previous.headers().etag },
    data: {
      version: 2,
      observers: [{ id: "party", at: [3, 0], range: 6 }],
      doors: {},
      observations: [],
      revisions: {},
      visibilityPaused: true,
    },
  });
  await page.goto("/?mode=play");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /party/,
  );
  await page.keyboard.press("Shift+O");
  await expect
    .poll(async () =>
      Object.values((await (await request.get("/exploration")).json()).doors),
    )
    .toEqual(["open"]);
  await expect(page.locator("#reset-fog")).toBeEnabled();
  await page.keyboard.press("/");
  await page.getByRole("combobox").fill("Toggle nearby door");
  await page.keyboard.press("Enter");
  await expect
    .poll(async () =>
      Object.values((await (await request.get("/exploration")).json()).doors),
    )
    .toEqual(["closed"]);
  await expect(page.locator("#reset-fog")).toBeEnabled();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#reset-fog")).toBeEnabled();
  await page.keyboard.press("/");
  await page.getByRole("combobox").fill("Toggle nearby door");
  await expect(page.getByRole("option")).toContainText(
    "Move an Observer beside a door opening",
  );
});
