import { describe, expect, it, vi } from "vitest";

import { applyCustomerEditCommand } from "../customer-edit-command-apply";
import type { CustomerEditSurfaceRuntimeAdapter } from "../customer-edit-command-apply";
import type { CustomerEditSurfaceState } from "../customer-edit-surface-runtime";
import type { CustomerRecord } from "../customers-client";

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
    billingAddress: { line1: "Eski Sk. 1", city: "Istanbul", district: "Kadikoy" },
    shippingAddress: null,
    eInvoiceEnabled: false,
    eArchiveEnabled: true,
    source: "manual",
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    primaryContact: null,
    ...overrides,
  };
}

function fakeRuntime(initial: Partial<CustomerEditSurfaceState>) {
  let state: CustomerEditSurfaceState = {
    loading: false,
    loadError: null,
    customer: null,
    draftId: "draft_1",
    draftSnapshot: null,
    activeTab: "identity",
    saving: false,
    saveError: null,
    blockingMessage: null,
    savedAt: null,
    ...initial,
  };

  const runtime: CustomerEditSurfaceRuntimeAdapter & { setState: (next: Partial<CustomerEditSurfaceState>) => void } = {
    getState: vi.fn(() => state),
    executeSurfaceAction: vi.fn(async (action: { actionName: string; payload?: Record<string, unknown> }) => {
      if (action.actionName === "draft.set_field") {
        state = {
          ...state,
          draftSnapshot: state.draftSnapshot
            ? { ...state.draftSnapshot, fieldValues: { ...state.draftSnapshot.fieldValues, [action.payload!.fieldName as string]: action.payload!.value } }
            : state.draftSnapshot,
        };
      }
      if (action.actionName === "draft.clear_field") {
        state = {
          ...state,
          draftSnapshot: state.draftSnapshot
            ? { ...state.draftSnapshot, fieldValues: { ...state.draftSnapshot.fieldValues, [action.payload!.fieldName as string]: null } }
            : state.draftSnapshot,
        };
      }
      if (action.actionName === "draft.revert_field") {
        // No-op stub — tests that need real revert semantics assert only
        // that executeSurfaceAction was called with the right fieldName.
      }
      if (action.actionName === "surface.select_tab") {
        state = { ...state, activeTab: String(action.payload?.tabId) };
      }
      if (action.actionName === "draft.commit") {
        // overridden per-test via setState before calling apply
      }
    }),
    setState: (next) => {
      state = { ...state, ...next };
    },
  };
  return runtime;
}

