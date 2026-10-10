import { test } from "node:test";
import assert from "node:assert/strict";
import { Geometry } from "../prototype/geometry.js";

test("rotated bed bounds include its metre footprint and ink for thumbnail and print", () => {
  const model = {
    wallThickness: 0.15,
    walls: [],
    openings: [],
    labels: [],
    componentDefinitions: {
      "bed@1": {
        id: "bed",
        version: 1,
        name: "Bed",
        family: "bed",
        defaults: { width: 0.9, length: 2 },
        details: { headDepth: 0.3 },
        blocksSight: false,
      },
    },
    components: [
      {
        id: "bed",
        definition: "bed@1",
        at: [1.13, 2.27],
        rotation: 90,
        settings: { width: 1.2, length: 2.2 },
      },
    ],
  };
  const bounds = Geometry.bounds(Geometry.validate(model));
  for (const [actual, expected] of [
    [bounds.x, -1.0825],
    [bounds.y, 2.2575],
    [bounds.w, 2.225],
    [bounds.h, 1.225],
  ])
    assert.ok(
      Math.abs(actual - expected) < 1e-9,
      `${actual} differs from ${expected}`,
    );

  const print = Geometry.sheet(
    model,
    { x: -3, y: 0, w: 21, h: 15, col: 0, row: 0 },
    Geometry.papers.a4,
  );
  assert.match(print, /width="297mm" height="210mm"/);
  assert.match(print, /data-component="bed"/);
  assert.match(print, /width="1.2" height="2.2"/);
  assert.match(print, /width="1.5" height="1.5"/);
});
