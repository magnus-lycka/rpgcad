import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { Fog, Geometry } from "../prototype/geometry.js";

/** @param {object} [terrain] */
const make = (terrain) =>
  Geometry.validate({
    wallThickness: 0.15,
    walls: [],
    openings: [],
    labels: [],
    ...(terrain ? { terrain } : {}),
  });
const square = (x, y, s) => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];

test("a level without terrain is floor everywhere", () => {
  assert.equal(Geometry.terrainAt(make(), [5, 5]), "floor");
});

test("the level default applies outside every area, and the last containing area wins", () => {
  const m = make({
    default: "solid",
    areas: [
      { id: "hall", kind: "floor", points: square(0, 0, 10) },
      { id: "shaft", kind: "drop", points: square(4, 4, 2) },
    ],
  });
  assert.equal(Geometry.terrainAt(m, [20, 20]), "solid");
  assert.equal(Geometry.terrainAt(m, [1, 1]), "floor");
  assert.equal(Geometry.terrainAt(m, [5, 5]), "drop");
});

test("terrain is validated strictly", () => {
  const bad = [
    { default: "lava" },
    { default: 3 },
    { areas: [{ id: "a", kind: "mud", points: square(0, 0, 1) }] },
    {
      areas: [
        {
          id: "a",
          kind: "floor",
          points: [
            [0, 0],
            [1, 1],
          ],
        },
      ],
    },
    {
      areas: [
        {
          id: "a",
          kind: "floor",
          points: [
            [0, 0],
            [1, 1],
            ["x", 2],
          ],
        },
      ],
    },
    { areas: [{ kind: "floor", points: square(0, 0, 1) }] },
    {
      areas: [
        { id: "a", kind: "floor", points: square(0, 0, 1) },
        { id: "a", kind: "drop", points: square(2, 2, 1) },
      ],
    },
    { areas: "everywhere" },
  ];
  for (const terrain of bad)
    assert.throws(() => make(terrain), Error, JSON.stringify(terrain));
});

test("an area id may not collide with another object's id", () => {
  assert.throws(() =>
    Geometry.validate({
      wallThickness: 0.15,
      walls: [{ id: "x", a: [0, 0], b: [1, 0] }],
      openings: [],
      labels: [],
      terrain: { areas: [{ id: "x", kind: "drop", points: square(0, 0, 1) }] },
    }),
  );
});

const bounds = { x: -5, y: -5, w: 30, h: 30 };
const level = make({
  default: "solid",
  areas: [
    { id: "hall", kind: "floor", points: square(0, 0, 10) },
    { id: "shaft", kind: "drop", points: square(4, 4, 2) },
  ],
});

test("a level without terrain draws no terrain at all", () => {
  assert.ok(!Geometry.scene(make(), bounds).includes("data-terrain"));
});

test("a non-floor default is one pattern-filled rectangle over the whole view, not many lines", () => {
  const svg = Geometry.scene(level, bounds);
  const base = svg.match(/<rect data-terrain="solid"[^>]*>/)?.[0] ?? "";
  assert.match(base, /x="-5" y="-5" width="30" height="30"/);
  assert.match(base, /fill="url\(#grid-solid\)"/);
  assert.equal(svg.match(/<pattern id="grid-solid"/g)?.length, 1);
  assert.ok(svg.length < 6000, `compact (${svg.length} bytes)`);
});

test("areas paint in order over the default: floor clears it, a drop has its own pattern", () => {
  const svg = Geometry.scene(level, bounds);
  const hall = svg.indexOf('data-terrain-area="hall"'),
    shaft = svg.indexOf('data-terrain-area="shaft"');
  assert.ok(svg.indexOf('data-terrain="solid"') < hall && hall < shaft);
  const tag = (id) =>
    svg
      .split("<")
      .find((part) => part.startsWith(`polygon data-terrain-area="${id}"`));
  assert.match(tag("hall") ?? "", /data-terrain-kind="floor"[^>]*fill="white"/);
  assert.match(tag("shaft") ?? "", /fill="url\(#grid-drop\)"/);
  assert.notEqual(
    svg.match(/<pattern id="grid-drop".*?<\/pattern>/)?.[0],
    svg.match(/<pattern id="grid-solid".*?<\/pattern>/)?.[0],
  );
});

