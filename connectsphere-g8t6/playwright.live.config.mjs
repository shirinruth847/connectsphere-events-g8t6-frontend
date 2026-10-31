import { defineConfig, devices } from "@playwright/test";

// Real-backend journeys (`npm run test:e2e:live`). Both applications must
// already be running (frontend :3000, backend :8000) with the sibling backend
// repository's private .env; nothing is mocked and no server is started here.
// Specs create and remove only their own run-scoped fixtures.
export default defineConfig({
  testDir: "./tests/live",
  testMatch: ["**/*.live.spec.mjs"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"], ["json", { outputFile: "test-results/live-e2e-results.json" }]],
  outputDir: "test-results/live-e2e",
  use: {
    ...devices["Desktop Chrome"],
    channel: "chrome",
    baseURL: process.env.LIVE_FRONTEND_URL || "http://localhost:3000",
    timezoneId: "Asia/Singapore",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
