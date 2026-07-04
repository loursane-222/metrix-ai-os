import { generateAiResponse } from "@/lib/ai/orchestration.service";
import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  readJsonObject,
  requiredString,
} from "@/lib/api/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const response = await generateAiResponse({
      organizationId: requiredString(body, "organizationId"),
      conversationId: requiredString(body, "conversationId"),
      userMessage: requiredString(body, "userMessage"),
    });

    return ok(response);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return fail("Unexpected error.");
  }
}

