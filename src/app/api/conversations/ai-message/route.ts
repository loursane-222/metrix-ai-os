import { sendAiMessage } from "@/lib/application/conversations/conversation.service";
import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  readJsonObject,
  requiredString,
} from "@/lib/api/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const message = await sendAiMessage({
      organizationId: requiredString(body, "organizationId"),
      conversationId: requiredString(body, "conversationId"),
      content: requiredString(body, "content"),
    });

    return ok(message);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return fail("Unexpected error.");
  }
}

