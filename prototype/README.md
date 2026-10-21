# Live model prototype — throwaway

Question: can the Referee develop their own layout through an existing agent, with their intended geometry appearing promptly on a drawing-only browser view?

The Referee supplies the design. The agent translates the description into geometry and asks about missing design choices. An agent-invented layout is not a successful result.

## Run

```sh
uv run python prototype/server.py
```

Open http://127.0.0.1:8765. Python's standard library serves the model; plain JavaScript and SVG render it. The server binds only to loopback.

The browser shows only the drawing. The square grid is always visible, including when the model is empty. Each square represents 1.5 m. The current model contains the Referee's interactively developed building; preserve it when changing the prototype.

## Interaction

### Visual feedback experiment

Open `/?level=below&mode=edit`. Draw freely with Pen, then type your instruction in the existing agent conversation. There is no browser text entry or submit button. Pen-up automatically saves the untouched strokes in model coordinates; undo and clear update them automatically too. Pan moves the view and is the default tool. Select Pen to add marks; its cursor is a pen. In Edit, P selects Pen, H selects Pan, C toggles Components. Clear marks and Calibrate are toolbar icons. Ctrl/Command-Z undoes the latest mark. Shift-Backspace clears marks (on Mac, Shift plus backward Delete ⌫, not forward Delete); holding it does not clear repeatedly. These commands are also available in the command palette and shortcut help. Text fields keep native editing, and save errors remain visible without discarding the marks.

For each chat layout instruction the agent reads `GET /sketch?level=below` (omit the query for ground level), uses pending nonempty marks as spatial context, edits the same authoritative model and acknowledges with `PATCH /sketch?level=below`: the record's `submittedAt`, `status: "applied"` and a short `reply`. Only the acknowledged marks disappear. The normal model polling displays the result without resetting the camera. The scratch `*.sketch.PROTOTYPE.json` next to the model retains the latest strokes, model snapshot/revision and viewport. Already-applied or empty marks are not new instructions.

The chat message triggers the agent, using its existing history and model. Drawing alone never triggers interpretation, and no idle-agent wake mechanism or separate interpreter is needed for this workflow. The agent procedure is documented in `CONTEXT.md`.

Play hides the palette, reference axes and pen strokes; Shift-E returns to editing. Draft strokes survive switching modes within the page. Play currently uses the existing fog presentation; richer game themes and frozen layout revisions are deferred.

- Drag to pan; scroll to zoom.
- Double-click or press F to fit the model.
- Press + or −, or use the zoom buttons, to zoom about the centre. Press Z (or open the zoom menu / Referee View controls) to enter a percentage and press Enter. After calibration at 1:75, 100% means the calibrated 1:75 size; 10% is one tenth that size. The readout includes the reference scale. Before calibration, it explicitly labels the nominal CSS-pixel estimate as uncalibrated.
- Choose Calibrate in the toolbar (both modes); the scale field beside it reads Uncalibrated until you apply a scale, then 1:75 or similar. Measure between the ruler end ticks, enter the measured millimetres and scale denominator, then Apply scale. Five squares represent 7.5 m, requiring 100 mm at 1:75: an 80 mm measurement increases current magnification by 25%. The ruler uses current grid spacing and shows fewer squares if needed to fit the screen. Applying calibration establishes 100% at the entered scale. Fit and zoom change magnification while retaining that reference, so entering 100 returns to the calibrated size. The calibration is remembered in the browser's local storage for this display (screen size and pixel ratio), so reloading keeps it. Each plan level also remembers its own zoom and position. Corrupt stored values raise the red alert instead of being ignored. Print dimensions remain independent.
- Press S to save the model as SVG at 1:75.
- Use the browser's print command for tiled A4 landscape output.
- For A3 portrait printing, open http://127.0.0.1:8765/?paper=a3.
- Add `region=view` to the URL to print complete tiles intersecting the current view instead of the whole model.
- Add `region=plan` to start print tiles at the grid corner just above/left of the model bounds. The current building then fits on one A4 landscape sheet at 1:75; the reference origin and model stay unchanged.

