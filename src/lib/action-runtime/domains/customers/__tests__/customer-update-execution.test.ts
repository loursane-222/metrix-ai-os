import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCustomerByIdMock, updateCustomerMock } = vi.hoisted(() => ({
  getCustomerByIdMock: vi.fn(),
  updateCustomerMock: vi.fn(),
}));

vi.mock("@/lib/core/customers/customer.repository", () => ({
  getCustomerById: getCustomerByIdMock,
  updateCustomer: updateCustomerMock,
  createCustomer: vi.fn(),
  findCustomerByIdentity: vi.fn(),
  listCustomersForOrganization: vi.fn(),
  archiveCustomer: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

import { actionRegistry } from "../../../registry";
import type { ActionDefinition } from "../../../registry/action-registry.types";
import { createPolicyEngine } from "../../../policy";
import { createInMemoryOperationStore } from "../../../operation";
import { createInMemoryAuditStore } from "../../../audit";
import { createInMemoryOutboxStore } from "../../../outbox";
import { createExecutionRuntime } from "../../../execution";
import type { ExecutionActionRegistry, ExecutionContext } from "../../../execution";
import { ApprovalRequiredError, ExecutionFailedError, PolicyDeniedError } from "../../../execution";
import { registerCustomerActions } from "../register-customer-actions";
import { buildCustomerUpdateRuntimeRiskContext } from "../customer-update.types";
import { CustomerNotFoundError, CustomerVersionConflictError } from "../customer-update.errors";

type CustomerRecord = {
  id: string;
  organizationId: string;
  displayName: string;
  legalName: string | null;
  phone: string | null;
  email: string | null;
  balanceCents: bigint;
  currency: string;
  tier: string | null;
  healthScore: number | null;
  metrixNote: string | null;
  status: string;
  cariKodu: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  mersisNo: string | null;
  tradeRegistryNo: string | null;
  billingAddress: Record<string, unknown> | null;
  shippingAddress: Record<string, unknown> | null;
  eInvoiceEnabled: boolean;
  eArchiveEnabled: boolean;
  source: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function buildCustomerRecord(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: "cust_1",
    organizationId: "org_1",
    displayName: "Acme Ltd",
    legalName: null,
    phone: "+905551112233",
    email: "acme@example.com",
    balanceCents: BigInt(0),
    currency: "TRY",
    tier: null,
    healthScore: null,
    metrixNote: null,
    status: "ACTIVE",
    cariKodu: null,
    taxNumber: null,
    taxOffice: null,
    mersisNo: null,
    tradeRegistryNo: null,
    billingAddress: null,
    shippingAddress: null,
    eInvoiceEnabled: false,
    eArchiveEnabled: false,
    source: "MANUAL",
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function buildActionDefinition(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    ...actionRegistry.getActionDefinition("customer.update"),
    ...overrides,
  };
}

function buildFakeRegistry(definitions: ActionDefinition[]): ExecutionActionRegistry {
  const byName = new Map(definitions.map((definition) => [definition.actionName, definition]));
  return {
    getActionDefinition(actionName: string) {
      const definition = byName.get(actionName);
      if (!definition) {
        throw new Error(`Action "${actionName}" was not found.`);
      }
      return definition;
    },
  };
}

function buildExecutionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    actorId: "actor_1",
    organizationId: "org_1",
    role: "EMPLOYEE",
    permissions: ["customers.write"],
    sessionRef: "session_1",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T01:00:00.000Z",
    ...overrides,
  };
}

function setupRuntime(definitions: ActionDefinition[] = [buildActionDefinition()], clock?: () => Date) {
  const registry = buildFakeRegistry(definitions);
  const policy = createPolicyEngine({ registry });
  const operationStore = createInMemoryOperationStore({ clock });
  const auditStore = createInMemoryAuditStore({ clock });
  const outboxStore = createInMemoryOutboxStore({ clock });
  const runtime = createExecutionRuntime({
    registry,
    policyEngine: policy,
    operationStore,
    auditStore,
    outboxStore,
    clock,
  });

  registerCustomerActions(runtime.getHandlerRegistry());

  return { registry, policy, operationStore, auditStore, outboxStore, runtime };
}

function buildRequest(overrides: Record<string, unknown> = {}) {
  return {
    actionName: "customer.update",
    input: {
      customerId: "cust_1",
      expectedVersion: "2026-01-01T00:00:00.000Z",
      patch: { displayName: "New Name" },
    },
    executionContext: buildExecutionContext(),
    idempotencyKey: "idem_1",
    normalizedInputHash: "hash_1",
    correlationId: "corr_1",
    runtimeRiskContext: buildCustomerUpdateRuntimeRiskContext({ displayName: "New Name" }),
    ...overrides,
  };
}

describe("customer.update — real ActionDefinition compatibility", () => {
  it("matches the real handler input shape (customerId, patch, expectedVersion)", () => {
    const definition = actionRegistry.getActionDefinition("customer.update");

    expect(definition.actionClass).toBe("DOMAIN");
    expect(Object.keys(definition.inputSchema).sort()).toEqual(["customerId", "expectedVersion", "patch"].sort());
    expect(definition.inputSchema.customerId).toEqual({ type: "string", required: true });
    expect(definition.inputSchema.patch).toEqual({ type: "json", required: true });
    expect(definition.inputSchema.expectedVersion).toEqual({ type: "string", required: true });
  });
});

describe("customer.update execution — success", () => {
  beforeEach(() => {
    getCustomerByIdMock.mockReset();
    updateCustomerMock.mockReset();
  });

  it("runs the full production chain and applies a real Customer mutation", async () => {
    const existing = buildCustomerRecord();
    const updated = buildCustomerRecord({ displayName: "New Name", updatedAt: new Date("2026-01-02T00:00:00.000Z") });

    getCustomerByIdMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
    updateCustomerMock.mockResolvedValue(1);

    const { runtime, operationStore, auditStore, outboxStore } = setupRuntime();

    const result = await runtime.executeAction(buildRequest());

    expect(result.status).toBe("SUCCESS");
    expect(updateCustomerMock).toHaveBeenCalledTimes(1);

    const operations = operationStore.listByCorrelationId("corr_1");
    expect(operations[0].coreStatus).toBe("SUCCEEDED");
    expect(operations[0].finalState).toBe("COMPLETED_WITH_PENDING_SIDE_EFFECT");

    const actionResultAudit = auditStore
      .listByExecution(result.executionId)
      .find((audit) => audit.recordType === "ACTION_RESULT");
    expect(actionResultAudit?.outcome).toBe("SUCCEEDED");

    const events = outboxStore.listByOperation(operations[0].operationId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("CustomerUpdated");
    expect(events[0].effectType).toBe("DOMAIN_EVENT");
  });

  it("does not leak sensitive field values in the CustomerUpdated outbox payload", async () => {
    const existing = buildCustomerRecord();
    const updated = buildCustomerRecord({
      displayName: "New Name",
      phone: "+905559998877",
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    getCustomerByIdMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
    updateCustomerMock.mockResolvedValue(1);

    const { runtime, operationStore, outboxStore } = setupRuntime();

    await runtime.executeAction(
      buildRequest({
        input: { customerId: "cust_1", expectedVersion: "2026-01-01T00:00:00.000Z", patch: { displayName: "New Name", phone: "+905559998877" } },
      }),
    );

    const operations = operationStore.listByCorrelationId("corr_1");
    const event = outboxStore.listByOperation(operations[0].operationId)[0];
    const serializedPayload = JSON.stringify(event.payload);

    expect(event.payload.changedFields).toEqual(["displayName", "phone"]);
    expect(serializedPayload).not.toContain("New Name");
    expect(serializedPayload).not.toContain("+905559998877");
    expect(serializedPayload).not.toContain("acme@example.com");
  });

  it("returns an immutable ExecutionResult with no raw Prisma object", async () => {
    const existing = buildCustomerRecord();
    const updated = buildCustomerRecord({ displayName: "New Name", updatedAt: new Date("2026-01-02T00:00:00.000Z") });
    getCustomerByIdMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
    updateCustomerMock.mockResolvedValue(1);

    const { runtime } = setupRuntime();
    const result = await runtime.executeAction(buildRequest());

    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("balanceCents");
    expect(result.entityRef).toEqual({ entityType: "customer", entityId: "cust_1" });
  });
});

describe("customer.update execution — no-op patch", () => {
  beforeEach(() => {
    getCustomerByIdMock.mockReset();
    updateCustomerMock.mockReset();
  });

  it("does not mutate, does not emit a CustomerUpdated event, and completes as NO_CHANGE", async () => {
    const existing = buildCustomerRecord({ displayName: "Acme Ltd" });
    getCustomerByIdMock.mockResolvedValue(existing);

    const { runtime, operationStore, auditStore, outboxStore } = setupRuntime();

    const result = await runtime.executeAction(
      buildRequest({ input: { customerId: "cust_1", expectedVersion: "2026-01-01T00:00:00.000Z", patch: { displayName: "Acme Ltd" } } }),
    );

    expect(result.status).toBe("SUCCESS");
    expect(updateCustomerMock).not.toHaveBeenCalled();

    const operations = operationStore.listByCorrelationId("corr_1");
    expect(operations[0].finalState).toBe("COMPLETED");
    expect(outboxStore.listByOperation(operations[0].operationId)).toEqual([]);

    const actionResultAudit = auditStore
      .listByExecution(result.executionId)
      .find((audit) => audit.recordType === "ACTION_RESULT");
    expect(actionResultAudit?.outcome).toBe("NO_CHANGE");
  });
});

describe("customer.update execution — tenant isolation", () => {
  beforeEach(() => {
    getCustomerByIdMock.mockReset();
    updateCustomerMock.mockReset();
  });

  it("updates the customer only when the repository resolves it for the trusted organization", async () => {
    const existing = buildCustomerRecord({ organizationId: "org_1" });
    const updated = buildCustomerRecord({ organizationId: "org_1", displayName: "New Name", updatedAt: new Date("2026-01-02T00:00:00.000Z") });
    getCustomerByIdMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
    updateCustomerMock.mockResolvedValue(1);

    const { runtime } = setupRuntime();
    const result = await runtime.executeAction(buildRequest());

    expect(result.status).toBe("SUCCESS");
    expect(getCustomerByIdMock).toHaveBeenCalledWith("cust_1", "org_1", expect.anything());
  });

  it("never uses an organizationId supplied inside the action input", async () => {
    const existing = buildCustomerRecord({ organizationId: "org_1" });
    const updated = buildCustomerRecord({ organizationId: "org_1", displayName: "New Name", updatedAt: new Date("2026-01-02T00:00:00.000Z") });
    getCustomerByIdMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
    updateCustomerMock.mockResolvedValue(1);

    const { runtime } = setupRuntime();
    await runtime.executeAction(
      buildRequest({
        executionContext: buildExecutionContext({ organizationId: "org_1" }),
        input: {
          customerId: "cust_1",
          expectedVersion: "2026-01-01T00:00:00.000Z",
          patch: { displayName: "New Name" },
          organizationId: "org_HACKED",
        },
      }),
    );

    expect(getCustomerByIdMock).toHaveBeenCalledWith("cust_1", "org_1", expect.anything());
    expect(updateCustomerMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_1" }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("does not update a Customer belonging to another tenant — safe not-found, no tenant leak", async () => {
    getCustomerByIdMock.mockResolvedValue(null); // repository already filters by organizationId

    const { runtime, operationStore, auditStore } = setupRuntime();

    await expect(runtime.executeAction(buildRequest())).rejects.toThrow(ExecutionFailedError);
    expect(updateCustomerMock).not.toHaveBeenCalled();

    const operations = operationStore.listByCorrelationId("corr_1");
    expect(operations[0].coreStatus).toBe("FAILED");
    expect(operations[0].failureCode).toBe("HANDLER_THREW");
    expect(operations[0].failureSummary).not.toContain("org_1");

    const actionResultAudit = auditStore.listByOperation(operations[0].operationId).find((a) => a.recordType === "ACTION_RESULT");
    expect(actionResultAudit?.outcome).toBe("FAILED");
  });

  it("throws a safe typed CustomerNotFoundError when the customer cannot be found for this tenant", async () => {
    getCustomerByIdMock.mockResolvedValue(null);
    const { runtime } = setupRuntime();

    try {
      await runtime.executeAction(buildRequest());
      throw new Error("expected executeAction to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ExecutionFailedError);
      expect((error as ExecutionFailedError).cause).toBeInstanceOf(CustomerNotFoundError);
    }
  });
});

describe("customer.update execution — optimistic concurrency", () => {
  beforeEach(() => {
    getCustomerByIdMock.mockReset();
    updateCustomerMock.mockReset();
  });

  it("succeeds when expectedVersion matches the current version", async () => {
    const existing = buildCustomerRecord({ updatedAt: new Date("2026-01-01T00:00:00.000Z") });
    const updated = buildCustomerRecord({ displayName: "New Name", updatedAt: new Date("2026-01-02T00:00:00.000Z") });
    getCustomerByIdMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
    updateCustomerMock.mockResolvedValue(1);

    const { runtime } = setupRuntime();
    const result = await runtime.executeAction(buildRequest());

    expect(result.status).toBe("SUCCESS");
  });

  it("throws CustomerVersionConflictError when expectedVersion is stale", async () => {
    const existing = buildCustomerRecord({ updatedAt: new Date("2026-01-05T00:00:00.000Z") });
    getCustomerByIdMock.mockResolvedValue(existing);

    const { runtime } = setupRuntime();

    try {
      await runtime.executeAction(buildRequest());
      throw new Error("expected executeAction to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ExecutionFailedError);
      expect((error as ExecutionFailedError).cause).toBeInstanceOf(CustomerVersionConflictError);
    }
  });

  it("performs no mutation on a version conflict", async () => {
    const existing = buildCustomerRecord({ updatedAt: new Date("2026-01-05T00:00:00.000Z") });
    getCustomerByIdMock.mockResolvedValue(existing);

    const { runtime } = setupRuntime();
    await expect(runtime.executeAction(buildRequest())).rejects.toThrow();

    expect(updateCustomerMock).not.toHaveBeenCalled();
  });

  it("produces no CustomerUpdated event and no outbox entry on a version conflict", async () => {
    const existing = buildCustomerRecord({ updatedAt: new Date("2026-01-05T00:00:00.000Z") });
    getCustomerByIdMock.mockResolvedValue(existing);

    const { runtime, operationStore, outboxStore } = setupRuntime();
    await expect(runtime.executeAction(buildRequest())).rejects.toThrow();

    const operations = operationStore.listByCorrelationId("corr_1");
    expect(outboxStore.listByOperation(operations[0].operationId)).toEqual([]);
  });

  it("marks the operation FAILED and writes a failure audit on a version conflict", async () => {
    const existing = buildCustomerRecord({ updatedAt: new Date("2026-01-05T00:00:00.000Z") });
    getCustomerByIdMock.mockResolvedValue(existing);

    const { runtime, operationStore, auditStore } = setupRuntime();
    await expect(runtime.executeAction(buildRequest())).rejects.toThrow();

    const operations = operationStore.listByCorrelationId("corr_1");
    expect(operations[0].coreStatus).toBe("FAILED");
    expect(operations[0].finalState).toBe("FAILED");

    const actionResultAudit = auditStore
      .listByOperation(operations[0].operationId)
      .find((a) => a.recordType === "ACTION_RESULT");
    expect(actionResultAudit?.outcome).toBe("FAILED");
  });
});

describe("customer.update execution — policy behavior", () => {
  beforeEach(() => {
    getCustomerByIdMock.mockReset();
    updateCustomerMock.mockReset();
  });

  it("denies execution and performs no mutation when the actor lacks customers.write", async () => {
    const { runtime } = setupRuntime();

    await expect(
      runtime.executeAction(buildRequest({ executionContext: buildExecutionContext({ permissions: [] }) })),
    ).rejects.toThrow(PolicyDeniedError);

    expect(getCustomerByIdMock).not.toHaveBeenCalled();
    expect(updateCustomerMock).not.toHaveBeenCalled();
  });

  it("blocks execution without a valid approval grant when the action requires approval (hypothetical EXPLICIT policy)", async () => {
    const { runtime } = setupRuntime([buildActionDefinition({ approvalPolicy: "EXPLICIT" })]);

    await expect(runtime.executeAction(buildRequest())).rejects.toThrow(ApprovalRequiredError);
    expect(updateCustomerMock).not.toHaveBeenCalled();
  });
});

describe("customer.update execution — idempotent replay", () => {
  beforeEach(() => {
    getCustomerByIdMock.mockReset();
    updateCustomerMock.mockReset();
  });

  it("does not call the Customer service a second time on replay", async () => {
    const existing = buildCustomerRecord();
    const updated = buildCustomerRecord({ displayName: "New Name", updatedAt: new Date("2026-01-02T00:00:00.000Z") });
    getCustomerByIdMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
    updateCustomerMock.mockResolvedValue(1);

    const { runtime } = setupRuntime();
    const request = buildRequest();

    const first = await runtime.executeAction(request);
    const second = await runtime.executeAction(request);

    expect(updateCustomerMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("does not produce a second operation, audit, or outbox event on replay", async () => {
    const existing = buildCustomerRecord();
    const updated = buildCustomerRecord({ displayName: "New Name", updatedAt: new Date("2026-01-02T00:00:00.000Z") });
    getCustomerByIdMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
    updateCustomerMock.mockResolvedValue(1);

    const { runtime, operationStore, auditStore, outboxStore } = setupRuntime();
    const request = buildRequest();

    const first = await runtime.executeAction(request);
    await runtime.executeAction(request);

    const operations = operationStore.listByCorrelationId("corr_1");
    expect(operations).toHaveLength(1);

    const actionResultAudits = auditStore
      .listByExecution(first.executionId)
      .filter((a) => a.recordType === "ACTION_RESULT");
    expect(actionResultAudits).toHaveLength(1);

    expect(outboxStore.listByOperation(operations[0].operationId)).toHaveLength(1);
  });
});

describe("customer.update execution — injected clock/id generator", () => {
  beforeEach(() => {
    getCustomerByIdMock.mockReset();
    updateCustomerMock.mockReset();
  });

  it("uses the injected clock for startedAt/completedAt", async () => {
    const existing = buildCustomerRecord();
    const updated = buildCustomerRecord({ displayName: "New Name", updatedAt: new Date("2026-01-02T00:00:00.000Z") });
    getCustomerByIdMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
    updateCustomerMock.mockResolvedValue(1);

    const fixedNow = new Date("2026-03-01T00:00:00.000Z");
    const { runtime } = setupRuntime([buildActionDefinition()], () => fixedNow);

    const result = await runtime.executeAction(buildRequest());

    expect(result.startedAt).toBe(fixedNow.toISOString());
    expect(result.completedAt).toBe(fixedNow.toISOString());
  });

  it("uses an injected id generator for executionId", async () => {
    const existing = buildCustomerRecord();
    const updated = buildCustomerRecord({ displayName: "New Name", updatedAt: new Date("2026-01-02T00:00:00.000Z") });
    getCustomerByIdMock.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
    updateCustomerMock.mockResolvedValue(1);

    const registry = buildFakeRegistry([buildActionDefinition()]);
    const policy = createPolicyEngine({ registry });
    const runtime = createExecutionRuntime({
      registry,
      policyEngine: policy,
      operationStore: createInMemoryOperationStore(),
      auditStore: createInMemoryAuditStore(),
      outboxStore: createInMemoryOutboxStore(),
      generateId: () => "fixed-execution-id",
    });
    registerCustomerActions(runtime.getHandlerRegistry());

    const result = await runtime.executeAction(buildRequest());

    expect(result.executionId).toBe("fixed-execution-id");
  });
});
