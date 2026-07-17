import { describe, expect, it, vi } from "vitest";

import { createPageContextRuntime } from "@/lib/action-runtime/context";
import { createDraftRuntime, DraftNotFoundError } from "@/lib/action-runtime/draft";
import * as customersClient from "../customers-client";
import type { CustomerRecord } from "../customers-client";
import {
  CUSTOMER_EDIT_FIELD_NAMES,
  CUSTOMER_EDIT_MODULE,
  EMPTY_CUSTOMER_EDIT_ADDRESS,
  customerToDraftFieldValues,
  establishCustomerEditContext,
  isCustomerEditSaveDisabled,
  normalizeCustomerUpdatePatch,
  performCustomerEditSave,
  releaseCustomerEditDraft,
} from "../customer-edit-draft";

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
    primaryContact: {
      id: "contact_1",
      customerId: "cust_1",
      fullName: "Jane Doe",
      title: "CFO",
      phone: "111",
      email: "a@b.com",
      isPrimary: true,
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

function setupRuntimes() {
  const pageContext = createPageContextRuntime();
  const draftRuntime = createDraftRuntime({ pageContext });
  return { pageContext, draftRuntime };
}

let idCounter = 0;
function generateDraftId(): string {
  idCounter += 1;
  return `draft_${idCounter}`;
}

describe("customerToDraftFieldValues", () => {
  it("only carries the fields customer.update accepts", () => {
    const values = customerToDraftFieldValues(makeCustomer());

    expect(Object.keys(values).sort()).toEqual([...CUSTOMER_EDIT_FIELD_NAMES].sort());
  });

  it("never exposes currency, balanceCents or primaryContact as an editable draft field", () => {
    const values = customerToDraftFieldValues(makeCustomer());

    expect(values).not.toHaveProperty("currency");
    expect(values).not.toHaveProperty("balanceCents");
    expect(values).not.toHaveProperty("primaryContact");
    expect(CUSTOMER_EDIT_FIELD_NAMES).not.toContain("currency");
  });
});

describe("establishCustomerEditContext — load", () => {
  it("creates a Page Context grounded on the customer and a clean draft matching the loaded record", () => {
    const { pageContext, draftRuntime } = setupRuntimes();
    const customer = makeCustomer();

    const { draftId, contextSnapshot, draftSnapshot } = establishCustomerEditContext({
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      fieldValues: customerToDraftFieldValues(customer),
      generateDraftId,
    });

    expect(contextSnapshot.module).toBe(CUSTOMER_EDIT_MODULE);
    expect(contextSnapshot.entityType).toBe("customer");
    expect(contextSnapshot.entityId).toBe(customer.id);
    expect(contextSnapshot.route).toBe(`/metrix/customers/${customer.id}/edit`);
    expect(contextSnapshot.activeDraftId).toBe(draftId);
    expect(draftSnapshot.dirtyFields).toEqual([]);
    expect(draftSnapshot.fieldValues.displayName).toBe("Acme Ltd");
  });

  it("safely replaces a context left over from another screen instead of throwing", () => {
    const { pageContext, draftRuntime } = setupRuntimes();
    pageContext.createContext({
      module: "quotes",
      surface: "create",
      route: "/metrix/quotes/new",
    });

    const customer = makeCustomer();
    expect(() =>
      establishCustomerEditContext({
        pageContext,
        draftRuntime,
        customerId: customer.id,
        activeTab: "identity",
        fieldValues: customerToDraftFieldValues(customer),
        generateDraftId,
      }),
    ).not.toThrow();
  });
});

describe("field updates", () => {
  it("routes through DraftRuntime.updateField and marks the field dirty", () => {
    const { pageContext, draftRuntime } = setupRuntimes();
    const customer = makeCustomer();
    const { draftId } = establishCustomerEditContext({
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      fieldValues: customerToDraftFieldValues(customer),
      generateDraftId,
    });

    const updated = draftRuntime.updateField(draftId, "phone", "222");

    expect(updated.fieldValues.phone).toBe("222");
    expect(updated.dirtyFields).toEqual(["phone"]);
  });

  it("clears dirty once the value returns to the baseline", () => {
    const { pageContext, draftRuntime } = setupRuntimes();
    const customer = makeCustomer();
    const { draftId } = establishCustomerEditContext({
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      fieldValues: customerToDraftFieldValues(customer),
      generateDraftId,
    });

    draftRuntime.updateField(draftId, "phone", "222");
    const reverted = draftRuntime.updateField(draftId, "phone", customer.phone);

    expect(reverted.dirtyFields).toEqual([]);
  });

  it("replaces the whole nested address object immutably and tracks it as dirty", () => {
    const { pageContext, draftRuntime } = setupRuntimes();
    const customer = makeCustomer();
    const { draftId, draftSnapshot } = establishCustomerEditContext({
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      fieldValues: customerToDraftFieldValues(customer),
      generateDraftId,
    });

    const baselineAddress = draftSnapshot.fieldValues.billingAddress as Record<string, unknown>;
    const nextAddress = { ...baselineAddress, city: "Ankara" };
    const updated = draftRuntime.updateField(draftId, "billingAddress", nextAddress);

    expect(updated.fieldValues.billingAddress).toEqual(nextAddress);
    expect(updated.dirtyFields).toEqual(["billingAddress"]);
    // baseline snapshot must stay untouched (immutability)
    expect((draftSnapshot.fieldValues.billingAddress as Record<string, unknown>).city).toBe("Istanbul");
  });
});

describe("isCustomerEditSaveDisabled", () => {
  it("disables save when there is no draft, when saving, or when the draft is not dirty", () => {
    const { pageContext, draftRuntime } = setupRuntimes();
    const customer = makeCustomer();
    const { draftSnapshot } = establishCustomerEditContext({
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      fieldValues: customerToDraftFieldValues(customer),
      generateDraftId,
    });

    expect(isCustomerEditSaveDisabled({ saving: false, draftSnapshot: null })).toBe(true);
    expect(isCustomerEditSaveDisabled({ saving: true, draftSnapshot })).toBe(true);
    expect(isCustomerEditSaveDisabled({ saving: false, draftSnapshot })).toBe(true);

    const dirty = draftRuntime.updateField(draftSnapshot.draftId, "phone", "222");
    expect(isCustomerEditSaveDisabled({ saving: false, draftSnapshot: dirty })).toBe(false);
  });
});

describe("normalizeCustomerUpdatePatch", () => {
  it("trims displayName", () => {
    expect(normalizeCustomerUpdatePatch({ displayName: "  Acme  " })).toEqual({ displayName: "Acme" });
  });

  it("drops an optional string field cleared to empty rather than sending an empty string", () => {
    expect(normalizeCustomerUpdatePatch({ legalName: "" })).toEqual({});
    expect(normalizeCustomerUpdatePatch({ legalName: "   " })).toEqual({});
  });

  it("keeps a non-empty optional string field", () => {
    expect(normalizeCustomerUpdatePatch({ phone: "222" })).toEqual({ phone: "222" });
  });

  it("reduces an address to only its non-empty entries, and drops it entirely if fully empty", () => {
    const partial = normalizeCustomerUpdatePatch({
      billingAddress: { ...EMPTY_CUSTOMER_EDIT_ADDRESS, city: "Ankara" },
    });
    expect(partial).toEqual({ billingAddress: { city: "Ankara" } });

    const empty = normalizeCustomerUpdatePatch({ shippingAddress: { ...EMPTY_CUSTOMER_EDIT_ADDRESS } });
    expect(empty).toEqual({});
  });

  it("passes booleans and status through unchanged", () => {
    expect(normalizeCustomerUpdatePatch({ eInvoiceEnabled: true, status: "BLOCKED" })).toEqual({
      eInvoiceEnabled: true,
      status: "BLOCKED",
    });
  });
});

function makeSaveHarness(customer: CustomerRecord) {
  const { pageContext, draftRuntime } = setupRuntimes();
  const { draftId } = establishCustomerEditContext({
    pageContext,
    draftRuntime,
    customerId: customer.id,
    activeTab: "identity",
    fieldValues: customerToDraftFieldValues(customer),
    generateDraftId,
  });
  return { pageContext, draftRuntime, draftId };
}

let idempotencyCounter = 0;
function generateIdempotencyKey(): string {
  idempotencyCounter += 1;
  return `idem_${idempotencyCounter}`;
}

describe("performCustomerEditSave — success", () => {
  it("commits the real draft, sends the normalized patch and expectedVersion, and rebases after a successful refresh", async () => {
    const customer = makeCustomer();
    const { pageContext, draftRuntime, draftId } = makeSaveHarness(customer);
    const dirtyDraft = draftRuntime.updateField(draftId, "phone", "222");

    const refreshedCustomer = makeCustomer({ phone: "222", updatedAt: "2026-01-02T00:00:00.000Z" });
    const executeCustomerUpdateAction = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { execution: { actionName: "customer.update", executionId: "exec_1", status: "SUCCESS" } } });
    const getCustomer = vi.fn().mockResolvedValue({ ok: true, data: { customer: refreshedCustomer } });

    const result = await performCustomerEditSave({
      executeCustomerUpdateAction,
      getCustomer,
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      draftSnapshot: dirtyDraft,
      expectedVersion: customer.updatedAt,
      generateDraftId,
      generateIdempotencyKey,
    });

    expect(executeCustomerUpdateAction).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: customer.id,
        patch: { phone: "222" },
        expectedVersion: customer.updatedAt,
        originatingDraftId: draftId,
        idempotencyKey: expect.any(String),
      }),
    );
    expect(getCustomer).toHaveBeenCalledWith(customer.id);

    expect(result.status).toBe("SAVED");
    if (result.status !== "SAVED") throw new Error("expected SAVED");
    expect(result.draftId).not.toBe(draftId);
    expect(result.draftSnapshot.dirtyFields).toEqual([]);
    expect(result.draftSnapshot.fieldValues.phone).toBe("222");
    expect(pageContext.getCurrentContext()?.activeDraftId).toBe(result.draftId);
    expect(() => draftRuntime.captureDraft(draftId)).toThrow(DraftNotFoundError);
  });

  it("never calls the legacy updateCustomer() PATCH transport", async () => {
    const updateCustomerSpy = vi.spyOn(customersClient, "updateCustomer");
    const customer = makeCustomer();
    const { pageContext, draftRuntime, draftId } = makeSaveHarness(customer);
    const dirtyDraft = draftRuntime.updateField(draftId, "phone", "222");

    const executeCustomerUpdateAction = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { execution: { actionName: "customer.update", executionId: "exec_1", status: "SUCCESS" } } });
    const getCustomer = vi.fn().mockResolvedValue({ ok: true, data: { customer: makeCustomer({ phone: "222" }) } });

    await performCustomerEditSave({
      executeCustomerUpdateAction,
      getCustomer,
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      draftSnapshot: dirtyDraft,
      expectedVersion: customer.updatedAt,
      generateDraftId,
      generateIdempotencyKey,
    });

    expect(updateCustomerSpy).not.toHaveBeenCalled();
    updateCustomerSpy.mockRestore();
  });

  it("uses a distinct idempotency key per save attempt", async () => {
    const customer = makeCustomer();
    const { pageContext, draftRuntime, draftId } = makeSaveHarness(customer);
    const dirtyDraft = draftRuntime.updateField(draftId, "phone", "222");

    const executeCustomerUpdateAction = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { execution: { actionName: "customer.update", executionId: "exec_1", status: "SUCCESS" } } });
    const getCustomer = vi.fn().mockResolvedValue({ ok: true, data: { customer: makeCustomer({ phone: "222" }) } });
    const generateIdempotencyKeySpy = vi.fn(generateIdempotencyKey);

    await performCustomerEditSave({
      executeCustomerUpdateAction,
      getCustomer,
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      draftSnapshot: dirtyDraft,
      expectedVersion: customer.updatedAt,
      generateDraftId,
      generateIdempotencyKey: generateIdempotencyKeySpy,
    });

    expect(generateIdempotencyKeySpy).toHaveBeenCalledTimes(1);
  });
});

