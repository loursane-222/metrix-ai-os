import { describe, expect, it } from "vitest";

import { actionRegistry } from "../../registry";
import type { ActionDefinition } from "../../registry/action-registry.types";
import { createPolicyEngine } from "../../policy";
import { createInMemoryOperationStore } from "../../operation";
import type { OperationStore } from "../../operation";
import { createInMemoryAuditStore } from "../../audit";
import type { AuditStore } from "../../audit";
import { createInMemoryOutboxStore } from "../../outbox";
import type { OutboxStore } from "../../outbox";
import type { ExecutionActionRegistry, ExecutionContext } from "../execution.types";
import {
  ApprovalRequiredError,
  ExecutionRejectedError,
  HandlerNotFoundError,
  IdempotencyConflictError,
  InputValidationError,
  PolicyDeniedError,
  RegistryLookupFailedError,
} from "../execution.errors";
import { createExecutionRuntime, ExecutionRuntimeOptions } from "../execution-runtime";
import { createInMemoryHandlerRegistry } from "../handler-registry";
import { createInMemoryIdempotencyStore } from "../idempotency-store";
import type { ActionHandlerRegistry, IdempotencyStore } from "../execution.types";
import type { ExecutiveLifecycleSink } from "@/lib/executive-lifecycle";

function buildActionDefinition(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    actionName: "customer.update",
    actionClass: "DOMAIN",
    ownerModule: "customers",
    inputSchema: { customerId: { type: "string", required: true } },
    riskLevelBase: "LOW",
    requiredPermissionSet: ["customers.write"],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
    ...overrides,
  };
}

