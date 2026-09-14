import { db } from "../db";

export class ExecutiveConversationNotFoundError
  extends Error {
  readonly code = "CONVERSATION_NOT_FOUND";

  constructor() {
    super(
      "Conversation was not found for the authenticated user"
    );
    this.name =
      "ExecutiveConversationNotFoundError";
  }
}

export type ExecutiveConversationBinding = {
  id: string;
  userId: string;
  organizationId: string;
  openAiConversationId: string;
};

function requireIdentifier(
  value: string
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new ExecutiveConversationNotFoundError();
  }

  return normalized;
}

function toBinding(
  row: {
    id: string;
    userId: string;
    organizationId: string;
    openAiConversationId: string;
  }
): ExecutiveConversationBinding {
  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    openAiConversationId:
      row.openAiConversationId
  };
}

/**
 * Loads an existing conversation binding, scoped to the authenticated
 * actor and organization in one query. A conversation that does not
 * exist and a conversation that belongs to a different user/org are
 * indistinguishable on purpose — both throw the same stable error, so
 * the caller can never learn whether a foreign handle exists.
 */
export async function loadExecutiveConversationBinding(
  input: {
    conversationId: string;
    actorUserId: string;
    organizationId: string;
  }
): Promise<ExecutiveConversationBinding> {
  const conversationId =
    requireIdentifier(input.conversationId);

  const actorUserId =
    requireIdentifier(input.actorUserId);

  const organizationId =
    requireIdentifier(input.organizationId);

  const row =
    await db.executiveConversation.findFirst({
      where: {
        id: conversationId,
        userId: actorUserId,
        organizationId
      }
    });

  if (!row) {
    throw new ExecutiveConversationNotFoundError();
  }

  return toBinding(row);
}

export async function createExecutiveConversationBinding(
  input: {
    actorUserId: string;
    organizationId: string;
    openAiConversationId: string;
  }
): Promise<ExecutiveConversationBinding> {
  const row =
    await db.executiveConversation.create({
      data: {
        userId:
          requireIdentifier(input.actorUserId),
        organizationId:
          requireIdentifier(
            input.organizationId
          ),
        openAiConversationId:
          requireIdentifier(
            input.openAiConversationId
          )
      }
    });

  return toBinding(row);
}

export async function touchExecutiveConversationBinding(
  input: {
    conversationId: string;
  }
): Promise<void> {
  await db.executiveConversation.update({
    where: {
      id: requireIdentifier(
        input.conversationId
      )
    },
    data: {
      updatedAt: new Date()
    }
  });
}
