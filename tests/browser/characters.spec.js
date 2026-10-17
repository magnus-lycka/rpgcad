import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
test.use({ actionTimeout: 5000 });

test.beforeEach(async ({ request }) => {
  const previous = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": previous.headers().etag },
    data: { characters: [], pov: null },
  });
});

test("focused NPC keeps its normal orange marker without a giant blue focus disk", async ({
  page,
  request,
}) => {
  const old = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": old.headers().etag },
    data: {
      characters: [
        {
          id: "npc",
          name: "Guard",
          kind: "npc",
          level: "original",
          at: [0, 0],
          range: null,
        },
      ],
      pov: null,
    },
  });
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+V");
  const marker = page.locator('[data-character="npc"]');
  await marker.focus();
  await page.keyboard.press("Enter");
  await expect(marker).toBeFocused();
  const circle = await marker.locator("circle").boundingBox();
  if (!circle) throw Error("Expected normal marker");
  const image = PNG.sync.read(
    await page.screenshot({ path: "/tmp/rpgcad-focused-npc.png" }),
  );
  let distantBlue = 0;
  const cx = circle.x + circle.width / 2,
    cy = circle.y + circle.height / 2;
  for (
    let y = Math.max(0, Math.floor(cy - 160));
    y < Math.min(image.height, cy + 160);
    y++
  ) {
    for (
      let x = Math.max(0, Math.floor(cx - 160));
      x < Math.min(image.width, cx + 160);
      x++
    ) {
      const i = (y * image.width + x) * 4;
      // Pixel offsets are bounded by the decoded screenshot dimensions.
      if (
        image.data.readUInt8(i) < 50 &&
        image.data.readUInt8(i + 1) < 160 &&
        image.data.readUInt8(i + 2) > 150 &&
        Math.hypot(x - cx, y - cy) > circle.width
      )
        distantBlue++;
    }
  }
  expect(distantBlue).toBe(0);
  await expect(marker.locator("circle")).toHaveAttribute("fill", "#ad5931");
});

test("selected character controls stay in the Referee menu when the marker moves", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  const gm = page.getByRole("region", { name: "GM controls" });
  await expect(gm.getByLabel("Character name")).toBeVisible();
  const marker = page.locator('[data-character="ada"]');
  const box = await marker.boundingBox();
  if (!box) throw Error("Expected marker");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2);
  await page.mouse.up();
  await expect(gm.getByLabel("Character name")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Selected character actions" }),
  ).toHaveCount(0);
  await page.getByLabel("Character name").press("Escape");
  await expect(gm).toBeHidden();
});

test("adding an existing character name reports the conflict without creating a clone", async ({
  page,
  request,
}) => {
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  await page.getByLabel("Character name").fill("Ada");
  await page.getByRole("button", { name: "Add PC", exact: true }).click();
  await expect(page.locator("[data-character]")).toHaveCount(1);
  const before = await (await request.get("/characters")).json();
  await page.getByLabel("Character name").fill(" ada ");
  await page.getByRole("button", { name: "Add NPC", exact: true }).click();
  await expect(page.locator("#character-action-status")).toContainText(
    "A character named “ada” already exists in this plan.",
  );
  expect(await (await request.get("/characters")).json()).toEqual(before);
  await page.reload();
  await expect(page.locator("[data-character]")).toHaveCount(1);
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
  await page.keyboard.press("Shift+V");
  await expect(page.locator("[data-character]")).toHaveCount(2);
  await page.reload();
  await expect(page.locator("#viewport")).toContainText("Ada");
  await page.keyboard.press("Shift+V");
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
  await page.getByLabel("Selected character visual range (m)").fill("4");
  await page
    .getByLabel("Selected character visual range (m)")
    .dispatchEvent("change");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters.find(
          (c) => c.id === "ada",
        ).range,
    )
    .toBe(4);
  await page.getByRole("tab", { name: "Exploration", exact: true }).click();
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
  await page.getByText("Character options", { exact: true }).click();
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
  await page.keyboard.press("Shift+V");
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
  await expect(
    page.getByLabel("Selected character visual range (m)"),
  ).toHaveValue("3");
});

test("Referee range and secondary removal save the selected character", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.keyboard.press("Shift+G");
  const actions = page.getByRole("region", {
    name: "GM controls",
  });
  await actions.getByLabel("Selected character visual range (m)").fill("4");
  await actions
    .getByLabel("Selected character visual range (m)")
    .dispatchEvent("change");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters[0].range,
    )
    .toBe(4);
  await expect(
    actions.getByRole("button", { name: "Remove character", exact: true }),
  ).toBeHidden();
  await actions.getByText("Character options", { exact: true }).click();
  await actions
    .getByRole("button", { name: "Remove character", exact: true })
    .click();
  await expect(page.locator('[data-character="ada"]')).toHaveCount(0);
});

