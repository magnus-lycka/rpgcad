/**
 * @typedef {number[]} Point
 * @typedef {{id: string, a: Point, b: Point, thickness?: number, blocksSight?: boolean}} Wall
 * @typedef {{id: string, wall: string, offset: number, width: number, thickness?: number, type?: string, angle?: number, blocksSight?: boolean}} Opening
 * @typedef {{id: string, at: Point, text: string, size?: number}} Label
 * @typedef {{id: string, at: Point, width: number, height: number, stroke?: number, dashed?: boolean, sides?: Array<'top'|'right'|'bottom'|'left'>, blocksSight?: boolean}} Outline
 * @typedef {{id: string, at: Point, radius: number, stroke?: number, dashed?: boolean, blocksSight?: boolean}} Circle
 * @typedef {{id: string, a: Point, b: Point, stroke?: number, blocksSight?: boolean}} Line
 * @typedef {{id: string, at: Point, width: number, projection: number, radius: number, stroke?: number, direction?: number}} StepIron
 * @typedef {{id: string, at: Point, radius: number, treads: number, direction?: 'up'|'down', startAngle?: number, sweep?: number}} Stair
 * @typedef {{blocksPassage?:boolean,frontClearance?:number}} ComponentAccess
 * @typedef {{id:string, version:number, name:string, family:string, defaults:{width:number,length:number,seatCount?:number,direction?:string}, details:{headDepth?:number,leafThickness?:number,profile?:string,desk?:boolean}, blocksSight:boolean,access?:ComponentAccess}} ComponentDefinition
 * @typedef {{id:string, definition:string, at?:Point, rotation?:number, opening?:string, blocksSight?:boolean, access?:ComponentAccess, settings?:{width?:number,length?:number,direction?:string,state?:string,seatCount?:number}}} ComponentInstance
 * @typedef {{wallThickness: number, walls: Wall[], openings: Opening[], labels: Label[], outlines?: Outline[], circles?: Circle[], lines?: Line[], stepIrons?: StepIron[], spiralStairs?: Stair[], terrain?: Terrain, origin?: Point, gridOrigin?: Point, components?:ComponentInstance[], componentDefinitions?:Record<string, ComponentDefinition>}} Model
 * @typedef {'floor'|'solid'|'drop'|'unknown'} TerrainKind
 * @typedef {{id: string, kind: TerrainKind, points?: Point[], space?: Point, outside?: boolean}} TerrainArea
 * @typedef {{points: Point[], area: number}} Space
 * @typedef {{default?: TerrainKind, areas?: TerrainArea[]}} Terrain
 * @typedef {Record<string, 'open'|'closed'>} Doors
 * @typedef {{id?: string, at: Point, range: number}} Observer
 * @typedef {{at: Point, range: number, doors: Doors, revision: string}} Observation
 * @typedef {{version: number, observers: Observer[], observations: Observation[], revisions: Record<string, Model>, doors: Doors, visibilityPaused?: boolean}} Exploration
 * @typedef {{polygon: Point[], edges: Point[][]}} Region
 * @typedef {{x: number, y: number, w: number, h: number}} Bounds
 * @typedef {{id?: string, gridStroke?: number, theme?: string, background?: string, showAxes?: boolean, showTicks?: boolean, showLabels?: boolean, unknownAs?: "marks"|"solid", doorStates?: Doors, render?: (m: Model, b: Bounds, options?: SceneOptions) => string}} SceneOptions
 */

