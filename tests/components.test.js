import { test } from "node:test";
import assert from "node:assert/strict";
import { Geometry, Fog } from "../prototype/geometry.js";

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

/** @returns {import("../prototype/geometry.js").Model & {components:import("../prototype/geometry.js").ComponentInstance[],componentDefinitions:Record<string,import("../prototype/geometry.js").ComponentDefinition>}} */
const equipmentModel = () => ({
  wallThickness: 0.15,
  walls: [],
  openings: [],
  labels: [],
  componentDefinitions: {
    "console@1": {
      id: "console",
      version: 1,
      name: "Console",
      family: "console",
      defaults: { width: 0.9, length: 1.35, seatCount: 1 },
      details: { headDepth: 0.55 },
      blocksSight: false,
    },
  },
  components: [
    {
      id: "console",
      definition: "console@1",
      at: [1.13, 2.27],
      rotation: 90,
      settings: { seatCount: 3 },
    },
  ],
});

test("console seat count regenerates distinct workstations with fixed physical seats", () => {
  const model = Geometry.validate(equipmentModel());
  const scene = Geometry.scene(model, { x: -3, y: 0, w: 9, h: 9 });
  assert.equal((scene.match(/data-console-seat=/g) ?? []).length, 3);
  assert.match(scene, /width="2.7" height="1.35"/);
  assert.equal((scene.match(/width="0.5" height="0.5"/g) ?? []).length, 3);
  const bounds = Geometry.bounds(model);
  assert.ok(Math.abs(bounds.x - -0.2325) < 1e-9);
  assert.ok(Math.abs(bounds.h - 2.725) < 1e-9);
});

test("machinery varies its metre footprint while retaining service-panel detail and orientation", () => {
  const model = equipmentModel();
  model.componentDefinitions = {
    "machinery@1": {
      id: "machinery",
      version: 1,
      name: "Machinery",
      family: "machinery",
      defaults: { width: 1.5, length: 2 },
      details: { headDepth: 0.3 },
      blocksSight: true,
    },
  };
  model.components = [
    {
      id: "pump",
      definition: "machinery@1",
      at: [3.17, 4.29],
      rotation: 180,
      settings: { width: 2, length: 3 },
    },
  ];
  const scene = Geometry.scene(Geometry.validate(model), {
    x: 0,
    y: 0,
    w: 9,
    h: 9,
  });
  assert.match(scene, /translate\(3.17 4.29\) rotate\(180\)/);
  assert.match(scene, /width="2" height="3"/);
  assert.match(scene, /data-machinery-panel="front"[^>]+height="0.3"/);
  assert.match(scene, /data-machinery-core="motor"/);
});

test("opaque rotated machinery blocks sight while an instance override leaves sight clear", () => {
  const model = equipmentModel();
  model.componentDefinitions["machinery@1"] = {
    id: "machinery",
    version: 1,
    name: "Machinery",
    family: "machinery",
    defaults: { width: 1.5, length: 2 },
    details: { headDepth: 0.3 },
    blocksSight: true,
  };
  model.components = [
    { id: "motor", definition: "machinery@1", at: [4, 1], rotation: 90 },
  ];
  const observer = { at: [0, 1.75], range: 10 };
  assert.equal(
    Fog.inside(
      [5, 1.75],
      Fog.visible(observer, Fog.blockers(model, {})).polygon,
    ),
    false,
  );
  model.components[0].blocksSight = false;
  assert.equal(
    Fog.inside(
      [5, 1.75],
      Fog.visible(observer, Fog.blockers(model, {})).polygon,
    ),
    true,
  );
  model.components = [
    { id: "console", definition: "console@1", at: [2, 1], rotation: 0 },
  ];
  assert.equal(
    Fog.inside(
      [5, 1.75],
      Fog.visible(observer, Fog.blockers(model, {})).polygon,
    ),
    true,
  );
  model.components[0].blocksSight = true;
  assert.equal(
    Fog.inside(
      [5, 1.75],
      Fog.visible(observer, Fog.blockers(model, {})).polygon,
    ),
    false,
  );
});

test("access guidance resolves per instance independently of sight and siblings", () => {
  const model = equipmentModel();
  model.componentDefinitions["console@1"].access = {
    blocksPassage: true,
    frontClearance: 0.75,
  };
  const first = model.components[0];
  first.access = { blocksPassage: false, frontClearance: 1.1 };
  first.blocksSight = true;
  const sibling = {
    id: "sibling",
    definition: "console@1",
    at: [4, 5],
    rotation: 0,
  };
  assert.deepEqual(Geometry.componentSemantics(model, first), {
    blocksSight: true,
    access: { blocksPassage: false, frontClearance: 1.1 },
  });
  assert.deepEqual(Geometry.componentSemantics(model, sibling), {
    blocksSight: false,
    access: { blocksPassage: true, frontClearance: 0.75 },
  });
  assert.deepEqual(model.componentDefinitions["console@1"].access, {
    blocksPassage: true,
    frontClearance: 0.75,
  });
});

test("portable geometry rejects negative service clearance rather than treating it as usable guidance", () => {
  const model = equipmentModel();
  model.components[0].access = { frontClearance: -1 };
  assert.throws(() => Geometry.validate(model), /Invalid component/);
});
