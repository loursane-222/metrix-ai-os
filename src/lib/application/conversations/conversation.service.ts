import {
  addAiMessage,
  addUserMessage,
} from "@/lib/core/conversations/conversation.service";
import {
  createConversation,
  findConversationByIdForOrganization,
} from "@/lib/core/conversations/conversation.repository";

import type {
  ResolveChatConversationInput,
  ResolveChatConversationResult,
  SendAiMessageInput,
  SendMessageResult,
  SendUserMessageInput,
} from "./conversation.types";

const CHAT_TITLE_MAX_LENGTH = 64;

export async function sendUserMessage(
  input: SendUserMessageInput,
): Promise<SendMessageResult> {
  return addUserMessage(input);
}

export async function sendAiMessage(
  input: SendAiMessageInput,
): Promise<SendMessageResult> {
  return addAiMessage(input);
}

export async function resolveChatConversation(
  input: ResolveChatConversationInput,
): Promise<ResolveChatConversationResult | null> {
  if (input.conversationId) {
    return findConversationByIdForOrganization(
      input.conversationId,
      input.organizationId,
    );
  }

  return createConversation({
    organizationId: input.organizationId,
    createdBy: input.userId,
    title: buildConversationTitle(input.message),
    type: "GENERAL",
    status: "OPEN",
  });
}

function buildConversationTitle(message: string): string {
  const normalizedMessage = message.trim().replace(/\s+/g, " ");

  if (normalizedMessage.length <= CHAT_TITLE_MAX_LENGTH) {
    return normalizedMessage;
  }

  return `${normalizedMessage.slice(0, CHAT_TITLE_MAX_LENGTH - 3).trim()}...`;
}