The drawing view has no permanent controls, diagnostics, tooltips, or walkthroughs. The toolbar is the only permanent control; the fog view adds its play section. Agent inspection uses the model file, rendered browser view, and console when needed.

## Shared model

`prototype/model.PROTOTYPE.json` is authoritative. The agent reads and edits it according to the Referee's description. The browser checks for changes every 250 ms, retaining the last valid model and camera position.

All positions, dimensions, and thicknesses are in metres. IDs are unique across objects.

- `origin`: optional `[x,y]` reference position on a grid intersection. It is stored once on the plan record in `library.PROTOTYPE.json`, not in level files: the server adds it to every level it serves, ignores an `origin` in a saved level, and on first read moves the first level's old per-level value onto the plan and removes the others. Its X and Y axes are solid red; dashed red lines repeat the cross every 21 m by 15 m (one A4 landscape page) in both directions, so page borders are visible, and print tiles align to it. Moving this reference does not move the grid or geometry. In Edit, tick marks with metre numbers appear every 3 m along both axes (X grows right and Y grows up, so a stored position has y = origin y minus the Y number), and the Move origin icon (or O) arms a crosshair: the next click moves the red cross to the nearest grid crossing and saves `origin` once on the plan, so coordinates agree on all levels. Coordinates described relative to the origin are converted to stored model positions by the agent.
- `gridOrigin`: optional `[x,y]` grid alignment, default `[0,0]`. This is independent of the movable reference origin.
- `wallThickness`: positive default thickness.
- `walls`: `{id, a: [x,y], b: [x,y], thickness?}`. Endpoints describe the centre line.
- `openings`: `{id, wall, offset, width}`. Offset is measured from the wall's `a` endpoint towards `b`. Openings must fit on their wall and follow its orientation.
- `labels`: `{id, at: [x,y], text, size?}`. Text size is in metres, default 0.4. Labels are independent objects.

This is experimental interchange data for the agent, not a user-facing language or an established format.

## Unfog experiment

Open http://127.0.0.1:8765/?fog=1. The normal URL still shows the full authored plan. Both views contain the drawing, grid and the thin toolbar.

- The blue dot marks an observer. Click an unobstructed point to place the first observer there; drag still pans. This is placement, not simulated movement along a collision-checked path.
- Arrow keys move that observer 1.5 m at a time. `[` and `]` decrease/increase sight range by 1.5 m (minimum 1.5 m).
- Shift-click near a door's centre to toggle its open/closed state. You can also ask the agent to change a named door in the exploration file.
- The toolbar's range field and Reset fog icon provide numeric range entry and reset.
- Shift-R (or R) covers the entire plan with fog and closes all doors, keeping POV position and range. Click to place the observer or use an arrow key to start revealing again. Reset persists across reloads and turns fog back on.
- Shift-F, or the toolbar's Toggle fog button, switches fog off and on; with fog off the whole plan shows with the blue POV marker, and the button is blue while fog is on (bare V and Shift-V do nothing). Plain F still fits the plan to the window. This does not reveal exploration. Placement and door toggling still work, recording only normally visible areas. Returning to fog restores the player view; print/export from the fog URL stays fogged even while fog is off on screen.
- Bright areas are currently visible, muted areas have been explored, and the grey grid is still unknown. Walls and closed doors block sight. Furniture/equipment outlines, hatches, and step irons do not block merely because they are drawn.

`prototype/exploration.PROTOTYPE.json` holds version-2 scratch play state independently of the building. `observers` holds POV positions in model metres and positive sight ranges; `doors` holds current overrides. Ordered `observations` store only position, range, door states and a model-revision reference. Shared `revisions` store each observed model revision once, preserving last-seen geometry across edits. No fog polygons are saved. Reset clears observations and unused revisions.

