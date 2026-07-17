import { describe, expect, it, vi } from "vitest";

import { createPageContextRuntime } from "@/lib/action-runtime/context";
import { createDraftRuntime, DraftNotFoundError } from "@/lib/action-runtime/draft";
import type { CustomerRecord } from "../customers-client";
import {
  CUSTOMER_EDIT_FIELD_NAMES,
  CUSTOMER_EDIT_MODULE,
  buildUpdateCustomerPayload,
  customerToDraftFieldValues,
  establishCustomerEditContext,
  isCustomerEditSaveDisabled,
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

describe("buildUpdateCustomerPayload", () => {
  it("only includes fields listed in dirtyFields", () => {
    const customer = makeCustomer();
    const fieldValues = customerToDraftFieldValues(customer);

    const payload = buildUpdateCustomerPayload({ ...fieldValues, phone: "222" }, ["phone"]);

    expect(payload).toEqual({ phone: "222" });
  });
});

describe("performCustomerEditSave — success", () => {
  it("saves through the existing updateCustomer transport and rebases to a clean baseline draft", async () => {
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
    const dirtyDraft = draftRuntime.updateField(draftId, "phone", "222");

    const savedCustomer = makeCustomer({ phone: "222" });
    const updateCustomer = vi.fn().mockResolvedValue({ ok: true, data: { customer: savedCustomer } });

    const result = await performCustomerEditSave({
      updateCustomer,
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      draftSnapshot: dirtyDraft,
      generateDraftId,
    });

    expect(updateCustomer).toHaveBeenCalledWith(customer.id, { phone: "222" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.draftId).not.toBe(draftId);
    expect(result.draftSnapshot.dirtyFields).toEqual([]);
    expect(result.draftSnapshot.fieldValues.phone).toBe("222");
    expect(pageContext.getCurrentContext()?.activeDraftId).toBe(result.draftId);
    // the stale draft must be gone
    expect(() => draftRuntime.captureDraft(draftId)).toThrow(DraftNotFoundError);
  });
});

describe("performCustomerEditSave — failure", () => {
  it("keeps the original draft and its dirty changes intact", async () => {
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
    const dirtyDraft = draftRuntime.updateField(draftId, "phone", "222");

    const updateCustomer = vi.fn().mockResolvedValue({ ok: false, error: "Baglanti kurulamadi." });

    const result = await performCustomerEditSave({
      updateCustomer,
      pageContext,
      draftRuntime,
      customerId: customer.id,
      activeTab: "identity",
      draftSnapshot: dirtyDraft,
      generateDraftId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBe("Baglanti kurulamadi.");

    const stillThere = draftRuntime.captureDraft(draftId);
    expect(stillThere.dirtyFields).toEqual(["phone"]);
    expect(stillThere.fieldValues.phone).toBe("222");
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
