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

  it("still reports a durable server-side success as EXECUTED even if the Surface unmounted while the request was in flight", async () => {
    // Regression test for a production incident: the create actually
    // succeeded server-side (entity persisted), but the Surface unmounted
    // (e.g. a concurrent navigation) before the response arrived, and the
    // runtime used to check `this.state.mounted` *after* awaiting the
    // response and discard a real success as REJECTED — telling the user
    // "couldn't complete this" for a create that had already durably
    // happened, which then made every retry hit createNewCustomer's
    // duplicate-identity guard ("a record already exists").
    let release!: (value: unknown) => void;
    const pending = new Promise((resolve) => { release = resolve; });
    const runtime = new CustomerCreateSurfaceRuntime({ executeCreate: vi.fn(() => pending as never), generateId: () => "idem" });
    runtime.mount();
    await runtime.execute({ type: "set_field", field: "displayName", value: "Acme" });
    const commit = runtime.execute({ type: "commit" });
    runtime.dispose(); // Surface unmounts while the request is still pending.
    release({ ok: true, data: { execution: { actionName: "customer.create", executionId: "e", status: "SUCCESS", outcome: "SUCCEEDED", correlationId: "c", operationId: "o", entityRef: { entityType: "customer", entityId: "real-customer" } } } });
    await expect(commit).resolves.toMatchObject({ status: "EXECUTED", navigation: { kind: "customer.detail", customerId: "real-customer" } });
  });

  it("reuses the same idempotency key across repeated commit attempts on the same runtime instance, not a fresh one each time", async () => {
    const keys: string[] = [];
    let call = 0;
    const executeCreate = vi.fn(async (_body, idempotencyKey: string) => {
      keys.push(idempotencyKey);
      call += 1;
      return call === 1
        ? { ok: false, error: "Gecici hata" }
        : { ok: true, data: { execution: { actionName: "customer.create", executionId: "e", status: "SUCCESS", outcome: "SUCCEEDED", correlationId: "c", operationId: "o", entityRef: { entityType: "customer", entityId: "real-customer" } } } };
    });
    let generated = 0;
    const runtime = new CustomerCreateSurfaceRuntime({ executeCreate: executeCreate as never, generateId: () => `idem-${++generated}` });
    runtime.mount();
    await runtime.execute({ type: "set_field", field: "displayName", value: "Acme" });
    await runtime.execute({ type: "commit" });
    await runtime.execute({ type: "commit" });
    expect(keys).toEqual(["idem-1", "idem-1"]);
    expect(generated).toBe(1);
  });
});
