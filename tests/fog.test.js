import test from "node:test";
import assert from "node:assert/strict";
import { Fog, Geometry } from "../prototype/geometry.js";

// Characterisation baseline for the prototype's public visibility behaviour.
test("a closed door hides the space behind it; opening it reveals that space", () => {
  const model = Geometry.validate({
    wallThickness: 0.2,
    walls: [{ id: "divider", a: [3, -3], b: [3, 3] }],
    openings: [
      {
        id: "door",
        wall: "divider",
        offset: 2,
        width: 2,
        type: "single-closed",
      },
    ],
    labels: [],
  });
  const observer = { at: [0, 0], range: 6 };
  const closed = Fog.visible(observer, Fog.blockers(model, {}));
  assert.equal(Fog.inside([4, 0], closed.polygon), false);
  const open = Fog.visible(observer, Fog.blockers(model, { door: "open" }));
  assert.equal(Fog.inside([4, 0], open.polygon), true);
  assert.equal(Fog.inside([7, 0], open.polygon), false);
});

test("reset forgets exploration and closes every door without revealing from the retained POV", () => {
  const state = Fog.validate({
    version: 2,
    observers: [{ at: [0, 0], range: 6 }],
    doors: { door: "open" },
    observations: [],
    revisions: {},
  });
  Fog.reset(state);
  assert.deepEqual(state.doors, {});
  assert.deepEqual(state.observations, []);
  assert.deepEqual(state.revisions, {});
  assert.equal(state.visibilityPaused, true);
  assert.deepEqual(state.observers, [{ at: [0, 0], range: 6 }]);
  assert.equal(
    Fog.observation(
      state,
      { wallThickness: 0.2, walls: [], openings: [], labels: [] },
      "reset",
    ),
    false,
  );
});

test("observations retain what was seen without storing fog polygons or repeating unchanged visits", () => {
  const model = { wallThickness: 0.2, walls: [], openings: [], labels: [] };
  const state = Fog.validate({
    version: 2,
    observers: [{ at: [0, 0], range: 6 }],
    doors: { door: "open" },
    observations: [],
    revisions: {},
  });
  assert.equal(Fog.observation(state, model, "first"), true);
  assert.equal(Fog.observation(state, model, "first"), false);
  state.doors.door = "closed";
  state.observers[0].at = [1.5, 0];
  assert.equal(Fog.observation(state, model, "first"), true);
  assert.deepEqual(state.observations, [
    { at: [0, 0], range: 6, doors: { door: "open" }, revision: "first" },
    { at: [1.5, 0], range: 6, doors: { door: "closed" }, revision: "first" },
  ]);
  model.wallThickness = 0.4;
  assert.equal(state.revisions.first.wallThickness, 0.2);
  assert.deepEqual(Object.keys(state.revisions), ["first"]);
});
