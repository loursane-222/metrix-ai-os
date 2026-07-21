import { ok, fail } from "@/lib/api/response";
import { listOrganizationsForDailyBriefing } from "@/lib/core/organizations/organization.repository";
import { runBriefingOrchestration } from "@/lib/daily-briefing/daily-briefing-orchestrator.service";

import type { BriefingOrganizationResult } from "@/lib/core/organizations/organization.types";

type OrganizationBriefingResult = {
  organizationId: string;
  organizationName: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  stored: boolean;
  duplicate: boolean;
  errorCode: "BRIEFING_GENERATION_FAILED" | "NO_ACTIVE_MEMBERS" | null;
};

type BriefingBatchResult = {
  success: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: OrganizationBriefingResult[];
};

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

  const fields = body as Record<string, unknown>;
  const unsupportedFields = Object.keys(fields).filter((key) => key !== "isWeeklyDay");

  if (unsupportedFields.length > 0) {
    return fail("Request contains unsupported fields", 400);
  }

  if ("isWeeklyDay" in fields && typeof fields.isWeeklyDay !== "boolean") {
    return fail("isWeeklyDay must be a boolean", 400);
  }

  let organizations: BriefingOrganizationResult[];
  try {
    organizations = await listOrganizationsForDailyBriefing();
  } catch {
    return fail("Organization discovery failed", 500);
  }

  const results: OrganizationBriefingResult[] = [];
  for (const organization of organizations) {
    if (organization.activeMemberCount === 0) {
      results.push({
        organizationId: organization.id,
        organizationName: organization.name,
        status: "SKIPPED",
        stored: false,
        duplicate: false,
        errorCode: "NO_ACTIVE_MEMBERS",
      });
      continue;
    }

    try {
      const result = await runBriefingOrchestration({
        organizationId: organization.id,
        isWeeklyDay: fields.isWeeklyDay as boolean | undefined,
        companyContext: buildDailyBriefingCompanyContext(organization),
      });
      results.push({
        organizationId: organization.id,
        organizationName: organization.name,
        status: "SUCCESS",
        stored: !result.wasAlreadyStored,
        duplicate: result.wasAlreadyStored,
        errorCode: null,
      });
    } catch {
      results.push({
        organizationId: organization.id,
        organizationName: organization.name,
        status: "FAILED",
        stored: false,
        duplicate: false,
        errorCode: "BRIEFING_GENERATION_FAILED",
      });
    }
  }

  const summary = summarizeResults(results);
  if (summary.processed > 0 && summary.succeeded === 0) {
    return Response.json(
      { ok: false, error: { message: "Briefing generation failed for all eligible organizations" }, data: summary },
      { status: 500 },
    );
  }

  return ok(summary);
}

function buildDailyBriefingCompanyContext(
  organization: BriefingOrganizationResult,
): string {
  const fields = [
    ["Şirket", organization.name],
    ["Sektör", organization.industry],
    ["Şirket büyüklüğü", organization.companySize],
    ["Ülke", organization.country],
    ["Şehir", organization.city],
    ["Açıklama", organization.description],
  ] satisfies Array<readonly [string, string | null]>;

  return fields
    .flatMap(([label, value]) => {
      const normalizedValue = value?.trim();
      return normalizedValue ? [`${label}: ${normalizedValue}`] : [];
    })
    .join("\n");
}

function summarizeResults(results: OrganizationBriefingResult[]): BriefingBatchResult {
  const succeeded = results.filter((result) => result.status === "SUCCESS").length;
  const failed = results.filter((result) => result.status === "FAILED").length;
  const skipped = results.filter((result) => result.status === "SKIPPED").length;

  return {
    success: failed === 0 || succeeded > 0,
    processed: succeeded + failed,
    succeeded,
    failed,
    skipped,
    results,
  };
}
