import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { listConversationsWithLastMessageByOrganization } from "@/lib/core/conversations/conversation.repository";

export async function GET(): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const conversations = await listConversationsWithLastMessageByOrganization(
      authContext.organization.id,
      "GENERAL",
      authContext.user.id,
    );

    const summaries = conversations
      .filter((conversation) => conversation.messages.length > 0)
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.title ?? "Yeni Konuşma",
        lastMessageAt: conversation.messages[0].createdAt.toISOString(),
      }))
      .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));

    return ok({ conversations: summaries });
  } catch (error: unknown) {
    return authFail(error);
  }
}
