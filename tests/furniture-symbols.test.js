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

test("revised chair draws a tapered seat with curved backrest and uniform thin outlines", () => {
  const model = revisedModel("chair", 0.5, 0.5);
  const scene = Geometry.scene(Geometry.validate(model), {
    x: -1,
    y: -1,
    w: 3,
    h: 3,
  });
  assert.match(scene, /data-chair-seat=""[^>]*d="[^"]*Q/);
  assert.match(scene, /data-chair-back=""[^>]*d="[^"]*Q/);
  assert.doesNotMatch(scene, /stroke-width="\.05"/);
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
  assert.equal((scene.match(/data-console-seat=/g) ?? []).length, 2);
  assert.equal((scene.match(/data-console-display=/g) ?? []).length, 2);
  assert.equal((scene.match(/data-console-keyboard=/g) ?? []).length, 2);
  assert.equal((scene.match(/data-chair-back=/g) ?? []).length, 2);
  assert.match(scene, /data-console-desk=""/);
  assert.doesNotMatch(scene, /<rect width="1.8" height="1.35"/);
  assert.doesNotMatch(scene, /stroke-width="\.05"|<text/);
});
