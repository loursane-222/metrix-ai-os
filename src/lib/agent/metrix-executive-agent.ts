import {
  Agent,
  OpenAIConversationsSession,
  run
} from "@openai/agents";

import { persistTextRunUsage } from "../platform/usage-telemetry";

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
  createCustomerUpdateTool
} from "./tools/customer-update-tool";

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
  createQuoteMarkWonTool
} from "./tools/quote-mark-won-tool";

import {
  createOrderCreateFromQuoteTool
} from "./tools/order-create-from-quote-tool";

import {
  createOrderLookupTool
} from "./tools/order-lookup-tool";

import {
  createInvoiceCreateFromOrderTool
} from "./tools/invoice-create-from-order-tool";

import {
  createInvoiceLookupTool
} from "./tools/invoice-lookup-tool";

import {
  createInvoiceReceivableLookupTool
} from "./tools/invoice-receivable-lookup-tool";

import {
  createReceivablesSummaryTool
} from "./tools/receivables-summary-tool";

import {
  createSalesSummaryTool
} from "./tools/sales-summary-tool";

import {
  createCollectionRecordTool
} from "./tools/collection-record-tool";

import {
  createCollectionLookupTool
} from "./tools/collection-lookup-tool";

import {
  createLocationCreateTool
} from "./tools/location-create-tool";

import {
  createLocationLookupTool
} from "./tools/location-lookup-tool";

import {
  createSupplierCreateTool
} from "./tools/supplier-create-tool";

import {
  createSupplierLookupTool
} from "./tools/supplier-lookup-tool";

import {
  createPurchaseRecordTool
} from "./tools/purchase-record-tool";

import {
  createInventoryTransferTool
} from "./tools/inventory-transfer-tool";

import {
  createTransformationRecordTool
} from "./tools/transformation-record-tool";

import {
  createInventoryLookupTool
} from "./tools/inventory-lookup-tool";
import { createCalendarTools } from "./tools/calendar-tools";

import { createMailSearchTool } from "./tools/mail-search-tool";

import { createMailReadTool } from "./tools/mail-read-tool";

import { createMailSendTool } from "./tools/mail-send-tool";

import { createIntegrationStatusTool } from "./tools/integration-status-tool";

import { createIntegrationConnectTool } from "./tools/integration-connect-tool";

import { createIntegrationDisconnectTool } from "./tools/integration-disconnect-tool";

import {
  createDocumentGenerateTool
} from "./tools/document-generate-tool";

import { createApprovalTools } from "./tools/approval-tools";

import { createNotificationTools } from "./tools/notification-tools";

import {
  METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS,
  buildMetrixExecutiveBackendInstructions
} from "./metrix-executive-contract";

import {
  beginToolCallCapture,
  canonicalResultsFromToolCalls,
  endToolCallCapture,
  type ToolCallCapture
} from "./tools/metrix-business-tool-runtime";

import {
  MetrixExecutiveTurnIncompleteError,
  committedMutationResults
} from "./turn-incomplete-error";

import type {
  MetrixExecutiveContext,
  MetrixExecutiveTurnInput,
  MetrixExecutiveTurnOrigin,
  MetrixExecutiveTurnResult
} from "./types";

/**
 * What the Executive may use when a trusted company event — not a person —
 * started the turn: every read of company truth, plus the single
 * notification. No business mutation and no connect flow: an unattended run
 * that reads external content (a mail) must never be able to change
 * company state. This narrows the ONE Executive's toolset; it adds no
 * second agent and no decision logic.
 */
export const SYSTEM_EVENT_TOOL_NAMES: ReadonlySet<string> = new Set([
  "task_list",
  "calendar_list",
  "mail_search",
  "mail_read",
  "integration_status",
  "customer_lookup",
  "product_service_lookup",
  "quote_lookup",
  "order_lookup",
  "invoice_lookup",
  "invoice_receivable_lookup",
  "receivables_summary",
  "sales_summary",
  "collection_lookup",
  "location_lookup",
  "supplier_lookup",
  "inventory_lookup",
  "approval_list",
  "notification_list",
  "notification_create"
]);