Reloads, polling and redraws do not create observations. Consecutive identical observations are ignored; revisits after intervening changes remain ordered so remembered appearances update correctly. Visibility is reconstructed using unsimplified ray-cast boundaries, with an in-memory cache that grows to hold one region per saved observation (at least 128): every redraw replays them all, and a smaller cache is emptied by each replay, which made a long walk cost over a second per redraw. The server rejects old polygon-format saves and stale writes.
The `doors` map overrides an opening ID with `open` or `closed`. Walls block sight unless `blocksSight: false`; door openings with leaf symbols block while closed unless explicitly nonblocking. Rectangle outlines, circles, and lines can opt into blocking with `blocksSight: true`. A model may have `terrain: {default, areas}` (kinds `floor`, `solid`, `drop`). Floor is derived: a space enclosed by walls is floor and `default` is what lies outside every enclosed space, so `"terrain": {"default": "solid"}` alone makes a structure inside rock. Optional `areas` override for exceptions (last containing area wins): `{id, kind, points}` for a polygon, or `{id, kind, space: [x, y]}` to name the enclosed space containing that point, which follows the walls; a `space` that names no enclosed space is rejected on load. A `drop` is air with no floor, drawn as sparse dots. `unknown` is undecided ground: it acts as solid in Play and the players' fog view draws it as rock, while Edit and Play with fog off show a question mark in every grid square. An area with `"outside": true` refines only what lies outside the enclosed spaces. Solid ground is hatched and an observer standing on it sees nothing. This is a simple 2D rule, without lighting, eye heights, or glass defaults.

The prototype operates on one party POV and the current level. Previously explored areas show last-seen content with a light tint; current visibility is white. Print/export uses the same fog rendering. Observation history survives reloads. Each selected level has a separate exploration history; see the level URLs below. The scratch file accepts at most 5 MB per save; history replay still needs evaluation for long sessions.

## Printing

Tiles are anchored at the reference origin, including negative tile coordinates. A4 landscape covers 21 × 15 m on a 280 × 200 mm map area. A3 portrait covers 21 × 30 m on a 280 × 400 mm map area. The grid is always printed at 20 mm spacing at 1:75.

Use manual 100% / actual size, zero browser margins, and no browser headers or footers. Each grid square measures 20 mm. A4 sheets contain only the 14 × 10 grid and the plan clipped to it, centred with 8.5 mm left/right and 5 mm top/bottom margins. No added headings, rulers, or registration crosses. The Referee measured the A4 print within 1% of the intended scale and accepted it; A3 paper verification remains unperformed.

## Observations and limits

Manual checks of the initial prototype on 2026-10-08 confirmed live targeted edits, exact viewBox preservation, rejection of invalid openings while retaining the drawing, and expected A4/A3 sheet dimensions. A temporary 900-wall, 500-opening, 500-label model took about 37 ms to parse and build its view, excluding paint and up to roughly 250 ms change detection. These checks used disposable agent-created geometry, not a Referee-approved design.

After the Referee clarified the requirements, the sample was cleared and all screen chrome removed. The renderer now maintains readable screen grid strokes at different zoom levels.

The technical update mechanism appears viable, and the Referee positively evaluated the iterative development of this floor. Detailed observations, mistakes, and corrections are recorded in `docs/prototype-findings.md`. This is evidence for the current working loop, not proof of general autonomous design ability.

- Wall junctions are overlapping polygons with simple square extensions.
- Openings cut only their own wall; crossing walls can obstruct them.
- Connected wall segments and labels do not automatically move together.
- The model has no fixed outer boundary; printing is limited to 200 sheets per request in this prototype.
- No direct geometry editing, room semantics, or undo. Six reusable component families are implemented: bed, chair, wall door, hinged hatch, iris valve and crew console. Generic service machinery was withdrawn from the usable catalogue. Their dimensions are proposed defaults; Referee viability approval under ticket #13 remains pending before catalogue expansion. Closed door panels, ceiling hatch circles, rounded step irons, lift outlines, and a spiral-stair symbol were also added during the interactive evaluation.
- Regression tests cover HTTP saves, pure exploration behaviour, browser controls, and fog rendering; this remains a prototype without a production framework. See `docs/agents/development.md` for the required TDD workflow.

