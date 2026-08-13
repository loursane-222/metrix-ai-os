// Offer Edit screen's binding to the Executive Page Context Runtime and
// Executive Draft Runtime — mirrors customer-edit-draft.ts exactly. Saving
// commits the real draft (draftRuntime.commitDraft) and executes it through
// the narrow POST /api/quotes/[quoteId]/actions/update server boundary.

import { executeQuoteUpdateAction, getQuote } from "./quotes-client";
import type { ApiResult, QuoteRecord } from "./quotes-client";
import {
  ContextMismatchError,
  DraftNotFoundError,
  draftRuntime as executiveDraftRuntime,
  EntityMismatchError,
  VersionMismatchError,
} from "@/lib/action-runtime/draft";
import type {
  CreateDraftInput,
  DraftSnapshot,
  ResolvedDomainActionRequest,
} from "@/lib/action-runtime/draft";
import { pageContextRuntime } from "@/lib/action-runtime/context";
import type { PageContextInput, PageContextSnapshot, PageContextUpdate } from "@/lib/action-runtime/context";

export const OFFER_EDIT_MODULE = "quotes";
export const OFFER_EDIT_SURFACE = "offer-edit";
export const OFFER_EDIT_ENTITY_TYPE = "quote";
export const OFFER_EDIT_ACTIVE_FORM = "offer-edit-form";

export type OfferEditItemLine = {
  localId: string;
  productServiceId: string | null;
  name: string;
  unit: string;
  quantity: number;
  /** Major currency units (e.g. TL), not cents — friendlier for NL/UI; converted at the commit boundary. */
  unitPrice: number;
  discountPercent: number;
  vatPercent: number;
};

export type OfferEditFieldValues = {
  items: OfferEditItemLine[];
  generalDiscountPercent: number | null;
  customerNote: string;
  specialTerms: string;
  validUntil: string;
  paymentTerm: string;
  deliveryTerm: string;
  deliveryMethod: string;
};

export const OFFER_EDIT_FIELD_NAMES = [
  "items",
  "generalDiscountPercent",
  "customerNote",
  "specialTerms",
  "validUntil",
  "paymentTerm",
  "deliveryTerm",
  "deliveryMethod",
] as const satisfies readonly (keyof OfferEditFieldValues)[];

function basisPointsToPercent(bp: number | null): number | null {
  return bp === null ? null : bp / 100;
}

function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}

function centsToMajor(cents: string): number {
  return Number(cents) / 100;
}

function majorToCents(value: number): number {
  return Math.round(value * 100);
}

export function quoteToDraftFieldValues(quote: QuoteRecord): OfferEditFieldValues {
  return {
    items: quote.items.map((item) => ({
      localId: item.id,
      productServiceId: item.productServiceId,
      name: item.name,
      unit: item.unit ?? "",
      quantity: Number(item.quantity),
      unitPrice: centsToMajor(item.unitPriceCents),
      discountPercent: item.discountBasisPoints / 100,
      vatPercent: item.vatRateBasisPoints / 100,
    })),
    generalDiscountPercent: basisPointsToPercent(quote.generalDiscountBasisPoints),
    customerNote: quote.customerNote ?? "",
    specialTerms: quote.specialTerms ?? "",
    validUntil: quote.validUntil ?? "",
    paymentTerm: quote.paymentTerm ?? "",
    deliveryTerm: quote.deliveryTerm ?? "",
    deliveryMethod: quote.deliveryMethod ?? "",
  };
}

/** Builds the quote.update patch from a draft's changed field set — items (if dirty) are always sent in full. */
export function buildOfferUpdatePatch(fieldValues: OfferEditFieldValues, dirtyFields: readonly string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const dirty = new Set(dirtyFields);

  if (dirty.has("items")) {
    patch.items = fieldValues.items.map((line) => ({
      productServiceId: line.productServiceId,
      name: line.name.trim(),
      unit: line.unit.trim() || null,
      quantity: line.quantity,
      unitPriceCents: majorToCents(line.unitPrice),
      discountBasisPoints: percentToBasisPoints(line.discountPercent),
      vatRateBasisPoints: percentToBasisPoints(line.vatPercent),
    }));
  }
  if (dirty.has("generalDiscountPercent")) {
    patch.generalDiscountBasisPoints = fieldValues.generalDiscountPercent === null ? null : percentToBasisPoints(fieldValues.generalDiscountPercent);
  }
  if (dirty.has("customerNote")) patch.customerNote = fieldValues.customerNote.trim() || null;
  if (dirty.has("specialTerms")) patch.specialTerms = fieldValues.specialTerms.trim() || null;
  if (dirty.has("validUntil")) patch.validUntil = fieldValues.validUntil.trim() || null;
  if (dirty.has("paymentTerm")) patch.paymentTerm = fieldValues.paymentTerm.trim() || null;
  if (dirty.has("deliveryTerm")) patch.deliveryTerm = fieldValues.deliveryTerm.trim() || null;
  if (dirty.has("deliveryMethod")) patch.deliveryMethod = fieldValues.deliveryMethod.trim() || null;

  return patch;
}