test("the grid is drawn over the terrain so it stays readable", () => {
  const svg = Geometry.scene(level, bounds),
    shaft = svg.indexOf('data-terrain-area="shaft"'),
    grid = svg.indexOf('fill="url(#grid)"');
  assert.ok(shaft >= 0 && grid > shaft);
});

test("blueprint terrain is a dimmed white, not the bright linework colour", () => {
  const blue = Geometry.scene(level, bounds, { theme: "blueprint" });
  for (const kind of ["solid", "drop"])
    assert.match(patternOf(blue, kind), /stroke="#7fa3d6"/, kind);
});

test("terrain follows the theme", () => {
  const light = Geometry.scene(level, bounds),
    blue = Geometry.scene(level, bounds, { theme: "blueprint" });
  assert.match(blue, /data-terrain-kind="floor"[^>]*fill="#1c4f8f"/);
  assert.notEqual(
    light.match(/<pattern id="grid-solid".*?<\/pattern>/)?.[0],
    blue.match(/<pattern id="grid-solid".*?<\/pattern>/)?.[0],
  );
});

test("an observer on solid ground reveals nothing; one on floor inside the solid sees normally", () => {
  const model = make({
    default: "solid",
    areas: [{ id: "hall", kind: "floor", points: square(0, 0, 10) }],
  });
  const seen = (at, revision) =>
    Fog.region({ at, range: 4, doors: {}, revision }, model);
  const buried = seen([20, 20], "buried");
  assert.deepEqual(buried.polygon, []);
  assert.deepEqual(buried.edges, []);
  const inHall = seen([5, 5], "hall");
  assert.equal(Fog.inside([6, 5], inHall.polygon), true);
});

test("a drop does not stop an observer seeing, and a level without terrain sees as before", () => {
  const model = make({
    areas: [{ id: "shaft", kind: "drop", points: square(4, 4, 2) }],
  });
  const region = Fog.region(
    { at: [5, 5], range: 4, doors: {}, revision: "drop" },
    model,
  );
  assert.equal(Fog.inside([6, 5], region.polygon), true);
});

test("the drawing's extent includes terrain areas, but not the unbounded default", () => {
  const b = Geometry.bounds(
    Geometry.validate({
      wallThickness: 0.15,
      walls: [{ id: "w", a: [0, 0], b: [3, 0] }],
      openings: [],
      labels: [],
      terrain: {
        default: "solid",
        areas: [{ id: "pit", kind: "drop", points: square(10, 4, 2) }],
      },
    }),
  );
  assert.ok(b.x <= 0 && b.x + b.w >= 12 && b.y + b.h >= 6, JSON.stringify(b));
  assert.ok(b.w < 20);
});

/** @param {string} svg @param {string} kind */
const patternOf = (svg, kind) => {
  const start = svg.indexOf(`<pattern id="grid-${kind}"`);
  return start < 0 ? "" : svg.slice(start, svg.indexOf("</pattern>", start));
};

