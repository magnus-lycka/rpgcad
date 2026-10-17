/** @typedef {{id:string,label:string,keys:string[],scope:'both'|'edit'|'play',repeat?:boolean,announce?:boolean,enabled?:()=>boolean|string,run:(event?:KeyboardEvent)=>unknown,analogy?:string}} Command */
/** @param {Command[]} definitions */
export function createCommands(definitions) {
  for (const [index, command] of definitions.entries()) {
    for (const previous of definitions.slice(0, index)) {
      const overlap =
        command.scope === "both" ||
        previous.scope === "both" ||
        command.scope === previous.scope;
      const sameKey = command.keys.some((key) =>
        previous.keys.some((other) =>
          signatures(key).some((signature) =>
            signatures(other).includes(signature),
          ),
        ),
      );
      if (
        command.id === previous.id ||
        (sameKey &&
          (overlap || !command.analogy || command.analogy !== previous.analogy))
      )
        throw Error(`Command conflict: ${previous.id} / ${command.id}`);
    }
  }
  const available = (command) => command.enabled?.() ?? true;
  const list = (mode) =>
    definitions.filter(
      (command) => command.scope === "both" || command.scope === mode,
    );
  function execute(id, mode, event = undefined) {
    const command = list(mode).find((item) => item.id === id);
    if (!command || available(command) !== true) return false;
    command.run(event);
    return true;
  }
  return {
    list,
    available,
    execute,
    binds(id, event, mode) {
      const command = list(mode).find((item) => item.id === id);
      return !!command && command.keys.some((key) => matches(key, event));
    },
    dispatch(event, mode) {
      const command = list(mode).find((item) =>
        item.keys.some((key) => matches(key, event)),
      );
      if (!command) return false;
      if (!event.repeat || command.repeat !== false)
        execute(command.id, mode, event);
      return true;
    },
  };
}
function signatures(binding) {
  const parts = binding.split("+");
  const key = parts.pop() || "+";
  const shifts = isSymbol(key) ? [false, true] : [parts.includes("Shift")];
  return shifts.map((shift) =>
    JSON.stringify([
      key === "Space" ? " " : key.toLowerCase(),
      parts.includes("Mod"),
      shift,
    ]),
  );
}
function isSymbol(key) {
  return key.length === 1 && !/[a-z0-9]/i.test(key);
}
function matches(binding, event) {
  const key = binding.split("+").pop() || "+";
  return (
    (!event.altKey || isSymbol(key)) &&
    signatures(binding).includes(
      JSON.stringify([
        event.key.toLowerCase(),
        Boolean(event.ctrlKey || event.metaKey),
        Boolean(event.shiftKey),
      ]),
    )
  );
}
