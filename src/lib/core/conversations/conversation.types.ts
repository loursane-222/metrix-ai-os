import type {
  Conversation,
  ConversationStatus,
  ConversationType,
  Message,
  MessageSenderType,
  Prisma,
} from "@prisma/client";

export type CreateConversationInput = {
  organizationId: string;
  createdBy?: string | null;
  title?: string | null;
  type?: ConversationType;
  status?: ConversationStatus;
};

export type CreateMessageInput = {
  conversationId: string;
  senderType: MessageSenderType;
  senderId?: string | null;
  content: string;
  metadata?: Prisma.InputJsonValue;
};

export type StartOnboardingConversationInput = {
  organizationId: string;
  actorUserId: string;
  title?: string | null;
};

export type AddUserMessageInput = {
  organizationId: string;
  conversationId: string;
  actorUserId: string;
  content: string;
  metadata?: Prisma.InputJsonValue;
};

export type AddAiMessageInput = {
  organizationId: string;
  conversationId: string;
  content: string;
  metadata?: Prisma.InputJsonValue;
};

export type ConversationResult = Conversation;

export type MessageResult = Message;
