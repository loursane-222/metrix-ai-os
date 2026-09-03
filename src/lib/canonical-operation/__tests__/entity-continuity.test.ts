import { describe, expect, it, beforeAll, vi } from "vitest";

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})) },
}));

import { bootstrapCapabilityRegistry } from "../capabilities";
import { resolveContinuityEntity } from "../entity-continuity";
import { buildLastSuccessfulOperationContext } from "@/lib/conversations/last-operation-context";
import type { ConversationExtensionHandoff } from "@/lib/conversation-extensions/conversation-extension-handoff";

function executedCustomerHandoff(entityId: string, entityDisplayName: string): ConversationExtensionHandoff {
  return {
    operation: "UPDATE",
    outcomeCode: "CUSTOMER_UPDATE_EXECUTED",
    resultStatus: "EXECUTED",
    entityResolution: "RESOLVED",
    entityDomain: "customers",
    entityId,
    entityDisplayName,
    candidateNames: [],
    fieldNames: [],
    mutationPerformed: true,
    navigationRequested: false,
    navigationStatus: "NOT_REQUESTED",
    approvalRequired: false,
  } as unknown as ConversationExtensionHandoff;
}

describe("resolveContinuityEntity", () => {
  beforeAll(() => {
    bootstrapCapabilityRegistry();
  });

  it("an explicit entity on the current turn always wins — continuity is never even consulted", () => {
    const result = resolveContinuityEntity({ explicitEntityId: "cust-beta", capability: "customer.update", previousContext: null });
    expect(result).toEqual({ status: "RESOLVED", entityType: "customer", entityId: "cust-beta", source: "EXPLICIT" });
  });

  it("Turn 1 EXECUTED customer.update -> Turn 2 no explicit reference -> reuses the same canonical customer entity", () => {
    const handoff = executedCustomerHandoff("cust-atlas", "Atlas");
    const previousContext = buildLastSuccessfulOperationContext(handoff, { sourceMessageId: "msg-1", organizationId: "org-1" });
    const result = resolveContinuityEntity({ explicitEntityId: null, capability: "customer.update", previousContext });
    expect(result).toEqual({ status: "RESOLVED", entityType: "customer", entityId: "cust-atlas", source: "CONTINUITY" });
  });

  it("an explicit different entity always overrides the prior continuity context", () => {
    const handoff = executedCustomerHandoff("cust-atlas", "Atlas");
    const previousContext = buildLastSuccessfulOperationContext(handoff, { sourceMessageId: "msg-1", organizationId: "org-1" });
    const result = resolveContinuityEntity({ explicitEntityId: "cust-beta", capability: "customer.update", previousContext });
    expect(result).toEqual({ status: "RESOLVED", entityType: "customer", entityId: "cust-beta", source: "EXPLICIT" });
  });

  it("a domain change never carries the prior entity over — asks for clarification instead of guessing", () => {
    const handoff = executedCustomerHandoff("cust-atlas", "Atlas");
    const previousContext = buildLastSuccessfulOperationContext(handoff, { sourceMessageId: "msg-1", organizationId: "org-1" });
    // "Bir de bana yarın toplantı koy." -> calendar.create, unrelated domain to the prior customer context.
    const result = resolveContinuityEntity({ explicitEntityId: null, capability: "calendar.create", previousContext });
    expect(result.status).toBe("CLARIFICATION_REQUIRED");
  });

  it("no prior context at all -> NOT_APPLICABLE, never a guess", () => {
    const result = resolveContinuityEntity({ explicitEntityId: null, capability: "customer.update", previousContext: null });
    expect(result).toEqual({ status: "NOT_APPLICABLE" });
  });

  it("a FAILED prior operation never produces a reusable continuity context (via buildLastSuccessfulOperationContext's own gate)", () => {
    const failedHandoff: ConversationExtensionHandoff = {
      ...executedCustomerHandoff("cust-atlas", "Atlas"),
      resultStatus: "FAILED",
      mutationPerformed: false,
    };
    const previousContext = buildLastSuccessfulOperationContext(failedHandoff, { sourceMessageId: "msg-1", organizationId: "org-1" });
    expect(previousContext).toBeNull();
    const result = resolveContinuityEntity({ explicitEntityId: null, capability: "customer.update", previousContext });
    expect(result).toEqual({ status: "NOT_APPLICABLE" });
  });

  it("an unregistered capability never fabricates a continuity match", () => {
    const handoff = executedCustomerHandoff("cust-atlas", "Atlas");
    const previousContext = buildLastSuccessfulOperationContext(handoff, { sourceMessageId: "msg-1", organizationId: "org-1" });
    const result = resolveContinuityEntity({ explicitEntityId: null, capability: "not.a.real.capability", previousContext });
    expect(result).toEqual({ status: "NOT_APPLICABLE" });
  });
});
