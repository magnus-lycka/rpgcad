import { test, expect } from "@playwright/test";
import { addCharacter, openCharacter } from "./helpers.js";
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
  await page.keyboard.press("Shift+F");
  const marker = page.locator('[data-character="npc"]');
  await marker.focus();
  await page.keyboard.press("Space");
  await expect(marker).toBeFocused();
  let circle;
  await expect
    .poll(async () => {
      circle = await marker.locator("circle").boundingBox();
      return circle;
    })
    .toBeTruthy();
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

test("GM can add named PCs and NPCs and retain them after reloading", async ({
  page,
}) => {
  await page.goto("/?mode=play");
  await addCharacter(page, "pc", "Ada");
  await expect(page.locator("[data-character]")).toHaveCount(1);
  await addCharacter(page, "npc", "Guard");
  await page.keyboard.press("Shift+F");
  await expect(page.locator("[data-character]")).toHaveCount(2);
  await page.reload();
  await expect(page.locator("#viewport")).toContainText("Ada");
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
  await expect
    .poll(
      async () =>
        (await (await request.get("/exploration")).json()).observations.length,
    )
    .toBe(1);
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

test("a PC can be renamed, given a range, reset and removed without losing the others", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await page.locator('[data-character="ada"] circle').click();
  const popup = await openCharacter(page, "ada");
  await popup.getByLabel("Name").fill("Captain Ada");
  await popup.getByLabel("Name").press("Enter");
  await popup.getByLabel("Visual range (m)").fill("4");
  await popup.getByLabel("Visual range (m)").press("Enter");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters.find(
          (c) => c.id === "ada",
        ).range,
    )
    .toBe(4);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Reset fog / close all doors" })
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
  const again = await openCharacter(page, "ada");
  await again
    .getByRole("button", { name: "Remove character", exact: true })
    .click();
  await expect(page.locator('[data-character="ada"]')).toHaveCount(0);
});

test("an NPC moved to another level can be placed there without revealing areas", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await page.getByRole("button", { name: "Toggle fog", exact: true }).click();
  const popup = await openCharacter(page, "guard");
  await popup.getByLabel("Move to level").selectOption("below");
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

test("opening a PC's popup shows its saved range", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.getByRole("button", { name: "Toggle fog", exact: true }).click();
  const popup = await openCharacter(page, "ben");
  await expect(popup.getByLabel("Visual range (m)")).toHaveValue("3");
});

test("keyboard character selection distinguishes NPC selection from PC POV without revealing hidden positions", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await expect(page.locator('[data-character="guard"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle fog", exact: true }).click();
  const guard = page.getByRole("button", { name: "Guard NPC", exact: true });
  await guard.focus();
  await page.keyboard.press("Space");
  const selected = page.getByRole("button", {
    name: "Guard NPC · Selected",
    exact: true,
  });
  await expect(selected).toBeFocused();
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

test("the popup reports rejected saves without changing persisted characters", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 409, body: "Conflict" });
    else await route.continue();
  });
  const popup = await openCharacter(page, "ada");
  await popup.getByLabel("Name").fill("Rejected name");
  await popup.getByLabel("Name").press("Enter");
  await expect(popup.locator("#character-action-status")).toContainText(
    "Character save failed (409)",
  );
  expect(
    (await (await request.get("/characters")).json()).characters[0].name,
  ).toBe("Ada");
});

test("a PC's range cannot be cleared, and a rejected range save restores the displayed range", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  const popup = await openCharacter(page, "ben");
  const exploration = await (await request.get("/exploration")).json();
  const range = popup.getByLabel("Visual range (m)");
  await range.fill("");
  await range.press("Enter");
  await expect(page.getByRole("alert")).toContainText(
    "A PC needs a visual range.",
  );
  await expect(range).toHaveValue("3");
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 409, body: "Conflict" });
    else await route.continue();
  });
  await range.fill("9");
  await range.press("Enter");
  await expect(popup.locator("#character-action-status")).toContainText(
    "Character save failed (409)",
  );
  await expect(range).toHaveValue("3");
  await page.unroute("**/characters*");
  await popup.getByLabel("Name").fill("Benedict");
  await popup.getByLabel("Name").press("Enter");
  await expect
    .poll(async () =>
      (await (await request.get("/characters")).json()).characters.find(
        (c) => c.id === "ben",
      ),
    )
    .toMatchObject({ name: "Benedict", range: 3 });
  expect(await (await request.get("/exploration")).json()).toEqual(exploration);
});

