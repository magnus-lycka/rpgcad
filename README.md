# rpgcad

A design tool for tabletop role-playing floor plans, primarily for Traveller.

The aim is to help develop layouts interactively from text and conversation,
with rapid visual feedback while making and refining design decisions.

Typical output uses Traveller's 1.5 m grid, printed at 1:75 with 2 cm squares.
A useful initial sheet size is 14 × 10 squares (280 × 200 mm).

The interaction model and technology stack are still being explored.

## Development

Install with `uv sync --locked` and `npm ci`, install the test browser with `npx playwright install chromium`, then enable the local checks with `uv run pre-commit install`. Run the complete check suite with `uv run python scripts/check.py`. CI runs the same suite.

Follow the one-test-at-a-time red → green → refactor workflow in [the development guide](docs/agents/development.md).