function draftSnapshotWith(fieldValues: Record<string, unknown>, dirtyFields: string[] = []) {
  return {
    draftId: "draft_1",
    entityType: "customer",
    entityId: "cust_1",
    baseVersion: 1,
    fieldValues,
    dirtyFields,
    valid: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("applyCustomerEditCommand — set_field", () => {
  it("sets a top-level field", async () => {
    const runtime = fakeRuntime({ draftSnapshot: draftSnapshotWith({ phone: "111" }) });

    const result = await applyCustomerEditCommand(
      { type: "set_field", field: { kind: "top", field: "phone" }, value: "0532 111 22 33" },
      runtime,
    );

    expect(runtime.executeSurfaceAction).toHaveBeenCalledWith({
      actionName: "draft.set_field",
      payload: { fieldName: "phone", value: "0532 111 22 33" },
    });
    expect(result).toEqual({
      status: "EXECUTED",
      command: { type: "set_field", field: { kind: "top", field: "phone" }, value: "0532 111 22 33" },
      appliedField: "phone",
      appliedValue: "0532 111 22 33",
    });
  });

  it("sets taxNumber", async () => {
    const runtime = fakeRuntime({ draftSnapshot: draftSnapshotWith({ taxNumber: "" }) });

    await applyCustomerEditCommand({ type: "set_field", field: { kind: "top", field: "taxNumber" }, value: "1234567890" }, runtime);

    expect(runtime.executeSurfaceAction).toHaveBeenCalledWith({
      actionName: "draft.set_field",
      payload: { fieldName: "taxNumber", value: "1234567890" },
    });
  });

  it("sets a nested billingAddress.city field while preserving the other address properties", async () => {
    const runtime = fakeRuntime({
      draftSnapshot: draftSnapshotWith({
        billingAddress: { line1: "Eski Sk. 1", district: "Kadikoy", city: "Istanbul", postalCode: "", country: "" },
      }),
    });

    const result = await applyCustomerEditCommand(
      { type: "set_field", field: { kind: "address", addressKind: "billingAddress", property: "city" }, value: "Ankara" },
      runtime,
    );

    expect(runtime.executeSurfaceAction).toHaveBeenCalledWith({
      actionName: "draft.set_field",
      payload: {
        fieldName: "billingAddress",
        value: { line1: "Eski Sk. 1", district: "Kadikoy", city: "Ankara", postalCode: "", country: "" },
      },
    });
    expect(result.status).toBe("EXECUTED");
  });

  it("sets eInvoiceEnabled to true", async () => {
    const runtime = fakeRuntime({ draftSnapshot: draftSnapshotWith({ eInvoiceEnabled: false }) });

    await applyCustomerEditCommand({ type: "set_field", field: { kind: "top", field: "eInvoiceEnabled" }, value: true }, runtime);

    expect(runtime.executeSurfaceAction).toHaveBeenCalledWith({
      actionName: "draft.set_field",
      payload: { fieldName: "eInvoiceEnabled", value: true },
    });
  });
});

describe("applyCustomerEditCommand — clear_field", () => {
  it("clears a nested address property to an empty string, not the whole address object", async () => {
    const runtime = fakeRuntime({
      draftSnapshot: draftSnapshotWith({
        billingAddress: { line1: "Eski Sk. 1", district: "Kadikoy", city: "Istanbul", postalCode: "", country: "" },
      }),
    });

    await applyCustomerEditCommand(
      { type: "clear_field", field: { kind: "address", addressKind: "billingAddress", property: "district" } },
      runtime,
    );

    expect(runtime.executeSurfaceAction).toHaveBeenCalledWith({
      actionName: "draft.set_field",
      payload: {
        fieldName: "billingAddress",
        value: { line1: "Eski Sk. 1", district: "", city: "Istanbul", postalCode: "", country: "" },
      },
    });
  });
});

describe("applyCustomerEditCommand — revert_field", () => {
  it("reverts a single nested address property to its baseline, preserving other dirty properties in the same object", async () => {
    const customer = makeCustomer({ billingAddress: { line1: "Eski Sk. 1", city: "Istanbul", district: "Kadikoy" } });
    const runtime = fakeRuntime({
      customer,
      draftSnapshot: draftSnapshotWith({
        billingAddress: { line1: "Eski Sk. 1", district: "Kadikoy", city: "Ankara", postalCode: "34000", country: "" },
      }),
    });

    const result = await applyCustomerEditCommand(
      { type: "revert_field", field: { kind: "address", addressKind: "billingAddress", property: "city" } },
      runtime,
    );

    expect(runtime.executeSurfaceAction).toHaveBeenCalledWith({
      actionName: "draft.set_field",
      payload: {
        fieldName: "billingAddress",
        value: { line1: "Eski Sk. 1", district: "Kadikoy", city: "Istanbul", postalCode: "34000", country: "" },
      },
    });
    expect(result.status).toBe("EXECUTED");
  });
});

describe("applyCustomerEditCommand — select_tab", () => {
  it("dispatches surface.select_tab for address", async () => {
    const runtime = fakeRuntime({});

    const result = await applyCustomerEditCommand({ type: "select_tab", tabId: "address" }, runtime);

    expect(runtime.executeSurfaceAction).toHaveBeenCalledWith({ actionName: "surface.select_tab", payload: { tabId: "address" } });
    expect(result).toEqual({ status: "EXECUTED", command: { type: "select_tab", tabId: "address" }, appliedField: "activeTab", appliedValue: "address" });
  });
});

describe("applyCustomerEditCommand — commit", () => {
  it("calls draft.commit (the existing save chain) and reports SAVED on success", async () => {
    const runtime = fakeRuntime({ savedAt: null });
    runtime.executeSurfaceAction = vi.fn(async () => {
      runtime.setState({ savedAt: Date.now() });
    });

    const result = await applyCustomerEditCommand({ type: "commit" }, runtime);

    expect(runtime.executeSurfaceAction).toHaveBeenCalledWith({ actionName: "draft.commit" });
    expect(result).toEqual({ status: "EXECUTED", command: { type: "commit" }, commitOutcome: "SAVED" });
  });

  it("reports SAVED_REFRESH_FAILED distinctly from SAVED", async () => {
    const runtime = fakeRuntime({ blockingMessage: null });
    runtime.executeSurfaceAction = vi.fn(async () => {
      runtime.setState({ blockingMessage: "Sayfayi yenileyin." });
    });

    const result = await applyCustomerEditCommand({ type: "commit" }, runtime);

    expect(result).toEqual({ status: "EXECUTED", command: { type: "commit" }, commitOutcome: "SAVED_REFRESH_FAILED" });
  });

  it("maps a save failure to EXECUTION_FAILED, not EXECUTED", async () => {
    const runtime = fakeRuntime({ saveError: null });
    runtime.executeSurfaceAction = vi.fn(async () => {
      runtime.setState({ saveError: "Baglanti kurulamadi." });
    });

    const result = await applyCustomerEditCommand({ type: "commit" }, runtime);

    expect(result).toEqual({ status: "EXECUTION_FAILED", error: "Baglanti kurulamadi." });
  });
});

describe("applyCustomerEditCommand — discard (cancel)", () => {
  it("reverts every currently dirty field via draft.revert_field, leaving the draft (and screen) usable", async () => {
    const runtime = fakeRuntime({
      draftSnapshot: draftSnapshotWith({ phone: "222", email: "new@b.com" }, ["phone", "email"]),
    });

    const result = await applyCustomerEditCommand({ type: "discard" }, runtime);

    expect(runtime.executeSurfaceAction).toHaveBeenCalledWith({ actionName: "draft.revert_field", payload: { fieldName: "phone" } });
    expect(runtime.executeSurfaceAction).toHaveBeenCalledWith({ actionName: "draft.revert_field", payload: { fieldName: "email" } });
    expect(runtime.executeSurfaceAction).not.toHaveBeenCalledWith({ actionName: "draft.discard" });
    expect(result).toEqual({ status: "EXECUTED", command: { type: "discard" }, revertedFields: ["phone", "email"] });
  });

  it("is a no-op (still EXECUTED) when there is nothing dirty to revert", async () => {
    const runtime = fakeRuntime({ draftSnapshot: draftSnapshotWith({ phone: "111" }, []) });

    const result = await applyCustomerEditCommand({ type: "discard" }, runtime);

    expect(runtime.executeSurfaceAction).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "EXECUTED", command: { type: "discard" }, revertedFields: [] });
  });
});
