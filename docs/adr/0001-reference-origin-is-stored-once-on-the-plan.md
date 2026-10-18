---
status: accepted
---

# The reference origin is stored once on the plan

The red reference origin is an offset for labelling positions and anchoring print pages, not part of the drawing, and levels share one coordinate frame. It is stored once on the plan record, and the server overlays it on every level it serves. Storing it in each level file let levels disagree, so one move had to rewrite every file; a move now changes one value and counts as no drawing edit. Level files no longer carry an origin: the first read of an older plan moves the first level's value onto the plan and removes the rest.
