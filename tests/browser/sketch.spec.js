import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  for (const query of ["", "?level=below"]) {
    const response = await request.put(`/sketch${query}`, {
      data: { strokes: [] },
    });
    expect(response.status()).toBe(204);
  }
});

test("drawing alone makes raw strokes available to the chat agent without editing the model", async ({
  page,
  request,
}) => {
  const original = await (await request.get("/model?level=below")).json();
  await page.goto("/?level=below&mode=edit");
  await expect(page.locator("#viewport")).toContainText("LOWER LEVEL");
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  const palette = await page.locator("#edit-palette").boundingBox();
  if (!palette) throw Error("Expected visible Designer palette");
  const x = palette.x + palette.width + 40;
  const y = palette.y + palette.height + 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 49, y + 13);
  await page.mouse.move(x + 42, y + 69);
  await page.mouse.move(x - 3, y + 58);
  await page.mouse.up();
  const stroke = page.locator("[data-sketch-stroke]");
  await expect(stroke).toHaveCount(1);
  const rawPath = await stroke.getAttribute("d");
  await expect
    .poll(
      async () =>
        (await (await request.get("/sketch?level=below")).json())?.strokes?.[0]
          ?.length,
    )
    .toBe(4);
  expect(await stroke.getAttribute("d")).toBe(rawPath);
  await expect(page.locator("textarea")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit sketch" })).toHaveCount(
    0,
  );
  const saved = await (await request.get("/sketch?level=below")).json();
  expect(saved.instruction).toBeUndefined();
  expect(saved.strokes[0]).toHaveLength(4);
  expect(saved.strokes[0][0][0]).not.toBe(saved.strokes[0][1][0]);
  expect(saved.strokes[0][0][1]).not.toBe(saved.strokes[0][1][1]);
  expect(saved.level).toBe("below");
  expect(saved.model).toEqual(original);
  expect(await (await request.get("/model?level=below")).json()).toEqual(
    original,
  );
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
});

test("play mode hides the edit palette, strokes and reference axes while preserving the edit draft", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await expect(page.locator('#viewport path[stroke="#d62929"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.mouse.move(450, 350);
  await page.mouse.down();
  await page.mouse.move(470, 365);
  await page.mouse.up();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "play");
  await expect(page.locator("#edit-palette")).toBeHidden();
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(0);
  await page.keyboard.press("Shift+V");
  await expect(page.locator('#viewport path[stroke="#d62929"]')).toHaveCount(0);
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  await page.keyboard.press("Shift+E");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await expect(page.locator('#viewport path[stroke="#d62929"]')).toHaveCount(1);
});

test("the agent consuming marks for a chat instruction clears them from the drawing", async ({
  page,
  request,
}) => {
  await page.goto("/?mode=edit");
  await expect(page.locator('#viewport path[stroke="#d62929"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.mouse.move(480, 300);
  await page.mouse.down();
  await page.mouse.move(500, 320);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/sketch") && r.request().method() === "PUT",
  );
  await page.mouse.up();
  expect((await saved).status()).toBe(204);
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  const feedback = await (await request.get("/sketch")).json();
  const result = await request.patch("/sketch", {
    data: {
      submittedAt: feedback.submittedAt,
      status: "applied",
      reply: "Door added to the marked wall",
    },
  });
  expect(result.status()).toBe(204);
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(0);
});

test("Undo Clear restores exact marks on their level after switching modes", async ({
  page,
  request,
}) => {
  const marks = [
    [
      [1.25, 2.5],
      [3, 4],
    ],
    [[5, 6]],
  ];
  await request.put("/sketch?level=below", { data: { strokes: marks } });
  await page.goto("/?level=below&mode=edit");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Sketch options", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear marks", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Undo Clear", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Shift+E");
  await page.keyboard.press("Shift+E");
  await page.getByRole("button", { name: "Undo Clear", exact: true }).click();
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(2);
  await expect
    .poll(
      async () =>
        (await (await request.get("/sketch?level=below")).json()).strokes,
    )
    .toEqual(marks);
  expect((await (await request.get("/sketch")).json()).strokes).toEqual([]);
});

