import { generateAiResponse } from "@/lib/ai/orchestration.service";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  readJsonObject,
  requiredString,
} from "@/lib/api/validation";

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return fail("Not found.", 404);
  }

  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const response = await generateAiResponse({
      organizationId: authContext.organization.id,
      conversationId: requiredString(body, "conversationId"),
      userMessage: requiredString(body, "userMessage"),
    });

    return ok(response);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}
