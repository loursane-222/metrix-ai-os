// Customer Edit Surface Runtime — the first executable Surface Runtime.
// Executes the registry's SURFACE actions (draft.set_field, draft.clear_field,
// draft.revert_field, draft.commit, draft.discard, surface.select_tab) against
// the existing Page Context / Draft Runtime / save chain, and is the single
// source of truth for the Customer Edit screen's state. External callers
// (METRIX) and CustomerEditScreen both go through the same
// executeSurfaceAction() entry point — neither touches Draft Runtime,
// Execution Runtime or React state setters directly.
//
// Does not run a new draft system or a new save pipeline: draft.set_field/
// clear_field/revert_field call the real DraftRuntime; draft.commit calls the
// existing performCustomerEditSave() chain (commit -> execute -> refresh ->
// rebase); draft.discard calls the existing releaseCustomerEditDraft().
//
// Deliberately does NOT depend on the app-wide pageContextRuntime/draftRuntime
// singletons. Each CustomerEditSurfaceRuntime gets its own PageContextRuntime
// and DraftRuntime instance (createProductionCustomerEditSurfaceRuntimeDeps
// below, via createPageContextRuntime()/createDraftRuntime()) — otherwise two
// Customer Edit screens open at once would share one Page Context, and the
// second screen's load() would replace the first screen's context out from
// under it (PageContextRuntime holds exactly one active context).

import { actionRegistry } from "@/lib/action-runtime/registry";
import { assertSurfaceAction, createDraftRuntime } from "@/lib/action-runtime/draft";
import { createPageContextRuntime } from "@/lib/action-runtime/context";
import type { DraftSnapshot } from "@/lib/action-runtime/draft";

import {
  archiveCustomer as archiveCustomerClient,
  executeCustomerUpdateAction as executeCustomerUpdateActionClient,
  getCustomer as getCustomerClient,
} from "./customers-client";
import type { ApiResult, CustomerRecord } from "./customers-client";
import {
  CUSTOMER_EDIT_FIELD_NAMES,
  customerToDraftFieldValues,
  establishCustomerEditContext,
  performCustomerEditSave,
  rebaseCustomerEditDraft,
  releaseCustomerEditDraft,
} from "./customer-edit-draft";
import type {
  CustomerEditFieldValues,
  DraftRuntimeLike,
  ExecuteCustomerUpdateActionFn,
  GetCustomerFn,
  PageContextLike,
} from "./customer-edit-draft";

export type SurfaceActionInput =
  | { actionName: "draft.set_field"; payload: { fieldName: string; value: unknown } }
  | { actionName: "draft.clear_field"; payload: { fieldName: string } }
  | { actionName: "draft.revert_field"; payload: { fieldName: string } }
  | { actionName: "draft.commit"; payload?: Record<string, never> }
  | { actionName: "draft.discard"; payload?: Record<string, never> }
  | { actionName: "surface.select_tab"; payload: { tabId: string } };

export type CustomerEditSurfaceState = {
  loading: boolean;
  loadError: string | null;
  customer: CustomerRecord | null;
  draftId: string | null;
  draftSnapshot: DraftSnapshot | null;
  activeTab: string;
  saving: boolean;
  saveError: string | null;
  blockingMessage: string | null;
  savedAt: number | null;
};

export function createInitialCustomerEditSurfaceState(initialTab: string): CustomerEditSurfaceState {
  return {
    loading: true,
    loadError: null,
    customer: null,
    draftId: null,
    draftSnapshot: null,
    activeTab: initialTab,
    saving: false,
    saveError: null,
    blockingMessage: null,
    savedAt: null,
  };
}

/** DraftRuntimeLike plus the field-level mutators the Surface Runtime dispatches to. */
export type DraftRuntimeSurfaceLike = DraftRuntimeLike & {
  updateField(draftId: string, fieldName: string, value: unknown): DraftSnapshot;
  clearField(draftId: string, fieldName: string): DraftSnapshot;
  revertField(draftId: string, fieldName: string): DraftSnapshot;
};

export type CustomerEditSurfaceRuntimeDeps = {
  pageContext: PageContextLike;
  draftRuntime: DraftRuntimeSurfaceLike;
  getCustomer: GetCustomerFn;
  archiveCustomer: (customerId: string) => Promise<ApiResult<{ archived: boolean }>>;
  executeCustomerUpdateAction: ExecuteCustomerUpdateActionFn;
  generateDraftId: () => string;
  generateIdempotencyKey: () => string;
};

