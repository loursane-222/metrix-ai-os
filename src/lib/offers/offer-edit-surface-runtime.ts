// Offer Edit Surface Runtime — mirrors CustomerEditSurfaceRuntime exactly:
// executes the registry's SURFACE actions (draft.set_field, draft.commit,
// draft.discard, surface.select_tab) against the real Draft Runtime / save
// chain, and is the single source of truth for the Offer Edit screen's
// state. External callers (METRIX conversational commands) and
// OfferEditScreen both go through the same executeSurfaceAction() entry
// point — neither touches Draft Runtime or Execution Runtime directly.

import { actionRegistry } from "@/lib/action-runtime/registry";
import { assertSurfaceAction, createDraftRuntime } from "@/lib/action-runtime/draft";
import { createPageContextRuntime } from "@/lib/action-runtime/context";
import type { DraftSnapshot } from "@/lib/action-runtime/draft";

import { executeQuoteUpdateAction as executeQuoteUpdateActionClient, getQuote as getQuoteClient } from "./quotes-client";
import type { QuoteRecord } from "./quotes-client";
import {
  establishOfferEditContext,
  performOfferEditSave,
  quoteToDraftFieldValues,
  releaseOfferEditDraft,
} from "./offer-edit-draft";
import type { DraftRuntimeLike, ExecuteQuoteUpdateActionFn, GetQuoteFn, OfferEditFieldValues, PageContextLike } from "./offer-edit-draft";

export type SurfaceActionInput =
  | { actionName: "draft.set_field"; payload: { fieldName: string; value: unknown } }
  | { actionName: "draft.commit"; payload?: Record<string, never> }
  | { actionName: "draft.discard"; payload?: Record<string, never> }
  | { actionName: "surface.select_tab"; payload: { tabId: string } };

export type OfferEditSurfaceState = {
  loading: boolean;
  loadError: string | null;
  quote: QuoteRecord | null;
  draftId: string | null;
  draftSnapshot: DraftSnapshot | null;
  activeTab: string;
  saving: boolean;
  saveError: string | null;
  blockingMessage: string | null;
  savedAt: number | null;
};

export function createInitialOfferEditSurfaceState(initialTab: string): OfferEditSurfaceState {
  return {
    loading: true,
    loadError: null,
    quote: null,
    draftId: null,
    draftSnapshot: null,
    activeTab: initialTab,
    saving: false,
    saveError: null,
    blockingMessage: null,
    savedAt: null,
  };
}

export type DraftRuntimeSurfaceLike = DraftRuntimeLike & {
  updateField(draftId: string, fieldName: string, value: unknown): DraftSnapshot;
};

export type OfferEditSurfaceRuntimeDeps = {
  pageContext: PageContextLike;
  draftRuntime: DraftRuntimeSurfaceLike;
  getQuote: GetQuoteFn;
  executeQuoteUpdateAction: ExecuteQuoteUpdateActionFn;
  generateDraftId: () => string;
  generateIdempotencyKey: () => string;
};

/** Fresh PageContextRuntime/DraftRuntime pair per screen — never the app-wide singletons (bkz. Customer Edit aynı gerekçe). */
export function createProductionOfferEditSurfaceRuntimeDeps(): OfferEditSurfaceRuntimeDeps {
  const pageContext = createPageContextRuntime();
  const draftRuntime = createDraftRuntime({ pageContext });

  return {
    pageContext,
    draftRuntime,
    getQuote: getQuoteClient,
    executeQuoteUpdateAction: executeQuoteUpdateActionClient,
    generateDraftId: () => crypto.randomUUID(),
    generateIdempotencyKey: () => crypto.randomUUID(),
  };
}

const EDITABLE_FIELD_NAMES = new Set<string>([
  "items",
  "generalDiscountPercent",
  "customerNote",
  "validUntil",
  "paymentTerm",
  "deliveryTerm",
  "deliveryMethod",
]);

export class OfferEditSurfaceRuntime {
  readonly quoteId: string;
  private readonly deps: OfferEditSurfaceRuntimeDeps;
  private state: OfferEditSurfaceState;
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor(
    quoteId: string,
    initialTab: string,
    deps: OfferEditSurfaceRuntimeDeps = createProductionOfferEditSurfaceRuntimeDeps(),
  ) {
    this.quoteId = quoteId;
    this.deps = deps;
    this.state = createInitialOfferEditSurfaceState(initialTab);
  }

