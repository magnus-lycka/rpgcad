import { test, expect } from "@playwright/test";

/** @param {import("@playwright/test").APIRequestContext} request @param {object} data */
async function setRoster(request, data) {
  const current = await request.get("/characters");
  const saved = await request.put("/characters", {
    headers: { "If-Match": current.headers().etag },
    data,
  });
  expect(saved.status()).toBe(204);
}

/** @param {import("@playwright/test").Locator} viewport */
async function viewCentre(viewport) {
  const [x, y, w, h] = ((await viewport.getAttribute("viewBox")) || "")
    .split(" ")
    .map(Number);
  return [x + w / 2, y + h / 2].map((v) => Math.round(v * 10) / 10);
}

test("the Characters list shows name and level, and choosing one goes to its level centred", async ({
  page,
  request,
}) => {
  const old = await (await request.get("/characters")).json();
  await setRoster(request, {
    characters: [
      {
        id: "list-pc",
        name: "Kiri",
        kind: "pc",
        level: "original",
        at: [2, 1],
        range: 6,
      },
      {
        id: "list-npc",
        name: "Guard",
        kind: "npc",
        level: "below",
        at: [7, 4],
        range: null,
      },
    ],
    pov: null,
  });
  try {
    await page.goto("/?mode=play");
    await expect(page.locator("#viewport")).toHaveAttribute(
      "data-observers",
      /./,
    );
    const toolbar = page.getByRole("toolbar", { name: "Toolbar", exact: true });
    const button = toolbar.getByRole("button", {
      name: "Characters",
      exact: true,
    });
    await button.click();
    const list = page.getByRole("dialog", { name: "Characters" });
    await expect(list).toBeVisible();
    await expect(list).toContainText("Kiri");
    await expect(list).toContainText("Ground");
    await expect(list).toContainText("below");
    await list.getByRole("button", { name: /Guard/ }).click();
    await expect(page).toHaveURL(/level=below/);
    await expect(list).toBeHidden();
    const viewport = page.locator("#viewport");
    await expect(viewport).toHaveAttribute("viewBox", /./);
    await expect.poll(() => viewCentre(viewport)).toEqual([7, 4]);
  } finally {
    await setRoster(request, old);
  }
});

test("M toggles the list, and choosing a character on this level selects and centres it", async ({
  page,
  request,
}) => {
  const old = await (await request.get("/characters")).json();
  await setRoster(request, {
    characters: [
      {
        id: "near-pc",
        name: "Near",
        kind: "pc",
        level: "original",
        at: [6, 3],
        range: 6,
      },
    ],
    pov: null,
  });
  try {
    await page.goto("/?mode=play");
    await expect(page.locator("#viewport")).toHaveAttribute(
      "data-observers",
      /./,
    );
    const list = page.getByRole("dialog", { name: "Characters" });
    await page.keyboard.press("m");
    await expect(list).toBeVisible();
    await page.keyboard.press("m");
    await expect(list).toBeHidden();
    await page.keyboard.press("m");
    await list.getByRole("button", { name: /Near/ }).click();
    await expect(list).toBeHidden();
    await expect(page.locator('[data-character="near-pc"]')).toHaveAttribute(
      "data-selected",
      "true",
    );
    const viewport = page.locator("#viewport");
    expect(await viewCentre(viewport)).toEqual([6, 3]);
  } finally {
    await setRoster(request, old);
  }
});
