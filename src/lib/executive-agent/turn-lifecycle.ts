/** Server-side turn preparation and canonical persistence boundary.
 * Authentication, transport identity creation and delivery ordering stay with
 * the caller. These exports neither start a model nor schedule extra writes.
 */
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import type { ConversationHistoryTurn } from "@/lib/ai/providers/ai-provider";
import type { ExecutiveAgentRunContext } from "./types";
import {
  findLastAiMessageByConversation,
  listRecentMessagesByConversation,
} from "@/lib/core/conversations/conversation.repository";

// Direct aliases preserve the original promise, errors, IDs, roles and metadata.
export {
  resolveChatConversation as resolveExecutiveConversation,
  sendUserMessage as persistCanonicalUserTurn,
  sendAiMessage as persistCanonicalAssistantTurn,
} from "@/lib/application/conversations/conversation.service";
export { buildOrganizationSummary } from "@/lib/core/organizations/organization-summary";

export function prepareExecutiveTurnContext(input: {
  authContext: AuthContext;
  channel: "voice" | "text";
  conversationId: string;
  requestId: string;
  correlationId: string;
  activeDocumentAttachment: ExecutiveAgentRunContext["activeDocumentAttachment"];
  activeWorkspaceContext: ExecutiveAgentRunContext["activeWorkspaceContext"];
  message: string;
}): ExecutiveAgentRunContext {
  const { authContext, channel, conversationId, requestId, correlationId,
    activeDocumentAttachment, activeWorkspaceContext, message } = input;
  return {
    organizationId: authContext.organization.id,
    actorId: authContext.user.id,
    organizationName: authContext.organization.name,
    role: authContext.membership.role,
    timeZone: authContext.user.timezone,
    channel: channel === "voice" ? "voice" : "written",
    conversationId,
    requestId,
    correlationId,
    authContext,
    activeDocumentAttachment,
    activeWorkspaceContext,
    currentTurnMessage: message,
  };
}

export function loadExecutiveConversationHistory(input: {
  conversationId: string;
  organizationId: string;
  limit: number;
}): Promise<[
  Awaited<ReturnType<typeof findLastAiMessageByConversation>>,
  Awaited<ReturnType<typeof listRecentMessagesByConversation>>,
]> {
  return Promise.all([
        findLastAiMessageByConversation(input.conversationId, input.organizationId),
        listRecentMessagesByConversation(input.conversationId, input.limit, input.organizationId),
      ]);
}

export function buildExecutiveConversationHistory(
  messages: readonly { senderType: string; content: string }[],
): ConversationHistoryTurn[] {
  return messages
    .filter((m) => m.senderType === "USER" || m.senderType === "AI")
    .map((m) => ({
      role: m.senderType === "AI" ? "assistant" as const : "user" as const,
      content: m.content,
    }));
}