test("a rejected level transfer stays on the source level and cannot leak into a later save", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  const beforeUrl = page.url();
  const before = await (await request.get("/characters")).json();
  const exploration = await (await request.get("/exploration")).json();
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 500, body: "Unavailable" });
    else await route.continue();
  });
  const popup = await openCharacter(page, "ada");
  await popup.getByLabel("Move to level").selectOption("below");
  await expect(page.locator("#fog-status")).toContainText(
    "Character save failed (500)",
  );
  await expect(page).toHaveURL(beforeUrl);
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  expect(await (await request.get("/characters")).json()).toEqual(before);
  expect(await (await request.get("/exploration")).json()).toEqual(exploration);
  await page.unroute("**/characters*");
  await popup.getByLabel("Name").fill("Captain Ada");
  await popup.getByLabel("Name").press("Enter");
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
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  const popup = await openCharacter(page, "ada");
  await popup.getByLabel("Name").fill(" ben ");
  await popup.getByLabel("Name").press("Enter");
  await expect(popup.locator("#character-action-status")).toContainText(
    "already exists in this plan",
  );
  await expect(popup.getByLabel("Name")).toHaveValue("Ada");
  expect(await (await request.get("/characters")).json()).toEqual(before);
  await popup.getByLabel("Name").fill("Captain Ada");
  await popup.getByLabel("Name").press("Enter");
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
  const popup = await openCharacter(page, "ada");
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 409, body: "Conflict" });
    else await route.continue();
  });
  await popup.getByLabel("Name").fill("Rejected name");
  await popup.getByLabel("Name").press("Enter");
  await expect(popup.locator("#character-action-status")).toContainText(
    "Character save failed (409)",
  );
  await expect(page.locator('[data-character="ada"]')).toContainText("Ada");
  await expect(popup.getByLabel("Name")).toHaveValue("Ada");
  await page.unroute("**/characters*");
  const range = popup.getByLabel("Visual range (m)");
  await range.fill("4");
  await range.press("Enter");
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
  const before = await (await request.get("/characters")).json();
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 500, body: "Unavailable" });
    else await route.continue();
  });
  await page
    .getByRole("toolbar", { name: "Toolbar", exact: true })
    .getByRole("button", { name: "Add PC", exact: true })
    .click();
  const popup = page.getByRole("dialog", { name: "New PC" });
  await popup.getByLabel("Name").fill("Ghost");
  await popup.getByLabel("Visual range (m)").fill("5");
  await popup.getByRole("button", { name: "Add character" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Character save failed (500)",
  );
  await expect(popup).toBeVisible();
  await expect(
    page.locator("[data-character]").filter({ hasText: "Ghost" }),
  ).toHaveCount(0);
  expect(await (await request.get("/characters")).json()).toEqual(before);
  await page.unroute("**/characters*");
  await popup.getByLabel("Name").fill("Real");
  await popup.getByRole("button", { name: "Add character" }).click();
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
  const popup = await openCharacter(page, "ada");
  await popup.getByLabel("Name").fill("Captain Ada");
  await popup.getByLabel("Name").press("Enter");
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
  const explored = await (await request.get("/exploration")).json();
  await page.route("**/characters*", async (route) => {
    if (route.request().method() === "PUT") await route.abort("failed");
    else await route.continue();
  });
  await page.getByRole("button", { name: "Toggle fog", exact: true }).click();
  await page.locator('[data-character="ben"] circle').click();
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
  const popup = await openCharacter(page, "ben");
  const range = popup.getByLabel("Visual range (m)");
  await range.fill("4");
  await range.press("Enter");
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

test("a rejected marker move is announced as an alert", async ({ page }) => {
  const roster = {
    pov: "first",
    characters: ["first", "second"].map((id, index) => ({
      id,
      name: "RP",
      kind: "pc",
      level: index ? "below" : "original",
      at: [0, 0],
      range: 6,
    })),
  };
  await page.route("**/characters*", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: roster, headers: { ETag: '"broken"' } })
      : route.continue(),
  );
  await page.goto("/?mode=play");
  const marker = page.locator('[data-character="first"]');
  await expect(marker).toBeVisible();
  const box = await marker.boundingBox();
  if (!box) throw Error("Expected character marker");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 40, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole("alert")).toContainText(
    "A character named “RP” already exists in this plan.",
  );
});
