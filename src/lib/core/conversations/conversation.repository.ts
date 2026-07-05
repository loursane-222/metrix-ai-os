import { prisma } from "@/lib/core/shared/prisma";

import type { ConversationType } from "@prisma/client";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import type {
  ConversationResult,
  CreateConversationInput,
  CreateMessageInput,
  MessageResult,
} from "./conversation.types";

export async function createConversation(
  input: CreateConversationInput,
  tx?: PrismaTransactionClient,
): Promise<ConversationResult> {
  const client = tx ?? prisma;

  return client.conversation.create({
    data: {
      organizationId: input.organizationId,
      createdBy: input.createdBy,
      title: input.title,
      type: input.type,
      status: input.status,
    },
  });
}

export async function findConversationById(
  id: string,
): Promise<ConversationResult | null> {
  return prisma.conversation.findUnique({
    where: {
      id,
    },
  });
}

export async function findConversationByIdForOrganization(
  id: string,
  organizationId: string,
  userId: string,
): Promise<ConversationResult | null> {
  return prisma.conversation.findFirst({
    where: {
      id,
      organizationId,
      createdBy: userId,
    },
  });
}

export async function listConversationsByOrganization(
  organizationId: string,
): Promise<ConversationResult[]> {
  return prisma.conversation.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function listConversationsWithLastMessageByOrganization(
  organizationId: string,
  type: ConversationType,
  userId: string,
): Promise<Array<ConversationResult & { messages: MessageResult[] }>> {
  return prisma.conversation.findMany({
    where: {
      organizationId,
      type,
      createdBy: userId,
    },
    include: {
      messages: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });
}

export async function createMessage(
  input: CreateMessageInput,
  tx?: PrismaTransactionClient,
): Promise<MessageResult> {
  const client = tx ?? prisma;

  return client.message.create({
    data: {
      conversationId: input.conversationId,
      senderType: input.senderType,
      senderId: input.senderId,
      content: input.content,
      metadata: input.metadata,
    },
  });
}

export async function listMessagesByConversation(
  conversationId: string,
): Promise<MessageResult[]> {
  return prisma.message.findMany({
    where: {
      conversationId,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function findLastAiMessageByConversation(
  conversationId: string,
): Promise<MessageResult | null> {
  return prisma.message.findFirst({
    where: {
      conversationId,
      senderType: "AI",
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function findBriefingConversationByDate(
  organizationId: string,
  briefingDate: string,
): Promise<ConversationResult | null> {
  return prisma.conversation.findFirst({
    where: {
      organizationId,
      type: "BRIEFING",
      title: briefingDate,
    },
  });
}

export async function findLatestBriefingConversation(
  organizationId: string,
): Promise<ConversationResult | null> {
  return prisma.conversation.findFirst({
    where: {
      organizationId,
      type: "BRIEFING",
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
