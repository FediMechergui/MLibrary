import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:5173",
    browserName: "chromium",
    channel: process.env.CI ? undefined : "msedge",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: [["list"]],
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: "node scripts/dev.mjs --production",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: false,
        timeout: 30000,
      },
});
