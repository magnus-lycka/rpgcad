# Live model prototype — throwaway

Question: can the Referee develop their own layout through an existing agent, with their intended geometry appearing promptly on a drawing-only browser view?

The Referee supplies the design. The agent translates the description into geometry and asks about missing design choices. An agent-invented layout is not a successful result.

## Run

```sh
python3 prototype/server.py
```

Open http://127.0.0.1:8765. Python's standard library serves the model; plain JavaScript and SVG render it. The server binds only to loopback.

The browser shows only the drawing. The square grid is always visible, including when the model is empty. Each square represents 1.5 m. The initial model is empty, awaiting the Referee's description.

## Interaction

- Drag to pan; scroll to zoom.
- Double-click or press F to fit the model.
- Press + or − to zoom about the centre.
- Press S to save the model as SVG at 1:75.
- Use the browser's print command for tiled A4 landscape output.
- For A3 portrait printing, open http://127.0.0.1:8765/?paper=a3.
- Add `region=view` to the URL to print complete tiles intersecting the current view instead of the whole model.

There are no on-screen controls, diagnostics, tooltips, or walkthroughs. Agent inspection uses the model file, rendered browser view, and console when needed.

## Shared model

`prototype/model.PROTOTYPE.json` is authoritative. The agent reads and edits it according to the Referee's description. The browser checks for changes every 250 ms, retaining the last valid model and camera position.

All positions, dimensions, and thicknesses are in metres. IDs are unique across objects.

- `wallThickness`: positive default thickness.
- `walls`: `{id, a: [x,y], b: [x,y], thickness?}`. Endpoints describe the centre line.
- `openings`: `{id, wall, offset, width}`. Offset is measured from the wall's `a` endpoint towards `b`. Openings must fit on their wall and follow its orientation.
- `labels`: `{id, at: [x,y], text, size?}`. Text size is in metres, default 0.4. Labels are independent objects.

This is experimental interchange data for the agent, not a user-facing language or an established format.

## Printing

Tiles are anchored at (0, 0), including negative coordinates. A4 landscape covers 21 × 15 m on a 280 × 200 mm map area. A3 portrait covers 21 × 30 m on a 280 × 400 mm map area. The grid is always printed at 20 mm spacing at 1:75.

Use actual size / 100%, zero margins, and no browser headers or footers. The two-square ruler must measure 30 mm. Exact output depends on print settings and still needs checking on paper.

## Observations and limits

Manual checks of the initial prototype on 2026-10-08 confirmed live targeted edits, exact viewBox preservation, rejection of invalid openings while retaining the drawing, and expected A4/A3 sheet dimensions. A temporary 900-wall, 500-opening, 500-label model took about 37 ms to parse and build its view, excluding paint and up to roughly 250 ms change detection. These checks used disposable agent-created geometry, not a Referee-approved design.

After the Referee clarified the requirements, the sample was cleared and all screen chrome removed. The renderer now maintains readable screen grid strokes at different zoom levels.

The technical update mechanism appears viable. Matching the Referee's intended designs is the actual evaluation criterion and has not yet been demonstrated.

- Wall junctions are overlapping polygons with simple square extensions.
- Openings cut only their own wall; crossing walls can obstruct them.
- Connected wall segments and labels do not automatically move together.
- The model has no fixed outer boundary; printing is limited to 200 sheets per request in this prototype.
- No direct geometry editing, room semantics, furniture, door leaves, or undo.
- No automated tests or production framework.