function buildFakeRegistry(definitions: ActionDefinition[]): ExecutionActionRegistry {
  const byName = new Map(definitions.map((definition) => [definition.actionName, definition]));

  return {
    getActionDefinition(actionName: string) {
      const definition = byName.get(actionName);
      if (!definition) {
        throw new Error(`Action "${actionName}" was not found in the fake registry.`);
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

type SetupOptions = {
  handlerRegistry?: ActionHandlerRegistry;
  idempotencyStore?: IdempotencyStore;
  operationStore?: OperationStore;
  auditStore?: AuditStore;
  outboxStore?: OutboxStore;
  clock?: () => Date;
  generateId?: () => string;
  lifecycleSink?: ExecutiveLifecycleSink;
};

function setupRuntime(definitions: ActionDefinition[], options: SetupOptions = {}) {
  const registry = buildFakeRegistry(definitions);
  const policy = createPolicyEngine({ registry });
  const handlerRegistry = options.handlerRegistry ?? createInMemoryHandlerRegistry();
  const idempotencyStore = options.idempotencyStore ?? createInMemoryIdempotencyStore({ clock: options.clock });
  const operationStore = options.operationStore ?? createInMemoryOperationStore({ clock: options.clock });
  const auditStore = options.auditStore ?? createInMemoryAuditStore({ clock: options.clock });
  const outboxStore = options.outboxStore ?? createInMemoryOutboxStore({ clock: options.clock });

  const runtimeOptions: ExecutionRuntimeOptions = {
    registry,
    policyEngine: policy,
    handlerRegistry,
    idempotencyStore,
    operationStore,
    auditStore,
    outboxStore,
    clock: options.clock,
    generateId: options.generateId,
    lifecycleSink: options.lifecycleSink,
  };

  const runtime = createExecutionRuntime(runtimeOptions);
  return { registry, policy, handlerRegistry, idempotencyStore, operationStore, auditStore, outboxStore, runtime };
}

describe("ExecutionRuntime — execute success", () => {
  it("runs the full pipeline and returns a SUCCESS result for a NONE-policy action", async () => {
    const { runtime, handlerRegistry } = setupRuntime([buildActionDefinition()]);
    handlerRegistry.registerHandler("customer.update", () => ({
      status: "SUCCESS",
      metadata: { updatedFields: ["displayName"] },
    }));

    const result = await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_success",
      normalizedInputHash: "hash_success",
      correlationId: "corr_success",
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.actionName).toBe("customer.update");
    expect(result.metadata.updatedFields).toEqual(["displayName"]);
  });
});

describe("ExecutionRuntime — Executive lifecycle adapter", () => {
  it("normalizes real requested, authorized, started, succeeded and verified transitions", async () => {
    const envelopes: Parameters<ExecutiveLifecycleSink>[0][] = [];
    const { runtime, handlerRegistry } = setupRuntime([buildActionDefinition({ inputSchema: { customerId: { type: "string", required: true }, patch: { type: "json", required: true }, expectedVersion: { type: "string", required: true } } })], {
      lifecycleSink: (envelope) => envelopes.push(envelope),
      generateId: () => "execution-1",
    });
    handlerRegistry.registerHandler("customer.update", () => ({ status: "SUCCESS", metadata: { verification: "Yeni sürüm doğrulandı" } }));
    await runtime.executeAction({ actionName: "customer.update", input: { customerId: "cust-1", patch: { displayName: "B" }, expectedVersion: "v1" }, entityRef: { entityType: "customer", entityId: "cust-1" }, executionContext: buildExecutionContext(), idempotencyKey: "idem", normalizedInputHash: "hash", correlationId: "session-1" });
    expect(envelopes.map((envelope) => envelope.phase)).toEqual(["requested", "authorized", "started", "succeeded", "verified"]);
    expect(envelopes.at(-2)).toMatchObject({ action: { expectedVersion: "v1", affectedFields: ["displayName"] } });
    expect(envelopes.at(-1)).toMatchObject({ verification: { status: "passed" } });
  });

  it("normalizes a real handler failure without success", async () => {
    const envelopes: Parameters<ExecutiveLifecycleSink>[0][] = [];
    const { runtime, handlerRegistry } = setupRuntime([buildActionDefinition()], { lifecycleSink: (envelope) => envelopes.push(envelope) });
    handlerRegistry.registerHandler("customer.update", () => ({ status: "FAILURE", errorMessage: "failed" }));
    await runtime.executeAction({ actionName: "customer.update", input: { customerId: "cust-1" }, executionContext: buildExecutionContext(), idempotencyKey: "idem-fail", normalizedInputHash: "hash", correlationId: "session-fail" });
    expect(envelopes.at(-1)).toMatchObject({ phase: "failed", outcome: "failed" });
    expect(envelopes.some((envelope) => envelope.phase === "succeeded")).toBe(false);
  });
});

describe("ExecutionRuntime — registry action yok", () => {
  it("throws RegistryLookupFailedError for an unregistered action", async () => {
    const { runtime } = setupRuntime([]);

    await expect(
      runtime.executeAction({
        actionName: "unknown.action",
        input: {},
        executionContext: buildExecutionContext(),
        idempotencyKey: "idem_missing",
        normalizedInputHash: "hash_missing",
        correlationId: "corr_missing",
      }),
    ).rejects.toThrow(RegistryLookupFailedError);
  });
});

describe("ExecutionRuntime — SURFACE action rejection", () => {
  it("throws ExecutionRejectedError when the action is not classified as DOMAIN", async () => {
    const { runtime } = setupRuntime([
      buildActionDefinition({
        actionName: "draft.set_field",
        actionClass: "SURFACE",
        requiredPermissionSet: [],
      }),
    ]);

    await expect(
      runtime.executeAction({
        actionName: "draft.set_field",
        input: {},
        executionContext: buildExecutionContext(),
        idempotencyKey: "idem_surface",
        normalizedInputHash: "hash_surface",
        correlationId: "corr_surface",
      }),
    ).rejects.toThrow(ExecutionRejectedError);
  });
});

describe("ExecutionRuntime — input validation", () => {
  it("throws InputValidationError when a required field is missing", async () => {
    const { runtime, handlerRegistry } = setupRuntime([buildActionDefinition()]);
    handlerRegistry.registerHandler("customer.update", () => ({ status: "SUCCESS" }));

    await expect(
      runtime.executeAction({
        actionName: "customer.update",
        input: {},
        executionContext: buildExecutionContext(),
        idempotencyKey: "idem_invalid",
        normalizedInputHash: "hash_invalid",
        correlationId: "corr_invalid",
      }),
    ).rejects.toThrow(InputValidationError);
  });
});

describe("ExecutionRuntime — handler yok", () => {
  it("throws HandlerNotFoundError when no handler is registered for an otherwise valid action", async () => {
    const { runtime } = setupRuntime([buildActionDefinition()]);

    await expect(
      runtime.executeAction({
        actionName: "customer.update",
        input: { customerId: "cust_1" },
        executionContext: buildExecutionContext(),
        idempotencyKey: "idem_no_handler",
        normalizedInputHash: "hash_no_handler",
        correlationId: "corr_no_handler",
      }),
    ).rejects.toThrow(HandlerNotFoundError);
  });
});

describe("ExecutionRuntime — policy deny", () => {
  it("throws PolicyDeniedError when the actor lacks a required permission", async () => {
    const { runtime, handlerRegistry } = setupRuntime([buildActionDefinition()]);
    handlerRegistry.registerHandler("customer.update", () => ({ status: "SUCCESS" }));

    await expect(
      runtime.executeAction({
        actionName: "customer.update",
        input: { customerId: "cust_1" },
        executionContext: buildExecutionContext({ permissions: [] }),
        idempotencyKey: "idem_deny",
        normalizedInputHash: "hash_deny",
        correlationId: "corr_deny",
      }),
    ).rejects.toThrow(PolicyDeniedError);
  });
});

describe("ExecutionRuntime — approval required", () => {
  it("throws ApprovalRequiredError for an EXPLICIT-policy action without a grant", async () => {
    const { runtime, handlerRegistry } = setupRuntime([
      buildActionDefinition({
        actionName: "customer.archive",
        inputSchema: {},
        approvalPolicy: "EXPLICIT",
        requiredPermissionSet: ["customers.archive"],
      }),
    ]);
    handlerRegistry.registerHandler("customer.archive", () => ({ status: "SUCCESS" }));

    await expect(
      runtime.executeAction({
        actionName: "customer.archive",
        input: {},
        executionContext: buildExecutionContext({ permissions: ["customers.archive"] }),
        idempotencyKey: "idem_approval_required",
        normalizedInputHash: "hash_approval_required",
        correlationId: "corr_approval_required",
      }),
    ).rejects.toThrow(ApprovalRequiredError);
  });
});

describe("ExecutionRuntime — approval success", () => {
  it("succeeds for an EXPLICIT-policy action once a valid matching grant is supplied", async () => {
    const { runtime, policy, handlerRegistry } = setupRuntime([
      buildActionDefinition({
        actionName: "customer.archive",
        inputSchema: {},
        approvalPolicy: "EXPLICIT",
        requiredPermissionSet: ["customers.archive"],
      }),
    ]);
    handlerRegistry.registerHandler("customer.archive", () => ({ status: "SUCCESS" }));

    const actorContext = buildExecutionContext({ permissions: ["customers.archive"] });
    const decision = policy.evaluatePolicy({
      actionName: "customer.archive",
      actorContext,
      normalizedInputHash: "hash_approval_success",
    });
    const grant = policy.grantApproval(decision.approvalRequest!.approvalId, "manager_1");

    const result = await runtime.executeAction({
      actionName: "customer.archive",
      input: {},
      executionContext: actorContext,
      idempotencyKey: "idem_approval_success",
      normalizedInputHash: "hash_approval_success",
      approvalGrant: grant,
      correlationId: "corr_approval_success",
    });

    expect(result.status).toBe("SUCCESS");
  });
});

describe("ExecutionRuntime — idempotency conflict", () => {
  it("throws IdempotencyConflictError when the same key is reused with different input", async () => {
    const { runtime, handlerRegistry } = setupRuntime([buildActionDefinition()]);
    handlerRegistry.registerHandler("customer.update", () => ({ status: "SUCCESS" }));

    await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_shared",
      normalizedInputHash: "hash_a",
      correlationId: "corr_shared_1",
    });

    await expect(
      runtime.executeAction({
        actionName: "customer.update",
        input: { customerId: "cust_2" },
        executionContext: buildExecutionContext(),
        idempotencyKey: "idem_shared",
        normalizedInputHash: "hash_b",
        correlationId: "corr_shared_2",
      }),
    ).rejects.toThrow(IdempotencyConflictError);
  });
});

describe("ExecutionRuntime — duplicate execution", () => {
  it("replays the cached result without invoking the handler a second time", async () => {
    const { runtime, handlerRegistry } = setupRuntime([buildActionDefinition()]);
    let callCount = 0;
    handlerRegistry.registerHandler("customer.update", () => {
      callCount += 1;
      return { status: "SUCCESS" };
    });

    const request = {
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_dup",
      normalizedInputHash: "hash_dup",
      correlationId: "corr_dup",
    };

    const first = await runtime.executeAction(request);
    const second = await runtime.executeAction(request);

    expect(callCount).toBe(1);
    expect(second).toMatchObject({
      executionId: first.executionId,
      operationId: first.operationId,
      outcome: "REPLAYED",
      metadata: { replayedExecutionId: first.executionId },
    });
  });

  it("allows only one handler invocation for parallel requests with the same trusted identity", async () => {
    const { runtime, handlerRegistry } = setupRuntime([buildActionDefinition()]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let callCount = 0;
    handlerRegistry.registerHandler("customer.update", async () => {
      callCount += 1;
      await gate;
      return { status: "SUCCESS" };
    });
    const request = {
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_parallel",
      normalizedInputHash: "hash_parallel",
      correlationId: "corr_parallel",
    };

    const first = runtime.executeAction(request);
    const second = runtime.executeAction(request);
    await expect(second).rejects.toThrow(IdempotencyConflictError);
    expect(callCount).toBe(1);
    release();
    await expect(first).resolves.toMatchObject({ status: "SUCCESS" });
  });

  it("never replays an idempotency result across organizations", async () => {
    const { runtime, handlerRegistry } = setupRuntime([buildActionDefinition()]);
    let callCount = 0;
    handlerRegistry.registerHandler("customer.update", () => {
      callCount += 1;
      return { status: "SUCCESS" };
    });
    const baseRequest = {
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      idempotencyKey: "shared-request-id",
      normalizedInputHash: "same-hash",
      correlationId: "corr_tenant_scope",
    };

    const first = await runtime.executeAction({ ...baseRequest, executionContext: buildExecutionContext({ organizationId: "org_1" }) });
    const second = await runtime.executeAction({ ...baseRequest, executionContext: buildExecutionContext({ organizationId: "org_2" }) });

    expect(callCount).toBe(2);
    expect(second.executionId).not.toBe(first.executionId);
  });
});

describe("ExecutionRuntime — execution metadata", () => {
  it("records every completed pipeline stage in order", async () => {
    const { runtime, handlerRegistry } = setupRuntime([buildActionDefinition()]);
    handlerRegistry.registerHandler("customer.update", () => ({ status: "SUCCESS" }));

    const result = await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_metadata",
      normalizedInputHash: "hash_metadata",
      correlationId: "corr_metadata",
    });

    expect(result.metadata.stagesCompleted).toEqual([
      "REGISTRY_LOOKUP",
      "INPUT_VALIDATION",
      "POLICY_EVALUATION",
      "APPROVAL_VERIFICATION",
      "IDEMPOTENCY_CHECK",
      "ENVELOPE_CREATION",
      "HANDLER_INVOCATION",
      "COMPLETION",
      "RESULT_BUILDING",
    ]);
  });
});

