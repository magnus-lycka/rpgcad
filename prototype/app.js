import { installCommands } from "./command-ui.js";
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
// Before measurement, CSS pixels provide only an explicitly uncalibrated estimate.
let zoomReference = {
  mpp: (75 * 25.4) / (96 * 1000),
  scale: 75,
  calibrated: false,
};
/** @type {{x:number,y:number,cx:number,cy:number}|null} */
let drag = null;
const settings = new URLSearchParams(location.search);
let editing =
  settings.get("mode") === "edit" ||
  (settings.get("mode") !== "play" && settings.get("fog") !== "1");
let sketchTool = "pan";
let temporaryPan = false;
let panNextDrag = false;
/** @type {number[][][]} */
let strokes = [];
/** @type {number[][]|null} */
let penStroke = null;
let savingSketch = 0;
let savedSketchId = "";
let sketchSave = Promise.resolve();
let sketchEtag = "";
let sketchGeneration = 0;
/** @type {{strokes:number[][][],etag:string}|null} */
let clearedMarks = null;
function updateClearRecovery() {
  commandUi.refreshAvailability();
  element("undo-clear").hidden = !clearedMarks;
}
/** @param {string} [expected] */
function savePenMarks(expected = "") {
  const body = JSON.stringify({ strokes, modelRevision: etag, view: view() });
  const generation = ++sketchGeneration;
  savingSketch++;
  commandUi.refreshAvailability();
  let success = false;
  sketchSave = sketchSave.then(async () => {
    try {
      const response = await fetch(`/sketch${levelQuery}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(expected ? { "If-Match": expected } : {}),
        },
        body,
      });
      if (response.status === 412) {
        clearedMarks = null;
        updateClearRecovery();
      }
      if (!response.ok) throw Error(`Marks not saved (${response.status})`);
      success = true;
      clearedMarks = null;
      updateClearRecovery();
      sketchEtag = response.headers.get("ETag") || "";
      savedSketchId = response.headers.get("X-Sketch-Id") || "";
      element("sketch-status").textContent = "";
    } catch (error) {
      element("sketch-status").textContent = String(error);
    } finally {
      savingSketch--;
      commandUi.refreshAvailability();
    }
  });
  return sketchSave.then(() => ({ success, generation }));
}
new ResizeObserver(() =>
  document.documentElement.style.setProperty(
    "--toolbar-height",
    `${element("toolbar").offsetHeight}px`,
  ),
).observe(element("toolbar"));
/** @type {Element|null} */
let infoOpener = null;
const MODE_ICONS = {
  play: '<svg viewBox="0 0 32 32" fill="currentColor"><path d="M16,2A14,14,0,1,0,30,16,14,14,0,0,0,16,2Zm7.4473,14.8945-12,6A1,1,0,0,1,10,22V10a1,1,0,0,1,1.4473-.8945l12,6a1,1,0,0,1,0,1.789Z"/></svg>',
  stop: '<svg viewBox="0 0 32 32" fill="currentColor"><path d="M16,2A14,14,0,1,0,30,16,14,14,0,0,0,16,2Zm6,18a2,2,0,0,1-2,2H12a2,2,0,0,1-2-2V12a2,2,0,0,1,2-2h8a2,2,0,0,1,2,2Z"/></svg>',
};
function updateEditTools() {
  const modeToggle = element("mode-toggle");
  modeToggle.setAttribute("aria-label", editing ? "Play" : "Stop");
  modeToggle.innerHTML = editing ? MODE_ICONS.play : MODE_ICONS.stop;
  document.querySelectorAll("#toolbar [data-mode]").forEach((item) => {
    if (item instanceof HTMLElement)
      item.hidden = item.dataset.mode !== (editing ? "edit" : "play");
  });
  document.body.dataset.mode = editing ? "edit" : "play";
  document.body.dataset.tool = temporaryPan
    ? "pan"
    : editing
      ? sketchTool
      : "play";
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
function selectSketchTool(tool) {
  sketchTool = tool;
  updateEditTools();
}
async function undoMarks() {
  if (clearedMarks) return undoClear();
  const previous = structuredClone(strokes);
  strokes.pop();
  draw();
  const result = await savePenMarks();
  if (result.generation !== sketchGeneration) return;
  if (result.success)
    element("sketch-status").textContent = "Drawing mark undone";
  else {
    strokes = previous;
    draw();
  }
}
async function clearMarks() {
  const snapshot = structuredClone(strokes);
  strokes = [];
  draw();
  const result = await savePenMarks(sketchEtag);
  if (result.generation !== sketchGeneration) return;
  if (result.success && snapshot.length) {
    clearedMarks = { strokes: snapshot, etag: sketchEtag };
    element("sketch-status").textContent = "Drawing marks cleared";
    updateClearRecovery();
  } else if (!result.success) {
    strokes = snapshot;
    draw();
  }
}
async function undoClear() {
  const snapshot = clearedMarks;
  if (!snapshot || savingSketch) return;
  const previous = strokes;
  strokes = snapshot.strokes;
  const result = await savePenMarks(snapshot.etag);
  if (result.generation !== sketchGeneration) return;
  if (!result.success) {
    strokes = previous;
    await restoreMarks();
  }
  if (result.success)
    element("sketch-status").textContent = "Cleared drawing marks restored";
  if (!clearedMarks) element("undo-stroke").focus();
  draw();
}
updateEditTools();
async function pollSketchReply() {
  if (savingSketch || !savedSketchId || penStroke) return;
  const generation = sketchGeneration;
  const response = await fetch(`/sketch${levelQuery}`, { cache: "no-store" });
  if (!response.ok || generation !== sketchGeneration || savingSketch) return;
  const feedback = await response.json();
  if (clearedMarks && response.headers.get("ETag") !== clearedMarks.etag) {
    clearedMarks = null;
    updateClearRecovery();
  }
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
function toggleComponents() {
  if (!componentPanel.hidden) {
    closeComponents();
    return;
  }
  if (catalogueFrame.getAttribute("src") === "about:blank")
    catalogueFrame.src = "/components.html?embedded=1";
  componentPanel.style.top = `${element("toolbar").getBoundingClientRect().bottom + 8}px`;
  componentPanel.hidden = false;
  componentsTool.setAttribute("aria-expanded", "true");
  element("close-components").focus();
}

window.addEventListener("message", (event) => {
  if (
    event.origin === location.origin &&
    event.source === catalogueFrame.contentWindow &&
    event.data === "close-components"
  )
    closeComponents();
});

function switchMode(edit) {
  cancelTemporaryPan();
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
/** @typedef {{id:string,name:string,kind:'pc'|'npc',level:string,at:number[],range:number|null}} Character */
/** @type {{characters:Character[],pov:string|null,defaultRange?:number}} */
let characterState = { characters: [], pov: null };
let commandProblem = "",
  problemTimer = 0,
  explorationSaveError = "",
  characterEtag = "",
  savingCharacters = false,
  characterGeneration = 0;
let currentLevel = settings.get("level") || "original";
let selectedCharacter = settings.get("character") || "";
/** @type {{id:string,x:number,y:number,at:number[],preview?:number[]}|null} */
let characterDrag = null;
let characterSaveError = "";
function defaultVisualRange() {
  return characterState.defaultRange ?? 6;
}
function syncPov() {
  if (!exploration || !characterState.characters.length) return;
  const pc = characterState.characters.find(
    (c) => c.id === characterState.pov && c.level === currentLevel,
  );
  exploration.observers = pc
    ? [{ id: pc.id, at: [...pc.at], range: pc.range ?? defaultVisualRange() }]
    : [];
}
/** @param {string} id @param {number[]|null} [at] */
async function characterAction(id, at = null) {
  if (savingCharacters || savingExploration) return;
  const c = characterState.characters.find((c) => c.id === id);
  if (!c) return;
  selectedCharacter = id;
  refreshCharacterControls();
  const proposed = {
    ...characterState,
    pov: !at && c.kind === "pc" ? id : characterState.pov,
    characters: at
      ? characterState.characters.map((character) =>
          character.id === id
            ? { ...character, at: at.map((n) => Math.round(n * 1000) / 1000) }
            : character,
        )
      : characterState.characters,
  };
  if (!(await commitCharacters(proposed))) {
    draw();
    return;
  }
  if (exploration && c.id === characterState.pov) {
    exploration.visibilityPaused = false;
    syncPov();
    recordObservation();
    updateVisibility();
  }
  draw();
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
  const range = /** @type {HTMLInputElement} */ (element("character-range"));
  element("character-range-label").hidden = !c;
  element("character-options").hidden = !c;
  element("rename-character").hidden = !c;
  const destinationLabel = element("character-level").closest("label");
  if (destinationLabel) destinationLabel.hidden = !c;
  element("transfer-character").hidden = !c;
  if (document.activeElement !== range)
    range.value = c?.range == null ? "" : String(c.range);
  range.placeholder = `Default: ${defaultVisualRange()} m`;
  updateBusyControls();
}
element("character-list").addEventListener("change", async (event) => {
  const input = /** @type {HTMLSelectElement} */ (event.target);
  selectedCharacter = input.value;
  const c = characterState.characters.find((c) => c.id === selectedCharacter);
  if (c?.kind === "pc" && c.level === currentLevel) await characterAction(c.id);
  else {
    refreshCharacterControls();
    draw();
  }
});
element("character-range").addEventListener("change", async () => {
  const c = characterState.characters.find((c) => c.id === selectedCharacter);
  const input = /** @type {HTMLInputElement} */ (element("character-range"));
  const range = input.value === "" ? null : Number(input.value);
  if (
    savingCharacters ||
    savingExploration ||
    !c ||
    (range !== null && (!Number.isFinite(range) || range <= 0))
  )
    return;
  if (c.id === characterState.pov && c.level === currentLevel)
    await setRange(range);
  else {
    await saveCharacterRange(c, range);
  }
});
async function renameCharacter() {
  if (savingCharacters) return;
  const c = characterState.characters.find((c) => c.id === selectedCharacter);
  const name = /** @type {HTMLInputElement} */ (
    element("character-name")
  ).value.trim();
  if (!c || !name) return;
  await commitCharacters({
    ...characterState,
    characters: characterState.characters.map((character) =>
      character.id === c.id ? { ...character, name } : character,
    ),
  });
  refreshCharacterControls();
  draw();
}
async function removeCharacter() {
  if (savingCharacters || savingExploration) return;
  const character = characterState.characters.find(
    (c) => c.id === selectedCharacter,
  );
  if (!character) return;
  const wasPov = characterState.pov === character.id;
  if (
    !(await commitCharacters({
      ...characterState,
      characters: characterState.characters.filter(
        (c) => c.id !== character.id,
      ),
      pov: wasPov ? null : characterState.pov,
    }))
  ) {
    refreshCharacterControls();
    draw();
    return;
  }
  selectedCharacter = "";
  if (wasPov && exploration) exploration.observers = [];
  refreshCharacterControls();
  updateVisibility();
  draw();
  await saveExploration();
}
async function loadLevels() {
  const response = await fetch(`/plan${planQuery}`);
  if (!response.ok) return;
  const plan = await response.json();
  currentLevel = settings.get("level") || plan.levels[0].id;
  const level = plan.levels.find((entry) => entry.id === currentLevel);
  for (const context of document.querySelectorAll("[data-drawing-context]")) {
    const planName = context.querySelector(".context-plan");
    const levelName = context.querySelector(".context-level");
    if (planName) planName.textContent = plan.name || plan.id;
    if (levelName) levelName.textContent = level?.name || currentLevel;
  }
  element("info-plan").textContent = plan.name || plan.id;
  element("info-level").textContent = level?.name || currentLevel;
  const select = /** @type {HTMLSelectElement} */ (element("character-level"));
  select.innerHTML = plan.levels
    .map(
      (level) =>
        `<option value="${Geometry.esc(level.id)}">${Geometry.esc(level.name || level.id)}</option>`,
    )
    .join("");
  select.value = currentLevel;
}
element("character-level").addEventListener("change", updateBusyControls);
async function transferCharacter() {
  if (savingCharacters || savingExploration) return;
  const c = characterState.characters.find((c) => c.id === selectedCharacter);
  const level = /** @type {HTMLSelectElement} */ (element("character-level"))
    .value;
  if (!c || !level || c.level === level) return;
  const proposed = {
    ...characterState,
    characters: characterState.characters.map((character) =>
      character.id === c.id ? { ...character, level } : character,
    ),
  };
  if (!(await commitCharacters(proposed))) return;
  syncPov();
  updateVisibility();
  draw();
  if (c.id === characterState.pov) await saveExploration();
  location.assign(
    `?${new URLSearchParams({ ...(settings.get("plan") ? { plan: settings.get("plan") || "" } : {}), level, mode: "play", character: c.id })}`,
  );
}
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
        `<g data-character="${Geometry.esc(c.id)}" data-selected="${c.id === selectedCharacter}" data-pov="${c.id === characterState.pov}" role="button" tabindex="0" aria-label="${Geometry.esc(c.name)} ${c.kind.toUpperCase()}${c.id === characterState.pov ? " · POV" : c.id === selectedCharacter ? " · Selected" : ""}" transform="translate(${(characterDrag?.id === c.id ? (characterDrag.preview ?? c.at) : c.at).join(" ")})"><path d="M -.4 0 A .4 .4 0 1 0 .4 0 A .4 .4 0 1 0 -.4 0" fill="none" stroke="${c.id === characterState.pov ? "#e7b52e" : "none"}" stroke-width=".07"/><path d="M -.48 0 A .48 .48 0 1 0 .48 0 A .48 .48 0 1 0 -.48 0" fill="none" stroke="${c.id === selectedCharacter ? "#176ca4" : "none"}" stroke-width=".04" stroke-dasharray=".08 .06"/><circle r=".32" fill="${c.kind === "pc" ? "#176ca4" : "#ad5931"}" stroke="white" stroke-width=".04"/><text y="-.43" text-anchor="middle" font-family="sans-serif" font-size=".28" fill="#27332e" stroke="white" stroke-width=".06" paint-order="stroke">${Geometry.esc(c.name)}</text></g>`,
    )
    .join("");
}
async function pollCharacters() {
  if (!fogEnabled || savingCharacters || characterDrag) return;
  const generation = characterGeneration;
  const response = await fetch(`/characters${levelQuery}`, {
    headers: characterEtag ? { "If-None-Match": characterEtag } : {},
  });
  if (response.status === 304) return;
  if (!response.ok) throw Error("Characters unavailable");
  const next = await response.json();
  if (savingCharacters || generation !== characterGeneration) return;
  const nextEtag = response.headers.get("ETag") || "";
  const first = !characterEtag;
  characterState = next;
  characterEtag = nextEtag;
  refreshCharacterControls();
  syncPov();
  updateVisibility();
  if (first && characterState.characters.some((c) => c.level === currentLevel))
    fit();
  else draw();
}
function updateBusyControls() {
  commandUi.refreshAvailability();
  element("character-details").setAttribute(
    "aria-busy",
    String(savingCharacters || savingExploration),
  );
  element("character-action-status").textContent = savingCharacters
    ? "Saving character…"
    : characterSaveError;
  element("problem").textContent =
    characterSaveError || explorationSaveError || commandProblem;
  for (const id of [
    "sight-range",
    "range-down",
    "range-up",
    "character-range",
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
    const selected = characterState.characters.find(
      (c) => c.id === selectedCharacter,
    );
    const needsCharacter = [
      "character-range",
      "rename-character",
      "remove-character",
      "transfer-character",
    ].includes(id);
    const destination = /** @type {HTMLSelectElement} */ (
      element("character-level")
    ).value;
    control.disabled =
      !characterEtag ||
      !exploration ||
      savingCharacters ||
      savingExploration ||
      (needsCharacter && !selected) ||
      (id === "transfer-character" && selected?.level === destination);
  }
}
/** @param {typeof characterState} proposed */
async function commitCharacters(proposed) {
  characterSaveError = "";
  const names = new Set();
  for (const character of proposed.characters) {
    const name = character.name.trim().toLowerCase();
    if (names.has(name)) {
      characterSaveError = `A character named “${character.name.trim()}” already exists in this plan.`;
      updateBusyControls();
      return false;
    }
    names.add(name);
  }
  savingCharacters = true;
  ++characterGeneration;
  updateBusyControls();
  try {
    const response = await fetch(`/characters${levelQuery}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": characterEtag,
      },
      body: JSON.stringify(proposed),
    });
    if (!response.ok) {
      if (response.status === 412) characterEtag = "";
      throw Error(`Character save failed (${response.status})`);
    }
    characterEtag = response.headers.get("ETag") || "";
    characterState = proposed;
    return true;
  } catch (error) {
    characterSaveError = String(error);
    element("fog-status").textContent = characterSaveError;
    return false;
  } finally {
    savingCharacters = false;
    updateBusyControls();
  }
}
async function addCharacter(kind) {
  if (savingCharacters || !characterEtag) return;
  const taken = new Set(
    characterState.characters.map((c) => c.name.trim().toLowerCase()),
  );
  let number = characterState.characters.length + 1;
  while (taken.has(`${kind} ${number}`)) number++;
  const character = {
    id: crypto.randomUUID(),
    name: `${kind.toUpperCase()} ${number}`,
    kind,
    level: currentLevel,
    at: [camera.x, camera.y],
    range: null,
  };
  if (
    !(await commitCharacters({
      ...characterState,
      characters: [...characterState.characters, character],
      pov:
        kind === "pc" && !characterState.pov
          ? character.id
          : characterState.pov,
    }))
  )
    return;
  selectedCharacter = character.id;
  refreshCharacterControls();
  syncPov();
  updateVisibility();
  draw();
}

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
  if (document.activeElement !== rangeInput)
    rangeInput.value = String(defaultVisualRange());
  element("fog-status").textContent =
    characterSaveError || `${exploration.observations.length} observations`;
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
    explorationSaveError = "";
  } catch (error) {
    explorationEtag = "";
    console.error(String(error));
    explorationSaveError = String(error);
    element("fog-status").textContent = explorationSaveError;
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
/** @param {Character} character @param {number|null} range */
async function saveCharacterRange(character, range) {
  const previousRange = character.range;
  const proposed = {
    ...characterState,
    characters: characterState.characters.map((c) =>
      c.id === character.id ? { ...c, range } : c,
    ),
  };
  if (await commitCharacters(proposed)) return true;
  const input = /** @type {HTMLInputElement} */ (element("character-range"));
  input.value = previousRange == null ? "" : String(previousRange);
  return false;
}
async function setRange(range) {
  if (
    !exploration ||
    savingCharacters ||
    savingExploration ||
    (range !== null && (!Number.isFinite(range) || range <= 0))
  )
    return;
  const pc = characterState.characters.find(
    (c) => c.id === characterState.pov && c.level === currentLevel,
  );
  if (pc) {
    if (!(await saveCharacterRange(pc, range))) return;
  } else if (exploration.observers[0])
    exploration.observers[0].range = range ?? defaultVisualRange();
  else return;
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
const gmSectionIds = {
  characters: "gm-characters",
};
const gmTabs = [...document.querySelectorAll("[data-gm-section]")];
/** @param {Element} tab */
function selectGmTab(tab) {
  const selected = tab.getAttribute("data-gm-section");
  for (const [name, id] of Object.entries(gmSectionIds))
    element(id).hidden = name !== selected;
  for (const control of gmTabs) {
    control.setAttribute("aria-selected", String(control === tab));
    control.setAttribute("tabindex", control === tab ? "0" : "-1");
  }
}
for (const [index, tab] of gmTabs.entries()) {
  tab.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent)) return;
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % gmTabs.length;
    if (event.key === "ArrowLeft")
      next = (index + gmTabs.length - 1) % gmTabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = gmTabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const target = gmTabs.at(next);
    if (!target) return;
    selectGmTab(target);
    if (target instanceof HTMLElement) target.focus();
  });
}

function closeGm() {
  gmPanel.hidden = true;
  viewport.focus();
}
function toggleGm() {
  if (!gmPanel.hidden) return closeGm();
  gmPanel.hidden = false;
  const active = gmPanel.querySelector(
    '[data-gm-section][aria-selected="true"]',
  );
  if (active instanceof HTMLElement) active.focus();
}
function toggleGmView() {
  gmView = !gmView;
  element("gm-view").setAttribute("aria-pressed", String(gmView));
  draw();
}

rangeInput.addEventListener("change", async () => {
  while (savingCharacters || savingExploration)
    await new Promise((resolve) => setTimeout(resolve, 25));
  const range = Number(rangeInput.value);
  if (!Number.isFinite(range) || range <= 0) return;
  if (!(await commitCharacters({ ...characterState, defaultRange: range }))) {
    rangeInput.value = String(defaultVisualRange());
    return;
  }
  const pc = characterState.characters.find(
    (c) => c.id === characterState.pov && c.level === currentLevel,
  );
  if (pc?.range == null && (pc || !characterState.characters.length)) {
    if (!pc && exploration?.observers[0])
      exploration.observers[0].range = range;
    recordObservation();
    updateVisibility();
    draw();
    await saveExploration();
  }
  refreshCharacterControls();
});

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
    exploration.observers.push({
      id: "party",
      at,
      range: defaultVisualRange(),
    });
  exploration.observers[0].at = at.map((n) => Math.round(n * 1000) / 1000);
  exploration.visibilityPaused = false;
  recordObservation();
  updateVisibility();
  draw();
  await saveExploration();
}
function nearbyDoor(at) {
  if (!at) return null;
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
  return closest;
}
/** @type {number[]|null} */
let doorPointerTarget = null;
async function toggleDoor(at) {
  if (!exploration || savingExploration) return;
  const closest = nearbyDoor(at);
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
  commandUi.refreshAvailability();
  const percent = Number(((zoomReference.mpp / camera.mpp) * 100).toFixed(2));
  document.querySelectorAll("[data-scale-readout]").forEach((output) => {
    output.textContent = zoomReference.calibrated
      ? `1:${zoomReference.scale}`
      : "Uncalibrated";
  });
  document.querySelectorAll("[data-zoom-value]").forEach((input) => {
    if (input instanceof HTMLInputElement && document.activeElement !== input)
      input.value = String(percent);
  });
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
      commandUi.refreshAvailability();
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
  if (temporaryPan) event.preventDefault();
  if (!temporaryPan && !editing && !event.shiftKey && !savingCharacters) {
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
  if (!temporaryPan && editing && sketchTool === "pen" && event.button === 0) {
    penStroke = [penPoint(event)];
    viewport.setPointerCapture(event.pointerId);
    draw();
    return;
  }
  drag = { x: event.clientX, y: event.clientY, cx: camera.x, cy: camera.y };
  viewport.setPointerCapture(event.pointerId);
});
viewport.addEventListener("keydown", async (event) => {
  if (!(event.target instanceof Element) || !["Enter", " "].includes(event.key))
    return;
  const id = event.target
    .closest("[data-character]")
    ?.getAttribute("data-character");
  if (!id) return;
  event.preventDefault();
  await characterAction(id);
  const marker = [...viewport.querySelectorAll("[data-character]")].find(
    (marker) => marker.getAttribute("data-character") === id,
  );
  if (marker instanceof SVGElement) marker.focus();
});
viewport.addEventListener("pointermove", (event) => {
  if (characterDrag) {
    characterDrag.preview = [
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
    const destination = characterDrag.preview ?? characterDrag.at;
    characterDrag = null;
    draw();
    if (c) characterAction(c.id, moved ? destination : null);
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
    !temporaryPan &&
    fogEnabled &&
    Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4
  ) {
    const rect = viewport.getBoundingClientRect(),
      b = view(),
      at = [
        b.x + (event.clientX - rect.left) * camera.mpp,
        b.y + (event.clientY - rect.top) * camera.mpp,
      ];
    if (event.shiftKey) {
      doorPointerTarget = at;
      commandUi.execute("toggle-door");
      doorPointerTarget = null;
    } else placeObserver(at);
  }
  drag = null;
  if (panNextDrag) cancelTemporaryPan();
});
viewport.addEventListener("pointercancel", () => {
  cancelTemporaryPan();
  if (characterDrag) {
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
document.querySelectorAll("[data-zoom-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = form.querySelector("[data-zoom-value]");
    if (!(input instanceof HTMLInputElement) || !input.reportValidity()) return;
    const percent = input.valueAsNumber;
    if (!Number.isFinite(percent) || percent <= 0) return;
    zoom((zoomReference.mpp * 100) / (percent * camera.mpp));
    input.value = String(
      Number(((zoomReference.mpp / camera.mpp) * 100).toFixed(2)),
    );
    element(editing ? "sketch-status" : "fog-status").textContent =
      `Zoom set to ${input.value}% at 1:${zoomReference.scale}`;
  });
});
function editZoomPercentage() {
  const input = document.querySelector("#toolbar [data-zoom-value]");
  if (input instanceof HTMLInputElement) {
    input.focus();
    input.select();
  }
}

const calibrationDialog = /** @type {HTMLDialogElement} */ (
  element("calibration-dialog")
);
if (!(calibrationDialog instanceof HTMLDialogElement))
  throw Error("Expected calibration dialog");
let calibrationMetres = 7.5;
/** @type {HTMLElement|null} */
let calibrationLauncher = null;
function restoreCalibrationFocus() {
  if (calibrationLauncher?.checkVisibility()) calibrationLauncher.focus();
  else viewport.focus();
}
calibrationDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  calibrationDialog.close();
  restoreCalibrationFocus();
});
calibrationDialog.addEventListener("close", () => {
  if (
    !(document.activeElement instanceof HTMLElement) ||
    !document.activeElement.checkVisibility() ||
    calibrationDialog.contains(document.activeElement)
  )
    restoreCalibrationFocus();
});
function calibrate() {
  calibrationLauncher =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
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
}
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
  const factor = measured.valueAsNumber / targetMm;
  zoomReference = {
    mpp: Math.min(100, Math.max(0.0001, camera.mpp * factor)),
    scale: scale.valueAsNumber,
    calibrated: true,
  };
  zoom(factor);
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
function dismissControl() {
  if (temporaryPan) return cancelTemporaryPan();
  if (!componentPanel.hidden) return closeComponents();
  if (!gmPanel.hidden) {
    const options = /** @type {HTMLDetailsElement} */ (
      element("character-options")
    );
    if (options.open && options.checkVisibility()) {
      options.open = false;
      options.querySelector("summary")?.focus();
    } else closeGm();
  }
}
function playAvailable() {
  return !exploration
    ? "Exploration is loading"
    : savingCharacters || savingExploration
      ? "Save in progress"
      : true;
}
function observerAvailable() {
  return playAvailable() !== true
    ? playAvailable()
    : exploration?.observers[0]
      ? true
      : "Place an Observer or select a local PC";
}
function selectedAvailable() {
  return playAvailable() !== true
    ? playAvailable()
    : characterState.characters.some((c) => c.id === selectedCharacter) ||
        "Select a character";
}
function showGmSection(name) {
  gmPanel.hidden = false;
  const tab = gmTabs.find(
    (tab) => tab.getAttribute("data-gm-section") === name,
  );
  if (tab) {
    selectGmTab(tab);
    if (tab instanceof HTMLElement) tab.focus();
  }
}
function cancelTemporaryPan() {
  if (!temporaryPan) return;
  temporaryPan = false;
  panNextDrag = false;
  drag = null;
  updateEditTools();
}
window.addEventListener("keyup", (event) => {
  if (event.key === " ") cancelTemporaryPan();
});
window.addEventListener("blur", cancelTemporaryPan);
document.addEventListener("focusin", (event) => {
  if (event.target !== viewport) cancelTemporaryPan();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelTemporaryPan();
});

const commandUi = installCommands(
  [
    {
      id: "zoom-percentage",
      label: "Set zoom percentage",
      keys: ["Z"],
      scope: "both",
      enabled: () => loaded || "Plan is loading",
      run: editZoomPercentage,
    },
    {
      id: "toggle-door",
      label: "Toggle nearby door",
      keys: ["Shift+O"],
      scope: "play",
      repeat: false,
      announce: false,
      enabled: () =>
        playAvailable() !== true
          ? playAvailable()
          : nearbyDoor(doorPointerTarget || exploration?.observers[0]?.at)
            ? true
            : "Move an Observer beside a door opening",
      run: () => toggleDoor(doorPointerTarget || exploration?.observers[0]?.at),
    },
    ...[["characters", "Characters", "T"]].map(([id, label, key]) => ({
      id: `section-${id}`,
      label: `${label} tab`,
      keys: [key],
      scope: /** @type {const} */ ("play"),
      run: () => showGmSection(id),
    })),
    ...["pc", "npc"].map((kind) => ({
      id: `add-${kind}`,
      label: `Add ${kind.toUpperCase()}`,
      keys: [kind === "pc" ? "A" : "N"],
      scope: /** @type {const} */ ("play"),
      announce: false,
      repeat: false,
      enabled: () =>
        playAvailable() !== true
          ? playAvailable()
          : !!characterEtag || "Characters are loading",
      run: () => addCharacter(kind),
    })),
    {
      id: "rename-character",
      label: "Rename character",
      keys: ["Shift+N"],
      scope: "play",
      announce: false,
      repeat: false,
      enabled: () =>
        selectedAvailable() !== true
          ? selectedAvailable()
          : !!(
              /** @type {HTMLInputElement} */ (
                element("character-name")
              ).value.trim()
            ) || "Enter a character name",
      run: renameCharacter,
    },
    {
      id: "transfer-character",
      label: "Move to level",
      keys: ["Shift+M"],
      scope: "play",
      announce: false,
      repeat: false,
      enabled: () =>
        selectedAvailable() !== true
          ? selectedAvailable()
          : characterState.characters.find((c) => c.id === selectedCharacter)
              ?.level !==
              /** @type {HTMLSelectElement} */ (element("character-level"))
                .value || "Choose a different level",
      run: transferCharacter,
    },
    {
      id: "remove-character",
      label: "Remove character",
      keys: ["Shift+D"],
      scope: "play",
      announce: false,
      repeat: false,
      enabled: selectedAvailable,
      run: removeCharacter,
    },
    {
      id: "character-options",
      label: "Character options",
      keys: ["D"],
      scope: "play",
      enabled: selectedAvailable,
      run: () => {
        showGmSection("characters");
        const options = /** @type {HTMLDetailsElement} */ (
          element("character-options")
        );
        options.open = !options.open;
      },
    },
    ...Object.entries({
      left: [-1.5, 0],
      right: [1.5, 0],
      up: [0, -1.5],
      down: [0, 1.5],
    }).map(([direction, delta]) => ({
      id: `observer-${direction}`,
      label: `Move Observer ${direction}`,
      keys: [`Arrow${direction[0].toUpperCase()}${direction.slice(1)}`],
      scope: /** @type {const} */ ("play"),
      analogy: "direction",
      announce: false,
      enabled: observerAvailable,
      run: () => {
        const at = exploration?.observers[0]?.at;
        if (!at) return;
        return placeObserver([at[0] + delta[0], at[1] + delta[1]]);
      },
    })),
    ...[
      [-1.5, "Decrease", "["],
      [1.5, "Increase", "]"],
    ].map(([delta, label, key]) => ({
      id: `range-${label}`,
      label: `${label} Observer range`,
      keys: [String(key)],
      scope: /** @type {const} */ ("play"),
      analogy: "size",
      announce: false,
      enabled: observerAvailable,
      run: () =>
        setRange(
          Math.max(
            0.1,
            (exploration?.observers[0]?.range ?? 6) + Number(delta),
          ),
        ),
    })),
    ...[
      ["down", "Decrease", -1.5, "<"],
      ["up", "Increase", 1.5, ">"],
    ].map(([direction, label, delta, key]) => ({
      id: `range-${direction}`,
      label: `${label} default range`,
      keys: [String(key)],
      scope: /** @type {const} */ ("play"),
      announce: false,
      enabled: playAvailable,
      run: () => {
        rangeInput.value = String(
          Math.max(0.1, Number(rangeInput.value) + Number(delta)),
        );
        rangeInput.dispatchEvent(new Event("change"));
      },
    })),
    {
      id: "reset-fog",
      label: "Reset fog / close all doors",
      keys: ["Shift+R"],
      scope: "play",
      repeat: false,
      announce: false,
      enabled: playAvailable,
      run: resetFog,
    },
    {
      id: "gm-panel",
      label: "Referee panel",
      keys: ["G", "Shift+G"],
      scope: "play",
      run: toggleGm,
    },
    {
      id: "gm-view",
      label: "Toggle fog",
      keys: ["Shift+V"],
      scope: "play",
      repeat: false,
      run: toggleGmView,
    },
    {
      id: "undo-marks",
      label: "Undo drawing marks",
      keys: ["Mod+Z"],
      scope: "edit",
      announce: false,
      enabled: () =>
        savingSketch
          ? "Drawing marks are saving"
          : clearedMarks || strokes.length
            ? true
            : "No drawing marks to undo",
      run: undoMarks,
    },
    {
      id: "clear-marks",
      label: "Clear marks",
      keys: ["Shift+Backspace"],
      scope: "edit",
      repeat: false,
      announce: false,
      enabled: () =>
        savingSketch
          ? "Drawing marks are saving"
          : strokes.length
            ? true
            : "No drawing marks to clear",
      run: clearMarks,
    },
    {
      id: "pen",
      label: "Pen",
      keys: ["P"],
      scope: "edit",
      run: () => selectSketchTool("pen"),
    },
    ...["edit", "play"].flatMap((scope) =>
      Object.entries({
        left: [-1.5, 0],
        right: [1.5, 0],
        up: [0, -1.5],
        down: [0, 1.5],
      }).map(([direction, delta]) => ({
        id: `pan-${scope}-${direction}`,
        label: `Pan ${direction}`,
        scope: /** @type {'edit'|'play'} */ (scope),
        keys: [
          `Shift+Arrow${direction[0].toUpperCase()}${direction.slice(1)}`,
          ...(scope === "edit"
            ? [`Arrow${direction[0].toUpperCase()}${direction.slice(1)}`]
            : []),
        ],
        analogy: "direction",
        run: () => {
          camera.x += delta[0];
          camera.y += delta[1];
          draw();
        },
      })),
    ),
    {
      id: "temporary-pan",
      label: "Pan view (hold Space; palette pans next drag)",
      keys: ["Space"],
      scope: "both",
      repeat: false,
      run: (event) => {
        temporaryPan = true;
        panNextDrag = !event;
        viewport.focus();
        updateEditTools();
      },
    },
    {
      id: "pan",
      label: "Pan",
      keys: ["H"],
      scope: "edit",
      run: () => selectSketchTool("pan"),
    },
    {
      id: "components",
      label: "Components",
      keys: ["C"],
      scope: "edit",
      repeat: false,
      run: toggleComponents,
    },
    {
      id: "zoom-in",
      label: "Zoom in",
      keys: ["+", "="],
      scope: "both",
      run: () => zoom(0.8),
    },
    {
      id: "zoom-out",
      label: "Zoom out",
      keys: ["-"],
      scope: "both",
      run: () => zoom(1.25),
    },
    { id: "fit", label: "Fit", keys: ["F"], scope: "both", run: fit },
    {
      id: "zoom-100",
      label: "Zoom to 100%",
      keys: ["0"],
      scope: "both",
      enabled: () => loaded || "Plan is loading",
      run: () => zoom(zoomReference.mpp / camera.mpp),
    },
    {
      id: "info",
      label: "Info",
      keys: ["I"],
      scope: "both",
      announce: false,
      run: () => {
        const dialog = /** @type {HTMLDialogElement} */ (
          element("info-dialog")
        );
        if (dialog.open) dialog.close();
        else {
          infoOpener = document.activeElement;
          dialog.showModal();
        }
      },
    },
    {
      id: "export",
      label: "Export SVG",
      keys: ["Mod+E"],
      scope: "edit",
      enabled: () => loaded || "Plan is loading",
      run: exportSvg,
    },
    {
      id: "export-pdf",
      label: "Export PDF",
      keys: ["Mod+P"],
      scope: "edit",
      enabled: () => loaded || "Plan is loading",
      run: () => window.print(),
    },
    {
      id: "calibrate",
      label: "Calibrate",
      keys: ["K"],
      scope: "both",
      enabled: () => loaded || "Plan is loading",
      run: calibrate,
    },
    {
      id: "library",
      label: "Library",
      keys: ["Shift+L"],
      scope: "both",
      repeat: false,
      run: () => {
        location.href = "/library.html";
      },
    },
    {
      id: "mode",
      label: "Switch Edit / Play",
      keys: ["Shift+E"],
      scope: "both",
      repeat: false,
      announce: false,
      run: () => switchMode(!editing),
    },
    {
      id: "dismiss",
      label: "Close topmost control",
      keys: ["Escape"],
      scope: "both",
      repeat: false,
      run: dismissControl,
    },
  ],
  () => (editing ? "edit" : "play"),
  (message) => {
    element(editing ? "sketch-status" : "fog-status").textContent = message;
  },
  (message) => {
    commandProblem = message;
    clearTimeout(problemTimer);
    problemTimer = window.setTimeout(() => {
      commandProblem = "";
      updateBusyControls();
    }, 4000);
    updateBusyControls();
  },
);
for (const id of [
  "add-pc",
  "add-npc",
  "rename-character",
  "remove-character",
  "transfer-character",
])
  commandUi.bind(`#${id}`, id);
commandUi.bind("#character-options summary", "character-options");
for (const name of ["characters"])
  commandUi.bind(`[data-gm-section="${name}"]`, `section-${name}`);
commandUi.bind("#close-gm", "dismiss");
commandUi.bind("#gm-view", "gm-view");
commandUi.bind("#range-down", "range-down");
commandUi.bind("#range-up", "range-up");
commandUi.bind("#reset-fog", "reset-fog");
commandUi.bind("#undo-stroke, #undo-clear", "undo-marks");
commandUi.bind("#clear-sketch", "clear-marks");
commandUi.bind("#export-svg", "export");
commandUi.bind("#export-pdf", "export-pdf");
commandUi.bind("#pen-tool", "pen");
commandUi.bind("#pan-tool", "pan");
commandUi.bind("#components-tool", "components");
commandUi.bind("#close-components", "dismiss");
commandUi.bind('[data-zoom="in"]', "zoom-in");
commandUi.bind('[data-zoom="out"]', "zoom-out");
commandUi.bind("[data-fit]", "fit");
commandUi.bind("[data-calibrate]", "calibrate");
commandUi.bind('a[href="/library.html"]', "library");
commandUi.bind("#mode-toggle, #return-edit", "mode");
commandUi.bind("#help-tool", "help");
commandUi.bind("#zoom-100", "zoom-100");
commandUi.bind("#info-tool", "info");
element("info-dialog").addEventListener("close", () => {
  if (
    infoOpener instanceof HTMLElement &&
    infoOpener !== document.body &&
    infoOpener.checkVisibility()
  )
    infoOpener.focus();
  else viewport.focus();
});
element("info-close").addEventListener("click", () =>
  /** @type {HTMLDialogElement} */ (element("info-dialog")).close(),
);
window.addEventListener("resize", draw);
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
  sketchEtag = response.headers.get("ETag") || "";
  if (clearedMarks && clearedMarks.etag !== sketchEtag) {
    clearedMarks = null;
    updateClearRecovery();
  }
  if (saved && saved.status !== "applied" && Array.isArray(saved.strokes)) {
    strokes = saved.strokes;
    savedSketchId = saved.submittedAt;
    draw();
  }
}
fit();
await restoreMarks();
poll();