export function buildOfferEditPageContextInput(params: { quoteId: string; activeTab: string; draftId: string | null }): PageContextInput {
  const { quoteId, activeTab, draftId } = params;
  return {
    module: OFFER_EDIT_MODULE,
    surface: OFFER_EDIT_SURFACE,
    route: `/metrix/offers/${quoteId}/edit`,
    entityType: OFFER_EDIT_ENTITY_TYPE,
    entityId: quoteId,
    activeTab,
    activeForm: OFFER_EDIT_ACTIVE_FORM,
    activeDraftId: draftId,
    selection: [],
  };
}

export type PageContextLike = {
  getCurrentContext(): PageContextSnapshot | null;
  createContext(input: PageContextInput): PageContextSnapshot;
  replaceContext(input: PageContextInput): PageContextSnapshot;
  updateContext(update: PageContextUpdate): PageContextSnapshot;
  clearContext(): void;
};

export type DraftRuntimeLike = {
  createDraft(input: CreateDraftInput): DraftSnapshot;
  discardDraft(draftId: string): void;
  commitDraft(draftId: string): ResolvedDomainActionRequest;
};

export function establishOfferEditContext(params: {
  pageContext: PageContextLike;
  draftRuntime: DraftRuntimeLike;
  quoteId: string;
  activeTab: string;
  fieldValues: OfferEditFieldValues;
  generateDraftId: () => string;
}): { draftId: string; contextSnapshot: PageContextSnapshot; draftSnapshot: DraftSnapshot } {
  const { pageContext, draftRuntime, quoteId, activeTab, fieldValues, generateDraftId } = params;

  const draftId = generateDraftId();
  const input = buildOfferEditPageContextInput({ quoteId, activeTab, draftId });

  const contextSnapshot =
    pageContext.getCurrentContext() === null ? pageContext.createContext(input) : pageContext.replaceContext(input);

  const draftSnapshot = draftRuntime.createDraft({
    draftId,
    entityType: OFFER_EDIT_ENTITY_TYPE,
    entityId: quoteId,
    fieldValues,
  });

  return { draftId, contextSnapshot, draftSnapshot };
}

export function releaseOfferEditDraft(params: { pageContext: PageContextLike; draftRuntime: DraftRuntimeLike; draftId: string }): void {
  const { pageContext, draftRuntime, draftId } = params;

  try {
    draftRuntime.discardDraft(draftId);
  } catch {
    // Already discarded — safe to ignore.
  }

  const current = pageContext.getCurrentContext();
  if (current !== null && current.activeDraftId === draftId) {
    pageContext.clearContext();
  }
}

export function rebaseOfferEditDraft(params: {
  pageContext: PageContextLike;
  draftRuntime: DraftRuntimeLike;
  previousDraftId: string;
  quoteId: string;
  activeTab: string;
  fieldValues: OfferEditFieldValues;
  generateDraftId: () => string;
}): { draftId: string; draftSnapshot: DraftSnapshot } {
  const { pageContext, draftRuntime, previousDraftId, quoteId, activeTab, fieldValues, generateDraftId } = params;

  try {
    draftRuntime.discardDraft(previousDraftId);
  } catch {
    // Already gone — proceed regardless.
  }

  const draftId = generateDraftId();
  pageContext.updateContext({ activeDraftId: draftId, activeTab });

  const draftSnapshot = draftRuntime.createDraft({
    draftId,
    entityType: OFFER_EDIT_ENTITY_TYPE,
    entityId: quoteId,
    fieldValues,
  });

  return { draftId, draftSnapshot };
}

const SAVE_VERSION_CONFLICT_MESSAGE = "Teklif siz düzenlerken değişti. Güncel kaydı yeniden yükleyip değişiklikleri kontrol edin.";
const SAVE_REFRESH_FAILED_MESSAGE = "Kayıt tamamlandı ancak güncel veri yeniden yüklenemedi. Sayfayı yenileyin.";

function describeDraftCommitError(error: unknown): string {
  if (error instanceof VersionMismatchError || error instanceof ContextMismatchError || error instanceof EntityMismatchError) {
    return SAVE_VERSION_CONFLICT_MESSAGE;
  }
  if (error instanceof DraftNotFoundError) {
    return "Kayıt oturumu sona ermiş. Sayfayı yenileyin.";
  }
  return "Kaydetme sırasında beklenmeyen bir hata oluştu.";
}

