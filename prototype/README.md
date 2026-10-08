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

- Drag to pan; scroll to zoom.
- Double-click or press F to fit the model.
- Press + or − to zoom about the centre.
- Press S to save the model as SVG at 1:75.
- Use the browser's print command for tiled A4 landscape output.
- For A3 portrait printing, open http://127.0.0.1:8765/?paper=a3.
- Add `region=view` to the URL to print complete tiles intersecting the current view instead of the whole model.
- Add `region=plan` to start print tiles at the grid corner just above/left of the model bounds. The current building then fits on one A4 landscape sheet at 1:75; the reference origin and model stay unchanged.

The drawing view has no permanent controls, diagnostics, tooltips, or walkthroughs. The fog view has an optional GM panel. Agent inspection uses the model file, rendered browser view, and console when needed.

## Shared model

`prototype/model.PROTOTYPE.json` is authoritative. The agent reads and edits it according to the Referee's description. The browser checks for changes every 250 ms, retaining the last valid model and camera position.

All positions, dimensions, and thicknesses are in metres. IDs are unique across objects.

- `origin`: optional `[x,y]` reference position on a grid intersection. Its X and Y axes are red, and print tiles align to it. Moving this reference does not move the grid or geometry. Coordinates described relative to the origin are converted to stored model positions by the agent.
- `gridOrigin`: optional `[x,y]` grid alignment, default `[0,0]`. This is independent of the movable reference origin.
- `wallThickness`: positive default thickness.
- `walls`: `{id, a: [x,y], b: [x,y], thickness?}`. Endpoints describe the centre line.
- `openings`: `{id, wall, offset, width}`. Offset is measured from the wall's `a` endpoint towards `b`. Openings must fit on their wall and follow its orientation.
- `labels`: `{id, at: [x,y], text, size?}`. Text size is in metres, default 0.4. Labels are independent objects.

This is experimental interchange data for the agent, not a user-facing language or an established format.

## Unfog experiment

Open http://127.0.0.1:8765/?fog=1. The normal URL still shows the full authored plan. Both views normally contain only drawing and grid; Shift-G opens the optional GM controls in fog mode.

- The blue dot marks an observer. Click an unobstructed point to place the first observer there; drag still pans. This is placement, not simulated movement along a collision-checked path.
- Arrow keys move that observer 1.5 m at a time. `[` and `]` decrease/increase sight range by 1.5 m (minimum 1.5 m).
- Shift-click near a door's centre to toggle its open/closed state. You can also ask the agent to change a named door in the exploration file.
- Shift-G (or G) shows/hides GM controls, including direct numeric range entry and a reset button. Escape closes the panel.
- Shift-R (or R) covers the entire plan with fog and closes all doors, keeping POV position and range. Click to place the observer or use an arrow key to start revealing again. Reset persists across reloads and exits GM view.
- Shift-F toggles fog off/on for a temporary full-plan GM view with the blue POV marker (V remains an alias); the panel also has a full-plan button. Plain F still fits the plan to the window. This does not reveal exploration. Placement and door toggling still work, recording only normally visible areas. Returning to fog restores the player view; print/export from the fog URL stays fogged even during GM view.
- Bright areas are currently visible, muted areas have been explored, and the grey grid is still unknown. Walls and closed doors block sight. Furniture/equipment outlines, hatches, and step irons do not block merely because they are drawn.

`prototype/exploration.PROTOTYPE.json` holds version-2 scratch play state independently of the building. `observers` holds POV positions in model metres and positive sight ranges; `doors` holds current overrides. Ordered `observations` store only position, range, door states and a model-revision reference. Shared `revisions` store each observed model revision once, preserving last-seen geometry across edits. No fog polygons are saved. Reset clears observations and unused revisions.

Reloads, polling and redraws do not create observations. Consecutive identical observations are ignored; revisits after intervening changes remain ordered so remembered appearances update correctly. Visibility is reconstructed using unsimplified ray-cast boundaries, with a bounded 128-entry in-memory cache. The server rejects old polygon-format saves and stale writes.
The `doors` map overrides an opening ID with `open` or `closed`. Walls block sight unless `blocksSight: false`; door openings with leaf symbols block while closed unless explicitly nonblocking. Rectangle outlines, circles, and lines can opt into blocking with `blocksSight: true`. This is a simple 2D rule, without lighting, eye heights, or glass defaults.

The prototype operates on one party POV and the current level. Previously explored areas show last-seen content with a light tint; current visibility is white. Print/export uses the same fog rendering. Observation history survives reloads. Separate level histories remain to be wired into future multi-level storage. The scratch file accepts at most 5 MB per save; history replay still needs evaluation for long sessions.

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
- No direct geometry editing, room semantics, furniture, or undo. Closed door panels, ceiling hatch circles, rounded step irons, lift outlines, and a spiral-stair symbol were added during the interactive evaluation.
- Regression tests cover HTTP saves and exploration behaviour; this remains a prototype without a production framework. See `docs/agents/development.md` for the required TDD workflow.