## Levels in one server

`plan.PROTOTYPE.json` groups the original floor and lower floor as levels of the same building. Run the server once:

```sh
uv run python prototype/server.py
```

- Ground floor: http://127.0.0.1:8765/
- Lower floor: http://127.0.0.1:8765/?level=below
- Ground-floor fog: http://127.0.0.1:8765/?fog=1
- Lower-floor fog: http://127.0.0.1:8765/?level=below&fog=1

The level parameter selects both the model and its independent exploration state. Unknown IDs return 404 instead of displaying another level. The default/original level retains `exploration.PROTOTYPE.json`; the lower level saves `level-below.PROTOTYPE.exploration.json`. Fresh levels start fully fogged with no POV; click to place one, or switch fog off with Shift-F to orient first. The plan manifest is read at server startup; restart after adding a new level entry.

The lower model is `level-below.PROTOTYPE.json`. It preserves alignment with the original floor and has its own rooms and corridors. The original drawing is unchanged. These URLs replace the temporary port-8767 setup. The plan library below provides level selection; a drawing-only level-switching control remains future work.

## Character markers in play (prototype)

Enter play with the Play button or Shift-E. Choose Add PC or Add NPC in the toolbar (or press A or N): a popup opens at once and nothing is saved until the character has a name and, for a PC, a visual range. An NPC has no visual range. Press Enter or Add character; the marker starts at the current view centre, so drag it to its position. Escape cancels. The Levels icon (or L) lists the plan's levels, top first, and switches to the chosen one; PageUp and PageDown step to the level above or below. The Characters icon (or M) lists every character in the plan with its level; choosing one goes to that level and centres the character. Shift-F temporarily shows all characters and the full plan without revealing additional fog.

Click a PC marker to use its POV and saved sight range; the switch waits a moment so a double-click does not trigger it. A gold ring identifies the POV PC. Dragging it, or pressing the arrow keys, reveals from its destination only; clicking empty plan does nothing but clear the selection. Other PC movement and NPC movement do not reveal areas. All PCs on the displayed level remain visible; NPCs appear only within current visibility, with no remembered markers.

Double-click a marker (or focus it and press Enter) to open its popup at the marker: Name and Visual range (m) save when you press Enter or leave the field, Move to level opens the chosen level with the coordinates preserved so the character can be dragged into place in full-plan view, and Remove character deletes it directly. Escape, a second double-click or a click elsewhere closes the popup. A rejected save is announced in a red alert and the field returns to the saved value. A plain click or Space selects one marker; ⌘/Ctrl-click or ⌘/Ctrl+Space adds or removes a marker; Escape or a click on empty plan clears the selection. A dashed blue ring marks selection independently of the gold POV ring. Dragging any selected marker moves the whole selection by the same offset. The arrow keys likewise move every selected character on the shown level 1.5 m, and `[` and `]` change the range of every selected PC by 1.5 m (NPCs have none); with a single selection they act on the POV as before. Opening the popup with several selected shows a group popup titled with the count, with Visual range (applied to the PCs only) and Move to level (applied to all), but no name or remove. Shift+PageUp and Shift+PageDown take the selected characters (or the POV character when none is selected) one level up or down with the same coordinates and open that level with them still selected. However they arrive (shortcut, popup or group popup), the POV's surroundings are revealed at once, without a nudge, even on a level that was fogged or paused. Automatic stair/lift travel and combat integration are deferred. Shift-R clears exploration and closes doors while preserving character positions, ranges and selection; reveal pauses until POV selection or movement.

`characters.PROTOTYPE.json` is scratch play state shared by the existing building’s levels; other plans have their own rosters. It is separate from authored geometry and level-specific exploration. HTTP optimistic concurrency rejects stale saves. No sample characters are inserted into the Referee's plan.

