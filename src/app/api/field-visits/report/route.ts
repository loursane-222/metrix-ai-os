import { randomUUID } from "crypto";
import { ok, fail } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { processFieldVisitReport } from "@/lib/field-visits/field-visit-report-orchestrator.service";

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return fail("message zorunludur.", 400);

    const result = await processFieldVisitReport({
      authContext,
      message,
      correlationId: request.headers.get("X-Correlation-Id")?.trim() || randomUUID(),
    });

    return ok({ report: result });
  } catch (error) {
    return mapExecutionErrorToHttpResponse(error);
  }
}
