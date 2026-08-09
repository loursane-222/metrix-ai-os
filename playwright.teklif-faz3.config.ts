import { defineConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env", quiet: true });
loadEnv({ path: ".env.local", override: true, quiet: true });
export default defineConfig({
  testDir: "./e2e", testMatch: ["teklif-faz3-kanit.acceptance.e2e.ts"], fullyParallel: false, retries: 0, reporter: "line",
  use: { baseURL: "http://127.0.0.1:3118", trace: "retain-on-failure" },
  webServer: { command: "npm run start -- --hostname 127.0.0.1 --port 3118", url: "http://127.0.0.1:3118", reuseExistingServer: false, timeout: 120_000 },
});