/**
 * Builds one screen's worth of production dependencies — a *fresh*
 * PageContextRuntime and DraftRuntime instance every call, never the
 * app-wide singletons. This is what makes CustomerEditSurfaceRuntime
 * per-screen: Customer Edit A and Customer Edit B each get their own Page
 * Context/Draft Runtime pair and cannot stale or replace each other's.
 */
export function createProductionCustomerEditSurfaceRuntimeDeps(): CustomerEditSurfaceRuntimeDeps {
  const pageContext = createPageContextRuntime();
  const draftRuntime = createDraftRuntime({ pageContext });

  return {
    pageContext,
    draftRuntime,
    getCustomer: getCustomerClient,
    archiveCustomer: archiveCustomerClient,
    executeCustomerUpdateAction: executeCustomerUpdateActionClient,
    generateDraftId: () => crypto.randomUUID(),
    generateIdempotencyKey: () => crypto.randomUUID(),
  };
}

const EDITABLE_FIELD_NAMES = new Set<string>(CUSTOMER_EDIT_FIELD_NAMES);

/**
 * Customer Edit's Surface Runtime instance: one per mounted Customer Edit
 * screen. Holds the single source of truth for customer/draft/tab/save
 * state and notifies subscribers (the React bridge, or any other listener)
 * on every change — regardless of whether the mutation was dispatched by
 * the screen itself or by an external caller holding a reference to this
 * instance.
 */
export class CustomerEditSurfaceRuntime {
  readonly customerId: string;
  private readonly deps: CustomerEditSurfaceRuntimeDeps;
  private state: CustomerEditSurfaceState;
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor(
    customerId: string,
    initialTab: string,
    deps: CustomerEditSurfaceRuntimeDeps = createProductionCustomerEditSurfaceRuntimeDeps(),
  ) {
    this.customerId = customerId;
    this.deps = deps;
    this.state = createInitialCustomerEditSurfaceState(initialTab);
  }

