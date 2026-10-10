# Prototype findings

Recorded from the Referee's interactive evaluation on 2026-10-08 and 2026-10-09. These are observations and working rules, not a claim that the general design problem is solved.

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
- Open doors must retain a visible trace. Use a thin dashed, unfilled outline in their doorway; do not remove their symbol entirely. This is a drawing convention, independent of sight blocking.
- Door leaves must be thinner than their walls, including the sight-blocking geometry. A full-wall-thickness blocker hides the inset door symbol and makes closed doors look like wall faces in fog. The current building uses 0.06 m leaves in 0.15 m walls (0.20 m for the upper double-door frame).
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

The platform outline originally continued underneath its bottom/right walls, leaving a false solid line through the open doorway. Draw only its top/left edges, which separate the platform from the stair; omit edges already bounded by walls and doors.

## Verification and open limitations

Inspect the full plan for unintended changes and affected details at close range for physical plausibility. Check door/car limits, wall attachments, access, and symbol orientation explicitly. A render succeeding is not proof that the Referee's design was followed.

Print previews were checked for A4/A3 physical dimensions. The Referee subsequently verified A4 paper scale at manual 100% to within 1%, accepted for this prototype; A3 physical scale has not been checked. Junction cleanup, relationships between independent objects, multi-level alignment, and persistence/cataloguing remain future work. The renderer still uses simple overlapping wall polygons and manually positioned symbols.

An A4 landscape PDF was subsequently generated from the prototype's own `Geometry.sheet` output using `region=plan` tile placement. The current building fits on one page without shrinking. PDF inspection confirmed a 297 × 210 mm page and grid pattern spacing of 20 mm (56 PDF points × 1.012373 pattern transform, within serialization precision). A rendered page was visually inspected. The independent calibration ruler is 30 mm. Actual paper measurement is still awaiting the Referee; the in-app print shortcut did not open a dialog, and opening Preview was blocked by pending macOS Computer Use permissions.

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

## Paper evaluation, 2026-10-09

The Referee printed the A4 PDF at manual 100% and measured less than 1% scale error, explicitly accepted. Printer fit/fill modes changed the preview size; their cause was not established. Peripheral corner crosses were partially clipped and the heading/calibration ruler did not print, while the required plan image was fine. These extras were unsolicited and rejected. Removed all print-added crosses, headings, tile coordinates, and rulers. A4 output now consists solely of a centred 14 × 10 grid (280 × 200 mm at 20 mm spacing) and the plan clipped to that region. Preserve authored plan labels/reference axes. Print at manual 100%; do not resize the map to accommodate printer fit/fill settings. The revised PDF was visually checked and its grid remains 20 mm digitally.

## Starting the lower floor, 2026-10-10

The Referee requested only copies of the lifts and stairs. The new model preserves their coordinates, origin, grid alignment, car outlines, doors and stair platform. The original bottom wall also bounds the lifts/stair; only its 6 m section spanning the copied bays is retained. The rest of the building and corner details are not copied. The lower stair reads UP, connecting to the original floor; a test exposed that the renderer had previously hardcoded DOWN regardless of the model's direction. Direction now controls the label, while the copied stair geometry is unchanged. The rendered lower-level core was visually inspected.

The existing `--model`/`--port` options display the second level without replacing the first. A manifest records both as one plan. This does not implement a level-switching UI or independent exploration endpoints.

## First autocannon tower outline, 2026-10-10

The Referee specified a 4 cm square at 1:75 (3 × 3 m), with its left wall aligned to the ground building’s open left boundary (stored x=0). Its lower wall is 15 cm at 1:75 (11.25 m) below the ground building’s lower wall (stored y=9): the tower spans x=0..3 and y=17.25..20.25. Only an outline is drawn on the lower level; shaft routes, cannon details and the second tower’s position have not been specified.

The second tower is the first rotated 180° about the main building’s actual centre, stored [8.625, 4.5], rather than its snapped reference origin [9, 4.5]. Its outline spans x=14.25..17.25 and y=-11.25..-8.25, aligning its right edge to the building’s right boundary.

## Lower-level circulation, 2026-10-10

The Referee requested a 3 m strip to the right of the stair/cargo lift, a 3 m corridor above the cargo lift matching the ground floor, and a 1.5 m corridor to the upper-right tower. The strip spans stored x=13.5..16.5 beside y=3..9; the upper corridor spans y=0..3, with the original double-door frame copied at x=7.5. The circulation spaces join without a dividing wall. Widths follow the prototype’s existing wall-centre-line convention.

The Referee confirmed that the narrow corridor continues inside the tower footprint to an access shaft. It is centred on the tower, x=15..16.5, runs north from y=0 and terminates at y=-9.75 beneath the tower centre. Shaft dimensions and its access symbol remain unspecified, so no shaft details are drawn yet.

