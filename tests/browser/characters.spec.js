import { test, expect } from "@playwright/test";
test.use({ actionTimeout: 5000 });

test.beforeEach(async ({ request }) => {
  const previous = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": previous.headers().etag },
    data: { characters: [], pov: null },
  });
});

test("GM can add named PCs and NPCs and retain them after reloading", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  await page.getByLabel("Character name").fill("Ada");
  await page.getByRole("button", { name: "Add PC", exact: true }).click();
  await expect(page.locator("[data-character]")).toHaveCount(1);
  await page.getByLabel("Character name").fill("Guard");
  await page.getByRole("button", { name: "Add NPC", exact: true }).click();
  await page.keyboard.press("Shift+F");
  await expect(page.locator("[data-character]")).toHaveCount(2);
  await page.reload();
  await page.keyboard.press("Shift+F");
  await expect(page.locator("[data-character]")).toHaveCount(2);
  await expect(page.locator("#viewport")).toContainText("Ada");
  await expect(page.locator("#viewport")).toContainText("Guard");
});

async function seed(request) {
  const old = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": old.headers().etag },
    data: {
      pov: "ada",
      characters: [
        {
          id: "ada",
          name: "Ada",
          kind: "pc",
          at: [0, 0],
          range: 2,
          level: "original",
        },
        {
          id: "ben",
          name: "Ben",
          kind: "pc",
          at: [5, 0],
          range: 3,
          level: "original",
        },
        {
          id: "guard",
          name: "Guard",
          kind: "npc",
          at: [4, 0],
          range: 6,
          level: "original",
        },
      ],
    },
  });
  const previous = await request.get("/exploration");
  await request.put("/exploration", {
    headers: { "If-Match": previous.headers().etag },
    data: {
      version: 2,
      observers: [],
      observations: [],
      revisions: {},
      doors: {},
      visibilityPaused: true,
    },
  });
}
async function point(page, at) {
  return page.locator("#viewport").evaluate((svg, at) => {
    const b = svg.viewBox.baseVal;
    return {
      x: ((at[0] - b.x) * svg.clientWidth) / b.width,
      y: ((at[1] - b.y) * svg.clientHeight) / b.height,
    };
  }, at);
}

test("selecting a PC changes POV and range; dragging it reveals only its destination", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.locator('[data-character="ada"] circle').click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /"range":2/,
  );
  await expect(page.locator('[data-character="guard"]')).toHaveCount(0);
  await expect(page.locator("#reset-fog")).toBeEnabled();
  await page.locator('[data-character="ben"] circle').click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /"range":3/,
  );
  await expect(page.locator('[data-character="guard"]')).toBeVisible();
  const start = await point(page, [5, 0]),
    end = await point(page, [5, 2]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters.find(
          (c) => c.id === "ben",
        ).at,
    )
    .toEqual([5, 2]);
  await expect
    .poll(
      async () =>
        (await (await request.get("/exploration")).json()).observations.length,
    )
    .toBe(3);
  const explored = await (await request.get("/exploration")).json();
  expect(explored.observations).toHaveLength(3);
  expect(explored.observations.at(-1).at).toEqual([5, 2]);
});

test("GM can rename a PC, save its range, reset fog without losing characters, and remove it", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await page.locator('[data-character="ada"] circle').click();
  await page.keyboard.press("Shift+G");
  await page.getByLabel("Character name").fill("Captain Ada");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByLabel("Sight range (m)").fill("4");
  await page.getByLabel("Sight range (m)").dispatchEvent("change");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters.find(
          (c) => c.id === "ada",
        ).range,
    )
    .toBe(4);
  await page
    .getByRole("button", { name: "Reset fog · close all doors" })
    .click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observations",
    "0",
  );
  await page.reload();
  await expect(page.locator("#viewport")).toContainText("Captain Ada");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observations",
    "0",
  );
  await expect(page.locator('[data-character="guard"]')).toHaveCount(0);
  await page.keyboard.press("Shift+G");
  await page
    .getByRole("button", { name: "Remove character", exact: true })
    .click();
  await expect(page.locator('[data-character="ada"]')).toHaveCount(0);
});

test("GM transfers an NPC to another level without revealing areas and can place it there", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  await page.getByLabel("Character", { exact: true }).selectOption("guard");
  await page.getByLabel("Destination level").selectOption("below");
  await page
    .getByRole("button", { name: "Move to level", exact: true })
    .click();
  await expect(page).toHaveURL(/level=below/);
  await page.keyboard.press("Shift+F");
  await expect(page.locator('[data-character="guard"]')).toBeVisible();
  const start = await point(page, [4, 0]),
    end = await point(page, [2, 1]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters.find(
          (c) => c.id === "guard",
        ).at,
    )
    .toEqual([2, 1]);
  const old = await (await request.get("/exploration")).json();
  const lower = await (await request.get("/exploration?level=below")).json();
  expect(old.observations).toHaveLength(0);
  expect(lower.observations).toHaveLength(0);
});

test("moving another PC or an NPC does not reveal areas or leave remembered NPC markers", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await page.locator('[data-character="ada"] circle').click();
  await expect
    .poll(
      async () =>
        (await (await request.get("/exploration")).json()).observations.length,
    )
    .toBe(1);
  let start = await point(page, [5, 0]),
    end = await point(page, [5, 1]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters.find(
          (c) => c.id === "ben",
        ).at,
    )
    .toEqual([5, 1]);
  expect((await (await request.get("/characters")).json()).pov).toBe("ada");
  expect(
    (await (await request.get("/exploration")).json()).observations,
  ).toHaveLength(1);
  await page.locator('[data-character="ben"] circle').click();
  await expect(page.locator('[data-character="guard"]')).toBeVisible();
  start = await point(page, [4, 0]);
  end = await point(page, [8, 2]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters.find(
          (c) => c.id === "guard",
        ).at,
    )
    .toEqual([8, 2]);
  await expect(page.locator('[data-character="guard"]')).toHaveCount(0);
  expect(
    (await (await request.get("/exploration")).json()).observations,
  ).toHaveLength(2);
});

test("choosing a PC in GM controls selects its POV and saved range", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.keyboard.press("Shift+G");
  await page.getByLabel("Character", { exact: true }).selectOption("ben");
  await expect(page.getByLabel("Sight range (m)")).toHaveValue("3");
});
