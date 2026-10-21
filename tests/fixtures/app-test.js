/* eslint-disable security/detect-non-literal-fs-filename -- Dynamic paths are confined to the port-scoped marker and verified temporary fixture directory; never live plan data. */
import { test as base, expect } from "@playwright/test";
import { copyFileSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

/** The disposable server's data directory, checked to be ours.
 * Assertions still use the browser and HTTP; direct file access is fixture setup and cleanup only. */
function fixtureRoot() {
  const port = process.env.RPGCAD_TEST_PORT || "8766";
  if (port === "8765") throw Error("Refusing to access a live fixture");
  const marker = JSON.parse(
    readFileSync(join(tmpdir(), `rpgcad-browser-fixture-${port}.json`), "utf8"),
  );
  if (
    marker.port !== port ||
    dirname(resolve(marker.root)) !== resolve(tmpdir()) ||
    !basename(marker.root).startsWith("rpgcad-browser-")
  )
    throw Error("Expected our disposable browser fixture directory");
  return /** @type {string} */ (marker.root);
}

/** Makes the server's data exactly what it was when the server started, on every level and file. */
function restorePristine() {
  const root = fixtureRoot(),
    pristine = readdirSync(join(root, "pristine"));
  for (const name of readdirSync(root))
    if (name.endsWith(".json") && !pristine.includes(name))
      unlinkSync(join(root, name));
  for (const name of pristine)
    copyFileSync(join(root, "pristine", name), join(root, name));
}

/** Resolves once the plan page says it will handle input: first drawing settled, roster and fog loaded, no save in flight (the viewport's data-ready).
 * @param {import('@playwright/test').Page} page @param {{timeout?: number}} [options] */
export const appReady = (page, options) =>
  expect(page.locator("#viewport")).toHaveAttribute(
    "data-ready",
    "true",
    options,
  );

/** @type {WeakMap<object, import('@playwright/test').Page['goto']>} */
const unwrapped = new WeakMap();

/** Navigates without waiting for readiness, for tests of the loading state itself.
 * @param {import('@playwright/test').Page} page @param {string} url */
export const gotoWhileLoading = (page, url) => {
  const goto = unwrapped.get(page);
  if (!goto) throw Error("Expected a page from the app-test fixture");
  return goto(url);
};

/** `test` for the plan page. Every test starts from the server's initial data and, once it ends, leaves the page only after its saves have landed, so a late write cannot reach the next test. A page waits for readiness after every goto, so no test acts on a half-started app. */
export const test = base.extend({
  page: async ({ page }, use) => {
    restorePristine();
    const goto = page.goto.bind(page);
    unwrapped.set(page, goto);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      if (new URL(page.url()).pathname === "/") await appReady(page);
      return response;
    };
    await use(page);
    // A test that ended early (failure) may leave a page that never gets ready; its saves are then not ours to wait for.
    if (new URL(page.url()).pathname === "/")
      await appReady(page, { timeout: 2000 }).catch(() => {});
    await page.close();
    restorePristine();
  },
});

export { expect };
