import { describe, expect, it } from "vitest";
import { createExecutionRuntime, createInMemoryHandlerRegistry } from "../../../execution";
import { buildActionExecutionRequest, computeNormalizedInputHash } from "../../../gateway/execution-request";
import { createPolicyEngine } from "../../../policy";
import { actionRegistry } from "../../../registry";

function actor(organizationId = "org-1", actorId = "user-1") {
  return {
    actorId,
    organizationId,
    role: "OWNER",
    permissions: ["quotes.write"],
    sessionRef: "session-1",
    issuedAt: "2026-07-25T00:00:00.000Z",
    expiresAt: "2026-07-26T00:00:00.000Z",
  };
}

describe("lifecycle mutation approval contract", () => {
  it("requires a bound approval and executes the target once", async () => {
    const policy = createPolicyEngine();
    const handlers = createInMemoryHandlerRegistry();
    let mutations = 0;
    handlers.registerHandler("quote.set_lifecycle", () => {
      mutations++;
      return { status: "SUCCESS" };
    });
    const runtime = createExecutionRuntime({
      registry: actionRegistry,
      policyEngine: policy,
      handlerRegistry: handlers,
    });
    const input = { quoteId: "quote-1", status: "WON" };
    const entityRef = { entityType: "quote", entityId: "quote-1" };
    const normalizedInputHash = computeNormalizedInputHash({
      actionName: "quote.set_lifecycle",
      input,
      entityRef,
    });

    await expect(runtime.executeAction(buildActionExecutionRequest({
      actionName: "quote.set_lifecycle",
      input,
      entityRef,
      executionContext: actor(),
      idempotencyKey: "execution-1",
      correlationId: "correlation-1",
    }))).rejects.toThrow();
    expect(mutations).toBe(0);

    const decision = await policy.evaluatePolicy({
      actionName: "quote.set_lifecycle",
      actorContext: actor(),
      targetEntityRef: entityRef,
      normalizedInputHash,
      idempotencyKey: "approval-1",
      correlationId: "correlation-1",
    });
    const grant = await policy.grantApproval(decision.approvalRequest!.approvalId, "user-1");
    const request = buildActionExecutionRequest({
      actionName: "quote.set_lifecycle",
      input,
      entityRef,
      executionContext: actor(),
      approvalGrant: grant,
      idempotencyKey: "execution-2",
      correlationId: "correlation-1",
    });
    expect((await runtime.executeAction(request)).outcome).toBe("SUCCEEDED");
    expect(mutations).toBe(1);
    await expect(runtime.executeAction(request)).rejects.toThrow();
    expect(mutations).toBe(1);
  });

  it("rejects cross-organization and context-hash reuse", async () => {
    const policy = createPolicyEngine();
    const input = { quoteId: "quote-1", status: "LOST" };
    const entityRef = { entityType: "quote", entityId: "quote-1" };
    const hash = computeNormalizedInputHash({ actionName: "quote.set_lifecycle", input, entityRef });
    const decision = await policy.evaluatePolicy({
      actionName: "quote.set_lifecycle",
      actorContext: actor(),
      targetEntityRef: entityRef,
      normalizedInputHash: hash,
    });
    const grant = await policy.grantApproval(decision.approvalRequest!.approvalId, "user-1");

    expect((await policy.validateApprovalGrant(grant, {
      actionName: "quote.set_lifecycle",
      actorId: "user-1",
      organizationId: "org-2",
      targetEntityRef: entityRef,
      normalizedInputHash: hash,
    })).reasonCode).toBe("ORGANIZATION_MISMATCH");
    expect((await policy.validateApprovalGrant(grant, {
      actionName: "quote.set_lifecycle",
      actorId: "user-1",
      organizationId: "org-1",
      targetEntityRef: entityRef,
      normalizedInputHash: "different",
    })).reasonCode).toBe("INPUT_HASH_MISMATCH");
  });
});