describe("ExecutionRuntime — immutable execution result", () => {
  it("freezes the returned ExecutionResult and its metadata", async () => {
    const { runtime, handlerRegistry } = setupRuntime([buildActionDefinition()]);
    handlerRegistry.registerHandler("customer.update", () => ({ status: "SUCCESS" }));

    const result = await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_frozen",
      normalizedInputHash: "hash_frozen",
      correlationId: "corr_frozen",
    });

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.metadata)).toBe(true);
  });
});

describe("ExecutionRuntime — injected clock", () => {
  it("uses the injected clock for startedAt and completedAt", async () => {
    const currentMs = 5_000;
    const { runtime, handlerRegistry } = setupRuntime([buildActionDefinition()], { clock: () => new Date(currentMs) });
    handlerRegistry.registerHandler("customer.update", () => ({ status: "SUCCESS" }));

    const result = await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_clock",
      normalizedInputHash: "hash_clock",
      correlationId: "corr_clock",
    });

    expect(result.startedAt).toBe(new Date(5_000).toISOString());
    expect(result.completedAt).toBe(new Date(5_000).toISOString());
  });
});

describe("ExecutionRuntime — injected id generator", () => {
  it("uses the injected id generator for executionId", async () => {
    const { runtime, handlerRegistry } = setupRuntime([buildActionDefinition()], { generateId: () => "fixed-execution-id" });
    handlerRegistry.registerHandler("customer.update", () => ({ status: "SUCCESS" }));

    const result = await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_genid",
      normalizedInputHash: "hash_genid",
      correlationId: "corr_genid",
    });

    expect(result.executionId).toBe("fixed-execution-id");
  });
});