## Plan library

Open `/library.html` to browse plan thumbnails, then choose a level's Edit or Play action. The toolbar's Library icon links back to the library. Pending raw drawing marks are restored when reopening their level.

The optional `library.PROTOTYPE.json` record contains `plans`, each with stable `id`, `name`, and `levels` (`id`, `name`, `model` path relative to the server directory). An optional plan `characters` path locates its shared roster; otherwise `<plan id>.characters.json` is used. Without this record the existing plan manifest supplies the library, preserving original geometry and play-state paths. `GET /library` and `GET /plan?plan=<id>` expose these records. Drawing/state routes take `plan` and `level` selection; character rosters are scoped to a plan and validate level references within it. Legacy URLs without plan selection continue to open the existing building.

Browser tests use disposable data on port 8766 by default; `RPGCAD_TEST_PORT` selects another port for parallel worktrees.

Plan and level metadata can be edited with their separate library buttons. Tags are entered one per line; plan tags and level tags remain distinct. Metadata lives in the same authoritative library record for browser and agent changes. Agents use `PATCH /metadata?plan=<id>` (plan) or `PATCH /metadata?plan=<id>&level=<id>` (level), with any of `name`, `description`, and `tags` (array of nonempty strings). Names never change IDs or links.

Records carry nullable `createdAt`, `editedAt`, and `lastPlayedAt` timestamps. Existing historical dates remain unknown. Successful changed metadata and semantic model-file edits update `editedAt`, propagating level edits to the plan; formatting-only model edits, reads, thumbnails, play writes, no-op or rejected metadata do not change authoring dates. Persisted `modelRevisions` fingerprints establish an initial baseline without inventing history and detect direct file changes across restart. Library cards default to most recently edited, with unknown dates last. New blank-plan/level creation is outside this prototype slice. Duplicate plan copies all authored levels and metadata into fresh identities and model files, with fresh creation/edit dates and no play state or pending marks. Agents use `POST /duplicate?plan=<id>`; the 201 response is the new plan record. The copy opens in level browsing and can be renamed independently.

Library search includes names, descriptions and tags at plan and level scope. Required tags are entered one per line and all must match a single level's own plus inherited plan tags. Matching levels link directly to Edit. Text and tags combine with independent plan creation, edit and play date ranges; date bounds include whole UTC days. Unknown dates remain visible without a range and can be included explicitly when a range is active. Reversed ranges show no matches. Sort by name (A–Z) or creation/edit/play dates (newest first), with unknown dates last and name breaking date ties.

Successful meaningful character or exploration saves update `lastPlayedAt` on the affected levels and owning plan, independently of authoring dates. Transfers update both the source and destination level; POV changes update levels of the old and new POV. Unchanged saves, unused historical snapshot housekeeping and rejected writes do not count. Entering play, reading/polling, camera changes, switching fog off and on, and reopening do not count either. Model polling refreshes current visibility without recording observations; the next explicit play action records its view.

## Reusable furniture (ticket #9)

`component-catalogue.json` contains original AGPL v3 bed/chair definitions. Their
metre dimensions are proposed defaults; Pearce reference dimensions remain unknown.
The drawings are original line artwork, not imported or traced source assets.

Read `GET /model?plan=<id>&level=<id>` before an agent edit. Add the desired exact
catalogue entries to `componentDefinitions` (keys such as `bed@1`), and place
`components` in the level model:

```json
{
  "id": "bunk-room-bed",
  "definition": "bed@1",
  "at": [1.13, 2.27],
  "rotation": 90,
  "settings": { "width": 1.2, "length": 2.2 }
}
```

Positions and settings use metres, rotation uses clockwise degrees in stored
screen-down coordinates, and placement does not snap to the grid. Local `[0,0]`
is the head/back-left corner; the bed foot and chair front point along local +y.
`width` and `length` change the footprint while retaining a physical pillow/back
depth. Instances have unique IDs across the level's primitives and components.

