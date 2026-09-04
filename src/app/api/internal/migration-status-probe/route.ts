import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { EXPECTED_MIGRATIONS } from "./expected-migrations.generated";

// ─── ONE-OFF, TEMPORARY route ──────────────────────────────────────────────
// Built only to answer one question read-only: is production's real
// _prisma_migrations history in sync with this repo's migration files, and
// specifically has 20260904090227_add_company_intelligence_platform been
// applied yet. Delete this directory (route.ts + expected-migrations.generated.ts)
// once that answer has been captured — it is not meant to stay in the codebase.
//
// ─── Auth ───────────────────────────────────────────────────────────────
// Reuses the existing internal Bearer-secret pattern (see
// /api/executive-watch/run, /api/briefing/generate) rather than minting a
// new permanent auth mechanism: any ONE of the already-configured internal
// cron secrets authorizes this route. The other five are all Vercel
// "Sensitive" env vars, so their values can never actually be read back via
// CLI/dashboard to use here — MIGRATION_PROBE_SECRET is a temporary,
// non-sensitive var set just for this probe's own manual trigger, checked
// the same way as the others (no separate code path, no new auth mechanism).
const REUSED_INTERNAL_SECRETS = [
  process.env.EXECUTIVE_WATCH_CRON_SECRET,
  process.env.BRIEFING_CRON_SECRET,
  process.env.FINANCIAL_REMINDER_CRON_SECRET,
  process.env.MEETING_REMINDER_CRON_SECRET,
  process.env.REP_MORNING_BRIEFING_CRON_SECRET,
  process.env.MIGRATION_PROBE_SECRET,
].filter((secret): secret is string => Boolean(secret && secret.length > 0));

function isAuthorized(request: Request): boolean {
  if (REUSED_INTERNAL_SECRETS.length === 0) {
    // Mirrors every other internal route's own fallback — only ever true
    // locally, since production always has at least one of these secrets set.
    return process.env.NODE_ENV !== "production";
  }
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  return REUSED_INTERNAL_SECRETS.includes(authHeader.slice("Bearer ".length));
}

type MigrationRow = {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  started_at: Date;
};

const WATCHED_CHECKSUM_NAMES = ["20260719213000_customer_document_attachments", "20260903000000_add_advanced_financial_obligations_authority"] as const;
const NEW_MIGRATION_NAME = "20260904090227_add_company_intelligence_platform";

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) return fail("Unauthorized", 401);

  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) return fail("DIRECT_URL is not configured in this runtime.", 500);

  // A dedicated connection to DIRECT_URL — deliberately NOT the app's shared
  // prisma singleton (src/lib/core/shared/prisma.ts), which is wired to
  // DATABASE_URL (the pgbouncer pooler). `prisma migrate status`/`deploy`
  // themselves resolve against DIRECT_URL (see prisma.config.ts); this probe
  // has to match that, not the app's normal request-serving connection.
  const adapter = new PrismaPg({ connectionString: directUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    // READ-ONLY. This is the only query this route ever runs — no DDL, no
    // DML, no migrate/resolve/deploy/dev, no db push.
    const rows = await prisma.$queryRawUnsafe<MigrationRow[]>(
      `SELECT migration_name, checksum, finished_at, rolled_back_at, started_at FROM "_prisma_migrations" ORDER BY started_at ASC;`,
    );

    const appliedByName = new Map(rows.map((row) => [row.migration_name, row]));

    const applied: string[] = [];
    const pending: string[] = [];
    const failed: string[] = [];
    const checksumMismatches: Array<{ name: string; expectedChecksum: string; actualChecksum: string }> = [];

    for (const expected of EXPECTED_MIGRATIONS) {
      const row = appliedByName.get(expected.name);
      if (!row) {
        pending.push(expected.name);
        continue;
      }
      if (!row.finished_at || row.rolled_back_at) {
        failed.push(expected.name);
        continue;
      }
      applied.push(expected.name);
      if (row.checksum !== expected.checksum) {
        checksumMismatches.push({ name: expected.name, expectedChecksum: expected.checksum, actualChecksum: row.checksum });
      }
    }

    // Rows production has that this repo's migration history doesn't know
    // about at all — surfaced, never silently ignored.
    const unknownApplied = rows.map((row) => row.migration_name).filter((name) => !EXPECTED_MIGRATIONS.some((expected) => expected.name === name));

    const watchedChecksums = WATCHED_CHECKSUM_NAMES.map((name) => {
      const mismatch = checksumMismatches.find((m) => m.name === name);
      return { name, status: mismatch ? "MISMATCH" as const : appliedByName.has(name) ? "MATCHES" as const : "NOT_APPLIED" as const };
    });

    const newMigrationStatus = applied.includes(NEW_MIGRATION_NAME) ? "APPLIED" : "PENDING";

    let finalGate: "RELEASE_SAFE" | "RELEASE_REQUIRES_MIGRATION_REPAIR" | "RELEASE_BLOCKED";
    if (checksumMismatches.length > 0 || failed.length > 0 || unknownApplied.length > 0) {
      finalGate = "RELEASE_REQUIRES_MIGRATION_REPAIR";
    } else if (pending.length === 0 || (pending.length === 1 && pending[0] === NEW_MIGRATION_NAME)) {
      // Every other repo migration is already applied cleanly; only ours (or
      // nothing) remains pending — a plain additive deploy is safe.
      finalGate = "RELEASE_SAFE";
    } else {
      // Some OTHER, unrelated repo migration is unexpectedly missing from
      // production — not this operation's problem to resolve, but not safe
      // to wave through either.
      finalGate = "RELEASE_BLOCKED";
    }

    return ok({
      dbAccess: "PASS",
      appliedCount: applied.length,
      applied,
      pending,
      failed,
      checksumMismatches,
      unknownApplied,
      watchedChecksums,
      newMigration: { name: NEW_MIGRATION_NAME, status: newMigrationStatus },
      finalGate,
    });
  } catch (error) {
    // Never the raw error message — some driver errors can echo connection
    // details back. Only a coarse, non-secret category.
    const code = (error as { code?: string } | null)?.code ?? null;
    const category =
      code === "28P01" ? "AUTHENTICATION_FAILED" : code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ETIMEDOUT" ? "CONNECTION_UNREACHABLE" : "UNKNOWN_ERROR";
    console.error("[migration-status-probe] read-only query failed", { code, category });
    return ok({ dbAccess: "FAIL", failureCategory: category, finalGate: "RELEASE_BLOCKED" });
  } finally {
    await prisma.$disconnect();
  }
}