The Referee then extended the tower corridor another half grid square (0.75 m), moving its end from stored y=-9.75 to y=-10.5.

The Referee removed the copied upper double door/frame: the upper corridor joins the space to the left of the lifts directly. That space matches the ground-floor extent, stored x=0..7.5 and y=0..9, with top/bottom boundaries and the left side open as above. No corner rooms were requested for this floor.

The Referee then closed the lower level’s left side with a wall at stored x=0, y=0..9. The ground floor remains open on that side.

The second tower access corridor matches the first under the established 180° symmetry: 1.5 m wide, stored x=0.75..2.25 and y=9..19.5. An un-doored opening through the left area’s bottom wall joins it to that area; its end is 0.75 m short of the tower’s far outline, matching the upper corridor.

The Referee requested a 9 m long, 1.5 m wide corridor with its lower wall at reference y=1.5 m, confirmed a room measuring 3 × 3 grid squares (4.5 × 4.5 m), and confirmed the corridor runs left from the main area. The corridor spans stored x=-9..0, y=4.5..6 (reference origin y=4.5). The room is centred on the corridor and spans x=-13.5..-9, y=3..7.5. Open connections cut the main area’s left wall and the room’s right wall; no doors were specified.

The Referee corrected the reference Y convention: positive Y is upward from the red horizontal axis. The west corridor and room were moved up two grid lines (3 m). The corridor now spans stored y=1.5..3, so its lower wall is reference y=+1.5 m; the centred room spans stored y=0..4.5. Convert reference coordinates using x=storedX−originX and y=originY−storedY. The earlier interpretation used screen-down Y and was wrong.

The Referee subsequently removed both tower footprint outlines from the lower-level drawing. Their access corridors remain unchanged.

## Cannon ammunition handling rooms, 2026-10-10

The Referee selected 1.5 × 1.5 m ceiling shafts and 3 × 3 m handling rooms. Both rooms use the previously established tower footprints, with centred dashed square ceiling shafts labelled AMMO HOIST. Corridors terminate at the room entrances with 1.5 m un-doored openings; their previous end caps are removed. Hoist machinery, load capacity and door details remain unspecified. The dashed outlines describe overhead access, not opening state or sight blocking.

The Referee requested shelves and crates in the cargo area in front of the lifts. A first arrangement uses shallow shelf runs inside the top and left walls and three 1.2 m square crates with crossed bracing. Lift approaches, the west corridor and the lower tower route remain clear. Furniture uses thin drawing outlines and does not automatically block sight. Positions/sizes are an agent-arranged first pass, not universal component defaults.

## Replacing one port per level, 2026-10-10

The Referee rejected one port per drawing. The prototype now selects levels by URL on port 8765: `?level=below` and `?level=below&fog=1`. Model reads and exploration reads/writes all use the selected level; unknown IDs return 404. The ground-floor exploration file is preserved, and each other model has its own exploration file. HTTP tests verify routing and independent saves; a browser test verifies selected geometry, initial all-fog state, first POV placement, persistence and isolation from the original level. A fresh exploration with no observers revealed an existing inability to place the initial POV; placement now creates one. The manifest is still a prototype format and is read at startup.

## Lake water / fusion-fuel service room

The Referee doubled the west room’s horizontal size to 9 × 4.5 m, extending its left wall from stored x=-13.5 to x=-18 while preserving its entrance and corridor. A first furnishing pass adds five tank symbols, two pumps/motors, water-treatment and fuel-processing machinery, a control unit and connecting pipework. A labelled lake intake enters from the west. Equipment remains inside the room, with open space at the corridor entrance. This is schematic game-plan equipment, not a specified engineering process or a source-derived machinery standard; the Referee supplied its water/fusion-fuel purpose.

## Freehand feedback experiment, 2026-10-10

The Referee added another floor below the lower level, retaining its central area, aligned lifts, stairs/platform and cargo furnishings. The three outward corridors, ammunition rooms/shafts and west plant room were omitted. Their connections into the central area were closed with continuous walls. `level-below-2.PROTOTYPE.json` is grouped in the same plan at order -2 and served as `?level=below-2`; the earlier floors are preserved.

The Referee clarified that sketches are feedback on the agent's existing model. Capturing a sketch for later manual handoff or building a separate image-to-model demo misses the purpose: extend the current conversational design loop. Pen strokes must remain untouched until their words/context are known; interpretation may straighten a room, round a pond or populate rubble. Showing a best guess often helps the Referee express the desired correction better than preliminary questioning.

The existing drawing now has an edit palette, freehand model-coordinate capture, text submission and agent replies; play hides the palette, marks and axes while preserving the grid. HTTP tests verify raw feedback and acknowledgement; browser tests verify raw strokes, model preservation, draft retention across modes and replies. These establish the channel, not successful interpretation. The prototype still needs an actively listening agent; waking an idle conversation has not been solved. No separate agent/design engine is introduced.

