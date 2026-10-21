import { test, expect } from "../fixtures/app-test.js";

const PANEL = "rgb(38, 39, 43)";

/** @param {import('@playwright/test').Locator} locator */
const style = (locator) =>
  locator.evaluate((element) => {
    const css = getComputedStyle(element);
    return {
      background: css.backgroundColor,
      radius: css.borderTopLeftRadius,
      colour: css.color,
    };
  });

/** Light text on the dark panel: every channel above 180.
 * @param {string} colour */
const light = (colour) =>
  (colour.match(/\d+/g) ?? []).slice(0, 3).every((n) => Number(n) > 180);

test("the toolbar and every popup share one dark panel style", async ({
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
          range: 6,
        },
      ],
    },
  });
  await page.goto("/?mode=play");
  await expect(page.locator('[data-character="ada"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Calibrate", exact: true }),
  ).toBeEnabled();
  const toolbar = await style(page.locator("#toolbar"));
  expect(toolbar.background).toBe(PANEL);

  /** @type {[string, () => Promise<void>, import('@playwright/test').Locator][]} */
  const popups = [
    [
      "character popup",
      async () => {
        await page.locator('[data-character="ada"] circle').dblclick();
      },
      page.getByRole("dialog", { name: "Ada PC" }),
    ],
    [
      "info",
      async () => {
        await page.keyboard.press("i");
      },
      page.getByRole("dialog", { name: "Info" }),
    ],
    [
      "shortcuts",
      async () => {
        await page.keyboard.press("?");
      },
      page.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ],
    [
      "palette",
      async () => {
        await page.keyboard.press("/");
      },
      page.getByRole("dialog", { name: "Commands" }),
    ],
    [
      "calibration",
      async () => {
        await page.keyboard.press("k");
      },
      page.getByRole("dialog", { name: "Calibrate screen scale" }),
    ],
  ];
  for (const [name, open, dialog] of popups) {
    await open();
    await expect(dialog, name).toBeVisible();
    const seen = await style(dialog);
    expect(seen.background, `${name} background`).toBe(PANEL);
    expect(seen.radius, `${name} radius`).toBe("9px");
    expect(light(seen.colour), `${name} text colour ${seen.colour}`).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog, name).toBeHidden();
  }
});
