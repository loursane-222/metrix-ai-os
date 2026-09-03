import { describe, expect, it, vi, beforeEach } from "vitest";

// native-connector.ts's default executeAction resolves productionExecutionRuntime,
// which transitively imports the domain services -> the real Prisma client
// (throws at import time without DATABASE_URL). Every test here injects its
// own executeAction, so the real runtime/Prisma are never actually invoked —
// but the import chain must still be stubbed for the module to load at all.
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

import { executeCanonicalOperation } from "../native-connector";
import { registerCapability, resetCapabilityRegistryForTests, type CapabilityDescriptor } from "../capability-registry";
import type { CanonicalOperationV1 } from "../types";
import {
  ApprovalRequiredError,
  ExecutionFailedError,
  IdempotencyConflictError,
  createExecutionRuntime,
  createInMemoryIdempotencyStore,
  createInMemoryHandlerRegistry,
} from "@/lib/action-runtime/execution";
import type { ActionExecutionRequest, ExecutionResult } from "@/lib/action-runtime/execution";

const authContext = {
  user: { id: "user-1" },
  organization: { id: "org-1" },
  membership: { role: "OWNER" },
  session: { id: "session-1", createdAt: new Date("2026-01-01T00:00:00.000Z"), expiresAt: new Date("2026-01-02T00:00:00.000Z") },
} as unknown as import("@/lib/auth/context/auth-context.types").AuthContext;

function baseOperation(overrides: Partial<CanonicalOperationV1> = {}): CanonicalOperationV1 {
  return {
    operationId: "op-1",
    correlationId: "corr-1",
    organizationId: "org-1",
    actorId: "user-1",
    source: "written",
    type: "UPDATE",
    domain: "test",
    entity: { entityType: "test_entity", entityId: "entity-1" },
    capability: "test.write",
    payload: {},
    revealIntent: { explicit: false },
    ...overrides,
  };
}

function executionResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    actionName: "test.action",
    executionId: "exec-1",
    status: "SUCCESS",
    outcome: "SUCCEEDED",
    correlationId: "corr-1",
    operationId: "native-op-1",
    entityRef: { entityType: "test_entity", entityId: "entity-1" },
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    metadata: { stagesCompleted: [] },
    ...overrides,
  };
}

const readStore = new Map<string, Record<string, unknown> | null>();

function registerFixtureCapabilities() {
  resetCapabilityRegistryForTests();
  const readDescriptor: CapabilityDescriptor = {
    capabilityId: "test.read",
    domain: "test",
    classification: "READ",
    implementation: {
      kind: "READ",
      read: async (_organizationId, entityId) => readStore.get(entityId) ?? null,
      search: async () => Array.from(readStore.values()),
    },
  };
  const writeDescriptor: CapabilityDescriptor = {
    capabilityId: "test.write",
    domain: "test",
    classification: "WRITE",
    implementation: {
      kind: "WRITE",
      nativeActionName: "test.action",
      readbackCapability: "test.read",
      verifyExpectedState: (payload, readEntity) => {
        const patch = payload.patch as Record<string, unknown> | undefined;
        if (!patch) return null;
        for (const [key, value] of Object.entries(patch)) {
          if (readEntity[key] !== value) return `${key} mismatch`;
        }
        return null;
      },
    },
  };
  const writeNoReadbackDescriptor: CapabilityDescriptor = {
    capabilityId: "test.write.no-readback",
    domain: "test",
    classification: "WRITE",
    implementation: { kind: "WRITE", nativeActionName: "test.action.no-readback" },
  };
  const navDescriptor: CapabilityDescriptor = {
    capabilityId: "test.navigate",
    domain: "test",
    classification: "NAVIGATION",
    implementation: { kind: "NAVIGATION", route: "/metrix/test" },
  };
  registerCapability(readDescriptor);
  registerCapability(writeDescriptor);
  registerCapability(writeNoReadbackDescriptor);
  registerCapability(navDescriptor);
}

