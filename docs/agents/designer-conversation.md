# Designer conversation

How the agent turns the Designer's chat instruction and drawing marks into edits.

## Drawing marks

The Designer draws freehand marks on the current plan, then writes the instruction in this chat. There is no browser instruction box or submit action. Pen-up, undo and clear save the current marks through `/sketch`, scoped by the drawing URL's `plan` and `level` selectors.

For a layout instruction:

1. Read `GET /plan?plan=<id>` to find the selected level's authoritative `model` path (relative to the server's prototype directory).
2. Read `GET /sketch?plan=<id>&level=<id>`. An omitted level selects the plan's first level. Legacy URLs without `plan` select the existing building: `/sketch?level=below` reads its lower floor and `/sketch` its ground floor.
3. Read the marks before interpreting the chat text. They supply spatial context; the words supply the instruction.
4. Edit that level's authoritative model.
5. `PATCH /sketch` with the same selectors, the record's `submittedAt`, `status: "applied"` and a short `reply`. The browser clears only the acknowledged marks, so newer strokes survive.

Empty or already-applied records supply no new sketch. Respond and edit promptly; run routine implementation checks outside this loop.

## Coordinates and wording

Every level of a plan shares one coordinate frame in metres; see `docs/adr/0002-world-frame-is-x-right-y-up-z-elevation.md`.

- **Elevation.** Say "elevation" for Z in every message and in every explanation to the Designer: "higher elevation", "elevation 3 m".
- **Plan directions.** Say X and Y, or left, right, top and bottom of the page.
- **Bare "up" and "down".** Read them from context: a hatch, ladder, stair or deck is elevation; moving a wall or door on the drawing is the page. Ask first only when context does not decide.
- **Echo the reading.** State the resolved coordinates in the reply ("I read that as 3 m toward the top of the page, y = -1.5") so a wrong reading is seen at once.
- **Y in the stored files.** Today stored y grows downward, the opposite of the frame above. The red axis numbers in Edit are Y-up, so a stored y equals the reference origin's y minus the Y number. Convert when reading marks and writing models, and say which convention a number uses when it could be mistaken.
- **Reference origin.** One value for the plan, shown as the red cross in Edit; it only labels positions and never moves geometry. Positions the Designer gives relative to it become stored positions by adding the origin.