Save the resulting whole model with `PUT /model` using the same selectors. It
returns 204, or 400 before saving invalid component definitions/references/settings.
The server stores definitions once in the plan's library record and instances in
the selected level's authoritative JSON file; `GET /model` hydrates that record for
rendering and agent editing. `GET /plan` exposes the owning definitions and model
paths. Catalogue edits never automatically replace saved definitions. Direct file
edits remain possible: edit instances in the selected level file and definitions
in that plan's `componentDefinitions` record, not in every level file.

Definition edits validate every saved level and date only levels referencing a
changed definition; adding an unused definition dates the plan only. Instance edits
date their level and plan. No-op saves preserve dates; play dates remain separate.
Plan duplication copies definitions and instances into independent authored data.
Sketch snapshots and exploration model revisions include the saved definitions,
so they do not resolve remembered appearances through a later catalogue.

Portable Geometry resolves the same instances for drawing, bounds, library
thumbnails and 1:75 output alongside existing primitives. Furniture defaults to
nonblocking. Equipment sight/access overrides are described below; custom geometry
and assemblies remain later tickets. No live plan has been converted.

### Usable component catalogue

Open **Component catalogue** from the plan library, or `/components.html` directly.
Search names, aliases and tags to inspect original rendered previews, definition keys,
variants, proposed metre dimensions, default/supported settings, placement/access
advice and artwork/reference provenance. Each preview uses the saved-plan Geometry
renderer on the permanent 1.5 m grid and fits its card independently. Select a name
for a stable `/components.html?definition=bed%401` entry link. Continue placement
through chat and saved drawing marks; browsing does not place or alter instances.

Agents can read `GET /components?q=loose%20chair&limit=12&offset=0` without loading
the full catalogue. The JSON result contains `total`, `offset`, `limit` and bounded
`entries` of `{key, match, definition}`. Limits are 1–50 (default 12); offset is
nonnegative. `GET /components?definition=bed%401` selects one exact definition,
including all metadata and geometry needed to copy it into the plan-owned definitions.
Unknown exact keys return 404, invalid pagination returns 400, no search matches
return an empty page. Matches distinguish `exact-name`, `exact-alias`, `candidate`
and `related-type`; aliases refer to one definition, while `related` contains keys
of distinct alternatives and never establishes equivalence. Only explicitly listed
relationships extend search results, by one step.

New definitions use the same path. Optional `preview` metadata is a normal Geometry
model containing the definition's preview instance and any required attachment wall
or opening; the browser supplies its `componentDefinitions`. Otherwise it renders
one default instance at `[0,0]` with zero rotation. Catalogue definitions and artwork
are original AGPL v3; CC BY-NC reference attribution does not license imported artwork.

### Reusable access components

The original `door@1` and `ceiling-hatch@1` catalogue definitions are proposed
metre defaults, licensed AGPL v3. Save definitions at plan scope as with furniture.
A wall door instance uses `{id, definition: "door@1", opening: "opening-id"}`.
The existing opening owns wall, offset and accessible width; its identity also
owns saved play state. A leaf uses the opening's explicit thickness or the saved
definition's leaf thickness, capped at 40% of wall thickness. It has two thin
closed panels and retains dashed outlines while open. Shift-click and reset use
the existing play controls. Oversized or dangling attachments cannot be saved.
Only wall doors accept an `opening` attachment; other families reject that field.
For a closed door, sight blocking resolves from the instance `blocksSight` override,
then the existing opening setting, then the saved definition. Opening the door
always removes its sight blocker while retaining its drawn trace.

A ceiling hatch instance uses the normal `at` and clockwise `rotation`, with
optional `settings: {width, length, direction, state}`. Direction is `up`, `down`
or `up-down` (default `up`); state is independently `open` or `closed` (default
`closed`). Its dashed circle and direction label describe vertical access. Hatch
state is authored data, with no new play toggle, planar sight blocker, automatic
level travel or movement enforcement. Historical observations retain the exact
saved definitions and wall-door state seen at that time.

