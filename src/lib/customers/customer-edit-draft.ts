// Customer Edit screen's binding to the Executive Page Context Runtime and
// Executive Draft Runtime. Framework-agnostic and fully unit-testable —
// CustomerEditScreen only wires these functions to React state/effects.
// This phase does not call draft.commit() or ExecutionRuntime.executeAction();
// saving still goes through the existing updateCustomer() PATCH client.

import { updateCustomer } from "./customers-client";
import type {
  ApiResult,
  CustomerAddress,
  CustomerRecord,
  CustomerStatus,
  UpdateCustomerBody,
} from "./customers-client";
import { draftRuntime as executiveDraftRuntime } from "@/lib/action-runtime/draft";
import type {
  CreateDraftInput,
  DraftFieldValues,
  DraftSnapshot,
} from "@/lib/action-runtime/draft";
import { pageContextRuntime } from "@/lib/action-runtime/context";
import type {
  PageContextInput,
  PageContextSnapshot,
  PageContextUpdate,
} from "@/lib/action-runtime/context";

/** Matches the real Registry ownerModule for the customers domain (see registry/manifests/customers.actions.ts). */
export const CUSTOMER_EDIT_MODULE = "customers";
export const CUSTOMER_EDIT_SURFACE = "customer-edit";
export const CUSTOMER_EDIT_ENTITY_TYPE = "customer";
export const CUSTOMER_EDIT_ACTIVE_FORM = "customer-edit-form";

export type CustomerEditAddress = {
  line1: string;
  line2: string;
  district: string;
  city: string;
  postalCode: string;
  country: string;
};

export const EMPTY_CUSTOMER_EDIT_ADDRESS: CustomerEditAddress = {
  line1: "",
  line2: "",
  district: "",
  city: "",
  postalCode: "",
  country: "",
};

/**
 * The editable/saveable Customer field set for this phase — must stay in
 * sync with customer.update's CUSTOMER_UPDATE_ALLOWED_FIELDS. currency,
 * balanceCents, primaryContact, createdAt/updatedAt/source and tenant/system
 * fields are intentionally excluded (see CustomerEditScreen for how they are
 * surfaced instead: read-only, not part of the draft).
 */
export type CustomerEditFieldValues = {
  displayName: string;
  legalName: string;
  phone: string;
  email: string;
  tier: string;
  metrixNote: string;
  status: CustomerStatus;
  cariKodu: string;
  taxNumber: string;
  taxOffice: string;
  mersisNo: string;
  tradeRegistryNo: string;
  billingAddress: CustomerEditAddress;
  shippingAddress: CustomerEditAddress;
  eInvoiceEnabled: boolean;
  eArchiveEnabled: boolean;
};

export const CUSTOMER_EDIT_FIELD_NAMES = [
  "displayName",
  "legalName",
  "phone",
  "email",
  "tier",
  "metrixNote",
  "status",
  "cariKodu",
  "taxNumber",
  "taxOffice",
  "mersisNo",
  "tradeRegistryNo",
  "billingAddress",
  "shippingAddress",
  "eInvoiceEnabled",
  "eArchiveEnabled",
] as const satisfies readonly (keyof CustomerEditFieldValues)[];

function normalizeAddress(address: CustomerAddress): CustomerEditAddress {
  return { ...EMPTY_CUSTOMER_EDIT_ADDRESS, ...(address ?? {}) };
}

/** Builds the draft's baseline fieldValues from a loaded/refreshed CustomerRecord. */
export function customerToDraftFieldValues(customer: CustomerRecord): CustomerEditFieldValues {
  return {
    displayName: customer.displayName,
    legalName: customer.legalName ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    tier: customer.tier ?? "",
    metrixNote: customer.metrixNote ?? "",
    status: customer.status,
    cariKodu: customer.cariKodu ?? "",
    taxNumber: customer.taxNumber ?? "",
    taxOffice: customer.taxOffice ?? "",
    mersisNo: customer.mersisNo ?? "",
    tradeRegistryNo: customer.tradeRegistryNo ?? "",
    billingAddress: normalizeAddress(customer.billingAddress),
    shippingAddress: normalizeAddress(customer.shippingAddress),
    eInvoiceEnabled: customer.eInvoiceEnabled,
    eArchiveEnabled: customer.eArchiveEnabled,
  };
}