test("terrain patterns are linework only, with no fill colour, so they print black on white", () => {
  const svg = Geometry.scene(level, bounds);
  for (const kind of ["solid", "drop"]) {
    const pattern = patternOf(svg, kind);
    assert.ok(pattern, kind);
    assert.ok(!pattern.includes("<rect"), `${kind} has no background`);
    assert.match(pattern, /fill="none"/);
    assert.match(pattern, /stroke="#808080"/, `${kind} is mid grey`);
    const width = Number(pattern.match(/stroke-width="([\d.]+)"/)?.[1]);
    assert.ok(width <= 0.02, `${kind} strokes are thin (${width} m)`);
  }
  const hatch = svg.match(/<rect data-terrain="solid"[^>]*>/)?.[0] ?? "";
  assert.ok(!/#cbd2ce/.test(svg), "never the fog colour");
  assert.match(hatch, /fill="url\(#grid-solid\)"/);
});

test("an area of solid or drop first clears what lies beneath it to the sheet colour", () => {
  const svg = Geometry.scene(level, bounds);
  const points = square(4, 4, 2)
    .map((p) => p.join(","))
    .join(" ");
  const at = svg.indexOf(`<polygon points="${points}" fill="white"/>`);
  assert.ok(at >= 0);
  assert.ok(at < svg.indexOf('data-terrain-area="shaft"'));
});

test("solid ground is hatched in many separate sections at differing angles, and sparsely", () => {
  const d =
    patternOf(Geometry.scene(level, bounds), "solid").match(
      / d="([^"]+)"/,
    )?.[1] ?? "";
  const strokes = [
    ...d.matchAll(/M ([-\d.]+) ([-\d.]+) L ([-\d.]+) ([-\d.]+)/g),
  ].map(([, ...numbers]) => {
    const [x1, y1, x2, y2] = numbers.map(Number);
    const degrees = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    return {
      angle: ((Math.round(degrees / 5) * 5) % 180) + (degrees < 0 ? 180 : 0),
      exact: ((degrees % 180) + 180) % 180,
      length: Math.hypot(x2 - x1, y2 - y1),
    };
  });
  assert.ok(strokes.length >= 60 && strokes.length <= 200, `${strokes.length}`);
  assert.ok(new Set(strokes.map((s) => s.angle)).size >= 8, "many angles");
  assert.ok(
    strokes.every((s) => s.length < 2.5),
    "short strokes, not rules",
  );
  const axisOffset = (degrees) => Math.min(degrees % 90, 90 - (degrees % 90));
  assert.ok(
    strokes.every((s) => axisOffset(s.exact) >= 15),
    "no stroke within 15 degrees of horizontal or vertical",
  );
  const ink = strokes.reduce((sum, s) => sum + s.length, 0);
  // The tile is 6 m by 6 m; under 4 m of line per square metre is sparse.
  assert.ok(ink < 4 * 36, `${ink.toFixed(1)} m of ink`);
});

/** @param {Record<string, any>} [parts] @param {string} [base] */
const walled = (parts = {}, base = "solid") =>
  Geometry.validate({
    wallThickness: 0.15,
    openings: [],
    labels: [],
    walls: [],
    terrain: { default: base, ...(parts.terrain ?? {}) },
    ...parts,
  });
/** Four wall segments around a rectangle, id-prefixed.
 * @param {string} id @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 */
const room = (id, x0, y0, x1, y1) => [
  { id: `${id}-n`, a: [x0, y0], b: [x1, y0] },
  { id: `${id}-e`, a: [x1, y0], b: [x1, y1] },
  { id: `${id}-s`, a: [x1, y1], b: [x0, y1] },
  { id: `${id}-w`, a: [x0, y1], b: [x0, y0] },
];

test("a space enclosed by walls is floor and the default applies outside, with no stored areas", () => {
  const m = walled({ walls: room("hall", 0, 0, 6, 4) });
  assert.equal(Geometry.terrainAt(m, [3, 2]), "floor");
  assert.equal(Geometry.terrainAt(m, [8, 2]), "solid");
  assert.equal(Geometry.terrainAt(m, [3, -2]), "solid");
});

test("a door or open gap in a wall does not make its room solid", () => {
  const m = walled({
    walls: room("hall", 0, 0, 6, 4),
    openings: [
      { id: "d", wall: "hall-n", offset: 1, width: 2, type: "single-closed" },
      { id: "gap", wall: "hall-e", offset: 1, width: 1.5 },
    ],
  });
  assert.equal(Geometry.terrainAt(m, [3, 2]), "floor");
  assert.equal(Geometry.terrainAt(m, [8, 2]), "solid");
});

test("a space that is not closed on every side is outside, so close it with a wall", () => {
  const m = walled({ walls: room("hall", 0, 0, 6, 4).slice(0, 3) });
  assert.equal(Geometry.terrainAt(m, [3, 2]), "solid");
});

test("a corridor joined to a room mid-wall (a T junction) is floor too", () => {
  const m = walled({
    walls: [
      ...room("hall", 0, 0, 6, 4),
      { id: "c-top", a: [6, 1], b: [12, 1] },
      { id: "c-bottom", a: [6, 2.5], b: [12, 2.5] },
      { id: "c-end", a: [12, 1], b: [12, 2.5] },
    ],
  });
  assert.equal(Geometry.terrainAt(m, [9, 1.75]), "floor");
  assert.equal(Geometry.terrainAt(m, [9, 3.5]), "solid");
  assert.equal(Geometry.terrainAt(m, [3, 2]), "floor");
});

