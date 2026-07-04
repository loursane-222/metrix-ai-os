import {
  AI_MESSAGE_CREATED,
  ONBOARDING_STARTED,
  USER_MESSAGE_CREATED,
} from "@/lib/core/events/event-names";
import { recordEvent } from "@/lib/core/events/event.service";
import { prisma } from "@/lib/core/shared/prisma";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import {
  createConversation,
  createMessage,
} from "./conversation.repository";

import type {
  AddAiMessageInput,
  AddUserMessageInput,
  ConversationResult,
  MessageResult,
  StartOnboardingConversationInput,
} from "./conversation.types";

const CONTENT_PREVIEW_LENGTH = 120;

function createContentPreview(content: string): string {
  return content.slice(0, CONTENT_PREVIEW_LENGTH);
}

export async function startOnboardingConversation(
  input: StartOnboardingConversationInput,
  tx?: PrismaTransactionClient,
): Promise<ConversationResult> {
  if (tx) {
    return startOnboardingConversationInTransaction(input, tx);
  }

  return prisma.$transaction((transactionClient) =>
    startOnboardingConversationInTransaction(input, transactionClient),
  );
}

export async function addUserMessage(
  input: AddUserMessageInput,
): Promise<MessageResult> {
  return prisma.$transaction(async (tx) => {
    const message = await createMessage(
      {
        conversationId: input.conversationId,
        senderType: "USER",
        senderId: input.actorUserId,
        content: input.content,
        metadata: input.metadata,
      },
      tx,
    );

    await recordEvent(
      {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        eventType: USER_MESSAGE_CREATED,
        entityType: "Message",
        entityId: message.id,
        payload: {
          conversationId: input.conversationId,
          messageId: message.id,
          contentPreview: createContentPreview(message.content),
        },
        source: "USER",
      },
      tx,
    );

    return message;
  });
}

export async function addAiMessage(
  input: AddAiMessageInput,
): Promise<MessageResult> {
  return prisma.$transaction(async (tx) => {
    const message = await createMessage(
      {
        conversationId: input.conversationId,
        senderType: "AI",
        senderId: null,
        content: input.content,
        metadata: input.metadata,
      },
      tx,
    );

    await recordEvent(
      {
        organizationId: input.organizationId,
        eventType: AI_MESSAGE_CREATED,
        entityType: "Message",
        entityId: message.id,
        payload: {
          conversationId: input.conversationId,
          messageId: message.id,
          contentPreview: createContentPreview(message.content),
        },
        source: "AI",
      },
      tx,
    );

    return message;
  });
}

async function startOnboardingConversationInTransaction(
  input: StartOnboardingConversationInput,
  tx: PrismaTransactionClient,
): Promise<ConversationResult> {
  const conversation = await createConversation(
    {
      organizationId: input.organizationId,
      createdBy: input.actorUserId,
      title: input.title,
      type: "ONBOARDING",
      status: "OPEN",
    },
    tx,
  );

  await recordEvent(
    {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      eventType: ONBOARDING_STARTED,
      entityType: "Conversation",
      entityId: conversation.id,
      payload: {
        conversationId: conversation.id,
        title: conversation.title,
      },
      source: "USER",
    },
    tx,
  );

  return conversation;
}