export function createMetrixExecutiveAgent(
  temporalContext?: {
    timezone: string;
    referenceTimeIso: string;
  },
  options: { origin?: MetrixExecutiveTurnOrigin } = {}
) {
  const systemEvent = options.origin === "SYSTEM_EVENT";

  const tools = [
      createTaskCreateTool(),
      createTaskListTool(),
      createTaskUpdateTool(),
      ...createCalendarTools(),
      createMailSearchTool(),
      createMailReadTool(),
      createMailSendTool(),
      createIntegrationStatusTool(),
      createIntegrationConnectTool(),
      createIntegrationDisconnectTool(),
      createCustomerCreateTool(),
      createCustomerLookupTool(),
      createCustomerUpdateTool(),
      createProductServiceLookupTool(),
      createQuoteCreateTool(),
      createQuoteLookupTool(),
      createQuoteUpdateTool(),
      createQuoteMarkWonTool(),
      createOrderCreateFromQuoteTool(),
      createOrderLookupTool(),
      createInvoiceCreateFromOrderTool(),
      createInvoiceLookupTool(),
      createInvoiceReceivableLookupTool(),
      createReceivablesSummaryTool(),
      createSalesSummaryTool(),
      createCollectionRecordTool(),
      createCollectionLookupTool(),
      createLocationCreateTool(),
      createLocationLookupTool(),
      createSupplierCreateTool(),
      createSupplierLookupTool(),
      createPurchaseRecordTool(),
      createInventoryTransferTool(),
      createTransformationRecordTool(),
      createInventoryLookupTool(),
      createDocumentGenerateTool(),
      ...createApprovalTools(),
      ...createNotificationTools()
    ];

  return new Agent<MetrixExecutiveContext>({
    name: "METRIX",

    model: "gpt-5.6-sol",

    instructions: temporalContext
      ? buildMetrixExecutiveBackendInstructions(temporalContext, options)
      : METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS,

    tools: systemEvent
      ? tools.filter(tool => SYSTEM_EVENT_TOOL_NAMES.has(tool.name))
      : tools
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

  const origin: MetrixExecutiveTurnOrigin =
    input.origin ?? "USER";

  const agent =
    createMetrixExecutiveAgent(
      {
        timezone,
        referenceTimeIso
      },
      { origin }
    );

  const openAiConversationId =
    input.openAiConversationId?.trim();

  // A system-event turn belongs to no chat: nothing is attached to (or
  // written into) a user's conversation, and nothing about the event is
  // kept in a stored conversation. A person's turn is unchanged.
  const session =
    origin === "SYSTEM_EVENT"
      ? undefined
      : new OpenAIConversationsSession(
          openAiConversationId
            ? { conversationId: openAiConversationId }
            : {}
        );

  const toolCallScope = `turn:${turnId}`;

  beginToolCallCapture(toolCallScope);

  // The capture buffer is always closed, whether run() returns or throws.
  // What it recorded is kept in `toolCalls` so a failure that happens AFTER
  // a verified mutation (the model's next call, session writes) can still be
  // reported as committed instead of looking like nothing happened.
  let toolCalls: ToolCallCapture[] = [];

  try {
    let result;

    try {
      result = await run(
        agent,
        message,
        {
          ...(session ? { session } : {}),
          context: {
            actorUserId,
            organizationId,
            turnId,
            timezone,
            referenceTimeIso
          }
        }
      );
    } finally {
      toolCalls = endToolCallCapture(toolCallScope);
    }

    const capabilityResults = canonicalResultsFromToolCalls(toolCalls);

    const finalOutput =
      typeof result.finalOutput === "string"
        ? result.finalOutput
        : JSON.stringify(
            result.finalOutput ?? ""
          );

    const resolvedConversationId =
      session ? await session.getSessionId() : "";

    persistTextRunUsage({
      userId: actorUserId,
      organizationId,
      turnId,
      rawResponses: result.rawResponses
    });

    return {
      finalOutput,
      executionItems:
        result.newItems,
      toolCalls,
      capabilityResults,
      openAiConversationId:
        resolvedConversationId
    };
  } catch (error) {
    const committed = committedMutationResults(
      canonicalResultsFromToolCalls(toolCalls)
    );

    // No verified mutation: the ordinary exception, unchanged.
    if (committed.length === 0) throw error;

    throw new MetrixExecutiveTurnIncompleteError({
      cause: error,
      capabilityResults: committed
    });
  }
}
