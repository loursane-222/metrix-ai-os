import { describe, expect, it } from "vitest";
import { buildLastSuccessfulOperationContext, readLastSuccessfulOperationContext } from "../last-operation-context";
import type { ConversationExtensionHandoff } from "@/lib/conversation-extensions/conversation-extension-handoff";

function handoff(overrides: Partial<ConversationExtensionHandoff>): ConversationExtensionHandoff {
  return {
    domain: "customers", operation: "UPDATE", outcomeCode: "TEST", resultStatus: "EXECUTED",
    entityResolution: "RESOLVED", operationId: null, fieldNames: [], fieldCount: 0,
    mutationPerformed: true, navigationRequested: false, navigationStatus: "NOT_REQUESTED",
    failureCode: null, approvalRequired: false, certainty: "CERTAIN", captureOutcome: "NONE",
    candidateNames: [], entityId: "cust-1", entityDisplayName: "Atlas", entityDomain: "customers",
    ...overrides,
  };
}

describe("lastSuccessfulOperationContext", () => {
  const input = { sourceMessageId: "message-1", organizationId: "org-1", now: new Date("2026-09-03T12:00:00.000Z") };

  it("builds a context from a successful mutation with an entity", () => {
    const context = buildLastSuccessfulOperationContext(handoff({}), input);
    expect(context).toMatchObject({
      version: "v1", operation: "UPDATE", domain: "customers", entityId: "cust-1",
      entityDisplayName: "Atlas", sourceMessageId: "message-1", organizationId: "org-1",
      occurredAt: "2026-09-03T12:00:00.000Z",
    });
  });

  it("round-trips through metadata", () => {
    const context = buildLastSuccessfulOperationContext(handoff({}), input);
    const read = readLastSuccessfulOperationContext({ lastSuccessfulOperationContext: context });
    expect(read).toEqual(context);
  });

  it("returns null for a null handoff (no operation this turn)", () => {
    expect(buildLastSuccessfulOperationContext(null, input)).toBeNull();
  });

  it("returns null when the result wasn't EXECUTED", () => {
    expect(buildLastSuccessfulOperationContext(handoff({ resultStatus: "APPROVAL_REQUIRED" }), input)).toBeNull();
  });

  it("returns null when no mutation was actually performed", () => {
    expect(buildLastSuccessfulOperationContext(handoff({ mutationPerformed: false }), input)).toBeNull();
  });

  it("returns null when entityId is missing", () => {
    expect(buildLastSuccessfulOperationContext(handoff({ entityId: null }), input)).toBeNull();
  });

  it("returns null when entityDomain is missing (e.g. an unmapped orchestration domain)", () => {
    expect(buildLastSuccessfulOperationContext(handoff({ entityDomain: null }), input)).toBeNull();
  });

  it("reads back null for absent or malformed metadata", () => {
    expect(readLastSuccessfulOperationContext(undefined)).toBeNull();
    expect(readLastSuccessfulOperationContext({})).toBeNull();
    expect(readLastSuccessfulOperationContext({ lastSuccessfulOperationContext: { version: "v2" } })).toBeNull();
  });
});
