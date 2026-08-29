import { ok, fail } from "@/lib/api/response";
import { readJsonObject } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { proposeRepRequest } from "@/lib/rep-requests/rep-request-propose-orchestrator.service";
import type { RepRequestDomain } from "@/lib/rep-requests/rep-request.types";

const VALID_DOMAINS: readonly RepRequestDomain[] = ["ORDER", "QUOTE", "PAYMENT"];

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const domain = typeof body.domain === "string" && VALID_DOMAINS.includes(body.domain as RepRequestDomain) ? (body.domain as RepRequestDomain) : null;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!domain) return fail("domain zorunludur.", 400);
    if (!message) return fail("message zorunludur.", 400);

    const report = await proposeRepRequest({ authContext, domain, message });

    return ok({ report });
  } catch (error) {
    return mapExecutionErrorToHttpResponse(error);
  }
}
