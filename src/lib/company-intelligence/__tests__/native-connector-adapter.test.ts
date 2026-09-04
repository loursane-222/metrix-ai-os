import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real bootstrapCapabilityRegistry() pulls in every domain service
// (customer, quote, order, invoice, ...) transitively, which needs a real
// Prisma client. Stubbed here so this test can register just one fake
// "customer.read" capability directly via the real capability-registry —
// same isolation approach native-connector.test.ts already uses.
vi.mock("@/lib/canonical-operation/capabilities", () => ({ bootstrapCapabilityRegistry: vi.fn() }));

import { registerCapability, resetCapabilityRegistryForTests } from "@/lib/canonical-operation/capability-registry";
import { nativeConnectorAdapter } from "../native-connector-adapter";

describe("nativeConnectorAdapter", () => {
  beforeEach(() => {
    resetCapabilityRegistryForTests();
    registerCapability({
      capabilityId: "customer.read",
      domain: "customer",
      classification: "READ",
      implementation: {
        kind: "READ",
        read: async (organizationId, entityId) => (entityId === "known-customer" ? { id: entityId, displayName: "Atlas" } : null),
      },
    });
  });
  afterEach(() => resetCapabilityRegistryForTests());

  it("declares its provider as METRIX", () => {
    expect(nativeConnectorAdapter.provider).toBe("METRIX");
  });

  it("reports HEALTHY", async () => {
    const health = await nativeConnectorAdapter.health("org-1");
    expect(health.status).toBe("HEALTHY");
  });

  it("reads a resolved native customer through the real capability-registry read implementation", async () => {
    const result = await nativeConnectorAdapter.read({ organizationId: "org-1", factScope: "customer.profile", externalEntityType: "customer", externalEntityId: "known-customer" });
    expect(result).toMatchObject({ status: "OK", value: { id: "known-customer", displayName: "Atlas" } });
  });

  it("is NOT_FOUND for an entity the native repository doesn't have", async () => {
    const result = await nativeConnectorAdapter.read({ organizationId: "org-1", factScope: "customer.profile", externalEntityId: "missing-customer" });
    expect(result.status).toBe("NOT_FOUND");
  });

  it("is UNSUPPORTED for a fact scope it has no capability mapping for", async () => {
    const result = await nativeConnectorAdapter.read({ organizationId: "org-1", factScope: "customer.accountingBalance", externalEntityId: "known-customer" });
    expect(result.status).toBe("UNSUPPORTED");
  });

  it("is UNSUPPORTED when no externalEntityId is given", async () => {
    const result = await nativeConnectorAdapter.read({ organizationId: "org-1", factScope: "customer.profile" });
    expect(result.status).toBe("UNSUPPORTED");
  });
});
