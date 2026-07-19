import { describe, expect, it, vi } from "vitest";

import {
  createExecutiveRuntimeAdapterDispatcher,
  createExecutiveRuntimeAdapterRegistry,
} from "..";
import type {
  ExecutiveRuntimeAdapter,
  ExecutiveRuntimeAdapterAvailability,
  ExecutiveRuntimeAdapterRequest,
} from "..";
import type { ExecutionMode, ExecutionStrategy } from "../../executive-request-resolution";

const fixedNow = new Date("2026-07-19T12:00:00.000Z");

function request(
  overrides: Partial<ExecutiveRuntimeAdapterRequest> = {},
): ExecutiveRuntimeAdapterRequest {
  const strategy = overrides.intendedStrategy ?? "UPDATE";
  const mode = overrides.intendedMode ?? "EXECUTE";
  const runtimeAdapterId = overrides.runtimeAdapterId ?? "customers:update";
  return {
    requestId: "req-1",
    organizationId: "org-1",
    channel: "text",
    runtimeAdapterId,
    primaryCapability: {
      role: "PRIMARY",
      capabilityId: "customer.update",
      providerId: "customer-provider",
      confidence: { level: "high", score: 0.99 },
      evidence: [],
    },
    binding: {
      bindingId: "customer-update-binding",
      capabilityId: "customer.update",
      providerId: "customer-provider",
      strategy,
      mode,
      runtimeAdapterId,
      availability: "AVAILABLE",
      version: "1",
    },
    intendedStrategy: strategy,
    intendedMode: mode,
    requiredContexts: [],
    resolvedEntities: [],
    missingInformation: [],
    pageContext: null,
    occurredAt: "2026-07-19T11:58:00.000Z",
    presenceGeneratedAt: "2026-07-19T11:59:00.000Z",
    correlationReference: { correlationId: "corr-1", source: "executive-presence" },
    ...overrides,
  };
}

function adapter(options: Readonly<{
  adapterId?: string;
  availability?: ExecutiveRuntimeAdapterAvailability;
  capabilities?: readonly string[];
  strategies?: readonly ExecutionStrategy[];
  modes?: readonly Exclude<ExecutionMode, "CLARIFICATION">[];
  canHandle?: ExecutiveRuntimeAdapter["canHandle"];
}> = {}): ExecutiveRuntimeAdapter {
  return {
    descriptor: {
      adapterId: options.adapterId ?? "customers:update",
      ownerBoundary: "customers",
      version: "1",
      supportedCapabilities: options.capabilities ?? ["customer.update"],
      supportedStrategies: options.strategies ?? ["UPDATE"],
      supportedModes: options.modes ?? ["DRAFT", "EXECUTE"],
      availability: options.availability ?? "AVAILABLE",
    },
    canHandle: options.canHandle ?? (() => true),
  };
}

function dispatcherWith(registered?: ExecutiveRuntimeAdapter) {
  const registry = createExecutiveRuntimeAdapterRegistry();
  if (registered) registry.register(registered);
  return createExecutiveRuntimeAdapterDispatcher({
    registry,
    clock: { now: () => fixedNow },
  });
}

