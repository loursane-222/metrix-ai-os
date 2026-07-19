// Customer Edit screen's binding to the Executive Page Context Runtime and
// Executive Draft Runtime. Framework-agnostic and fully unit-testable —
// CustomerEditScreen only wires these functions to React state/effects.
// Saving commits the real draft (draftRuntime.commitDraft) and executes it
// through the narrow POST /api/customers/[customerId]/actions/update server
// boundary — never the legacy updateCustomer() PATCH transport.

import { executeCustomerUpdateAction, getCustomer } from "./customers-client";
import type {
  ApiResult,
  CustomerAddress,
  CustomerRecord,
  CustomerStatus,
} from "./customers-client";
import {
  ContextMismatchError,
  DraftNotFoundError,
  draftRuntime as executiveDraftRuntime,
  EntityMismatchError,
  VersionMismatchError,
} from "@/lib/action-runtime/draft";
import type {
  CreateDraftInput,
  DraftFieldValues,
  DraftSnapshot,
  ResolvedDomainActionRequest,
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
  currency: string;
  primaryContact: { fullName: string; title: string; phone: string; email: string };
  commercialTerms: { paymentTermDays: number | null; creditLimitCents: number | null; defaultCurrency: string; discountRateBasisPoints: number | null; deliveryTerm: string; notes: string };
  customFields: Array<{ definitionId: string; value: unknown }>;
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
  "currency",
  "primaryContact",
  "commercialTerms",
  "customFields",
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
    currency: customer.currency,
    primaryContact: { fullName: customer.primaryContact?.fullName ?? "", title: customer.primaryContact?.title ?? "", phone: customer.primaryContact?.phone ?? "", email: customer.primaryContact?.email ?? "" },
    commercialTerms: { paymentTermDays: customer.commercialTerms?.paymentTermDays ?? null, creditLimitCents: customer.commercialTerms?.creditLimitCents ? Number(customer.commercialTerms.creditLimitCents) : null, defaultCurrency: customer.commercialTerms?.defaultCurrency ?? customer.currency, discountRateBasisPoints: customer.commercialTerms?.discountRateBasisPoints ?? null, deliveryTerm: customer.commercialTerms?.deliveryTerm ?? "", notes: customer.commercialTerms?.notes ?? "" },
    customFields: customer.customFieldValues ?? [],
  };
}

function stripEmptyAddress(address: CustomerEditAddress): Record<string, unknown> | undefined {
  const entries = Object.entries(address).filter(([, v]) => v.trim().length > 0);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

const OPTIONAL_STRING_PATCH_FIELDS = new Set<string>([
  "legalName",
  "phone",
  "email",
  "tier",
  "metrixNote",
  "cariKodu",
  "taxNumber",
  "taxOffice",
  "mersisNo",
  "tradeRegistryNo",
]);

/**
 * Normalizes the raw patch produced by DraftRuntime.commitDraft() before it
 * is sent to the server action route. Mirrors the historical PATCH payload
 * builder's data-cleaning semantics: a cleared optional string field (empty
 * string) is dropped rather than sent as "" — the server route omits it from
 * the update entirely, same as before. billingAddress/shippingAddress are
 * reduced to their non-empty entries, or dropped if fully empty. Every other
 * field (displayName, status, eInvoiceEnabled, eArchiveEnabled, healthScore)
 * passes through unchanged. Does not mutate DraftRuntime's generic behavior —
 * this is a customer-specific adapter applied to its output.
 */
export function normalizeCustomerUpdatePatch(patch: DraftFieldValues): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(patch)) {
    if (field === "displayName" && typeof value === "string") {
      normalized.displayName = value.trim();
      continue;
    }

    if (OPTIONAL_STRING_PATCH_FIELDS.has(field)) {
      if (typeof value === "string" && value.trim().length === 0) continue;
      normalized[field] = value;
      continue;
    }

    if (field === "billingAddress" || field === "shippingAddress") {
      const stripped = stripEmptyAddress(value as CustomerEditAddress);
      if (stripped === undefined) continue;
      normalized[field] = stripped;
      continue;
    }

    normalized[field] = value;
  }

  return normalized;
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
  commitDraft(draftId: string): ResolvedDomainActionRequest;
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

const SAVE_VERSION_CONFLICT_MESSAGE =
  "Musteri siz duzenlerken degisti. Guncel kaydi yeniden yukleyip degisiklikleri kontrol edin.";
const SAVE_REFRESH_FAILED_MESSAGE =
  "Kayit tamamlandi ancak guncel veri yeniden yuklenemedi. Sayfayi yenileyin.";

function describeDraftCommitError(error: unknown): string {
  if (error instanceof VersionMismatchError || error instanceof ContextMismatchError || error instanceof EntityMismatchError) {
    return SAVE_VERSION_CONFLICT_MESSAGE;
  }
  if (error instanceof DraftNotFoundError) {
    return "Kayit oturumu sona ermis. Sayfayi yenileyin.";
  }
  return "Kaydetme sirasinda beklenmeyen bir hata olustu.";
}

