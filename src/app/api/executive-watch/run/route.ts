import { ok, fail } from "@/lib/api/response";
import { runExecutiveWatch } from "@/lib/executive-autonomous-watch/executive-autonomous-watch.service";

// ─── Auth ─────────────────────────────────────────────────────────────────────
// Same pattern as /api/briefing/generate: a scheduled GitHub Actions workflow
// (see .github/workflows/executive-watch.yml) calls this with a bearer secret.
// No interactive user session exists at call time.

function isAuthorized(request: Request): boolean {
  const secret = process.env.EXECUTIVE_WATCH_CRON_SECRET ?? process.env.CRON_SECRET ?? null;

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("Authorization");
  return authHeader === `Bearer ${secret}`;
}

// ─── POST /api/executive-watch/run ─────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return fail("Unauthorized", 401);
  }

  try {
    const result = await runExecutiveWatch();
    return ok(result);
  } catch {
    return fail("Executive watch run failed", 500);
  }
}
