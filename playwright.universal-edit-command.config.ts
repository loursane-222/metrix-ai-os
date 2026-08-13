import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "universal-edit-command-foundation.e2e.ts",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: { baseURL: "http://localhost:3000" },
});
