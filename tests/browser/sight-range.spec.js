import { test, expect } from "@playwright/test";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";
preserveBrowserFixture(test);

test("default sight range applies to new characters, independently of each saved character range", async ({
  page,
  request,
}) => {
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
          range: 4,
        },
      ],
    },
  });
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  await page.getByRole("button", { name: "Exploration", exact: true }).click();
  const defaultRange = page.getByLabel("Default visual range (m)", {
    exact: true,
  });
  await expect(defaultRange).toBeVisible();
  const observations = (await (await request.get("/exploration")).json())
    .observations;
  await defaultRange.fill("12");
  await defaultRange.dispatchEvent("change");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).defaultRange,
    )
    .toBe(12);
  expect(
    (await (await request.get("/characters")).json()).characters[0].range,
  ).toBe(4);
  expect(
    (await (await request.get("/exploration")).json()).observations,
  ).toEqual(observations);
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  const specificRange = page.getByLabel("Selected character visual range (m)", {
    exact: true,
  });
  await expect(specificRange).toHaveValue("4");
  await specificRange.fill("8");
  await specificRange.dispatchEvent("change");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters[0].range,
    )
    .toBe(8);
  await page.reload();
  await page.keyboard.press("Shift+G");
  await page.getByRole("button", { name: "Exploration", exact: true }).click();
  await expect(defaultRange).toHaveValue("12");
  await page.getByRole("button", { name: "Characters", exact: true }).click();
  await page.getByLabel("Character name").fill("Ben");
  await page.getByRole("button", { name: "Add PC", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters.find(
          (c) => c.name === "Ben",
        )?.range,
    )
    .toBeNull();
  const ben = (await (await request.get("/characters")).json()).characters.find(
    (c) => c.name === "Ben",
  );
  await expect(
    page.getByRole("button", { name: "Add PC", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Character", { exact: true }).selectOption(ben.id);
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /"range":12/,
  );
  expect(
    (await (await request.get("/characters")).json()).characters.find(
      (c) => c.id === "ada",
    ).range,
  ).toBe(8);
});

test("clearing a character override restores inheritance, including after reset and reload", async ({
  page,
  request,
}) => {
  const previous = await request.get("/characters");
  await request.put("/characters", {
    headers: { "If-Match": previous.headers().etag },
    data: {
      defaultRange: 9,
      pov: "ada",
      characters: [
        {
          id: "ada",
          name: "Ada",
          kind: "pc",
          level: "original",
          at: [0, 0],
          range: 4,
        },
      ],
    },
  });
  await page.goto("/?mode=play");
  await page.keyboard.press("Shift+G");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /"range":4/,
  );
  const specific = page.getByLabel("Selected character visual range (m)");
  await specific.fill("");
  await specific.dispatchEvent("change");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).characters[0].range,
    )
    .toBeNull();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /"range":9/,
  );
  await page.getByRole("button", { name: "Exploration", exact: true }).click();
  const inherited = page.getByLabel("Default visual range (m)");
  await inherited.fill("12");
  await inherited.dispatchEvent("change");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observers",
    /"range":12/,
  );
  await page
    .getByRole("button", { name: "Reset fog · close all doors" })
    .click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-observations",
    "0",
  );
  await inherited.fill("15");
  await inherited.dispatchEvent("change");
  await expect
    .poll(
      async () =>
        (await (await request.get("/characters")).json()).defaultRange,
    )
    .toBe(15);
  await page.reload();
  await page.keyboard.press("Shift+G");
  await expect(specific).toHaveValue("");
  await expect(specific).toHaveAttribute("placeholder", "Default: 15 m");
  const saved = await (await request.get("/exploration")).json();
  expect(saved.visibilityPaused).toBe(true);
  expect(saved.observations).toEqual([]);
});
