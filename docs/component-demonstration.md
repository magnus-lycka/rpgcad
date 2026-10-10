# Component demonstration

Ticket #13's initial viability example is a separate saved plan named **Component demonstration**, plan `component-demo`, level `demo`. Its original AGPL v3 seed drawings cover bed, chair, wall door, ceiling hatch, crew console and service machinery. Dimensions and clearances are proposals; machinery is schematic and carries no game capacity. Referee recognition and approval remain open. Automated checks and agent inspection do not satisfy that human evaluation gate; inventory expansion (#14–#21) remains deferred.

## View and give feedback

Once registered, open [Edit](http://127.0.0.1:8765/?plan=component-demo&level=demo&mode=edit&region=plan) or [Play](http://127.0.0.1:8765/?plan=component-demo&level=demo&mode=play&region=plan). The library also lists the separate plan. The catalogue is available at [Components](http://127.0.0.1:8765/components.html).

The main room is 9 × 9 m between wall centre lines; the side room is 3 × 6 m. A shared 0.15 m wall holds a 1.5 m door. No existing building is converted. Furniture at the upper left compares a normal bed with a wider 90° bed and differently sized/oriented chairs. Upper-right and lower-right consoles compare one and three seats. Central machinery blocks sight; the smaller 180° machine has an explicit nonblocking override. Its front service approach and the console seats face free room space. The side-room hatch retains a dashed circle and UP-DOWN direction.

In Edit, draw a mark and write the requested change in the existing chat. The agent reads `/sketch?plan=component-demo&level=demo`, then edits the corresponding hydrated `/model` or authoritative model path returned by `/plan`, and acknowledges the saved mark with its `submittedAt`. There is no additional submit step. A useful evaluation is to request another console seat, rotate a chair, or widen one bed, then judge recognition, access, and delay in the unchanged view. Changes to one instance should leave siblings independent.

In Play, click around `[7.5, 4.5]` to reveal toward the side-room door; Shift-click its centre `[9, 4.5]` to open it. The side room should become visible through the opening. Reload retains the door state and exploration; Shift-R resets fog and door overrides. Shift-F offers a temporary GM view. Machinery's opaque default and local override are independent of the drawn appearance; access metadata does not enforce movement. Hatch state is authored metadata, with no travel or play toggle.

Browser Print with `region=plan` uses the existing A4 landscape, 1:75 output. Print at actual size/100%, no headers or footers: each 1.5 m square is 20 mm. The drawing has no demonstration captions, calibration rulers or additional print markings.

## Safe registration

Source is `prototype/demos/component-demo.json`, including fixed plan-owned copies of the six current catalogue definitions. Registration does not fetch or substitute newer catalogue entries on reload. The command requires an existing `library.PROTOTYPE.json`. If the server still uses only the legacy manifest, read its normal `/library` once to materialize the library before stopping it. Root owns live registration after integration; tests and visual checks use disposable directories and port 8772.

1. Read `/library` and record the existing plan metadata; snapshot the prototype library, model, characters, exploration and sketch files outside the data directory, preserving their bytes. Stop the server so registration cannot race a save.
2. From the integrated checkout run `uv run --locked python scripts/register_component_demo.py --root /absolute/path/to/prototype`. Inspect the result before restarting. The command appends a new record, copies deterministic demo geometry into a newly created `component-demo-data/`, and keeps the exact prior library as `library.before-component-demo.json`. Existing records, dates, revisions and state files are retained. A duplicate plan ID, reserved data directory, or previous backup causes refusal; nothing is silently overwritten.
3. Restart and read the library and selected demo model through HTTP. Compare the pre-existing plan metadata and the byte snapshots of existing models/play/marks. Only the library's new demo record/revision and dedicated demo data should be new. If registration is refused, inspect the collision; do not remove or replace an authored demo just to rerun this command.

Demo characters live in `component-demo-data/characters.json`; exploration in `component-demo-data/model.exploration.json`; marks are created by the normal server at `component-demo-data/model.sketch.PROTOTYPE.json`. These paths are separate from every existing plan. The original library backup alone is not a backup of subsequent authored demo changes.

## Verification

The registration command's regression tests check preservation of existing records/revisions/play bytes and refusal of repeated registration or a reserved directory. Browser characterization searches and retrieves the catalogue, saves the demo through normal HTTP, checks independent station counts/rotation, reloads, and samples rendered fog before/after opening the door and again after reload. Integrated catalogue characterization checks console seats and machinery details in the generic preview renderer. Exact observed latency and visual/print inspection artifacts are recorded in the implementation handoff; they are observations from a disposable local run, not a guaranteed response target or human approval.
