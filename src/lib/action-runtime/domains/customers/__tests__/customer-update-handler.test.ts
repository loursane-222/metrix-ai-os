import { describe, expect, it, vi, beforeEach } from "vitest";

const { updateCustomerWithVersionGuardMock } = vi.hoisted(() => ({
  updateCustomerWithVersionGuardMock: vi.fn(),
}));

vi.mock("@/lib/core/customers/customer.service", () => ({
  updateCustomerWithVersionGuard: updateCustomerWithVersionGuardMock,
}));

import { customerUpdateHandler } from "../customer-update-handler";
import { CustomerNotFoundError, CustomerUpdateInputError, CustomerVersionConflictError } from "../customer-update.errors";
import type { ActionExecutionEnvelope } from "../../../execution";

function buildEnvelope(overrides: Partial<ActionExecutionEnvelope> = {}): ActionExecutionEnvelope {
  return {
    executionId: "exec_1",
    actionName: "customer.update",
    input: {
      customerId: "cust_1",
      expectedVersion: "2026-01-01T00:00:00.000Z",
      patch: { displayName: "New Name" },
    },
    executionContext: {
      actorId: "actor_1",
      organizationId: "org_1",
      role: "EMPLOYEE",
      permissions: ["customers.write"],
      sessionRef: "session_1",
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T01:00:00.000Z",
    },
    idempotencyKey: "idem_1",
    startedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as ActionExecutionEnvelope;
}

describe("customerUpdateHandler", () => {
  beforeEach(() => {
    updateCustomerWithVersionGuardMock.mockReset();
  });

  it("calls the existing Customer service with the trusted tenant and actor context, not client input", async () => {
    updateCustomerWithVersionGuardMock.mockResolvedValue({
      outcome: "UPDATED",
      customer: { updatedAt: new Date("2026-01-02T00:00:00.000Z") },
    });

    await customerUpdateHandler(buildEnvelope());

    expect(updateCustomerWithVersionGuardMock).toHaveBeenCalledTimes(1);
    expect(updateCustomerWithVersionGuardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cust_1",
        organizationId: "org_1",
        updatedByUserId: "actor_1",
        displayName: "New Name",
        expectedUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    );
  });

  it("returns a deterministic SUCCESS HandlerResult with a CustomerUpdated domain event", async () => {
    updateCustomerWithVersionGuardMock.mockResolvedValue({
      outcome: "UPDATED",
      customer: { updatedAt: new Date("2026-01-02T00:00:00.000Z") },
    });

    const result = await customerUpdateHandler(buildEnvelope());

    expect(result.status).toBe("SUCCESS");
    expect(result.entityRef).toEqual({ entityType: "customer", entityId: "cust_1" });
    expect(result.sideEffects).toEqual([]);
    expect(result.domainEvents).toHaveLength(1);
    expect(result.domainEvents?.[0]).toEqual({
      eventType: "CustomerUpdated",
      aggregateType: "customer",
      aggregateId: "cust_1",
      schemaVersion: "1",
      payload: {
        customerId: "cust_1",
        changedFields: ["displayName"],
        previousVersion: "2026-01-01T00:00:00.000Z",
        newVersion: "2026-01-02T00:00:00.000Z",
        updatedByActorId: "actor_1",
      },
    });
  });

  it("does not leak the raw Customer/Prisma object in the result", async () => {
    updateCustomerWithVersionGuardMock.mockResolvedValue({
      outcome: "UPDATED",
      customer: {
        id: "cust_1",
        organizationId: "org_1",
        displayName: "New Name",
        phone: "+905551112233",
        email: "secret@example.com",
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    });

    const result = await customerUpdateHandler(buildEnvelope());

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("secret@example.com");
    expect(serialized).not.toContain("+905551112233");
    expect(serialized).not.toContain("organizationId");
  });

  it("computes changedFields from the patch keys only", async () => {
    updateCustomerWithVersionGuardMock.mockResolvedValue({
      outcome: "UPDATED",
      customer: { updatedAt: new Date("2026-01-02T00:00:00.000Z") },
    });

    const result = await customerUpdateHandler(
      buildEnvelope({ input: { customerId: "cust_1", expectedVersion: "2026-01-01T00:00:00.000Z", patch: { phone: "555", email: "a@b.com" } } }),
    );

    expect(result.metadata?.changedFields).toEqual(["phone", "email"]);
  });

  it("returns a NO_CHANGE result without a domain event when the patch is a no-op", async () => {
    updateCustomerWithVersionGuardMock.mockResolvedValue({ outcome: "NO_CHANGE", customer: {} });

    const result = await customerUpdateHandler(buildEnvelope());

    expect(result.status).toBe("SUCCESS");
    expect(result.resultOutcome).toBe("NO_CHANGE");
    expect(result.domainEvents).toEqual([]);
    expect(result.metadata).toEqual({ changedFields: [], noChange: true });
  });

  it("throws CustomerNotFoundError when the service reports NOT_FOUND", async () => {
    updateCustomerWithVersionGuardMock.mockResolvedValue({ outcome: "NOT_FOUND" });

    await expect(customerUpdateHandler(buildEnvelope())).rejects.toThrow(CustomerNotFoundError);
  });

  it("throws CustomerVersionConflictError when the service reports VERSION_CONFLICT", async () => {
    updateCustomerWithVersionGuardMock.mockResolvedValue({ outcome: "VERSION_CONFLICT" });

    await expect(customerUpdateHandler(buildEnvelope())).rejects.toThrow(CustomerVersionConflictError);
  });

  it("throws CustomerUpdateInputError for an empty patch without calling the service", async () => {
    await expect(
      customerUpdateHandler(
        buildEnvelope({ input: { customerId: "cust_1", expectedVersion: "2026-01-01T00:00:00.000Z", patch: {} } }),
      ),
    ).rejects.toThrow(CustomerUpdateInputError);

    expect(updateCustomerWithVersionGuardMock).not.toHaveBeenCalled();
  });

  it("throws CustomerUpdateInputError for an unknown field without calling the service", async () => {
    await expect(
      customerUpdateHandler(
        buildEnvelope({
          input: { customerId: "cust_1", expectedVersion: "2026-01-01T00:00:00.000Z", patch: { organizationId: "org_HACKED" } },
        }),
      ),
    ).rejects.toThrow(CustomerUpdateInputError);

    expect(updateCustomerWithVersionGuardMock).not.toHaveBeenCalled();
  });
});