describe("performCustomerEditSave — execution failure", () => {
  it("keeps the original draft and its dirty changes intact, and does not refresh or rebase", async () => {
    const customer = makeCustomer();
    const { pageContext, draftRuntime, draftId } = makeSaveHarness(customer);
    const dirtyDraft = draftRuntime.updateField(draftId, "phone", "222");

    const executeCustomerUpdateAction = vi.fn().mockResolvedValue({ ok: false, error: "Baglanti kurulamadi." });
    const getCustomer = vi.fn();

    const result = await performCustomerEditSave({
      executeCustomerUpdateAction,
      getCustomer,
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      draftSnapshot: dirtyDraft,
      expectedVersion: customer.updatedAt,
      generateDraftId,
      generateIdempotencyKey,
    });

    expect(result.status).toBe("FAILED");
    if (result.status !== "FAILED") throw new Error("expected failure");
    expect(result.error).toBe("Baglanti kurulamadi.");
    expect(getCustomer).not.toHaveBeenCalled();

    const stillThere = draftRuntime.captureDraft(draftId);
    expect(stillThere.dirtyFields).toEqual(["phone"]);
    expect(stillThere.fieldValues.phone).toBe("222");
  });

  it("surfaces a version-conflict error from the server without touching the draft", async () => {
    const customer = makeCustomer();
    const { pageContext, draftRuntime, draftId } = makeSaveHarness(customer);
    const dirtyDraft = draftRuntime.updateField(draftId, "phone", "222");

    const conflictMessage = "Musteri siz duzenlerken degisti. Guncel kaydi yeniden yukleyip degisiklikleri kontrol edin.";
    const executeCustomerUpdateAction = vi.fn().mockResolvedValue({ ok: false, error: conflictMessage });

    const result = await performCustomerEditSave({
      executeCustomerUpdateAction,
      getCustomer: vi.fn(),
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      draftSnapshot: dirtyDraft,
      expectedVersion: customer.updatedAt,
      generateDraftId,
      generateIdempotencyKey,
    });

    expect(result.status).toBe("FAILED");
    if (result.status !== "FAILED") throw new Error("expected failure");
    expect(result.error).toBe(conflictMessage);

    const stillThere = draftRuntime.captureDraft(draftId);
    expect(stillThere.dirtyFields).toEqual(["phone"]);
  });

  it("maps a stale draft commit (context moved on) to a controlled save error instead of throwing", async () => {
    const customer = makeCustomer();
    const { pageContext, draftRuntime, draftId } = makeSaveHarness(customer);
    const dirtyDraft = draftRuntime.updateField(draftId, "phone", "222");

    // Simulate the Page Context moving on from under this draft (e.g. another
    // tab/action bumped it) — commitDraft must throw VersionMismatchError.
    pageContext.updateContext({ activeTab: "official" });

    const executeCustomerUpdateAction = vi.fn();

    const result = await performCustomerEditSave({
      executeCustomerUpdateAction,
      getCustomer: vi.fn(),
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      draftSnapshot: dirtyDraft,
      expectedVersion: customer.updatedAt,
      generateDraftId,
      generateIdempotencyKey,
    });

    expect(result.status).toBe("FAILED");
    expect(executeCustomerUpdateAction).not.toHaveBeenCalled();

    const stillThere = draftRuntime.captureDraft(draftId);
    expect(stillThere.dirtyFields).toEqual(["phone"]);
  });
});

