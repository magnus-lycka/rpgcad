import test from "node:test";
import assert from "node:assert/strict";
import { Geometry } from "../prototype/geometry.js";

const model = Geometry.validate({
  wallThickness: 0.15,
  walls: [],
  openings: [],
  labels: [],
  origin: [3, 6],
});

test("page borders repeat the origin cross every 21 m by 15 m, dashed unlike the axes", () => {
  const scene = Geometry.scene(model, { x: -30, y: -20, w: 80, h: 60 });
  const borders = scene.match(/<path data-page-borders[^>]*>/)?.[0];
  assert.ok(borders);
  assert.match(borders, /stroke-dasharray="[^"]+"/);
  for (const line of ["M -18 -20 V 40", "M 24 -20 V 40", "M 45 -20 V 40"])
    assert.ok(borders.includes(line), line);
  for (const line of ["M -30 -9 H 50", "M -30 6 H 50", "M -30 21 H 50"])
    assert.equal(borders.includes(line), line !== "M -30 6 H 50", line);
  assert.ok(!borders.includes("V 40 M 3 "), "the axes are not page borders");
});

test("no page borders without axes", () => {
  const scene = Geometry.scene(
    model,
    { x: -30, y: -20, w: 80, h: 60 },
    { showAxes: false },
  );
  assert.ok(!scene.includes("data-page-borders"));
});
