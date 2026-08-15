import { ok } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { resolveCompanyProfileEditCommand } from "@/lib/company/company-profile-edit-command-resolver";
import { generateCompanyProfileEditCommandText } from "@/lib/company/company-profile-edit-command-ai-adapter";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const outcome = await resolveCompanyProfileEditCommand({ utterance: requiredString(body, "utterance"), activeTab: requiredString(body, "activeTab"), generateText: generateCompanyProfileEditCommandText });
    return ok({ outcome });
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