describe("performCustomerEditSave — committed but refresh failed", () => {
  it("returns a distinct SAVED_REFRESH_FAILED result and does not rebase the draft", async () => {
    const customer = makeCustomer();
    const { pageContext, draftRuntime, draftId } = makeSaveHarness(customer);
    const dirtyDraft = draftRuntime.updateField(draftId, "phone", "222");

    const executeCustomerUpdateAction = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { execution: { actionName: "customer.update", executionId: "exec_1", status: "SUCCESS" } } });
    const getCustomer = vi.fn().mockResolvedValue({ ok: false, error: "Baglanti kurulamadi." });

    const result = await performCustomerEditSave({
      executeCustomerUpdateAction,
      getCustomer,
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      draftSnapshot: dirtyDraft,
      expectedVersion: customer.updatedAt,
      generateDraftId,
      generateIdempotencyKey,
    });

    expect(result.status).toBe("SAVED_REFRESH_FAILED");
    if (result.status !== "SAVED_REFRESH_FAILED") throw new Error("expected refresh-failed result");
    expect(result.message).toMatch(/Sayfayi yenileyin/);

    // the original draft must not have been discarded/rebased
    const stillThere = draftRuntime.captureDraft(draftId);
    expect(stillThere.dirtyFields).toEqual(["phone"]);
  });
});

