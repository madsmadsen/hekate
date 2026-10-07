// End-to-end tests for Hekate (PRD section 9, NFR-4).
// Playwright does not start the servers. Start the nginx server of dev/ first: see README.md.
//   http://localhost:18080  the demo page (the host page)
//   http://localhost:18081  the asset host (dist/)
import { defineConfig, devices } from "@playwright/test";

const workers = process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : undefined;

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  ...(workers === undefined ? {} : { workers }),
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],
  use: {
    baseURL: "http://localhost:18080",
    locale: "en-US",
    trace: "retain-on-failure",
    // The tests never use the network outside the two local origins.
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Test pages that `page.route()` makes have no known IP address space. Chromium then
          // treats them as public pages and blocks their requests to http://localhost:18081
          // ("Local Network Access"). Pages that nginx serves are not affected. This flag only
          // switches that check off for the tests.
          args: ["--disable-features=LocalNetworkAccessChecks"],
        },
      },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