describe("executeCanonicalOperation", () => {
  beforeEach(() => {
    readStore.clear();
    registerFixtureCapabilities();
  });

  it("returns UNSUPPORTED for an unregistered capability", async () => {
    const result = await executeCanonicalOperation(baseOperation({ capability: "does.not.exist" }), { authContext });
    expect(result.status).toBe("UNSUPPORTED");
    expect(result.failureClassification).toBe("UNSUPPORTED_CAPABILITY");
  });

  it("returns UNSUPPORTED when operation type and capability classification disagree", async () => {
    const result = await executeCanonicalOperation(baseOperation({ type: "QUERY", capability: "test.write" }), { authContext });
    expect(result.status).toBe("UNSUPPORTED");
  });

  it("EXECUTED + PASSED readback via connector re-read when the handler sets no verification metadata", async () => {
    readStore.set("entity-1", { id: "entity-1", phone: "0532 444 55 99" });
    const executeAction = vi.fn(async (_request: ActionExecutionRequest) => executionResult());
    const result = await executeCanonicalOperation(
      baseOperation({ payload: { patch: { phone: "0532 444 55 99" } } }),
      { authContext, executeAction },
    );
    expect(result.status).toBe("EXECUTED");
    expect(result.mutationPerformed).toBe(true);
    expect(result.readback).toEqual({ status: "PASSED", source: "CONNECTOR_READBACK" });
    expect(executeAction).toHaveBeenCalledTimes(1);
    const request = executeAction.mock.calls[0]![0];
    expect(request.actionName).toBe("test.action");
    expect(request.idempotencyKey).toBe("op-1");
  });

  it("CONFLICT + READBACK_MISMATCH when the re-read state does not match what was requested", async () => {
    readStore.set("entity-1", { id: "entity-1", phone: "0000 000 00 00" });
    const executeAction = vi.fn(async () => executionResult());
    const result = await executeCanonicalOperation(
      baseOperation({ payload: { patch: { phone: "0532 444 55 99" } } }),
      { authContext, executeAction },
    );
    expect(result.status).toBe("CONFLICT");
    expect(result.failureClassification).toBe("READBACK_MISMATCH");
    expect(result.mutationPerformed).toBe(true);
  });

  it("trusts handler-reported verification metadata without a second read", async () => {
    const readSpy = vi.fn(async (_organizationId: string, entityId: string) => readStore.get(entityId) ?? null);
    resetCapabilityRegistryForTests();
    registerCapability({
      capabilityId: "test.read",
      domain: "test",
      classification: "READ",
      implementation: { kind: "READ", read: readSpy },
    });
    registerCapability({
      capabilityId: "test.write",
      domain: "test",
      classification: "WRITE",
      implementation: { kind: "WRITE", nativeActionName: "test.action", readbackCapability: "test.read" },
    });
    const executeAction = vi.fn(async () => executionResult({ metadata: { stagesCompleted: [], verification: "Doğrulandı" } }));
    const result = await executeCanonicalOperation(baseOperation(), { authContext, executeAction });
    expect(result.status).toBe("EXECUTED");
    expect(result.readback).toEqual({ status: "PASSED", source: "HANDLER_METADATA", summary: "Doğrulandı" });
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("reports UNAVAILABLE readback (never a fabricated PASSED) when no readback capability is registered", async () => {
    const executeAction = vi.fn(async () => executionResult());
    const result = await executeCanonicalOperation(
      baseOperation({ capability: "test.write.no-readback" }),
      { authContext, executeAction },
    );
    expect(result.status).toBe("EXECUTED");
    expect(result.readback).toEqual({ status: "UNAVAILABLE", source: "NONE" });
  });

  it("maps ApprovalRequiredError to APPROVAL_REQUIRED, not a fabricated success", async () => {
    const executeAction = vi.fn(async () => {
      throw new ApprovalRequiredError("test.action", "HIGH_RISK");
    });
    const result = await executeCanonicalOperation(baseOperation(), { authContext, executeAction });
    expect(result.status).toBe("APPROVAL_REQUIRED");
    expect(result.failureClassification).toBe("APPROVAL_REQUIRED");
    expect(result.mutationPerformed).toBe(false);
  });

  it("maps an in-progress IdempotencyConflictError to CONFLICT", async () => {
    const executeAction = vi.fn(async () => {
      throw new IdempotencyConflictError("op-1", "IN_PROGRESS");
    });
    const result = await executeCanonicalOperation(baseOperation(), { authContext, executeAction });
    expect(result.status).toBe("CONFLICT");
    expect(result.failureClassification).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("unwraps ExecutionFailedError to classify its cause", async () => {
    const executeAction = vi.fn(async () => {
      throw new ExecutionFailedError("test.action", "exec-1", new ApprovalRequiredError("test.action"));
    });
    const result = await executeCanonicalOperation(baseOperation(), { authContext, executeAction });
    expect(result.status).toBe("APPROVAL_REQUIRED");
  });

  it("QUERY by entityId returns READ_COMPLETED and RESOLVED when found", async () => {
    readStore.set("entity-1", { id: "entity-1", phone: "0532 444 55 99" });
    const result = await executeCanonicalOperation(
      baseOperation({ type: "QUERY", capability: "test.read" }),
      { authContext },
    );
    expect(result.status).toBe("READ_COMPLETED");
    expect(result.entityResolution).toBe("RESOLVED");
    expect(result.data).toEqual({ id: "entity-1", phone: "0532 444 55 99" });
  });

  it("QUERY by entityId returns NOT_FOUND when the entity does not exist", async () => {
    const result = await executeCanonicalOperation(
      baseOperation({ type: "QUERY", capability: "test.read" }),
      { authContext },
    );
    expect(result.status).toBe("READ_COMPLETED");
    expect(result.entityResolution).toBe("NOT_FOUND");
    expect(result.data).toBeNull();
  });

  it("NAVIGATE reflects explicit reveal intent in the reveal directive", async () => {
    const result = await executeCanonicalOperation(
      baseOperation({ type: "NAVIGATE", capability: "test.navigate", revealIntent: { explicit: true, reason: "user asked to open it" } }),
      { authContext },
    );
    expect(result.status).toBe("READ_COMPLETED");
    expect(result.revealDirective).toEqual({ shouldReveal: true, reason: "user asked to open it" });
    expect(result.data).toEqual({ route: "/metrix/test" });
  });

  it("NAVIGATE does not reveal when the turn carried no explicit reveal intent", async () => {
    const result = await executeCanonicalOperation(
      baseOperation({ type: "NAVIGATE", capability: "test.navigate", revealIntent: { explicit: false } }),
      { authContext },
    );
    expect(result.revealDirective?.shouldReveal).toBe(false);
  });
});

describe("executeCanonicalOperation — idempotent replay (real ExecutionRuntime + real in-memory idempotency store)", () => {
  it("replaying the same operationId does not invoke the handler twice", async () => {
    resetCapabilityRegistryForTests();
    // nativeActionName "customer.update" is a REAL, already-registered action
    // (approvalPolicy NONE, no required permissions) — using the real
    // actionRegistry/policyEngine defaults here, not a fixture, is what
    // makes this an idempotency proof and not just a mock-replay check. No
    // readbackCapability is registered so this stays Prisma-free.
    registerCapability({
      capabilityId: "customer.update",
      domain: "customer",
      classification: "WRITE",
      implementation: { kind: "WRITE", nativeActionName: "customer.update" },
    });

    let handlerCallCount = 0;
    const handlerRegistry = createInMemoryHandlerRegistry();
    handlerRegistry.registerHandler("customer.update", async (envelope) => {
      handlerCallCount += 1;
      return { status: "SUCCESS", entityRef: envelope.entityRef, resultSummary: "updated", metadata: { call: handlerCallCount } };
    });
    const runtime = createExecutionRuntime({ idempotencyStore: createInMemoryIdempotencyStore(), handlerRegistry });

    const operation = baseOperation({ capability: "customer.update", payload: { customerId: "entity-1", patch: { phone: "0532 444 55 99" }, expectedVersion: "v1" } });
    const deps = { authContext, executeAction: (request: ActionExecutionRequest) => runtime.executeAction(request) };

    const first = await executeCanonicalOperation(operation, deps);
    const second = await executeCanonicalOperation(operation, deps);

    expect(handlerCallCount).toBe(1);
    expect(first.status).toBe("EXECUTED");
    expect(second.status).toBe("EXECUTED");
    expect(second.nativeExecutionId).toBe(first.nativeExecutionId);
  });
});
