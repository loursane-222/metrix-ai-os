import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "quotes";

export const quoteActionDefinitions: ActionDefinition[] = [
  {
    actionName: "quote.create",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      customerId: { type: "string", required: true },
      title: { type: "string", required: true },
      // Residual Capability Parity Migration: was incorrectly declared
      // required — handleQuoteCreate (quote-create-handler.ts) only
      // validates amount IF present, never requires it, matching
      // offer-management-conversation-extension.ts's own deliberate design
      // (create a bare draft offer immediately, hand off to the Offer Edit
      // Living Workspace for pricing/items — see that file's own header
      // comment). Declaring it required here would force the Agent to
      // insist on a price upfront, a real regression from that design.
      amount: { type: "number", required: false },
      currency: { type: "string", required: false },
      paymentTermStructured: { type: "json", required: false },
    },
    riskLevelBase: "MEDIUM",
    requiredPermissionSet: ["quotes.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    // quote.set_lifecycle already exists and models exactly this — closing
    // a quote out as CANCELLED. Reused rather than adding a new action;
    // note it's EXPLICIT-approval, so compensating a quote.create always
    // pauses for a human, same as the domain's own forward policy for
    // ending a quote's lifecycle.
    compensationRef: "quote.set_lifecycle",
  },
  {
    actionName: "quote.update",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      quoteId: { type: "string", required: true },
      expectedVersion: { type: "string", required: true },
      patch: { type: "json", required: true },
    },
    riskLevelBase: "MEDIUM",
    requiredPermissionSet: ["quotes.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    // Self-compensating: replays its own action with a captured reverse
    // patch (see quote-update-handler.ts's compensationSnapshot).
    compensationRef: "quote.update",
  },
  {
    actionName: "quote.send",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      quoteId: { type: "string", required: true },
    },
    riskLevelBase: "MEDIUM",
    requiredPermissionSet: ["quotes.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
  {
    actionName: "quote.dispatch",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      quoteId: { type: "string", required: true },
    },
    riskLevelBase: "HIGH",
    requiredPermissionSet: ["quotes.write"],
    approvalPolicy: "EXPLICIT",
    approvalTtlClass: "SHORT",
    isReversible: false,
    compensationRef: null,
  },
  {
    actionName: "quote.set_lifecycle",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      quoteId: { type: "string", required: true },
      status: { type: "enum", required: true, enumValues: ["WON", "LOST", "CANCELLED"] },
    },
    riskLevelBase: "HIGH",
    requiredPermissionSet: ["quotes.write"],
    approvalPolicy: "EXPLICIT",
    approvalTtlClass: "SHORT",
    isReversible: false,
    compensationRef: null,
  },
];
