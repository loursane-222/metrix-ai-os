import { ok } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { resolveCompanySourceCreateCommand } from "@/lib/company/company-source-create-command-resolver";
import { generateCompanySourceCreateCommandText } from "@/lib/company/company-source-create-command-ai-adapter";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const outcome = await resolveCompanySourceCreateCommand({ utterance: requiredString(body, "utterance"), generateText: generateCompanySourceCreateCommandText });
    return ok({ outcome });
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
