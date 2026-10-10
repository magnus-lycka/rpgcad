import { readFileSync } from "node:fs";
import { preserveBrowserFixture } from "../fixtures/browser-state.js";
import { test, expect } from "@playwright/test";

preserveBrowserFixture(test);

const furnitureDefinitions = JSON.parse(
  readFileSync("prototype/component-catalogue.json", "utf8"),
).definitions;

test("agent places independent off-grid furniture and reopens its authored drawing", async ({
  page,
  request,
}) => {
  const copy = await (await request.post("/duplicate?plan=depot")).json();
  const query = `?plan=${copy.id}&level=${copy.levels[0].id}`;
  const model = await (await request.get(`/model${query}`)).json();
  model.componentDefinitions = structuredClone(furnitureDefinitions);
  model.components = [
    {
      id: "bed-a",
      definition: "bed@1",
      at: [1.13, 2.27],
      rotation: 90,
      settings: { width: 1.2, length: 2.2 },
    },
    { id: "bed-b", definition: "bed@1", at: [4, 2], rotation: 0 },
    { id: "chair-a", definition: "chair@1", at: [3.2, 5.1], rotation: 30 },
  ];
  expect((await request.put(`/model${query}`, { data: model })).status()).toBe(
    204,
  );
  await page.goto(`/${query}&mode=edit`);
  await expect(page.locator("#viewport [data-component]")).toHaveCount(3);
  const bed = page.locator('#viewport [data-component="bed-a"]');
  await expect(bed).toHaveAttribute(
    "transform",
    "translate(1.13 2.27) rotate(90)",
  );
  await expect(bed.locator("rect").first()).toHaveAttribute("width", "1.2");
  await expect(bed.locator("rect").first()).toHaveAttribute("height", "2.2");
  await page.reload();
  await expect(page.locator("#viewport [data-component]")).toHaveCount(3);
  await page.goto(`/library.html?plan=${copy.id}`);
  await expect(
    page.locator('svg[data-thumbnail] [data-component="chair-a"]'),
  ).toHaveCount(1);
});

test("saved definitions and sibling instances stay isolated from catalogue revisions and plan copies", async ({
  page,
  request,
}) => {
  const source = await (await request.post("/duplicate?plan=depot")).json();
  const sourceQuery = `?plan=${source.id}&level=${source.levels[0].id}`;
  const model = await (await request.get(`/model${sourceQuery}`)).json();
  const catalogue = {
    id: "bed",
    version: 1,
    name: "Bed",
    family: "bed",
    defaults: { width: 0.9, length: 2 },
    details: { headDepth: 0.3 },
    blocksSight: false,
  };
  model.componentDefinitions = { "bed@1": structuredClone(catalogue) };
  model.components = [
    { id: "left-bed", definition: "bed@1", at: [1, 1], rotation: 0 },
    { id: "right-bed", definition: "bed@1", at: [3, 1], rotation: 0 },
  ];
  expect(
    (await request.put(`/model${sourceQuery}`, { data: model })).status(),
  ).toBe(204);
  catalogue.defaults.width = 1.7;
  const duplicate = await (
    await request.post(`/duplicate?plan=${source.id}`)
  ).json();
  const copyQuery = `?plan=${duplicate.id}&level=${duplicate.levels[0].id}`;
  const copyModel = await (await request.get(`/model${copyQuery}`)).json();
  copyModel.components[0].settings = { width: 1.3 };
  copyModel.componentDefinitions["bed@1"].details.headDepth = 0.2;
  expect(
    (await request.put(`/model${copyQuery}`, { data: copyModel })).status(),
  ).toBe(204);
  await page.goto(`/${copyQuery}&mode=edit`);
  await expect(
    page.locator('#viewport [data-component="left-bed"] rect').first(),
  ).toHaveAttribute("width", "1.3");
  await expect(
    page.locator('#viewport [data-component="right-bed"] rect').first(),
  ).toHaveAttribute("width", "0.9");
  await page.goto(`/${sourceQuery}&mode=edit`);
  await expect(
    page.locator('#viewport [data-component="left-bed"] rect').first(),
  ).toHaveAttribute("width", "0.9");
  const savedPlan = await (await request.get(`/plan?plan=${source.id}`)).json();
  expect(Object.keys(savedPlan.componentDefinitions)).toEqual(["bed@1"]);
  expect(savedPlan.componentDefinitions["bed@1"].details.headDepth).toBe(0.3);
  expect(savedPlan.lastPlayedAt).toBeNull();
  expect(savedPlan.editedAt).not.toBeNull();
  expect(savedPlan.levels[0].editedAt).toBe(savedPlan.editedAt);
});

