import { ok, fail } from "@/lib/api/response";
import { runBriefingOrchestration } from "@/lib/daily-briefing/daily-briefing-orchestrator.service";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(request: Request): boolean {
  const secret = process.env.BRIEFING_CRON_SECRET ?? process.env.CRON_SECRET ?? null;

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("Authorization");
  return authHeader === `Bearer ${secret}`;
}

// ─── POST /api/briefing/generate ─────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return fail("Unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON body", 400);
  }

  if (!body || typeof body !== "object") {
    return fail("Request body required", 400);
  }

  const { organizationId, isWeeklyDay, companyContext } = body as Record<string, unknown>;

  if (typeof organizationId !== "string" || !organizationId) {
    return fail("organizationId is required", 400);
  }

  try {
    const result = await runBriefingOrchestration({
      organizationId,
      isWeeklyDay: typeof isWeeklyDay === "boolean" ? isWeeklyDay : undefined,
      companyContext: typeof companyContext === "string" ? companyContext : null,
    });

    return ok({
      briefingDate:     result.briefingDate,
      criticalCount:    result.criticalCount,
      watchCount:       result.watchCount,
      infoCount:        result.infoCount,
      sourceCount:      result.sourceCount,
      memoryWriteCount: result.memoryWriteCount,
      wasAlreadyStored: result.wasAlreadyStored,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Briefing generation failed";
    return fail(message, 500);
  }
}
