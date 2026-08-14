import { defineConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env", quiet: true }); loadEnv({ path: ".env.local", override: true, quiet: true });
export default defineConfig({ testDir: "./e2e", testMatch: ["stok-sesli-komut.acceptance.e2e.ts"], reporter: "line", use: { baseURL: "http://127.0.0.1:3128" }, webServer: { command: "npm run start -- --hostname 127.0.0.1 --port 3128", url: "http://127.0.0.1:3128/metrix", reuseExistingServer: false, timeout: 120_000 } });