export type ExecuteQuoteUpdateActionFn = (input: {
  quoteId: string;
  patch: Record<string, unknown>;
  expectedVersion: string;
  idempotencyKey: string;
}) => Promise<ApiResult<{ execution: unknown }>>;

export type GetQuoteFn = (quoteId: string) => Promise<ApiResult<{ quote: QuoteRecord }>>;

export type OfferEditSaveResult =
  | { status: "SAVED"; quote: QuoteRecord; draftId: string; draftSnapshot: DraftSnapshot }
  | { status: "SAVED_REFRESH_FAILED"; message: string }
  | { status: "FAILED"; error: string };

export async function performOfferEditSave(params: {
  executeQuoteUpdateAction: ExecuteQuoteUpdateActionFn;
  getQuote: GetQuoteFn;
  pageContext: PageContextLike;
  draftRuntime: DraftRuntimeLike;
  quoteId: string;
  activeTab: string;
  draftSnapshot: DraftSnapshot;
  expectedVersion: string;
  generateDraftId: () => string;
  generateIdempotencyKey: () => string;
}): Promise<OfferEditSaveResult> {
  const { executeQuoteUpdateAction, getQuote: getQuoteFn, pageContext, draftRuntime, quoteId, activeTab, draftSnapshot, expectedVersion, generateDraftId, generateIdempotencyKey } = params;

  let resolved: ResolvedDomainActionRequest;
  try {
    resolved = draftRuntime.commitDraft(draftSnapshot.draftId);
  } catch (error) {
    return { status: "FAILED", error: describeDraftCommitError(error) };
  }

  if (resolved.actionName !== "quote.update" || resolved.entityRef.entityType !== OFFER_EDIT_ENTITY_TYPE || resolved.entityRef.entityId !== quoteId) {
    return { status: "FAILED", error: "Beklenmeyen işlem türü; kaydetme iptal edildi." };
  }

  const patch = buildOfferUpdatePatch(draftSnapshot.fieldValues as OfferEditFieldValues, Object.keys(resolved.patch));
  if (Object.keys(patch).length === 0) {
    return { status: "FAILED", error: "Kaydedilecek bir değişiklik yok." };
  }

  const res = await executeQuoteUpdateAction({
    quoteId,
    patch,
    expectedVersion,
    idempotencyKey: generateIdempotencyKey(),
  });

  if (!res.ok) {
    return { status: "FAILED", error: res.error };
  }

  const refreshed = await getQuoteFn(quoteId);
  if (!refreshed.ok) {
    return { status: "SAVED_REFRESH_FAILED", message: SAVE_REFRESH_FAILED_MESSAGE };
  }

  const refreshedQuote = refreshed.data.quote;
  const fieldValues = quoteToDraftFieldValues(refreshedQuote);
  const { draftId, draftSnapshot: newDraftSnapshot } = rebaseOfferEditDraft({
    pageContext,
    draftRuntime,
    previousDraftId: draftSnapshot.draftId,
    quoteId,
    activeTab,
    fieldValues,
    generateDraftId,
  });

  return { status: "SAVED", quote: refreshedQuote, draftId, draftSnapshot: newDraftSnapshot };
}

function generateDraftId(): string {
  return crypto.randomUUID();
}

function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function loadOfferEditDraft(params: { quoteId: string; activeTab: string; quote: QuoteRecord }): {
  draftId: string;
  contextSnapshot: PageContextSnapshot;
  draftSnapshot: DraftSnapshot;
} {
  return establishOfferEditContext({
    pageContext: pageContextRuntime,
    draftRuntime: executiveDraftRuntime,
    quoteId: params.quoteId,
    activeTab: params.activeTab,
    fieldValues: quoteToDraftFieldValues(params.quote),
    generateDraftId,
  });
}

export function updateOfferEditField<K extends keyof OfferEditFieldValues>(
  draftId: string,
  field: K,
  value: OfferEditFieldValues[K],
): DraftSnapshot {
  return executiveDraftRuntime.updateField(draftId, field, value);
}

export function saveOfferEditDraft(params: {
  quoteId: string;
  activeTab: string;
  draftSnapshot: DraftSnapshot;
  expectedVersion: string;
}): Promise<OfferEditSaveResult> {
  return performOfferEditSave({
    executeQuoteUpdateAction,
    getQuote,
    pageContext: pageContextRuntime,
    draftRuntime: executiveDraftRuntime,
    quoteId: params.quoteId,
    activeTab: params.activeTab,
    draftSnapshot: params.draftSnapshot,
    expectedVersion: params.expectedVersion,
    generateDraftId,
    generateIdempotencyKey,
  });
}

export function discardOfferEditDraft(draftId: string): void {
  releaseOfferEditDraft({ pageContext: pageContextRuntime, draftRuntime: executiveDraftRuntime, draftId });
}
