import { ok, fail } from "@/lib/api/response";
import { runRepMorningBriefing } from "@/lib/rep-goals/rep-morning-briefing-runner.service";

// Same pattern as /api/executive-watch/run: a scheduled GitHub Actions
// workflow (see .github/workflows/rep-morning-briefing.yml) calls this
// with a bearer secret. No interactive user session exists at call time.

function isAuthorized(request: Request): boolean {
  const secret = process.env.REP_MORNING_BRIEFING_CRON_SECRET ?? process.env.CRON_SECRET ?? null;

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("Authorization");
  return authHeader === `Bearer ${secret}`;
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return fail("Unauthorized", 401);
  }

  try {
    const result = await runRepMorningBriefing();
    return ok(result);
  } catch {
    return fail("Rep morning briefing run failed", 500);
  }
}
