import { Geometry } from "./geometry.js";

/** @typedef {{id:string,name:string,model:string}} Level */
/** @typedef {{id:string,name:string,levels:Level[]}} Plan */
/** @type {Plan[]} */
let plans = [];
/** @param {string} id */
function element(id) {
  const node = document.getElementById(id);
  if (!node) throw Error(`Missing library element ${id}`);
  return node;
}
const cards = element("cards"),
  navigation = element("library-navigation"),
  status = element("library-status");

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
    navigation.append(heading);
    for (const level of selected.levels) {
      const article = document.createElement("article");
      article.innerHTML = `${await thumbnail(selected, level)}<h2>${Geometry.esc(level.name)}</h2>`;
      for (const mode of ["edit", "play"]) {
        const link = document.createElement("a");
        link.textContent = mode === "edit" ? "Edit" : "Play";
        link.href = `/?${new URLSearchParams({ plan: selected.id, level: level.id, mode })}`;
        article.append(link);
      }
      cards.append(article);
    }
  } else
    for (const plan of plans) {
      const article = document.createElement("article");
      article.innerHTML = `${await thumbnail(plan, plan.levels[0])}<p>${plan.levels.length} ${plan.levels.length === 1 ? "level" : "levels"}</p>`;
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
      cards.append(article);
    }
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
