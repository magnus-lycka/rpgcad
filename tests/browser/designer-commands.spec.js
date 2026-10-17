import { test, expect } from "@playwright/test";

test("Designer tools and Components are discoverable keyboard commands with focus restoration", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await expect(page.locator("#viewport")).toContainText("SECRET");
  await page.keyboard.press("p");
  await expect(page.locator("#pen-tool")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#sketch-status")).toHaveText("Pen");
  await page.keyboard.press("h");
  await expect(page.locator("#pan-tool")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("c");
  await expect(page.locator("#close-components")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#components-tool")).toBeFocused();
  await page.keyboard.press("/");
  const palette = page.getByRole("dialog", { name: "Commands" });
  await palette.getByRole("combobox").fill("Pen");
  await page.keyboard.press("Enter");
  await expect(page.locator("#pen-tool")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#pen-tool")).toHaveAttribute(
    "aria-keyshortcuts",
    "P",
  );
});

test("Designer undo and clear use backward Delete, preserve level and restore exact marks", async ({
  page,
  request,
}) => {
  const marks = [
    [
      [1, 2],
      [3, 4],
    ],
    [[5, 6]],
  ];
  await request.put("/sketch?level=below", { data: { strokes: marks } });
  await page.goto("/?mode=edit&level=below");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await expect(page.locator("#sketch-status")).toHaveText(
    "Drawing mark undone",
  );
  for (const key of ["Backspace", "Delete", "Shift+Delete"]) {
    await page.keyboard.press(key);
    await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  }
  await page.keyboard.press("Shift+Backspace");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(0);
  await expect(page.locator("#sketch-status")).toHaveText(
    "Drawing marks cleared",
  );
  await page.keyboard.press("Meta+z");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await expect(page.locator("#sketch-status")).toHaveText(
    "Cleared drawing marks restored",
  );
  expect(
    (await (await request.get("/sketch?level=below")).json()).strokes,
  ).toEqual([marks[0]]);
  await page.keyboard.press("o");
  await expect(page.locator("#sketch-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(0);
  await expect(page.locator("#sketch-status")).toHaveText(
    "Drawing mark undone",
  );
  await page.keyboard.press("/");
  const palette = page.getByRole("dialog", { name: "Commands" });
  await palette.getByRole("combobox").fill("Undo");
  await expect(palette.getByRole("option")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(palette).toContainText("No drawing marks to undo");
});

test("Designer command guards preserve native fields, ignore repeated clear and isolate Play", async ({
  page,
  request,
}) => {
  const marks = [
    [
      [1, 2],
      [3, 4],
    ],
  ];
  await request.put("/sketch?level=below", { data: { strokes: marks } });
  await page.goto("/?mode=edit&level=below");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await page.keyboard.press("k");
  const input = page.locator("#calibration-mm");
  await input.fill("12");
  await page.keyboard.press("Shift+Backspace");
  await page.keyboard.press("Control+z");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.locator("#viewport").dispatchEvent("keydown", {
    key: "Backspace",
    shiftKey: true,
    repeat: true,
    bubbles: true,
  });
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await page.keyboard.press("Shift+E");
  for (const key of ["p", "h", "c", "o", "Control+z", "Shift+Backspace"])
    await page.keyboard.press(key);
  await expect(page.locator("#component-panel")).toBeHidden();
  await page.keyboard.press("/");
  const palette = page.getByRole("dialog", { name: "Commands" });
  await palette.getByRole("combobox").fill("Clear marks");
  await expect(palette.getByRole("option")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+E");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  expect(
    (await (await request.get("/sketch?level=below")).json()).strokes,
  ).toEqual(marks);
});

test("failed undo preserves marks and reports the persistence error for buttons and shortcuts", async ({
  page,
  request,
}) => {
  const marks = [
    [
      [1, 2],
      [3, 4],
    ],
  ];
  await request.put("/sketch?level=below", { data: { strokes: marks } });
  await page.goto("/?mode=edit&level=below");
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await page.route("**/sketch*", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 500 });
    else await route.continue();
  });
  for (const trigger of [
    () => page.keyboard.press("Control+z"),
    () => page.locator("#undo-stroke").click(),
  ]) {
    await trigger();
    await expect(page.locator("#sketch-status")).toContainText(
      "Marks not saved (500)",
    );
    await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  }
});
