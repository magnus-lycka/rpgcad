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
    // Solid is hairline hatching; a drop is dots, drawn as round-capped points.
    assert.ok(
      kind === "solid" ? width <= 0.02 : width <= 0.08,
      `${kind} strokes are thin (${width} m)`,
    );
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
    ...parts,
    terrain: { default: base, ...(parts.terrain ?? {}) },
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

/** A turret: a 3 m outer wall square around a 1.5 m shaft wall square, both centred on [cx, cy]. */
const turret = (cx, cy, outer = 3, inner = 1.5) => [
  ...room(
    "outer",
    cx - outer / 2,
    cy - outer / 2,
    cx + outer / 2,
    cy + outer / 2,
  ),
  ...room(
    "inner",
    cx - inner / 2,
    cy - inner / 2,
    cx + inner / 2,
    cy + inner / 2,
  ),
];

test("an area can name an enclosed space by a point inside it, so it follows the walls", () => {
  const model = (/** @type {number} */ size) =>
    walled(
      {
        walls: turret(5, 5, size),
        terrain: {
          areas: [
            { id: "ring", kind: "solid", space: [3.6, 5] },
            { id: "shaft", kind: "drop", space: [5, 5] },
          ],
        },
      },
      "floor",
    );
  const m = model(3);
  assert.equal(Geometry.terrainAt(m, [5, 5]), "drop");
  assert.equal(Geometry.terrainAt(m, [3.8, 5]), "solid");
  assert.equal(Geometry.terrainAt(m, [6.4, 3.7]), "solid");
  assert.equal(Geometry.terrainAt(m, [8.5, 5]), "floor", "outside the turret");
  const wider = model(3.6);
  assert.equal(Geometry.terrainAt(wider, [3.3, 5]), "solid");
  assert.equal(Geometry.terrainAt(wider, [5, 5]), "drop");
});

test("a space area must name an enclosed space and exclusively so", () => {
  const walls = room("hall", 0, 0, 6, 4);
  const bad = [
    { id: "a", kind: "solid", space: [20, 20] },
    { id: "a", kind: "solid", space: "hall" },
    { id: "a", kind: "solid", space: [1, 1], points: square(0, 0, 1) },
    { id: "a", kind: "solid" },
  ];
  for (const area of bad)
    assert.throws(
      () => walled({ walls, terrain: { areas: [area] } }, "floor"),
      Error,
      JSON.stringify(area),
    );
  assert.doesNotThrow(() =>
    walled(
      { walls, terrain: { areas: [{ id: "a", kind: "drop", space: [1, 1] }] } },
      "floor",
    ),
  );
});

test("a space area is drawn as its space: cleared to the sheet, then patterned", () => {
  const m = walled(
    {
      walls: turret(5, 5),
      terrain: { areas: [{ id: "ring", kind: "solid", space: [3.6, 5] }] },
    },
    "floor",
  );
  const svg = Geometry.scene(m, bounds);
  const area = svg
    .split("<")
    .find((part) => part.startsWith('polygon data-terrain-area="ring"'));
  assert.ok(area);
  assert.match(area, /data-terrain-kind="solid"/);
  assert.match(area, /points="3.5,3.5 6.5,3.5 6.5,6.5 3.5,6.5"/);
  assert.match(area, /fill="url\(#grid-solid\)"/);
});

test("a character standing in the solid ring of a turret reveals nothing", () => {
  const m = walled(
    {
      walls: turret(5, 5),
      terrain: { areas: [{ id: "ring", kind: "solid", space: [3.6, 5] }] },
    },
    "floor",
  );
  const from = (/** @type {number[]} */ at, /** @type {string} */ revision) =>
    Fog.region({ at, range: 6, doors: {}, revision }, m);
  assert.deepEqual(from([3.8, 5], "ring").polygon, []);
  assert.ok(from([9, 5], "outside").polygon.length > 0);
});

const beyond = [
  [-1000, 10],
  [1000, 10],
  [1000, 1000],
  [-1000, 1000],
];
/** A walled hall with an unknown region beyond y = 10 that refines only the outside. */
const withUnknown = (/** @type {Record<string, unknown>} */ extra = {}) =>
  walled({
    walls: room("hall", 0, 0, 6, 12),
    terrain: {
      areas: [
        {
          id: "undecided",
          kind: "unknown",
          points: beyond,
          outside: true,
          ...extra,
        },
      ],
    },
  });

test("unknown is undecided ground that refines the outside: it never turns a room into unknown", () => {
  const m = withUnknown();
  assert.equal(Geometry.terrainAt(m, [20, 15]), "unknown");
  assert.equal(
    Geometry.terrainAt(m, [3, 11]),
    "floor",
    "inside the hall, past y = 10",
  );
  assert.equal(
    Geometry.terrainAt(m, [20, 5]),
    "solid",
    "outside but before the region",
  );
});

