# RPGCAD context

RPGCAD lets a Traveller Referee develop their own floor plans through an agent, with minimal delay between an instruction and its visible result. In Edit mode the user is the Designer; in Play the user is the Referee. These name activities, not separate accounts or permissions. The Designer supplies the design intent. The agent translates it into geometry, clarifies missing design choices, and inspects the rendered result.

## Read next

- `docs/agents/designer-conversation.md`: handling a Designer instruction, drawing marks and coordinates.
- `GLOSSARY.md`: domain vocabulary.
- `docs/adr/`: decisions that are hard to reverse, with their reasons.
- `docs/design-notes.md`: agreed requirements and open design questions.
- `docs/prototype-findings.md`: observed successes, mistakes and corrections.
- `docs/commands.md`: the command and shortcut inventory.
- `prototype/README.md`: running and operating the experiment.

## Current state

The prototype is a throwaway: authoritative JSON model files, a Python standard-library loopback server and browser JavaScript/SVG rendering. It is an experiment, not a settled architecture. One server serves a library of plans and their levels, selected with `?plan=<id>&level=<id>`. Without a library record the plan manifest supplies the Referee building with its ground level and two lower levels (`?level=below`, `?level=below-2`).

- The Referee's building was developed interactively in this conversation; preserve it when changing the prototype. It has four corner rooms with ceiling hatches and wall-mounted step irons, two lifts, closed doors and a spiral staircase with a platform. The level below starts with aligned copies of the lifts and staircase.
- The drawing view shows only the drawing and its permanent 1.5 m grid. Models have no page boundary. Play uses a fixed layout with exploration, no red reference axes and the grid.
- The Referee's reference for components is Robert Pearce's Yet Another Traveller Blog. `catalog/pearce-symbols/` keeps 2,185 source symbol images, 29 checked door/hatch meanings and 2,004 named CAD blocks; `docs/research/component-inventory.md` describes 59 identifiable families. Original artwork stays distinct from them. The Referee's approval of the six seed component families (ticket #13) is pending and gates catalogue expansion; custom geometry and assemblies are later scope.
- Binding Play to a layout revision is a proposal; the policy for adopting later edits is open.

Behaviour, operations and the checks that apply live in `prototype/README.md`, `docs/commands.md` and `docs/prototype-findings.md`.

## Documentation discipline

Record settled requirements in the design notes, terms in the glossary, hard-to-reverse decisions in `docs/adr/`, and observed lessons in the findings. Keep this file a short entry point. Distinguish implemented behaviour, agreed requirements and proposals. Update the relevant record when a correction or evaluation resolves something; screenshots and chat history alone are insufficient.
