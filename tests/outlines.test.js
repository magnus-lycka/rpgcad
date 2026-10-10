import test from "node:test";
import assert from "node:assert/strict";
import { Geometry } from "../prototype/geometry.js";

test("an overhead shaft is drawn as a dashed outline at its specified footprint", () => {
  const model = Geometry.validate({
    wallThickness: 0.15,
    walls: [],
    openings: [],
    labels: [],
    outlines: [
      { id: "shaft", at: [2, 3], width: 1.5, height: 1.5, dashed: true },
    ],
  });
  const scene = Geometry.scene(model, { x: 0, y: 0, w: 6, h: 6 });
  const shaft = scene.match(/<rect data-outline="shaft"[^>]*>/)?.[0];
  assert.ok(shaft);
  assert.match(shaft, /x="2" y="3" width="1.5" height="1.5"/);
  assert.match(shaft, /stroke-dasharray="[^"]+"/);
  assert.match(shaft, /fill="none"/);
});
