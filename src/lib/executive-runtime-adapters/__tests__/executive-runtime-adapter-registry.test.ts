import { describe, expect, it } from "vitest";

import {
  DuplicateExecutiveRuntimeAdapterError,
  ExecutiveRuntimeAdapterContractError,
  createExecutiveRuntimeAdapterRegistry,
} from "..";
import type { ExecutiveRuntimeAdapter, ExecutiveRuntimeAdapterDescriptor } from "..";
import type { ExecutionMode, ExecutionStrategy } from "../../executive-request-resolution";

function descriptor(
  overrides: Partial<ExecutiveRuntimeAdapterDescriptor> = {},
): ExecutiveRuntimeAdapterDescriptor {
  return {
    adapterId: "customers:update",
    ownerBoundary: "customers",
    version: "1",
    supportedCapabilities: ["customer.update"],
    supportedStrategies: ["UPDATE"],
    supportedModes: ["DRAFT", "EXECUTE"],
    availability: "AVAILABLE",
    ...overrides,
  };
}

function adapter(value = descriptor()): ExecutiveRuntimeAdapter {
  return { descriptor: value, canHandle: () => true };
}

describe("ExecutiveRuntimeAdapterRegistry", () => {
  it("registers and retrieves a valid adapter by its stable ID", () => {
    const registry = createExecutiveRuntimeAdapterRegistry();
    registry.register(adapter());

    expect(registry.has("customers:update")).toBe(true);
    expect(registry.get("customers:update")?.descriptor.ownerBoundary).toBe("customers");
  });

  it("rejects duplicate adapter IDs", () => {
    const registry = createExecutiveRuntimeAdapterRegistry();
    registry.register(adapter());

    expect(() => registry.register(adapter())).toThrow(DuplicateExecutiveRuntimeAdapterError);
  });

  it.each([
    ["adapterId", { adapterId: "" }],
    ["ownerBoundary", { ownerBoundary: " " }],
    ["version", { version: "" }],
  ] as const)("rejects an empty %s", (_field, overrides) => {
    const registry = createExecutiveRuntimeAdapterRegistry();

    expect(() => registry.register(adapter(descriptor(overrides))))
      .toThrow(ExecutiveRuntimeAdapterContractError);
  });

  it("snapshots support lists and prevents source mutations from changing registration", () => {
    const capabilities = ["customer.update"];
    const strategies: ExecutionStrategy[] = ["UPDATE"];
    const modes: Exclude<ExecutionMode, "CLARIFICATION">[] = ["DRAFT"];
    const registry = createExecutiveRuntimeAdapterRegistry();
    registry.register(adapter(descriptor({
      supportedCapabilities: capabilities,
      supportedStrategies: strategies,
      supportedModes: modes,
    })));

    capabilities.push("customer.delete");
    strategies.push("DELETE");
    modes.push("EXECUTE");

    expect(registry.get("customers:update")?.descriptor).toMatchObject({
      supportedCapabilities: ["customer.update"],
      supportedStrategies: ["UPDATE"],
      supportedModes: ["DRAFT"],
    });
  });

  it("returns immutable get/list projections without exposing registry state", () => {
    const registry = createExecutiveRuntimeAdapterRegistry();
    registry.register(adapter());
    const registered = registry.get("customers:update")!;
    const listed = registry.list();

    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered.descriptor)).toBe(true);
    expect(Object.isFrozen(registered.descriptor.supportedCapabilities)).toBe(true);
    expect(Object.isFrozen(listed)).toBe(true);
    expect(() => (listed as ExecutiveRuntimeAdapter[]).pop()).toThrow();
    expect(registry.has("customers:update")).toBe(true);
  });

  it("unregisters only the requested adapter", () => {
    const registry = createExecutiveRuntimeAdapterRegistry();
    registry.register(adapter());
    registry.register(adapter(descriptor({ adapterId: "quotes:create", ownerBoundary: "quotes" })));

    expect(registry.unregister("customers:update")).toBe(true);
    expect(registry.has("customers:update")).toBe(false);
    expect(registry.has("quotes:create")).toBe(true);
    expect(registry.unregister("customers:update")).toBe(false);
  });

  it("does not select capability authority when multiple adapters declare the same capability", () => {
    const registry = createExecutiveRuntimeAdapterRegistry();
    registry.register(adapter());
    registry.register(adapter(descriptor({ adapterId: "customers:update-secondary", version: "2" })));

    expect(registry.list()).toHaveLength(2);
    expect(registry.get("customers:update")?.descriptor.version).toBe("1");
    expect(registry.get("customers:update-secondary")?.descriptor.version).toBe("2");
    expect("findByCapability" in registry).toBe(false);
  });

  it("lists adapters by stable adapterId rather than registration order", () => {
    const registry = createExecutiveRuntimeAdapterRegistry();
    registry.register(adapter(descriptor({ adapterId: "z-adapter" })));
    registry.register(adapter(descriptor({ adapterId: "a-adapter" })));

    expect(registry.list().map((item) => item.descriptor.adapterId)).toEqual(["a-adapter", "z-adapter"]);
  });
});
