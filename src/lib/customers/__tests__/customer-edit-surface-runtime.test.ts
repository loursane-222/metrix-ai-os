import { describe, expect, it, vi } from "vitest";

// Only getCustomer is faked here — the production-wrapper isolation tests
// below call createCustomerEditSurfaceRuntime() with NO injected deps (the
// real CustomerEditScreen path) and must not make a real fetch() call.
// archiveCustomer/executeCustomerUpdateAction stay real but are never
// exercised by these tests (no draft.commit/archive is dispatched on the
// production-wrapper runtimes).
vi.mock("../customers-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../customers-client")>();
  return {
    ...actual,
    getCustomer: vi.fn(),
  };
});

import { createPageContextRuntime } from "@/lib/action-runtime/context";
import { createDraftRuntime, DomainActionRejectedError, DraftNotFoundError } from "@/lib/action-runtime/draft";
import { getCustomer as getCustomerMock } from "../customers-client";
import type { CustomerRecord } from "../customers-client";
import {
  createCustomerEditSurfaceRuntime,
  createProductionCustomerEditSurfaceRuntimeDeps,
  type CustomerEditSurfaceRuntimeDeps,
} from "../customer-edit-surface-runtime";

function makeCustomer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: "cust_1",
    organizationId: "org_1",
    displayName: "Acme Ltd",
    legalName: "Acme Legal",
    phone: "111",
    email: "a@b.com",
    balanceCents: "0",
    currency: "TRY",
    tier: "gold",
    healthScore: 80,
    metrixNote: "note",
    status: "ACTIVE",
    cariKodu: "120.01",
    taxNumber: "1234567890",
    taxOffice: "Kadikoy",
    mersisNo: "0000",
    tradeRegistryNo: "1111",
    billingAddress: { line1: "Line 1", city: "Istanbul" },
    shippingAddress: null,
    eInvoiceEnabled: true,
    eArchiveEnabled: false,
    source: "manual",
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    primaryContact: null,
    ...overrides,
  };
}

let idCounter = 0;
function buildDeps(overrides: Partial<CustomerEditSurfaceRuntimeDeps> = {}) {
  const pageContext = createPageContextRuntime();
  const draftRuntime = createDraftRuntime({ pageContext });
  const deps: CustomerEditSurfaceRuntimeDeps = {
    pageContext,
    draftRuntime,
    getCustomer: vi.fn(),
    archiveCustomer: vi.fn(),
    executeCustomerUpdateAction: vi.fn(),
    generateDraftId: () => {
      idCounter += 1;
      return `draft_${idCounter}`;
    },
    generateIdempotencyKey: () => {
      idCounter += 1;
      return `idem_${idCounter}`;
    },
    ...overrides,
  };
  return { pageContext, draftRuntime, deps };
}

async function buildLoadedRuntime(params: { customer?: CustomerRecord } = {}) {
  const customer = params.customer ?? makeCustomer();
  const { pageContext, draftRuntime, deps } = buildDeps({
    getCustomer: vi.fn().mockResolvedValue({ ok: true, data: { customer } }),
  });
  const runtime = createCustomerEditSurfaceRuntime(customer.id, "identity", deps);
  await runtime.load();
  return { runtime, pageContext, draftRuntime, deps, customer };
}

describe("CustomerEditSurfaceRuntime — load", () => {
  it("loads the customer and grounds a clean draft", async () => {
    const { runtime, customer } = await buildLoadedRuntime();
    const state = runtime.getState();

    expect(state.loading).toBe(false);
    expect(state.customer).toEqual(customer);
    expect(state.draftId).not.toBeNull();
    expect(state.draftSnapshot?.dirtyFields).toEqual([]);
  });

  it("surfaces a load error without throwing", async () => {
    const { deps } = buildDeps({ getCustomer: vi.fn().mockResolvedValue({ ok: false, error: "Baglanti kurulamadi." }) });
    const runtime = createCustomerEditSurfaceRuntime("cust_1", "identity", deps);

    await runtime.load();

    const state = runtime.getState();
    expect(state.loading).toBe(false);
    expect(state.loadError).toBe("Baglanti kurulamadi.");
    expect(state.draftId).toBeNull();
  });
});

