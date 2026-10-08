# Design discussion

These are agreed requirements from the ongoing interview, not an implementation plan.

## Working loop

- The Referee talks to an existing agent, initially outside RPGCAD.
- A separate browser view displays the layout and updates automatically.
- The agent must be able to inspect both the complete current model and its rendered view.
- For the first version, the agent makes all geometry edits. The Referee uses the browser to inspect, pan, zoom, and print.
- The Referee supplies the design. The agent translates the Referee's description into the model; it clarifies missing details rather than inventing layout choices. Success means matching the Referee's intended design.
- Keep the first version small. Sophisticated revision planning is deferred.

## Model and drawing

- The model has no fixed outer boundary; paper and viewport dimensions do not constrain it.
- Dimensions use real-world metres.
- The initial grid represents 1.5 m squares, printed as 2 cm squares at 1:75.
- Initial elements are walls, door openings, and text labels.
- Walls support arbitrary angles and positions between grid lines.
- Walls have a default physical thickness, overridable per wall, centred on their centre lines.
- Door openings belong to a wall, with their width and distance along the wall measured in metres. They cut through its thickness and follow its movement or rotation.
- Door openings began as gaps. During the prototype, the Referee chose closed rectangular door panels; see the prototype findings for symbol corrections.

## Viewing and printing

- The browser shows only the drawing, filling its entire content area. No toolbar, sidebar, walkthrough, or diagnostics appear on the drawing screen.
- The 1.5 m square grid is always present and visibly readable, including on an empty model. It is part of the drawing, not an optional overlay.
- The browser supports pan, zoom, and a show-everything action.
- Agent updates preserve the current pan and zoom.
- Printing tiles the model on grid-aligned sheets at 1:75.
- Landscape A4 tiles cover 14 × 10 squares; portrait A3 tiles cover 14 × 20 squares.
- Printed sheets have coordinates and alignment marks in their margins.
- Printing supports the whole model or a selected area, with consistent tile boundaries across repeated prints.

## First prototype architecture

- A model file is the authoritative state. The agent can read the complete model and edit particular objects in that file.
- The browser displays the model and updates automatically when it changes. It does not own the authoritative state.
- Browser-side geometry, rendering, and printing are desirable; a small local process for communication is acceptable.
- The agent also needs access to the rendered view to inspect the result of edits.
- Editing tools may be introduced later, informed by use of the file-based prototype.
- The prototype currently uses JSON, a Python standard-library server, browser-side JavaScript/SVG, and file polling. These have not been selected as the final architecture.

## Plan organisation

Agreed requirements, not yet implemented:

- A plan represents one location and contains its levels. Further floors of the current building belong to this same plan.
- Several plans can belong to the same campaign.
- Support arbitrary tags, text search, browsing, and creation/last-edit timestamps.
- A separate catalogue view keeps organisation controls out of the drawing view.

Proposed details still to validate:

- One directory per plan, a metadata file, and separate model files per level; generated exports remain distinct from authored models.
- Stable plan/level IDs, editable names, descriptions, level ordering, and a common coordinate system across levels.
- A plan's last-edit timestamp reflects changes to any level; catalogue indexes and thumbnails can be rebuilt from stored plans.
- Explicit connections between levels, such as stairs, lifts, and ceiling hatches.
- Exact metadata schema, campaign membership cardinality, and persistence implementation remain open.

## Exploration visibility (fog of war)

Requested behaviour:

- Supply observer position and sight range, then reveal the unobstructed area within that range.
- Revealed areas remain explored after observers move away.
- Drawing an object does not automatically make it block sight. Furniture often should remain visible without obscuring the view beyond it.
- The Referee and agent need access to observer positions and sight ranges.

Referee feedback on the first unfog prototype:

- The GM must be able to set sight range, place a point of view, and reset the entire plan to fog easily.
- Previously explored areas must remain clearly readable when no longer visible; the first prototype's treatment is too similar to unseen areas.
- Geometry behind a sight blocker must not leak into the reveal. The supplied screenshot shows unwanted cargo-lift detail beyond its upper-right blocking corner; retain this as a concrete failing case while investigating the cause.
- Agreed next-version scope: one movable party point of view, one sight range, and shared exploration history.
- Keep the player-facing drawing free of controls. An on-demand GM panel provides range entry in metres and a full-fog reset; clicking the drawing places the point of view. Agent instructions remain available.
- Currently visible areas are white. Previously explored areas retain fully readable geometry under a very light tint. Unseen areas remain opaque fog with the grid visible.
- Each placement reveals from its destination only; do not infer or reveal an intervening movement path.
- Sight is circular and 360° within the specified range, blocked by opaque walls and closed doors. Furniture and other drawing details do not block sight unless explicitly designated. Lighting and eye height are deferred.
- Explored areas retain last-seen content. Unseen changes, such as a door closing after the party leaves, must not update the players' remembered view until observed again.
- Exploration survives closing and reopening the browser, with separate history for each level. Reset clears only the displayed level and pauses revealing until the next POV placement or movement. Multiple parties and separate play sessions are deferred.
- G shows or hides the GM panel, which provides numeric range entry and reset. R is the reset shortcut. Shift-click toggles a door open or closed.
- Reset erases explored knowledge and closes all doors on the displayed level. It preserves POV position and range, and reveals nothing until the next POV placement or movement. Closing doors takes precedence over the earlier proposal to preserve their states: accidental disclosure is difficult to undo.
- Persist compact observation records: visited POV positions, sight ranges, and the door/opening states needed to reconstruct what was visible at each observation. Do not persist fog polygons as authoritative exploration history.
- Visibility polygons are derived data. Recompute them from observations; a bounded disposable cache (for example LRU) may be added if measured latency warrants it.
- Polling, reloads, and redraws must not create duplicate observations. Observation order matters for the agreed last-seen appearance when revisiting an area after a door changes state.
- Reconstruction must account for historical model changes as well as door states to preserve last-seen content. Proposed implementation: observations reference shared model revisions rather than copying the whole model per observation; revision storage remains to be designed.

The unfog prototype separates authored geometry, current visibility, and accumulated exploration. `?fog=1` selects the fog view. Version-2 exploration stores observation inputs and shared model revisions; visibility polygons are derived in a bounded in-memory cache. Ordered observation layers retain last-seen content. Shift-G opens the optional GM panel. Reset closes doors and clears observations and revisions, keeping POV/range and pausing reveal. Polling/reload do not append observations; stale saves are rejected.

The prototype still supports only the current level. Separate histories per level are agreed behaviour for future multi-level support, not implemented catalogue functionality.

Questions still open:

- Multiple observers and individual exploration are outside the agreed next-version scope.
- Glass, lighting, eye height, multiple parties, and separate play sessions are deferred.

Observation-based storage and last-seen rendering are now implemented in the throwaway prototype. Long-history replay latency and revision storage across extensive authoring changes remain to be evaluated.
