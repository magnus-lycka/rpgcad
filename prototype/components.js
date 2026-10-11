import { Geometry } from "./geometry.js";

/** @typedef {import('./geometry.js').ComponentDefinition & {description?:string, variant?:string, aliases?:string[], tags?:string[], related?:string[], dimensions?:Record<string,unknown>, settings?:Record<string,unknown>, placement?:Record<string,unknown>, access?:Record<string,unknown>, license?:string, provenance?:Record<string,unknown>, preview?:import('./geometry.js').Model}} CatalogueDefinition */
/** @typedef {{key:string,match:string,definition:CatalogueDefinition}} CatalogueEntry */

/** @param {string} id */
function element(id) {
  const node = document.getElementById(id);
  if (!node) throw Error(`Missing catalogue element ${id}`);
  return node;
}
const search = /** @type {HTMLInputElement} */ (element("search"));
const previous = /** @type {HTMLButtonElement} */ (element("previous"));
const next = /** @type {HTMLButtonElement} */ (element("next"));
const status = element("status");
const cards = element("cards");
let offset = 0;
let revision = 0;
const query = new URLSearchParams(location.search);
search.value = query.get("q") || "";
const embedded = query.get("embedded") === "1";
if (embedded) {
  document.body.dataset.embedded = "true";
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape")
      parent.postMessage("close-components", location.origin);
  });
}

/** @param {string} key */
function readableKey(key) {
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
/** @param {unknown} value @returns {string} */
function description(value) {
  if (Array.isArray(value)) return value.map(description).join(", ");
  if (value && typeof value === "object") {
    if (!Object.keys(value).length) return "None";
    return Object.entries(value)
      .map(([key, item]) => `${readableKey(key)}: ${description(item)}`)
      .join("; ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value ?? "Unspecified");
}
/** @param {HTMLDListElement} list @param {string} label @param {unknown} value */
function detail(list, label, value) {
  const term = document.createElement("dt");
  term.textContent = label;
  const text = document.createElement("dd");
  text.textContent = description(value);
  list.append(term, text);
}
/** @param {CatalogueEntry} entry */
function card({ key, match, definition }) {
  const article = document.createElement("article");
  article.setAttribute("aria-label", definition.name);
  const title = document.createElement("h2");
  const link = document.createElement("a");
  link.href = `/components.html?${new URLSearchParams({ definition: key })}`;
  link.textContent = definition.name;
  if (embedded) title.textContent = definition.name;
  else title.append(link);
  const identity = document.createElement("p");
  identity.textContent = `${key} · ${definition.family}${definition.variant ? ` · ${definition.variant}` : ""}`;
  article.append(title, identity);
  try {
    const model = structuredClone(
      definition.preview ?? {
        wallThickness: 0.15,
        walls: [],
        openings: [],
        labels: [],
        components: [
          { id: "preview", definition: key, at: [0, 0], rotation: 0 },
        ],
      },
    );
    model.componentDefinitions = { [key]: definition };
    Geometry.validate(model);
    const ink = Geometry.bounds(model);
    const pad = 0.3;
    const bounds = {
      x: ink.x - pad,
      y: ink.y - pad,
      w: ink.w + pad * 2,
      h: ink.h + pad * 2,
    };
    const image = document.createElement("div");
    image.innerHTML = `<svg role="img" aria-label="${Geometry.esc(definition.name)} preview" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}">${Geometry.scene(model, bounds, { showAxes: false, id: `preview-${Geometry.esc(key)}` })}</svg>`;
    article.append(image);
  } catch (error) {
    const failure = document.createElement("p");
    failure.textContent = `Preview unavailable: ${String(error)}`;
    article.append(failure);
  }
  const caption = document.createElement("p");
  caption.className = "caption";
  caption.textContent =
    "Metre geometry on a 1.5 m grid; previews fit their card, not a common screen scale.";
  const list = document.createElement("dl");
  if (definition.description)
    detail(list, "Description", definition.description);
  detail(
    list,
    "Dimensions",
    `${definition.defaults.width} × ${definition.defaults.length} m · ${description(definition.dimensions)}`,
  );
  detail(list, "Default settings", definition.defaults);
  detail(list, "Supported settings", definition.settings ?? "None");
  detail(list, "Placement", definition.placement ?? "Unspecified");
  detail(list, "Sight / access", {
    blocksSight: definition.blocksSight,
    ...definition.access,
  });
  detail(
    list,
    "Aliases (same definition)",
    definition.aliases?.length ? definition.aliases : "None",
  );
  detail(
    list,
    "Related types (distinct)",
    definition.related?.length ? definition.related : "None listed",
  );
  detail(list, "Tags", definition.tags ?? []);
  if (search.value) detail(list, "Search match", match);
  detail(list, "Artwork license", definition.license ?? "Unspecified");
  const provenance = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Artwork and reference provenance";
  const source = document.createElement("p");
  source.textContent = description(definition.provenance);
  provenance.append(summary, source);
  if (embedded) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Component details";
    details.append(summary, caption, list, provenance);
    article.append(details);
  } else article.append(caption, list, provenance);
  return article;
}
async function render() {
  const current = ++revision;
  const params = new URLSearchParams({
    q: search.value,
    limit: "12",
    offset: String(offset),
  });
  const selected = query.get("definition");
  if (selected) params.set("definition", selected);
  status.textContent = "Loading components…";
  try {
    const response = await fetch(`/components?${params}`);
    if (!response.ok) throw Error("Could not load component catalogue");
    const result = await response.json();
    if (current !== revision) return;
    cards.replaceChildren(...result.entries.map(card));
    status.textContent = result.total
      ? `${result.total} component${result.total === 1 ? "" : "s"} · showing ${offset + 1}–${offset + result.entries.length}`
      : "No matching components. Try another name, alias or tag.";
    element("pagination").hidden = result.total <= 12;
    previous.disabled = offset === 0;
    next.disabled = offset + result.entries.length >= result.total;
    const address = new URLSearchParams();
    if (embedded) address.set("embedded", "1");
    if (selected) address.set("definition", selected);
    if (search.value) address.set("q", search.value);
    history.replaceState(
      null,
      "",
      `/components.html${address.size ? `?${address}` : ""}`,
    );
  } catch (error) {
    if (current !== revision) return;
    cards.replaceChildren();
    status.textContent = String(error);
  }
}
search.oninput = () => {
  offset = 0;
  query.delete("definition");
  void render();
};
previous.onclick = () => {
  offset = Math.max(0, offset - 12);
  void render();
};
next.onclick = () => {
  offset += 12;
  void render();
};
void render();
