import { defineConfig, devices } from "@playwright/test";

import { e2eDatabaseUrl } from "./e2e/database";

// Not 3000, so the tests do not clash with `pnpm dev`
const port = 3100;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Tests share one database, so they run one by one
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${port}`,
    locale: "ru-RU",
    trace: "retain-on-failure",
  },
  // Edge installed on the machine: Chromium engine, nothing to download
  projects: [
    { name: "edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
  ],
  webServer: {
    // A production build: the same code that runs on the server. `next start`
    // warns about output: standalone, but serves the build fine
    command: `pnpm build && pnpm start --port ${port}`,
    // Not /health: the server starts before globalSetup creates the e2e
    // database, and /health fails until the database answers
    url: `http://localhost:${port}/icon.svg`,
    env: { DATABASE_URL: e2eDatabaseUrl },
    // Always a fresh server on the e2e database, never a server left running
    reuseExistingServer: false,
    timeout: 5 * 60_000,
  },
});
