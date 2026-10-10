import { test, expect } from "@playwright/test";

test("text search finds names, descriptions and tags and identifies matching levels", async ({
  page,
}) => {
  await page.goto("/library.html");
  const search = page.getByLabel("Search plans and levels");
  await search.fill("locked prison");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("Citadel");
  await expect(
    page.getByRole("link", { name: "Matching level: Detention deck" }),
  ).toBeVisible();
  await search.fill("DETENTION");
  await expect(page.getByRole("article")).toHaveCount(1);
  await search.fill("cargo");
  await expect(
    page.getByRole("link", { name: "Matching level: Stores" }),
  ).toBeVisible();
  await search.fill("fortress");
  await expect(page.getByRole("article")).toHaveCount(1);
  await search.fill("Citadel");
  await expect(page.getByRole("article")).toHaveCount(1);
});

test("all tags must belong to one matching level including inherited plan tags", async ({
  page,
}) => {
  await page.goto("/library.html");
  await page.getByLabel("Required tags").fill("frontier\nprison\nsecure");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("Citadel");
  await expect(
    page.getByRole("link", { name: "Matching level: Detention deck" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Matching level: Stores" }),
  ).toHaveCount(0);
  await page.getByLabel("Search plans and levels").fill("cargo");
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText(
    "No plans match these filters.",
  );
  await page.getByLabel("Required tags").fill("frontier\ncargo");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "Matching level: Stores" }),
  ).toBeVisible();
});

test("authoring and play date ranges combine with text and tags using inclusive UTC days and explicit unknowns", async ({
  page,
  request,
}) => {
  const before = await (await request.get("/plan?plan=citadel")).json();
  await page.goto("/library.html");
  await page.getByLabel("Required tags").fill("frontier");
  await page.getByLabel("Created from", { exact: true }).fill("2025-01-10");
  await page.getByLabel("Created through", { exact: true }).fill("2025-02-15");
  await expect(page.getByRole("article")).toHaveCount(2);
  await page
    .getByLabel("Last edited through", { exact: true })
    .fill("2025-03-20");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("Citadel");
  await page.getByLabel("Last played from", { exact: true }).fill("2025-04-30");
  await page
    .getByLabel("Last played through", { exact: true })
    .fill("2025-04-30");
  await page.getByLabel("Search plans and levels").fill("detention");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("Last played:");
  await page.getByLabel("Last played from", { exact: true }).fill("2025-05-01");
  await expect(page.getByRole("status")).toHaveText(
    "No plans match these filters.",
  );
  await page.getByLabel("Required tags").fill("");
  await page.getByLabel("Search plans and levels").fill("");
  for (const label of [
    "Created from",
    "Created through",
    "Last edited through",
    "Last played from",
    "Last played through",
  ]) {
    await page.getByLabel(label, { exact: true }).fill("");
  }
  await expect(page.getByRole("article")).toHaveCount(5);
  await page.getByLabel("Created through", { exact: true }).fill("2025-01-10");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByLabel("Include unknown dates").check();
  await expect(page.getByRole("article")).toHaveCount(4);
  expect(await (await request.get("/plan?plan=citadel")).json()).toEqual(
    before,
  );
});

test("sort selection orders matching plans by name and known dates with unknown dates last", async ({
  page,
}) => {
  await page.goto("/library.html");
  await page.getByLabel("Required tags").fill("frontier");
  const names = page.getByRole("article").locator("button:first-of-type");
  await page.getByLabel("Sort plans").selectOption("name");
  await expect(names).toHaveText(["Citadel", "Outpost"]);
  for (const sort of ["createdAt", "editedAt", "lastPlayedAt"]) {
    await page.getByLabel("Sort plans").selectOption(sort);
    await expect(names).toHaveText(["Outpost", "Citadel"]);
  }
  await page.getByLabel("Required tags").fill("");
  await expect(names).toHaveText([
    "Outpost",
    "Citadel",
    "Ancient wreck",
    "Depot",
    "Referee building",
  ]);
});
