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
  const toolbar = await page.locator("#toolbar").boundingBox();
  if (!toolbar) throw Error("Expected visible toolbar");
  const x = toolbar.x + 200;
  const y = toolbar.y + toolbar.height + 40;
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
  await page.keyboard.press("Shift+F");
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

test("failed Clear keeps the visible and saved marks", async ({
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
  await page.getByRole("button", { name: "Clear marks", exact: true }).click();
  await expect(page.locator("#sketch-status")).toContainText(
    "Marks not saved (503)",
  );
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  expect((await (await request.get("/sketch")).json()).strokes).toEqual(marks);
});