test("without the outside flag an area overrides everything, rooms included", () => {
  const m = withUnknown({ outside: undefined });
  assert.equal(Geometry.terrainAt(m, [3, 11]), "unknown");
});

test("the outside flag must be a boolean", () => {
  assert.throws(() => withUnknown({ outside: "yes" }), Error);
  assert.doesNotThrow(() => withUnknown({ outside: false }));
});

test("an observer standing on unknown ground reveals nothing, like solid", () => {
  const m = withUnknown();
  const seen = (/** @type {number[]} */ at, /** @type {string} */ revision) =>
    Fog.region({ at, range: 6, doors: {}, revision }, m);
  assert.deepEqual(seen([20, 15], "unknown").polygon, []);
  assert.ok(seen([3, 6], "hall").polygon.length > 0);
});

test("unknown shows as a question mark in every grid square for the Designer and the Referee", () => {
  const svg = Geometry.scene(withUnknown(), bounds);
  const pattern = patternOf(svg, "unknown");
  assert.match(pattern, /width="1.5" height="1.5"/);
  assert.equal(
    pattern.match(/<text[^>]*>\?<\/text>/g)?.length,
    1,
    "one mark per 1.5 m square",
  );
  assert.match(pattern, /fill="#808080"/);
  assert.match(
    svg,
    /data-terrain-area="undecided"[^>]*data-terrain-kind="unknown"/,
  );
});

test("the question marks sit in the grid's squares, whatever the grid origin", () => {
  const m = Geometry.validate({
    wallThickness: 0.15,
    walls: [],
    openings: [],
    labels: [],
    gridOrigin: [0.5, 0.25],
    terrain: { default: "unknown" },
  });
  assert.match(
    patternOf(Geometry.scene(m, bounds), "unknown"),
    /patternTransform="translate\(0.5 0.25\)"/,
  );
});

test("the players' fog view draws unknown as plain solid rock, with no question marks", () => {
  const m = withUnknown();
  const state = Fog.validate({
    version: 2,
    observers: [{ id: "p", at: [3, 6], range: 6 }],
    doors: {},
    observations: [{ at: [3, 6], range: 6, doors: {}, revision: "r" }],
    revisions: { r: m },
  });
  const svg = Fog.render(m, { x: -10, y: -10, w: 40, h: 40 }, state, [
    Fog.region({ at: [3, 6], range: 6, doors: {}, revision: "r" }, m),
  ]);
  assert.ok(
    !svg.includes("unknown"),
    "players never see the word, the kind or the pattern",
  );
  assert.ok(!svg.includes("<text"), "and no question marks");
  assert.ok(
    svg.includes('data-terrain-kind="solid"') || svg.includes("-solid"),
  );
});

test("outside areas are drawn before the enclosed spaces are cleared, so rooms stay clear", () => {
  const svg = Geometry.scene(withUnknown(), { x: -10, y: -10, w: 40, h: 40 });
  const unknown = svg.indexOf('data-terrain-area="undecided"'),
    hall = svg.indexOf('<polygon points="0,0 6,0 6,12 0,12"');
  assert.ok(
    unknown >= 0 && hall > unknown,
    "the hall is cleared after the unknown region",
  );
});

test("undecided and solid regions are background: they do not stretch the drawing's extent", () => {
  const b = Geometry.bounds(withUnknown());
  assert.ok(b.w < 20 && b.h < 20, JSON.stringify(b));
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
      [-2, 20],
      [20, 5],
      [2, 6],
    ],
  },
];
for (const { name, floor, solid } of structures) {
  test(`${name}: the structure is floor inside its walls and solid outside them`, () => {
    const model = levelFile(name);
    assert.equal(model.terrain?.default, "solid");
    assert.ok(
      (model.terrain?.areas ?? []).every((area) => area.kind !== "floor"),
      "floor is derived from the walls, never stored",
    );
    for (const at of floor)
      assert.equal(Geometry.terrainAt(model, at), "floor", `${at}`);
    for (const at of solid)
      assert.equal(Geometry.terrainAt(model, at), "solid", `${at}`);
  });
}

