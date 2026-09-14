import {
  Agent,
  OpenAIConversationsSession,
  run
} from "@openai/agents";

import {
  createTaskCreateTool
} from "./tools/task-create-tool";

import {
  createTaskListTool
} from "./tools/task-list-tool";

import {
  createTaskUpdateTool
} from "./tools/task-update-tool";

import {
  createCustomerCreateTool
} from "./tools/customer-create-tool";

import {
  createCustomerLookupTool
} from "./tools/customer-lookup-tool";

import {
  createProductServiceLookupTool
} from "./tools/product-service-lookup-tool";

import {
  createQuoteCreateTool
} from "./tools/quote-create-tool";

import {
  createQuoteLookupTool
} from "./tools/quote-lookup-tool";

import {
  createQuoteUpdateTool
} from "./tools/quote-update-tool";

import {
  METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS,
  buildMetrixExecutiveBackendInstructions
} from "./metrix-executive-contract";

import type {
  MetrixExecutiveContext,
  MetrixExecutiveTurnInput,
  MetrixExecutiveTurnResult
} from "./types";

export function createMetrixExecutiveAgent(
  temporalContext?: {
    timezone: string;
    referenceTimeIso: string;
  }
) {
  return new Agent<MetrixExecutiveContext>({
    name: "METRIX",

    model: "gpt-5.6-sol",

    instructions: temporalContext
      ? buildMetrixExecutiveBackendInstructions(temporalContext)
      : METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS,

    tools: [
      createTaskCreateTool(),
      createTaskListTool(),
      createTaskUpdateTool(),
      createCustomerCreateTool(),
      createCustomerLookupTool(),
      createProductServiceLookupTool(),
      createQuoteCreateTool(),
      createQuoteLookupTool(),
      createQuoteUpdateTool()
    ]
  });
}

export async function runMetrixExecutiveTurn(
  input: MetrixExecutiveTurnInput
): Promise<MetrixExecutiveTurnResult> {
  const actorUserId =
    input.actorUserId.trim();

  const organizationId =
    input.organizationId.trim();

  const turnId =
    input.turnId.trim();

  const message =
    input.message.trim();

  if (
    !actorUserId ||
    !organizationId ||
    !turnId ||
    !message
  ) {
    throw new Error(
      "Invalid METRIX executive turn input"
    );
  }

  const timezone =
    input.timezone?.trim() ||
    "Europe/Istanbul";

  const referenceTimeIso =
    input.referenceTimeIso?.trim() ||
    new Date().toISOString();

  if (
    Number.isNaN(
      Date.parse(
        referenceTimeIso
      )
    )
  ) {
    throw new Error(
      "Invalid trusted reference time"
    );
  }

  const agent =
    createMetrixExecutiveAgent({
      timezone,
      referenceTimeIso
    });

  const openAiConversationId =
    input.openAiConversationId?.trim();

  const session =
    new OpenAIConversationsSession(
      openAiConversationId
        ? { conversationId: openAiConversationId }
        : {}
    );

  const result = await run(
    agent,
    message,
    {
      session,
      context: {
        actorUserId,
        organizationId,
        turnId,
        timezone,
        referenceTimeIso
      }
    }
  );

  const finalOutput =
    typeof result.finalOutput === "string"
      ? result.finalOutput
      : JSON.stringify(
          result.finalOutput ?? ""
        );

  const resolvedConversationId =
    await session.getSessionId();

  return {
    finalOutput,
    executionItems:
      result.newItems,
    openAiConversationId:
      resolvedConversationId
  };
}
