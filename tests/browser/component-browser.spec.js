import { test, expect } from "@playwright/test";

test("Referee finds original usable component previews and placement descriptions from the library", async ({
  page,
}) => {
  await page.goto("/library.html");
  await page.getByRole("link", { name: "Component catalogue" }).click();
  await page.getByRole("searchbox", { name: "Find components" }).fill("bed");
  const card = page.getByRole("article", { name: "Single bed" });
  await expect(card).toBeVisible();
  await expect(
    card.getByRole("img", { name: "Single bed preview" }),
  ).toBeVisible();
  await expect(card).toContainText("bed@1");
  await expect(card).toContainText("1 × 2.25 m");
  await expect(card).toContainText("proposed");
  await expect(card).toContainText("head-left corner");
  await expect(card).toContainText("Positive metre width");
  await expect(card).toContainText("Original RPGCAD");
  await expect(card).toContainText("AGPL-3.0-only");
  await expect(card).toContainText("CC BY-NC 4.0");
});

// Characterisation of bounded browser discovery and unchanged drawing navigation.
test("search and exact component links survive reopening without adding play controls", async ({
  page,
}) => {
  await page.goto("/components.html?q=loose%20chair");
  const chair = page.getByRole("article", { name: "Chair", exact: true });
  await expect(chair).toContainText("exact-alias");
  await page.reload();
  await expect(page.getByRole("searchbox")).toHaveValue("loose chair");
  await chair.getByRole("link", { name: "Chair", exact: true }).click();
  await expect(page).toHaveURL(/definition=chair%401/);
  await expect(chair).toContainText("chair@1");
  await page.getByRole("searchbox").fill("no such usable component");
  await expect(page.getByRole("status")).toContainText(
    "No matching components",
  );
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.goto("/?mode=play");
  await expect(
    page.getByRole("link", { name: "Component catalogue" }),
  ).toHaveCount(0);
  await expect(page.locator("#viewport pattern").first()).toHaveAttribute(
    "width",
    "1.5",
  );
});

test("catalogue guidance describes physical properties in readable language", async ({
  page,
}) => {
  await page.goto("/components.html?q=bed");
  const bed = page.getByRole("article", { name: "Single bed" });
  await expect(bed).toContainText("Blocks sight: No");
  await expect(bed).toContainText("Source dimensions: unknown");
  await expect(page.getByRole("status")).toContainText("1 component ·");
});

// Cross-slice characterisation: attachment metadata uses the generic preview path.
test("catalogue previews the attached wall door and ceiling hatch with their settings", async ({
  page,
}) => {
  await page.goto("/components.html");
  const door = page.getByRole("article", { name: "Wall door", exact: true });
  await expect(door.getByRole("img")).toBeVisible();
  await expect(door.locator("[data-wall]")).toHaveCount(0);
  await expect(door).toContainText("door@1");
  await expect(door.getByText("None", { exact: true })).toBeVisible();
  await expect(door).not.toContainText("Preview unavailable");
  const hatch = page.getByRole("article", {
    name: "Ceiling hatch",
    exact: true,
  });
  await expect(hatch.getByRole("img")).toBeVisible();
  await expect(hatch).toContainText("ceiling-hatch@1");
  await expect(hatch.locator("svg text")).toHaveCount(0);
  await expect(hatch).toContainText("up-down");
  await expect(hatch).toContainText("open");
  await expect(hatch).not.toContainText("Preview unavailable");
});

// Integrated-family characterisation: generic catalogue renderer supports equipment.
test("catalogue renders console stations with usable guidance and omits rejected machinery", async ({
  page,
}) => {
  await page.goto("/components.html");
  const console = page.getByRole("article", {
    name: "Crew console",
    exact: true,
  });
  await expect(console.getByRole("img")).toBeVisible();
  await expect(console.locator("[data-console-seat]")).toHaveCount(1);
  await expect(console).toContainText("Seat count");
  await expect(console).not.toContainText("Preview unavailable");
  const machine = page.getByRole("article", {
    name: "Service machinery",
    exact: true,
  });
  await expect(machine).toHaveCount(0);
});
