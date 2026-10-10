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
 * @typedef {{id:string, version:number, name:string, family:string, defaults:{width:number,length:number,seatCount?:number,direction?:string}, details:{headDepth?:number,leafThickness?:number,profile?:string}, blocksSight:boolean,access?:ComponentAccess}} ComponentDefinition
 * @typedef {{id:string, definition:string, at?:Point, rotation?:number, opening?:string, blocksSight?:boolean, access?:ComponentAccess, settings?:{width?:number,length?:number,direction?:string,state?:string,seatCount?:number}}} ComponentInstance
 * @typedef {{wallThickness: number, walls: Wall[], openings: Opening[], labels: Label[], outlines?: Outline[], circles?: Circle[], lines?: Line[], stepIrons?: StepIron[], spiralStairs?: Stair[], origin?: Point, gridOrigin?: Point, components?:ComponentInstance[], componentDefinitions?:Record<string, ComponentDefinition>}} Model
 * @typedef {Record<string, 'open'|'closed'>} Doors
 * @typedef {{id?: string, at: Point, range: number}} Observer
 * @typedef {{at: Point, range: number, doors: Doors, revision: string}} Observation
 * @typedef {{version: number, observers: Observer[], observations: Observation[], revisions: Record<string, Model>, doors: Doors, visibilityPaused?: boolean}} Exploration
 * @typedef {{polygon: Point[], edges: Point[][]}} Region
 * @typedef {{x: number, y: number, w: number, h: number}} Bounds
 * @typedef {{id?: string, gridStroke?: number, background?: string, showAxes?: boolean, doorStates?: Doors, render?: (m: Model, b: Bounds, options?: SceneOptions) => string}} SceneOptions
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
        rx = w * 0.48,
        ry = h * 0.42;
      const hingeHalfWidth = width * 0.2 - inset,
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
    if (instance.opening) return [];
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
  /** @param {Model} m @param {Bounds} b @param {SceneOptions} [options] */
  function scene(
    m,
    b,
    {
      id = "grid",
      gridStroke = 0.018,
      background = "white",
      showAxes = true,
      doorStates = {},
    } = {},
  ) {
    const [ox, oy] = m.origin ?? [0, 0],
      [gx, gy] = m.gridOrigin ?? [0, 0];
    let s = `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${background}"/>`;
    s += `<defs><pattern id="${id}" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="translate(${gx} ${gy})"><path d="M 1.5 0 H 0 V 1.5" fill="none" stroke="#9aa79f" stroke-width="${gridStroke}"/></pattern></defs><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#${id})"/>`;
    if (m.origin && showAxes)
      s += `<path d="M ${b.x} ${oy} H ${b.x + b.w} M ${ox} ${b.y} V ${b.y + b.h}" fill="none" stroke="#d62929" stroke-width="${gridStroke * 1.5}"/>`;
    for (const w of m.walls)
      for (const p of wallPolygons(m, w))
        s += `<polygon data-wall="${esc(w.id)}" points="${p.map((p) => p.join(",")).join(" ")}" fill="#27332e"/>`;
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
        s += `<path data-outline="${esc(r.id)}" d="${d}" fill="none" stroke="#27332e" stroke-width="${r.stroke ?? 0.025}"${r.dashed ? ' stroke-dasharray=".1 .07"' : ""}/>`;
      } else
        s += `<rect data-outline="${esc(r.id)}" x="${r.at[0]}" y="${r.at[1]}" width="${r.width}" height="${r.height}" fill="none" stroke="#27332e" stroke-width="${r.stroke ?? 0.025}"${r.dashed ? ' stroke-dasharray=".1 .07"' : ""}/>`;
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
        s += `<polygon data-door="${esc(o.id)}" data-door-state="${open ? "open" : "closed"}" points="${points.map((p) => p.join(",")).join(" ")}" fill="${open ? "none" : "#eef1ef"}" stroke="${open ? "#536158" : "#27332e"}" stroke-width=".025"${open ? ' stroke-dasharray=".08 .06"' : ""}/>`;
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
      s += `<path data-door="${esc(o.id)}" d="M ${a.join(" ")} L ${ae.join(" ")} M ${b.join(" ")} L ${be.join(" ")}" fill="none" stroke="#27332e" stroke-width=".045"/>`;
      s += `<path d="M ${ae.join(" ")} A ${r} ${r} 0 0 0 ${mid.join(" ")} M ${be.join(" ")} A ${r} ${r} 0 0 1 ${mid.join(" ")}" fill="none" stroke="#536158" stroke-width=".025"/>`;
    }
    for (const c of m.circles ?? [])
      s += `<circle data-symbol="${esc(c.id)}" cx="${c.at[0]}" cy="${c.at[1]}" r="${c.radius}" fill="none" stroke="#27332e" stroke-width="${c.stroke ?? 0.025}"${c.dashed ? ' stroke-dasharray=".1 .07"' : ""}/>`;
    for (const l of m.lines ?? [])
      s += `<path data-symbol="${esc(l.id)}" d="M ${l.a.join(" ")} L ${l.b.join(" ")}" fill="none" stroke="#27332e" stroke-width="${l.stroke ?? 0.025}"/>`;
    for (const iron of m.stepIrons ?? []) {
      const [x, y] = iron.at,
        w = iron.width / 2,
        d = iron.projection,
        r = iron.radius,
        dir = iron.direction ?? 1;
      s += `<path data-symbol="${esc(iron.id)}" transform="translate(${x} ${y}) scale(${dir} 1)" d="M 0 ${-w} H ${d - r} Q ${d} ${-w} ${d} ${-w + r} V ${w - r} Q ${d} ${w} ${d - r} ${w} H 0" fill="none" stroke="#27332e" stroke-width="${iron.stroke ?? 0.035}" stroke-linecap="round"/>`;
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
      s += `<g data-symbol="${esc(stair.id)}" stroke="#27332e" fill="none"><path d="M ${start.join(" ")} A ${r} ${r} 0 1 1 ${end.join(" ")}" stroke-width=".035"/>`;
      for (let i = 0; i <= stair.treads; i++) {
        const angle = startAngle + (sweep * i) / stair.treads,
          a = point(0.12, angle),
          b = point(r, angle);
        s += `<path d="M ${a.join(" ")} L ${b.join(" ")}" stroke-width=".025"/>`;
      }
      s += `<circle cx="${cx}" cy="${cy}" r=".1" fill="#27332e" stroke="none"/>`;
      const ar = r * 0.6,
        a = point(ar, startAngle + 25),
        b = point(ar, startAngle + sweep - 30),
        angle = ((startAngle + sweep - 30) * Math.PI) / 180;
      const tip = b,
        back = [b[0] + 0.18 * Math.sin(angle), b[1] - 0.18 * Math.cos(angle)],
        normal = [Math.cos(angle) * 0.075, Math.sin(angle) * 0.075];
      s += `<path d="M ${a.join(" ")} A ${ar} ${ar} 0 1 1 ${b.join(" ")}" stroke="white" stroke-width=".1"/><path d="M ${a.join(" ")} A ${ar} ${ar} 0 1 1 ${b.join(" ")}" stroke-width=".035"/><polygon points="${tip.join(",")} ${[back[0] + normal[0], back[1] + normal[1]].join(",")} ${[back[0] - normal[0], back[1] - normal[1]].join(",")}" fill="#27332e" stroke="none"/>`;
      s += `<rect x="${cx - 1.05}" y="${cy + 0.3}" width=".86" height=".26" fill="white" stroke="none"/><text x="${cx - 0.62}" y="${cy + 0.49}" text-anchor="middle" font-family="sans-serif" font-size=".2" fill="#27332e" stroke="none">${stair.direction === "up" ? "UP" : "DOWN"}</text></g>`;
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
          s += `<g data-component="${esc(instance.id)}" data-definition="${esc(instance.definition)}" data-access-direction="${direction}" data-access-state="${state}" transform="translate(${instance.at.join(" ")}) rotate(${instance.rotation})" fill="none" stroke="#27332e" stroke-width=".025">${verticalAccessSymbol(family, width, length, direction)}</g>`;
        else {
          s += `<g data-component="${esc(instance.id)}" data-definition="${esc(instance.definition)}" data-access-direction="${direction}" data-access-state="${state}" transform="translate(${instance.at.join(" ")}) rotate(${instance.rotation})"><circle cx="${width / 2}" cy="${length / 2}" r="${Math.min(width, length) / 2}" fill="none" stroke="#27332e" stroke-width=".025" stroke-dasharray=".1 .07"/><text x="${width / 2}" y="${length / 2}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size=".16" fill="#27332e">${direction.toUpperCase()}</text></g>`;
        }
        continue;
      }
      if (
        ["chair", "bed", "console"].includes(family) &&
        m.componentDefinitions?.[instance.definition].details.profile ===
          "referee-2026-10-11"
      ) {
        s += `<g data-component="${esc(instance.id)}" data-definition="${esc(instance.definition)}" transform="translate(${instance.at.join(" ")}) rotate(${instance.rotation})" fill="none" stroke="#27332e" stroke-width=".025">${family === "chair" ? chairSymbol(width, length) : family === "bed" ? bedSymbol(width, length, headDepth) : consoleSymbol(width, length, seatCount)}</g>`;
        continue;
      }
      s += `<g data-component="${esc(instance.id)}" data-definition="${esc(instance.definition)}" transform="translate(${instance.at.join(" ")}) rotate(${instance.rotation})" fill="none" stroke="#27332e" stroke-width=".025"><rect width="${width}" height="${length}"/>`;
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
    for (const l of m.labels)
      s += `<text x="${l.at[0]}" y="${l.at[1]}" font-family="sans-serif" font-size="${l.size ?? 0.4}" text-anchor="middle" dominant-baseline="central" fill="#263c30">${esc(l.text)}</text>`;
    return s;
  }
  function consoleSymbol(width, length, seatCount) {
    const depth = Math.min(0.55, length * 0.42);
    let symbol = `<path data-console-desk="" d="M .06 0 H ${width - 0.06} Q ${width} 0 ${width} .06 V ${depth - 0.06} Q ${width / 2} ${depth + 0.04} 0 ${depth - 0.06} V .06 Q 0 0 .06 0 Z"/>`;
    for (let i = 0; i < seatCount; i++) {
      const x = ((i + 0.5) * width) / seatCount;
      symbol += `<g data-console-station="${i + 1}"><path data-console-display="${i + 1}" d="M ${x - 0.38} .15 Q ${x} 0 ${x + 0.38} .15 L ${x + 0.35} .23 Q ${x} .1 ${x - 0.35} .23 Z"/><rect data-console-keyboard="${i + 1}" x="${x - 0.2}" y="${depth - 0.21}" width=".4" height=".13" rx=".025"/><path d="M ${x - 0.16} ${depth - 0.16} h .32 M ${x - 0.12} ${depth - 0.12} h .24"/><g data-console-seat="${i + 1}" transform="translate(${x - 0.25} ${length - 0.6})">${chairSymbol(0.5, 0.55)}</g></g>`;
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
  function chairSymbol(width, length) {
    const point = (x, y) => `${x * width} ${y * length}`;
    return `<path data-chair-seat="" d="M ${point(0.17, 0.12)} Q ${point(0.08, 0.12)} ${point(0.08, 0.22)} L ${point(0.2, 0.65)} Q ${point(0.5, 0.75)} ${point(0.8, 0.65)} L ${point(0.92, 0.22)} Q ${point(0.92, 0.12)} ${point(0.83, 0.12)} Z"/><path data-chair-back="" d="M ${point(0.15, 0.7)} Q ${point(0.5, 0.84)} ${point(0.85, 0.7)} Q ${point(0.94, 0.76)} ${point(0.85, 0.83)} Q ${point(0.5, 0.97)} ${point(0.15, 0.83)} Q ${point(0.06, 0.76)} ${point(0.15, 0.7)} Z"/><rect data-chair-arm="left" x="0" y="${length * 0.28}" width="${width * 0.13}" height="${length * 0.36}" rx="${width * 0.065}"/><rect data-chair-arm="right" x="${width * 0.87}" y="${length * 0.28}" width="${width * 0.13}" height="${length * 0.36}" rx="${width * 0.065}"/>`;
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
  // Derived visibility only, bounded independently of stored observation history.
  const cache = new Map(),
    cacheLimit = 128;
  /** @param {Observation} o @param {Model} m */
  function region(o, m) {
    const key = JSON.stringify(o);
    if (cache.has(key)) {
      const r = cache.get(key);
      cache.delete(key);
      cache.set(key, r);
      return r;
    }
    const r = visible(o, blockers(m, o.doors));
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
      svg += `<defs><clipPath id="${clip}">${polygon(r)}</clipPath></defs><g data-memory="${i}" clip-path="url(#${clip})">${Geometry.scene(old, b, { id: `${clip}-grid`, gridStroke, showAxes, doorStates: o.doors })}<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#75877c" opacity=".08"/></g>`;
      svg += `<path d="${strokeEdges([r])}" fill="none" stroke="#35433c" stroke-width="${gridStroke * 1.5}"/>`;
    }
    svg += `<defs><clipPath id="${id}-visible">${current.map(polygon).join("")}</clipPath></defs>`;
    svg += `<g clip-path="url(#${id}-visible)">${Geometry.scene(m, b, { id: `${id}-now-grid`, gridStroke, showAxes, doorStates: s.doors })}</g><path d="${strokeEdges(current)}" fill="none" stroke="#27332e" stroke-width="${gridStroke * 2}"/>`;
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
