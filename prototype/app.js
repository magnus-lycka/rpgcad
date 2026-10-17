import { installCommands } from "./command-ui.js";
import { Geometry, Fog } from "./geometry.js";

/** @param {string} id */
function element(id) {
  const result = document.getElementById(id);
  if (!result) throw Error(`Missing viewer element ${id}`);
  return result;
}
const viewport = element("viewport");
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
// Calibration depends on the display; the view depends on the plan and level.
const calibrationKey = `rpgcad.calibration.${screen.width}x${screen.height}@${devicePixelRatio}`;
const viewKey = `rpgcad.view.${settings.get("plan") || "default"}.${settings.get("level") || "first"}`;
let storageProblem = "";
/** @param {string} key */
function readStored(key) {
  try {
    const text = localStorage.getItem(key);
    return text === null ? null : JSON.parse(text);
  } catch (error) {
    storageProblem = `Browser storage problem (${key}): ${error}`;
    return null;
  }
}
/** @param {string} key @param {unknown} value */
function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    storageProblem = `Browser storage problem (${key}): ${error}`;
  }
}
/** @param {unknown} n */
function positive(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}
const storedCalibration = readStored(calibrationKey);
if (storedCalibration !== null) {
  if (
    positive(storedCalibration.mpp) &&
    positive(storedCalibration.scale) &&
    storedCalibration.calibrated === true
  )
    zoomReference = storedCalibration;
  else storageProblem = `Stored calibration (${calibrationKey}) is invalid.`;
}
let viewSettled = false;
let restoredView = false;
let savedViewJson = "";
function restoreView() {
  const stored = readStored(viewKey);
  if (stored === null) return false;
  if (
    !positive(stored.mpp) ||
    !Number.isFinite(stored.x) ||
    !Number.isFinite(stored.y)
  ) {
    storageProblem = `Stored view (${viewKey}) is invalid.`;
    return false;
  }
  camera = { x: stored.x, y: stored.y, mpp: stored.mpp };
  restoredView = true;
  return true;
}
function persistView() {
  if (!viewSettled) return;
  const json = JSON.stringify(camera);
  if (json === savedViewJson) return;
  savedViewJson = json;
  writeStored(viewKey, camera);
}
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
  closeCharacterPopup(false);
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
/** @type {{characters:Character[],pov:string|null}} */
let characterState = { characters: [], pov: null };
/** @type {""|"pc"|"npc"} */
let newKind = "";
let popupCharacter = "",
  rosterError = "",
  commandProblem = "",
  problemTimer = 0,
  explorationSaveError = "",
  characterEtag = "",
  savingCharacters = false,
  characterGeneration = 0;