describe("ExecutiveRuntimeAdapterDispatcher", () => {
  it("returns READY for a registered, compatible adapter", async () => {
    const result = await dispatcherWith(adapter()).dispatch(request());

    expect(result).toEqual({
      status: "READY",
      adapterId: "customers:update",
      ownerBoundary: "customers",
      version: "1",
      requestId: "req-1",
      organizationId: "org-1",
      capabilityId: "customer.update",
      providerId: "customer-provider",
      intendedStrategy: "UPDATE",
      intendedMode: "EXECUTE",
      pageContextAvailable: false,
      generatedAt: fixedNow.toISOString(),
      correlationReference: { correlationId: "corr-1", source: "executive-presence" },
    });
  });

  it("returns NOT_FOUND when no adapter is registered", async () => {
    await expect(dispatcherWith().dispatch(request())).resolves.toMatchObject({ status: "NOT_FOUND" });
  });

  it.each([
    ["UNAVAILABLE", "UNAVAILABLE"],
    ["DECLARED_NOT_EXECUTABLE", "NON_INVOCABLE"],
  ] as const)("maps %s availability to %s", async (availability, status) => {
    const result = await dispatcherWith(adapter({ availability })).dispatch(request());
    expect(result.status).toBe(status);
  });

  it("allows a READ_ONLY adapter to accept a READ_ONLY handoff", async () => {
    const input = request({
      intendedStrategy: "READ",
      intendedMode: "READ_ONLY",
      binding: {
        ...request().binding,
        strategy: "READ",
        mode: "READ_ONLY",
        availability: "READ_ONLY",
      },
    });
    const result = await dispatcherWith(adapter({
      availability: "READ_ONLY",
      strategies: ["READ"],
      modes: ["READ_ONLY"],
    })).dispatch(input);

    expect(result.status).toBe("READY");
  });

  it("does not allow a READ_ONLY adapter to accept DRAFT", async () => {
    const result = await dispatcherWith(adapter({ availability: "READ_ONLY" }))
      .dispatch(request({ intendedMode: "DRAFT", binding: { ...request().binding, mode: "DRAFT" } }));

    expect(result).toMatchObject({ status: "NON_INVOCABLE", availability: "READ_ONLY" });
  });

  it.each([
    ["CAPABILITY", adapter({ capabilities: ["customer.read"] }), request()],
    ["STRATEGY", adapter({ strategies: ["CREATE"] }), request()],
    ["MODE", adapter({ modes: ["DRAFT"] }), request()],
  ] as const)("returns INCOMPATIBLE for a %s mismatch", async (reasonCode, registered, input) => {
    const result = await dispatcherWith(registered).dispatch(input);
    expect(result).toMatchObject({ status: "INCOMPATIBLE", reasonCode });
  });

  it("rejects a binding runtimeAdapterId mismatch before lookup", async () => {
    const result = await dispatcherWith(adapter()).dispatch(request({
      binding: { ...request().binding, runtimeAdapterId: "customers:other" },
    }));

    expect(result).toMatchObject({ status: "REJECTED", reasonCode: "BINDING_MISMATCH" });
  });

  it("rejects divergent binding capability metadata", async () => {
    const result = await dispatcherWith(adapter()).dispatch(request({
      binding: { ...request().binding, capabilityId: "customer.delete" },
    }));

    expect(result).toMatchObject({ status: "REJECTED", reasonCode: "BINDING_MISMATCH" });
  });

  it("returns INCOMPATIBLE when canHandle declines", async () => {
    const result = await dispatcherWith(adapter({ canHandle: () => false })).dispatch(request());
    expect(result).toMatchObject({ status: "INCOMPATIBLE", reasonCode: "ADAPTER_DECLINED" });
  });

  it("fails closed when canHandle throws", async () => {
    const result = await dispatcherWith(adapter({ canHandle: () => { throw new Error("failure"); } }))
      .dispatch(request());
    expect(result).toMatchObject({ status: "REJECTED", reasonCode: "ADAPTER_EVALUATION_FAILED" });
  });

  it("fails closed for an empty runtimeAdapterId", async () => {
    const invalid = request({
      runtimeAdapterId: "",
      binding: { ...request().binding, runtimeAdapterId: "" },
    });
    const result = await dispatcherWith().dispatch(invalid);
    expect(result).toMatchObject({ status: "REJECTED", reasonCode: "INVALID_INPUT" });
  });

  it("does not mutate the input or registered descriptor", async () => {
    const input = request();
    const sourceAdapter = adapter();
    const inputBefore = JSON.stringify(input);
    const descriptorBefore = JSON.stringify(sourceAdapter.descriptor);

    await dispatcherWith(sourceAdapter).dispatch(input);

    expect(JSON.stringify(input)).toBe(inputBefore);
    expect(JSON.stringify(sourceAdapter.descriptor)).toBe(descriptorBefore);
  });

  it("is deterministic with a fixed clock and adapter decision", async () => {
    const dispatcher = dispatcherWith(adapter());
    const first = await dispatcher.dispatch(request());
    const second = await dispatcher.dispatch(request());
    expect(first).toEqual(second);
  });

  it("READY contains no concrete action, draft, approval, route, or execution contract", async () => {
    const result = await dispatcherWith(adapter()).dispatch(request());
    expect(result.status).toBe("READY");
    expect(result).not.toHaveProperty("actionName");
    expect(result).not.toHaveProperty("route");
    expect(result).not.toHaveProperty("draftId");
    expect(result).not.toHaveProperty("approvalGrant");
    expect(result).not.toHaveProperty("idempotencyKey");
    expect(result).not.toHaveProperty("actionExecutionRequest");
  });

  it("only asks the selected adapter to accept the request and invokes no planner", async () => {
    const canHandle = vi.fn(() => true);
    const plan = vi.fn();
    const fake = { ...adapter({ canHandle }), plan };

    const result = await dispatcherWith(fake).dispatch(request());

    expect(result.status).toBe("READY");
    expect(canHandle).toHaveBeenCalledOnce();
    expect(plan).not.toHaveBeenCalled();
  });
});