test("keyboard character selection distinguishes NPC selection from PC POV without revealing hidden positions", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.keyboard.press("Shift+G");
  await page.getByLabel("Character", { exact: true }).selectOption("guard");

  await expect(page.locator('[data-character="guard"]')).toHaveCount(0);
  await page.getByRole("tab", { name: "Exploration", exact: true }).click();
  await page
    .getByRole("button", { name: "Show full plan (GM)", exact: true })
    .click();
  const guard = page.getByRole("button", {
    name: "Guard NPC · Selected",
    exact: true,
  });
  await guard.focus();
  await page.keyboard.press("Enter");
  await expect(guard).toBeFocused();
  await expect(page.locator('[data-character="guard"]')).toHaveAttribute(
    "data-selected",
    "true",
  );
  await expect(page.locator('[data-character="ada"]')).toHaveAttribute(
    "data-pov",
    "true",
  );
  expect((await (await request.get("/characters")).json()).pov).toBe("ada");
  expect(
    (await (await request.get("/exploration")).json()).observations,
  ).toHaveLength(0);
});

test("Referee controls report rejected saves without changing persisted characters", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.keyboard.press("Shift+G");
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 409, body: "Conflict" });
    else await route.continue();
  });
  const actions = page.getByRole("region", {
    name: "GM controls",
  });
  await actions.getByLabel("Character name").fill("Rejected name");
  await actions.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(actions.locator("#character-action-status")).toContainText(
    "Character save failed (409)",
  );
  expect(
    (await (await request.get("/characters")).json()).characters[0].name,
  ).toBe("Ada");
});

test("Referee controls stay fixed through pan and zoom and are excluded from print", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  const gm = page.getByRole("region", { name: "GM controls" });
  const before = await gm.boundingBox();
  await page.mouse.move(200, 700);
  await page.mouse.down();
  await page.mouse.move(300, 700);
  await page.mouse.up();
  await page.keyboard.press("+");
  const after = await gm.boundingBox();
  if (!before || !after) throw Error("Expected Referee controls");
  expect(after.x).toBe(before.x);
  expect(after.y).toBe(before.y);
  await page.setViewportSize({ width: 390, height: 420 });
  const narrow = await gm.boundingBox();
  if (!narrow) throw Error("Expected narrow Referee controls");
  expect(narrow.x).toBeGreaterThanOrEqual(0);
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(390);
  await page.emulateMedia({ media: "print" });
  await expect(gm).toBeHidden();
});

test("rejected non-POV range overrides restore the displayed and later saved range", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.keyboard.press("Shift+G");
  await page.getByLabel("Character", { exact: true }).selectOption("guard");
  const exploration = await (await request.get("/exploration")).json();
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 409, body: "Conflict" });
    else await route.continue();
  });
  const range = page.getByLabel("Selected character visual range (m)");
  await range.fill("");
  await range.dispatchEvent("change");
  await expect(page.locator("#character-action-status")).toContainText(
    "Character save failed (409)",
  );
  await expect(range).toHaveValue("6");
  await page.unroute("**/characters*");
  await page.getByLabel("Character name").fill("Watchman");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect
    .poll(async () =>
      (await (await request.get("/characters")).json()).characters.find(
        (c) => c.id === "guard",
      ),
    )
    .toMatchObject({ name: "Watchman", range: 6 });
  expect(await (await request.get("/exploration")).json()).toEqual(exploration);
});

test("Escape closes Character options before Referee controls and returns focus to its summary", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.keyboard.press("Shift+G");
  const actions = page.getByRole("region", {
    name: "GM controls",
  });
  const summary = actions.getByText("Character options", { exact: true });
  const remove = actions.getByRole("button", {
    name: "Remove character",
    exact: true,
  });
  await summary.click();
  await remove.focus();
  await page.keyboard.press("Escape");
  await expect(actions).toBeVisible();
  await expect(remove).toBeHidden();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(actions).toBeHidden();
  await expect(page.locator("#viewport")).toBeFocused();
});

test("Escape closes visible roster Character options before GM controls without intercepting other sections", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.keyboard.press("Shift+G");
  await page.getByLabel("Character", { exact: true }).selectOption("guard");
  await expect(page.locator("#character-actions")).toHaveCount(0);
  const summary = page.getByText("Character options", { exact: true });
  const remove = page.getByRole("button", {
    name: "Remove character",
    exact: true,
  });
  await summary.click();
  await remove.focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("#gm-panel")).toBeVisible();
  await expect(remove).toBeHidden();
  await expect(summary).toBeFocused();
  await summary.click();
  await page.getByRole("tab", { name: "Exploration", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#gm-panel")).toBeHidden();
});

test("a rejected level transfer stays on the source level and cannot leak into a later save", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.keyboard.press("Shift+G");
  const beforeUrl = page.url();
  const before = await (await request.get("/characters")).json();
  const exploration = await (await request.get("/exploration")).json();
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 500, body: "Unavailable" });
    else await route.continue();
  });
  await page.getByLabel("Destination level").selectOption("below");
  await page
    .getByRole("button", { name: "Move to level", exact: true })
    .click();
  await expect(page.locator("#fog-status")).toContainText(
    "Character save failed (500)",
  );
  await expect(page).toHaveURL(beforeUrl);
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  expect(await (await request.get("/characters")).json()).toEqual(before);
  expect(await (await request.get("/exploration")).json()).toEqual(exploration);
  await page.unroute("**/characters*");
  await page.getByLabel("Character name").fill("Captain Ada");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters[0].name,
    )
    .toBe("Captain Ada");
  expect(
    (await (await request.get("/characters")).json()).characters[0].level,
  ).toBe("original");
});

