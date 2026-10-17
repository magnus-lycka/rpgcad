import { test, expect } from "@playwright/test";

test("holding Space pans instead of marking and release restores Pen", async ({
  page,
  request,
}) => {
  await request.put("/sketch", { data: { strokes: [] } });
  await page.goto("/?mode=edit");
  const viewport = page.locator("#viewport");
  await expect(viewport).toContainText("SECRET");
  await page.keyboard.press("p");
  const before = await viewport.getAttribute("viewBox");
  await page.keyboard.down("Space");
  await page.mouse.move(900, 600);
  await page.mouse.down();
  await page.mouse.move(950, 650);
  await page.mouse.up();
  await expect(viewport).not.toHaveAttribute("viewBox", before || "");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(0);
  await page.keyboard.up("Space");
  await page.mouse.move(900, 600);
  await page.mouse.down();
  await page.mouse.move(950, 650);
  await page.mouse.up();
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
});

test("directional panning repeats in Edit and Play without moving the Observer", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  const viewport = page.locator("#viewport");
  await expect(viewport).toContainText("SECRET");
  let before = await viewport.getAttribute("viewBox");
  await page.keyboard.press("ArrowRight");
  await expect(viewport).not.toHaveAttribute("viewBox", before || "");
  await page.keyboard.press("Shift+E");
  await expect(viewport).toHaveAttribute("data-observers", /./);
  const observers = await viewport.getAttribute("data-observers");
  before = await viewport.getAttribute("viewBox");
  await page.keyboard.down("Shift");
  await page.keyboard.down("ArrowDown");
  await page.keyboard.down("ArrowDown");
  await page.keyboard.up("ArrowDown");
  await page.keyboard.up("Shift");
  await expect(viewport).not.toHaveAttribute("viewBox", before || "");
  await expect(viewport).toHaveAttribute("data-observers", observers || "");
  await page.keyboard.press("/");
  await page.getByRole("combobox").fill("Pan left");
  before = await viewport.getAttribute("viewBox");
  await page.keyboard.press("Enter");
  await expect(viewport).not.toHaveAttribute("viewBox", before || "");
  await expect(viewport).toHaveAttribute("data-observers", observers || "");
});

test("focus entering a control cancels held pan before returning to Pen", async ({
  page,
  request,
}) => {
  await request.put("/sketch", { data: { strokes: [] } });
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport")).toContainText("SECRET");
  await page.keyboard.press("p");
  await page.keyboard.down("Space");
  await page.locator("#components-tool").focus();
  await page.locator("#viewport").focus();
  await page.mouse.move(900, 600);
  await page.mouse.down();
  await page.mouse.move(950, 650);
  await page.mouse.up();
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await page.keyboard.up("Space");
});

test("held Space in Play pans without placing an Observer and palette makes a finite pan", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  const viewport = page.locator("#viewport");
  await expect(viewport).toHaveAttribute("data-observers", /./);
  const observers = await viewport.getAttribute("data-observers");
  await page.keyboard.down("Space");
  await page.mouse.click(900, 600);
  await expect(viewport).toHaveAttribute("data-observers", observers || "");
  const before = await viewport.getAttribute("viewBox");
  await page.mouse.move(900, 600);
  await page.mouse.down();
  await page.mouse.move(950, 650);
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect(viewport).not.toHaveAttribute("viewBox", before || "");
  await expect(viewport).toHaveAttribute("data-observers", observers || "");
  await page.keyboard.press("/");
  await page.getByRole("combobox").fill("hold Space");
  await expect(page.getByRole("option")).toContainText("next drag");
  const panned = await viewport.getAttribute("viewBox");
  await page.keyboard.press("Enter");
  await page.mouse.move(900, 600);
  await page.mouse.down();
  await page.mouse.move(950, 650);
  await page.mouse.up();
  await expect(viewport).not.toHaveAttribute("viewBox", panned || "");
  await expect(viewport).toHaveAttribute("data-observers", observers || "");
  await expect(page.locator("body")).toHaveAttribute("data-tool", "play");
});

test("blur and mode switches cancel held pan; Space on a focused control retains native activation", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport")).toContainText("SECRET");
  await page.keyboard.press("p");
  await page.keyboard.down("Space");
  await expect(page.locator("body")).toHaveAttribute("data-tool", "pan");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator("body")).toHaveAttribute("data-tool", "pen");
  await page.keyboard.up("Space");
  await page.keyboard.down("Space");
  await page.keyboard.press("Shift+E");
  await expect(page.locator("body")).toHaveAttribute("data-tool", "play");
  await page.keyboard.up("Space");
  await page.keyboard.press("Shift+E");
  await expect(page.locator("body")).toHaveAttribute("data-tool", "pen");
  await page.locator("#components-tool").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#component-panel")).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-tool", "pen");
});

test("palette pan restores Pen after one drag and Escape cancels before a drag", async ({
  page,
  request,
}) => {
  await request.put("/sketch", { data: { strokes: [] } });
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport")).toContainText("SECRET");
  await page.keyboard.press("p");
  for (const cancel of [false, true]) {
    await page.keyboard.press("/");
    await page.getByRole("combobox").fill("hold Space");
    await page.keyboard.press("Enter");
    await expect(page.locator("body")).toHaveAttribute("data-tool", "pan");
    if (cancel) await page.keyboard.press("Escape");
    else {
      await page.mouse.move(900, 600);
      await page.mouse.down();
      await page.mouse.move(950, 650);
      await page.mouse.up();
    }
    await expect(page.locator("body")).toHaveAttribute("data-tool", "pen");
    await expect(page.locator("[data-sketch-stroke]")).toHaveCount(0);
  }
});

test("Space drag starting on a character pans without selecting or moving it", async ({
  page,
  request,
}) => {
  const old = await request.get("/characters");
  const roster = await old.json();
  await request.put("/characters", {
    headers: { "If-Match": old.headers().etag },
    data: {
      characters: [
        {
          id: "pan-npc",
          name: "Pan Guard",
          kind: "npc",
          level: "original",
          at: [0, 0],
          range: null,
        },
      ],
      pov: null,
    },
  });
  try {
    await page.goto("/?mode=play");
    await expect(page.locator("#viewport")).toHaveAttribute(
      "data-observers",
      /./,
    );
    await page.keyboard.press("Shift+V");
    const marker = page.locator('[data-character="pan-npc"]');
    await expect(marker).toBeVisible();
    const bounds = await marker.boundingBox();
    if (!bounds) throw Error("Marker has no bounds");
    const before = await page.locator("#viewport").getAttribute("viewBox");
    await page.keyboard.down("Space");
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 60,
      bounds.y + bounds.height / 2 + 60,
    );
    await page.mouse.up();
    await page.keyboard.up("Space");
    await expect(page.locator("#viewport")).not.toHaveAttribute(
      "viewBox",
      before || "",
    );
    expect(
      (await (await request.get("/characters")).json()).characters[0].at,
    ).toEqual([0, 0]);
  } finally {
    const current = await request.get("/characters");
    await request.put("/characters", {
      headers: { "If-Match": current.headers().etag },
      data: roster,
    });
  }
});
