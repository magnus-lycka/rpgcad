import { test, expect } from "@playwright/test";

test("full-plan reveal requires Shift-V and is discoverable without stealing tab navigation", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /./,
  );
  const viewport = page.locator("#viewport");
  const before = await viewport.getAttribute("viewBox");
  await page.keyboard.press("v");
  await expect(page.locator("#gm-view")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.keyboard.press("Shift+F");
  await expect(viewport).toHaveAttribute("viewBox", before || "");
  await expect(page.locator("#gm-view")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.keyboard.press("Shift+V");
  await expect(page.locator("#gm-view")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.down("Shift");
  await page.keyboard.down("V");
  await page.keyboard.down("V");
  await page.keyboard.up("V");
  await page.keyboard.up("Shift");
  await expect(page.locator("#gm-view")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.keyboard.press("/");
  await page.getByRole("combobox").fill("full-plan");
  await expect(page.getByRole("option")).toContainText("Shift+V");
  await page.keyboard.press("Enter");
  await expect(page.locator("#gm-view")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("g");
  await page.getByRole("tab", { name: "Characters", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Exploration", exact: true }),
  ).toBeFocused();
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

test("Referee character commands explain targets and perform saved actions from the palette", async ({
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
  async function palette(name, execute = true) {
    await expect(page.locator("#add-pc")).toBeEnabled();
    await page.keyboard.press("/");
    await page
      .getByRole("dialog", { name: "Commands", exact: true })
      .getByRole("combobox")
      .fill(name);
    if (execute) {
      await expect(
        page
          .getByRole("dialog", { name: "Commands", exact: true })
          .getByRole("option"),
      ).toHaveAttribute("aria-disabled", "false");
      await page.keyboard.press("Enter");
    }
  }
  await palette("Remove character", false);
  await expect(page.getByRole("option")).toContainText("Select a character");
  await page.getByRole("combobox").fill("Add PC");
  await expect(
    page.getByRole("option", { name: "Add PC (A)", exact: true }),
  ).toHaveAttribute("aria-disabled", "false");
  await page.keyboard.press("Escape");
  await page.keyboard.press("a");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters.length,
    )
    .toBe(1);
  await expect(page.locator("#add-pc")).toBeEnabled();
  await page.keyboard.press("t");
  await expect(
    page.getByRole("tab", { name: "Characters", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.locator("#character-name").fill("Keyboard PC");
  await page.locator("#viewport").focus();
  await palette("Rename character");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters[0].name,
    )
    .toBe("Keyboard PC");
  await expect(page.locator("#add-pc")).toBeEnabled();
  await page.keyboard.press("d");
  await expect(page.locator("#character-options")).toHaveAttribute("open", "");
  await palette("Remove character");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters.length,
    )
    .toBe(0);
  await page.keyboard.press("x");
  await expect(
    page.getByRole("tab", { name: "Exploration", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("w");
  await expect(
    page.getByRole("tab", { name: "View", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("Move to level requires a different destination and preserves the character through navigation", async ({
  page,
  request,
}) => {
  const previous = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": previous.headers().etag },
    data: {
      characters: [
        {
          id: "transfer-key",
          name: "Traveller",
          kind: "pc",
          level: "original",
          at: [0, 0],
          range: 6,
        },
      ],
      pov: "transfer-key",
    },
  });
  await page.goto("/?mode=play");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /transfer-key/,
  );
  await page.keyboard.press("/");
  await page.getByRole("combobox").fill("Move to level");
  await expect(page.getByRole("option")).toContainText(
    "Choose a different level",
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("t");
  await page.locator("#character-level").selectOption("below");
  await page.locator("#viewport").focus();
  await page.keyboard.press("Shift+M");
  await expect(page).toHaveURL(/level=below/);
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters[0].level,
    )
    .toBe("below");
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
