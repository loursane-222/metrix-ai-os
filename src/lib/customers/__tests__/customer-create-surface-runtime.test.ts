import { describe, expect, it, vi } from "vitest";
import { CustomerCreateSurfaceRuntime } from "../customer-create-surface-runtime";
describe("CustomerCreateSurfaceRuntime", () => {
  it("mounts, shares local/external state and blocks missing displayName", async () => {
    const executeCreate = vi.fn(); const runtime = new CustomerCreateSurfaceRuntime({ executeCreate, generateId: () => "idem" });
    expect((await runtime.execute({ type: "commit" })).status).toBe("REJECTED");
    runtime.mount();
    expect((await runtime.execute({ type: "commit" })).status).toBe("MISSING_FIELDS");
    expect(executeCreate).not.toHaveBeenCalled();
    await runtime.execute({ type: "set_field", field: "displayName", value: "Acme" });
    expect(runtime.getState().draft.displayName).toBe("Acme");
  });
  it("uses the real execution entity id for navigation and rejects after unmount", async () => {
    const runtime = new CustomerCreateSurfaceRuntime({ executeCreate: vi.fn().mockResolvedValue({ ok: true, data: { execution: { actionName: "customer.create", executionId: "e", status: "SUCCESS", outcome: "SUCCEEDED", correlationId: "c", operationId: "o", entityRef: { entityType: "customer", entityId: "real-customer" } } } }), generateId: () => "idem" });
    runtime.mount(); await runtime.execute({ type: "set_field", field: "displayName", value: "Acme" });
    await expect(runtime.execute({ type: "commit" })).resolves.toMatchObject({ status: "EXECUTED", navigation: { kind: "customer.detail", customerId: "real-customer" } });
    runtime.dispose(); expect((await runtime.execute({ type: "commit" })).status).toBe("REJECTED");
  });
  it("keeps API failure visible", async () => {
    const runtime = new CustomerCreateSurfaceRuntime({ executeCreate: vi.fn().mockResolvedValue({ ok: false, error: "Gercek hata" }), generateId: () => "idem" }); runtime.mount();
    await runtime.execute({ type: "set_field", field: "displayName", value: "Acme" }); await runtime.execute({ type: "commit" });
    expect(runtime.getState()).toMatchObject({ submitting: false, error: "Gercek hata", result: null });
  });
  it("protects duplicate commit", async () => {
    let release!: (value: unknown) => void; const pending = new Promise((resolve) => { release = resolve; });
    const runtime = new CustomerCreateSurfaceRuntime({ executeCreate: vi.fn(() => pending as never), generateId: () => "idem" }); runtime.mount(); await runtime.execute({ type: "set_field", field: "displayName", value: "Acme" });
    const first = runtime.execute({ type: "commit" }); expect((await runtime.execute({ type: "commit" })).status).toBe("REJECTED"); release({ ok: false, error: "x" }); await first;
  });
});
