# RPGCAD

## Platform

web

## Users

The same user acts as Designer while developing a plan in Edit mode and as
Referee while running a Traveller tabletop role-playing game in Play mode.
These are activities, not separate accounts or permission roles.

## Product Purpose

Turn the Designer's intentions into usable floor plans and maps with minimal
delay. Support buildings, starship interiors and larger locations, displayed
on screen or printed for tabletop play. Success means an accurate, readable
representation of the user's intended layout that can be refined interactively.

## Positioning

The core interaction combines a drawing in the browser with an existing agent
conversation. The Designer makes rough freehand marks on the displayed model
and describes the change in chat. The agent reads those marks and the complete
model, edits the geometry, inspects the rendered result and responds to feedback.
The browser supplies spatial context; chat supplies intent. No separate browser
instruction form or sketch submission is required.

## Operating Context

Plans contain multiple levels. The drawing has no fixed boundary; the viewport
and paper sheets are representations of portions of the model. The permanent
grid represents 1.5 m squares. At 1:75 each square measures 20 mm on paper;
landscape A4 covers 14 × 10 squares and portrait A3 covers 14 × 20 squares.
Print only the grid and authored content that fits each tile.

In Edit mode the Designer inspects, pans, zooms, sketches and browses reusable
components directly. Pan is the default tool. The small tool palette leaves
most space for the drawing. Play mode gives the Referee a drawing-first view
with controls on request, character placement and movement, door states, and
persistent exploration fog. The grid remains visible in both modes. Play is
also the player-facing display: keep it free of persistent controls or discovery
hints that distract from immersion. The Referee can remember Shift-G to open
the GM menu. Show current plan/level context in Edit and inside the open GM menu
in Play, rather than on the closed Play display.

## Capabilities and Constraints

- Use real-world metres and support positions and wall geometry between grid lines.
- Preserve the current view when agent edits arrive. Prioritise a short feedback loop.
- Interpret raw strokes only with the accompanying intent. Present a reasonable
  first interpretation promptly, then correct it with the Designer.
- Separate layout authoring from play state. Fog, doors and characters must not
  accidentally reveal hidden information or change the authored layout.
- Use recognisable, reusable component symbols and consistent physical meanings.
  The user evaluates appearance; passing automated tests alone does not establish it.
- Names, tags, dates and plan/level browsing support a growing collection of plans.
- Screen styling must preserve physical dimensions and readable monochrome printing.

The current prototype uses a Python loopback server, authoritative JSON files and
browser JavaScript/SVG. This is an experiment, not a final architecture commitment.
Later integration with ceres.rounds is anticipated; its protocol is undecided.
The policy for adopting design changes during ongoing play remains open.

## Evidence on Hand

The user has developed a multi-level building through the prototype and accepted
manual A4 printing at 100% within 1% of the intended scale. A separate component
demo supports visual evaluation. Product decisions and observed corrections are
recorded in `docs/design-notes.md` and `docs/prototype-findings.md`; `CONTEXT.md`
describes the implemented feedback loop and `GLOSSARY.md` defines domain terms.

Traveller reference material informs meanings and recognisability. RPGCAD's
component artwork is original; reference inventories are not unrestricted
production assets. Preserve provenance and applicable licensing.

## Product Principles

1. The user's intent governs the design; visible feedback drives refinement.
2. The drawing gets almost all the space; controls support the current activity.
3. Model dimensions and spatial meaning stay independent of presentation.
4. Protect secrets during play and keep exploration separate from authoring.
5. Prefer recognisable reusable parts, judged in real layouts and on paper.

Menu styling uses black, white and neutral greys. Do not introduce warm paper
tints or coloured accents: they clashed with the drawing in Referee evaluation.