describe("releaseCustomerEditDraft (cleanup)", () => {
  it("removes its own draft and clears the context it still owns", () => {
    const { pageContext, draftRuntime } = setupRuntimes();
    const customer = makeCustomer();
    const { draftId } = establishCustomerEditContext({
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      fieldValues: customerToDraftFieldValues(customer),
      generateDraftId,
    });

    releaseCustomerEditDraft({ pageContext, draftRuntime, draftId });

    expect(() => draftRuntime.captureDraft(draftId)).toThrow(DraftNotFoundError);
    expect(pageContext.getCurrentContext()).toBeNull();
  });

  it("does not clear a newer screen's context and tolerates re-releasing (Strict Mode double-invoke)", () => {
    const { pageContext, draftRuntime } = setupRuntimes();
    const customer = makeCustomer();
    const first = establishCustomerEditContext({
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      fieldValues: customerToDraftFieldValues(customer),
      generateDraftId,
    });

    // Simulate Strict Mode: cleanup of the first mount, then a second mount.
    releaseCustomerEditDraft({ pageContext, draftRuntime, draftId: first.draftId });
    const second = establishCustomerEditContext({
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      fieldValues: customerToDraftFieldValues(customer),
      generateDraftId,
    });

    // Cleanup firing again for the already-discarded first draft must not throw
    // and must not clear the second mount's still-active context.
    expect(() => releaseCustomerEditDraft({ pageContext, draftRuntime, draftId: first.draftId })).not.toThrow();
    expect(pageContext.getCurrentContext()?.activeDraftId).toBe(second.draftId);
  });
});