// Portable pure model/geometry functions. No DOM or network dependencies.
const Geometry = (() => {
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        // eslint-disable-next-line security/detect-object-injection -- Fixed escape table, indexed only by the replacement regex.
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c],
    );
  const length = (w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const doorThickness = (m, o, w) =>
    o.thickness ?? Math.min(0.06, (w.thickness ?? m.wallThickness) * 0.4);
  const seatCount = (n) =>
    typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 6;
  const finite = (n) => typeof n === "number" && Number.isFinite(n);
  const TERRAIN_KINDS = ["floor", "solid", "drop", "unknown"];
  /** @type {WeakMap<object, Space[]>} */
  const enclosedCache = new WeakMap();
  /** The spaces enclosed by walls, as polygons along wall centre lines. Openings are ignored: a door or gap is still part of its wall line. Walls are split at every junction and crossing, the faces of the resulting graph are traced, and each bounded face is an enclosed space; what remains is the unbounded outside. Islands inside a space (a lift shaft) are bounded faces themselves and so are enclosed too.
   * @param {Model} m @returns {Space[]} */
  function enclosedSpaces(m) {
    const cached = enclosedCache.get(m);
    if (cached) return cached;
    const eps = 1e-7,
      key = (/** @type {Point} */ p) =>
        `${Math.round(p[0] / eps)},${Math.round(p[1] / eps)}`;
    const cross = (/** @type {Point} */ a, /** @type {Point} */ b) =>
      a[0] * b[1] - a[1] * b[0];
    /** @param {Point} a @param {Point} b @param {Point} c @param {Point} d @returns {Point|null} */
    const meeting = (a, b, c, d) => {
      const r = [b[0] - a[0], b[1] - a[1]],
        s = [d[0] - c[0], d[1] - c[1]],
        denom = cross(r, s);
      if (Math.abs(denom) < eps) return null;
      const t = cross([c[0] - a[0], c[1] - a[1]], s) / denom,
        u = cross([c[0] - a[0], c[1] - a[1]], r) / denom;
      return t > -eps && t < 1 + eps && u > -eps && u < 1 + eps
        ? [a[0] + t * r[0], a[1] + t * r[1]]
        : null;
    };
    // Cut points on each wall: other walls' ends lying on it, and crossings.
    /** @type {[Point, Point][]} */
    const walls = m.walls.map((w) => [w.a, w.b]);
    /** @type {Map<string, Point>} */
    const vertices = new Map();
    /** @type {Set<string>} */
    const edges = new Set();
    for (const [a, b] of walls) {
      const cuts = [a, b];
      for (const [c, d] of walls) {
        if (c === a) continue;
        for (const end of [c, d]) {
          const along =
            ((end[0] - a[0]) * (b[0] - a[0]) +
              (end[1] - a[1]) * (b[1] - a[1])) /
            ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
          const foot = [
            a[0] + along * (b[0] - a[0]),
            a[1] + along * (b[1] - a[1]),
          ];
          if (
            along > eps &&
            along < 1 - eps &&
            Math.hypot(foot[0] - end[0], foot[1] - end[1]) < 1e-6
          )
            cuts.push(end);
        }
        const x = meeting(a, b, c, d);
        if (x) cuts.push(x);
      }
      const along = (/** @type {Point} */ p) =>
        (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
      cuts.sort((p, q) => along(p) - along(q));
      for (let i = 1; i < cuts.length; i++) {
        // eslint-disable-next-line security/detect-object-injection -- Numeric indices into a local array.
        const [p, q] = [cuts[i - 1], cuts[i]];
        if (key(p) === key(q)) continue;
        vertices.set(key(p), p);
        vertices.set(key(q), q);
        edges.add([key(p), key(q)].sort().join("|"));
      }
    }
    /** @type {Map<string, string[]>} */
    const around = new Map();
    for (const edge of edges) {
      const [p, q] = edge.split("|");
      around.set(p, [...(around.get(p) ?? []), q]);
      around.set(q, [...(around.get(q) ?? []), p]);
    }
    const vertex = (/** @type {string} */ k) => {
      const p = vertices.get(k);
      if (!p) throw Error(`Unknown vertex ${k}`);
      return p;
    };
    const neighbours = (/** @type {string} */ k) => {
      const list = around.get(k);
      if (!list) throw Error(`Unknown vertex ${k}`);
      return list;
    };
    const angle = (/** @type {string} */ from, /** @type {string} */ to) => {
      const a = vertex(from),
        b = vertex(to);
      return Math.atan2(b[1] - a[1], b[0] - a[0]);
    };
    for (const [v, list] of around)
      list.sort((p, q) => angle(v, p) - angle(v, q));
    // Walk each directed edge keeping the face on its left; bounded faces come out counter-clockwise.
    const seen = new Set(),
      spaces = [];
    for (const [u, list] of around)
      for (const v of list) {
        if (seen.has(`${u}>${v}`)) continue;
        /** @type {Point[]} */
        const face = [];
        let from = u,
          to = v;
        while (!seen.has(`${from}>${to}`)) {
          seen.add(`${from}>${to}`);
          face.push(vertex(from));
          const next = neighbours(to);
          const back = next.indexOf(from);
          [from, to] = [to, next[(back - 1 + next.length) % next.length]];
        }
        let area = 0;
        for (let i = 0; i < face.length; i++) {
          // eslint-disable-next-line security/detect-object-injection -- Numeric indices into a local array.
          const [p, q] = [face[i], face[(i + 1) % face.length]];
          area += cross(p, q) / 2;
        }
        if (area > 1e-9) spaces.push({ points: face, area });
      }
    enclosedCache.set(m, spaces);
    return spaces;
  }
  /** The innermost enclosed space containing a position: the smallest bounded face outline around it, so a shaft inside a turret is its own space and the ring around it is the turret's.
   * @param {Model} m @param {Point} at @returns {Space|undefined} */
  function spaceAt(m, at) {
    let found;
    for (const space of enclosedSpaces(m))
      if (inside(at, space.points) && (!found || space.area < found.area))
        found = space;
    return found;
  }
  /** The enclosed space a terrain area names by a point.
   * @param {Model} m @param {TerrainArea} area */
  function areaSpace(m, area) {
    if (!area.space) throw Error(`Terrain area ${area.id} names no space`);
    return spaceAt(m, area.space);
  }
  /** Whether a terrain area covers a position: inside its polygon, or in the enclosed space it names by a point.
   * @param {Model} m @param {TerrainArea} area @param {Point} at */
  function areaHolds(m, area, at) {
    // An outside area refines the level default only; it never reaches into an enclosed space.
    if (
      area.outside &&
      enclosedSpaces(m).some((space) => inside(at, space.points))
    )
      return false;
    if (area.points) return inside(at, area.points);
    const here = spaceAt(m, at);
    return here !== undefined && here === areaSpace(m, area);
  }
  /** What the ground is at a position: the last explicit area containing it; else floor inside a space enclosed by walls; else the level default (floor unless stated), which is what lies outside every enclosed space.
   * @param {Model} m @param {Point} at @returns {TerrainKind} */
  function terrainAt(m, at) {
    const areas = m.terrain?.areas ?? [];
    for (let i = areas.length - 1; i >= 0; i--)
      // eslint-disable-next-line security/detect-object-injection -- Numeric index into the model's area list.
      if (areaHolds(m, areas[i], at)) return areas[i].kind;
    const base = m.terrain?.default ?? "floor";
    return base === "floor" ||
      enclosedSpaces(m).some((space) => inside(at, space.points))
      ? "floor"
      : base;
  }
  /** Even-odd point-in-polygon test.
   * @param {Point} point @param {Point[]} polygon */
  function inside(point, polygon) {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      // eslint-disable-next-line security/detect-object-injection -- Numeric indices into a local polygon array.
      const a = polygon[i],
        // eslint-disable-next-line security/detect-object-injection -- Numeric indices into a local polygon array.
        b = polygon[j];
      if (
        a[1] > point[1] !== b[1] > point[1] &&
        point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        result = !result;
    }
    return result;
  }
  /** @param {Model} m */
  function validate(m) {
    const fail = (s) => {
        throw Error(s);
      },
      positive = (n) => finite(n) && n > 0,
      point = (p) => Array.isArray(p) && p.length === 2 && p.every(finite);
    const validAccess = (value) =>
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).every((key) =>
        ["blocksPassage", "frontClearance"].includes(key),
      ) &&
      (value.blocksPassage === undefined ||
        typeof value.blocksPassage === "boolean") &&
      (value.frontClearance === undefined ||
        (finite(value.frontClearance) && value.frontClearance >= 0));
    if (
      !m ||
      !Array.isArray(m.walls) ||
      !Array.isArray(m.openings) ||
      !Array.isArray(m.labels) ||
      !positive(m.wallThickness)
    )
      fail("Expected walls, openings, labels and a positive wallThickness.");
    if (m.origin !== undefined && !point(m.origin))
      fail("Origin must be an [x, y] position in metres.");
    if (m.gridOrigin !== undefined && !point(m.gridOrigin))
      fail("Grid origin must be an [x, y] position in metres.");
    const ids = new Set();
    for (const o of [
      ...m.walls,
      ...m.openings,
      ...m.labels,
      ...(m.outlines ?? []),
      ...(m.circles ?? []),
      ...(m.lines ?? []),
      ...(m.stepIrons ?? []),
      ...(m.spiralStairs ?? []),
      ...(m.components ?? []),
      ...(Array.isArray(m.terrain?.areas) ? m.terrain.areas : []),
    ]) {
      if (!o || typeof o.id !== "string" || !o.id || ids.has(o.id))
        fail("Every object needs a unique id.");
      ids.add(o.id);
    }
    for (const w of m.walls)
      if (
        !point(w.a) ||
        !point(w.b) ||
        !positive(length(w)) ||
        !positive(w.thickness ?? m.wallThickness)
      )
        fail(`Invalid wall ${w.id}`);
    for (const o of m.openings) {
      const w = m.walls.find((w) => w.id === o.wall);
      if (
        !w ||
        !finite(o.offset) ||
        o.offset < 0 ||
        !positive(o.width) ||
        o.offset + o.width > length(w) + 1e-8
      )
        fail(`Opening ${o.id} must fit its wall.`);
    }
    for (const o of m.openings)
      if (o.thickness !== undefined && !positive(o.thickness))
        fail(`Invalid door thickness ${o.id}`);
    for (const l of m.labels)
      if (
        !point(l.at) ||
        typeof l.text !== "string" ||
        !positive(l.size ?? 0.4)
      )
        fail(`Invalid label ${l.id}`);
    for (const r of m.outlines ?? [])
      if (
        !point(r.at) ||
        !positive(r.width) ||
        !positive(r.height) ||
        !positive(r.stroke ?? 0.025)
      )
        fail(`Invalid outline ${r.id}`);
    for (const r of m.outlines ?? [])
      if (
        r.sides !== undefined &&
        (!Array.isArray(r.sides) ||
          !r.sides.every((s) => ["top", "right", "bottom", "left"].includes(s)))
      )
        fail(`Invalid outline sides ${r.id}`);
    for (const c of m.circles ?? [])
      if (!point(c.at) || !positive(c.radius) || !positive(c.stroke ?? 0.025))
        fail(`Invalid circle ${c.id}`);
    for (const l of m.lines ?? [])
      if (!point(l.a) || !point(l.b) || !positive(l.stroke ?? 0.025))
        fail(`Invalid line ${l.id}`);
    for (const iron of m.stepIrons ?? [])
      if (
        !point(iron.at) ||
        !positive(iron.width) ||
        !positive(iron.projection) ||
        !positive(iron.radius) ||
        !positive(iron.stroke ?? 0.035)
      )
        fail(`Invalid step iron ${iron.id}`);
    for (const stair of m.spiralStairs ?? [])
      if (
        !point(stair.at) ||
        !positive(stair.radius) ||
        !Number.isInteger(stair.treads) ||
        stair.treads < 3
      )
        fail(`Invalid spiral stair ${stair.id}`);
    if (m.components !== undefined && !Array.isArray(m.components))
      fail("Expected component instances");
    for (const [key, definition] of Object.entries(
      m.componentDefinitions ?? {},
    )) {
      if (
        !definition ||
        typeof definition.name !== "string" ||
        !definition.name ||
        key !== `${definition.id}@${definition.version}` ||
        !Number.isInteger(definition.version) ||
        definition.version < 1 ||
        ![
          "bed",
          "chair",
          "console",
          "machinery",
          "door",
          "ceiling-hatch",
          "iris-valve",
        ].includes(definition.family) ||
        !positive(definition.defaults?.width) ||
        !positive(definition.defaults?.length) ||
        (definition.defaults.direction !== undefined &&
          !["up", "down", "up-down"].includes(definition.defaults.direction)) ||
        !(["ceiling-hatch", "iris-valve"].includes(definition.family) ||
        definition.family === "door"
          ? ["ceiling-hatch", "iris-valve"].includes(definition.family) ||
            positive(definition.details?.leafThickness)
          : positive(definition.details?.headDepth)) ||
        typeof definition.blocksSight !== "boolean" ||
        !validAccess(definition.access ?? {}) ||
        (definition.family === "console" &&
          !seatCount(definition.defaults.seatCount))
      )
        fail("Invalid component definition");
    }
    if (m.terrain !== undefined) {
      const kind = (k) => TERRAIN_KINDS.includes(k),
        t = m.terrain;
      if (
        t === null ||
        typeof t !== "object" ||
        Array.isArray(t) ||
        (t.default !== undefined && !kind(t.default)) ||
        (t.areas !== undefined && !Array.isArray(t.areas))
      )
        fail("Invalid terrain.");
      for (const a of t.areas ?? []) {
        const polygon =
          Array.isArray(a.points) &&
          a.points.length >= 3 &&
          a.points.every(point);
        // Exactly one way to say where: a polygon, or a point inside an enclosed space.
        if (
          !kind(a.kind) ||
          (a.points !== undefined) === (a.space !== undefined)
        )
          fail(`Invalid terrain area ${a.id}`);
        if (a.points !== undefined && !polygon)
          fail(`Invalid terrain area ${a.id}`);
        if (a.outside !== undefined && typeof a.outside !== "boolean")
          fail(`Invalid terrain area ${a.id}`);
        if (a.space !== undefined && !point(a.space))
          fail(`Invalid terrain area ${a.id}`);
        if (a.space !== undefined && !spaceAt(m, a.space))
          fail(`Terrain area ${a.id} names no enclosed space at ${a.space}`);
      }
    }
    for (const instance of m.components ?? []) {
      const definition = m.componentDefinitions?.[instance.definition];
      if (
        !definition ||
        ![
          "bed",
          "chair",
          "console",
          "machinery",
          "door",
          "ceiling-hatch",
          "iris-valve",
        ].includes(definition.family) ||
        (definition.family !== "door" &&
          (!point(instance.at) || !finite(instance.rotation))) ||
        (definition.family !== "door" && "opening" in instance) ||
        (instance.settings !== undefined &&
          (instance.settings === null ||
            typeof instance.settings !== "object" ||
            Array.isArray(instance.settings))) ||
        !validAccess(instance.access ?? {}) ||
        (instance.blocksSight !== undefined &&
          typeof instance.blocksSight !== "boolean") ||
        (definition.family === "console" &&
          !seatCount(
            instance.settings?.seatCount ?? definition.defaults.seatCount,
          )) ||
        Object.keys(instance.settings ?? {}).some(
          (key) =>
            !(
              ["ceiling-hatch", "iris-valve"].includes(definition.family)
                ? ["width", "length", "direction", "state"]
                : definition.family === "console"
                  ? ["seatCount"]
                  : ["width", "length"]
            ).includes(key),
        ) ||
        !positive(instance.settings?.width ?? definition.defaults.width) ||
        !positive(instance.settings?.length ?? definition.defaults.length) ||
        (definition.family === "door"
          ? !m.openings.some((o) => o.id === instance.opening) ||
            (m.components ?? []).filter((i) => i.opening === instance.opening)
              .length > 1 ||
            Object.keys(instance.settings ?? {}).length > 0
          : ["ceiling-hatch", "iris-valve"].includes(definition.family)
            ? !["up", "down", "up-down"].includes(
                instance.settings?.direction ??
                  definition.defaults.direction ??
                  "up",
              ) ||
              !["open", "closed"].includes(instance.settings?.state ?? "closed")
            : !positive(definition.details.headDepth))
      )
        fail(`Invalid component ${instance.id}`);
    }
    return m;
  }
  // A shared contour convention describes vertical access, not its open state.
  function verticalAccessSymbol(family, width, length, direction) {
    const contour = (inset, name, dashed) => {
      const w = width - 2 * inset,
        h = length - 2 * inset;
      const style = `data-access-contour="${name}" stroke-dasharray="${dashed ? ".1 .07" : "none"}"`;
      if (family === "iris-valve")
        return `<ellipse ${style} cx="${width / 2}" cy="${length / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
      // Joined hinge and round leaf: omit the arc covered by the hinge.
      const cx = width / 2,
        cy = inset + h * 0.56,
        rx = Math.min(w * 0.48, h * 0.42),
        ry = rx;
      const hingeHalfWidth =
          Math.min(width * 0.2, Math.min(width * 0.48, length * 0.42) / 2) -
          inset,
        left = cx - hingeHalfWidth,
        right = cx + hingeHalfWidth,
        top = cy - ry * Math.sqrt(1 - (hingeHalfWidth / rx) ** 2);
      return `<path ${style} data-hatch-hinge="joined" d="M ${left} ${top} V ${inset + h * 0.04} H ${right} V ${top} A ${rx} ${ry} 0 1 1 ${left} ${top} Z"/>`;
    };
    let svg = contour(0, "outer", direction === "up");
    if (direction === "up-down")
      svg += contour(Math.min(width, length) * 0.09, "inner", true);
    if (family === "ceiling-hatch")
      svg += `<circle data-hatch-handle="round" cx="${width / 2}" cy="${length * 0.56}" r="${Math.min(width, length) * 0.065}"/>`;
    return svg;
  }
  // Wall/offset/width remain authoritative on the existing opening.
  function accessOpening(m, opening) {
    const instance = (m.components ?? []).find((i) => i.opening === opening.id);
    const definition =
      instance && m.componentDefinitions?.[instance.definition];
    if (definition?.family !== "door") return opening;
    const wall = m.walls.find((w) => w.id === opening.wall);
    return {
      ...opening,
      type: "double-closed",
      thickness: Math.min(
        opening.thickness ?? definition.details.leafThickness,
        (wall?.thickness ?? m.wallThickness) * 0.4,
      ),
      blocksSight: componentSemantics(m, instance).blocksSight,
    };
  }
  // Family settings change the footprint while retaining a physical head/back depth.
  function furniture(m, instance) {
    const definition = m.componentDefinitions?.[instance.definition];
    if (!definition)
      throw Error(`Unknown component definition ${instance.definition}`);
    return {
      width:
        definition.family === "console"
          ? definition.defaults.width *
            (instance.settings?.seatCount ?? definition.defaults.seatCount)
          : (instance.settings?.width ?? definition.defaults.width),
      seatCount: instance.settings?.seatCount ?? definition.defaults.seatCount,
      length: instance.settings?.length ?? definition.defaults.length,
      headDepth: definition.details.headDepth,
      family: definition.family,
    };
  }
  /** Resolve authored sight/access independently; clearance is guidance, not movement enforcement.
   * @param {Model} m @param {ComponentInstance} instance
   */
  function componentSemantics(m, instance) {
    const definition = m.componentDefinitions?.[instance.definition];
    if (!definition)
      throw Error(`Unknown component definition ${instance.definition}`);
    const opening =
      definition.family === "door"
        ? m.openings.find((o) => o.id === instance.opening)
        : undefined;
    return {
      blocksSight:
        instance.blocksSight ?? opening?.blocksSight ?? definition.blocksSight,
      access: { ...definition.access, ...instance.access },
    };
  }
  function componentPoints(m, instance, padding = 0) {
    if (instance.opening) {
      const opening = accessOpening(
          m,
          m.openings.find((o) => o.id === instance.opening),
        ),
        wall = m.walls.find((w) => w.id === opening.wall),
        len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]),
        ux = (wall.b[0] - wall.a[0]) / len,
        uy = (wall.b[1] - wall.a[1]) / len,
        half = doorThickness(m, opening, wall) / 2 + padding;
      return [
        [opening.offset - padding, half],
        [opening.offset + opening.width + padding, half],
        [opening.offset + opening.width + padding, -half],
        [opening.offset - padding, -half],
      ].map(([d, n]) => [
        wall.a[0] + ux * d - uy * n,
        wall.a[1] + uy * d + ux * n,
      ]);
    }
    const { width, length } = furniture(m, instance),
      angle = (instance.rotation * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle);
    return [
      [-padding, -padding],
      [width + padding, -padding],
      [width + padding, length + padding],
      [-padding, length + padding],
    ].map(([x, y]) => [
      instance.at[0] + x * c - y * s,
      instance.at[1] + x * s + y * c,
    ]);
  }
  /** @param {Model} m @param {Wall} w */
  function wallPolygons(m, w) {
    const len = length(w),
      t = (w.thickness ?? m.wallThickness) / 2,
      ux = (w.b[0] - w.a[0]) / len,
      uy = (w.b[1] - w.a[1]) / len;
    // Merge overlapping openings before splitting wall geometry. Only original
    // wall endpoints extend by half thickness; opening edges have butt ends.
    const gaps = m.openings
      .filter((o) => o.wall === w.id)
      .map((o) => [o.offset, o.offset + o.width])
      .sort((a, b) => a[0] - b[0]);
    /** @type {number[][]} */
    const merged = [];
    for (const gap of gaps) {
      const last = merged.at(-1);
      if (last && gap[0] <= last[1]) last[1] = Math.max(last[1], gap[1]);
      else merged.push([...gap]);
    }
    /** @type {number[][]} */
    const spans = [];
    let cursor = 0;
    for (const [a, b] of merged) {
      if (a > cursor) spans.push([cursor, a]);
      cursor = b;
    }
    if (cursor < len) spans.push([cursor, len]);
    return spans.map(([a, b]) => {
      if (a === 0 && !merged.some((g) => g[0] === 0)) a -= t;
      if (b === len && !merged.some((g) => g[1] === len)) b += t;
      return [
        [a, t],
        [b, t],
        [b, -t],
        [a, -t],
      ].map(([d, n]) => [w.a[0] + ux * d - uy * n, w.a[1] + uy * d + ux * n]);
    });
  }
  /** @param {Model} m */
  function bounds(m) {
    const pts = m.walls.flatMap((w) => wallPolygons(m, w).flat());
    for (const r of m.outlines ?? []) {
      const t = (r.stroke ?? 0.025) / 2;
      pts.push(
        [r.at[0] - t, r.at[1] - t],
        [r.at[0] + r.width + t, r.at[1] + r.height + t],
      );
    }
    for (const c of m.circles ?? [])
      pts.push(
        [c.at[0] - c.radius, c.at[1] - c.radius],
        [c.at[0] + c.radius, c.at[1] + c.radius],
      );
    for (const l of m.lines ?? []) pts.push(l.a, l.b);
    for (const stair of m.spiralStairs ?? [])
      pts.push(
        [stair.at[0] - stair.radius, stair.at[1] - stair.radius],
        [stair.at[0] + stair.radius, stair.at[1] + stair.radius],
      );
    for (const l of m.labels) {
      const s = l.size ?? 0.4,
        half = l.text.length * s * 0.34;
      pts.push([l.at[0] - half, l.at[1] - s], [l.at[0] + half, l.at[1] + s]);
    }
    for (const instance of m.components ?? [])
      pts.push(...componentPoints(m, instance, 0.0125));
    // Rock and undecided ground are background, like the level default; floor and drop areas are content.
    for (const area of m.terrain?.areas ?? [])
      if (area.kind === "floor" || area.kind === "drop")
        pts.push(...(area.points ?? []));
    if (!pts.length) return { x: 0, y: 0, w: 21, h: 15 };
    const xs = pts.map((p) => p[0]),
      ys = pts.map((p) => p[1]);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  }
  /** Colours of the drawing. `sheet` is the paper, also used to knock out linework behind labels. Blueprint is white linework on a cyanotype sheet; its axes are salmon rather than red so they stay legible on blue.
   * @typedef {{sheet: string, grid: string, ink: string, inkSoft: string, doorFill: string, label: string, axis: string, armStroke: string, rock: string}} Palette */
  /** @type {Record<string, Palette>} */
  const THEMES = {
    light: {
      sheet: "white",
      grid: "#9aa79f",
      ink: "#27332e",
      inkSoft: "#536158",
      doorFill: "#eef1ef",
      label: "#263c30",
      axis: "#d62929",
      armStroke: "black",
      rock: "#808080",
    },
    blueprint: {
      sheet: "#1c4f8f",
      grid: "#6f9bd6",
      ink: "#eef4ff",
      inkSoft: "#b7cdee",
      doorFill: "#1c4f8f",
      label: "#eef4ff",
      axis: "#ff9a8a",
      armStroke: "#eef4ff",
      rock: "#7fa3d6",
    },
  };
  /** @param {string} theme */
  function palette(theme) {
    // eslint-disable-next-line security/detect-object-injection -- Theme names are validated against the declared table.
    const c = Object.hasOwn(THEMES, theme) ? THEMES[theme] : undefined;
    if (!c) throw Error(`Unknown theme ${theme}`);
    return c;
  }
  /** Tick marks and metre numbers every 3 m along the reference axes, so positions can be quoted to the agent. X grows right and Y grows up, so a tick above the origin is positive although model y grows downward.
   * @param {Bounds} b @param {number} ox @param {number} oy @param {number} gridStroke @param {Palette} c */
  function axisTicks(b, ox, oy, gridStroke, c) {
    let step = 3;
    while (Math.max(b.w, b.h) / step > 40) step *= 2;
    const size = Math.max(0.3, step / 10),
      stroke = gridStroke * 1.5,
      text = (/** @type {string} */ attrs, /** @type {number} */ value) =>
        `<text data-axis-tick ${attrs} font-family="sans-serif" font-size="${size}" fill="${c.axis}" stroke="${c.sheet}" stroke-width="${size / 5}" paint-order="stroke">${value}</text>`;
    let s = `<g data-axis-ticks stroke="${c.axis}" stroke-width="${stroke}">`;
    for (
      let k = Math.ceil((b.x - ox) / step);
      ox + k * step <= b.x + b.w;
      k++
    ) {
      if (!k) continue;
      const x = ox + k * step;
      s += `<path d="M ${x} ${oy - size / 2} V ${oy + size / 2}"/>`;
      s += text(
        `x="${x}" y="${oy + size * 1.7}" text-anchor="middle"`,
        k * step,
      );
    }
    for (
      let k = Math.ceil((b.y - oy) / step);
      oy + k * step <= b.y + b.h;
      k++
    ) {
      if (!k) continue;
      const y = oy + k * step;
      s += `<path d="M ${ox - size / 2} ${y} H ${ox + size / 2}"/>`;
      s += text(
        `x="${ox - size * 0.8}" y="${y + size / 3}" text-anchor="end"`,
        -k * step,
      );
    }
    return s + "</g>";
  }
  /** Dashed A4 page borders (21 m by 15 m, the printed sheet at the 1.5 m grid) repeating the origin cross; the axes themselves are the borders at zero and are drawn solid.
   * @param {Bounds} b @param {number} ox @param {number} oy @param {number} gridStroke @param {Palette} c */
  function pageBorders(b, ox, oy, gridStroke, c) {
    let d = "";
    for (let k = Math.ceil((b.x - ox) / 21); ox + k * 21 <= b.x + b.w; k++)
      if (k) d += `M ${ox + k * 21} ${b.y} V ${b.y + b.h} `;
    for (let k = Math.ceil((b.y - oy) / 15); oy + k * 15 <= b.y + b.h; k++)
      if (k) d += `M ${b.x} ${oy + k * 15} H ${b.x + b.w} `;
    return `<path data-page-borders d="${d.trim()}" fill="none" stroke="${c.axis}" stroke-opacity=".6" stroke-width="${gridStroke * 1.5}" stroke-dasharray="${gridStroke * 12} ${gridStroke * 8}"/>`;
  }
  // Solid ground in the manner of classic dungeon maps: one 6 m tile of 16 irregular sections, each hatched with parallel strokes at its own angle (neighbours differ by at least 40 degrees, and none lies within 20 degrees of horizontal or vertical, which would read as a grid), small gaps between sections, strokes trimmed short. Generated once from a periodic Voronoi division with a fixed seed, so the tile repeats without seams; only strokes, never a fill, so it prints cleanly on white. Drawn in a mid grey (the palette's `rock`) to stay discreet beside the black walls.
  const ROCK_TILE = 6;
  const ROCK_STROKES =
    "M 0.813 0.035 L 1.097 0.138 M 0.556 0.175 L 1.243 0.426 M 0.369 0.341 L 1.343 0.696 M 0.174 0.504 L 1.455 0.971 M 0.081 0.705 L 1.544 1.237 M 0.084 0.94 L 1.466 1.443 M 0.022 1.152 L 1.263 1.604 M 0.153 1.433 L 0.398 1.523 M 1.4 2.694 L 0.455 3.135 M 1.367 2.467 L 0.274 2.976 M 1.333 2.24 L 0.203 2.767 M 1.334 1.997 L 0.191 2.529 M 1.27 1.784 L 0.233 2.267 M 0.927 1.701 L 0.219 2.031 M 0.504 1.655 L 0.237 1.78 M 0.901 3.304 L 1.121 3.686 M 0.655 3.319 L 1.369 4.555 M 0.39 3.3 L 1.099 4.528 M 0.272 3.535 L 0.848 4.532 M 0.168 3.796 L 0.546 4.45 M 0.039 4.011 L 0.288 4.442 M 1.111 5.648 L 0.604 5.884 M 1.136 5.393 L 0.482 5.698 M 1.216 5.113 L 0.373 5.506 M 1.305 4.829 L 0.245 5.323 M 1.043 4.709 L 0.113 5.142 M 0.67 4.64 L 0.028 4.939 M 0.245 4.595 L 0.059 4.682 M 2.726 0.985 L 2.053 1.23 M 2.702 0.76 L 1.765 1.101 M 2.699 0.527 L 1.639 0.913 M 2.633 0.317 L 1.572 0.703 M 2.608 0.092 L 1.445 0.515 M 2.168 0.018 L 1.399 0.298 M 1.503 0.026 L 1.284 0.105 M 2.513 1.376 L 2.739 1.861 M 2.255 1.344 L 2.697 2.292 M 2.045 1.414 L 2.635 2.68 M 1.787 1.381 L 2.449 2.801 M 1.62 1.543 L 2.188 2.761 M 1.46 1.72 L 1.911 2.689 M 1.523 2.377 L 1.675 2.702 M 1.804 2.857 L 2.802 3.22 M 1.465 2.968 L 2.74 3.431 M 1.258 3.126 L 2.706 3.653 M 1.066 3.291 L 2.627 3.859 M 1.222 3.582 L 2.617 4.089 M 1.329 3.854 L 2.591 4.314 M 1.516 4.157 L 2.13 4.38 M 2.942 4.874 L 2.586 5.85 M 2.782 4.671 L 2.371 5.799 M 2.623 4.464 L 2.131 5.816 M 2.384 4.477 L 1.909 5.783 M 2.138 4.508 L 1.661 5.819 M 1.888 4.552 L 1.441 5.782 M 1.642 4.587 L 1.214 5.761 M 4.129 0.046 L 4.275 0.168 M 3.75 0.015 L 4.21 0.401 M 3.452 0.052 L 4.108 0.602 M 3.064 0.014 L 4.009 0.807 M 2.821 0.096 L 3.952 1.045 M 2.853 0.41 L 3.834 1.234 M 2.887 0.726 L 3.478 1.222 M 2.895 1.02 L 3.151 1.236 M 3.299 5.636 L 3.706 5.978 M 2.998 5.671 L 3.335 5.954 M 4.434 2.638 L 3.975 3.023 M 4.392 2.386 L 3.609 3.044 M 4.373 2.115 L 3.213 3.089 M 4.318 1.874 L 2.926 3.042 M 4.118 1.755 L 2.801 2.86 M 3.974 1.589 L 2.772 2.597 M 3.857 1.399 L 2.849 2.245 M 3.491 1.42 L 2.919 1.899 M 3.149 1.419 L 2.993 1.55 M 4.248 3.161 L 4.392 3.471 M 4.012 3.174 L 4.498 4.219 M 3.795 3.231 L 4.296 4.306 M 3.557 3.24 L 4.085 4.374 M 3.32 3.253 L 3.863 4.417 M 3.089 3.279 L 3.65 4.481 M 2.923 3.444 L 3.441 4.553 M 2.858 3.825 L 3.245 4.654 M 2.774 4.164 L 3.015 4.681 M 4.615 5.847 L 4.414 5.963 M 4.694 5.547 L 4.134 5.871 M 4.739 5.268 L 3.925 5.737 M 4.844 4.953 L 3.692 5.618 M 4.878 4.679 L 3.45 5.504 M 4.709 4.523 L 3.179 5.406 M 4.383 4.457 L 3.118 5.187 M 3.425 4.756 L 3.161 4.908 M 5.805 0.69 L 5.44 1.321 M 5.625 0.562 L 5.061 1.537 M 5.413 0.488 L 4.699 1.724 M 5.243 0.344 L 4.449 1.718 M 5.025 0.28 L 4.272 1.585 M 4.844 0.154 L 4.113 1.419 M 4.64 0.068 L 4.09 1.02 M 5.817 1.318 L 5.987 1.682 M 5.64 1.459 L 5.966 2.158 M 5.456 1.584 L 5.98 2.707 M 5.249 1.661 L 5.759 2.754 M 5.049 1.752 L 5.523 2.768 M 4.843 1.832 L 5.274 2.756 M 4.658 1.955 L 5.038 2.771 M 4.565 2.276 L 4.779 2.734 M 0.271 3.247 L 0.015 3.796 M 0.115 3.06 L 0.021 3.263 M 5.975 3.361 L 5.448 4.492 M 5.909 2.982 L 5.204 4.493 M 5.684 2.944 L 4.974 4.467 M 5.44 2.947 L 4.802 4.315 M 5.187 2.969 L 4.659 4.1 M 4.946 2.966 L 4.588 3.732 M 4.74 2.886 L 4.503 3.394 M 0.071 5.713 L 0.377 5.825 M 5.593 0.008 L 5.91 0.123 M 5.004 0.027 L 5.946 0.37 M 5.175 4.685 L 5.752 4.895 M 5.065 4.879 L 5.958 5.204 M 4.985 5.084 L 5.972 5.443 M 4.98 5.316 L 5.942 5.666 M 4.923 5.53 L 5.915 5.891 M 4.818 5.726 L 5.511 5.978";
  // A drop is air with no floor: sparse, irregularly placed dots (a periodic dart-throwing tile, 38 dots per 3 m by 3 m, none closer than 0.36 m, fixed seed). Round-capped tiny strokes make the dots, so it stays a single path.
  const DROP_TILE = 3;
  const DROP_DOTS =
    "M 0.4 2.54 l .01 0 M 2.29 0.77 l .01 0 M 1.49 1.35 l .01 0 M 1.95 2.37 l .01 0 M 0.28 0.09 l .01 0 M 2.51 1.3 l .01 0 M 2.29 0.01 l .01 0 M 1.34 2.16 l .01 0 M 0.69 2.84 l .01 0 M 2.7 0.09 l .01 0 M 0.08 1.62 l .01 0 M 0.65 1.27 l .01 0 M 0.09 0.67 l .01 0 M 0.7 0.69 l .01 0 M 2.51 1.67 l .01 0 M 1.93 0.56 l .01 0 M 2.98 2.58 l .01 0 M 0.36 1 l .01 0 M 0.91 1.76 l .01 0 M 1.52 1.77 l .01 0 M 0.52 1.65 l .01 0 M 2.11 2.02 l .01 0 M 1.12 1.32 l .01 0 M 1.47 0.09 l .01 0 M 0.13 2.11 l .01 0 M 1.18 0.51 l .01 0 M 2.35 2.46 l .01 0 M 2.66 2.22 l .01 0 M 2.13 1.36 l .01 0 M 1.53 0.63 l .01 0 M 0.62 2.02 l .01 0 M 0.98 2.61 l .01 0 M 2.8 1.03 l .01 0 M 2.73 0.64 l .01 0 M 1.02 0.87 l .01 0 M 0.94 0.19 l .01 0 M 1.48 2.59 l .01 0 M 1.87 0.95 l .01 0";
  /** Ground that is not plain floor, drawn without any fill colour: one rectangle for the level default, then per area in order a polygon that clears what lies beneath and, for solid and drop, one carrying the pattern. Drawn under the grid.
   * @param {Model} m @param {Bounds} b @param {string} id @param {string} sheet @param {Palette} c @param {string} unknownAs @param {Point} gridOrigin */
  function terrainLayer(m, b, id, sheet, c, unknownAs, gridOrigin) {
    const base = m.terrain?.default ?? "floor",
      areas = m.terrain?.areas ?? [];
    if (base === "floor" && !areas.length) return "";
    // The players' view draws undecided ground as plain rock: it must not tell them it is undecided.
    const shown = (/** @type {TerrainKind} */ kind) =>
      kind === "unknown" && unknownAs === "solid" ? "solid" : kind;
    const kinds = new Set([shown(base), ...areas.map((a) => shown(a.kind))]);
    const patterns = {
      solid: `<pattern id="${id}-solid" width="${ROCK_TILE}" height="${ROCK_TILE}" patternUnits="userSpaceOnUse"><path d="${ROCK_STROKES}" fill="none" stroke="${c.rock}" stroke-width=".018" stroke-linecap="round"/></pattern>`,
      drop: `<pattern id="${id}-drop" width="${DROP_TILE}" height="${DROP_TILE}" patternUnits="userSpaceOnUse"><path d="${DROP_DOTS}" fill="none" stroke="${c.rock}" stroke-width=".07" stroke-linecap="round"/></pattern>`,
      // One question mark per grid square, in the grid's own squares.
      unknown: `<pattern id="${id}-unknown" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="translate(${gridOrigin[0]} ${gridOrigin[1]})"><text x=".75" y=".75" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size=".7" fill="${c.rock}">?</text></pattern>`,
    };
    let s = `<defs>${kinds.has("solid") ? patterns.solid : ""}${kinds.has("drop") ? patterns.drop : ""}${kinds.has("unknown") ? patterns.unknown : ""}</defs>`;
    const fill = (/** @type {TerrainKind} */ kind) =>
      kind === "floor" ? sheet : `url(#${id}-${shown(kind)})`;
    /** @param {TerrainArea} a */
    const paint = (a) => {
      const outline = a.points ?? areaSpace(m, a)?.points ?? [],
        points = outline.map((p) => p.join(",")).join(" ");
      return a.kind === "floor"
        ? `<polygon data-terrain-area="${esc(a.id)}" data-terrain-kind="floor" points="${points}" fill="${sheet}"/>`
        : `<polygon points="${points}" fill="${sheet}"/><polygon data-terrain-area="${esc(a.id)}" data-terrain-kind="${shown(a.kind)}" points="${points}" fill="${fill(a.kind)}"/>`;
    };
    if (base !== "floor")
      s += `<rect data-terrain="${shown(base)}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${fill(base)}"/>`;
    // Outside areas refine the default, so they go down first; the enclosed spaces are then cleared over them.
    for (const a of areas) if (a.outside) s += paint(a);
    if (base !== "floor" || areas.some((a) => a.outside))
      for (const space of enclosedSpaces(m))
        s += `<polygon points="${space.points.map((p) => p.join(",")).join(" ")}" fill="${sheet}"/>`;
    for (const a of areas) if (!a.outside) s += paint(a);
    return s;
  }
  /** @param {Model} m @param {Bounds} b @param {SceneOptions} [options] */
  function scene(
    m,
    b,
    {
      id = "grid",
      gridStroke = 0.018,
      theme = "light",
      background = palette(theme).sheet,
      showAxes = true,
      showTicks = false,
      showLabels = true,
      unknownAs = "marks",
      doorStates = {},
    } = {},
  ) {
    const c = palette(theme),
      [ox, oy] = m.origin ?? [0, 0],
      [gx, gy] = m.gridOrigin ?? [0, 0];
    let s = `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${background}"/>`;
    s += terrainLayer(m, b, id, background, c, unknownAs, [gx, gy]);
    s += `<defs><pattern id="${id}" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="translate(${gx} ${gy})"><path d="M 1.5 0 H 0 V 1.5" fill="none" stroke="${c.grid}" stroke-width="${gridStroke}"/></pattern></defs><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#${id})"/>`;
    if (m.origin && showAxes) s += pageBorders(b, ox, oy, gridStroke, c);
    if (m.origin && showAxes)
      s += `<path d="M ${b.x} ${oy} H ${b.x + b.w} M ${ox} ${b.y} V ${b.y + b.h}" fill="none" stroke="${c.axis}" stroke-width="${gridStroke * 1.5}"/>`;
    if (m.origin && showAxes && showTicks)
      s += axisTicks(b, ox, oy, gridStroke, c);
    for (const w of m.walls)
      for (const p of wallPolygons(m, w))
        s += `<polygon data-wall="${esc(w.id)}" points="${p.map((p) => p.join(",")).join(" ")}" fill="${c.ink}"/>`;
    for (const r of m.outlines ?? []) {
      if (r.sides) {
        const [x, y] = r.at,
          edges = {
            top: [
              [x, y],
              [x + r.width, y],
            ],
            right: [
              [x + r.width, y],
              [x + r.width, y + r.height],
            ],
            bottom: [
              [x + r.width, y + r.height],
              [x, y + r.height],
            ],
            left: [
              [x, y + r.height],
              [x, y],
            ],
          };
        const d = r.sides
          .map((side) => {
            // eslint-disable-next-line security/detect-object-injection -- Side names are limited to the four declared outline sides.
            const [a, b] = edges[side];
            return `M ${a.join(" ")} L ${b.join(" ")}`;
          })
          .join(" ");
        s += `<path data-outline="${esc(r.id)}" d="${d}" fill="none" stroke="${c.ink}" stroke-width="${r.stroke ?? 0.025}"${r.dashed ? ' stroke-dasharray=".1 .07"' : ""}/>`;
      } else
        s += `<rect data-outline="${esc(r.id)}" x="${r.at[0]}" y="${r.at[1]}" width="${r.width}" height="${r.height}" fill="none" stroke="${c.ink}" stroke-width="${r.stroke ?? 0.025}"${r.dashed ? ' stroke-dasharray=".1 .07"' : ""}/>`;
    }
    for (const o of m.openings
      .map((o) => accessOpening(m, o))
      .filter(
        (o) =>
          o.type === "sliding" ||
          o.type === "double-closed" ||
          o.type === "single-closed",
      )) {
      const open = doorStates[o.id] === "open";
      const w = m.walls.find((w) => w.id === o.wall);
      if (!w) throw Error(`Unknown wall ${o.wall}`);
      const len = length(w),
        ux = (w.b[0] - w.a[0]) / len,
        uy = (w.b[1] - w.a[1]) / len;
      const half = doorThickness(m, o, w) / 2;
      const instance = (m.components ?? []).find((i) => i.opening === o.id);
      if (instance)
        s += `<g data-component="${esc(instance.id)}" data-definition="${esc(instance.definition)}">`;
      const panels = o.type === "single-closed" ? 1 : 2;
      for (let i = 0; i < panels; i++) {
        const a = o.offset + (i * o.width) / panels + 0.01,
          b = o.offset + ((i + 1) * o.width) / panels - 0.01;
        const points = [
          [a, half],
          [b, half],
          [b, -half],
          [a, -half],
        ].map(([d, n]) => [w.a[0] + ux * d - uy * n, w.a[1] + uy * d + ux * n]);
        s += `<polygon data-door="${esc(o.id)}" data-door-state="${open ? "open" : "closed"}" points="${points.map((p) => p.join(",")).join(" ")}" fill="${open ? "none" : c.doorFill}" stroke="${open ? c.inkSoft : c.ink}" stroke-width=".025"${open ? ' stroke-dasharray=".08 .06"' : ""}/>`;
      }
      if (instance) s += "</g>";
    }
    for (const o of m.openings.filter((o) => o.type === "double-swing")) {
      const w = m.walls.find((w) => w.id === o.wall);
      if (!w) throw Error(`Unknown wall ${o.wall}`);
      const len = length(w),
        ux = (w.b[0] - w.a[0]) / len,
        uy = (w.b[1] - w.a[1]) / len;
      const nx = -uy,
        ny = ux,
        r = o.width / 2,
        angle = ((o.angle ?? 90) * Math.PI) / 180;
      const a = [w.a[0] + ux * o.offset, w.a[1] + uy * o.offset],
        b = [a[0] + ux * o.width, a[1] + uy * o.width];
      const mid = [a[0] + ux * r, a[1] + uy * r];
      const ae = [
        a[0] + ux * r * Math.cos(angle) + nx * r * Math.sin(angle),
        a[1] + uy * r * Math.cos(angle) + ny * r * Math.sin(angle),
      ];
      const be = [
        b[0] - ux * r * Math.cos(angle) + nx * r * Math.sin(angle),
        b[1] - uy * r * Math.cos(angle) + ny * r * Math.sin(angle),
      ];
      s += `<path data-door="${esc(o.id)}" d="M ${a.join(" ")} L ${ae.join(" ")} M ${b.join(" ")} L ${be.join(" ")}" fill="none" stroke="${c.ink}" stroke-width=".045"/>`;
      s += `<path d="M ${ae.join(" ")} A ${r} ${r} 0 0 0 ${mid.join(" ")} M ${be.join(" ")} A ${r} ${r} 0 0 1 ${mid.join(" ")}" fill="none" stroke="${c.inkSoft}" stroke-width=".025"/>`;
    }
    for (const circle of m.circles ?? [])
      s += `<circle data-symbol="${esc(circle.id)}" cx="${circle.at[0]}" cy="${circle.at[1]}" r="${circle.radius}" fill="none" stroke="${c.ink}" stroke-width="${circle.stroke ?? 0.025}"${circle.dashed ? ' stroke-dasharray=".1 .07"' : ""}/>`;
    for (const l of m.lines ?? [])
      s += `<path data-symbol="${esc(l.id)}" d="M ${l.a.join(" ")} L ${l.b.join(" ")}" fill="none" stroke="${c.ink}" stroke-width="${l.stroke ?? 0.025}"/>`;
    for (const iron of m.stepIrons ?? []) {
      const [x, y] = iron.at,
        w = iron.width / 2,
        d = iron.projection,
        r = iron.radius,
        dir = iron.direction ?? 1;
      s += `<path data-symbol="${esc(iron.id)}" transform="translate(${x} ${y}) scale(${dir} 1)" d="M 0 ${-w} H ${d - r} Q ${d} ${-w} ${d} ${-w + r} V ${w - r} Q ${d} ${w} ${d - r} ${w} H 0" fill="none" stroke="${c.ink}" stroke-width="${iron.stroke ?? 0.035}" stroke-linecap="round"/>`;
    }
    for (const stair of m.spiralStairs ?? []) {
      const [cx, cy] = stair.at,
        r = stair.radius,
        startAngle = stair.startAngle ?? 30,
        sweep = stair.sweep ?? 300;
      const point = (radius, degrees) => {
        const a = (degrees * Math.PI) / 180;
        return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
      };
      const start = point(r, startAngle),
        end = point(r, startAngle + sweep);
      s += `<g data-symbol="${esc(stair.id)}" stroke="${c.ink}" fill="none"><path d="M ${start.join(" ")} A ${r} ${r} 0 1 1 ${end.join(" ")}" stroke-width=".035"/>`;
      for (let i = 0; i <= stair.treads; i++) {
        const angle = startAngle + (sweep * i) / stair.treads,
          a = point(0.12, angle),
          b = point(r, angle);
        s += `<path d="M ${a.join(" ")} L ${b.join(" ")}" stroke-width=".025"/>`;
      }
      s += `<circle cx="${cx}" cy="${cy}" r=".1" fill="${c.ink}" stroke="none"/>`;
      const ar = r * 0.6,
        a = point(ar, startAngle + 25),
        b = point(ar, startAngle + sweep - 30),
        angle = ((startAngle + sweep - 30) * Math.PI) / 180;
      const tip = b,
        back = [b[0] + 0.18 * Math.sin(angle), b[1] - 0.18 * Math.cos(angle)],
        normal = [Math.cos(angle) * 0.075, Math.sin(angle) * 0.075];
      s += `<path d="M ${a.join(" ")} A ${ar} ${ar} 0 1 1 ${b.join(" ")}" stroke="${c.sheet}" stroke-width=".1"/><path d="M ${a.join(" ")} A ${ar} ${ar} 0 1 1 ${b.join(" ")}" stroke-width=".035"/><polygon points="${tip.join(",")} ${[back[0] + normal[0], back[1] + normal[1]].join(",")} ${[back[0] - normal[0], back[1] - normal[1]].join(",")}" fill="${c.ink}" stroke="none"/>`;
      s += `<rect x="${cx - 1.05}" y="${cy + 0.3}" width=".86" height=".26" fill="${c.sheet}" stroke="none"/><text x="${cx - 0.62}" y="${cy + 0.49}" text-anchor="middle" font-family="sans-serif" font-size=".2" fill="${c.ink}" stroke="none">${stair.direction === "up" ? "UP" : "DOWN"}</text></g>`;
    }
    for (const instance of m.components ?? []) {
      if (instance.opening) continue;
      if (!instance.at) throw Error(`Missing position ${instance.id}`);
      const { width, length, headDepth, family, seatCount } = furniture(
        m,
        instance,
      );
      if (["ceiling-hatch", "iris-valve"].includes(family)) {
        const definition = m.componentDefinitions?.[instance.definition];
        if (!definition)
          throw Error(`Unknown component definition ${instance.definition}`);
        const direction =
            instance.settings?.direction ??
            definition.defaults.direction ??
            "up",
          state = instance.settings?.state ?? "closed";
        if (
          family === "iris-valve" ||
          definition.details.profile === "referee-2026-10-11"
        )
          s += `<g data-component="${esc(instance.id)}" data-definition="${esc(instance.definition)}" data-access-direction="${direction}" data-access-state="${state}" transform="translate(${instance.at.join(" ")}) rotate(${instance.rotation})" fill="none" stroke="${c.ink}" stroke-width=".025">${verticalAccessSymbol(family, width, length, direction)}</g>`;
        else {
          s += `<g data-component="${esc(instance.id)}" data-definition="${esc(instance.definition)}" data-access-direction="${direction}" data-access-state="${state}" transform="translate(${instance.at.join(" ")}) rotate(${instance.rotation})"><circle cx="${width / 2}" cy="${length / 2}" r="${Math.min(width, length) / 2}" fill="none" stroke="${c.ink}" stroke-width=".025" stroke-dasharray=".1 .07"/><text x="${width / 2}" y="${length / 2}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size=".16" fill="${c.ink}">${direction.toUpperCase()}</text></g>`;
        }
        continue;
      }
      if (
        ["chair", "bed", "console"].includes(family) &&
        m.componentDefinitions?.[instance.definition].details.profile ===
          "referee-2026-10-11"
      ) {
        s += `<g data-component="${esc(instance.id)}" data-definition="${esc(instance.definition)}" transform="translate(${instance.at.join(" ")}) rotate(${instance.rotation})" fill="none" stroke="${c.ink}" stroke-width=".025">${family === "chair" ? chairSymbol(width, length, c) : family === "bed" ? bedSymbol(width, length, headDepth) : consoleSymbol(width, length, seatCount, m.componentDefinitions[instance.definition].details.desk === true, c)}</g>`;
        continue;
      }
      s += `<g data-component="${esc(instance.id)}" data-definition="${esc(instance.definition)}" transform="translate(${instance.at.join(" ")}) rotate(${instance.rotation})" fill="none" stroke="${c.ink}" stroke-width=".025"><rect width="${width}" height="${length}"/>`;
      if (family === "bed")
        s += `<rect x="${width * 0.12}" y="${Math.min(0.06, length * 0.05)}" width="${width * 0.76}" height="${Math.min(headDepth, length * 0.3)}" rx=".04"/><path d="M 0 ${length * 0.4} H ${width}"/>`;
      else if (family === "console") {
        s += `<path d="M 0 ${headDepth} H ${width}"/>`;
        for (let i = 0; i < seatCount; i++) {
          const x = ((i + 0.5) * width) / seatCount;
          s += `<rect data-console-station="${i + 1}" x="${x - 0.25}" y=".08" width="0.5" height=".3" rx=".03"/><rect data-console-seat="${i + 1}" x="${x - 0.25}" y="${length - 0.55}" width="0.5" height="0.5" rx=".04"/><path d="M ${x - 0.25} ${length - 0.1} h .5" stroke-width=".05"/>`;
        }
      } else if (family === "machinery") {
        const panelDepth = Math.min(headDepth, length * 0.25),
          inset = Math.min(0.06, width * 0.1),
          radius = Math.min(width * 0.28, (length - panelDepth) * 0.28);
        s += `<rect data-machinery-panel="front" x="${inset}" y="${length - panelDepth}" width="${width - inset * 2}" height="${panelDepth}"/><circle data-machinery-core="motor" cx="${width / 2}" cy="${(length - panelDepth) / 2}" r="${radius}"/><path d="M ${width / 2 - radius * 0.6} ${(length - panelDepth) / 2} h ${radius * 1.2}"/>`;
      } else
        s += `<path d="M 0 ${Math.min(headDepth, length * 0.3)} H ${width}" stroke-width=".05"/>`;
      s += `</g>`;
    }
    for (const l of showLabels ? m.labels : [])
      s += `<text x="${l.at[0]}" y="${l.at[1]}" font-family="sans-serif" font-size="${l.size ?? 0.4}" text-anchor="middle" dominant-baseline="central" fill="${c.label}">${esc(l.text)}</text>`;
    return s;
  }
  function consoleSymbol(width, length, seatCount, desk, c) {
    const depth = Math.min(0.55, length * 0.42);
    let symbol = desk
      ? `<path data-console-desk="" d="M .06 0 H ${width - 0.06} Q ${width} 0 ${width} .06 V ${depth - 0.06} Q ${width / 2} ${depth + 0.04} 0 ${depth - 0.06} V .06 Q 0 0 .06 0 Z"/>`
      : "";
    for (let i = 0; i < seatCount; i++) {
      const x = ((i + 0.5) * width) / seatCount;
      symbol += `<g data-console-station="${i + 1}"><path data-console-display="${i + 1}" d="M ${x - 0.38} .24 Q ${x} -.06 ${x + 0.38} .24"/><path data-console-support="${i + 1}" d="M ${x - 0.07} .1 L ${x - 0.06} .2 M ${x + 0.07} .1 L ${x + 0.06} .2"/><rect data-console-keyboard="${i + 1}" x="${x - 0.25}" y=".2" width=".5" height=".15" rx=".05"/><g data-console-seat="${i + 1}" transform="translate(${x - 0.3} ${length - 0.8})">${chairSymbol(0.6, 0.75, c)}</g></g>`;
    }
    return symbol;
  }
  function bedSymbol(width, length, headDepth) {
    const pillowHeight = Math.min(headDepth, length * 0.2),
      radius = Math.min(0.08, width * 0.1),
      blanketTop = Math.min(pillowHeight + 0.08, length * 0.3);
    return `<rect data-bed-frame="" width="${width}" height="${length}" rx="${radius}"/><rect data-bed-pillow="" x="${width * 0.08}" y=".04" width="${width * 0.84}" height="${pillowHeight}" rx="${radius}"/><path data-bed-blanket="" d="M 0 ${blanketTop} H ${width}"/>`;
  }
  // Local front is toward negative Y; backrest stays behind the seated occupant.
  function chairSymbol(width, length, c) {
    const point = (x, y) => `${x * width} ${y * length}`;
    const armAngle = (Math.atan2(width * 0.12, length * 0.43) * 180) / Math.PI;
    return `<path data-chair-seat="" d="M ${point(0.17, 0.12)} Q ${point(0.08, 0.12)} ${point(0.08, 0.22)} L ${point(0.2, 0.65)} Q ${point(0.5, 0.75)} ${point(0.8, 0.65)} L ${point(0.92, 0.22)} Q ${point(0.92, 0.12)} ${point(0.83, 0.12)} Z"/><path data-chair-back="" d="M ${point(0.15, 0.7)} Q ${point(0.5, 0.84)} ${point(0.85, 0.7)} Q ${point(0.94, 0.76)} ${point(0.85, 0.83)} Q ${point(0.5, 0.97)} ${point(0.15, 0.83)} Q ${point(0.06, 0.76)} ${point(0.15, 0.7)} Z"/><g data-chair-arm="left" transform="translate(0 ${length * 0.26}) rotate(${-armAngle})" fill="${c.sheet}" stroke="${c.armStroke}"><rect width="${width * 0.13}" height="${length * 0.36}" rx="${width * 0.065}"/></g><g data-chair-arm="right" transform="translate(${width * 0.87} ${length * 0.26}) rotate(${armAngle})" fill="${c.sheet}" stroke="${c.armStroke}"><rect width="${width * 0.13}" height="${length * 0.36}" rx="${width * 0.065}"/></g>`;
  }
  const papers = {
    a4: { w: 297, h: 210, tw: 21, th: 15, name: "A4 landscape" },
    a3: { w: 297, h: 420, tw: 21, th: 30, name: "A3 portrait" },
  };
  function tiles(b, p, limit = 200, origin = [0, 0]) {
    const [ox, oy] = origin;
    const result = [],
      x0 = Math.floor((b.x - ox) / p.tw),
      y0 = Math.floor((b.y - oy) / p.th),
      x1 = Math.ceil((b.x + b.w - ox) / p.tw),
      y1 = Math.ceil((b.y + b.h - oy) / p.th);
    const count = (x1 - x0) * (y1 - y0);
    if (count > limit)
      throw Error(
        `Region needs ${count} sheets; choose a smaller print region (prototype limit: ${limit}).`,
      );
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        result.push({
          x: ox + x * p.tw,
          y: oy + y * p.th,
          w: p.tw,
          h: p.th,
          col: x,
          row: y,
        });
    return result;
  }
  /** @param {Model} m @param {Bounds & {col: number, row: number}} t @param {{w:number,h:number,th:number}} p @param {SceneOptions} [options] */
  function sheet(m, t, p, options) {
    const x = (p.w - 280) / 2,
      y = (p.h - (p.th * 1000) / 75) / 2,
      h = (p.th * 1000) / 75;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}mm" height="${p.h}mm" viewBox="0 0 ${p.w} ${p.h}"><rect width="100%" height="100%" fill="white"/><svg x="${x}" y="${y}" width="280" height="${h}" viewBox="${t.x} ${t.y} ${t.w} ${t.h}" overflow="hidden">${(options?.render ?? scene)(m, t, { ...options, id: `grid-${t.col}-${t.row}` })}</svg></svg>`;
  }
  /** @param {Model} m @param {Bounds} b @param {SceneOptions} [options] */
  function svg(m, b, options) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${(b.w * 1000) / 75}mm" height="${(b.h * 1000) / 75}mm" viewBox="${b.x} ${b.y} ${b.w} ${b.h}">${(options?.render ?? scene)(m, b, options)}</svg>`;
  }
  return {
    esc,
    length,
    doorThickness,
    accessOpening,
    inside,
    terrainAt,
    validate,
    bounds,
    scene,
    componentPoints,
    componentSemantics,
    papers,
    tiles,
    sheet,
    svg,
    wallPolygons,
  };
})();