test("a drop is air: sparse, irregularly placed dots, not lines", () => {
  const pattern = patternOf(Geometry.scene(level, bounds), "drop");
  assert.match(pattern, /stroke-linecap="round"/);
  const tile = Number(pattern.match(/width="([\d.]+)"/)?.[1]);
  const dots = [...pattern.matchAll(/M ([-\d.]+) ([-\d.]+) l/g)].map(
    ([, x, y]) => [Number(x), Number(y)],
  );
  const density = dots.length / (tile * tile);
  assert.ok(density >= 3 && density <= 6, `${density.toFixed(1)} dots per m2`);
  // Irregular: no lattice, and no two dots crowd each other (the tile wraps).
  assert.ok(
    new Set(dots.map(([x]) => Math.round(x / 0.05))).size >= dots.length * 0.6,
  );
  const wrap = (/** @type {number} */ d) =>
    Math.abs(((((d + tile / 2) % tile) + tile) % tile) - tile / 2);
  for (const [i, a] of dots.entries())
    for (const b of dots.slice(i + 1))
      assert.ok(
        Math.hypot(wrap(a[0] - b[0]), wrap(a[1] - b[1])) >= 0.3,
        `${a} ${b}`,
      );
  // Evenly spread: each quarter of the tile holds a fair share.
  for (const [qx, qy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ])
    assert.ok(
      dots.filter(
        ([x, y]) =>
          Math.floor((x / tile) * 2) === qx &&
          Math.floor((y / tile) * 2) === qy,
      ).length >=
        dots.length / 8,
      `quarter ${qx},${qy}`,
    );
});

test("each ceiling shaft on the level below has a turret above it on the ground level: air in the shaft, solid around it, floor outside", () => {
  const ground = levelFile("model.PROTOTYPE.json"),
    below = levelFile("level-below.PROTOTYPE.json");
  const shafts = (below.outlines ?? []).filter((o) =>
    o.id.endsWith("-ceiling-shaft"),
  );
  assert.equal(shafts.length, 2);
  for (const shaft of shafts) {
    const [cx, cy] = [
      shaft.at[0] + shaft.width / 2,
      shaft.at[1] + shaft.height / 2,
    ];
    const kind = (/** @type {number} */ dx, /** @type {number} */ dy) =>
      Geometry.terrainAt(ground, [cx + dx, cy + dy]);
    for (const [dx, dy] of [
      [0, 0],
      [0.6, 0.6],
      [-0.6, 0.6],
      [0.6, -0.6],
      [-0.6, -0.6],
    ])
      assert.equal(kind(dx, dy), "drop", `${shaft.id} shaft ${dx},${dy}`);
    for (const [dx, dy] of [
      [1.1, 0],
      [-1.1, 0],
      [0, 1.1],
      [0, -1.1],
      [1.3, 1.3],
      [-1.3, -1.3],
    ])
      assert.equal(kind(dx, dy), "solid", `${shaft.id} ring ${dx},${dy}`);
    for (const [dx, dy] of [
      [1.7, 0],
      [-1.7, 0],
      [0, 1.7],
      [0, -1.7],
    ])
      assert.equal(kind(dx, dy), "floor", `${shaft.id} outside ${dx},${dy}`);
    // The turret is 3 m square around the shaft: 0.75 m of wall-to-wall rock on every side.
    const walls = ground.walls.filter(
      (w) =>
        Math.abs(w.a[0] - w.b[0]) < 1e-9 &&
        Math.abs(w.a[0] - (cx + 1.5)) < 1e-9 &&
        Math.abs((w.a[1] + w.b[1]) / 2 - cy) < 1e-9,
    );
    assert.equal(
      walls.length,
      1,
      `${shaft.id} has an outer wall 1.5 m to the right of the shaft centre`,
    );
  }
});

test("turret terrain names its spaces by a point instead of copying wall coordinates", () => {
  const areas = levelFile("model.PROTOTYPE.json").terrain?.areas ?? [];
  assert.equal(areas.length, 4);
  for (const area of areas) {
    assert.ok(area.space && !area.points, area.id);
    assert.ok(["solid", "drop"].includes(area.kind), area.id);
  }
});

test("level below-2: the surroundings beyond the corridor end are undecided, not solid", () => {
  const model = levelFile("level-below-2.PROTOTYPE.json");
  // The reference origin is [-1.5, 13.5]; Y on the red axes is 13.5 minus the stored y, so Y < -13.5 is stored y > 27.
  for (const at of [
    [6, 33],
    [-5, 33],
    [2, 28],
    [14, 40],
    [20, 30],
  ])
    assert.equal(Geometry.terrainAt(model, at), "unknown", `${at}`);
  for (const at of [
    [6, 28],
    [6, 29.5],
    [2, 20],
    [10, 20],
    [5, 5],
  ])
    assert.equal(Geometry.terrainAt(model, at), "floor", `${at}`);
  for (const at of [
    [14, 20],
    [-2, 20],
    [20, 5],
    [10, 10.5],
  ])
    assert.equal(Geometry.terrainAt(model, at), "solid", `${at}`);
});
