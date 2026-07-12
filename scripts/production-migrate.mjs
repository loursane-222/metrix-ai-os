import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function runProductionMigration({
  env = process.env,
  runMigration = () => execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "deploy"],
    { env, stdio: "inherit" },
  ),
  log = console.log,
} = {}) {
  if (env.VERCEL_ENV !== "production") {
    log("[deploy] Production migration skipped outside Vercel production.");
    return "skipped";
  }

  if (!env.DIRECT_URL?.trim()) {
    throw new Error("[deploy] DIRECT_URL is required for production migrations.");
  }

  log("[deploy] Applying production Prisma migrations.");
  runMigration();
  log("[deploy] Production Prisma migrations completed.");
  return "applied";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runProductionMigration();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "[deploy] Production migration failed.");
    process.exitCode = 1;
  }
}