let currentLevel = settings.get("level") || "original";
let selectedCharacter = settings.get("character") || "";
/** @type {Set<string>} */
const selection = new Set(selectedCharacter ? [selectedCharacter] : []);
let popupGroup = false;
/** @param {string} id */
function selectOnly(id) {
  selection.clear();
  if (id) selection.add(id);
  selectedCharacter = id;
}
/** @param {string} id */
function toggleSelected(id) {
  if (selection.has(id)) selection.delete(id);
  else selection.add(id);
  selectedCharacter = selection.has(id) ? id : ([...selection].at(-1) ?? "");
}
function clearSelection() {
  selection.clear();
  selectedCharacter = "";
  refreshCharacterControls();
  draw();
}
/** @type {{id:string,x:number,y:number,ids:string[],starts:Map<string,number[]>,delta?:number[]}|null} */
let characterDrag = null;
/** @type {Map<string, number[]>} */
const pendingPositions = new Map();
/** @type {{id:string,at:number,count:number}|null} */
let lastClick = null;
let openedByDoubleClick = -Infinity;
let clickTimer = 0;
let characterSaveError = "";
const OBSERVER_RANGE = 6;
const characterPopup = element("character-popup");
function syncPov() {
  if (!exploration || !characterState.characters.length) return;
  const pc = characterState.characters.find(
    (c) => c.id === characterState.pov && c.level === currentLevel,
  );
  exploration.observers =
    pc && pc.range !== null
      ? [{ id: pc.id, at: [...pc.at], range: pc.range }]
      : [];
}
/** @param {string} id */
async function characterAction(id) {
  const c = characterState.characters.find((c) => c.id === id);
  if (!c) return;
  if (!selection.has(id)) selectOnly(id);
  else selectedCharacter = id;
  refreshCharacterControls();
  await settled();
  const proposed = {
    ...characterState,
    pov: c.kind === "pc" ? id : characterState.pov,
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
/** @param {Map<string, number[]>} moves */
async function moveCharacters(moves) {
  await settled();
  const proposed = {
    ...characterState,
    characters: characterState.characters.map((character) => {
      const at = moves.get(character.id);
      return at
        ? { ...character, at: at.map((n) => Math.round(n * 1000) / 1000) }
        : character;
    }),
  };
  if (!(await commitCharacters(proposed))) {
    draw();
    return;
  }
  const mover = characterState.characters.find(
    (c) => c.id === characterState.pov && moves.has(c.id),
  );
  if (exploration && mover) {
    exploration.visibilityPaused = false;
    syncPov();
    recordObservation();
    updateVisibility();
  }
  draw();
  if (mover) await saveExploration();
}
function refreshCharacterControls() {
  const input = /** @type {HTMLInputElement} */ (element("character-name"));
  const range = /** @type {HTMLInputElement} */ (element("character-range"));
  const level = /** @type {HTMLSelectElement} */ (element("character-level"));
  selectedCharacter ||= characterState.pov || "";
  const c = characterState.characters.find((c) => c.id === selectedCharacter);
  const bad = characterState.characters.find(
    (x) => x.kind === "pc" && !(x.range !== null && x.range > 0),
  );
  rosterError = bad
    ? `PC “${bad.name}” has no visual range; open its popup and set one.`
    : "";
  if (
    popupCharacter &&
    !characterState.characters.some((x) => x.id === popupCharacter)
  )
    closeCharacterPopup(false);
  if (!newKind && popupGroup) {
    const members = characterState.characters.filter((x) =>
      selection.has(x.id),
    );
    if (members.length < 2) closeCharacterPopup(false);
    else {
      const pcs = members.filter((x) => x.kind === "pc");
      element("character-popup").setAttribute(
        "aria-label",
        `${members.length} characters`,
      );
      renderPopupFields(pcs.length ? "pc" : "npc", false, true);
      const ranges = new Set(pcs.map((x) => x.range));
      if (document.activeElement !== range)
        range.value = ranges.size === 1 ? String([...ranges][0]) : "";
      range.placeholder = ranges.size > 1 ? "Mixed" : "";
      const levels = new Set(members.map((x) => x.level));
      if (document.activeElement !== level)
        level.value = levels.size === 1 ? String([...levels][0]) : "";
    }
  } else if (!newKind) {
    const popupOf = characterState.characters.find(
      (x) => x.id === popupCharacter,
    );
    element("character-popup").setAttribute(
      "aria-label",
      popupOf ? `${popupOf.name} ${popupOf.kind.toUpperCase()}` : "Character",
    );
    renderPopupFields(popupOf?.kind ?? "pc", false, false);
    if (document.activeElement !== input) input.value = c?.name || "";
    if (document.activeElement !== range)
      range.value = c?.range == null ? "" : String(c.range);
    if (c && document.activeElement !== level) level.value = c.level;
  }
  updateBusyControls();
}
/** @param {'pc'|'npc'} kind @param {boolean} creating @param {boolean} group */
function renderPopupFields(kind, creating, group) {
  element("character-name-label").hidden = group;
  element("character-range-label").hidden = kind === "npc";
  element("character-level-label").hidden = creating;
  element("remove-character").hidden = creating || group;
  element("add-character").hidden = !creating;
}
element("character-name").addEventListener("change", renameCharacter);
element("character-level").addEventListener("change", transferCharacter);
element("remove-character").addEventListener("click", () => {
  if (!popupGroup) removeCharacter();
});
element("add-character").addEventListener("click", submitNewCharacter);
characterPopup.addEventListener("keydown", (event) => {
  if (
    newKind &&
    event.key === "Enter" &&
    event.target instanceof HTMLInputElement
  ) {
    event.preventDefault();
    submitNewCharacter();
  }
});
element("character-range").addEventListener("change", async () => {
  if (newKind) return;
  if (popupGroup) return applyGroupRange();
  await settled();
  const c = characterState.characters.find((c) => c.id === selectedCharacter);
  const input = /** @type {HTMLInputElement} */ (element("character-range"));
  if (!c || c.kind !== "pc") return;
  const range = input.value.trim() === "" ? NaN : Number(input.value);
  if (!Number.isFinite(range) || range <= 0) {
    characterSaveError = "A PC needs a visual range.";
    input.value = c.range === null ? "" : String(c.range);
    updateBusyControls();
    return;
  }
  if (c.id === characterState.pov && c.level === currentLevel)
    await setRange(range);
  else await saveCharacterRange(c, range);
});
async function settled() {
  while (savingCharacters || savingExploration)
    await new Promise((resolve) => setTimeout(resolve, 25));
}
async function renameCharacter() {
  if (newKind || popupGroup) return;
  await settled();
  const c = characterState.characters.find((c) => c.id === selectedCharacter);
  const input = /** @type {HTMLInputElement} */ (element("character-name"));
  const name = input.value.trim();
  if (!c || name === c.name) return;
  if (!name) {
    characterSaveError = "A character needs a name.";
    input.value = c.name;
    updateBusyControls();
    return;
  }
  const saved = await commitCharacters({
    ...characterState,
    characters: characterState.characters.map((character) =>
      character.id === c.id ? { ...character, name } : character,
    ),
  });
  if (!saved) input.value = c.name;
  refreshCharacterControls();
  draw();
}
async function removeCharacter() {
  await settled();
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
  element("info-plan").textContent = plan.name || plan.id;
  element("info-level").textContent = level?.name || currentLevel;
  const select = /** @type {HTMLSelectElement} */ (element("character-level"));
  select.innerHTML =
    '<option value="" disabled hidden>Several levels</option>' +
    plan.levels
      .map(
        (level) =>
          `<option value="${Geometry.esc(level.id)}">${Geometry.esc(level.name || level.id)}</option>`,
      )
      .join("");
  select.value = currentLevel;
}
element("character-level").addEventListener("change", updateBusyControls);
async function transferGroup() {
  await settled();
  const level = /** @type {HTMLSelectElement} */ (element("character-level"))
    .value;
  const members = characterState.characters.filter((c) => selection.has(c.id));
  if (!level || !members.length || members.every((c) => c.level === level))
    return;
  const proposed = {
    ...characterState,
    characters: characterState.characters.map((c) =>
      selection.has(c.id) ? { ...c, level } : c,
    ),
  };
  if (!(await commitCharacters(proposed))) return;
  syncPov();
  updateVisibility();
  draw();
  if (members.some((c) => c.id === characterState.pov)) await saveExploration();
  location.assign(
    `?${new URLSearchParams({ ...(settings.get("plan") ? { plan: settings.get("plan") || "" } : {}), level, mode: "play", character: members[0].id })}`,
  );
}
async function applyGroupRange() {
  await settled();
  const input = /** @type {HTMLInputElement} */ (element("character-range"));
  const range = input.value.trim() === "" ? NaN : Number(input.value);
  if (!Number.isFinite(range) || range <= 0) {
    characterSaveError = "A PC needs a visual range.";
    refreshCharacterControls();
    return;
  }
  const proposed = {
    ...characterState,
    characters: characterState.characters.map((c) =>
      selection.has(c.id) && c.kind === "pc" ? { ...c, range } : c,
    ),
  };
  if (!(await commitCharacters(proposed))) {
    refreshCharacterControls();
    return;
  }
  const pov = characterState.characters.find(
    (c) => c.id === characterState.pov && selection.has(c.id),
  );
  if (exploration && pov) {
    syncPov();
    recordObservation();
    updateVisibility();
  }
  refreshCharacterControls();
  draw();
  if (pov) await saveExploration();
}
async function transferCharacter() {
  if (newKind) return;
  if (popupGroup) return transferGroup();
  await settled();
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
/** @param {Character} c */
function displayAt(c) {
  const start = characterDrag?.starts.get(c.id);
  if (characterDrag?.delta && start)
    return [
      start[0] + characterDrag.delta[0],
      start[1] + characterDrag.delta[1],
    ];
  return pendingPositions.get(c.id) ?? c.at;
}
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
        `<g data-character="${Geometry.esc(c.id)}" data-selected="${selection.has(c.id)}" data-pov="${c.id === characterState.pov}" role="button" tabindex="0" aria-label="${Geometry.esc(c.name)} ${c.kind.toUpperCase()}${c.id === characterState.pov ? " · POV" : selection.has(c.id) ? " · Selected" : ""}" transform="translate(${displayAt(c).join(" ")})"><path d="M -.4 0 A .4 .4 0 1 0 .4 0 A .4 .4 0 1 0 -.4 0" fill="none" stroke="${c.id === characterState.pov ? "#e7b52e" : "none"}" stroke-width=".07"/><path d="M -.48 0 A .48 .48 0 1 0 .48 0 A .48 .48 0 1 0 -.48 0" fill="none" stroke="${selection.has(c.id) ? "#176ca4" : "none"}" stroke-width=".04" stroke-dasharray=".08 .06"/><circle r=".32" fill="${c.kind === "pc" ? "#176ca4" : "#ad5931"}" stroke="white" stroke-width=".04"/><text y="-.43" text-anchor="middle" font-family="sans-serif" font-size=".28" fill="#27332e" stroke="white" stroke-width=".06" paint-order="stroke">${Geometry.esc(c.name)}</text></g>`,
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
  if (
    first &&
    !restoredView &&
    characterState.characters.some((c) => c.level === currentLevel)
  )
    fit();
  else draw();
}
function updateBusyControls() {
  commandUi.refreshAvailability();
  element("character-popup").setAttribute(
    "aria-busy",
    String(savingCharacters || savingExploration),
  );
  element("character-action-status").textContent = savingCharacters
    ? "Saving character…"
    : characterSaveError;
  element("problem").textContent =
    storageProblem ||
    rosterError ||
    characterSaveError ||
    explorationSaveError ||
    commandProblem;
  for (const id of [
    "character-range",
    "add-pc",
    "add-npc",
    "remove-character",
    "reset-fog",
  ]) {
    const control = /** @type {HTMLInputElement|HTMLButtonElement} */ (
      element(id)
    );
    const selected = characterState.characters.find(
      (c) => c.id === selectedCharacter,
    );
    const needsCharacter = ["character-range", "remove-character"].includes(id);
    control.disabled =
      !characterEtag ||
      !exploration ||
      savingCharacters ||
      savingExploration ||
      (needsCharacter && !selected && !newKind);
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
    !Number.isFinite(range) ||
    range <= 0
  )
    return;
  const pc = characterState.characters.find(
    (c) => c.id === characterState.pov && c.level === currentLevel,
  );
  if (pc) {
    if (!(await saveCharacterRange(pc, range))) return;
  } else if (exploration.observers[0]) exploration.observers[0].range = range;
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
/** @param {string} id */
function markerFor(id) {
  return [...viewport.querySelectorAll("[data-character]")].find(
    (marker) => marker.getAttribute("data-character") === id,
  );
}
/** @param {string} id */
function openCharacterPopup(id) {
  const group = selection.has(id) && selection.size > 1;
  if (
    popupCharacter &&
    popupGroup === group &&
    (group || popupCharacter === id)
  )
    return closeCharacterPopup();
  closeCharacterPopup(false);
  if (group) selectedCharacter = id;
  else selectOnly(id);
  popupGroup = group;
  popupCharacter = id;
  refreshCharacterControls();
  characterPopup.hidden = false;
  positionCharacterPopup();
  draw();
  const first = element(group ? "character-range" : "character-name");
  const field = /** @type {HTMLInputElement} */ (
    first.closest("label")?.hidden ? element("character-level") : first
  );
  field.focus();
  if (field instanceof HTMLInputElement) field.select();
}
function closeCharacterPopup(restoreFocus = true) {
  if (!popupCharacter && !newKind) return;
  const marker = popupCharacter ? markerFor(popupCharacter) : null;
  popupCharacter = "";
  popupGroup = false;
  newKind = "";
  characterSaveError = "";
  characterPopup.hidden = true;
  updateBusyControls();
  if (restoreFocus && marker instanceof SVGElement) marker.focus();
  else if (restoreFocus) viewport.focus();
}
/** @param {'pc'|'npc'} kind */
function startNewCharacter(kind) {
  closeCharacterPopup(false);
  newKind = kind;
  characterSaveError = "";
  characterPopup.setAttribute("aria-label", `New ${kind.toUpperCase()}`);
  renderPopupFields(kind, true, false);
  /** @type {HTMLInputElement} */ (element("character-name")).value = "";
  /** @type {HTMLInputElement} */ (element("character-range")).value = "";
  characterPopup.hidden = false;
  positionCharacterPopup();
  /** @type {HTMLInputElement} */ (element("character-name")).focus();
  updateBusyControls();
}
/** @param {string} message @param {string} field */
function rejectNewCharacter(message, field) {
  characterSaveError = message;
  updateBusyControls();
  element(field).focus();
}
async function submitNewCharacter() {
  await settled();
  if (!newKind) return;
  const kind = /** @type {"pc"|"npc"} */ (newKind);
  const name = /** @type {HTMLInputElement} */ (
    element("character-name")
  ).value.trim();
  const rangeText = /** @type {HTMLInputElement} */ (
    element("character-range")
  ).value.trim();
  if (!name)
    return rejectNewCharacter("A character needs a name.", "character-name");
  const typed = Number(rangeText);
  if (
    kind === "pc" &&
    (rangeText === "" || !Number.isFinite(typed) || !(typed > 0))
  )
    return rejectNewCharacter("A PC needs a visual range.", "character-range");
  const range = kind === "pc" ? typed : null;
  const character = {
    id: crypto.randomUUID(),
    name,
    kind,
    level: currentLevel,
    at: [camera.x, camera.y],
    range,
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
  newKind = "";
  characterPopup.hidden = true;
  selectedCharacter = character.id;
  refreshCharacterControls();
  syncPov();
  updateVisibility();
  draw();
  viewport.focus();
}
function positionCharacterPopup() {
  if (!popupCharacter && !newKind) return;
  const width = characterPopup.offsetWidth;
  const height = characterPopup.offsetHeight;
  let box;
  if (newKind) {
    const view = viewport.getBoundingClientRect();
    box = new DOMRect(
      view.left + view.width / 2,
      view.top + view.height / 2,
      0,
      0,
    );
  } else {
    const marker = markerFor(popupCharacter);
    if (!marker) return closeCharacterPopup(false);
    box = marker.getBoundingClientRect();
  }
  const left = Math.min(
    Math.max(8, box.left + box.width / 2 - width / 2),
    window.innerWidth - width - 8,
  );
  const minTop = element("toolbar").getBoundingClientRect().bottom + 8;
  const below = box.bottom + 8;
  const preferred =
    below + height > window.innerHeight - 8 ? box.top - height - 8 : below;
  const top = Math.max(
    minTop,
    Math.min(preferred, window.innerHeight - height - 8),
  );
  characterPopup.style.left = `${left}px`;
  characterPopup.style.top = `${top}px`;
}
function toggleGmView() {
  gmView = !gmView;
  draw();
}

async function placeObserver(at) {
  if (!exploration || savingExploration) return;
  if (characterState.characters.length) {
    const pc = characterState.characters.find(
      (c) => c.id === characterState.pov && c.level === currentLevel,
    );
    if (pc) await moveCharacters(new Map([[pc.id, at]]));
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
      range: OBSERVER_RANGE,
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
  element("gm-view").setAttribute(
    "aria-pressed",
    String(!(fogEnabled && gmView)),
  );
  positionCharacterPopup();
  persistView();
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
        if (restoreView()) draw();
        else fit();
        viewSettled = true;
        updateBusyControls();
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
document.addEventListener("pointerdown", (event) => {
  if (!popupCharacter || !(event.target instanceof Element)) return;
  if (characterPopup.contains(event.target)) return;
  if (
    event.target.closest("[data-character]")?.getAttribute("data-character") ===
    popupCharacter
  )
    return;
  if (
    (event.metaKey || event.ctrlKey) &&
    event.target.closest("[data-character]")
  )
    return;
  closeCharacterPopup(false);
});
viewport.addEventListener("pointerdown", (event) => {
  if (temporaryPan) event.preventDefault();
  const markerTarget =
    event.target instanceof Element
      ? event.target.closest("[data-character]")
      : null;
  const markerId = markerTarget?.getAttribute("data-character") || "";
  if (lastClick && lastClick.id !== markerId) {
    lastClick = null;
    clearTimeout(clickTimer);
  }
  if (!editing && !temporaryPan && markerId) {
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      toggleSelected(markerId);
      refreshCharacterControls();
      draw();
      return;
    }
    const c = characterState.characters.find((c) => c.id === markerId);
    if (c && !event.shiftKey) {
      if (!selection.has(markerId)) selectOnly(markerId);
      const ids =
        selection.size > 1
          ? characterState.characters
              .filter((x) => selection.has(x.id) && x.level === currentLevel)
              .map((x) => x.id)
          : [markerId];
      characterDrag = {
        id: markerId,
        x: event.clientX,
        y: event.clientY,
        ids,
        starts: new Map(
          characterState.characters
            .filter((x) => ids.includes(x.id))
            .map((x) => [x.id, [...x.at]]),
        ),
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
  if (event.key === "Enter") return openCharacterPopup(id);
  if (event.metaKey || event.ctrlKey) {
    toggleSelected(id);
    refreshCharacterControls();
    draw();
  } else await characterAction(id);
  const marker = markerFor(id);
  if (
    marker instanceof SVGElement &&
    (!document.activeElement || document.activeElement === document.body)
  )
    marker.focus();
});
viewport.addEventListener("pointermove", (event) => {
  if (characterDrag) {
    characterDrag.delta = [
      (event.clientX - characterDrag.x) * camera.mpp,
      (event.clientY - characterDrag.y) * camera.mpp,
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
    const { id, ids, starts, delta } = characterDrag;
    const moved =
      Math.hypot(
        event.clientX - characterDrag.x,
        event.clientY - characterDrag.y,
      ) >= 4;
    characterDrag = null;
    if (!moved) {
      draw();
      const now = event.timeStamp;
      const count =
        lastClick && lastClick.id === id && now - lastClick.at < 400
          ? lastClick.count + 1
          : 1;
      clearTimeout(clickTimer);
      if (count === 2) {
        lastClick = null;
        openedByDoubleClick = now;
        openCharacterPopup(id);
        return;
      }
      lastClick = { id, at: now, count };
      clickTimer = window.setTimeout(() => {
        if (selection.has(id)) characterAction(id);
      }, 400);
      return;
    }
    /** @type {Map<string, number[]>} */
    const moves = new Map();
    for (const moverId of ids) {
      const start = starts.get(moverId);
      if (start && delta)
        moves.set(moverId, [start[0] + delta[0], start[1] + delta[1]]);
    }
    for (const [moverId, at] of moves) pendingPositions.set(moverId, at);
    draw();
    moveCharacters(moves).finally(() => {
      for (const moverId of moves.keys()) pendingPositions.delete(moverId);
      draw();
    });
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
    } else if (characterState.characters.length) clearSelection();
    else placeObserver(at);
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
viewport.addEventListener("dblclick", (event) => {
  if (!editing && event.timeStamp - openedByDoubleClick < 600) return;
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
  writeStored(calibrationKey, zoomReference);
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
  if (popupCharacter || newKind) return closeCharacterPopup();
  if (selection.size) return clearSelection();
  if (!componentPanel.hidden) return closeComponents();
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
    .../** @type {const} */ (["pc", "npc"]).map((kind) => ({
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
      run: () => startNewCharacter(kind),
    })),
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
      id: "gm-view",
      label: "Toggle fog",
      keys: ["Shift+F"],
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
for (const id of ["add-pc", "add-npc"]) commandUi.bind(`#${id}`, id);
commandUi.bind("#gm-view", "gm-view");
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