describe("CustomerEditSurfaceRuntime — executeSurfaceAction: draft.set_field", () => {
  it("mutates the draft through the real DraftRuntime and marks the field dirty", async () => {
    const { runtime } = await buildLoadedRuntime();

    await runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "phone", value: "222" } });

    const state = runtime.getState();
    expect(state.draftSnapshot?.fieldValues.phone).toBe("222");
    expect(state.draftSnapshot?.dirtyFields).toEqual(["phone"]);
  });

  it("rejects a fieldName that is not an editable Customer Edit field", async () => {
    const { runtime } = await buildLoadedRuntime();

    await expect(
      runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "organizationId", value: "org_HACKED" } }),
    ).rejects.toThrow();
  });

  it("is a no-op before a draft exists (e.g. still loading)", async () => {
    const { deps } = buildDeps({ getCustomer: vi.fn() });
    const runtime = createCustomerEditSurfaceRuntime("cust_1", "identity", deps);

    await expect(
      runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "phone", value: "222" } }),
    ).resolves.toBeUndefined();
    expect(runtime.getState().draftSnapshot).toBeNull();
  });
});

describe("CustomerEditSurfaceRuntime — executeSurfaceAction: draft.clear_field / draft.revert_field", () => {
  it("draft.clear_field nulls the field via the real DraftRuntime", async () => {
    const { runtime } = await buildLoadedRuntime();

    await runtime.executeSurfaceAction({ actionName: "draft.clear_field", payload: { fieldName: "phone" } });

    expect(runtime.getState().draftSnapshot?.fieldValues.phone).toBeNull();
  });

  it("draft.revert_field restores the baseline value and clears dirty", async () => {
    const { runtime } = await buildLoadedRuntime();

    await runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "phone", value: "222" } });
    await runtime.executeSurfaceAction({ actionName: "draft.revert_field", payload: { fieldName: "phone" } });

    const state = runtime.getState();
    expect(state.draftSnapshot?.fieldValues.phone).toBe("111");
    expect(state.draftSnapshot?.dirtyFields).toEqual([]);
  });
});

describe("CustomerEditSurfaceRuntime — executeSurfaceAction: surface.select_tab", () => {
  it("updates activeTab as local runtime state without bumping the Page Context version", async () => {
    const { runtime, pageContext } = await buildLoadedRuntime();
    const versionBefore = pageContext.getCurrentContext()?.version;

    await runtime.executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: "official" } });

    expect(runtime.getState().activeTab).toBe("official");
    expect(pageContext.getCurrentContext()?.version).toBe(versionBefore);
  });

  it("never stales the in-flight draft — a field edit still succeeds after switching tabs", async () => {
    const { runtime } = await buildLoadedRuntime();

    await runtime.executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: "official" } });
    await expect(
      runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "phone", value: "222" } }),
    ).resolves.toBeUndefined();

    expect(runtime.getState().draftSnapshot?.fieldValues.phone).toBe("222");
  });
});

