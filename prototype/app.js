import { Geometry, Fog } from "./geometry.js";

/** @param {string} id */
function element(id) {
  const result = document.getElementById(id);
  if (!result) throw Error(`Missing viewer element ${id}`);
  return result;
}
const viewport = element("viewport");
const rangeInput = (() => {
  const input = element("sight-range");
  if (!(input instanceof HTMLInputElement))
    throw Error("Expected sight range input");
  return input;
})();
/** @typedef {import('./geometry.js').Model} Model */
/** @typedef {import('./geometry.js').Exploration} Exploration */
/** @type {Model} */
let model = { wallThickness: 0.15, walls: [], openings: [], labels: [] },
  etag = "",
  loaded = false;
let camera = { x: 10.5, y: 7.5, mpp: 0.04 };
/** @type {{x:number,y:number,cx:number,cy:number}|null} */
let drag = null;
const settings = new URLSearchParams(location.search);
const levelQuery = settings.get("level")
  ? `?${new URLSearchParams({ level: settings.get("level") || "" })}`
  : "";
/** @type {Exploration|null} */
let exploration = null;
/** @type {import('./geometry.js').Region[]} */
let currentVisibility = [];
let fogEnabled = settings.get("fog") === "1",
  gmView = false,
  explorationEtag = "",
  savingExploration = false,
  editGeneration = 0;
