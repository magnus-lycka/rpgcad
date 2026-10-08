# Prototype findings

Recorded from the Referee's interactive evaluation on 2026-10-08. These are observations and working rules, not a claim that the general design problem is solved.

## Working loop

The initial UI and invented sample missed the requirement. The useful loop is the Referee describing their design, the agent making targeted model edits, and the browser displaying only the drawing on a permanent grid. The Referee subsequently described this experience as substantially better than previous attempts without tooling.

Whole-model file updates supported targeted edits without having to redesign the rest. Manual checks confirmed preservation of the browser viewBox across live updates and retention of the previous valid model when an opening was invalid. A disposable model with 900 walls, 500 openings, and 500 labels took about 37 ms to parse and build its view, excluding browser paint; file changes are checked every 250 ms. Agent reasoning and tool execution add separate latency.

The specific SVG/JSON/Python arrangement is an experimental implementation, not a validated final stack.

## Geometry and coordinate lessons

- Keep the model, viewport, print sheets, grid alignment, and reference origin distinct. The Referee rejected treating a sheet boundary as a drawing boundary.
- An origin requested near a building centre belongs at the nearest existing grid intersection. An early attempt shifted the grid to the exact centre; that was corrected. Moving the reference must leave geometry and grid alignment intact.
- Centre-line wall dimensions differ from clear interior dimensions. State the convention and account for wall thickness when placing openings and attached symbols.
- When moving a corner room outward, reconnect adjoining building walls to its perimeter; do not leave wall segments cutting through its interior.
- Shared walls should be represented once; the second lift reused part of the first lift's wall.

## Doors and lifts

- Closed doors should visibly read as closed. The Referee preferred thin rectangular panels with a meeting seam over swing arcs. Opening mechanism need not be encoded in the visible symbol.
- The cargo lift's maximum door width is constrained by its car, not merely by the shaft wall. A shaft-wide attempt exceeded the car width and was corrected.
- An inset thin outline made the lift car distinguishable from its shaft. Furniture and equipment outlines need separate drawing primitives from physical walls.
- Place doors in the part of a corner room's wall facing the building interior, allowing for the outward shift and adjoining wall junctions.

## Ceiling access and step irons

- The requested ceiling hatch is a dashed circle. An initial 0.64 m diameter read as too small; the Referee accepted an enlarged 1 m diameter.
- A row of rungs perpendicular to a wall read as a ladder lying sideways. A subsequent loose-ladder symbol also missed the intended object: rounded, wall-attached step irons.
- Show one rounded step iron in plan. Its attachment points belong on the inner wall face and its projection must point into the room. Check the physical wall side after copying or reflecting it; a geometrically transformed symbol is not sufficient evidence of correct placement.
- The initial step iron projected 0.25 m. The Referee requested a smaller projection; 0.12 m was accepted.
- When repeating a room detail, make the scope and orientation of the copy clear. Inspect destination rooms at a readable zoom, including wall side and access, before claiming they match. The copying interaction exposed that a whole-plan thumbnail is insufficient for checking these details.

## Staircase

The Referee specified a 3 × 3 m bay beside the small lift, then refined it to a lower-right 1.5 × 1.5 m platform and spiral stair in the other three squares. A right-side wall and a 1.3 m platform door completed the bay. The Referee approved the resulting floor. Preserve that platform and access arrangement rather than treating the stair as an interchangeable circular icon.

## Verification and open limitations

Inspect the full plan for unintended changes and affected details at close range for physical plausibility. Check door/car limits, wall attachments, access, and symbol orientation explicitly. A render succeeding is not proof that the Referee's design was followed.

Print previews were checked for A4/A3 physical dimensions. Actual PDF/paper scale remains unverified. Junction cleanup, relationships between independent objects, multi-level alignment, and persistence/cataloguing remain future work. The renderer still uses simple overlapping wall polygons and manually positioned symbols.

## Unfog experiment

The prototype ray-casts against physical wall polygons and closed-door boundaries, with a finite range per observer. Rendered symbols do not automatically block sight. A scratch exploration file stores observer positions/ranges, door overrides, and accumulated revealed regions separately from the authored level. Current visibility is bright, explored-but-unseen geometry is muted, and unknown regions show only the grid/reference axes.

Manual geometry probes using the current floor: a point behind the upper double doors was hidden with the doors closed and visible with them open; a point beyond range stayed hidden. An in-memory furniture outline did not obstruct visibility until explicitly marked `blocksSight: true`. That probe did not change the building file. Browser movement checks showed accumulated reveal and saved observer/reveal data.

Reset must make the entire plan foggy again, rather than immediately revealing the current observer's view. Reset clears remembered regions and pauses visibility until the next observer placement or move; this pause is part of the saved exploration state so reload does not undo the reset.

The Referee's cargo-lift leak was reproduced at observer position `[12.37, 1.287]` with 6 m range. Raw visibility hid the tested cargo-car points correctly, but `Fog.compact` reduced the polygon from 676 vertices to 18 and exposed those same points. Duplicate ray hits at wall corners caused the collinearity filter to remove every copy of essential corners, bridging across blockers. Existing saved exploration contains corrupted regions; fixing future calculations alone cannot repair that history.

A read-only probe also found approximately 1,300 stored reveal regions with only 11 unique values. Refreshing accepted exploration appends and saves visibility even when unchanged, allowing redundant accumulation. This needs correction alongside visibility simplification; multiple-client amplification is possible but was not established.

A later measurement found 12,657,030 bytes of exploration data: 2,492 revealed regions, still only 11 unique regions. Without whitespace the full file was 3,363,045 bytes; unique regions required about 36,784 bytes, while all non-region state required 123 bytes. The Referee rejected persisted fog polygons, including deduplication as the long-term answer. The agreed replacement stores observation inputs and reconstructs visibility; any polygon cache must be disposable and bounded. The version-2 prototype now implements this replacement.

Visibility rays stop at wall surfaces. Those wall faces need explicit visible boundary strokes; enlarging the reveal mask to expose walls would risk leaking geometry behind them. Hidden hatches, labels, lift outlines, and stair symbols are clipped with the rest of the model.

The replacement removes polygon simplification from visibility reconstruction. A temporary probe reproduced the cargo-lift leak before the change and hid the same interior point afterward. Additional probes checked consecutive duplicate observations, historical door/model independence, and reset clearing knowledge/closing doors without revealing. Browser checks confirmed Shift-G opens controls and numeric range entry works. Corrupted old polygon history was reset rather than migrated into observations it cannot reliably reconstruct.

Limitations: no lighting or eye-height model, movement-path collision, individual player knowledge, or multi-level storage yet. Last-seen geometry is retained through shared revision snapshots; long observation histories and many authored revisions need performance/storage evaluation. It is a Referee-side visual prototype, not a secure player client.
