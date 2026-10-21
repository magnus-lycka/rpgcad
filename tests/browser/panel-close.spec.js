import { test, expect } from "../fixtures/app-test.js";

const panels = [
  ["Info", "i", "dialog"],
  ["Keyboard shortcuts", "?", "dialog"],
  ["Commands", "/", "dialog"],
  ["Levels", "l", "dialog"],
  ["Characters", "m", "dialog"],
];

for (const [name, key] of panels) {
  test(`${name} closes with an × in its corner and has no Close text button`, async ({
    page,
  }) => {
    await page.goto("/?mode=play");
    await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
    await page.keyboard.press(key);
    const panel = page.getByRole("dialog", { name, exact: true });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Close", exact: true }),
    ).toBeVisible();
    await expect(panel.getByText("Close", { exact: true })).toHaveCount(0);
    const x = await panel
      .getByRole("button", { name: "Close", exact: true })
      .boundingBox();
    const box = await panel.boundingBox();
    if (!x || !box) throw Error("Panel has no bounds");
    expect(x.x + x.width).toBeGreaterThan(box.x + box.width - 40);
    expect(x.y).toBeLessThan(box.y + 40);
    await panel.getByRole("button", { name: "Close", exact: true }).click();
    await expect(panel).toBeHidden();
  });
}

test("the Components panel is dark and closes with ×", async ({ page }) => {
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport pattern")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Components", exact: true }).click();
  const panel = page.locator("#component-panel");
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(
    "rgb(38, 39, 43)",
  );
  await panel.getByRole("button", { name: "Close components" }).click();
  await expect(panel).toBeHidden();
});

for (const path of ["/library.html", "/components.html"]) {
  test(`${path} uses the dark panel palette`, async ({ page }) => {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe("rgb(27, 28, 31)");
  });
}
