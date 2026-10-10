# Development workflow

Use uv for Python environments, dependencies, and commands. Commit both dependency lockfiles. See `pyproject.toml` and `package.json` for the tools and their configuration.

## Test-driven changes

For each intended behaviour:

1. State the behaviour and the public interface through which it is observed.
2. Write one intention-focused test and run it. Confirm it fails because the behaviour is missing or wrong.
3. Add only enough functionality to make that test green.
4. Refactor while keeping the tests green before selecting the next test.

Work one test at a time. Assert outcomes callers need, with independently established expected values. Test internal structure only when that structure is itself the interface contract. Existing behaviour can receive clearly identified characterisation tests; do not describe an already-green baseline as a red-green cycle.

The testing requirement applies to future changes in the prototype too, overriding its original throwaway/no-tests convention.

Test server behaviour through HTTP against an isolated temporary plan. Test drawing and exploration behaviour through the portable Geometry/Fog APIs. Never use the live exploration file as a writable test fixture. Browser integration tests use Chromium through Playwright against a disposable server on port 8766. Exercise keyboard/pointer controls, persistence, and rendered fog pixels; HTTP tests alone cannot verify browser behaviour. Keep expected geometry/colours independent of implementation calculations. Visual checks still complement these tests for spatial presentation.

## Local and CI checks

After a Playwright dependency update, reinstall the matching test browser with `npx playwright install chromium`.

After cloning, run `uv sync --locked`, `npm ci`, `npx playwright install chromium`, and `uv run pre-commit install`.

Run the complete gate with `uv run --locked python scripts/check.py`. The pre-commit hook and CI run that same command. Checks never silently fix files; format deliberately with `uv run ruff format .` and `npm run format`, then inspect the diff.

JavaScript uses ESLint with security rules, Prettier, TypeScript checking of JavaScript (JSDoc for model contracts), Knip for dependency checks, and Node’s built-in test runner for pure logic, plus Playwright for browser integration. Existing prototype code uses gradual typing (`noImplicitAny: false`); extend the explicit public types as behaviour evolves.

CodeQL and Dependabot are GitHub services configured separately from the local gate. Dependabot alerts and security fixes are enabled; weekly uv/npm/Actions updates activate when its configuration reaches the default branch. Code scanning works for this now-public repository: CodeQL run `38080326472` succeeded for commit `3b9666f`, uploading both language analyses. An earlier upload failed while the repository was private and scanning was disabled. The scan's one medium response-splitting alert is a separate finding, not an upload failure.

## Command troubleshooting

When a sandboxed uv command cannot write its cache, preserve an existing writable `UV_CACHE_DIR`; otherwise scope a writable path to the command, for example `UV_CACHE_DIR=/tmp/rpgcad-uv-cache uv run --locked ruff check .`. Reuse that path for subsequent uv commands, including the complete gate, so its child uv processes inherit it. CI uses the cache configured by `setup-uv`.

When diagnosing CI, select the failing job before retrieving logs: `gh run view <run-id> --json jobs`, then `gh run view <run-id> --job <job-id> --log-failed`. Filter further with `rg -n -C 3 '<error-pattern>'` before returning output. Broaden to the relevant step or full job log when the failure excerpt lacks context.
