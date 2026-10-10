import { test, expect } from "@playwright/test";

test("standard bed uses the Referee's metre footprint", async ({ request }) => {
  const response = await request.get("/components?definition=bed%401");
  const { entries } = await response.json();
  expect(entries[0].definition.defaults).toMatchObject({
    width: 1,
    length: 2.25,
  });
});

test("the rejected generic machinery is absent from the usable catalogue", async ({
  request,
}) => {
  const response = await request.get("/components?q=machinery");
  expect((await response.json()).total).toBe(0);
});

test("both hinged hatches and iris valves have usable up, down and through variants", async ({
  request,
}) => {
  const response = await request.get("/components?q=access");
  const { entries } = await response.json();
  const directions = entries
    .filter(({ definition }) =>
      ["ceiling-hatch", "iris-valve"].includes(definition.family),
    )
    .map(({ definition }) => [definition.family, definition.defaults.direction])
    .sort();
  expect(directions).toEqual([
    ["ceiling-hatch", "down"],
    ["ceiling-hatch", "up"],
    ["ceiling-hatch", "up-down"],
    ["iris-valve", "down"],
    ["iris-valve", "up"],
    ["iris-valve", "up-down"],
  ]);
});

test("wall door preview reserves only the opening width", async ({
  request,
}) => {
  const { entries } = await (
    await request.get("/components?definition=door%401")
  ).json();
  expect(entries[0].definition.preview.walls[0].b).toEqual([1, 0]);
  expect(entries[0].definition.preview.openings[0].offset).toBe(0);
});
