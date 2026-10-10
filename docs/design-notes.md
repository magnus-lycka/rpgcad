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

- Print only the grid and authored plan content clipped to the tile. Do not add headings, registration crosses, rulers, or other unsolicited print annotations. A4 is a 14 × 10 grid of 20 mm squares, centred on landscape paper. Manual 100% A4 printing was verified by the Referee within 1% and accepted.

- The browser shows only the drawing, filling its entire content area. No toolbar, sidebar, walkthrough, or diagnostics appear on the drawing screen.
- The 1.5 m square grid is always present and visibly readable, including on an empty model. It is part of the drawing, not an optional overlay.
- The browser supports pan, zoom, and a show-everything action.
- Agent updates preserve the current pan and zoom.
- Printing tiles the model on grid-aligned sheets at 1:75.
- Landscape A4 tiles cover 14 × 10 squares; portrait A3 tiles cover 14 × 20 squares.
- Printed sheets have coordinates and alignment marks in their margins.
- Printing supports the whole model or a selected area, with consistent tile boundaries across repeated prints.

## Editing and play

Requested direction, not implemented as separate modes:

- Designing a plan and using it in play are distinct activities; distinguish edit mode from play mode.
- Edit mode is for developing the layout. Exploration fog has little use during ordinary design work.
- Play mode is for using the layout with exploration visibility. The layout is expected to remain fixed during play; interactive door states and party movement are play state, not layout edits.
- Hide the red reference X/Y axes in play mode. Keep the permanent 1.5 m grid.

Proposed handling of revisions, still to validate:

- Tie play/exploration to a particular layout revision so subsequent authoring need not invalidate the active game's fog.
- Moving an existing game to a changed layout requires an explicit choice. Resetting exploration is a simple initial policy; preserving selected knowledge or replaying observations against a revised layout would need separate rules to avoid revealing changed areas accidentally.
- Do not silently replay old observations against new geometry: this may reveal areas that were blocked when the observations were made.
- Separate modes may simplify the prototype's historical geometry machinery, but no storage simplification has been selected yet. Multiple sessions, revision selection and transitions between modes remain open.

## Themes and styling

Requested direction, not implemented:

- Apply different themes/styles to the same model without changing its layout or physical meaning.
- The Referee likes the warm colors of the Azhanti High Lightning reference for screen presentation.
- Printing should support black-and-white or restrained color to reduce ink use. Meaningful distinctions must remain readable without relying on color alone.
- Styling must preserve the permanent readable grid, physical dimensions and print scale. Changing appearance must not change door state, access direction or sight blocking.
- Exact palettes, style controls and theme storage remain open; this requirement does not settle the prototype JSON format as the production model.

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

## Reusable drawing components

Requested direction, not implemented:

- Expect many plans with increasingly varied, larger, and more complex layouts. The current JSON prototype does not establish that the agent editing workflow, rendering, or exploration will scale to these workloads.
- Support a catalogue of reusable components, including furniture, hatches, and doors. Plans should allow variation while retaining regularity and recognisable drawing conventions.
- The agent should know when an existing component meets the Referee's intent and reuse it, rather than redrawing everything from primitives. Reuse must not override requested details.
- Do not populate the catalogue with arbitrary agent inventions. The Referee identifies [Robert Pearce's Yet Another Traveller Blog](https://travellerrpgblog.blogspot.com/) as an excellent reference source.

Proposed next steps and safeguards, still to validate:

- Begin with a source-backed inventory for review, distinguishing individual symbols from complete room assemblies and geomorphs. Record where each candidate comes from and what was actually inspected. Separate documented dimensions from measurements inferred from a drawing and from unknowns.
- Treat the current building's accepted doors, hatch/step-iron arrangement, lifts, and stair/platform as potential examples. Their dimensions and arrangements were approved for this building; they are not universal defaults.
- Give the agent a searchable inventory with previews, footprints, supported variants, and sources, so it can inspect suitable entries without loading an entire library into its context.
- A reusable definition and its placed instances could avoid repeatedly encoding the same geometry. Position, rotation, supported variations, and connections would belong to intentional placement. Exact interfaces and storage remain open; JSON is not a commitment to a particular CAD model.
- A recognisable symbol also needs correct placement and behaviour: attachment side, access, door state, and sight blocking matter. The step-iron mistake demonstrates why rotation/reflection alone is insufficient.
- Source material informs candidates, not automatic acceptance as official Traveller standards or as Referee-approved components. Keep source/author attribution and stated reuse terms with the inventory.
- Review a small initial set before expanding or importing assets. A catalogue must not silently redesign existing plans when a definition is revised; versioning/update behaviour remains to be decided.
- Reuse may reduce model duplication and agent editing effort. Rendering, model access, visibility replay, and large-plan storage still need separate measurements against representative plans.

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
- Open doors retain a thin dashed, unfilled panel outline in the doorway, identifying the door without implying that it is closed or blocks sight. This symbol obeys current visibility and last-seen memory like the rest of the plan.
- Door leaves in the current building are 0.06 m thick, inset within their thicker walls. Closed-door sight blockers use that same thickness so fog exposes the recess rather than treating the doorway as a flush wall face.
- The stair platform has only top and left border strokes; its bottom and right boundaries are supplied by the walls/door, avoiding a false line across the opened doorway.
- The GM can temporarily view the full plan with the POV marker to orient and place the party. Shift-F or the GM panel's full-plan button toggles this view (V remains an alias; plain F fits the plan) without revealing any additional exploration. POV placement and door toggling still work in GM view; observations retain normal range/occlusion. Reset returns to fog view. Fog print/export remains fogged even while the GM is viewing the full plan.
- Reset erases explored knowledge and closes all doors on the displayed level. It preserves POV position and range, and reveals nothing until the next POV placement or movement. Closing doors takes precedence over the earlier proposal to preserve their states: accidental disclosure is difficult to undo.
- Persist compact observation records: visited POV positions, sight ranges, and the door/opening states needed to reconstruct what was visible at each observation. Do not persist fog polygons as authoritative exploration history.
- Visibility polygons are derived data. Recompute them from observations; a bounded disposable cache (for example LRU) may be added if measured latency warrants it.
- Polling, reloads, and redraws must not create duplicate observations. Observation order matters for the agreed last-seen appearance when revisiting an area after a door changes state.
- Reconstruction must account for historical model changes as well as door states to preserve last-seen content. Proposed implementation: observations reference shared model revisions rather than copying the whole model per observation; revision storage remains to be designed.

The unfog prototype separates authored geometry, current visibility, and accumulated exploration. `?fog=1` selects the fog view. Version-2 exploration stores observation inputs and shared model revisions; visibility polygons are derived in a bounded in-memory cache. Ordered observation layers retain last-seen content. Shift-G opens the optional GM panel. Reset closes doors and clears observations and revisions, keeping POV/range and pausing reveal. Polling/reload do not append observations; stale saves are rejected.

The prototype now serves the original and lower level through a shared server, selected by URL, with separate exploration histories. A level-switching control and general plan catalogue remain unimplemented.

Questions still open:

- Multiple observers and individual exploration are outside the agreed next-version scope.
- Glass, lighting, eye height, multiple parties, and separate play sessions are deferred.

Observation-based storage and last-seen rendering are now implemented in the throwaway prototype. Long-history replay latency and revision storage across extensive authoring changes remain to be evaluated.
