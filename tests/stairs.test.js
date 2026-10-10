import test from "node:test";
import assert from "node:assert/strict";
import { Geometry } from "../prototype/geometry.js";

test("a staircase leading to the floor above is labelled UP", () => {
  const model = Geometry.validate({
    wallThickness: 0.15,
    walls: [],
    openings: [],
    labels: [],
    spiralStairs: [
      {
        id: "stairs-up",
        at: [0, 0],
        radius: 1.35,
        treads: 14,
        direction: "up",
      },
    ],
  });
  const scene = Geometry.scene(model, { x: -3, y: -3, w: 6, h: 6 });
  assert.match(scene, />UP<\/text>/);
  assert.doesNotMatch(scene, />DOWN<\/text>/);
});