The first live submission contained two crossed strokes over the rightmost upper tank in the west plant room and the word “remove”. The existing conversation received it, identified the tank from model coordinates, removed the tank/hatch/branch pipe from the same model, and returned an acknowledgement to the drawing. Visual inspection confirmed two upper tanks remained and the camera stayed in the plant room. This demonstrates one complete feedback cycle; Referee evaluation and a durable idle-agent connection remain outstanding.

The Referee rejected the browser text box and submit button. The intended workflow is to draw in the existing view and type the instruction in the existing conversation. Pen-up now saves marks automatically, and layout instructions must read those marks first. Chat supplies the triggering event; the earlier idle-agent wake investigation was solving the wrong interaction. Marks remain visible until their particular batch is acknowledged. Tests cover automatic raw-stroke availability without browser text/submission, and clearing the acknowledged batch. The existing crossed-out tank remains removed.

## Character / POV prototype, 2026-10-10

The Referee agreed to several named PCs/NPCs in play, one selected PC supplying POV and per-PC range, shared explored knowledge, visible PC markers and currently-visible-only NPC markers. An on-demand GM panel adds, renames, removes and transfers characters; direct dragging moves them. Character state is saved separately from authored geometry and fog observations, shared across this plan's levels. Initial placement is at the viewport centre, followed by dragging. Transfers preserve coordinates and open the destination level for placement.

Browser checks cover persistence/reload, PC selection and saved range, destination-only reveal, non-POV movement without reveal, NPC disappearance without remembered markers, reset preserving characters while pausing reveal, and manual level transfers without NPC-driven exploration. An initial transfer check exposed markers outside a small level's initial viewport; play's initial fit now includes characters on that level. Range changes made while saves were pending could be dropped; GM mutation controls now disable briefly while saving. The live GM panel was visually inspected without adding invented characters to the Referee's plan. Referee evaluation remains outstanding.

The five left-hand cells on the second lower level have bunks, cupboards, desks/chairs and plumbing. The Referee corrected toilet/sink orientation: their backs belong against the corridor wall and their fronts project into the cell. The right-hand storage rooms have varied shelves and crate arrangements, preserving entrances.

## Library metadata and authoring dates, 2026-10-10

The metadata slice uses stable plan/level IDs independently of their names. Browser forms distinguish plan and level tags, and agent PATCH requests update the same record. HTTP checks verify no-op metadata, rejected saves and saved exploration do not change authoring dates. Persisted semantic JSON fingerprints detect direct model-file edits without treating whitespace changes as new authoring. Initial migration fingerprints retain unknown historical dates. Browser checks verify rename persistence, retained drawing links and recent-edit ordering. An existing reload/keyboard test exposed a readiness race: tests must wait for rendered geometry before sending a shortcut after navigation.


## Meaningful saved play dates, 2026-10-10

Controlled-date HTTP checks distinguish character/POV changes, movement, range, doors, observation history, reset and resuming reveal from no-op and stale writes. Character transfers affect both source and destination levels. Authoring dates and unrelated plans/levels remain unchanged. Unused model snapshots and explicit default-field serialization are housekeeping, not play.

A browser check exposed an automatic exploration save when model polling loaded changed geometry. Polling now updates current visibility without recording or saving an observation; explicit play actions still record the current model revision. Browser checks cover entry, mode toggles, pan/zoom, temporary GM view, model refresh, reload and return to the library. Tests must await enabled mutation controls before a second POV click, because timestamp persistence extends an existing asynchronous save interval.


## Independent plan variations, 2026-10-10

The library's Duplicate plan action copies every authored model into separate files with fresh plan and level identities. Stable object IDs and references inside each authored model remain intact. Names, descriptions, tags and level order carry over; the new plan name adds “copy”. Creation and edit dates start together, while last played remains unknown. Characters, exploration and pending drawing marks start empty.

Browser checks cover selecting the variation, independent level metadata edits surviving reload, and explicit Edit/Play opening. HTTP checks cover source characters, door overrides, historical observations/revisions and pending marks remaining unchanged, separate authored-file edits in both directions, and persistence in a new server process. Disposable thumbnails and the empty fullscreen play drawing were visually inspected. Library publication follows model-file copying under its shared lock, so metadata mutations reload the authoritative records before adding the copy.


## Library search and date controls, 2026-10-10

A multi-plan disposable browser fixture verifies text matches and level identification, inherited AND tags without cross-level aggregation, combined date ranges and all four sorts. Ranges select plan dates and include the entire UTC day; unknown dates are an explicit opt-in for active ranges and sort last. Visual inspection exposed local date labels crossing a UTC filter boundary; library date labels now explicitly use UTC too. Search thumbnails use a matching level and preserve the existing Geometry renderer. Rapid changes invalidate earlier thumbnail renders so stale cards cannot repopulate filtered results.
