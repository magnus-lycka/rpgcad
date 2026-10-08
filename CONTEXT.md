# RPGCAD context

RPGCAD lets a Traveller Referee develop their own floor plans through an agent, with minimal delay between an instruction and its visible result. The Referee supplies the design intent. The agent translates it into geometry, clarifies missing design choices, and inspects the rendered result.

## Read next

- `docs/design-notes.md`: agreed requirements and explicitly open design questions, including plan organisation and exploration visibility.
- `docs/prototype-findings.md`: observed successes, mistakes, corrections, and their implications for future work.
- `GLOSSARY.md`: domain vocabulary.
- `prototype/README.md`: running and operating the current experiment.

## Current state

The throwaway prototype uses an authoritative JSON model file, a Python standard-library loopback server, and browser-side JavaScript/SVG rendering. It implements one level. This is an experiment, not a settled production architecture.

The current model is the Referee's building, developed interactively in this conversation. Preserve it when changing the prototype. It includes four corner rooms with ceiling hatches and wall-mounted step irons, two lifts, closed doors, and a spiral staircase with a platform. Further levels below this floor are intended to belong to the same plan.

The browser drawing view contains only the drawing and its permanent 1.5 m grid. Models have no page boundary. At 1:75, grid squares print at 20 mm. A movable reference origin identifies existing grid axes; moving it must preserve grid and geometry alignment.

Plan/level storage and searchable catalogue metadata are not implemented. Exploration visibility now has a throwaway prototype (`?fog=1`) with position/range observers, explicit sight blockers, door states, and persistent observation history and shared model revisions in a separate exploration file. Its current assumptions and unresolved details are recorded in the design notes and prototype README.

## Documentation discipline

Record settled requirements in the design notes, terms in the glossary, and observed prototype lessons in the findings. Keep this file as a short entry point. Distinguish implemented behaviour, agreed requirements, and proposals. Update the relevant record when a correction or evaluation resolves something; screenshots and chat history alone are insufficient.
