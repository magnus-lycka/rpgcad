import { test } from "node:test";
import assert from "node:assert/strict";
import { Geometry, Fog } from "../prototype/geometry.js";
const door = {
  id: "door",
  version: 1,
  name: "Wall door",
  family: "door",
  defaults: { width: 1, length: 0.06 },
  details: { leafThickness: 0.06 },
  blocksSight: true,
};
/** @returns {import("../prototype/geometry.js").Model} */
const accessModel = () => ({
  wallThickness: 0.2,
  walls: [{ id: "wall", a: [3, -3], b: [3, 3] }],
  openings: [{ id: "access", wall: "wall", offset: 2.5, width: 1 }],
  labels: [],
  componentDefinitions: { "door@1": door },
  components: [{ id: "panel", definition: "door@1", opening: "access" }],
});
test("attached component door uses the measured opening and thin leaf, retaining a trace when open", () => {
  const m = Geometry.validate(accessModel());
  const closed = Geometry.scene(m, { x: 0, y: -3, w: 6, h: 6 });
  assert.match(closed, /data-component="panel"/);
  assert.match(closed, /data-door="access"/);
  assert.match(closed, /3.03,-0.49/);
  assert.equal(
    Fog.inside(
      [4, 0],
      Fog.visible({ at: [0, 0], range: 6 }, Fog.blockers(m, {})).polygon,
    ),
    false,
  );
  assert.equal(
    Fog.inside(
      [4, 0],
      Fog.visible({ at: [0, 0], range: 6 }, Fog.blockers(m, { access: "open" }))
        .polygon,
    ),
    true,
  );
  const open = Geometry.scene(
    m,
    { x: 0, y: -3, w: 6, h: 6 },
    { doorStates: { access: "open" } },
  );
  assert.match(open, /data-door-state="open"/);
  assert.match(open, /stroke-dasharray=".08 .06"/);
});

test("ceiling hatch labels vertical direction independently of its open state", () => {
  const m = accessModel();
  assert.ok(m.componentDefinitions);
  assert.ok(m.components);
  assert.ok(m.componentDefinitions);
  m.componentDefinitions["hatch@1"] = {
    id: "hatch",
    version: 1,
    name: "Ceiling hatch",
    family: "ceiling-hatch",
    defaults: { width: 1, length: 1 },
    details: {},
    blocksSight: false,
  };
  m.components.push({
    id: "roof",
    definition: "hatch@1",
    at: [1, 1],
    rotation: 0,
    settings: { direction: "up-down", state: "open" },
  });
  const svg = Geometry.scene(Geometry.validate(m), { x: 0, y: 0, w: 6, h: 6 });
  assert.match(svg, /data-access-direction="up-down" data-access-state="open"/);
  assert.match(svg, /r="0.5"/);
  assert.match(svg, />UP-DOWN<\/text>/);
  assert.ok(m.components[1].settings);
  m.components[1].settings.state = "closed";
  assert.match(
    Geometry.scene(Geometry.validate(m), { x: 0, y: 0, w: 6, h: 6 }),
    /data-access-direction="up-down" data-access-state="closed"/,
  );
});

// Characterisation: existing observation snapshots already retain hydrated definitions.
test("remembered component door keeps the exact leaf definition and state previously seen", () => {
  const m = accessModel();
  const state = Fog.validate({
    version: 2,
    observers: [{ at: [0, 0], range: 6 }],
    doors: { access: "open" },
    observations: [],
    revisions: {},
  });
  Fog.observation(state, m, "seen");
  assert.ok(m.componentDefinitions);
  m.componentDefinitions["door@1"] = {
    ...door,
    details: { leafThickness: 0.02 },
  };
  state.doors = {};
  const remembered = Geometry.scene(
    state.revisions.seen,
    { x: 0, y: -3, w: 6, h: 6 },
    { doorStates: state.observations[0].doors },
  );
  assert.match(remembered, /3.03,-0.49/);
  assert.match(remembered, /data-door-state="open"/);
  assert.match(Geometry.scene(m, { x: 0, y: -3, w: 6, h: 6 }), /3.01,-0.49/);
});

test("door instance sight override controls a closed leaf independently of opening defaults", () => {
  for (const blocksSight of [false, true]) {
    const m = accessModel();
    assert.ok(m.components);
    const panel = m.components[0];
    panel.blocksSight = blocksSight;
    m.openings[0].blocksSight = !blocksSight;
    Geometry.validate(m);
    assert.equal(
      Geometry.componentSemantics(m, panel).blocksSight,
      blocksSight,
    );
    assert.equal(
      Geometry.accessOpening(m, m.openings[0]).blocksSight,
      blocksSight,
    );
    assert.equal(
      Fog.inside(
        [4, 0],
        Fog.visible({ at: [0, 0], range: 6 }, Fog.blockers(m, {})).polygon,
      ),
      !blocksSight,
    );
    assert.match(
      Geometry.scene(m, { x: 0, y: -3, w: 6, h: 6 }),
      /data-door="access"/,
    );
  }
});