describe("CustomerEditSurfaceRuntime — executeSurfaceAction: draft.commit", () => {
  it("runs the existing save chain end to end and rebases to a clean draft on success", async () => {
    const customer = makeCustomer();
    const { pageContext, draftRuntime, deps } = buildDeps({
      getCustomer: vi.fn().mockResolvedValue({ ok: true, data: { customer } }),
    });
    const executeCustomerUpdateAction = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { execution: { actionName: "customer.update", executionId: "exec_1", status: "SUCCESS" } } });
    const refreshedCustomer = makeCustomer({ phone: "222", updatedAt: "2026-01-02T00:00:00.000Z" });
    deps.executeCustomerUpdateAction = executeCustomerUpdateAction;
    deps.getCustomer = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { customer } })
      .mockResolvedValueOnce({ ok: true, data: { customer: refreshedCustomer } });

    const runtime = createCustomerEditSurfaceRuntime(customer.id, "identity", deps);
    await runtime.load();
    const draftIdBeforeCommit = runtime.getState().draftId!;

    await runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "phone", value: "222" } });
    await runtime.executeSurfaceAction({ actionName: "draft.commit" });

    const state = runtime.getState();
    expect(executeCustomerUpdateAction).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: customer.id, patch: { phone: "222" }, expectedVersion: customer.updatedAt }),
    );
    expect(state.saving).toBe(false);
    expect(state.customer).toEqual(refreshedCustomer);
    expect(state.draftSnapshot?.dirtyFields).toEqual([]);
    expect(state.savedAt).not.toBeNull();
    expect(() => draftRuntime.captureDraft(draftIdBeforeCommit)).toThrow(DraftNotFoundError);
    expect(pageContext.getCurrentContext()).not.toBeNull();
  });

  it("keeps the draft dirty and surfaces the server error on execution failure", async () => {
    const customer = makeCustomer();
    const { deps } = buildDeps({
      getCustomer: vi.fn().mockResolvedValue({ ok: true, data: { customer } }),
      executeCustomerUpdateAction: vi.fn().mockResolvedValue({ ok: false, error: "Baglanti kurulamadi." }),
    });
    const runtime = createCustomerEditSurfaceRuntime(customer.id, "identity", deps);
    await runtime.load();

    await runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "phone", value: "222" } });
    await runtime.executeSurfaceAction({ actionName: "draft.commit" });

    const state = runtime.getState();
    expect(state.saveError).toBe("Baglanti kurulamadi.");
    expect(state.saving).toBe(false);
    expect(state.draftSnapshot?.dirtyFields).toEqual(["phone"]);
  });

  it("returns a committed-but-refresh-failed state without discarding the draft", async () => {
    const customer = makeCustomer();
    const { deps } = buildDeps({
      getCustomer: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, data: { customer } })
        .mockResolvedValueOnce({ ok: false, error: "Baglanti kurulamadi." }),
      executeCustomerUpdateAction: vi
        .fn()
        .mockResolvedValue({ ok: true, data: { execution: { actionName: "customer.update", executionId: "exec_1", status: "SUCCESS" } } }),
    });
    const runtime = createCustomerEditSurfaceRuntime(customer.id, "identity", deps);
    await runtime.load();
    const draftId = runtime.getState().draftId!;

    await runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "phone", value: "222" } });
    await runtime.executeSurfaceAction({ actionName: "draft.commit" });

    const state = runtime.getState();
    expect(state.blockingMessage).toMatch(/Sayfayi yenileyin/);
    expect(state.draftId).toBe(draftId);
    expect(state.draftSnapshot?.dirtyFields).toEqual(["phone"]);
  });

  it("does not call the save chain when displayName is blank", async () => {
    const executeCustomerUpdateAction = vi.fn();
    const customer = makeCustomer();
    const { deps } = buildDeps({
      getCustomer: vi.fn().mockResolvedValue({ ok: true, data: { customer } }),
      executeCustomerUpdateAction,
    });
    const runtime = createCustomerEditSurfaceRuntime(customer.id, "identity", deps);
    await runtime.load();

    await runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "displayName", value: "   " } });
    await runtime.executeSurfaceAction({ actionName: "draft.commit" });

    expect(executeCustomerUpdateAction).not.toHaveBeenCalled();
    expect(runtime.getState().saveError).toBe("Firma adi gerekli.");
  });
});

describe("CustomerEditSurfaceRuntime — executeSurfaceAction: draft.discard", () => {
  it("uses the existing discard behavior and clears draft state", async () => {
    const { runtime, draftRuntime } = await buildLoadedRuntime();
    const draftId = runtime.getState().draftId!;

    await runtime.executeSurfaceAction({ actionName: "draft.discard" });

    expect(runtime.getState().draftId).toBeNull();
    expect(runtime.getState().draftSnapshot).toBeNull();
    expect(() => draftRuntime.captureDraft(draftId)).toThrow(DraftNotFoundError);
  });
});

describe("CustomerEditSurfaceRuntime — architecture boundary", () => {
  it("rejects a DOMAIN action instead of executing it", async () => {
    const { runtime } = await buildLoadedRuntime();

    await expect(
      runtime.executeSurfaceAction({
        // @ts-expect-error — intentionally an unsupported/DOMAIN action name to prove the boundary check
        actionName: "customer.update",
        payload: {},
      }),
    ).rejects.toThrow(DomainActionRejectedError);
  });
});

