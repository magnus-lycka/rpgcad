/* eslint-disable security/detect-non-literal-fs-filename -- Dynamic paths are confined to the port-scoped marker and verified temporary fixture directory; never live plan data. */
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

/** Restore only the port-scoped disposable harness data around mutating browser tests.
 * Assertions still use the browser and HTTP; these files are fixture setup/cleanup.
 * @param {typeof import('@playwright/test').test} test
 */
export function preserveBrowserFixture(test) {
  let root = "";
  /** @type {Map<string, string>} */
  let saved = new Map();
  test.beforeEach(() => {
    const port = process.env.RPGCAD_TEST_PORT || "8766";
    if (port === "8765") throw Error("Refusing to access a live fixture");

    const marker = JSON.parse(
      readFileSync(
        join(tmpdir(), `rpgcad-browser-fixture-${port}.json`),
        "utf8",
      ),
    );
    root = marker.root;
    if (
      marker.port !== port ||
      dirname(resolve(root)) !== resolve(tmpdir()) ||
      !basename(root).startsWith("rpgcad-browser-")
    )
      throw Error("Expected our disposable browser fixture directory");

    saved = new Map(
      readdirSync(root)
        .filter((name) => name.endsWith(".json"))
        .map((name) => {
          return [name, readFileSync(join(root, name), "utf8")];
        }),
    );
  });
  test.afterEach(async ({ page }) => {
    await page.close();
    if (!root || !saved.size) return;

    for (const name of readdirSync(root).filter((name) =>
      name.endsWith(".json"),
    )) {
      if (!saved.has(name)) {
        unlinkSync(join(root, name));
      }
    }
    for (const [name, content] of saved) {
      writeFileSync(join(root, name), content);
    }
    root = "";
    saved = new Map();
  });
}