export type ExecuteCustomerUpdateActionFn = (input: {
  customerId: string;
  patch: Record<string, unknown>;
  expectedVersion: string;
  originatingDraftId: string;
  originatingContextVersion: number;
  idempotencyKey: string;
}) => Promise<ApiResult<{ execution: unknown }>>;

export type GetCustomerFn = (customerId: string) => Promise<ApiResult<{ customer: CustomerRecord }>>;

export type CustomerEditSaveResult =
  | { status: "SAVED"; customer: CustomerRecord; draftId: string; draftSnapshot: DraftSnapshot }
  | { status: "SAVED_REFRESH_FAILED"; message: string }
  | { status: "FAILED"; error: string };

/**
 * Orchestrates a real save: commits the draft (draftRuntime.commitDraft) into
 * a ResolvedDomainActionRequest, validates it targets customer.update for
 * this customer with a non-empty patch, normalizes the patch, and executes
 * it through the narrow Customers server action boundary — expectedVersion
 * is the loaded/refreshed CustomerRecord.updatedAt, never the Page Context
 * version. On execution failure (including version conflict), the draft and
 * its dirty fields are left untouched. On execution success, the caller must
 * still refresh the Customer record for a clean rebase; if that refresh
 * fails, the execution has already committed server-side, so this returns a
 * distinct SAVED_REFRESH_FAILED state rather than a plain failure.
 */
export async function performCustomerEditSave(params: {
  executeCustomerUpdateAction: ExecuteCustomerUpdateActionFn;
  getCustomer: GetCustomerFn;
  pageContext: PageContextLike;
  draftRuntime: DraftRuntimeLike;
  customerId: string;
  activeTab: string;
  draftSnapshot: DraftSnapshot;
  expectedVersion: string;
  generateDraftId: () => string;
  generateIdempotencyKey: () => string;
}): Promise<CustomerEditSaveResult> {
  const {
    executeCustomerUpdateAction,
    getCustomer,
    pageContext,
    draftRuntime,
    customerId,
    activeTab,
    draftSnapshot,
    expectedVersion,
    generateDraftId,
    generateIdempotencyKey,
  } = params;

  let resolved: ResolvedDomainActionRequest;
  try {
    resolved = draftRuntime.commitDraft(draftSnapshot.draftId);
  } catch (error) {
    return { status: "FAILED", error: describeDraftCommitError(error) };
  }

  if (
    resolved.actionName !== "customer.update" ||
    resolved.entityRef.entityType !== CUSTOMER_EDIT_ENTITY_TYPE ||
    resolved.entityRef.entityId !== customerId
  ) {
    return { status: "FAILED", error: "Beklenmeyen islem turu; kaydetme iptal edildi." };
  }

  const patch = normalizeCustomerUpdatePatch(resolved.patch);
  if (Object.keys(patch).length === 0) {
    return { status: "FAILED", error: "Kaydedilecek bir degisiklik yok." };
  }

  const res = await executeCustomerUpdateAction({
    customerId,
    patch,
    expectedVersion,
    originatingDraftId: resolved.originatingDraftId,
    originatingContextVersion: resolved.originatingContextVersion,
    idempotencyKey: generateIdempotencyKey(),
  });

  if (!res.ok) {
    return { status: "FAILED", error: res.error };
  }

  const refreshed = await getCustomer(customerId);
  if (!refreshed.ok) {
    return { status: "SAVED_REFRESH_FAILED", message: SAVE_REFRESH_FAILED_MESSAGE };
  }

  const refreshedCustomer = refreshed.data.customer;
  const fieldValues = customerToDraftFieldValues(refreshedCustomer);
  const { draftId, draftSnapshot: newDraftSnapshot } = rebaseCustomerEditDraft({
    pageContext,
    draftRuntime,
    previousDraftId: draftSnapshot.draftId,
    customerId,
    activeTab,
    fieldValues,
    generateDraftId,
  });

  return { status: "SAVED", customer: refreshedCustomer, draftId, draftSnapshot: newDraftSnapshot };
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
// real executeCustomerUpdateAction()/getCustomer() transports, so
// CustomerEditScreen never needs to know those singletons exist.
// ---------------------------------------------------------------------------

function generateDraftId(): string {
  return crypto.randomUUID();
}

function generateIdempotencyKey(): string {
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

/**
 * Saves the draft through the real customer.update execution boundary and
 * rebases to a clean baseline on success. expectedVersion must be the
 * loaded/refreshed CustomerRecord.updatedAt — the caller (CustomerEditScreen)
 * owns fetching and threading that through, never the Page Context version.
 */
export function saveCustomerEditDraft(params: {
  customerId: string;
  activeTab: string;
  draftSnapshot: DraftSnapshot;
  expectedVersion: string;
}): Promise<CustomerEditSaveResult> {
  return performCustomerEditSave({
    executeCustomerUpdateAction,
    getCustomer,
    pageContext: pageContextRuntime,
    draftRuntime: executiveDraftRuntime,
    customerId: params.customerId,
    activeTab: params.activeTab,
    draftSnapshot: params.draftSnapshot,
    expectedVersion: params.expectedVersion,
    generateDraftId,
    generateIdempotencyKey,
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