  getState = (): CustomerEditSurfaceState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private patch(next: Partial<CustomerEditSurfaceState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  /** Loads the Customer record and grounds a clean draft — the screen's entry point. */
  async load(): Promise<void> {
    this.patch({ loading: true, loadError: null });
    const res = await this.deps.getCustomer(this.customerId);
    if (this.disposed) return;

    if (!res.ok) {
      this.patch({ loading: false, loadError: res.error });
      return;
    }

    const customer = res.data.customer;
    const { draftId, draftSnapshot } = establishCustomerEditContext({
      pageContext: this.deps.pageContext,
      draftRuntime: this.deps.draftRuntime,
      customerId: this.customerId,
      activeTab: this.state.activeTab,
      fieldValues: customerToDraftFieldValues(customer),
      generateDraftId: this.deps.generateDraftId,
    });

    this.patch({ loading: false, customer, draftId, draftSnapshot });
  }

  /** Releases this instance's draft/context and stops notifying listeners — call on unmount. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.state.draftId) {
      releaseCustomerEditDraft({
        pageContext: this.deps.pageContext,
        draftRuntime: this.deps.draftRuntime,
        draftId: this.state.draftId,
      });
    }
    this.listeners.clear();
  }

  /**
   * Single execution entry point for every Surface Action this runtime
   * supports. assertSurfaceAction rejects anything not registered as a
   * SURFACE action in the Action Registry — this runtime can never be used
   * to run a DOMAIN action directly.
   */
  async executeSurfaceAction(action: SurfaceActionInput): Promise<void> {
    assertSurfaceAction(actionRegistry, action.actionName);

    switch (action.actionName) {
      case "surface.select_tab":
        this.selectTab(action.payload.tabId);
        return;
      case "draft.set_field":
        this.setField(action.payload.fieldName, action.payload.value);
        return;
      case "draft.clear_field":
        this.clearField(action.payload.fieldName);
        return;
      case "draft.revert_field":
        this.revertField(action.payload.fieldName);
        return;
      case "draft.discard":
        this.discard();
        return;
      case "draft.commit":
        await this.commit();
        return;
    }
  }

  private selectTab(tabId: string): void {
    // Deliberately local runtime state only. Writing every tab switch into
    // the Page Context would bump its version and immediately stale the
    // in-flight draft (DraftRuntime rejects updateField/commitDraft once the
    // context has moved past the draft's baseVersion) — today's behavior of
    // keeping tab navigation out of the Page Context is preserved as-is.
    this.patch({ activeTab: tabId });
  }

  private setField(fieldName: string, value: unknown): void {
    if (!this.state.draftId) return;
    if (!EDITABLE_FIELD_NAMES.has(fieldName)) {
      throw new Error(`"${fieldName}" is not an editable Customer Edit field.`);
    }
    const snapshot = this.deps.draftRuntime.updateField(this.state.draftId, fieldName, value);
    this.patch({ draftSnapshot: snapshot });
  }

  private clearField(fieldName: string): void {
    if (!this.state.draftId) return;
    const snapshot = this.deps.draftRuntime.clearField(this.state.draftId, fieldName);
    this.patch({ draftSnapshot: snapshot });
  }

  private revertField(fieldName: string): void {
    if (!this.state.draftId) return;
    const snapshot = this.deps.draftRuntime.revertField(this.state.draftId, fieldName);
    this.patch({ draftSnapshot: snapshot });
  }

  private discard(): void {
    if (!this.state.draftId) return;
    releaseCustomerEditDraft({
      pageContext: this.deps.pageContext,
      draftRuntime: this.deps.draftRuntime,
      draftId: this.state.draftId,
    });
    this.patch({ draftId: null, draftSnapshot: null });
  }

  /** Runs the existing performCustomerEditSave() chain — no new save pipeline. */
  private async commit(): Promise<void> {
    const { customer, draftSnapshot, activeTab } = this.state;
    if (!customer || !draftSnapshot) return;

    const values = draftSnapshot.fieldValues as CustomerEditFieldValues;
    if (!values.displayName.trim()) {
      this.patch({ saveError: "Firma adi gerekli." });
      return;
    }

    this.patch({ saving: true, saveError: null });

    const result = await performCustomerEditSave({
      executeCustomerUpdateAction: this.deps.executeCustomerUpdateAction,
      getCustomer: this.deps.getCustomer,
      pageContext: this.deps.pageContext,
      draftRuntime: this.deps.draftRuntime,
      customerId: this.customerId,
      activeTab,
      draftSnapshot,
      expectedVersion: customer.updatedAt,
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
      customer: result.customer,
      draftId: result.draftId,
      draftSnapshot: result.draftSnapshot,
      savedAt: Date.now(),
    });
  }

  /**
   * Preserves the pre-existing "Pasife Al" (archive) behavior — not one of
   * the six Surface Actions, but customer/draft state now lives here, so
   * this stays a plain runtime method rather than a registry-dispatched
   * action.
   */
  async archive(): Promise<void> {
    if (!this.state.customer) return;

    this.patch({ saving: true });
    const archived = await this.deps.archiveCustomer(this.state.customer.id);
    if (this.disposed) return;

    if (!archived.ok) {
      this.patch({ saving: false, saveError: archived.error });
      return;
    }

    const refreshed = await this.deps.getCustomer(this.state.customer.id);
    if (this.disposed) return;

    if (!refreshed.ok) {
      this.patch({ saving: false });
      return;
    }

    if (!this.state.draftId) {
      this.patch({ saving: false, customer: refreshed.data.customer });
      return;
    }

    const { draftId, draftSnapshot } = rebaseCustomerEditDraft({
      pageContext: this.deps.pageContext,
      draftRuntime: this.deps.draftRuntime,
      previousDraftId: this.state.draftId,
      customerId: this.customerId,
      activeTab: this.state.activeTab,
      fieldValues: customerToDraftFieldValues(refreshed.data.customer),
      generateDraftId: this.deps.generateDraftId,
    });

    this.patch({ saving: false, customer: refreshed.data.customer, draftId, draftSnapshot });
  }
}

/**
 * Production wrapper: one call = one screen. When no deps are injected (the
 * real CustomerEditScreen path), this builds a brand new PageContextRuntime/
 * DraftRuntime pair for this instance via createProductionCustomerEditSurfaceRuntimeDeps()
 * — never the app-wide pageContextRuntime/draftRuntime singletons. Two calls
 * (two mounted Customer Edit screens) therefore never share a Page Context.
 */
export function createCustomerEditSurfaceRuntime(
  customerId: string,
  initialTab: string,
  deps: CustomerEditSurfaceRuntimeDeps = createProductionCustomerEditSurfaceRuntimeDeps(),
): CustomerEditSurfaceRuntime {
  return new CustomerEditSurfaceRuntime(customerId, initialTab, deps);
}
