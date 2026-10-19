import test from "node:test";
import assert from "node:assert/strict";
import { Geometry } from "../prototype/geometry.js";

const model = Geometry.validate({
  wallThickness: 0.15,
  walls: [{ id: "w1", a: [0, 0], b: [6, 0] }],
  openings: [],
  labels: [{ id: "l1", at: [3, 2], text: "Bridge" }],
  origin: [3, 6],
});
const bounds = { x: -3, y: -3, w: 12, h: 12 };

/** @param {string} svg @param {string} tag */
const firstTag = (svg, tag) =>
  svg.split("<").find((part) => part.startsWith(tag)) ?? "";

test("blueprint theme draws light linework on a deep blue sheet", () => {
  const svg = Geometry.scene(model, bounds, { theme: "blueprint" });
  assert.match(svg, /^<rect [^>]*fill="#1c4f8f"/);
  assert.match(firstTag(svg, "polygon data-wall"), /fill="#eef4ff"/);
  assert.match(firstTag(svg, "text"), /fill="#eef4ff"/);
});

test("blueprint theme keeps the grid readable and the axes distinct from the linework", () => {
  const svg = Geometry.scene(model, bounds, { theme: "blueprint" });
  assert.match(firstTag(svg, 'path d="M 1.5 0'), /stroke="#6f9bd6"/);
  const axes = svg.match(/<path d="M -3 6 H 9[^>]*>/)?.[0] ?? "";
  assert.match(axes, /stroke="#ff9a8a"/);
  assert.ok(!svg.includes("#d62929"), "no light-theme red on the blue sheet");
});

test("the default theme is unchanged and an explicit background still wins", () => {
  const plain = Geometry.scene(model, bounds);
  assert.deepEqual(plain, Geometry.scene(model, bounds, { theme: "light" }));
  assert.match(plain, /^<rect [^>]*fill="white"/);
  assert.match(
    Geometry.scene(model, bounds, {
      theme: "blueprint",
      background: "#123456",
    }),
    /^<rect [^>]*fill="#123456"/,
  );
});

test("an unknown theme fails loudly", () => {
  assert.throws(
    () => Geometry.scene(model, bounds, { theme: "sepia" }),
    /Unknown theme sepia/,
  );
});

test("blueprint doors use palette colours, closed and open", () => {
  const withDoor = Geometry.validate({
    wallThickness: 0.15,
    walls: [{ id: "w1", a: [0, 0], b: [6, 0] }],
    openings: [
      { id: "d1", wall: "w1", offset: 2, width: 2, type: "single-closed" },
    ],
    labels: [],
  });
  const closed = Geometry.scene(withDoor, bounds, { theme: "blueprint" });
  assert.match(firstTag(closed, "polygon data-door"), /fill="#1c4f8f"/);
  assert.match(firstTag(closed, "polygon data-door"), /stroke="#eef4ff"/);
  const open = Geometry.scene(withDoor, bounds, {
    theme: "blueprint",
    doorStates: { d1: "open" },
  });
  assert.match(firstTag(open, "polygon data-door"), /fill="none"/);
  assert.match(firstTag(open, "polygon data-door"), /stroke="#b7cdee"/);
  assert.ok(!closed.includes("${"), "no unexpanded template text");
});