describe("CustomerEditSurfaceRuntime — React bridge subscribe/notify contract", () => {
  it("notifies subscribed listeners synchronously on every state-changing action", async () => {
    const { runtime } = await buildLoadedRuntime();
    const listener = vi.fn();
    runtime.subscribe(listener);

    await runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "phone", value: "222" } });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying once unsubscribed", async () => {
    const { runtime } = await buildLoadedRuntime();
    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(listener);
    unsubscribe();

    await runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "phone", value: "222" } });

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies every independent subscriber (multiple external listeners, e.g. METRIX + React)", async () => {
    const { runtime } = await buildLoadedRuntime();
    const external = vi.fn();
    const reactBridge = vi.fn();
    runtime.subscribe(external);
    runtime.subscribe(reactBridge);

    await runtime.executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: "official" } });

    expect(external).toHaveBeenCalledTimes(1);
    expect(reactBridge).toHaveBeenCalledTimes(1);
  });

  it("returns a new state snapshot (referentially distinct) after each mutation, so a React equality check re-renders", async () => {
    const { runtime } = await buildLoadedRuntime();
    const before = runtime.getState();

    await runtime.executeSurfaceAction({ actionName: "surface.select_tab", payload: { tabId: "official" } });
    const after = runtime.getState();

    expect(after).not.toBe(before);
    expect(after.activeTab).toBe("official");
  });

  it("an externally-triggered mutation (not originating from a UI dispatch) is visible to a subscribed listener exactly like a local one", async () => {
    const { runtime } = await buildLoadedRuntime();
    let observedPhone: unknown;
    runtime.subscribe(() => {
      observedPhone = runtime.getState().draftSnapshot?.fieldValues.phone;
    });

    // Simulates an external caller (e.g. METRIX) holding a reference to this
    // runtime instance and dispatching a surface action directly.
    await runtime.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "phone", value: "999" } });

    expect(observedPhone).toBe("999");
  });
});

describe("CustomerEditSurfaceRuntime — per-screen isolation (production wrapper)", () => {
  it("createProductionCustomerEditSurfaceRuntimeDeps() builds a fresh PageContextRuntime/DraftRuntime pair every call", () => {
    const depsA = createProductionCustomerEditSurfaceRuntimeDeps();
    const depsB = createProductionCustomerEditSurfaceRuntimeDeps();

    expect(depsA.pageContext).not.toBe(depsB.pageContext);
    expect(depsA.draftRuntime).not.toBe(depsB.draftRuntime);

    depsA.pageContext.createContext({
      module: "customers",
      surface: "customer-edit",
      route: "/metrix/customers/cust_a/edit",
      entityType: "customer",
      entityId: "cust_a",
    });

    // If these shared the app-wide singleton, B would see A's context too.
    expect(depsB.pageContext.getCurrentContext()).toBeNull();
  });

  it("two runtimes created via the production wrapper (no injected deps) do not share a Page Context and cannot stale each other", async () => {
    const customerA = makeCustomer({ id: "cust_a" });
    const customerB = makeCustomer({ id: "cust_b" });
    vi.mocked(getCustomerMock)
      .mockReset()
      .mockResolvedValueOnce({ ok: true, data: { customer: customerA } })
      .mockResolvedValueOnce({ ok: true, data: { customer: customerB } });

    // Neither call passes deps — this is exactly the real
    // useCustomerEditSurfaceRuntime() path for two mounted Customer Edit screens.
    const runtimeA = createCustomerEditSurfaceRuntime(customerA.id, "identity");
    await runtimeA.load();
    const runtimeB = createCustomerEditSurfaceRuntime(customerB.id, "identity");
    await runtimeB.load();

    expect(runtimeA.getState().customer?.id).toBe("cust_a");
    expect(runtimeB.getState().customer?.id).toBe("cust_b");

    // Before the fix, runtimeB.load() replaced the shared singleton Page
    // Context, and this would throw VersionMismatchError for runtime A.
    await expect(
      runtimeA.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "phone", value: "222" } }),
    ).resolves.toBeUndefined();
    await expect(
      runtimeB.executeSurfaceAction({ actionName: "draft.set_field", payload: { fieldName: "phone", value: "333" } }),
    ).resolves.toBeUndefined();

    expect(runtimeA.getState().draftSnapshot?.fieldValues.phone).toBe("222");
    expect(runtimeB.getState().draftSnapshot?.fieldValues.phone).toBe("333");

    runtimeA.dispose();
    runtimeB.dispose();
  });
});
