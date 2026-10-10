import { searchLibrary } from "./library-search.js";
import { Geometry } from "./geometry.js";

/** @typedef {{id:string,name:string,model:string,description:string,tags:string[],createdAt:string|null,editedAt:string|null,lastPlayedAt:string|null}} Level */
/** @typedef {{id:string,name:string,levels:Level[],description:string,tags:string[],createdAt:string|null,editedAt:string|null,lastPlayedAt:string|null}} Plan */
/** @type {Plan[]} */
let plans = [];
const search = /** @type {HTMLInputElement} */ (element("search"));
const tags = /** @type {HTMLTextAreaElement} */ (element("required-tags"));
const dateKeys = /** @type {const} */ ([
  "createdAt",
  "editedAt",
  "lastPlayedAt",
]);
const unknownDates = /** @type {HTMLInputElement} */ (element("unknown-dates"));
const sort = /** @type {HTMLSelectElement} */ (element("sort"));
element("library-filters").oninput = () => void render();
element("library-filters").onchange = () => void render();
element("library-filters").onsubmit = (event) => event.preventDefault();
let renderRevision = 0;
/** @param {string} id */
function element(id) {
  const node = document.getElementById(id);
  if (!node) throw Error(`Missing library element ${id}`);
  return node;
}
const cards = element("cards"),
  navigation = element("library-navigation"),
  status = element("library-status");

