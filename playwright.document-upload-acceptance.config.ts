import { defineConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env", quiet: true });
loadEnv({ path: ".env.local", override: true, quiet: true });

export default defineConfig({
  testDir: "./e2e",
  testMatch: "customer-document-upload.production-acceptance.e2e.ts",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  timeout: 180_000,
  use: {
    baseURL: "http://127.0.0.1:3111",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "ACCEPTANCE_MODE=isolated npm run start -- --hostname 127.0.0.1 --port 3111",
    url: "http://127.0.0.1:3111/metrix",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
