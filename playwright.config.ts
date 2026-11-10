import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.LIVE_URL || "http://127.0.0.1:4189",
    browserName: "chromium",
    timezoneId: "Europe/Rome",
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
    trace: "retain-on-failure",
  },
  webServer: process.env.LIVE_URL
    ? undefined
    : {
        command: "npm run preview -- --port 4189 --strictPort",
        url: "http://127.0.0.1:4189",
        reuseExistingServer: false,
      },
});