/** @param {Plan} plan */
function duplicateButton(plan) {
  const button = document.createElement("button");
  button.textContent = "Duplicate plan";
  button.onclick = async () => {
    button.disabled = true;
    try {
      const response = await fetch(
        `/duplicate?${new URLSearchParams({ plan: plan.id })}`,
        { method: "POST" },
      );
      if (!response.ok) throw Error("Could not duplicate plan");
      const duplicate = await response.json();
      plans = (await (await fetch("/library")).json()).plans;
      history.pushState(
        null,
        "",
        `/library.html?${new URLSearchParams({ plan: duplicate.id })}`,
      );
      await render(duplicate.id);
    } catch (error) {
      status.textContent = String(error);
      button.disabled = false;
    }
  };
  return button;
}
/** @param {Plan} plan @param {Level|null} level */
function metadataButton(plan, level = null) {
  const button = document.createElement("button");
  button.textContent = level ? "Edit level metadata" : "Edit plan metadata";
  button.onclick = () => {
    const record = level || plan;
    const scope = level ? "Level" : "Plan";
    const dialog = document.createElement("dialog");
    const form = document.createElement("form");
    for (const key of ["name", "description", "tags"]) {
      const label = document.createElement("label");
      label.textContent = `${scope} ${key}`;
      const input =
        key === "name"
          ? document.createElement("input")
          : document.createElement("textarea");
      input.name = key;
      input.value =
        key === "tags"
          ? record.tags.join("\n")
          : key === "name"
            ? record.name
            : record.description;
      if (key === "tags") input.placeholder = "One tag per line";
      if (key === "name") input.required = true;
      label.append(input);
      form.append(label);
    }
    const save = document.createElement("button");
    save.textContent = "Save metadata";
    save.type = "submit";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.type = "button";
    cancel.onclick = () => dialog.remove();
    form.append(save, cancel);
    form.onsubmit = async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        const values = new FormData(form);
        const query = new URLSearchParams({ plan: plan.id });
        if (level) query.set("level", level.id);
        const response = await fetch(`/metadata?${query}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.get("name"),
            description: values.get("description"),
            tags: String(values.get("tags"))
              .split("\n")
              .map((tag) => tag.trim())
              .filter(Boolean),
          }),
        });
        if (!response.ok) throw Error("Could not save metadata");
        plans = (await (await fetch("/library")).json()).plans;
        dialog.remove();
        await render(new URLSearchParams(location.search).get("plan"));
      } catch (error) {
        status.textContent = String(error);
        save.disabled = false;
      }
    };
    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();
  };
  return button;
}
/** @param {Plan|Level} record @param {string} scope */
function metadataDetails(record, scope) {
  const details = document.createElement("div");
  const date = record.editedAt
    ? new Date(record.editedAt).toLocaleString()
    : "Unknown";
  const created = record.createdAt
    ? new Date(record.createdAt).toLocaleString()
    : "Unknown";
  const played = record.lastPlayedAt
    ? new Date(record.lastPlayedAt).toLocaleString()
    : "Unknown";
  details.innerHTML = `<p>${Geometry.esc(record.description)}</p><p>${scope} tags: ${Geometry.esc(record.tags.join(", "))}</p><p>Created: ${Geometry.esc(created)}</p><p>Last edited: ${Geometry.esc(date)}</p><p>Last played: ${Geometry.esc(played)}</p>`;
  return details;
}

/** @param {Plan} plan @param {Level} level */
async function thumbnail(plan, level) {
  const query = new URLSearchParams({ plan: plan.id, level: level.id });
  const response = await fetch(`/model?${query}`);
  if (!response.ok) throw Error("Could not load thumbnail");
  const model = await response.json();
  const bounds = Geometry.bounds(model);
  return `<svg data-thumbnail role="img" aria-label="${Geometry.esc(level.name)} thumbnail" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}">${Geometry.scene(model, bounds, { showAxes: false, id: `thumbnail-${Geometry.esc(plan.id)}-${Geometry.esc(level.id)}` })}</svg>`;
}
/** @param {string|null} id */
async function render(id = null) {
  const revision = ++renderRevision;
  element("library-filters").hidden = Boolean(id);
  status.textContent = "";
  cards.replaceChildren();
  navigation.replaceChildren();
  const selected = plans.find((p) => p.id === id);
  if (selected) {
    const back = document.createElement("button");
    back.textContent = "All plans";
    back.onclick = () => {
      history.pushState(null, "", "/library.html");
      void render();
    };
    navigation.append(back);
    const heading = document.createElement("h2");
    heading.textContent = selected.name;
    navigation.append(
      heading,
      metadataDetails(selected, "Plan"),
      metadataButton(selected),
      duplicateButton(selected),
    );
    for (const level of selected.levels) {
      const article = document.createElement("article");
      article.innerHTML = `${await thumbnail(selected, level)}<h2>${Geometry.esc(level.name)}</h2>`;
      article.append(
        metadataDetails(level, "Level"),
        metadataButton(selected, level),
      );
      for (const mode of ["edit", "play"]) {
        const link = document.createElement("a");
        link.textContent = mode === "edit" ? "Edit" : "Play";
        link.href = `/?${new URLSearchParams({ plan: selected.id, level: level.id, mode })}`;
        article.append(link);
      }
      cards.append(article);
    }
  } else
    for (const { plan, levels, filtered } of searchLibrary(
      plans,
      search.value,
      tags.value,
      dateKeys.map((key) => ({
        key,
        from: /** @type {HTMLInputElement} */ (element(`${key}-from`)).value,
        through: /** @type {HTMLInputElement} */ (element(`${key}-through`))
          .value,
      })),
      unknownDates.checked,
      sort.value,
    )) {
      const preview = await thumbnail(plan, levels[0]);
      if (revision !== renderRevision) return;
      const article = document.createElement("article");
      article.innerHTML = `${preview}<p>${plan.levels.length} ${plan.levels.length === 1 ? "level" : "levels"}</p>`;
      const button = document.createElement("button");
      button.textContent = plan.name;
      button.onclick = () => {
        history.pushState(
          null,
          "",
          `/library.html?${new URLSearchParams({ plan: plan.id })}`,
        );
        void render(plan.id);
      };
      article.append(button);
      article.append(
        metadataDetails(plan, "Plan"),
        metadataButton(plan),
        duplicateButton(plan),
      );
      if (filtered) {
        for (const level of levels) {
          const link = document.createElement("a");
          link.textContent = `Matching level: ${level.name}`;
          link.href = `/?${new URLSearchParams({ plan: plan.id, level: level.id, mode: "edit" })}`;
          article.append(link);
        }
      }
      cards.append(article);
    }
  if (!selected && !cards.children.length)
    status.textContent = "No plans match these filters.";
}
try {
  const response = await fetch("/library");
  if (!response.ok) throw Error("Could not load library");
  plans = (await response.json()).plans;
  await render(new URLSearchParams(location.search).get("plan"));
  window.addEventListener(
    "popstate",
    () => void render(new URLSearchParams(location.search).get("plan")),
  );
} catch (error) {
  status.textContent = String(error);
}
