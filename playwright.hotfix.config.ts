import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "customer-create-navigation.hotfix.e2e.ts",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:3107", trace: "retain-on-failure" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3107",
    url: "http://127.0.0.1:3107/metrix",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