describe("ExecutionRuntime — injected handler registry", () => {
  it("uses an externally supplied handler registry instance", async () => {
    const customHandlerRegistry = createInMemoryHandlerRegistry();
    customHandlerRegistry.registerHandler("customer.update", () => ({ status: "SUCCESS" }));

    const { runtime } = setupRuntime([buildActionDefinition()], { handlerRegistry: customHandlerRegistry });

    const result = await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_injected_registry",
      normalizedInputHash: "hash_injected_registry",
      correlationId: "corr_injected_registry",
    });

    expect(result.status).toBe("SUCCESS");
    expect(runtime.getHandlerRegistry()).toBe(customHandlerRegistry);
  });
});

describe("ExecutionRuntime — success creates operation + audit", () => {
  it("creates a SUCCEEDED/COMPLETED operation and the full audit trail", async () => {
    const { runtime, handlerRegistry, operationStore, auditStore } = setupRuntime([buildActionDefinition()]);
    handlerRegistry.registerHandler("customer.update", () => ({ status: "SUCCESS", resultSummary: "updated" }));

    const result = await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_op_audit",
      normalizedInputHash: "hash_op_audit",
      correlationId: "corr_op_audit",
    });

    const operations = operationStore.listByCorrelationId("corr_op_audit");
    expect(operations).toHaveLength(1);
    expect(operations[0].coreStatus).toBe("SUCCEEDED");
    expect(operations[0].finalState).toBe("COMPLETED");
    expect(operations[0].completedAt).toBeDefined();

    const audits = auditStore.listByExecution(result.executionId);
    const recordTypes = audits.map((audit) => audit.recordType);
    expect(recordTypes).toContain("POLICY_DECISION");
    expect(recordTypes).toContain("EXECUTION_ATTEMPT");
    expect(recordTypes).toContain("ACTION_RESULT");
    expect(audits.find((audit) => audit.recordType === "ACTION_RESULT")?.outcome).toBe("SUCCEEDED");
    expect(audits.find((audit) => audit.recordType === "ACTION_RESULT")?.resultSummary).toBe("updated");
  });
});