test("a plan save cannot remove another level's definition and unused definitions do not date that level", async ({
  request,
}) => {
  const copy = await (await request.post("/duplicate?plan=default")).json();
  const firstQuery = `?plan=${copy.id}&level=${copy.levels[0].id}`;
  const lowerQuery = `?plan=${copy.id}&level=${copy.levels[1].id}`;
  const first = await (await request.get(`/model${firstQuery}`)).json();
  first.componentDefinitions = {
    "bed@1": {
      id: "bed",
      version: 1,
      name: "Bed",
      family: "bed",
      defaults: { width: 0.9, length: 2 },
      details: { headDepth: 0.3 },
      blocksSight: false,
    },
  };
  first.components = [
    { id: "bed", definition: "bed@1", at: [0, 0], rotation: 0 },
  ];
  expect(
    (await request.put(`/model${firstQuery}`, { data: first })).status(),
  ).toBe(204);
  const lower = await (await request.get(`/model${lowerQuery}`)).json();
  lower.componentDefinitions = {};
  expect(
    (await request.put(`/model${lowerQuery}`, { data: lower })).status(),
  ).toBe(400);
  const before = await (await request.get(`/plan?plan=${copy.id}`)).json();
  first.componentDefinitions["unused@1"] = {
    ...first.componentDefinitions["bed@1"],
    id: "unused",
  };
  expect(
    (await request.put(`/model${firstQuery}`, { data: first })).status(),
  ).toBe(204);
  const after = await (await request.get(`/plan?plan=${copy.id}`)).json();
  expect(after.levels[1].editedAt).toBe(before.levels[1].editedAt);
  expect(after.levels[0].editedAt).toBe(before.levels[0].editedAt);
});

test("invalid furniture edits retain the last valid authored plan", async ({
  request,
}) => {
  const copy = await (await request.post("/duplicate?plan=depot")).json();
  const query = `?plan=${copy.id}&level=${copy.levels[0].id}`;
  const before = await (await request.get(`/model${query}`)).json();
  const invalid = structuredClone(before);
  invalid.componentDefinitions = {
    "chair@1": {
      id: "chair",
      version: 1,
      name: "Chair",
      family: "chair",
      defaults: { width: 0.5, length: 0.5 },
      details: { headDepth: 0.1 },
      blocksSight: false,
    },
  };
  invalid.components = [
    {
      id: "chair",
      definition: "chair@1",
      at: [0.13, 2.27],
      rotation: 0,
      settings: { width: -1 },
    },
  ];
  expect(
    (await request.put(`/model${query}`, { data: invalid })).status(),
  ).toBe(400);
  expect(await (await request.get(`/model${query}`)).json()).toEqual(before);
});

test("drawing feedback retains the exact furniture appearance supplied to the agent", async ({
  request,
}) => {
  const copy = await (await request.post("/duplicate?plan=depot")).json();
  const query = `?plan=${copy.id}&level=${copy.levels[0].id}`;
  const model = await (await request.get(`/model${query}`)).json();
  model.componentDefinitions = {
    "bed@1": {
      id: "bed",
      version: 1,
      name: "Bed",
      family: "bed",
      defaults: { width: 0.9, length: 2 },
      details: { headDepth: 0.3 },
      blocksSight: false,
    },
  };
  model.components = [
    { id: "bed", definition: "bed@1", at: [0, 0], rotation: 0 },
  ];
  expect((await request.put(`/model${query}`, { data: model })).status()).toBe(
    204,
  );
  expect(
    (
      await request.put(`/sketch${query}`, {
        data: {
          strokes: [
            [
              [0.13, 0.17],
              [0.31, 0.29],
            ],
          ],
        },
      })
    ).status(),
  ).toBe(204);
  const feedback = await (await request.get(`/sketch${query}`)).json();
  expect(feedback.model.componentDefinitions).toEqual(
    model.componentDefinitions,
  );
  expect(feedback.model.components).toEqual(model.components);
});