test("renaming to another character's name preserves both identities", async ({
  page,
  request,
}) => {
  await seed(request);
  const before = await (await request.get("/characters")).json();
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  await page.getByLabel("Character name").fill(" ben ");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.locator("#character-action-status")).toContainText(
    "already exists in this plan",
  );
  await expect(page.getByLabel("Character name")).toHaveValue("Ada");
  expect(await (await request.get("/characters")).json()).toEqual(before);
  await page.getByLabel("Character name").fill("Captain Ada");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters[0].name,
    )
    .toBe("Captain Ada");
});

test("a rejected rename restores the saved name and stays rejected when another setting saves", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.keyboard.press("Shift+G");
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 409, body: "Conflict" });
    else await route.continue();
  });
  await page.getByLabel("Character name").fill("Rejected name");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.locator("#character-action-status")).toContainText(
    "Character save failed (409)",
  );
  await expect(page.locator('[data-character="ada"]')).toContainText("Ada");
  await expect(page.getByLabel("Character name")).toHaveValue("Ada");
  await page.unroute("**/characters*");
  const range = page.getByLabel("Selected character visual range (m)");
  await range.fill("4");
  await range.dispatchEvent("change");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters[0].range,
    )
    .toBe(4);
  expect(
    (await (await request.get("/characters")).json()).characters[0].name,
  ).toBe("Ada");
});

test("a rejected addition creates no ghost character and a later addition saves only the intended character", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.keyboard.press("Shift+G");
  const before = await (await request.get("/characters")).json();
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 500, body: "Unavailable" });
    else await route.continue();
  });
  await page.getByLabel("Character name").fill("Ghost");
  await page.getByRole("button", { name: "Add PC", exact: true }).click();
  await expect(page.locator("#fog-status")).toContainText(
    "Character save failed (500)",
  );
  await expect(
    page.locator("[data-character]").filter({ hasText: "Ghost" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Character", { exact: true })).not.toContainText(
    "Ghost",
  );
  expect(await (await request.get("/characters")).json()).toEqual(before);
  await page.unroute("**/characters*");
  await page.getByLabel("Character name").fill("Real");
  await page.getByRole("button", { name: "Add PC", exact: true }).click();
  await expect
    .poll(async () =>
      (await (await request.get("/characters")).json()).characters.map(
        (c) => c.name,
      ),
    )
    .toEqual(["Ada", "Ben", "Guard", "Real"]);
});

test("a rejected POV move restores the marker and never reveals or later saves its destination", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  const marker = page.locator('[data-character="ada"]');
  await expect(marker).toBeVisible();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observations",
    "0",
  );
  await page.keyboard.press("Shift+G");
  const before = await (await request.get("/characters")).json();
  const explored = await (await request.get("/exploration")).json();
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 500, body: "Unavailable" });
    else await route.continue();
  });
  const from = await point(page, [0, 0]);
  const to = await point(page, [3, 1]);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator("#fog-status")).toContainText(
    "Character save failed (500)",
  );
  await expect(marker).toHaveAttribute("transform", "translate(0 0)");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observations",
    "0",
  );
  expect(await (await request.get("/characters")).json()).toEqual(before);
  expect(await (await request.get("/exploration")).json()).toEqual(explored);
  await page.unroute("**/characters*");
  await page.getByLabel("Character name").fill("Captain Ada");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters[0].name,
    )
    .toBe("Captain Ada");
  expect(
    (await (await request.get("/characters")).json()).characters[0].at,
  ).toEqual([0, 0]);
});

// Characterisation of the shared staged commit path after the movement fix.
test("a network-rejected POV selection keeps the saved viewpoint through a later successful edit", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.keyboard.press("Shift+G");
  const explored = await (await request.get("/exploration")).json();
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT") await route.abort("failed");
    else await route.continue();
  });
  await page.getByLabel("Character", { exact: true }).selectOption("ben");
  await expect(page.locator("#fog-status")).toContainText("Failed to fetch");
  await expect(page.locator('[data-character="ada"]')).toHaveAttribute(
    "data-pov",
    "true",
  );
  await expect(page.locator('[data-character="ben"]')).toHaveAttribute(
    "data-pov",
    "false",
  );
  expect((await (await request.get("/characters")).json()).pov).toBe("ada");
  expect(await (await request.get("/exploration")).json()).toEqual(explored);
  await page.unroute("**/characters*");
  const range = page.getByLabel("Selected character visual range (m)");
  await range.fill("4");
  await range.dispatchEvent("change");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters.find(
          (c) => c.id === "ben",
        ).range,
    )
    .toBe(4);
  expect((await (await request.get("/characters")).json()).pov).toBe("ada");
  expect(await (await request.get("/exploration")).json()).toEqual(explored);
});
