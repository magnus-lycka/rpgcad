# RPGCAD context

RPGCAD lets a Traveller Referee develop their own floor plans through an agent, with minimal delay between an instruction and its visible result. The Referee supplies the design intent. The agent translates it into geometry, clarifies missing design choices, and inspects the rendered result.

## Read next

- `docs/design-notes.md`: agreed requirements and explicitly open design questions, including plan organisation and exploration visibility.
- `docs/prototype-findings.md`: observed successes, mistakes, corrections, and their implications for future work.
- `GLOSSARY.md`: domain vocabulary.
- `prototype/README.md`: running and operating the current experiment.

## Current state

The throwaway prototype uses an authoritative JSON model file, a Python standard-library loopback server, and browser-side JavaScript/SVG rendering. One server serves both levels selected with `?level=below`; a prototype plan manifest groups them. This is an experiment, not a settled production architecture.

The current model is the Referee's building, developed interactively in this conversation. Preserve it when changing the prototype. It includes four corner rooms with ceiling hatches and wall-mounted step irons, two lifts, closed doors, and a spiral staircase with a platform. The level immediately below now starts with aligned copies of the two lifts and staircase/platform, with the stair labelled UP. `prototype/plan.PROTOTYPE.json` groups both model files as the same plan. The original model is preserved.

The browser drawing view contains only the drawing and its permanent 1.5 m grid. Models have no page boundary. At 1:75, grid squares print at 20 mm. A movable reference origin identifies existing grid axes; moving it must preserve grid and geometry alignment.

A minimal two-level manifest and URL selection are implemented, with independent exploration files per level. A level-switching control and searchable plan metadata remain unimplemented. Exploration visibility now has a throwaway prototype (`?fog=1`) with position/range observers, explicit sight blockers, door states, and persistent observation history and shared model revisions in a separate exploration file. Its current assumptions and unresolved details are recorded in the design notes and prototype README.

Reusable drawing components are a requested direction, not implemented. Future plans need both variation and recognisable conventions; the agent should reuse suitable catalogue entries without inventing arbitrary standards. The Referee identified Robert Pearce's Yet Another Traveller Blog as a reference. A browsable source catalogue now lives in `catalog/pearce-symbols/`: 2,185 original symbol images, 29 checked door/hatch meanings and an index of 2,004 named CAD blocks. `docs/research/component-inventory.md` describes 59 identifiable families. These are source references; calibrated reusable model instances and placement/sight semantics remain unimplemented. See the design notes for the distinction between requirements and proposed catalogue work.

Editing and play are distinct requested modes, not yet implemented. Play is expected to use a fixed layout with exploration and no red reference axes; the grid remains. Binding play to a layout revision is a proposal, with the policy for adopting later edits still open.

## Documentation discipline

Record settled requirements in the design notes, terms in the glossary, and observed prototype lessons in the findings. Keep this file as a short entry point. Distinguish implemented behaviour, agreed requirements, and proposals. Update the relevant record when a correction or evaluation resolves something; screenshots and chat history alone are insufficient.