  getState = (): OfferEditSurfaceState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private patch(next: Partial<OfferEditSurfaceState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  async load(): Promise<void> {
    this.patch({ loading: true, loadError: null });
    const res = await this.deps.getQuote(this.quoteId);
    if (this.disposed) return;

    if (!res.ok) {
      this.patch({ loading: false, loadError: res.error });
      return;
    }

    const quote = res.data.quote;
    const { draftId, draftSnapshot } = establishOfferEditContext({
      pageContext: this.deps.pageContext,
      draftRuntime: this.deps.draftRuntime,
      quoteId: this.quoteId,
      activeTab: this.state.activeTab,
      fieldValues: quoteToDraftFieldValues(quote),
      generateDraftId: this.deps.generateDraftId,
    });

    this.patch({ loading: false, quote, draftId, draftSnapshot });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.state.draftId) {
      releaseOfferEditDraft({ pageContext: this.deps.pageContext, draftRuntime: this.deps.draftRuntime, draftId: this.state.draftId });
    }
    this.listeners.clear();
  }

  executeSurfaceAction = async (action: SurfaceActionInput): Promise<void> => {
    assertSurfaceAction(actionRegistry, action.actionName);

    switch (action.actionName) {
      case "surface.select_tab":
        this.selectTab(action.payload.tabId);
        return;
      case "draft.set_field":
        this.setField(action.payload.fieldName, action.payload.value);
        return;
      case "draft.discard":
        this.discard();
        return;
      case "draft.commit":
        await this.commit();
        return;
    }
  };

  private selectTab(tabId: string): void {
    this.patch({ activeTab: tabId });
  }

  private setField(fieldName: string, value: unknown): void {
    if (!this.state.draftId) return;
    if (!EDITABLE_FIELD_NAMES.has(fieldName)) {
      throw new Error(`"${fieldName}" is not an editable Offer Edit field.`);
    }
    const snapshot = this.deps.draftRuntime.updateField(this.state.draftId, fieldName, value);
    this.patch({ draftSnapshot: snapshot });
  }

  private discard(): void {
    if (!this.state.draftId) return;
    releaseOfferEditDraft({ pageContext: this.deps.pageContext, draftRuntime: this.deps.draftRuntime, draftId: this.state.draftId });
    this.patch({ draftId: null, draftSnapshot: null });
  }

  private async commit(): Promise<void> {
    const { quote, draftSnapshot, activeTab } = this.state;
    if (!quote || !draftSnapshot) return;

    const values = draftSnapshot.fieldValues as OfferEditFieldValues;
    if (values.items.length === 0) {
      this.patch({ saveError: "Teklifte en az bir kalem olmalı." });
      return;
    }

    this.patch({ saving: true, saveError: null });

    const result = await performOfferEditSave({
      executeQuoteUpdateAction: this.deps.executeQuoteUpdateAction,
      getQuote: this.deps.getQuote,
      pageContext: this.deps.pageContext,
      draftRuntime: this.deps.draftRuntime,
      quoteId: this.quoteId,
      activeTab,
      draftSnapshot,
      expectedVersion: quote.updatedAt,
      generateDraftId: this.deps.generateDraftId,
      generateIdempotencyKey: this.deps.generateIdempotencyKey,
    });
    if (this.disposed) return;

    if (result.status === "FAILED") {
      this.patch({ saving: false, saveError: result.error });
      return;
    }
    if (result.status === "SAVED_REFRESH_FAILED") {
      this.patch({ saving: false, blockingMessage: result.message });
      return;
    }

    this.patch({
      saving: false,
      quote: result.quote,
      draftId: result.draftId,
      draftSnapshot: result.draftSnapshot,
      savedAt: Date.now(),
    });
  }
}

export function createOfferEditSurfaceRuntime(
  quoteId: string,
  initialTab: string,
  deps: OfferEditSurfaceRuntimeDeps = createProductionOfferEditSurfaceRuntimeDeps(),
): OfferEditSurfaceRuntime {
  return new OfferEditSurfaceRuntime(quoteId, initialTab, deps);
}
