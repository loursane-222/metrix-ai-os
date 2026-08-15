import { ok } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { prisma } from "@/lib/core/shared/prisma";
import { resolveCompanyUnitActionCommand } from "@/lib/company/company-unit-action-command-resolver";
import { generateCompanyUnitActionCommandText } from "@/lib/company/company-unit-action-command-ai-adapter";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const units = await prisma.companyUnit.findMany({ where: { organizationId: auth.organization.id, active: true }, select: { id: true, name: true, unitType: true, isPrimary: true }, orderBy: { createdAt: "asc" } });
    const outcome = await resolveCompanyUnitActionCommand({ utterance: requiredString(body, "utterance"), rows: units, generateText: generateCompanyUnitActionCommandText });
    return ok({ outcome });
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
