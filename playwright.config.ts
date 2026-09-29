import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 300000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.TRUTHLENS_URL || "http://localhost:3000",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: process.env.TRUTHLENS_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/api/health",
        reuseExistingServer: false,
        timeout: 600000,
        env: { NODE_ENV: "development" },
      },
});
