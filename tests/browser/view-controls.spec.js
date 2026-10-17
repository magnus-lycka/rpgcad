import { test, expect } from "@playwright/test";

test("calibration waits for the plan's initial view before offering a ruler", async ({
  page,
}) => {
  let release;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/model*", async (route) => {
    await ready;
    await route.continue();
  });
  try {
    await page.goto("/?mode=edit");
    await expect(
      page.getByRole("button", { name: "Calibrate", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(
    page.getByRole("button", { name: "Calibrate", exact: true }),
  ).toBeEnabled();
});

test("edit starts in Pan with a hand; choosing Pen supplies a pen cursor", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  await expect(
    page.getByRole("button", { name: "Pan", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#viewport")).toHaveCSS("cursor", "grab");
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await expect(page.locator("#viewport")).toHaveCSS("cursor", /url\(/);
});

test("calibrating five squares measured at 80 mm to 1:75 magnifies by 125 percent", async ({
  page,
  request,
}) => {
  const original = await (await request.get("/model")).json();
  await page.goto("/?mode=edit");
  const viewport = page.locator("#viewport");
  await expect(viewport).toContainText("SECRET");
  const width = () =>
    viewport.evaluate((svg) =>
      Number((svg.getAttribute("viewBox") || "").split(" ")[2]),
    );
  const initial = await width();
  await expect(
    page.getByRole("button", { name: "Calibrate", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Calibrate", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Calibrate screen scale" }),
  ).toBeVisible();
  await expect(
    page.getByText("5 grid squares · 7.5 m", { exact: true }),
  ).toBeVisible();
  const rulerWidth = await page
    .locator("#calibration-ruler")
    .evaluate((ruler) => ruler.getBoundingClientRect().width);
  expect(rulerWidth).toBeCloseTo((1200 * 7.5) / initial, 0);
  await page.getByLabel("Measured length (mm)").fill("80");
  await page.getByLabel("Scale 1:", { exact: true }).fill("75");
  await page.getByRole("button", { name: "Apply scale", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(await width()).toBeCloseTo(initial * 0.8);
  await expect(page.getByLabel("Zoom percentage", { exact: true })).toHaveValue(
    "100",
  );
  await expect(page.getByLabel("Scale", { exact: true })).toHaveText("1:75");
  await page.locator("#viewport").focus();
  await page.keyboard.press("+");
  await expect(page.getByLabel("Zoom percentage", { exact: true })).toHaveValue(
    "125",
  );
  expect(await (await request.get("/model")).json()).toEqual(original);
});

test("zoom buttons magnify the drawing and Fit restores its extent", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  const viewport = page.locator("#viewport");
  await expect(viewport).toContainText("SECRET");
  const width = () =>
    viewport.evaluate((svg) =>
      Number((svg.getAttribute("viewBox") || "").split(" ")[2]),
    );
  const initial = await width();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect(await width()).toBeCloseTo(initial * 0.8);
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  expect(await width()).toBeCloseTo(initial);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Fit plan", exact: true }).click();
  expect(await width()).toBeCloseTo(initial);
});

test("entering a zoom percentage uses the calibrated scale in Edit and Play", async ({
  page,
}) => {
  await page.goto("/?mode=edit");
  const viewport = page.locator("#viewport");
  await expect(viewport).toContainText("SECRET");
  await viewport.focus();
  await page.keyboard.press("k");
  await page.getByLabel("Measured length (mm)").fill("80");
  await page.getByLabel("Scale 1:", { exact: true }).fill("75");
  await page.getByRole("button", { name: "Apply scale", exact: true }).click();
  const width = () =>
    viewport.evaluate((svg) =>
      Number((svg.getAttribute("viewBox") || "").split(" ")[2]),
    );
  const calibrated = await width();
  await viewport.focus();
  await page.keyboard.press("z");
  const input = page.getByRole("spinbutton", {
    name: "Zoom percentage",
    exact: true,
  });
  await expect(input).toBeFocused();
  await input.fill("10");
  await input.press("ArrowLeft");
  await expect(input).toBeFocused();
  await input.press("Enter");
  expect(await width()).toBeCloseTo(calibrated * 10);
  await expect(input).toHaveValue("10");
  await input.fill("100");
  await input.press("Enter");
  expect(await width()).toBeCloseTo(calibrated);
  await viewport.focus();
  await page.keyboard.press("Shift+E");
  await page.keyboard.press("z");
  await expect(input).toBeFocused();
  await input.fill("25");
  await input.press("Enter");
  expect(await width()).toBeCloseTo(calibrated * 4);
  await expect(input).toHaveValue("25");
});
