import { sendUserMessage } from "@/lib/application/conversations/conversation.service";
import { fail, ok } from "@/lib/api/response";
import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";
import { findConversationByIdForOrganization } from "@/lib/core/conversations/conversation.repository";
import {
  ApiValidationError,
  readJsonObject,
  requiredString,
} from "@/lib/api/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const conversationId = requiredString(body, "conversationId");

    const conversation = await findConversationByIdForOrganization(
      conversationId,
      authContext.organization.id,
      authContext.user.id,
    );

    if (!conversation) {
      return fail("Conversation not found.", 404);
    }

    const message = await sendUserMessage({
      organizationId: authContext.organization.id,
      conversationId,
      actorUserId: authContext.user.id,
      content: requiredString(body, "content"),
    });

    return ok(message);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }

    return authFail(error);
  }
}