function stripEmptyAddress(address: CustomerEditAddress): Record<string, unknown> | undefined {
  const entries = Object.entries(address).filter(([, v]) => v.trim().length > 0);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

/** Builds the PATCH payload from only the draft's dirty fields — never the full snapshot. */
export function buildUpdateCustomerPayload(
  fieldValues: DraftFieldValues,
  dirtyFields: readonly string[],
): UpdateCustomerBody {
  const values = fieldValues as CustomerEditFieldValues;
  const payload: UpdateCustomerBody = {};

  for (const field of dirtyFields) {
    switch (field) {
      case "displayName":
        payload.displayName = values.displayName.trim();
        break;
      case "legalName":
        payload.legalName = values.legalName || undefined;
        break;
      case "phone":
        payload.phone = values.phone || undefined;
        break;
      case "email":
        payload.email = values.email || undefined;
        break;
      case "tier":
        payload.tier = values.tier || undefined;
        break;
      case "metrixNote":
        payload.metrixNote = values.metrixNote || undefined;
        break;
      case "status":
        payload.status = values.status;
        break;
      case "cariKodu":
        payload.cariKodu = values.cariKodu || undefined;
        break;
      case "taxNumber":
        payload.taxNumber = values.taxNumber || undefined;
        break;
      case "taxOffice":
        payload.taxOffice = values.taxOffice || undefined;
        break;
      case "mersisNo":
        payload.mersisNo = values.mersisNo || undefined;
        break;
      case "tradeRegistryNo":
        payload.tradeRegistryNo = values.tradeRegistryNo || undefined;
        break;
      case "billingAddress":
        payload.billingAddress = stripEmptyAddress(values.billingAddress);
        break;
      case "shippingAddress":
        payload.shippingAddress = stripEmptyAddress(values.shippingAddress);
        break;
      case "eInvoiceEnabled":
        payload.eInvoiceEnabled = values.eInvoiceEnabled;
        break;
      case "eArchiveEnabled":
        payload.eArchiveEnabled = values.eArchiveEnabled;
        break;
      default:
        break;
    }
  }

  return payload;
}

export function buildCustomerEditPageContextInput(params: {
  customerId: string;
  activeTab: string;
  draftId: string | null;
}): PageContextInput {
  const { customerId, activeTab, draftId } = params;
  return {
    module: CUSTOMER_EDIT_MODULE,
    surface: CUSTOMER_EDIT_SURFACE,
    route: `/metrix/customers/${customerId}/edit`,
    entityType: CUSTOMER_EDIT_ENTITY_TYPE,
    entityId: customerId,
    activeTab,
    activeForm: CUSTOMER_EDIT_ACTIVE_FORM,
    activeDraftId: draftId,
    selection: [],
  };
}

/** Minimal duck-typed surface of PageContextRuntime this adapter needs — real singleton or a test instance. */
export type PageContextLike = {
  getCurrentContext(): PageContextSnapshot | null;
  createContext(input: PageContextInput): PageContextSnapshot;
  replaceContext(input: PageContextInput): PageContextSnapshot;
  updateContext(update: PageContextUpdate): PageContextSnapshot;
  clearContext(): void;
};

/** Minimal duck-typed surface of DraftRuntime this adapter needs. */
export type DraftRuntimeLike = {
  createDraft(input: CreateDraftInput): DraftSnapshot;
  discardDraft(draftId: string): void;
};

/**
 * Creates (or safely takes over) the Customer Edit Page Context, then grounds
 * a fresh draft in it. The draftId is pre-generated so it can be placed into
 * the context's activeDraftId *before* the draft itself is created — this
 * avoids creating the draft against a context version that a subsequent
 * context write would immediately invalidate.
 */
export function establishCustomerEditContext(params: {
  pageContext: PageContextLike;
  draftRuntime: DraftRuntimeLike;
  customerId: string;
  activeTab: string;
  fieldValues: CustomerEditFieldValues;
  generateDraftId: () => string;
}): { draftId: string; contextSnapshot: PageContextSnapshot; draftSnapshot: DraftSnapshot } {
  const { pageContext, draftRuntime, customerId, activeTab, fieldValues, generateDraftId } = params;

  const draftId = generateDraftId();
  const input = buildCustomerEditPageContextInput({ customerId, activeTab, draftId });

  const contextSnapshot =
    pageContext.getCurrentContext() === null ? pageContext.createContext(input) : pageContext.replaceContext(input);

  const draftSnapshot = draftRuntime.createDraft({
    draftId,
    entityType: CUSTOMER_EDIT_ENTITY_TYPE,
    entityId: customerId,
    fieldValues,
  });

  return { draftId, contextSnapshot, draftSnapshot };
}

/**
 * Discards this screen's draft and, only if the active context still points
 * at it, clears the context too. Guards against a Strict Mode / remount
 * cleanup clobbering a newer screen's context or draft.
 */
export function releaseCustomerEditDraft(params: {
  pageContext: PageContextLike;
  draftRuntime: DraftRuntimeLike;
  draftId: string;
}): void {
  const { pageContext, draftRuntime, draftId } = params;

  try {
    draftRuntime.discardDraft(draftId);
  } catch {
    // Already discarded (e.g. after a successful save's rebase) — safe to ignore.
  }

  const current = pageContext.getCurrentContext();
  if (current !== null && current.activeDraftId === draftId) {
    pageContext.clearContext();
  }
}

/** Discards the stale draft and grounds a clean baseline draft in the (bumped) context — used after a successful save. */
export function rebaseCustomerEditDraft(params: {
  pageContext: PageContextLike;
  draftRuntime: DraftRuntimeLike;
  previousDraftId: string;
  customerId: string;
  activeTab: string;
  fieldValues: CustomerEditFieldValues;
  generateDraftId: () => string;
}): { draftId: string; draftSnapshot: DraftSnapshot } {
  const { pageContext, draftRuntime, previousDraftId, customerId, activeTab, fieldValues, generateDraftId } = params;

  try {
    draftRuntime.discardDraft(previousDraftId);
  } catch {
    // Already gone — proceed regardless.
  }

  const draftId = generateDraftId();
  pageContext.updateContext({ activeDraftId: draftId, activeTab });

  const draftSnapshot = draftRuntime.createDraft({
    draftId,
    entityType: CUSTOMER_EDIT_ENTITY_TYPE,
    entityId: customerId,
    fieldValues,
  });

  return { draftId, draftSnapshot };
}

export type UpdateCustomerFn = (
  customerId: string,
  body: UpdateCustomerBody,
) => Promise<ApiResult<{ customer: CustomerRecord }>>;

export type CustomerEditSaveResult =
  | { ok: true; customer: CustomerRecord; draftId: string; draftSnapshot: DraftSnapshot }
  | { ok: false; error: string };

/**
 * Orchestrates a save: builds the diff-based payload from the draft, calls
 * the existing updateCustomer() transport, and on success rebases the draft
 * to a clean baseline from the returned record. On failure, the draft is left
 * untouched — the caller keeps showing the user's in-progress changes.
 */
export async function performCustomerEditSave(params: {
  updateCustomer: UpdateCustomerFn;
  pageContext: PageContextLike;
  draftRuntime: DraftRuntimeLike;
  customerId: string;
  activeTab: string;
  draftSnapshot: DraftSnapshot;
  generateDraftId: () => string;
}): Promise<CustomerEditSaveResult> {
  const { updateCustomer, pageContext, draftRuntime, customerId, activeTab, draftSnapshot, generateDraftId } = params;

  const payload = buildUpdateCustomerPayload(draftSnapshot.fieldValues, draftSnapshot.dirtyFields);
  const res = await updateCustomer(customerId, payload);

  if (!res.ok) {
    return { ok: false, error: res.error };
  }

  const updatedCustomer = res.data.customer;
  const fieldValues = customerToDraftFieldValues(updatedCustomer);
  const { draftId, draftSnapshot: newDraftSnapshot } = rebaseCustomerEditDraft({
    pageContext,
    draftRuntime,
    previousDraftId: draftSnapshot.draftId,
    customerId,
    activeTab,
    fieldValues,
    generateDraftId,
  });

  return { ok: true, customer: updatedCustomer, draftId, draftSnapshot: newDraftSnapshot };
}

/** Save button disabled rule: this phase has no real field validation (DraftSnapshot.valid is always true). */
export function isCustomerEditSaveDisabled(params: { saving: boolean; draftSnapshot: DraftSnapshot | null }): boolean {
  const { saving, draftSnapshot } = params;
  if (saving) return true;
  if (!draftSnapshot) return true;
  return draftSnapshot.dirtyFields.length === 0;
}

// ---------------------------------------------------------------------------
// Screen-facing bindings. Everything above this line is framework/runtime-
// agnostic and takes its Page Context/Draft Runtime as parameters (this is
// what the tests exercise). Everything below binds those pure functions to
// the real Executive Page Context Runtime / Draft Runtime singletons and the
// real updateCustomer() transport, so CustomerEditScreen never needs to know
// those singletons exist.
// ---------------------------------------------------------------------------

function generateDraftId(): string {
  return crypto.randomUUID();
}

/** Loads (or takes over) the Customer Edit Page Context and grounds a clean draft in it. */
export function loadCustomerEditDraft(params: {
  customerId: string;
  activeTab: string;
  customer: CustomerRecord;
}): { draftId: string; contextSnapshot: PageContextSnapshot; draftSnapshot: DraftSnapshot } {
  return establishCustomerEditContext({
    pageContext: pageContextRuntime,
    draftRuntime: executiveDraftRuntime,
    customerId: params.customerId,
    activeTab: params.activeTab,
    fieldValues: customerToDraftFieldValues(params.customer),
    generateDraftId,
  });
}

/** Applies one field change to the draft via the real Draft Runtime singleton. */
export function updateCustomerEditField<K extends keyof CustomerEditFieldValues>(
  draftId: string,
  field: K,
  value: CustomerEditFieldValues[K],
): DraftSnapshot {
  return executiveDraftRuntime.updateField(draftId, field, value);
}

/** Saves the draft through the real updateCustomer() transport and rebases to a clean baseline on success. */
export function saveCustomerEditDraft(params: {
  customerId: string;
  activeTab: string;
  draftSnapshot: DraftSnapshot;
}): Promise<CustomerEditSaveResult> {
  return performCustomerEditSave({
    updateCustomer,
    pageContext: pageContextRuntime,
    draftRuntime: executiveDraftRuntime,
    customerId: params.customerId,
    activeTab: params.activeTab,
    draftSnapshot: params.draftSnapshot,
    generateDraftId,
  });
}

/** Rebases the draft to a clean baseline built from a freshly (re)loaded CustomerRecord (e.g. after archiving). */
export function rebaseCustomerEditDraftFromCustomer(params: {
  previousDraftId: string;
  customerId: string;
  activeTab: string;
  customer: CustomerRecord;
}): { draftId: string; draftSnapshot: DraftSnapshot } {
  return rebaseCustomerEditDraft({
    pageContext: pageContextRuntime,
    draftRuntime: executiveDraftRuntime,
    previousDraftId: params.previousDraftId,
    customerId: params.customerId,
    activeTab: params.activeTab,
    fieldValues: customerToDraftFieldValues(params.customer),
    generateDraftId,
  });
}

/** Discards this screen's draft via the real singletons — safe to call from a cleanup effect. */
export function discardCustomerEditDraft(draftId: string): void {
  releaseCustomerEditDraft({ pageContext: pageContextRuntime, draftRuntime: executiveDraftRuntime, draftId });
}
