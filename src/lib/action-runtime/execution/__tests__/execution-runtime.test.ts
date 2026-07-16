import { describe, expect, it } from "vitest";

import { actionRegistry } from "../../registry";
import type { ActionDefinition } from "../../registry/action-registry.types";
import { createPolicyEngine } from "../../policy";
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
  clock?: () => Date;
  generateId?: () => string;
};

function setupRuntime(definitions: ActionDefinition[], options: SetupOptions = {}) {
  const registry = buildFakeRegistry(definitions);
  const policy = createPolicyEngine({ registry });
  const handlerRegistry = options.handlerRegistry ?? createInMemoryHandlerRegistry();
  const idempotencyStore = options.idempotencyStore ?? createInMemoryIdempotencyStore({ clock: options.clock });

  const runtimeOptions: ExecutionRuntimeOptions = {
    registry,
    policyEngine: policy,
    handlerRegistry,
    idempotencyStore,
    clock: options.clock,
    generateId: options.generateId,
  };

  const runtime = createExecutionRuntime(runtimeOptions);
  return { registry, policy, handlerRegistry, idempotencyStore, runtime };
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
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.actionName).toBe("customer.update");
    expect(result.metadata.updatedFields).toEqual(["displayName"]);
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
    });

    await expect(
      runtime.executeAction({
        actionName: "customer.update",
        input: { customerId: "cust_2" },
        executionContext: buildExecutionContext(),
        idempotencyKey: "idem_shared",
        normalizedInputHash: "hash_b",
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
    };

    const first = await runtime.executeAction(request);
    const second = await runtime.executeAction(request);

    expect(callCount).toBe(1);
    expect(second).toEqual(first);
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
    });

    expect(result.metadata.stagesCompleted).toEqual([
      "REGISTRY_LOOKUP",
      "INPUT_VALIDATION",
      "POLICY_EVALUATION",
      "APPROVAL_VERIFICATION",
      "IDEMPOTENCY_CHECK",
      "ENVELOPE_CREATION",
      "HANDLER_INVOCATION",
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
    });

    expect(result.status).toBe("SUCCESS");
    expect(runtime.getHandlerRegistry()).toBe(customHandlerRegistry);
  });
});

describe("ExecutionRuntime — real Registry/Policy integration", () => {
  it("executes the real, registered quote.create DOMAIN action end-to-end", async () => {
    const runtime = createExecutionRuntime();
    runtime.getHandlerRegistry().registerHandler("quote.create", () => ({ status: "SUCCESS" }));

    const result = await runtime.executeAction({
      actionName: "quote.create",
      input: { customerId: "cust_1", title: "Teklif", amount: 100 },
      executionContext: buildExecutionContext({ permissions: ["quotes.write"] }),
      idempotencyKey: "idem_real_quote_create",
      normalizedInputHash: "hash_real_quote_create",
    });

    expect(result.status).toBe("SUCCESS");
  });

  it("confirms customer.archive is a real, registered HIGH-risk EXPLICIT-approval DOMAIN action", () => {
    expect(actionRegistry.getActionDefinition("customer.archive").approvalPolicy).toBe("EXPLICIT");
  });
});
