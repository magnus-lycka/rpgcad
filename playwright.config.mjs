import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:8766",
    viewport: { width: 1200, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "uv run --locked python scripts/browser_test_server.py",
    url: "http://127.0.0.1:8766",
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGINT", timeout: 2000 },
  },
});
