# Design discussion

These are agreed requirements from the ongoing interview, not an implementation plan.

## Working loop

- The Referee talks to an existing agent, initially outside RPGCAD.
- A separate browser view displays the layout and updates automatically.
- The agent must be able to inspect both the complete current model and its rendered view.
- For the first version, the agent makes all geometry edits. The Referee uses the browser to inspect, pan, zoom, and print.
- The usefulness of agent-generated designs will be evaluated through use; autonomous design quality is not a prerequisite for building the tooling.
- Keep the first version small. Sophisticated revision planning is deferred.

## Model and drawing

- The model has no fixed outer boundary; paper and viewport dimensions do not constrain it.
- Dimensions use real-world metres.
- The initial grid represents 1.5 m squares, printed as 2 cm squares at 1:75.
- Initial elements are walls, door openings, and text labels.
- Walls support arbitrary angles and positions between grid lines.
- Walls have a default physical thickness, overridable per wall, centred on their centre lines.
- Door openings belong to a wall, with their width and distance along the wall measured in metres. They cut through its thickness and follow its movement or rotation.
- Initial openings can appear as gaps; door leaves and swing symbols are deferred.

## Viewing and printing

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
- The model file format, implementation languages, and update transport have not been selected.
