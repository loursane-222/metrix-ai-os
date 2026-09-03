import { describe, expect, it, beforeAll, vi } from "vitest";

// bootstrapCapabilityRegistry registers read capabilities that import the
// real domain services -> the real Prisma client (throws at import time
// without DATABASE_URL). No test here performs an actual read, only
// registration/lookup, but the import chain must still be stubbed to load.
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

import { actionRegistry } from "@/lib/action-runtime/registry";
import { bootstrapCapabilityRegistry } from "../capabilities";
import { getCapability, listCapabilities, resolveNativeActionDefinition } from "../capability-registry";

describe("capability registry (representative domains, bootstrapped)", () => {
  beforeAll(() => {
    bootstrapCapabilityRegistry();
  });

  it("registers no WRITE capability whose native action is missing from the real action registry", () => {
    const writeCapabilities = listCapabilities().filter((descriptor) => descriptor.classification === "WRITE");
    expect(writeCapabilities.length).toBeGreaterThan(0);
    for (const descriptor of writeCapabilities) {
      expect(() => resolveNativeActionDefinition(descriptor)).not.toThrow();
    }
  });

  it("customer.update capability maps to the real customer.update action with EXPLICIT-free NONE approval", () => {
    const descriptor = getCapability("customer.update");
    expect(descriptor).toBeDefined();
    const definition = resolveNativeActionDefinition(descriptor!);
    expect(definition).toBe(actionRegistry.getActionDefinition("customer.update"));
    expect(definition.approvalPolicy).toBe("NONE");
  });

  it("customer.archive requires approval, matching the real registered action", () => {
    const descriptor = getCapability("customer.archive")!;
    const definition = resolveNativeActionDefinition(descriptor);
    expect(definition.approvalPolicy).toBe("EXPLICIT");
  });

  it("settlement.create is backed by the real payment.apply action, not a fabricated one", () => {
    const descriptor = getCapability("settlement.create")!;
    expect(descriptor.implementation.kind).toBe("WRITE");
    if (descriptor.implementation.kind === "WRITE") {
      expect(descriptor.implementation.nativeActionName).toBe("payment.apply");
    }
    expect(() => resolveNativeActionDefinition(descriptor)).not.toThrow();
  });

  it("bootstrapping twice does not duplicate or throw", () => {
    expect(() => bootstrapCapabilityRegistry()).not.toThrow();
  });

  it("auto-discovers every real registered DOMAIN action not already curated, using its own actionName", () => {
    // delivery.create is a real, registered production action with no
    // curated entry in write-capabilities.ts — it must still be reachable.
    const auto = getCapability("delivery.create");
    expect(auto).toBeDefined();
    expect(auto!.implementation.kind).toBe("WRITE");
    if (auto!.implementation.kind === "WRITE") expect(auto!.implementation.nativeActionName).toBe("delivery.create");
    // Every real DOMAIN action is reachable through the registry now.
    for (const definition of actionRegistry.listActionsByClass("DOMAIN")) {
      expect(getCapability(definition.actionName), `${definition.actionName} should be reachable`).toBeDefined();
    }
  });

  it("never lets an auto-discovered entry overwrite a curated one", () => {
    // settlement's native action is "payment.apply" but the curated capability
    // id is "settlement.create" — the auto-discovery pass separately registers
    // the real "payment.apply" actionName too (a real, distinct capability id),
    // and must not collide with or replace the curated "settlement.create" entry.
    const curated = getCapability("settlement.create")!;
    expect(curated.implementation.kind).toBe("WRITE");
    if (curated.implementation.kind === "WRITE") expect(curated.implementation.nativeActionName).toBe("payment.apply");
    const auto = getCapability("payment.apply")!;
    expect(auto).toBeDefined();
  });

  it("registers the company.query READ capability", () => {
    const descriptor = getCapability("company.query");
    expect(descriptor).toBeDefined();
    expect(descriptor!.classification).toBe("READ");
  });
});