test("door semantics inherit opening sight settings when the instance has no override", () => {
  const m = accessModel();
  assert.ok(m.components);
  m.openings[0].blocksSight = false;
  Geometry.validate(m);
  assert.equal(
    Geometry.componentSemantics(m, m.components[0]).blocksSight,
    false,
  );
  assert.equal(Geometry.accessOpening(m, m.openings[0]).blocksSight, false);
});

test("reviewed hatch is hinged and letter-free, with solid descent and dashed ascent contours", () => {
  const m = accessModel();
  assert.ok(m.componentDefinitions);
  m.componentDefinitions["hatch@1"] = {
    id: "hatch",
    version: 1,
    name: "Hinged hatch",
    family: "ceiling-hatch",
    defaults: { width: 1, length: 1, direction: "down" },
    details: { profile: "referee-2026-10-11" },
    blocksSight: false,
  };
  m.components = [
    { id: "reviewed", definition: "hatch@1", at: [0, 0], rotation: 0 },
  ];
  const render = () =>
    Geometry.scene(Geometry.validate(m), { x: -1, y: -1, w: 3, h: 3 });
  const down = render();
  assert.doesNotMatch(down, /<text/);
  assert.match(down, /data-access-direction="down"/);
  assert.match(down, /data-hatch-hinge/);
  assert.match(down, /data-hatch-handle/);
  assert.doesNotMatch(down, /stroke-dasharray=".1 .07"/);
  m.components[0].settings = { direction: "up" };
  assert.match(
    render(),
    /data-access-contour="outer"[^>]*stroke-dasharray=".1 .07"/,
  );
  m.components[0].settings.direction = "up-down";
  assert.match(
    render(),
    /data-access-contour="outer"[^>]*stroke-dasharray="none"/,
  );
  assert.match(
    render(),
    /data-access-contour="inner"[^>]*stroke-dasharray=".1 .07"/,
  );
});

test("iris access uses circles without a hinge for every vertical direction", () => {
  for (const direction of ["up", "down", "up-down"]) {
    const m = accessModel();
    assert.ok(m.componentDefinitions);
    m.componentDefinitions["iris@1"] = {
      id: "iris",
      version: 1,
      name: "Iris",
      family: "iris-valve",
      defaults: { width: 1, length: 1, direction },
      details: { profile: "referee-2026-10-11" },
      blocksSight: false,
    };
    m.components = [
      { id: "iris", definition: "iris@1", at: [0, 0], rotation: 30 },
    ];
    const svg = Geometry.scene(Geometry.validate(m), {
      x: -1,
      y: -1,
      w: 3,
      h: 3,
    });
    assert.match(svg, /<ellipse data-access-contour="outer"/);
    assert.doesNotMatch(svg, /data-hatch|<text/);
    assert.equal(
      (svg.match(/data-access-contour/g) ?? []).length,
      direction === "up-down" ? 2 : 1,
    );
    assert.ok(svg.includes(`data-access-direction="${direction}"`));
    assert.equal(Fog.blockers(m, {}).polygons.length, 2);
  }
});

test("hatch hinge is broad with the through-hatch dashed hinge inset inside it", () => {
  const model = accessModel();
  model.componentDefinitions = {
    "hatch@1": {
      id: "hatch",
      version: 1,
      name: "Hatch",
      family: "ceiling-hatch",
      defaults: { width: 1, length: 1, direction: "up-down" },
      details: { profile: "referee-2026-10-11" },
      blocksSight: false,
    },
  };
  model.components = [
    { id: "hatch", definition: "hatch@1", at: [0, 0], rotation: 0 },
  ];
  const svg = Geometry.scene(Geometry.validate(model), {
    x: -1,
    y: -1,
    w: 3,
    h: 3,
  });
  const hinges = [
    ...svg.matchAll(
      /data-access-contour="(outer|inner)"[^>]*d="M ([\d.]+) [\d.]+ V [\d.]+ H ([\d.]+)/g,
    ),
  ];
  assert.equal(hinges.length, 2);
  // A one-metre hatch has a 40 cm hinge; its inner hinge has 9 cm side clearance.
  const [outer, inner] = hinges.map((hinge) => hinge.slice(2).map(Number));
  assert.deepEqual(outer, [0.3, 0.7]);
  assert.deepEqual(inner, [0.39, 0.61]);
});