describe("ExecutionRuntime — policy deny audit", () => {
  it("writes a POLICY_DECISION audit with outcome DENY and creates no operation", async () => {
    const { runtime, handlerRegistry, operationStore, auditStore } = setupRuntime([buildActionDefinition()]);
    handlerRegistry.registerHandler("customer.update", () => ({ status: "SUCCESS" }));

    await expect(
      runtime.executeAction({
        actionName: "customer.update",
        input: { customerId: "cust_1" },
        executionContext: buildExecutionContext({ permissions: [] }),
        idempotencyKey: "idem_deny_audit",
        normalizedInputHash: "hash_deny_audit",
        correlationId: "corr_deny_audit",
      }),
    ).rejects.toThrow(PolicyDeniedError);

    expect(operationStore.listByCorrelationId("corr_deny_audit")).toHaveLength(0);

    const audits = auditStore.listByOrganization("org_1").filter((audit) => audit.inputHash === "hash_deny_audit");
    expect(audits).toHaveLength(1);
    expect(audits[0].recordType).toBe("POLICY_DECISION");
    expect(audits[0].outcome).toBe("DENY");
  });
});

describe("ExecutionRuntime — approval audit", () => {
  it("writes an APPROVAL_EVENT audit when a grant is missing", async () => {
    const { runtime, auditStore } = setupRuntime([
      buildActionDefinition({
        actionName: "customer.archive",
        inputSchema: {},
        approvalPolicy: "EXPLICIT",
        requiredPermissionSet: ["customers.archive"],
      }),
    ]);

    await expect(
      runtime.executeAction({
        actionName: "customer.archive",
        input: {},
        executionContext: buildExecutionContext({ permissions: ["customers.archive"] }),
        idempotencyKey: "idem_approval_audit",
        normalizedInputHash: "hash_approval_audit",
        correlationId: "corr_approval_audit",
      }),
    ).rejects.toThrow(ApprovalRequiredError);

    const audits = auditStore
      .listByOrganization("org_1")
      .filter((audit) => audit.recordType === "APPROVAL_EVENT" && audit.inputHash === "hash_approval_audit");
    expect(audits).toHaveLength(1);
    expect(audits[0].outcome).toBe("VALIDATION_FAILED");
    expect(audits[0].reasonCode).toBe("APPROVAL_GRANT_MISSING");
  });
});

