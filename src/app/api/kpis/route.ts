import { fail, ok } from "@/lib/api/response";
import { ApiValidationError, optionalString, readJsonObject, requiredRecord, requiredString } from "@/lib/api/validation";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { createNewKpiDefinition, listKpiDefinitions } from "@/lib/core/kpis";
import type { Prisma } from "@prisma/client";

export async function GET(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const rawActive = new URL(request.url).searchParams.get("active");
    const active = rawActive === null ? undefined : rawActive === "true";

    const kpis = await listKpiDefinitions({ organizationId: authContext.organization.id, active });

    return ok({ kpis, count: kpis.length });
  } catch (error: unknown) {
    return authFail(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);

    const kpi = await createNewKpiDefinition({
      organizationId: authContext.organization.id,
      key: requiredString(body, "key"),
      label: requiredString(body, "label"),
      description: optionalString(body, "description"),
      scope: requiredString(body, "scope"),
      calculationMethod: requiredRecord(body, "calculationMethod") as Prisma.InputJsonValue,
      sourceDomainsJson: requiredRecord(body, "sourceDomainsJson") as Prisma.InputJsonValue,
      period: requiredString(body, "period"),
      targetRelation: optionalString(body, "targetRelation"),
      createdByType: "USER",
      rationale: requiredString(body, "rationale"),
    });

    return ok({ kpi }, 201);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) return fail(error.message, 400);
    return authFail(error);
  }
}