test("collinear and duplicated walls, dangling walls and inner walls change nothing", () => {
  const m = walled({
    walls: [
      ...room("hall", 0, 0, 6, 4),
      { id: "dup", a: [0, 0], b: [6, 0] },
      { id: "part", a: [2, 4], b: [4, 4] },
      { id: "dangling", a: [3, 2], b: [3, 3] },
      { id: "divider", a: [3, 0], b: [3, 4] },
    ],
  });
  for (const at of [
    [1, 2],
    [5, 2],
    [4.5, 3.5],
  ])
    assert.equal(Geometry.terrainAt(m, at), "floor", `${at}`);
  assert.equal(Geometry.terrainAt(m, [3, 5]), "solid");
});

test("walls enclosing an island inside a room leave the island floor", () => {
  const m = walled({
    walls: [...room("hall", 0, 0, 10, 8), ...room("lift", 4, 3, 6, 5)],
  });
  assert.equal(Geometry.terrainAt(m, [5, 4]), "floor");
  assert.equal(Geometry.terrainAt(m, [2, 2]), "floor");
});

test("explicit areas still override the derived floor, in either direction", () => {
  const m = walled({
    walls: room("hall", 0, 0, 10, 8),
    terrain: {
      areas: [
        { id: "pit", kind: "drop", points: square(2, 2, 2) },
        { id: "pillar", kind: "solid", points: square(6, 3, 1) },
        { id: "annex", kind: "floor", points: square(12, 0, 3) },
      ],
    },
  });
  assert.equal(Geometry.terrainAt(m, [3, 3]), "drop");
  assert.equal(Geometry.terrainAt(m, [6.5, 3.5]), "solid");
  assert.equal(Geometry.terrainAt(m, [13, 1]), "floor");
  assert.equal(Geometry.terrainAt(m, [8, 6]), "floor");
});

test("with floor as the default, walls change nothing", () => {
  const m = walled({ walls: room("hall", 0, 0, 6, 4) }, "floor");
  assert.equal(Geometry.terrainAt(m, [8, 2]), "floor");
});

test("enclosed spaces are drawn by clearing the rock to the sheet, not by stored areas", () => {
  const svg = Geometry.scene(
    walled({ walls: room("hall", 0, 0, 6, 4) }),
    bounds,
  );
  const rock = svg.indexOf('data-terrain="solid"'),
    clear = svg.indexOf("<polygon points=", rock),
    wall = svg.indexOf("data-wall");
  assert.ok(
    rock >= 0 && clear > rock && clear < svg.indexOf('fill="url(#grid)"'),
  );
  assert.ok(wall > clear, "walls are drawn over the cleared floor");
  assert.ok(!svg.includes("data-terrain-area"));
});

/** @param {string} name */
const levelFile = (name) =>
  Geometry.validate(
    JSON.parse(
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Fixed prototype model names listed below.
      readFileSync(new URL(`../prototype/${name}`, import.meta.url), "utf8"),
    ),
  );

// Expected kinds come from reading the drawn walls, not from the stored areas.
/** @type {{name: string, floor: number[][], solid: number[][]}[]} */
const structures = [
  {
    name: "level-below.PROTOTYPE.json",
    floor: [
      [5, 5],
      [12, 5],
      [-12, 2],
      [-4, 2.2],
      [1.5, 13],
      [15.75, -5],
      [1.5, 19],
    ],
    solid: [
      [5, 15],
      [-5, 10],
      [10, 12],
      [-12, 8],
      [20, 5],
      [0.2, 12],
    ],
  },
  {
    name: "level-below-2.PROTOTYPE.json",
    floor: [
      [5, 5],
      [12, 5],
      [6, 20],
      [2, 20],
      [10, 20],
      [15, 7],
      [6, 11],
    ],
    solid: [
      [10, 10.5],
      [-2, 5],
      [14, 20],
      [6, 32],
      [20, 5],
      [2, 6],
    ],
  },
];
for (const { name, floor, solid } of structures) {
  test(`${name}: the structure is floor inside its walls and solid outside them`, () => {
    const model = levelFile(name);
    assert.deepEqual(
      model.terrain,
      { default: "solid" },
      "derived, not stored",
    );
    for (const at of floor)
      assert.equal(Geometry.terrainAt(model, at), "floor", `${at}`);
    for (const at of solid)
      assert.equal(Geometry.terrainAt(model, at), "solid", `${at}`);
  });
}