### Configurable equipment (ticket #11)

`console@1` is an original crew console with one to six stations, each with its
own 0.5 m seat and control display. `settings: {seatCount: 3}` regenerates three
stations at the proposed 0.9 m pitch, rather than stretching the single-seat art.
Its proposed one-seat footprint is 0.9 × 1.35 m. The back is local y=0; the
operator sits towards +y, facing the console. Console instances deliberately
support seat count alone, rather than arbitrary footprint stretching.

`machinery@1` is original generic service machinery, not a specified reactor,
drive or pump capacity. The proposed footprint is 1.5 × 2 m; positive metre
`width` and `length` settings regenerate its casing, central motor detail and
front service panel. Local `[0,0]` is the back-left; service access faces +y.
Both definitions retain the normal non-grid position and clockwise rotation.

Console sight defaults to false; machinery defaults to true. Instance
`blocksSight: false|true` overrides a saved definition, independently of
appearance or sibling instances. Fog uses the transformed physical footprint,
not stroke padding. Furniture also supports an explicit instance sight override.
Equipment definitions carry `access: {blocksPassage: true, frontClearance: 0.75}`;
instance `access` may override either property. Clearance is metres beyond the
local +y front and remains guidance without movement/collision enforcement.
`Geometry.componentSemantics(model, instance)` exposes the resolved sight/access
properties to callers. Invalid access values or noninteger/out-of-range seat
counts reject the whole save, preserving prior authored data and dates.

Save/reload, independent duplication, thumbnails and monochrome 1:75 printing
use the same authored geometry. Remembered observations retain the seat count,
orientation, sight overrides and exact saved definitions previously seen.
Dimensions and access defaults are proposals; Pearce F05/M01 are equipment-family
references with unverified source dimensions, not imported or traced artwork.

## Component demonstration

The separate saved [Component demonstration](../docs/component-demonstration.md)
exercises the six initial reusable seed families through catalogue discovery,
local variations, saved drawing updates, reload, and door/fog play. It includes
an explicit non-overwriting registration command and Referee feedback steps.
Its dimensions are proposals and ticket #13 remains a human evaluation gate.

In Edit, **Components** opens searchable catalogue previews beside the drawing.
Expand **Component details** for dimensions, settings and placement/access guidance.
Close or Escape returns to the same drawing, tool, view and pending marks.
Browsing does not place components or send an instruction; describe placement in chat.

Every PC has its own **Visual range (m)**, required when it is created and shown in its popup; it cannot be cleared. An NPC has no visual range. There is no default range, so changing one PC's range never affects another. Ranges survive reload; a saved PC without a range is rejected and flagged in a red alert.

## Local runtime data and Git

Prototype runtime JSON is ignored: local library metadata and backups, character
rosters, fog history, drawing marks, duplicated plan models, and `*-data/` plan
folders. Keep these files when updating or switching code; they contain your work.
Ignored does not mean backed up: include them in your own backups.

The catalogue, demo source under `demos/`, building example models and initial
plan manifest remain tracked as shipped examples. New local plans are not source
code and should remain ignored. The server still uses its existing file paths;
this Git policy does not relocate or reset a running session's data.

### Referee command discovery

In Play, `/` or Ctrl/Command-K opens the command palette; `?` lists every
binding. A/N adds a PC/NPC; double-click a marker (or focus it and press Enter)
to edit it. Leave a text/choice field before using map keys;
ordinary field editing and native tab navigation retain precedence.

Shift-O toggles a door opening within 0.6 m of the Observer. Move the Observer
beside the opening first; the palette explains unavailable targets. Shift-click
continues to use the pointer position with the same door action. Arrows move the
Observer, brackets adjust its range, and Shift-R clears exploration/closes doors.
Saving actions use the existing save status/error feedback for clicks and keys.
