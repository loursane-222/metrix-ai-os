import type { Prisma } from "@prisma/client";

import type {
  ConversationResult,
  MessageResult,
} from "@/lib/core/conversations/conversation.types";

export type SendUserMessageInput = {
  organizationId: string;
  conversationId: string;
  actorUserId: string;
  content: string;
  metadata?: Prisma.InputJsonValue;
};

export type SendAiMessageInput = {
  organizationId: string;
  conversationId: string;
  content: string;
  metadata?: Prisma.InputJsonValue;
};

export type ResolveChatConversationInput = {
  organizationId: string;
  userId: string;
  message: string;
  conversationId?: string;
};

export type SendMessageResult = MessageResult;

export type ResolveChatConversationResult = ConversationResult;