test("failed Clear keeps the visible and saved marks without offering recovery", async ({
  page,
  request,
}) => {
  const marks = [
    [
      [2, 3],
      [4, 5],
    ],
  ];
  await request.put("/sketch", { data: { strokes: marks } });
  await page.goto("/?mode=edit");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await page.route("**/sketch", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 503 });
    else await route.continue();
  });
  await page
    .getByRole("button", { name: "Sketch options", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear marks", exact: true }).click();
  await expect(page.locator("#sketch-status")).toContainText(
    "Marks not saved (503)",
  );
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Undo Clear", exact: true }),
  ).toBeHidden();
  expect((await (await request.get("/sketch")).json()).strokes).toEqual(marks);
});

test("failed Undo Clear can be retried without falsely displaying restored marks", async ({
  page,
  request,
}) => {
  const marks = [
    [
      [2, 3],
      [4, 5],
    ],
  ];
  await request.put("/sketch", { data: { strokes: marks } });
  await page.goto("/?mode=edit");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Sketch options", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear marks", exact: true }).click();
  const undo = page.getByRole("button", { name: "Undo Clear", exact: true });
  await expect(undo).toBeVisible();
  await page.route("**/sketch", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 503 });
    else await route.continue();
  });
  await undo.click();
  await expect(page.locator("#sketch-status")).toContainText(
    "Marks not saved (503)",
  );
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(0);
  await expect(undo).toBeVisible();
  await page.unroute("**/sketch");
  await undo.click();
  await expect
    .poll(async () => (await (await request.get("/sketch")).json()).strokes)
    .toEqual(marks);
});

test("Undo Clear cannot overwrite another writer before the browser notices the change", async ({
  page,
  request,
}) => {
  await request.put("/sketch", { data: { strokes: [[[1, 2]]] } });
  await page.goto("/?mode=edit");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Sketch options", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear marks", exact: true }).click();
  const undo = page.getByRole("button", { name: "Undo Clear", exact: true });
  await expect(undo).toBeVisible();
  // Hold polling at the clear revision to exercise the atomic write guard.
  const cleared = await (await request.get("/sketch")).body();
  const clearTag = (await request.get("/sketch")).headers().etag;
  await page.route("**/sketch", async (route) => {
    if (route.request().method() === "GET")
      await route.fulfill({
        body: cleared,
        headers: { "Content-Type": "application/json", ETag: clearTag },
      });
    else await route.continue();
  });
  const newer = [
    [
      [9, 8],
      [7, 6],
    ],
  ];
  await request.put("/sketch", { data: { strokes: newer } });
  const rejected = page.waitForResponse(
    (r) => r.request().method() === "PUT" && r.url().endsWith("/sketch"),
  );
  await undo.click();
  expect((await rejected).status()).toBe(412);
  await expect(undo).toBeHidden();
  expect((await (await request.get("/sketch")).json()).strokes).toEqual(newer);
  await expect(page.locator("#sketch-status")).toContainText(
    "Marks not saved (412)",
  );
});

test("a later saved stroke and page reload discard Clear recovery", async ({
  page,
  request,
}) => {
  await request.put("/sketch", { data: { strokes: [[[1, 2]]] } });
  await page.goto("/?mode=edit");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Sketch options", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear marks", exact: true }).click();
  const undo = page.getByRole("button", { name: "Undo Clear", exact: true });
  await expect(undo).toBeVisible();
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.mouse.click(600, 400);
  await expect(undo).toBeHidden();
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Sketch options", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear marks", exact: true }).click();
  await expect(undo).toBeVisible();
  await page.reload();
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  await expect(undo).toBeHidden();
});

test("agent acknowledgement invalidates Clear recovery without consuming other levels", async ({
  page,
  request,
}) => {
  await request.put("/sketch", { data: { strokes: [[[1, 2]]] } });
  await request.put("/sketch?level=below", { data: { strokes: [[[7, 8]]] } });
  await page.goto("/?mode=edit");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Sketch options", exact: true })
    .click();
  await page.getByRole("button", { name: "Clear marks", exact: true }).click();
  const undo = page.getByRole("button", { name: "Undo Clear", exact: true });
  await expect(undo).toBeVisible();
  const record = await (await request.get("/sketch")).json();
  expect(
    (
      await request.patch("/sketch", {
        data: { submittedAt: record.submittedAt, status: "applied" },
      })
    ).status(),
  ).toBe(204);
  await expect(undo).toBeHidden();
  expect(
    (await (await request.get("/sketch?level=below")).json()).strokes,
  ).toEqual([[[7, 8]]]);
});