function renderScene(m, b, options = {}) {
  if (!fogEnabled) return Geometry.scene(m, b, options);
  if (!exploration)
    return Geometry.scene(
      { wallThickness: 0.15, walls: [], openings: [], labels: [] },
      b,
      { ...options, background: "#cbd2ce" },
    );
  return Fog.render(m, b, exploration, currentVisibility, options);
}
function updateVisibility() {
  if (!exploration) return;
  const state = exploration;
  currentVisibility = state.visibilityPaused
    ? []
    : exploration.observers.map((o) =>
        Fog.region({ ...o, doors: state.doors, revision: etag }, model),
      );
  viewport.setAttribute(
    "data-observers",
    JSON.stringify(exploration.observers),
  );
  viewport.setAttribute(
    "data-observations",
    String(exploration.observations.length),
  );
  rangeInput.value = String(exploration.observers[0]?.range ?? 6);
  element("fog-status").textContent =
    `${exploration.observations.length} observations`;
}
function recordObservation() {
  if (exploration) Fog.observation(exploration, model, etag);
}
async function saveExploration() {
  if (savingExploration || !exploration) return;
  savingExploration = true;
  ++editGeneration;
  try {
    const response = await fetch(`/exploration${levelQuery}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": explorationEtag,
      },
      body: JSON.stringify(exploration),
    });
    if (!response.ok)
      throw Error(`Exploration save failed (${response.status})`);
    explorationEtag = response.headers.get("ETag") || "";
  } catch (error) {
    explorationEtag = "";
    console.error(String(error));
    element("fog-status").textContent = String(error);
  } finally {
    savingExploration = false;
  }
}
async function pollExploration() {
  if (!fogEnabled || savingExploration) return;
  const generation = editGeneration;
  const response = await fetch(`/exploration${levelQuery}`, {
    headers: explorationEtag ? { "If-None-Match": explorationEtag } : {},
    cache: "no-store",
  });
  if (response.status === 304) return;
  if (!response.ok) throw Error(`Exploration unavailable (${response.status})`);
  const next = Fog.validate(await response.json());
  if (savingExploration || generation !== editGeneration) return;
  exploration = next;
  explorationEtag = response.headers.get("ETag") || "";
  updateVisibility();
  draw();
}
async function setRange(range) {
  if (
    !exploration ||
    savingExploration ||
    !Number.isFinite(range) ||
    range <= 0
  )
    return;
  exploration.observers[0].range = range;
  recordObservation();
  updateVisibility();
  draw();
  await saveExploration();
}
async function resetFog() {
  if (!exploration || savingExploration) return;
  Fog.reset(exploration);
  if (gmView) toggleGmView();
  updateVisibility();
  draw();
  await saveExploration();
}
const gmPanel = element("gm-panel");
function toggleGm() {
  gmPanel.hidden = !gmPanel.hidden;
}
function toggleGmView() {
  gmView = !gmView;
  element("gm-view").textContent = gmView
    ? "Return to fog"
    : "Show full plan (GM)";
  element("gm-view").setAttribute("aria-pressed", String(gmView));
  draw();
}
element("gm-view").addEventListener("click", toggleGmView);
element("close-gm").addEventListener("click", () => {
  gmPanel.hidden = true;
});
element("reset-fog").addEventListener("click", resetFog);
rangeInput.addEventListener("change", () => setRange(Number(rangeInput.value)));

async function placeObserver(at) {
  if (!exploration || savingExploration) return;
  if (
    Fog.blockers(model, exploration.doors).polygons.some((p) =>
      Fog.inside(at, p),
    )
  )
    return;
  if (!exploration.observers.length)
    exploration.observers.push({ id: "party", at, range: 6 });
  exploration.observers[0].at = at.map((n) => Math.round(n * 1000) / 1000);
  exploration.visibilityPaused = false;
  recordObservation();
  updateVisibility();
  draw();
  await saveExploration();
}
async function toggleDoor(at) {
  if (!exploration || savingExploration) return;
  /** @type {import("./geometry.js").Opening|null} */
  let closest = null;
  let best = 0.6;
  for (const o of model.openings.filter((o) => o.type)) {
    const w = model.walls.find((w) => w.id === o.wall);
    if (!w) continue;
    const length = Geometry.length(w),
      d = o.offset + o.width / 2;
    const centre = [
      w.a[0] + ((w.b[0] - w.a[0]) * d) / length,
      w.a[1] + ((w.b[1] - w.a[1]) * d) / length,
    ];
    const distance = Math.hypot(at[0] - centre[0], at[1] - centre[1]);
    if (distance < best) {
      best = distance;
      closest = o;
    }
  }
  if (!closest) return;
  exploration.doors[closest.id] =
    exploration.doors[closest.id] === "open" ? "closed" : "open";
  recordObservation();
  updateVisibility();
  draw();
  await saveExploration();
}
function view() {
  return {
    x: camera.x - (viewport.clientWidth * camera.mpp) / 2,
    y: camera.y - (viewport.clientHeight * camera.mpp) / 2,
    w: viewport.clientWidth * camera.mpp,
    h: viewport.clientHeight * camera.mpp,
  };
}
function draw() {
  const b = view();
  viewport.setAttribute("viewBox", `${b.x} ${b.y} ${b.w} ${b.h}`);
  const options = { gridStroke: camera.mpp * 0.8 };
  if (fogEnabled && gmView) {
    viewport.innerHTML = Geometry.scene(model, b, {
      ...options,
      doorStates: exploration?.doors ?? {},
    });
    for (const o of exploration?.observers ?? [])
      viewport.innerHTML += `<circle data-observer="${Geometry.esc(o.id)}" cx="${o.at[0]}" cy="${o.at[1]}" r=".14" fill="#176ca4" stroke="white" stroke-width=".035"/>`;
  } else viewport.innerHTML = renderScene(model, b, options);
  viewport.setAttribute("data-gm-view", String(fogEnabled && gmView));
}
function fit() {
  const b = Geometry.bounds(model);
  camera = {
    x: b.x + b.w / 2,
    y: b.y + b.h / 2,
    mpp: Math.max(
      (b.w + 3) / viewport.clientWidth,
      (b.h + 3) / viewport.clientHeight,
    ),
  };
  draw();
}
async function poll() {
  try {
    const response = await fetch(`/model${levelQuery}`, {
      headers: etag ? { "If-None-Match": etag } : {},
      cache: "no-store",
    });
    if (response.status !== 304) {
      if (!response.ok) throw Error(`Model unavailable (${response.status})`);
      const next = Geometry.validate(await response.json()),
        first = !loaded;
      model = next;
      etag = response.headers.get("ETag") || "";
      loaded = true;
      if (fogEnabled && exploration) {
        recordObservation();
        updateVisibility();
        await saveExploration();
      }
      if (first) fit();
      else draw();
    }
    if (loaded) await pollExploration();
  } catch (error) {
    console.error("Keeping the last valid drawing:", String(error));
  } finally {
    setTimeout(poll, 250);
  }
}
viewport.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, y: event.clientY, cx: camera.x, cy: camera.y };
  viewport.setPointerCapture(event.pointerId);
});
viewport.addEventListener("pointermove", (event) => {
  if (!drag) return;
  camera.x = drag.cx - (event.clientX - drag.x) * camera.mpp;
  camera.y = drag.cy - (event.clientY - drag.y) * camera.mpp;
  draw();
});
viewport.addEventListener("pointerup", (event) => {
  if (
    drag &&
    fogEnabled &&
    Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4
  ) {
    const rect = viewport.getBoundingClientRect(),
      b = view(),
      at = [
        b.x + (event.clientX - rect.left) * camera.mpp,
        b.y + (event.clientY - rect.top) * camera.mpp,
      ];
    if (event.shiftKey) toggleDoor(at);
    else placeObserver(at);
  }
  drag = null;
});
viewport.addEventListener("pointercancel", () => (drag = null));
viewport.addEventListener("dblclick", fit);
function zoom(
  factor,
  px = viewport.clientWidth / 2,
  py = viewport.clientHeight / 2,
) {
  const old = camera.mpp;
  camera.mpp = Math.min(100, Math.max(0.0001, old * factor));
  camera.x += (px - viewport.clientWidth / 2) * (old - camera.mpp);
  camera.y += (py - viewport.clientHeight / 2) * (old - camera.mpp);
  draw();
}
viewport.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const r = viewport.getBoundingClientRect();
    zoom(
      Math.exp(Math.max(-200, Math.min(200, event.deltaY)) * 0.002),
      event.clientX - r.left,
      event.clientY - r.top,
    );
  },
  { passive: false },
);
function exportSvg() {
  const b = Geometry.bounds(model),
    padded = { x: b.x - 0.3, y: b.y - 0.3, w: b.w + 0.6, h: b.h + 0.6 };
  const url = URL.createObjectURL(
    new Blob([Geometry.svg(model, padded, { render: renderScene })], {
      type: "image/svg+xml",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "rpgcad.svg";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.addEventListener("keydown", (event) => {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    (event.target instanceof Element && event.target.matches("input,textarea"))
  )
    return;
  if (fogEnabled && event.key.toLowerCase() === "g") {
    event.preventDefault();
    toggleGm();
  }
  if (event.key === "Escape") gmPanel.hidden = true;
  if (event.key.toLowerCase() === "f") {
    if (event.shiftKey && fogEnabled) toggleGmView();
    else fit();
  }
  if (event.key === "+" || event.key === "=") zoom(0.8);
  if (event.key === "-") zoom(1.25);
  if (event.key.toLowerCase() === "s") exportSvg();
  if (fogEnabled && event.key.toLowerCase() === "v") toggleGmView();
  if (fogEnabled && exploration && !savingExploration) {
    const observer = exploration.observers[0];
    const movement = {
      ArrowLeft: [-1.5, 0],
      ArrowRight: [1.5, 0],
      ArrowUp: [0, -1.5],
      ArrowDown: [0, 1.5],
    }[event.key];
    if (movement && observer) {
      event.preventDefault();
      placeObserver([
        observer.at[0] + movement[0],
        observer.at[1] + movement[1],
      ]);
    }
    if ((event.key === "[" || event.key === "]") && observer)
      setRange(
        Math.max(0.1, observer.range + (event.key === "]" ? 1.5 : -1.5)),
      );
    if (event.key.toLowerCase() === "r") resetFog();
  }
});
window.addEventListener("beforeprint", () => {
  const p = Geometry.papers[settings.get("paper") === "a3" ? "a3" : "a4"];
  const b = settings.get("region") === "view" ? view() : Geometry.bounds(model);
  element("print-pages").innerHTML = "";
  try {
    let tileOrigin = model.origin;
    if (settings.get("region") === "plan") {
      const [gx, gy] = model.gridOrigin ?? [0, 0];
      tileOrigin = [
        gx + Math.floor((b.x - gx) / 1.5) * 1.5,
        gy + Math.floor((b.y - gy) / 1.5) * 1.5,
      ];
    }
    const ts = Geometry.tiles(b, p, 200, tileOrigin);
    element("page-style").textContent =
      `@page{size:${p.w}mm ${p.h}mm;margin:0}.page{width:${p.w}mm;height:${p.h}mm}`;
    element("print-pages").innerHTML = ts
      .map(
        (t) =>
          `<div class="page">${Geometry.sheet(model, t, p, { render: renderScene })}</div>`,
      )
      .join("");
  } catch (error) {
    console.error(String(error));
  }
});
new ResizeObserver(() => draw()).observe(viewport);
fit();
poll();
