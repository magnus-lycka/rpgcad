# Live model prototype — throwaway

Question: can an existing agent inspect and edit a shared model, then inspect its automatically updated browser rendering quickly enough for interactive layout development?

## Run

From the repository root:

```sh
python3 prototype/server.py
```

Open http://127.0.0.1:8765 in a browser. Python's standard library is the only server dependency; the browser uses plain JavaScript and SVG. The server binds only to loopback.

The authoritative state is `prototype/model.PROTOTYPE.json`. Tell the agent what to change; it reads and edits this file, then inspects the browser. The viewer checks for changes every 250 ms, retaining the last valid model and its camera position. If new geometry is outside the current view, choose **Show everything**.

## Model data

All positions, dimensions, and thicknesses are in metres. IDs are unique across objects.

- `wallThickness`: positive default thickness.
- `walls`: `{id, a: [x,y], b: [x,y], thickness?}`. Endpoints describe the centre line.
- `openings`: `{id, wall, offset, width}`. Offset starts at the wall's `a` endpoint and ends before its `b` endpoint. Openings follow their wall's orientation; overlapping openings merge visually.
- `labels`: `{id, at: [x,y], text, size?}`. `size` is text height in metres, default 0.4. Labels are independent objects, not attached to rooms.

This is experimental interchange data for the agent, not a user-facing language or an established file format. No room recognition or autonomous design is implemented.

## Printing and export

Choose A4 landscape (14 × 10 squares) or A3 portrait (14 × 20 squares), and the whole model or current view. **Preview / print** shows the sheets; **Print / save PDF** invokes the browser print dialog. A current-view selection prints complete tiles intersecting that view, rather than cropping each tile to the viewport.

Tiles are anchored at world coordinate (0, 0), with negative coordinates supported. At 1:75 the grid is 20 mm; a two-square ruler measures 30 mm. Use actual size / 100%, zero margins, and no browser headers or footers. Exact output depends on print-dialog settings and must be checked on paper.

**Save SVG** exports the whole model at 1:75 with physical dimensions. No dedicated PDF library is involved.

## Observations

Manual browser checks on 2026-10-08:

- Moving a partition and shifting a doorway updated the visible geometry without a reload. The SVG viewBox stayed identical while zoomed in.
- Small model: approximately 1–3 ms to parse and build the view.
- Larger model: 900 walls, 500 openings, and 500 labels across roughly 324 × 174 m took approximately 37 ms to parse and build the view. This excludes browser paint and agent reasoning/editing time; detection adds up to roughly 250 ms under normal foreground operation.
- An opening beyond the end of its wall was rejected, retaining the last valid drawing.
- A4 preview: 297 × 210 mm sheets containing 21 × 15 m map tiles (280 × 200 mm).
- A3 preview: 297 × 420 mm sheets containing 21 × 30 m map tiles (280 × 400 mm).

Verdict so far: the file-to-browser update mechanism appears viable. Whether it enables useful agent-assisted spatial design remains to be judged with the Referee. Printed/PDF physical scale has not yet been verified on paper.

## Deliberate limits

- Wall endpoints have simple square extensions; junctions are overlapping polygons, without architectural join cleanup.
- An opening cuts only its own wall. Crossing walls can obstruct it.
- Walls are independent segments: connected walls do not automatically move together.
- The model has no fixed boundary. Print preview is limited to 200 sheets per request to avoid building an enormous browser document; sheet overlays are suppressed beyond 600 visible tiles.
- No saving from the browser, furniture, room semantics, door leaves, undo, or direct geometry editing.
- No automated tests or production framework; this is an experiment.
