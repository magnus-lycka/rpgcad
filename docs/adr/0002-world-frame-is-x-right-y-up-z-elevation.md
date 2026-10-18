---
status: accepted, not yet implemented
---

# The world frame is X right, Y up, Z elevation

The stored frame follows mathematics and CAD: right-handed, X to the right, Y toward the top of a plan view, and Z elevation in metres from the plan's datum (the first level's floor is 0). A plan has no fixed compass direction. SVG and screens put Y downward, so the drawing layer alone negates Y; no stored file, API field or label carries the negation.

Stored Y currently grows downward, only the Edit axis numbers are Y-up, and levels have an integer `order` but no elevation. Correcting it converts every stored y (models, characters, exploration, marks) once, and levels gain a `z` that side views and half-floors can build on. Until then `docs/agents/designer-conversation.md` tells the agent how to convert.