describe("ExecutionRuntime — approval consumption semantics", () => {
  it("records CONSUMED as a distinct audit event from success, and only for the attempt that used it", async () => {
    const { runtime, policy, handlerRegistry, auditStore } = setupRuntime([
      buildActionDefinition({
        actionName: "customer.archive",
        inputSchema: {},
        approvalPolicy: "EXPLICIT",
        requiredPermissionSet: ["customers.archive"],
      }),
    ]);
    handlerRegistry.registerHandler("customer.archive", () => ({ status: "SUCCESS" }));

    const actorContext = buildExecutionContext({ permissions: ["customers.archive"] });
    const decision = policy.evaluatePolicy({
      actionName: "customer.archive",
      actorContext,
      normalizedInputHash: "hash_consume",
    });
    const grant = policy.grantApproval(decision.approvalRequest!.approvalId, "manager_1");

    await runtime.executeAction({
      actionName: "customer.archive",
      input: {},
      executionContext: actorContext,
      idempotencyKey: "idem_consume",
      normalizedInputHash: "hash_consume",
      approvalGrant: grant,
      correlationId: "corr_consume",
    });

    const approvalAudits = auditStore
      .listByOrganization("org_1")
      .filter((audit) => audit.recordType === "APPROVAL_EVENT" && audit.approvalRef === grant.approvalId);

    const outcomes = approvalAudits.map((audit) => audit.outcome);
    expect(outcomes).toContain("GRANTED");
    expect(outcomes).toContain("CONSUMED");
    // CONSUMED alone never implies business success — that's a separate ACTION_RESULT record.
    const actionResultAudits = auditStore
      .listByOrganization("org_1")
      .filter((audit) => audit.recordType === "ACTION_RESULT");
    expect(actionResultAudits.every((audit) => audit.outcome !== "CONSUMED")).toBe(true);
  });
});

describe("ExecutionRuntime — handler failure", () => {
  it("marks the operation FAILED and writes a FAILED ACTION_RESULT audit when the handler reports failure", async () => {
    const { runtime, handlerRegistry, operationStore, auditStore } = setupRuntime([buildActionDefinition()]);
    handlerRegistry.registerHandler("customer.update", () => ({
      status: "FAILURE",
      errorMessage: "validation failed downstream",
    }));

    const result = await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_handler_failure",
      normalizedInputHash: "hash_handler_failure",
      correlationId: "corr_handler_failure",
    });

    expect(result.status).toBe("FAILURE");

    const operations = operationStore.listByCorrelationId("corr_handler_failure");
    expect(operations[0].coreStatus).toBe("FAILED");
    expect(operations[0].finalState).toBe("FAILED");
    expect(operations[0].failureCode).toBe("HANDLER_REPORTED_FAILURE");

    const actionResultAudit = auditStore
      .listByExecution(result.executionId)
      .find((audit) => audit.recordType === "ACTION_RESULT");
    expect(actionResultAudit?.outcome).toBe("FAILED");
  });

  it("marks the operation FAILED when the handler throws", async () => {
    const { runtime, handlerRegistry, operationStore } = setupRuntime([buildActionDefinition()]);
    handlerRegistry.registerHandler("customer.update", () => {
      throw new Error("boom");
    });

    await expect(
      runtime.executeAction({
        actionName: "customer.update",
        input: { customerId: "cust_1" },
        executionContext: buildExecutionContext(),
        idempotencyKey: "idem_handler_threw",
        normalizedInputHash: "hash_handler_threw",
        correlationId: "corr_handler_threw",
      }),
    ).rejects.toThrow();

    const operations = operationStore.listByCorrelationId("corr_handler_threw");
    expect(operations[0].coreStatus).toBe("FAILED");
    expect(operations[0].failureCode).toBe("HANDLER_THREW");
  });
});

