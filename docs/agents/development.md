# Development workflow

Use uv for Python environments, dependencies, and commands. Commit both dependency lockfiles. See `pyproject.toml` and `package.json` for the tools and their configuration.

## Test-driven changes

For each intended behaviour:

1. State the behaviour and the public interface through which it is observed.
2. Write one intention-focused test and run it. Confirm it fails because the behaviour is missing or wrong.
3. Add only enough functionality to make that test green.
4. Refactor while keeping the tests green before selecting the next test.

Work one test at a time. Assert outcomes callers need, with independently established expected values. Test internal structure only when that structure is itself the interface contract. Existing behaviour can receive clearly identified characterisation tests; do not describe an already-green baseline as a red-green cycle.

This repository follows the Referee's explicit red-green-refactor loop. It overrides the installed TDD skill's instruction to defer refactoring to review. The testing requirement applies to future changes in the prototype too, overriding its original throwaway/no-tests convention.

Test server behaviour through HTTP against an isolated temporary plan. Test drawing and exploration behaviour through the portable Geometry/Fog APIs. Never use the live exploration file as a writable test fixture. Visual checks complement behavioural tests for spatial presentation.

## Local and CI checks

After cloning, run `uv sync --locked`, `npm ci`, and `uv run pre-commit install`.

Run the complete gate with `uv run python scripts/check.py`. The pre-commit hook and CI run that same command. Checks never silently fix files; format deliberately with `uv run ruff format .` and `npm run format`, then inspect the diff.

JavaScript uses ESLint with security rules, Prettier, TypeScript checking of JavaScript (JSDoc for model contracts), Knip for dependency checks, and Node’s built-in test runner. Existing prototype code uses gradual typing (`noImplicitAny: false`); extend the explicit public types as behaviour evolves.

CodeQL and Dependabot are GitHub services configured separately from the local gate. Their operation depends on the repository's GitHub security feature availability.