// Throwaway visibility experiment. Drawing primitives do not imply occlusion.
const Fog = (() => {
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  /** @param {Model} m @param {Doors} doors */
  function blockers(m, doors) {
    /** @type {Point[][]} */
    const polygons = [];
    for (const w of m.walls)
      if (w.blocksSight !== false)
        polygons.push(...Geometry.wallPolygons(m, w));
    for (const opening of m.openings) {
      const o = Geometry.accessOpening(m, opening);
      if (
        o.blocksSight === false ||
        doors[o.id] === "open" ||
        (!o.type && o.blocksSight !== true)
      )
        continue;
      const w = m.walls.find((w) => w.id === o.wall);
      if (!w) throw Error(`Unknown wall ${o.wall}`);
      const len = Geometry.length(w),
        ux = (w.b[0] - w.a[0]) / len,
        uy = (w.b[1] - w.a[1]) / len,
        t = Geometry.doorThickness(m, o, w) / 2;
      polygons.push(
        [
          [o.offset, t],
          [o.offset + o.width, t],
          [o.offset + o.width, -t],
          [o.offset, -t],
        ].map(([d, n]) => [w.a[0] + ux * d - uy * n, w.a[1] + uy * d + ux * n]),
      );
    }
    for (const r of m.outlines ?? [])
      if (r.blocksSight === true)
        polygons.push([
          [r.at[0], r.at[1]],
          [r.at[0] + r.width, r.at[1]],
          [r.at[0] + r.width, r.at[1] + r.height],
          [r.at[0], r.at[1] + r.height],
        ]);
    for (const c of m.circles ?? [])
      if (c.blocksSight === true)
        polygons.push(
          Array.from({ length: 32 }, (_, i) => [
            c.at[0] + c.radius * Math.cos((i * Math.PI) / 16),
            c.at[1] + c.radius * Math.sin((i * Math.PI) / 16),
          ]),
        );
    for (const instance of m.components ?? [])
      if (
        !instance.opening &&
        !["ceiling-hatch", "iris-valve"].includes(
          m.componentDefinitions?.[instance.definition]?.family ?? "",
        ) &&
        Geometry.componentSemantics(m, instance).blocksSight === true
      )
        polygons.push(Geometry.componentPoints(m, instance));
    const edges = polygons.flatMap((p) =>
      p.map((a, i) => [a, p[(i + 1) % p.length]]),
    );
    for (const l of m.lines ?? [])
      if (l.blocksSight === true) edges.push([l.a, l.b]);
    return { polygons, edges };
  }
  const { inside } = Geometry;
  function distance(point, [a, b]) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      den = dx * dx + dy * dy,
      t = den
        ? Math.max(
            0,
            Math.min(
              1,
              ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / den,
            ),
          )
        : 0;
    return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
  }
  function visible(observer, obstacles) {
    const o = observer.at,
      range = observer.range;
    if (obstacles.polygons.some((p) => inside(o, p)))
      return { polygon: [], edges: [] };
    const edges = obstacles.edges.filter((e) => distance(o, e) <= range),
      angles = [];
    for (let i = 0; i < 256; i++) angles.push((i * 2 * Math.PI) / 256);
    for (const edge of edges)
      for (const p of edge) {
        const a = Math.atan2(p[1] - o[1], p[0] - o[0]);
        angles.push(a - 1e-6, a, a + 1e-6);
      }
    const hits = angles
      .map((angle) => {
        const d = [Math.cos(angle), Math.sin(angle)];
        let nearest = range,
          hit = -1;
        edges.forEach(([a, b], i) => {
          const s = [b[0] - a[0], b[1] - a[1]],
            q = [a[0] - o[0], a[1] - o[1]],
            den = cross(d, s);
          if (Math.abs(den) < 1e-10) return;
          const t = cross(q, s) / den,
            u = cross(q, d) / den;
          if (t >= 0 && t < nearest && u >= -1e-9 && u <= 1 + 1e-9) {
            nearest = t;
            hit = i;
          }
        });
        return {
          angle: (angle + Math.PI * 4) % (Math.PI * 2),
          point: [o[0] + d[0] * nearest, o[1] + d[1] * nearest],
          hit,
        };
      })
      .sort((a, b) => a.angle - b.angle);
    /** @type {Point[][]} */
    const boundary = [];
    for (let i = 0; i < hits.length; i++) {
      // eslint-disable-next-line security/detect-object-injection -- Numeric indices into the sorted ray-hit array.
      const a = hits[i],
        b = hits[(i + 1) % hits.length];
      if (a.hit >= 0 && a.hit === b.hit) boundary.push([a.point, b.point]);
    }
    return { polygon: hits.map((h) => h.point), edges: boundary };
  }

  /** @param {Exploration} s */
  function validate(s) {
    const point = (p) =>
      Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
    const observer = (o) =>
      point(o.at) && Number.isFinite(o.range) && o.range > 0;
    if (
      !s ||
      s.version !== 2 ||
      !Array.isArray(s.observers) ||
      !Array.isArray(s.observations) ||
      !s.revisions ||
      !s.doors
    )
      throw Error("Expected observation-based exploration (version 2)");
    for (const o of s.observers)
      if (!observer(o))
        throw Error("Observer requires a position and positive range");
    for (const m of Object.values(s.revisions)) Geometry.validate(m);
    for (const o of s.observations)
      if (!observer(o) || !o.doors || !s.revisions[o.revision])
        throw Error(
          "Observation requires position, range, door states and model revision",
        );
    return s;
  }
  /** @param {Exploration} s @param {Model} m @param {string} revision */
  function observation(s, m, revision) {
    if (s.visibilityPaused || !s.observers.length) return false;
    const o = {
      at: [...s.observers[0].at],
      range: s.observers[0].range,
      doors: { ...s.doors },
      revision,
    };
    if (JSON.stringify(s.observations.at(-1)) === JSON.stringify(o))
      return false;
    // eslint-disable-next-line security/detect-object-injection -- Revision identifiers index the model snapshot dictionary, never executable code.
    s.revisions[revision] ??= JSON.parse(JSON.stringify(m));
    s.observations.push(o);
    return true;
  }
  /** @param {Exploration} s */
  function reset(s) {
    s.observations = [];
    s.revisions = {};
    s.doors = {};
    s.visibilityPaused = true;
  }
  // Derived visibility only. Every redraw replays all observations in order, so the cache must hold at least that many regions: a smaller least-recently-used cache is emptied by each replay and recomputes every region on every draw.
  const cache = new Map();
  let cacheLimit = 128;
  /** @param {Observation} o @param {Model} m */
  function region(o, m) {
    const key = JSON.stringify(o);
    if (cache.has(key)) {
      const r = cache.get(key);
      cache.delete(key);
      cache.set(key, r);
      return r;
    }
    // Nothing is seen from inside solid ground, whatever walls surround it.
    const r = ["solid", "unknown"].includes(Geometry.terrainAt(m, o.at))
      ? { polygon: [], edges: [] }
      : visible(o, blockers(m, o.doors));
    cache.set(key, r);
    if (cache.size > cacheLimit) cache.delete(cache.keys().next().value);
    return r;
  }
  /** @param {Model} m @param {Bounds} b @param {Exploration} s @param {Region[]} current @param {SceneOptions} [options] */
  function render(
    m,
    b,
    s,
    current,
    { gridStroke = 0.018, id = "fog", showAxes = true } = {},
  ) {
    cacheLimit = Math.max(cacheLimit, s.observations.length + 16);
    const polygon = (r) =>
      `<polygon points="${r.polygon.map((p) => p.join(",")).join(" ")}"/>`;
    const strokeEdges = (regions) =>
      regions
        .map((r) =>
          r.edges
            .map(([a, z]) => `M ${a.join(" ")} L ${z.join(" ")}`)
            .join(" "),
        )
        .join(" ");
    const blank = {
      wallThickness: m.wallThickness,
      walls: [],
      openings: [],
      labels: [],
      origin: m.origin,
      gridOrigin: m.gridOrigin,
    };
    let svg = Geometry.scene(blank, b, {
      id: `${id}-base`,
      gridStroke,
      background: "#cbd2ce",
      showAxes,
    });
    // Chronological opaque layers replace earlier appearances only where seen.
    for (const [i, o] of s.observations.entries()) {
      const old = s.revisions[o.revision],
        r = region(o, old),
        clip = `${id}-memory-${i}`;
      svg += `<defs><clipPath id="${clip}">${polygon(r)}</clipPath></defs><g data-memory="${i}" clip-path="url(#${clip})">${Geometry.scene(old, b, { id: `${clip}-grid`, gridStroke, showAxes, showLabels: false, unknownAs: "solid", doorStates: o.doors })}<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#75877c" opacity=".08"/></g>`;
      svg += `<path d="${strokeEdges([r])}" fill="none" stroke="#35433c" stroke-width="${gridStroke * 1.5}"/>`;
    }
    svg += `<defs><clipPath id="${id}-visible">${current.map(polygon).join("")}</clipPath></defs>`;
    svg += `<g clip-path="url(#${id}-visible)">${Geometry.scene(m, b, { id: `${id}-now-grid`, gridStroke, showAxes, showLabels: false, unknownAs: "solid", doorStates: s.doors })}</g><path d="${strokeEdges(current)}" fill="none" stroke="#27332e" stroke-width="${gridStroke * 2}"/>`;
    for (const o of s.observers)
      svg += `<circle data-observer="${Geometry.esc(o.id)}" cx="${o.at[0]}" cy="${o.at[1]}" r=".14" fill="#176ca4" stroke="white" stroke-width=".035"/>`;
    return svg;
  }
  return {
    blockers,
    inside,
    visible,
    validate,
    render,
    observation,
    reset,
    region,
  };
})();

export { Geometry, Fog };