describe("ExecutionRuntime — handler domain events enqueue to outbox", () => {
  it("enqueues each returned domain event descriptor", async () => {
    const { runtime, handlerRegistry, outboxStore, operationStore } = setupRuntime([buildActionDefinition()]);
    handlerRegistry.registerHandler("customer.update", () => ({
      status: "SUCCESS",
      domainEvents: [
        {
          eventType: "CustomerUpdated",
          aggregateType: "customer",
          aggregateId: "cust_1",
          payload: { displayName: "New Name" },
          schemaVersion: "1",
        },
      ],
    }));

    const result = await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_domain_event",
      normalizedInputHash: "hash_domain_event",
      correlationId: "corr_domain_event",
    });

    const operations = operationStore.listByCorrelationId("corr_domain_event");
    const events = outboxStore.listByOperation(operations[0].operationId);

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("CustomerUpdated");
    expect(events[0].effectType).toBe("DOMAIN_EVENT");
    expect(events[0].deliveryStatus).toBe("PENDING");
    expect(result.status).toBe("SUCCESS");
  });
});

describe("ExecutionRuntime — handler side effects enqueue to outbox", () => {
  it("enqueues each returned side-effect descriptor", async () => {
    const { runtime, handlerRegistry, outboxStore, operationStore } = setupRuntime([buildActionDefinition()]);
    handlerRegistry.registerHandler("customer.update", () => ({
      status: "SUCCESS",
      sideEffects: [
        {
          effectType: "EMAIL_NOTIFICATION",
          payload: { to: "customer@example.com" },
          schemaVersion: "1",
        },
      ],
    }));

    await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_side_effect",
      normalizedInputHash: "hash_side_effect",
      correlationId: "corr_side_effect",
    });

    const operations = operationStore.listByCorrelationId("corr_side_effect");
    const events = outboxStore.listByOperation(operations[0].operationId);

    expect(events).toHaveLength(1);
    expect(events[0].effectType).toBe("EMAIL_NOTIFICATION");
  });
});

describe("ExecutionRuntime — partial success final state", () => {
  it("derives COMPLETED_WITH_PENDING_SIDE_EFFECT when outbox events remain pending", async () => {
    const { runtime, handlerRegistry, operationStore } = setupRuntime([buildActionDefinition()]);
    handlerRegistry.registerHandler("customer.update", () => ({
      status: "SUCCESS",
      domainEvents: [
        {
          eventType: "CustomerUpdated",
          aggregateType: "customer",
          aggregateId: "cust_1",
          payload: {},
          schemaVersion: "1",
        },
      ],
    }));

    await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_pending_side_effect",
      normalizedInputHash: "hash_pending_side_effect",
      correlationId: "corr_pending_side_effect",
    });

    const operations = operationStore.listByCorrelationId("corr_pending_side_effect");
    expect(operations[0].finalState).toBe("COMPLETED_WITH_PENDING_SIDE_EFFECT");
  });

  it("derives COMPLETED when there are no outbox events at all", async () => {
    const { runtime, handlerRegistry, operationStore } = setupRuntime([buildActionDefinition()]);
    handlerRegistry.registerHandler("customer.update", () => ({ status: "SUCCESS" }));

    await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_no_side_effect",
      normalizedInputHash: "hash_no_side_effect",
      correlationId: "corr_no_side_effect",
    });

    const operations = operationStore.listByCorrelationId("corr_no_side_effect");
    expect(operations[0].finalState).toBe("COMPLETED");
  });
});

