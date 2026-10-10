import { test } from "node:test";
import assert from "node:assert/strict";
import { Geometry } from "../prototype/geometry.js";

const revisedModel = (family, width, length) => ({
  wallThickness: 0.15,
  walls: [],
  openings: [],
  labels: [],
  componentDefinitions: {
    [`${family}@1`]: {
      id: family,
      version: 1,
      name: family,
      family,
      defaults: {
        width,
        length,
        ...(family === "console" ? { seatCount: 1 } : {}),
      },
      details: { headDepth: 0.3, profile: "referee-2026-10-11" },
      blocksSight: false,
    },
  },
  components: [
    { id: family, definition: `${family}@1`, at: [0, 0], rotation: 0 },
  ],
});

const match = (svg, pattern) => {
  const result = svg.match(pattern);
  assert.ok(result, `SVG did not match ${pattern}`);
  return result;
};

// Public SVG coordinates are measured against worked metre positions, not renderer formulas.
const near = (actual, expected) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${actual} differs from ${expected}`,
  );

test("revised chair draws a tapered seat with curved backrest and uniform thin outlines", () => {
  const model = revisedModel("chair", 0.5, 0.5);
  const scene = Geometry.scene(Geometry.validate(model), {
    x: -1,
    y: -1,
    w: 3,
    h: 3,
  });
  const seatPath = match(scene, /data-chair-seat=""[^>]*d="([^"]+)"/)[1];
  const backPath = match(scene, /data-chair-back=""[^>]*d="([^"]+)"/)[1];
  // Worked 0.5 m chair: its front spans x=.04 to .46, rear x=.10 to .40.
  // Both front corners turn through quadratic curves before tapering to the rear.
  const frontLeft = match(seatPath, /Q ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/);
  const rearLeft = match(seatPath, /L ([\d.]+) ([\d.]+)/);
  const rearRight = seatPath
    .match(/Q [\d.]+ [\d.]+ ([\d.]+) ([\d.]+)/g)[1]
    .split(" ")
    .slice(3)
    .map(Number);
  const frontRight = seatPath
    .match(/L ([\d.]+) ([\d.]+)/g)[1]
    .split(" ")
    .slice(1)
    .map(Number);
  assert.deepEqual(frontLeft.slice(1).map(Number), [0.04, 0.06, 0.04, 0.11]);
  assert.deepEqual(rearLeft.slice(1).map(Number), [0.1, 0.325]);
  assert.deepEqual(rearRight, [0.4, 0.325]);
  assert.deepEqual(frontRight, [0.46, 0.11]);
  assert.ok(
    frontRight[0] - Number(frontLeft[3]) > rearRight[0] - Number(rearLeft[1]),
  );
  assert.match(backPath, /^M 0.075 0.42 Q 0.25 0.35 0.425 0.42/);
  const chair = scene.slice(scene.indexOf('<g data-component="chair"'));
  const widths = [...chair.matchAll(/stroke-width="([^"]+)"/g)].map((match) =>
    Number(match[1]),
  );
  assert.deepEqual(
    widths,
    [0.025],
    "all four parts inherit one thin outline width",
  );
  assert.equal((chair.match(/data-chair-(?:seat|back|arm)=/g) ?? []).length, 4);
  assert.doesNotMatch(scene, /<rect width="0.5" height="0.5"/);
  assert.doesNotMatch(scene, /<text/);
});

test("revised human and Aslan bed has a rounded frame, head pillow and blanket reaching the shoulders", () => {
  const model = revisedModel("bed", 1, 2.25);
  const scene = Geometry.scene(Geometry.validate(model), {
    x: -1,
    y: -1,
    w: 3,
    h: 4,
  });
  assert.match(
    scene,
    /data-bed-frame=""[^>]*width="1" height="2.25" rx="0.08"/,
  );
  assert.match(scene, /data-bed-pillow=""[^>]*rx="0.08"/);
  assert.match(scene, /data-bed-blanket=""[^>]*d="M 0 0.38 H 1"/);
  assert.doesNotMatch(scene, /<text/);
});

test("revised console shows seats facing keyboards and curved displays on a dashboard without a floor box", () => {
  const model = revisedModel("console", 0.9, 1.35);
  model.components[0].settings = { seatCount: 2 };
  const scene = Geometry.scene(Geometry.validate(model), {
    x: -1,
    y: -1,
    w: 4,
    h: 4,
  });
  assert.equal((match(scene, /data-console-seat=/g) ?? []).length, 2);
  assert.equal((match(scene, /data-console-display=/g) ?? []).length, 2);
  assert.equal((match(scene, /data-console-keyboard=/g) ?? []).length, 2);
  assert.equal((match(scene, /data-chair-back=/g) ?? []).length, 2);
  assert.match(scene, /data-console-desk=""/);
  const seats = [
    ...scene.matchAll(
      /data-console-seat="(\d+)" transform="translate\(([^)]+)\)">([\s\S]*?)<\/g>/g,
    ),
  ];
  assert.equal(seats.length, 2);
  assert.deepEqual(
    seats.map((seat) => Number(seat[2].split(" ")[0])),
    [0.2, 1.1],
  );
  for (const seat of seats) near(Number(seat[2].split(" ")[1]), 0.75);
  for (const seat of seats) {
    const frontY = Number(
      match(seat[3], /data-chair-seat="" d="M [\d.]+ ([\d.]+)/)[1],
    );
    const backY = Number(
      match(seat[3], /data-chair-back="" d="M [\d.]+ ([\d.]+)/)[1],
    );
    const originY = Number(seat[2].split(" ")[1]);
    near(originY + frontY, 0.816);
    near(originY + backY, 1.212);
    assert.ok(frontY < backY, "chair front faces the dashboard at smaller Y");
  }
  const keyboardY = [
    ...scene.matchAll(/data-console-keyboard="\d+"[^>]*y="([^"]+)"/g),
  ].map((match) => Number(match[1]));
  assert.equal(keyboardY.length, 2);
  for (const y of keyboardY) near(y, 0.34);
  const display = match(
    scene,
    /data-console-display="1" d="M ([\d.]+) ([\d.]+) Q ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/,
  );
  for (const [index, expected] of [0.17, 0.15, 0.45, 0, 0.73, 0.15].entries())
    near(Number(display.at(index + 1)), expected);
  assert.doesNotMatch(scene, /<rect width="1.8" height="1.35"/);
  assert.doesNotMatch(scene, /stroke-width="\.05"|<text/);
});
