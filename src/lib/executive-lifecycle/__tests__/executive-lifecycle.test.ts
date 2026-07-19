import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { createApprovalService, createPolicyEngine } from "@/lib/action-runtime/policy";
import { decideApproval, listApprovalEnvelopes } from "../approval-decision-service";
import { isExecutiveLifecycleEnvelope } from "../executive-lifecycle.validation";
import type { ExecutiveLifecycleEnvelope } from "../executive-lifecycle.types";
import { createExecutiveLifecycleRegistry } from "../executive-lifecycle-registry";

const base = { envelopeId: "e1", timestamp: 1, correlationId: "c1", sessionId: "s1", summary: "real transition", status: "active" } as const;

describe("ExecutiveLifecycleEnvelope", () => {
  it.each<ExecutiveLifecycleEnvelope>([
    { ...base, source: "action", phase: "started", action: { executionId: "x" } },
    { ...base, source: "approval", phase: "awaiting_decision", approval: { approvalId: "a", actionName: "x", expiresAt: "2099-01-01", currentStatus: "PENDING" } },
    { ...base, source: "draft", phase: "created", draft: { draftId: "d" } },
    { ...base, source: "extraction", phase: "extracting", document: { documentId: "doc" } },
  ])("accepts the $source discriminated union", (envelope) => {
    expect(isExecutiveLifecycleEnvelope(envelope)).toBe(true);
  });

  it("rejects invalid source/phase pairs", () => {
    expect(isExecutiveLifecycleEnvelope({ ...base, source: "approval", phase: "extracting" })).toBe(false);
    expect(isExecutiveLifecycleEnvelope({ ...base, source: "document", phase: "approved" })).toBe(false);
  });
});

describe("ExecutiveLifecycleRegistry transport", () => {
  it("deduplicates, bounds retention and filters authority metadata", () => {
    const registry = createExecutiveLifecycleRegistry(2);
    const make = (id: string, actorId: string): ExecutiveLifecycleEnvelope => ({ ...base, envelopeId: id, source: "action", phase: "started", organizationId: "org-1", actorId, action: {} });
    registry.publish(make("one", "actor-1"));
    registry.publish(make("one", "actor-1"));
    registry.publish(make("two", "actor-2"));
    registry.publish(make("three", "actor-1"));
    expect(registry.snapshot().map((item) => item.envelopeId)).toEqual(["three", "two"]);
    expect(registry.snapshot({ organizationId: "org-1", actorId: "actor-1" }).map((item) => item.envelopeId)).toEqual(["three"]);
  });
});

function auth(actorId = "actor-1", organizationId = "org-1") {
  return { user: { id: actorId }, organization: { id: organizationId }, session: { id: "session-1" }, membership: {} } as AuthContext;
}

describe("approval decision service", () => {
  it("routes approve and reject through the real Approval Runtime", () => {
    const approvalService = createApprovalService({ clock: () => new Date("2026-01-01T00:00:00Z") });
    const engine = createPolicyEngine({ approvalService });
    const first = engine.createApprovalRequest({ actionName: "customer.archive", normalizedInputHash: "hash-1", actorId: "actor-1", organizationId: "org-1", approvalTtlClass: "STANDARD" });
    expect(listApprovalEnvelopes(auth(), engine)[0].approval.approvalId).toBe(first.approvalId);
    expect(decideApproval(auth(), { approvalId: first.approvalId, decision: "approve" }, engine)).toMatchObject({ phase: "approved", approval: { currentStatus: "GRANTED" } });
    expect(engine.getApprovalGrant(first.approvalId)).toMatchObject({ approvalId: first.approvalId, boundActorId: "actor-1", boundOrganizationId: "org-1" });

    const second = engine.createApprovalRequest({ actionName: "customer.archive", normalizedInputHash: "hash-2", actorId: "actor-1", organizationId: "org-1", approvalTtlClass: "STANDARD" });
    expect(decideApproval(auth(), { approvalId: second.approvalId, decision: "reject" }, engine)).toMatchObject({ phase: "rejected", approval: { currentStatus: "REVOKED" } });
  });

  it("rejects unauthorized and duplicate decisions deterministically", () => {
    const engine = createPolicyEngine({ approvalService: createApprovalService() });
    const request = engine.createApprovalRequest({ actionName: "customer.archive", normalizedInputHash: "hash", actorId: "actor-1", organizationId: "org-1", approvalTtlClass: "STANDARD" });
    expect(() => decideApproval(auth("actor-2"), { approvalId: request.approvalId, decision: "approve" }, engine)).toThrow("not authorized");
    decideApproval(auth(), { approvalId: request.approvalId, decision: "approve" }, engine);
    expect(() => decideApproval(auth(), { approvalId: request.approvalId, decision: "approve" }, engine)).toThrow("already granted");
  });

  it("does not approve an expired request", () => {
    let now = new Date("2026-01-01T00:00:00Z");
    const engine = createPolicyEngine({ approvalService: createApprovalService({ clock: () => now }) });
    const request = engine.createApprovalRequest({ actionName: "customer.archive", normalizedInputHash: "hash", actorId: "actor-1", organizationId: "org-1", approvalTtlClass: "SHORT" });
    now = new Date("2027-01-01T00:00:00Z");
    expect(() => decideApproval(auth(), { approvalId: request.approvalId, decision: "approve" }, engine)).toThrow("expired");
  });
});
