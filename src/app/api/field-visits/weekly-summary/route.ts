import { ok } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { resolveFieldVisitWeeklySummaryRequest } from "@/lib/field-visits/field-visit-weekly-summary-request.service";

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const targetReference = typeof body.targetReference === "string" && body.targetReference.trim() ? body.targetReference.trim() : null;

    const result = await resolveFieldVisitWeeklySummaryRequest({ authContext, targetReference });

    return ok({ lookup: result });
  } catch (error) {
    return mapExecutionErrorToHttpResponse(error);
  }
}