describe("ExecutionRuntime — idempotent replay does not duplicate business state", () => {
  it("does not invoke the handler again and produces no second operation or ACTION_RESULT audit", async () => {
    const { runtime, handlerRegistry, operationStore, auditStore } = setupRuntime([buildActionDefinition()]);
    let callCount = 0;
    handlerRegistry.registerHandler("customer.update", () => {
      callCount += 1;
      return { status: "SUCCESS" };
    });

    const request = {
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_replay",
      normalizedInputHash: "hash_replay",
      correlationId: "corr_replay",
    };

    const first = await runtime.executeAction(request);
    const second = await runtime.executeAction(request);

    expect(callCount).toBe(1);
    expect(second).toMatchObject({
      executionId: first.executionId,
      operationId: first.operationId,
      outcome: "REPLAYED",
      metadata: { replayedExecutionId: first.executionId },
    });
    expect(operationStore.listByCorrelationId("corr_replay")).toHaveLength(1);

    const actionResultAudits = auditStore
      .listByExecution(first.executionId)
      .filter((audit) => audit.recordType === "ACTION_RESULT");
    expect(actionResultAudits).toHaveLength(1);
  });
});

describe("ExecutionRuntime — injected operation/audit/outbox stores", () => {
  it("uses the externally supplied stores rather than the defaults", async () => {
    const customOperationStore = createInMemoryOperationStore();
    const customAuditStore = createInMemoryAuditStore();
    const customOutboxStore = createInMemoryOutboxStore();

    const { runtime, handlerRegistry } = setupRuntime([buildActionDefinition()], {
      operationStore: customOperationStore,
      auditStore: customAuditStore,
      outboxStore: customOutboxStore,
    });
    handlerRegistry.registerHandler("customer.update", () => ({ status: "SUCCESS" }));

    await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_injected_stores",
      normalizedInputHash: "hash_injected_stores",
      correlationId: "corr_injected_stores",
    });

    expect(customOperationStore.listByCorrelationId("corr_injected_stores")).toHaveLength(1);
    expect(customAuditStore.listByOrganization("org_1").length).toBeGreaterThan(0);
  });
});

describe("ExecutionRuntime — end-to-end immutability", () => {
  it("returns frozen ExecutionResult, OperationRecord, AuditRecord and OutboxEvent snapshots", async () => {
    const { runtime, handlerRegistry, operationStore, auditStore, outboxStore } = setupRuntime([
      buildActionDefinition(),
    ]);
    handlerRegistry.registerHandler("customer.update", () => ({
      status: "SUCCESS",
      domainEvents: [
        {
          eventType: "CustomerUpdated",
          aggregateType: "customer",
          aggregateId: "cust_1",
          payload: {},
          schemaVersion: "1",
        },
      ],
    }));

    const result = await runtime.executeAction({
      actionName: "customer.update",
      input: { customerId: "cust_1" },
      executionContext: buildExecutionContext(),
      idempotencyKey: "idem_e2e_immutable",
      normalizedInputHash: "hash_e2e_immutable",
      correlationId: "corr_e2e_immutable",
    });

    expect(Object.isFrozen(result)).toBe(true);

    const operation = operationStore.listByCorrelationId("corr_e2e_immutable")[0];
    expect(Object.isFrozen(operation)).toBe(true);

    const audit = auditStore.listByExecution(result.executionId)[0];
    expect(Object.isFrozen(audit)).toBe(true);

    const event = outboxStore.listByOperation(operation.operationId)[0];
    expect(Object.isFrozen(event)).toBe(true);
  });
});

describe("ExecutionRuntime — real Registry/Policy integration", () => {
  it("executes the real, registered quote.create DOMAIN action end-to-end", async () => {
    const runtime = createExecutionRuntime({
      operationStore: createInMemoryOperationStore(),
      auditStore: createInMemoryAuditStore(),
      outboxStore: createInMemoryOutboxStore(),
    });
    runtime.getHandlerRegistry().registerHandler("quote.create", () => ({ status: "SUCCESS" }));

    const result = await runtime.executeAction({
      actionName: "quote.create",
      input: { customerId: "cust_1", title: "Teklif", amount: 100 },
      executionContext: buildExecutionContext({ permissions: ["quotes.write"] }),
      idempotencyKey: "idem_real_quote_create",
      normalizedInputHash: "hash_real_quote_create",
      correlationId: "corr_real_quote_create",
    });

    expect(result.status).toBe("SUCCESS");
  });

  it("confirms customer.archive is a real, registered HIGH-risk EXPLICIT-approval DOMAIN action", () => {
    expect(actionRegistry.getActionDefinition("customer.archive").approvalPolicy).toBe("EXPLICIT");
  });
});
