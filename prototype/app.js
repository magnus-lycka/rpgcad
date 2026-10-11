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
let editing =
  settings.get("mode") === "edit" ||
  (settings.get("mode") !== "play" && settings.get("fog") !== "1");
let sketchTool = "pan";
/** @type {number[][][]} */
let strokes = [];
/** @type {number[][]|null} */
let penStroke = null;
let savingSketch = 0;
let savedSketchId = "";
let sketchSave = Promise.resolve();
function savePenMarks() {
  const body = JSON.stringify({ strokes, modelRevision: etag, view: view() });
  savingSketch++;
  sketchSave = sketchSave.then(async () => {
    try {
      const response = await fetch(`/sketch${levelQuery}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!response.ok) throw Error(`Marks not saved (${response.status})`);
      savedSketchId = response.headers.get("X-Sketch-Id") || "";
      element("sketch-status").textContent = "";
    } catch (error) {
      element("sketch-status").textContent = String(error);
    } finally {
      savingSketch--;
    }
  });
}
function updateEditTools() {
  element("edit-palette").hidden = !editing;
  document.body.dataset.mode = editing ? "edit" : "play";
  document.body.dataset.tool = editing ? sketchTool : "play";
  element("pen-tool").setAttribute(
    "aria-pressed",
    String(sketchTool === "pen"),
  );
  element("pan-tool").setAttribute(
    "aria-pressed",
    String(sketchTool === "pan"),
  );
}
function penPoint(event) {
  const rect = viewport.getBoundingClientRect(),
    b = view();
  return [
    b.x + (event.clientX - rect.left) * camera.mpp,
    b.y + (event.clientY - rect.top) * camera.mpp,
  ];
}
function sketchDrawing() {
  return [...strokes, ...(penStroke ? [penStroke] : [])]
    .map((stroke) => {
      if (stroke.length === 1)
        return `<circle data-sketch-stroke cx="${stroke[0][0]}" cy="${stroke[0][1]}" r="${camera.mpp * 3}" fill="#216bc6"/>`;
      const path = stroke
        .map((point, i) => `${i ? "L" : "M"} ${point.join(" ")}`)
        .join(" ");
      return `<path data-sketch-stroke d="${path}" fill="none" stroke="#216bc6" stroke-width="${camera.mpp * 2.5}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
}
element("pen-tool").addEventListener("click", () => {
  sketchTool = "pen";
  updateEditTools();
});
element("pan-tool").addEventListener("click", () => {
  sketchTool = "pan";
  updateEditTools();
});
element("undo-stroke").addEventListener("click", () => {
  strokes.pop();
  savePenMarks();
  draw();
});
const sketchMenu = element("sketch-menu");
const sketchOptions = element("sketch-options");
function closeSketchOptions() {
  sketchMenu.hidden = true;
  sketchOptions.setAttribute("aria-expanded", "false");
}
sketchOptions.addEventListener("click", () => {
  sketchMenu.hidden = !sketchMenu.hidden;
  sketchOptions.setAttribute("aria-expanded", String(!sketchMenu.hidden));
  if (!sketchMenu.hidden) element("clear-sketch").focus();
});
element("clear-sketch").addEventListener("click", () => {
  closeSketchOptions();
  sketchOptions.focus();
  strokes = [];
  savePenMarks();
  draw();
});
updateEditTools();
async function pollSketchReply() {
  if (savingSketch || !savedSketchId || penStroke) return;
  const response = await fetch(`/sketch${levelQuery}`, { cache: "no-store" });
  if (!response.ok) return;
  const feedback = await response.json();
  if (
    feedback?.submittedAt === savedSketchId &&
    feedback.status === "applied"
  ) {
    strokes = [];
    savedSketchId = "";
    draw();
  }
}
const componentPanel = element("component-panel");
const componentsTool = element("components-tool");
const catalogueFrame = /** @type {HTMLIFrameElement} */ (
  componentPanel.querySelector("iframe")
);
function closeComponents() {
  componentPanel.hidden = true;
  componentsTool.setAttribute("aria-expanded", "false");
  if (editing) componentsTool.focus();
}
componentsTool.addEventListener("click", () => {
  if (!componentPanel.hidden) {
    closeComponents();
    return;
  }
  if (catalogueFrame.getAttribute("src") === "about:blank")
    catalogueFrame.src = "/components.html?embedded=1";
  componentPanel.style.top = `${element("edit-palette").getBoundingClientRect().bottom + 8}px`;
  componentPanel.hidden = false;
  componentsTool.setAttribute("aria-expanded", "true");
  element("close-components").focus();
});
element("close-components").addEventListener("click", closeComponents);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !componentPanel.hidden) {
    event.preventDefault();
    closeComponents();
  }
});
window.addEventListener("message", (event) => {
  if (
    event.origin === location.origin &&
    event.source === catalogueFrame.contentWindow &&
    event.data === "close-components"
  )
    closeComponents();
});
element("play-mode").addEventListener("click", () => switchMode(false));
function switchMode(edit) {
  closeSketchOptions();
  editing = edit;
  closeComponents();
  fogEnabled = !edit;
  gmView = false;
  gmPanel.hidden = true;
  drag = null;
  penStroke = null;
  settings.set("mode", edit ? "edit" : "play");
  settings.delete("fog");
  history.replaceState(null, "", `?${settings}`);
  updateEditTools();
  draw();
}
const scope = new URLSearchParams();
for (const key of ["plan", "level"]) {
  const value = settings.get(key);
  if (value) scope.set(key, value);
}
const levelQuery = scope.size ? `?${scope}` : "";
const planQuery = settings.get("plan")
  ? `?${new URLSearchParams({ plan: settings.get("plan") || "" })}`
  : "";
/** @type {Exploration|null} */
let exploration = null;
/** @type {import('./geometry.js').Region[]} */
let currentVisibility = [];
let fogEnabled = !editing,
  gmView = false,
  explorationEtag = "",
  savingExploration = false,
  editGeneration = 0;
/** @typedef {{id:string,name:string,kind:'pc'|'npc',level:string,at:number[],range:number}} Character */
/** @type {{characters:Character[],pov:string|null}} */
let characterState = { characters: [], pov: null };
let characterEtag = "",
  savingCharacters = false;
let currentLevel = settings.get("level") || "original";
let selectedCharacter = settings.get("character") || "";
/** @type {{id:string,x:number,y:number,at:number[]}|null} */
let characterDrag = null;
function syncPov() {
  if (!exploration || !characterState.characters.length) return;
  const pc = characterState.characters.find(
    (c) => c.id === characterState.pov && c.level === currentLevel,
  );
  exploration.observers = pc
    ? [{ id: pc.id, at: [...pc.at], range: pc.range }]
    : [];
}
/** @param {string} id @param {number[]|null} [at] */
async function characterAction(id, at = null) {
  if (savingCharacters || savingExploration) return;
  const c = characterState.characters.find((c) => c.id === id);
  if (!c) return;
  selectedCharacter = id;
  refreshCharacterControls();
  if (at) c.at = at.map((n) => Math.round(n * 1000) / 1000);
  else if (c.kind === "pc") characterState.pov = id;
  if (exploration && c.id === characterState.pov) {
    exploration.visibilityPaused = false;
    syncPov();
    recordObservation();
    updateVisibility();
  }
  draw();
  await saveCharacters();
  if (c.id === characterState.pov) await saveExploration();
}
function refreshCharacterControls() {
  const list = /** @type {HTMLSelectElement} */ (element("character-list"));
  const input = /** @type {HTMLInputElement} */ (element("character-name"));
  selectedCharacter ||= characterState.pov || "";
  const c = characterState.characters.find((c) => c.id === selectedCharacter);
  list.innerHTML =
    '<option value="">Choose character</option>' +
    characterState.characters
      .map(
        (c) =>
          `<option value="${Geometry.esc(c.id)}">${Geometry.esc(c.name)} (${c.kind.toUpperCase()})</option>`,
      )
      .join("");
  list.value = c?.id || "";
  if (document.activeElement !== input) input.value = c?.name || "";
}
element("character-list").addEventListener("change", async (event) => {
  const input = /** @type {HTMLSelectElement} */ (event.target);
  selectedCharacter = input.value;
  const c = characterState.characters.find((c) => c.id === selectedCharacter);
  if (c?.kind === "pc" && c.level === currentLevel) await characterAction(c.id);
  else refreshCharacterControls();
});
element("rename-character").addEventListener("click", async () => {
  if (savingCharacters) return;
  const c = characterState.characters.find((c) => c.id === selectedCharacter);
  const name = /** @type {HTMLInputElement} */ (
    element("character-name")
  ).value.trim();
  if (!c || !name) return;
  c.name = name;
  refreshCharacterControls();
  draw();
  await saveCharacters();
});
element("remove-character").addEventListener("click", async () => {
  if (savingCharacters || savingExploration) return;
  characterState.characters = characterState.characters.filter(
    (c) => c.id !== selectedCharacter,
  );
  if (characterState.pov === selectedCharacter) {
    characterState.pov = null;
    if (exploration) exploration.observers = [];
  }
  selectedCharacter = "";
  refreshCharacterControls();
  updateVisibility();
  draw();
  await saveCharacters();
  await saveExploration();
});
async function loadLevels() {
  const response = await fetch(`/plan${planQuery}`);
  if (!response.ok) return;
  const plan = await response.json();
  currentLevel = settings.get("level") || plan.levels[0].id;
  const select = /** @type {HTMLSelectElement} */ (element("character-level"));
  select.innerHTML = plan.levels
    .map(
      (level) =>
        `<option value="${Geometry.esc(level.id)}">${Geometry.esc(level.name || level.id)}</option>`,
    )
    .join("");
  select.value = currentLevel;
}
element("transfer-character").addEventListener("click", async () => {
  if (savingCharacters || savingExploration) return;
  const c = characterState.characters.find((c) => c.id === selectedCharacter);
  const level = /** @type {HTMLSelectElement} */ (element("character-level"))
    .value;
  if (!c || !level || c.level === level) return;
  c.level = level;
  syncPov();
  updateVisibility();
  draw();
  await saveCharacters();
  if (c.id === characterState.pov) await saveExploration();
  if (!characterEtag) return;
  location.assign(
    `?${new URLSearchParams({ ...(settings.get("plan") ? { plan: settings.get("plan") || "" } : {}), level, mode: "play", character: c.id })}`,
  );
});
await loadLevels();
function characterDrawing() {
  return characterState.characters
    .filter(
      (c) =>
        c.level === currentLevel &&
        (c.kind === "pc" ||
          gmView ||
          currentVisibility.some((r) => Fog.inside(c.at, r.polygon))),
    )
    .map(
      (c) =>
        `<g data-character="${Geometry.esc(c.id)}" transform="translate(${c.at.join(" ")})"><path d="M -.4 0 A .4 .4 0 1 0 .4 0 A .4 .4 0 1 0 -.4 0" fill="none" stroke="${c.id === characterState.pov ? "#e7b52e" : "none"}" stroke-width=".07"/><circle r=".32" fill="${c.kind === "pc" ? "#176ca4" : "#ad5931"}" stroke="white" stroke-width=".04"/><text y="-.43" text-anchor="middle" font-family="sans-serif" font-size=".28" fill="#27332e" stroke="white" stroke-width=".06" paint-order="stroke">${Geometry.esc(c.name)}</text></g>`,
    )
    .join("");
}
async function pollCharacters() {
  if (!fogEnabled || savingCharacters || characterDrag) return;
  const response = await fetch(`/characters${levelQuery}`, {
    headers: characterEtag ? { "If-None-Match": characterEtag } : {},
  });
  if (response.status === 304) return;
  if (!response.ok) throw Error("Characters unavailable");
  const first = !characterEtag;
  characterState = await response.json();
  characterEtag = response.headers.get("ETag") || "";
  refreshCharacterControls();
  syncPov();
  updateVisibility();
  if (first && characterState.characters.some((c) => c.level === currentLevel))
    fit();
  else draw();
}
function updateBusyControls() {
  for (const id of [
    "sight-range",
    "add-pc",
    "add-npc",
    "rename-character",
    "remove-character",
    "reset-fog",
    "transfer-character",
  ]) {
    const control = /** @type {HTMLInputElement|HTMLButtonElement} */ (
      element(id)
    );
    control.disabled = savingCharacters || savingExploration;
  }
}
async function saveCharacters() {
  savingCharacters = true;
  updateBusyControls();
  try {
    const response = await fetch(`/characters${levelQuery}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": characterEtag,
      },
      body: JSON.stringify(characterState),
    });
    if (!response.ok) throw Error(`Character save failed (${response.status})`);
    characterEtag = response.headers.get("ETag") || "";
  } catch (error) {
    element("fog-status").textContent = String(error);
    characterEtag = "";
  } finally {
    savingCharacters = false;
    updateBusyControls();
  }
}
async function addCharacter(kind) {
  if (savingCharacters || !characterEtag) return;
  const input = /** @type {HTMLInputElement} */ (element("character-name"));
  const character = {
    id: crypto.randomUUID(),
    name:
      input.value.trim() ||
      `${kind.toUpperCase()} ${characterState.characters.length + 1}`,
    kind,
    level: currentLevel,
    at: [camera.x, camera.y],
    range: Number(rangeInput.value) || 6,
  };
  characterState.characters.push(character);
  if (kind === "pc" && !characterState.pov) characterState.pov = character.id;
  selectedCharacter = character.id;
  refreshCharacterControls();
  syncPov();
  updateVisibility();
  draw();
  await saveCharacters();
}
element("add-pc").addEventListener("click", () => addCharacter("pc"));
element("add-npc").addEventListener("click", () => addCharacter("npc"));
function renderScene(m, b, options = {}) {
  options = { ...options, showAxes: editing };
  if (!fogEnabled) return Geometry.scene(m, b, options);
  if (!exploration)
    return Geometry.scene(
      { wallThickness: 0.15, walls: [], openings: [], labels: [] },
      b,
      { ...options, background: "#cbd2ce" },
    );
  return Fog.render(
    m,
    b,
    characterState.characters.length
      ? { ...exploration, observers: [] }
      : exploration,
    currentVisibility,
    options,
  );
}
function updateVisibility() {
  if (!exploration) return;
  syncPov();
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
  syncPov();
  if (exploration) Fog.observation(exploration, model, etag);
}
async function saveExploration() {
  if (savingExploration || !exploration) return;
  savingExploration = true;
  updateBusyControls();
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
    updateBusyControls();
  }
}
async function pollExploration() {
  if (!fogEnabled || savingExploration || characterDrag) return;
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
  const pc = characterState.characters.find(
    (c) => c.id === characterState.pov && c.level === currentLevel,
  );
  if (pc) pc.range = range;
  else if (exploration.observers[0]) exploration.observers[0].range = range;
  else return;
  recordObservation();
  updateVisibility();
  draw();
  if (pc) await saveCharacters();
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
const gmSectionIds = {
  characters: "gm-characters",
  exploration: "gm-exploration",
  view: "gm-view-controls",
};
for (const button of document.querySelectorAll("[data-gm-section]")) {
  button.addEventListener("click", () => {
    const selected = button.getAttribute("data-gm-section");
    for (const [name, id] of Object.entries(gmSectionIds))
      element(id).hidden = name !== selected;
    for (const control of document.querySelectorAll("[data-gm-section]"))
      control.setAttribute("aria-pressed", String(control === button));
  });
}
element("return-edit").addEventListener("click", () => switchMode(true));

function closeGm() {
  gmPanel.hidden = true;
  viewport.focus();
}
function toggleGm() {
  if (!gmPanel.hidden) return closeGm();
  gmPanel.hidden = false;
  const active = gmPanel.querySelector(
    '[data-gm-section][aria-pressed="true"]',
  );
  if (active instanceof HTMLElement) active.focus();
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
element("close-gm").addEventListener("click", closeGm);
element("reset-fog").addEventListener("click", resetFog);
rangeInput.addEventListener("change", () => setRange(Number(rangeInput.value)));

async function placeObserver(at) {
  if (!exploration || savingExploration) return;
  if (characterState.characters.length) {
    const pc = characterState.characters.find(
      (c) => c.id === characterState.pov && c.level === currentLevel,
    );
    if (pc) await characterAction(pc.id, at);
    return;
  }
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
  for (const o of model.openings.filter(
    (o) => Geometry.accessOpening(model, o).type,
  )) {
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
  const options = {
    gridStroke: camera.mpp * 0.8,
    showAxes: editing,
    ...(editing ? { background: "#f1f5fa" } : {}),
  };
  if (fogEnabled && gmView) {
    viewport.innerHTML = Geometry.scene(model, b, {
      ...options,
      doorStates: exploration?.doors ?? {},
    });
    for (const o of characterState.characters.length
      ? []
      : (exploration?.observers ?? []))
      viewport.innerHTML += `<circle data-observer="${Geometry.esc(o.id)}" cx="${o.at[0]}" cy="${o.at[1]}" r=".14" fill="#176ca4" stroke="white" stroke-width=".035"/>`;
  } else viewport.innerHTML = renderScene(model, b, options);
  if (editing) viewport.innerHTML += sketchDrawing();
  else viewport.innerHTML += characterDrawing();
  viewport.setAttribute("data-gm-view", String(fogEnabled && gmView));
}
function fit() {
  let b = Geometry.bounds(model);
  if (!editing)
    for (const c of characterState.characters.filter(
      (c) => c.level === currentLevel,
    )) {
      const x = Math.min(b.x, c.at[0] - 0.6),
        y = Math.min(b.y, c.at[1] - 0.6);
      b = {
        x,
        y,
        w: Math.max(b.x + b.w, c.at[0] + 0.6) - x,
        h: Math.max(b.y + b.h, c.at[1] + 0.6) - y,
      };
    }
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
      if (fogEnabled && exploration) updateVisibility();
      if (first) {
        fit();
        document.querySelectorAll("[data-calibrate]").forEach((button) => {
          button.removeAttribute("disabled");
        });
      } else draw();
    }
    if (loaded) await pollExploration();
    if (loaded) await pollSketchReply();
    if (loaded) await pollCharacters();
  } catch (error) {
    console.error("Keeping the last valid drawing:", String(error));
  } finally {
    setTimeout(poll, 250);
  }
}
viewport.addEventListener("pointerdown", (event) => {
  if (!editing && !event.shiftKey && !savingCharacters) {
    const target =
      event.target instanceof Element
        ? event.target.closest("[data-character]")
        : null;
    const c = characterState.characters.find(
      (c) => c.id === target?.getAttribute("data-character"),
    );
    if (c) {
      characterDrag = {
        id: c.id,
        x: event.clientX,
        y: event.clientY,
        at: [...c.at],
      };
      viewport.setPointerCapture(event.pointerId);
      return;
    }
  }
  if (editing && sketchTool === "pen" && event.button === 0) {
    penStroke = [penPoint(event)];
    viewport.setPointerCapture(event.pointerId);
    draw();
    return;
  }
  drag = { x: event.clientX, y: event.clientY, cx: camera.x, cy: camera.y };
  viewport.setPointerCapture(event.pointerId);
});
viewport.addEventListener("pointermove", (event) => {
  if (characterDrag) {
    const c = characterState.characters.find((c) => c.id === characterDrag?.id);
    if (c)
      c.at = [
        characterDrag.at[0] + (event.clientX - characterDrag.x) * camera.mpp,
        characterDrag.at[1] + (event.clientY - characterDrag.y) * camera.mpp,
      ];
    draw();
    return;
  }
  if (penStroke) {
    penStroke.push(penPoint(event));
    draw();
    return;
  }
  if (!drag) return;
  camera.x = drag.cx - (event.clientX - drag.x) * camera.mpp;
  camera.y = drag.cy - (event.clientY - drag.y) * camera.mpp;
  draw();
});
viewport.addEventListener("pointerup", (event) => {
  if (characterDrag) {
    const c = characterState.characters.find((c) => c.id === characterDrag?.id);
    const moved =
      Math.hypot(
        event.clientX - characterDrag.x,
        event.clientY - characterDrag.y,
      ) >= 4;
    characterDrag = null;
    if (c) characterAction(c.id, moved ? c.at : null);
    return;
  }
  if (penStroke) {
    strokes.push(penStroke);
    penStroke = null;
    savePenMarks();
    draw();
    return;
  }
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
viewport.addEventListener("pointercancel", () => {
  if (characterDrag) {
    const c = characterState.characters.find((c) => c.id === characterDrag?.id);
    if (c) c.at = characterDrag.at;
    characterDrag = null;
  }
  drag = null;
  penStroke = null;
  draw();
});
viewport.addEventListener("dblclick", () => {
  if (!editing || sketchTool === "pan") fit();
});
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
document.querySelectorAll("[data-zoom]").forEach((button) => {
  button.addEventListener("click", () => {
    zoom(button.getAttribute("data-zoom") === "in" ? 0.8 : 1.25);
  });
});
document.querySelectorAll("[data-fit]").forEach((button) => {
  button.addEventListener("click", fit);
});
const calibrationDialog = element("calibration-dialog");
if (!(calibrationDialog instanceof HTMLDialogElement))
  throw Error("Expected calibration dialog");
let calibrationMetres = 7.5;
document.querySelectorAll("[data-calibrate]").forEach((button) => {
  button.addEventListener("click", () => {
    // Keep the ruler at the drawing's actual magnification. Use fewer squares
    // when five would not fit; never shrink the ruler with CSS.
    const available = Math.min(900, window.innerWidth - 80);
    let squares = Math.min(5, Math.floor((available * camera.mpp) / 1.5));
    if (squares < 1) {
      squares = 1;
      while ((squares * 1.5) / camera.mpp > available) squares /= 2;
    }
    calibrationMetres = squares * 1.5;
    const pixels = calibrationMetres / camera.mpp;
    const ruler = element("calibration-ruler");
    ruler.setAttribute("width", String(pixels));
    ruler.setAttribute("viewBox", `0 0 ${pixels} 32`);
    const ticks = [];
    for (let i = 0; i <= Math.ceil(squares); i++) {
      const x = (Math.min(i, squares) / squares) * pixels;
      ticks.push(`M ${x} 4 V 28`);
    }
    ruler.innerHTML = `<path d="M 0 16 H ${pixels} ${ticks.join(" ")}" fill="none" stroke="black" stroke-width="1"/>`;
    element("calibration-length").textContent =
      `${squares} grid squares · ${calibrationMetres} m`;
    closeComponents();
    calibrationDialog.showModal();
  });
});
element("cancel-calibration").addEventListener("click", () =>
  calibrationDialog.close(),
);
element("calibration-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const measured = element("calibration-mm"),
    scale = element("calibration-scale");
  if (
    !(measured instanceof HTMLInputElement) ||
    !(scale instanceof HTMLInputElement)
  )
    throw Error("Expected calibration inputs");
  const targetMm = (calibrationMetres * 1000) / scale.valueAsNumber;
  zoom(measured.valueAsNumber / targetMm);
  calibrationDialog.close();
});
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
  if (calibrationDialog.open) return;
  if (event.key === "Escape" && !sketchMenu.hidden) {
    event.preventDefault();
    closeSketchOptions();
    sketchOptions.focus();
    return;
  }
  if (event.key === "Escape" && !gmPanel.hidden) {
    event.preventDefault();
    closeGm();
    return;
  }
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    (event.target instanceof Element &&
      event.target.closest(
        "input,textarea,select,[contenteditable],dialog[open]",
      ))
  )
    return;
  if (event.shiftKey && event.key.toLowerCase() === "e") {
    event.preventDefault();
    switchMode(!editing);
    return;
  }
  if (fogEnabled && event.key.toLowerCase() === "g") {
    event.preventDefault();
    toggleGm();
  }
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
async function restoreMarks() {
  const response = await fetch(`/sketch${levelQuery}`, { cache: "no-store" });
  if (!response.ok) return;
  const saved = await response.json();
  if (saved && saved.status !== "applied" && Array.isArray(saved.strokes)) {
    strokes = saved.strokes;
    savedSketchId = saved.submittedAt;
    draw();
  }
}
fit();
await restoreMarks();
poll();
