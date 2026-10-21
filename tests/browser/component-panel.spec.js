import { test, expect } from "../fixtures/app-test.js";

test("Designer browses previews and details directly without leaving the drawing", async ({
  page,
}) => {
  await page.goto("/?plan=depot&level=original&mode=edit");
  await expect(page.locator("#viewport")).toHaveAttribute("viewBox", /.+/);
  const address = page.url();
  await page.getByRole("button", { name: "Components", exact: true }).click();
  const catalogue = page.frameLocator('iframe[title="Component catalogue"]');
  await catalogue
    .getByRole("searchbox", { name: "Find components" })
    .fill("loose chair");
  const chair = catalogue.getByRole("article", { name: "Chair", exact: true });
  await expect(chair.getByRole("img", { name: "Chair preview" })).toBeVisible();
  await chair.getByText("Component details", { exact: true }).click();
  await expect(chair.getByText("Dimensions", { exact: true })).toBeVisible();
  await expect(
    chair.getByText("Supported settings", { exact: true }),
  ).toBeVisible();
  await expect(chair.getByText("Placement", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close components" }).click();
  expect(page.url()).toBe(address);
  await expect(
    page.getByRole("button", { name: "Components", exact: true }),
  ).toBeFocused();
});

test("Escape closes component browsing from either frame without changing the design session", async ({
  page,
  request,
}) => {
  const query = "?plan=depot&level=original";
  await request.put(`/sketch${query}`, {
    data: {
      strokes: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
    },
  });
  await page.goto(`/${query}&mode=edit`);
  await expect(page.locator("[data-sketch-stroke]")).toHaveCount(1);
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const view = await page.locator("#viewport").getAttribute("viewBox");
  const before = await (await request.get(`/plan?plan=depot`)).json();
  const sketch = await (await request.get(`/sketch${query}`)).json();
  const model = await (await request.get(`/model${query}`)).json();
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("region", { name: "Component browser" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Components", exact: true }).click();
  const search = page
    .frameLocator('iframe[title="Component catalogue"]')
    .getByRole("searchbox", { name: "Find components" });
  await search.fill("access");
  await search.press("Escape");
  await expect(
    page.getByRole("region", { name: "Component browser" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Components", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Pen", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("#viewport").getAttribute("viewBox")).toBe(view);
  expect(await (await request.get(`/plan?plan=depot`)).json()).toEqual(before);
  expect(await (await request.get(`/sketch${query}`)).json()).toEqual(sketch);
  expect(await (await request.get(`/model${query}`)).json()).toEqual(model);
});

test("component browsing fits a narrow window and disappears for Play and print", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/?plan=depot&level=original&mode=edit");
  await expect(page.locator("#viewport")).toHaveAttribute("viewBox", /.+/);
  await page.getByRole("button", { name: "Components", exact: true }).click();
  const panel = page.getByRole("region", { name: "Component browser" });
  const box = await panel.boundingBox();
  if (!box) throw Error("Component browser has no visible bounds");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.height).toBeLessThan(600);
  await page.emulateMedia({ media: "print" });
  await expect(panel).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(panel).toBeHidden();
  await page.keyboard.press("Shift+E");
  await expect(panel).toBeHidden();
});

test("opening screen calibration replaces the temporary catalogue", async ({
  page,
}) => {
  await page.goto("/?plan=depot&level=original&mode=edit");
  await expect(
    page.getByRole("button", { name: "Calibrate", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await page.getByRole("button", { name: "Calibrate", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Calibrate screen scale" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Component browser" }),
  ).toBeHidden();
});
