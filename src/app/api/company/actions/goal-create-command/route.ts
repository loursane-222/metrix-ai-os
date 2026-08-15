import { ok } from "@/lib/api/response";
import { readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { resolveCompanyGoalCreateCommand } from "@/lib/company/company-goal-create-command-resolver";
import { generateCompanyGoalCreateCommandText } from "@/lib/company/company-goal-create-command-ai-adapter";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const outcome = await resolveCompanyGoalCreateCommand({ utterance: requiredString(body, "utterance"), generateText: generateCompanyGoalCreateCommandText });
    return ok({ outcome });
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
