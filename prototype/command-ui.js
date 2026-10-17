import { createCommands } from "./commands.js";

/** @param {import('./commands.js').Command[]} definitions
 * @param {()=> 'edit'|'play'} mode
 * @param {(message:string)=>void} announce
 * @param {(message:string)=>void} signal
 */
export function installCommands(definitions, mode, announce, signal) {
  const palette = document.createElement("dialog");
  palette.className = "command-dialog";
  palette.setAttribute("aria-label", "Commands");
  const heading = document.createElement("h2");
  heading.textContent = "Commands";
  const search = document.createElement("input");
  search.setAttribute("aria-label", "Search commands");
  search.setAttribute("role", "combobox");
  search.setAttribute("aria-expanded", "true");
  search.setAttribute("aria-controls", "command-results");
  const results = document.createElement("div");
  results.id = "command-results";
  results.setAttribute("role", "listbox");
  results.setAttribute("aria-label", "Matching commands");
  const help = document.createElement("dialog");
  help.className = "command-dialog";
  help.setAttribute("aria-label", "Keyboard shortcuts");
  help.dataset.toggles = "help";
  palette.append(heading, search, results);
  document.body.append(palette, help);
  /** @type {HTMLElement|SVGElement|null} */
  let previous = null;
  let selected = 0;
  /** @type {import('./commands.js').Command[]} */
  let visible = [];
  const restore = () => {
    if (
      previous?.isConnected &&
      previous !== document.body &&
      previous.checkVisibility()
    )
      previous.focus();
    else document.getElementById("viewport")?.focus();
  };
  function close(dialog) {
    dialog.close();
    restore();
  }
  function open(dialog) {
    previous =
      document.activeElement instanceof HTMLElement ||
      document.activeElement instanceof SVGElement
        ? document.activeElement
        : null;
    dialog.showModal();
  }
  const commands = createCommands(
    [
      ...definitions.map((command) => ({
        ...command,
        run: (event) => {
          command.run(event);
          if (command.announce !== false) announce(command.label);
        },
      })),
      {
        id: "palette",
        label: "Command palette",
        keys: ["Mod+K", "/"],
        scope: "both",
        run: () => {
          search.value = "";
          selected = 0;
          render();
          open(palette);
          search.focus();
        },
      },
      {
        id: "help",
        label: "Keyboard shortcuts",
        keys: ["?"],
        scope: "both",
        run: showHelp,
      },
    ],
    (command, reason) => signal(`${command.label}: ${reason}`),
  );
  function execute(id) {
    commands.execute(id, mode());
  }
  function render() {
    const query = search.value.toLowerCase().replaceAll(" ", "");
    visible = commands.list(mode()).filter((command) => {
      let position = 0;
      for (const letter of command.label.toLowerCase())
        if (letter === query.charAt(position)) position++;
      return position === query.length;
    });
    const rank = (command) =>
      Number(command.label.toLowerCase().replaceAll(" ", "") !== query);
    visible.sort((a, b) => rank(a) - rank(b));
    selected = Math.min(selected, Math.max(0, visible.length - 1));
    results.replaceChildren();
    search.removeAttribute("aria-activedescendant");
    visible.forEach((command, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.id = `command-option-${index}`;
      if (index === selected)
        search.setAttribute("aria-activedescendant", option.id);
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === selected));
      updateAvailability(option, command);
      option.addEventListener("click", () => choose(index));
      results.append(option);
    });
  }
  function updateAvailability(option, command) {
    const availability = commands.available(command);
    const disabled = String(availability !== true);
    const text = `${command.label} (${command.keys.join(", ") || "palette"})${availability === true ? "" : ` — ${availability || "Unavailable"}`}`;
    if (option.getAttribute("aria-disabled") !== disabled)
      option.setAttribute("aria-disabled", disabled);
    if (option.textContent !== text) option.textContent = text;
  }
  function refreshAvailability() {
    if (!palette.open) return;
    visible.forEach((command, index) => {
      const option = results.children.item(index);
      if (option) updateAvailability(option, command);
    });
  }
  function choose(index) {
    const command = visible.at(index);
    if (!command || commands.available(command) !== true) return;
    close(palette);
    execute(command.id);
  }
  function showHelp() {
    if (help.open) return close(help);
    help.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = "Keyboard shortcuts";
    help.append(title);
    const policy = document.createElement("p");
    policy.textContent =
      "Bare keys perform reversible actions; switching context and destructive actions require a modifier. Mod means Ctrl or Command. Fields retain native editing. S export is removed; use Mod+E. GM view uses Shift+V only: V and Shift+F are removed. Hold Space to pan in either mode; release restores your interaction. The palette arms the next pan drag only; Escape cancels it. Shift-arrows pan in both modes; plain arrows pan in Edit and move the Observer in Play. Clear marks uses Shift+Backspace (Mac Delete ⌫), not forward Delete. ⌘-click a character marker, or press ⌘/Ctrl+Enter on a focused marker, to edit that character.";
    help.append(policy);
    for (const scope of ["both", "edit", "play"]) {
      const heading = document.createElement("h3");
      heading.textContent =
        scope === "both" ? "Both" : scope === "edit" ? "Edit" : "Play";
      help.append(heading);
      const entries = new Map(
        [...commands.list("edit"), ...commands.list("play")].map((item) => [
          item.id,
          item,
        ]),
      );
      for (const command of entries.values())
        if (command.scope === scope) {
          const row = document.createElement("p");
          row.textContent = `${command.label}: ${command.keys.join(", ") || "Command palette"}`;
          help.append(row);
        }
    }
    const button = document.createElement("button");
    button.textContent = "Close";
    button.addEventListener("click", () => close(help));
    help.append(button);
    open(help);
  }
  search.addEventListener("input", () => {
    selected = 0;
    render();
  });
  palette.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      selected =
        (selected + (event.key === "ArrowDown" ? 1 : -1) + visible.length) %
        (visible.length || 1);
      render();
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(selected);
    }
  });
  document.addEventListener("click", (event) => {
    const open = document.querySelector("dialog[open]");
    if (
      !(open instanceof HTMLDialogElement) ||
      event.target !== open ||
      !open.matches(".command-dialog, [data-toggles]")
    )
      return;
    const box = open.getBoundingClientRect();
    if (
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom
    )
      return;
    const cancel = new Event("cancel", { cancelable: true });
    if (open.dispatchEvent(cancel)) open.close();
  });
  for (const dialog of [palette, help])
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close(dialog);
    });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.defaultPrevented) return;
      const open = document.querySelector("dialog[open]");
      if (open) {
        const id = open instanceof HTMLElement ? open.dataset.toggles : "";
        if (id && commands.binds(id, event, mode())) {
          event.preventDefault();
          event.stopImmediatePropagation();
          execute(id);
        }
        return;
      }
      if (
        event.key !== "Escape" &&
        event.target instanceof Element &&
        event.target.closest("input,textarea,select,[contenteditable]")
      )
        return;
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
        ].includes(event.key) &&
        event.target instanceof Element &&
        event.target.closest('[role="tab"], [role="toolbar"]')
      )
        return;
      if (
        event.key === " " &&
        event.target instanceof Element &&
        event.target.closest("button,a,summary,[role=button],[data-character]")
      )
        return;
      if (commands.dispatch(event, mode())) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  for (const toolbar of document.querySelectorAll('[role="toolbar"]')) {
    const controls = () =>
      [...toolbar.querySelectorAll("button, a, summary")].filter(
        (item) =>
          item instanceof HTMLElement &&
          item.checkVisibility() &&
          !item.hasAttribute("disabled"),
      );
    const select = (target) => {
      for (const item of toolbar.querySelectorAll("button, a, summary"))
        item.setAttribute("tabindex", item === target ? "0" : "-1");
    };
    select(
      controls()[0] ??
        toolbar.querySelector("button:not([disabled]), a, summary"),
    );
    toolbar.addEventListener("focusin", (event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("input,textarea,select")
      )
        select(event.target);
    });
    toolbar.addEventListener("keydown", (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("input,textarea,select")
      )
        return;
      if (
        !(event instanceof KeyboardEvent) ||
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
        ].includes(event.key)
      )
        return;
      const items = controls();
      const index = document.activeElement
        ? items.indexOf(document.activeElement)
        : -1;
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (index +
                (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) +
                items.length) %
              items.length;
      const target = items.at(next);
      if (target instanceof HTMLElement) target.focus();
      event.preventDefault();
      event.stopPropagation();
    });
  }
  return {
    execute,
    refreshAvailability,
    bind(selector, id, label = false) {
      const command = [...commands.list("edit"), ...commands.list("play")].find(
        (item) => item.id === id,
      );
      if (!command) throw Error(`Unknown command ${id}`);
      document.querySelectorAll(selector).forEach((element) => {
        element.setAttribute(
          "title",
          `${command.label} (${command.keys.join(", ")})`,
        );
        element.setAttribute(
          "aria-keyshortcuts",
          command.keys
            .flatMap((key) =>
              key.includes("Mod")
                ? [key.replace("Mod", "Control"), key.replace("Mod", "Meta")]
                : [key],
            )
            .join(" "),
        );
        if (element.hasAttribute("data-command-icon"))
          element.setAttribute("aria-label", command.label);
        if (label) element.textContent = command.label;
        element.addEventListener("click", (event) => {
          event.preventDefault();
          execute(id);
        });
      });
    },
  };
}
