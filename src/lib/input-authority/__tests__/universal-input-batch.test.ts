import { describe, expect, it, vi } from "vitest";
import { executeUniversalInputBatch } from "../batch";
import { UniversalInputAuthorityHost } from "../host";
import { UniversalInputRegistry } from "../registry";

describe("executeUniversalInputBatch", () => {
  it("executes ordered adapter mutations within the exact expected surface and focuses once by policy", async () => {
    const registry = new UniversalInputRegistry(); const host = new UniversalInputAuthorityHost(registry); const order: string[] = [];
    registry.register({ descriptor: { executiveTargetId: "surface", authorityKey: "customers.customer.create", targetKind: "surface", surfaceType: "form", module: "customers", label: "Create", mounted: true, active: true, visibility: "visible" }, adapter: {} });
    for (const id of ["phone", "email"]) registry.register({ descriptor: { executiveTargetId: id, authorityKey: `customers.customer.${id}`, targetKind: "field", module: "customers", label: id, parentTargetId: "surface", mutable: true }, adapter: { set: (value) => order.push(`${id}:${value}`) } });
    const result = await executeUniversalInputBatch({ commands: [{ type: "SET", executiveTargetId: "phone", value: "1" }, { type: "SET", executiveTargetId: "email", value: "a@b.co" }], expectedSurfaceAuthorityKey: "customers.customer.create", registry, host });
    expect(order).toEqual(["phone:1", "email:a@b.co"]); expect(result.changedExecutiveTargetIds).toEqual(["phone", "email"]); expect(result.finalFocusTargetId).toBe("phone");
  });
  it("reports missing, rejected, and stale targets without DOM mutation", async () => {
    const registry = new UniversalInputRegistry(); const host = new UniversalInputAuthorityHost(registry); const set = vi.fn();
    registry.register({ descriptor: { executiveTargetId: "other", authorityKey: "other.surface", targetKind: "surface", surfaceType: "form", module: "other", label: "Other" }, adapter: {} });
    registry.register({ descriptor: { executiveTargetId: "wrong", authorityKey: "other.field", targetKind: "field", module: "other", label: "Wrong", parentTargetId: "other", mutable: true }, adapter: { set } });
    const result = await executeUniversalInputBatch({ commands: [{ type: "SET", executiveTargetId: "missing", value: "x" }, { type: "SET", executiveTargetId: "wrong", value: "x" }], expectedSurfaceAuthorityKey: "customers.customer.create", registry, host });
    expect(result.outcomes.map((item) => item.status)).toEqual(["MISSING", "REJECTED"]); expect(set).not.toHaveBeenCalled();
  });
});
