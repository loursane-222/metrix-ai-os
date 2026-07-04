import { defineConfig } from "vitest/config";
import path from "path";
import { config } from "dotenv";

// Next.js dev server sırasıyla yükler: .env → .env.local (override)
// Perf benchmark aynı ortamı kullanmalı; aksi hâlde Supabase'e gidilir.
config({ path: path.resolve(__dirname, ".env") });
config({ path: path.resolve(__dirname, ".env.local"), override: true });

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/ai/performance/**/*.perf.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
