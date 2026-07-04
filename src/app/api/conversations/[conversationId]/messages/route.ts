import { fail, ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import {
  findConversationByIdForOrganization,
  listMessagesByConversation,
} from "@/lib/core/conversations/conversation.repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { conversationId } = await context.params;

    const conversation = await findConversationByIdForOrganization(
      conversationId,
      authContext.organization.id,
    );

    if (!conversation) {
      return fail("Conversation not found.", 404);
    }

    const messages = await listMessagesByConversation(conversationId);

    return ok({
      messages: messages.map((message) => ({
        role: message.senderType === "USER" ? "user" : "metrix",
        content: message.content,
      })),
    });
  } catch (error: unknown) {
    return authFail(error);
  }
}
