import { defineConfig, devices } from "@playwright/test";

import { e2eDatabaseUrl } from "./e2e/database";
import { authFile } from "./e2e/test-user";

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
    // Signs the test user in once; the specs below start with that session
    {
      name: "setup",
      testMatch: /auth.setup.ts/,
      use: { ...devices["Desktop Edge"], channel: "msedge" },
    },
    {
      name: "edge",
      testIgnore: /auth.setup.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Edge"],
        channel: "msedge",
        storageState: authFile,
      },
    },
  ],
  webServer: {
    // A production build: the same code that runs on the server. `next start`
    // warns about output: standalone, but serves the build fine
    command: `pnpm build && pnpm start --port ${port}`,
    // Not /health: the server starts before globalSetup creates the e2e
    // database, and /health fails until the database answers
    url: `http://localhost:${port}/icon.svg`,
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      // Own settings of the app under test: its address, the Mailpit that
      // catches the emails, a secret that is only good for tests
      BETTER_AUTH_URL: `http://localhost:${port}`,
      BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
      SMTP_URL: "smtp://localhost:1025",
      MAIL_FROM: "Личная CRM <noreply@mail.crm.vupsen.space>",
    },
    // Always a fresh server on the e2e database, never a server left running
    reuseExistingServer: false,
    timeout: 5 * 60_000,
  },
});
