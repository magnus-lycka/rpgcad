import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { Fog, Geometry } from "../prototype/geometry.js";

/** @param {string} name */
const json = (name) =>
  JSON.parse(
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Fixed prototype file names.
    readFileSync(new URL(`../prototype/${name}`, import.meta.url), "utf8"),
  );
const ground = Geometry.validate(json("model.PROTOTYPE.json"));
const catalogue = json("component-catalogue.json").definitions;
const roof = Geometry.validate({
  ...json("level-roof.PROTOTYPE.json"),
  componentDefinitions: { "iris-valve-down@1": catalogue["iris-valve-down@1"] },
});
const blockedAt = (/** @type {number[]} */ at) =>
  Fog.blockers(roof, {}).polygons.some((p) => Fog.inside(at, p));

test("the plan lists the roof as the level above the ground level", () => {
  for (const file of ["plan.PROTOTYPE.json", "library.PROTOTYPE.json"]) {
    const data = json(file);
    const plan = (data.plans ?? [data]).find(
      (/** @type {{id: string}} */ p) => p.id === "referee-building",
    );
    const level = plan.levels.find(
      (/** @type {{id: string}} */ l) => l.id === "roof",
    );
    assert.equal(level.order, 1, file);
    assert.equal(level.model, "level-roof.PROTOTYPE.json", file);
  }
});

test("the roof has the ground level's four sides as edges, not walls", () => {
  const wallIds = roof.walls.map((w) => w.id);
  for (const id of ["top", "right", "bottom"])
    assert.ok(!wallIds.includes(id), id);
  // They run between the tower walls exactly where the ground level's walls do; the open left side mirrors the right about the building's centre, x 8.625.
  const edges = Object.fromEntries(
    (roof.lines ?? []).map((l) => [l.id, [l.a, l.b]]),
  );
  assert.deepEqual(edges, {
    "roof-edge-top": [
      [1.2, 0],
      [16.05, 0],
    ],
    "roof-edge-right": [
      [17.25, 1.2],
      [17.25, 7.8],
    ],
    "roof-edge-bottom": [
      [16.05, 9],
      [1.2, 9],
    ],
    "roof-edge-left": [
      [0, 7.8],
      [0, 1.2],
    ],
  });
  for (const l of roof.lines ?? []) assert.equal(l.blocksSight, undefined);
});

test("the corner towers keep the ground level's walls, half high so they do not obstruct vision", () => {
  const towers = (/** @type {typeof ground} */ m) =>
    m.walls
      .filter((w) => /^(top|bottom)-(left|right)-/.test(w.id))
      .map((w) => JSON.stringify([w.id, w.a, w.b]))
      .sort();
  assert.deepEqual(towers(roof), towers(ground));
  assert.equal(towers(roof).length, 16);
  for (const w of roof.walls) assert.equal(w.blocksSight, false, w.id);
  assert.equal(blockedAt([0.45, -0.3]), false);
  assert.equal(blockedAt([17.55, 0.45]), false);
  assert.equal(blockedAt([8, 0]), false);
});

test("the roof is floor, surrounded by air beyond its edges", () => {
  for (const at of [
    [8, 4.5],
    [1, 8.5],
    [17, 8.8],
    [0.45, 0.45],
    [-0.1, 0.45],
    [17.4, 8.55],
  ])
    assert.equal(Geometry.terrainAt(roof, at), "floor", `${at}`);
  for (const at of [
    [-1, 4.5],
    [18, 4.5],
    [8, -1],
    [8, 10],
    [-5, -5],
  ])
    assert.equal(Geometry.terrainAt(roof, at), "drop", `${at}`);
});

test("each corner tower has a downward iris valve over the ceiling hatch below", () => {
  const valves = roof.components ?? [];
  assert.equal(valves.length, 4);
  const centres = valves
    .map((v) => {
      assert.equal(v.definition, "iris-valve-down@1", v.id);
      const [x, y] = v.at ?? [NaN, NaN];
      return [x + 0.5, y + 0.5];
    })
    .sort();
  const hatches = (ground.circles ?? [])
    .filter((c) => /ceiling-hatch/.test(c.id))
    .map((c) => c.at)
    .sort();
  assert.deepEqual(centres, hatches);
});

test("a two-barrel missile rack stands mid-roof, open at the -X end", () => {
  const tubes = (roof.outlines ?? []).filter((o) => /^rack-barrel/.test(o.id));
  assert.equal(tubes.length, 2);
  for (const t of tubes) {
    assert.ok(t.width > t.height, `${t.id} is longer in X than in Y`);
    assert.deepEqual([...(t.sides ?? [])].sort(), ["bottom", "right", "top"]);
  }
  const x0 = Math.min(...tubes.map((t) => t.at[0])),
    x1 = Math.max(...tubes.map((t) => t.at[0] + t.width)),
    y0 = Math.min(...tubes.map((t) => t.at[1])),
    y1 = Math.max(...tubes.map((t) => t.at[1] + t.height));
  // The building's centre is x 8.625, y 4.5.
  assert.ok(Math.abs((x0 + x1) / 2 - 8.625) < 0.75, "centred in X");
  assert.ok(Math.abs((y0 + y1) / 2 - 4.5) < 0.01, "centred in Y");
});
