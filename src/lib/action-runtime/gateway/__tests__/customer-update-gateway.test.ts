import { OrganizationRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

// customer-update-gateway.ts's default deps resolve productionExecutionRuntime,
// which transitively imports customer.service -> the real Prisma client (throws
// at import time without DATABASE_URL). Every test here injects its own
// executeAction, so the real runtime/Prisma are never actually invoked — but the
// import chain must still be stubbed for the module to load at all.
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import type { ActionExecutionRequest, ExecutionResult } from "../../execution";
import { computeNormalizedInputHash } from "../execution-request";
import { resolveExecutionPermissions } from "../execution-context";
import { executeCustomerUpdateGateway } from "../customer-update-gateway";

function buildAuthContext(role: OrganizationRole = OrganizationRole.MANAGER): AuthContext {
  return {
    user: { id: "user_1" } as AuthContext["user"],
    organization: { id: "org_1" } as AuthContext["organization"],
    membership: { role } as AuthContext["membership"],
    session: {
      id: "session_1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: new Date("2026-01-01T01:00:00.000Z"),
    } as AuthContext["session"],
  };
}

function fakeExecutionResult(): ExecutionResult {
  return Object.freeze({
    actionName: "customer.update",
    executionId: "exec_1",
    status: "SUCCESS",
    entityRef: { entityType: "customer", entityId: "cust_1" },
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:00.100Z",
    metadata: Object.freeze({ stagesCompleted: Object.freeze([]) }),
  });
}

describe("executeCustomerUpdateGateway", () => {
  it("builds an ActionExecutionRequest for customer.update from trusted server inputs only", async () => {
    const executeAction = vi.fn().mockResolvedValue(fakeExecutionResult());
    const authContext = buildAuthContext(OrganizationRole.MANAGER);

    await executeCustomerUpdateGateway(
      {
        authContext,
        customerId: "cust_1",
        patch: { displayName: "New Name" },
        expectedVersion: "2026-01-01T00:00:00.000Z",
        idempotencyKey: "idem_1",
        correlationId: "corr_1",
      },
      { executeAction },
    );

    expect(executeAction).toHaveBeenCalledTimes(1);
    const request = executeAction.mock.calls[0][0] as ActionExecutionRequest;

    expect(request.actionName).toBe("customer.update");
    expect(request.input).toEqual({
      customerId: "cust_1",
      expectedVersion: "2026-01-01T00:00:00.000Z",
      patch: { displayName: "New Name" },
    });
    expect(request.entityRef).toEqual({ entityType: "customer", entityId: "cust_1" });
    expect(request.idempotencyKey).toBe("idem_1");
    expect(request.correlationId).toBe("corr_1");
    expect(request.runtimeRiskContext?.changedFields).toEqual(["displayName"]);
  });

  it("derives executionContext strictly from AuthContext (actorId/organizationId/role/permissions/session)", async () => {
    const executeAction = vi.fn().mockResolvedValue(fakeExecutionResult());
    const authContext = buildAuthContext(OrganizationRole.OWNER);

    await executeCustomerUpdateGateway(
      {
        authContext,
        customerId: "cust_1",
        patch: { displayName: "New Name" },
        expectedVersion: "v1",
        idempotencyKey: "idem_1",
        correlationId: "corr_1",
      },
      { executeAction },
    );

    const request = executeAction.mock.calls[0][0] as ActionExecutionRequest;
    expect(request.executionContext).toEqual({
      actorId: "user_1",
      organizationId: "org_1",
      role: "OWNER",
      permissions: resolveExecutionPermissions(OrganizationRole.OWNER),
      sessionRef: "session_1",
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T01:00:00.000Z",
    });
  });

  it("never lets patch content override the trusted organizationId/entityRef", async () => {
    const executeAction = vi.fn().mockResolvedValue(fakeExecutionResult());
    const authContext = buildAuthContext();

    await executeCustomerUpdateGateway(
      {
        authContext,
        customerId: "cust_1",
        patch: { displayName: "New Name", organizationId: "org_HACKED", entityRef: { entityType: "x", entityId: "y" } },
        expectedVersion: "v1",
        idempotencyKey: "idem_1",
        correlationId: "corr_1",
      },
      { executeAction },
    );

    const request = executeAction.mock.calls[0][0] as ActionExecutionRequest;
    expect(request.executionContext.organizationId).toBe("org_1");
    expect(request.entityRef).toEqual({ entityType: "customer", entityId: "cust_1" });
  });

  it("computes normalizedInputHash the same way computeNormalizedInputHash would for identical fields", async () => {
    const executeAction = vi.fn().mockResolvedValue(fakeExecutionResult());
    const authContext = buildAuthContext();
    const patch = { displayName: "New Name" };

    await executeCustomerUpdateGateway(
      {
        authContext,
        customerId: "cust_1",
        patch,
        expectedVersion: "v1",
        idempotencyKey: "idem_1",
        correlationId: "corr_1",
      },
      { executeAction },
    );

    const request = executeAction.mock.calls[0][0] as ActionExecutionRequest;
    const expectedHash = computeNormalizedInputHash({
      actionName: "customer.update",
      input: { customerId: "cust_1", expectedVersion: "v1", patch },
      entityRef: { entityType: "customer", entityId: "cust_1" },
    });

    expect(request.normalizedInputHash).toBe(expectedHash);
  });

  it("returns whatever the injected executeAction resolves to", async () => {
    const result = fakeExecutionResult();
    const executeAction = vi.fn().mockResolvedValue(result);

    const returned = await executeCustomerUpdateGateway(
      {
        authContext: buildAuthContext(),
        customerId: "cust_1",
        patch: { displayName: "New Name" },
        expectedVersion: "v1",
        idempotencyKey: "idem_1",
        correlationId: "corr_1",
      },
      { executeAction },
    );

    expect(returned).toBe(result);
  });

  it("propagates a rejection from executeAction unchanged", async () => {
    const executeAction = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(
      executeCustomerUpdateGateway(
        {
          authContext: buildAuthContext(),
          customerId: "cust_1",
          patch: { displayName: "New Name" },
          expectedVersion: "v1",
          idempotencyKey: "idem_1",
          correlationId: "corr_1",
        },
        { executeAction },
      ),
    ).rejects.toThrow("boom");
  });
});
