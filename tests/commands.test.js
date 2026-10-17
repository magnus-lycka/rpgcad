import { test } from "node:test";
import assert from "node:assert/strict";
import { createCommands } from "../prototype/commands.js";

test("commands match either primary modifier, require exact Shift and ignore unsafe repeats", () => {
  const ran = [];
  const commands = createCommands([
    {
      id: "export",
      label: "Export",
      keys: ["Mod+E"],
      scope: "both",
      run: () => ran.push("export"),
    },
    {
      id: "mode",
      label: "Switch mode",
      keys: ["Shift+E"],
      scope: "both",
      repeat: false,
      run: () => ran.push("mode"),
    },
  ]);
  for (const modifier of ["ctrlKey", "metaKey"])
    commands.dispatch({ key: "e", [modifier]: true }, "edit");
  commands.dispatch({ key: "E", shiftKey: true, repeat: true }, "play");
  commands.dispatch({ key: "e" }, "edit");
  commands.dispatch({ key: "E", shiftKey: true }, "play");
  assert.deepEqual(ran, ["export", "export", "mode"]);
});

test("registry rejects overlapping and unrelated cross-mode bindings but permits analogous directions", () => {
  const definition = { label: "Action", keys: ["ArrowLeft"], run() {} };
  assert.throws(
    () =>
      createCommands([
        { ...definition, id: "a", scope: "edit" },
        { ...definition, id: "b", scope: "play" },
      ]),
    /conflict/i,
  );
  assert.throws(
    () =>
      createCommands([
        { ...definition, id: "a", scope: "both", analogy: "direction" },
        { ...definition, id: "b", scope: "play", analogy: "direction" },
      ]),
    /conflict/i,
  );
  assert.doesNotThrow(() =>
    createCommands([
      { ...definition, id: "a", scope: "edit", analogy: "direction" },
      { ...definition, id: "b", scope: "play", analogy: "direction" },
    ]),
  );
});

test("registry rejects bindings that dispatch the same event despite modifier order or symbol Shift", () => {
  for (const [first, second] of [
    ["Mod+Shift+E", "Shift+Mod+E"],
    ["?", "Shift+?"],
    ["+", "Shift++"],
    ["Space", " "],
  ]) {
    const command = { label: "Action", run() {} };
    assert.throws(
      () =>
        createCommands([
          { ...command, id: "a", scope: "both", keys: [first] },
          { ...command, id: "b", scope: "edit", keys: [second] },
        ]),
      /conflict/i,
      `${first} and ${second} overlap`,
    );
    assert.throws(
      () =>
        createCommands([
          { ...command, id: "a", scope: "play", keys: [first] },
          { ...command, id: "b", scope: "edit", keys: [second] },
        ]),
      /conflict/i,
      "unrelated cross-mode reuse remains forbidden",
    );
    assert.doesNotThrow(() =>
      createCommands([
        {
          ...command,
          id: "a",
          scope: "play",
          keys: [first],
          analogy: "same-action",
        },
        {
          ...command,
          id: "b",
          scope: "edit",
          keys: [second],
          analogy: "same-action",
        },
      ]),
    );
  }
});

test("punctuation bindings match however the keyboard layout produces them", () => {
  const ran = [];
  const commands = createCommands([
    {
      id: "up",
      label: "Up",
      keys: [">"],
      scope: "play",
      run: () => ran.push(">"),
    },
    {
      id: "open",
      label: "Open",
      keys: ["["],
      scope: "play",
      run: () => ran.push("["),
    },
    {
      id: "letter",
      label: "Letter",
      keys: ["z"],
      scope: "play",
      run: () => ran.push("z"),
    },
  ]);
  commands.dispatch({ key: ">", shiftKey: true }, "play");
  commands.dispatch({ key: "[", altKey: true }, "play");
  commands.dispatch({ key: "z", altKey: true }, "play");
  assert.deepEqual(ran, [">", "["]);
});
