import { customerEditConversationExtension } from "./customer-edit-conversation-extension";
import { customerManagementConversationExtension } from "./customer-management-conversation-extension";
import { taskManagementConversationExtension } from "./task-management-conversation-extension";
import { taskEditConversationExtension } from "./task-edit-conversation-extension";
import { offerEditConversationExtension } from "./offer-edit-conversation-extension";
import { offerManagementConversationExtension } from "./offer-management-conversation-extension";
import { paymentManagementConversationExtension } from "./payment-management-conversation-extension";
import { invoiceManagementConversationExtension } from "./invoice-management-conversation-extension";
import { supplierManagementConversationExtension } from "./supplier-management-conversation-extension";
import { productionManagementConversationExtension } from "./production-management-conversation-extension";
import { customerImportConversationExtension } from "./customer-import-conversation-extension";
import { productImportConversationExtension } from "./product-import-conversation-extension";
import { invoiceImportConversationExtension } from "./invoice-import-conversation-extension";
import { supplierImportConversationExtension } from "./supplier-import-conversation-extension";
import { paymentImportConversationExtension } from "./payment-import-conversation-extension";
import { offerImportConversationExtension } from "./offer-import-conversation-extension";
import { orderImportConversationExtension } from "./order-import-conversation-extension";
import { deliveryImportConversationExtension } from "./delivery-import-conversation-extension";
import { stockImportConversationExtension } from "./stock-import-conversation-extension";
import { productionImportConversationExtension } from "./production-import-conversation-extension";
import { generalImportConversationExtension } from "./general-import-conversation-extension";
import { paymentReminderConversationExtension } from "./payment-reminder-conversation-extension";
import { orchestrationConversationExtension } from "./orchestration-conversation-extension";
import { orchestrationApprovalConversationExtension } from "./orchestration-approval-conversation-extension";
import { businessOverviewConversationExtension } from "./business-overview-conversation-extension";
import { supplierMessageConversationExtension } from "./supplier-message-conversation-extension";
import { orderManagementConversationExtension } from "./order-management-conversation-extension";
import { orderEditConversationExtension } from "./order-edit-conversation-extension";
import { deliveryEditConversationExtension } from "./delivery-edit-conversation-extension";
import { invoiceEditConversationExtension } from "./invoice-edit-conversation-extension";
import { paymentEditConversationExtension } from "./payment-edit-conversation-extension";
import { collectionActionEditConversationExtension } from "./collection-action-edit-conversation-extension";
import { supplierEditConversationExtension } from "./supplier-edit-conversation-extension";
import { deliveryManagementConversationExtension } from "./delivery-management-conversation-extension";
import { stockManagementConversationExtension } from "./stock-management-conversation-extension";
import { stockOperationConversationExtension } from "./stock-operation-conversation-extension";
import { productManagementConversationExtension } from "./product-management-conversation-extension";
import { productEditConversationExtension } from "./product-edit-conversation-extension";
import { accountingManagementConversationExtension } from "./accounting-management-conversation-extension";
import { financeManagementConversationExtension } from "./finance-management-conversation-extension";
import { teamManagementConversationExtension } from "./team-management-conversation-extension";
import { goalManagementConversationExtension } from "./goal-management-conversation-extension";
import { goalEditConversationExtension } from "./goal-edit-conversation-extension";
import { goalCreateConversationExtension } from "./goal-create-conversation-extension";
import { calendarManagementConversationExtension } from "./calendar-management-conversation-extension";
import { companyProfileEditConversationExtension } from "./company-profile-edit-conversation-extension";
import { companyProfileCandidateConversationExtension } from "./company-profile-candidate-conversation-extension";
import { companyUnitActionConversationExtension } from "./company-unit-action-conversation-extension";
import { companyUnitFormConversationExtension } from "./company-unit-form-conversation-extension";
import { companyGoalCreateConversationExtension } from "./company-goal-create-conversation-extension";
import { companyAssetCreateConversationExtension } from "./company-asset-create-conversation-extension";
import { companySourceCreateConversationExtension } from "./company-source-create-conversation-extension";
import type {
  ConversationExtension,
  ConversationExtensionRequest,
  ConversationExtensionResult,
} from "./conversation-extension-contract";
import { resolveCustomerCorrelationId } from "./conversation-lifecycle-telemetry";
import { livingWorkspaceRuntime } from "@/lib/living-workspace/runtime";
import { invalidateCustomerCreateSurfaceOwnership } from "@/lib/customers/customer-create-surface-command-channel";
import { invalidateCustomerEditSurfaceOwnership } from "@/lib/customers/customer-edit-surface-command-channel";
import { invalidateOfferEditSurfaceOwnership } from "@/lib/offers/offer-edit-surface-command-channel";
import { invalidateTaskCreateSurfaceOwnership } from "@/lib/tasks/task-create-surface-command-channel";
import { invalidateTaskEditSurfaceOwnership } from "@/lib/tasks/task-edit-surface-command-channel";
import { invalidateOrderEditSurfaceOwnership } from "@/lib/orders/order-edit-surface-command-channel";
import { invalidateDeliveryEditSurfaceOwnership } from "@/lib/deliveries/delivery-edit-surface-command-channel";
import { invalidateInvoiceEditSurfaceOwnership } from "@/lib/invoices/invoice-edit-surface-command-channel";
import { invalidatePaymentEditSurfaceOwnership } from "@/lib/payments/payment-edit-surface-command-channel";
import { invalidateCollectionActionEditSurfaceOwnership } from "@/lib/collection-actions/collection-action-edit-surface-command-channel";
import { invalidateSupplierEditSurfaceOwnership } from "@/lib/suppliers/supplier-edit-surface-command-channel";
import { invalidateStockOperationSurfaceOwnership } from "@/lib/stock/stock-operation-surface-command-channel";
import { invalidateProductEditSurfaceOwnership } from "@/lib/products/product-edit-surface-command-channel";
import { invalidateCalendarConflictSurfaceOwnership } from "@/lib/calendar/calendar-command-channel";
import { invalidateGoalEditSurfaceOwnership } from "@/lib/goals/goal-edit-surface-command-channel";
import { invalidateGoalCreateSurfaceOwnership } from "@/lib/goals/goal-create-surface-command-channel";
import { invalidateCompanyProfileEditSurfaceOwnership } from "@/lib/company/company-profile-edit-surface-command-channel";
import { invalidateCompanyProfileCandidateSurfaceOwnership } from "@/lib/company/company-profile-candidate-surface-command-channel";
import { invalidateCompanyUnitActionSurfaceOwnership } from "@/lib/company/company-unit-action-surface-command-channel";
import { invalidateCompanyUnitFormSurfaceOwnership } from "@/lib/company/company-unit-form-surface-command-channel";
import { invalidateCompanyGoalCreateSurfaceOwnership } from "@/lib/company/company-goal-create-surface-command-channel";
import { invalidateCompanyAssetCreateSurfaceOwnership } from "@/lib/company/company-asset-create-surface-command-channel";
import { invalidateCompanySourceCreateSurfaceOwnership } from "@/lib/company/company-source-create-surface-command-channel";

const FALLBACK_TURN_WINDOW_MS = 1_500;
const MAX_TURN_CACHE_SIZE = 100;
const extensions: readonly ConversationExtension[] = [companyUnitActionConversationExtension, companyUnitFormConversationExtension, companyGoalCreateConversationExtension, companyAssetCreateConversationExtension, companySourceCreateConversationExtension, companyProfileEditConversationExtension, companyProfileCandidateConversationExtension, collectionActionEditConversationExtension, calendarManagementConversationExtension, customerEditConversationExtension, offerEditConversationExtension, orderEditConversationExtension, deliveryEditConversationExtension, invoiceEditConversationExtension, paymentEditConversationExtension, taskEditConversationExtension, supplierEditConversationExtension, productEditConversationExtension, goalEditConversationExtension, goalCreateConversationExtension, stockOperationConversationExtension, customerManagementConversationExtension, offerManagementConversationExtension, taskManagementConversationExtension, paymentManagementConversationExtension, invoiceManagementConversationExtension, supplierManagementConversationExtension, orderManagementConversationExtension, deliveryManagementConversationExtension, stockManagementConversationExtension, productManagementConversationExtension, financeManagementConversationExtension, accountingManagementConversationExtension, teamManagementConversationExtension, goalManagementConversationExtension, productionManagementConversationExtension, customerImportConversationExtension, productImportConversationExtension, invoiceImportConversationExtension, supplierImportConversationExtension, paymentImportConversationExtension, offerImportConversationExtension, orderImportConversationExtension, deliveryImportConversationExtension, stockImportConversationExtension, productionImportConversationExtension, generalImportConversationExtension, paymentReminderConversationExtension, supplierMessageConversationExtension, orchestrationApprovalConversationExtension, businessOverviewConversationExtension, orchestrationConversationExtension];

type CachedTurn = {
  createdAt: number;
  result: Promise<Omit<ConversationExtensionResult, "duplicate">>;
};

const turnCache = new Map<string, CachedTurn>();

export async function executeActiveConversationExtension(
  request: ConversationExtensionRequest,
): Promise<ConversationExtensionResult> {
  const active = extensions.filter((extension) => extension.getActiveScopeKey() !== null);
  if (active.length === 0) return { status: "NOT_HANDLED", handoff: null, duplicate: false };
  const scopeKey = active.map((extension) => extension.getActiveScopeKey()).filter(Boolean).join("|");

  const now = Date.now();
  pruneTurnCache(now);
  const turnKey = request.turnKey?.trim() || fallbackTurnKey(request, scopeKey);
  const correlationId = resolveCustomerCorrelationId(request.correlationId ?? request.turnKey);
  const cached = turnCache.get(turnKey);
  if (cached) {
    return { ...(await cached.result), duplicate: true };
  }

  const result = (async () => {
    for (const extension of active) {
      const candidate = request.activeWorkspaceContext === undefined
        ? await extension.execute(request.utterance, request.source, correlationId)
        : await extension.execute(request.utterance, request.source, correlationId, request.activeWorkspaceContext);
      if (candidate.status !== "NOT_HANDLED") return candidate;
    }
    return { status: "NOT_HANDLED" as const, handoff: null };
  })();
  turnCache.set(turnKey, { createdAt: now, result });
  return { ...(await result), duplicate: false };
}

function fallbackTurnKey(request: ConversationExtensionRequest, scopeKey: string): string {
  const normalized = request.utterance.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
  return `${request.source}:${scopeKey}:${normalized}`;
}

function pruneTurnCache(now: number): void {
  const oldestAllowed = now - FALLBACK_TURN_WINDOW_MS;
  for (const [key, entry] of turnCache) {
    if (entry.createdAt < oldestAllowed) turnCache.delete(key);
  }
  while (turnCache.size >= MAX_TURN_CACHE_SIZE) {
    const oldestKey = turnCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    turnCache.delete(oldestKey);
  }
}

export function resetConversationExtensionTurnCacheForTests(): void {
  turnCache.clear();
}

// A user asking mid-conversation to close the open workspace and return to
// chat ("teklif sayfasını kapat, sohbete dön") is not a conversation-change
// event — the directive/history must survive so the floating "X çalışma
// alanını aç" reopen affordance still works, matching the manual "Sohbete
// dön" back button (setSurfaceOpen(false), not the full clear() the reset
// boundary below uses). Routed through this single authority — not a direct
// livingWorkspaceRuntime import in MetrixChatTab.tsx — for the same reason
// resetActiveConversationExtensionState is: one place, not a duplicated path.
export function closeActiveWorkspaceSurface(): void {
  livingWorkspaceRuntime.setSurfaceOpen(false);
}

// The single canonical conversation-change reset boundary. Both
// MetrixChatTab.tsx entry points (starting a new conversation, selecting a
// different one from history) call this and nothing else — so it is the one
// place that must terminate every stale ownership a previous conversation
// could have left behind: per-domain draft/pending-operation state (via each
// extension's own reset()), the mounted Living Workspace surface itself, and
// each domain's surface-command-channel registration (the bridge a
// still-mounted screen instance would otherwise keep using to accept
// commands from whatever conversation is now active). Clearing the runtime
// also unmounts the mounted screen component, whose own effect cleanup would
// eventually call the same channel's unregister function — invalidating the
// channels here too makes that termination synchronous and independent of
// React's commit timing, rather than relying on it.
export function resetActiveConversationExtensionState(): void {
  turnCache.clear();
  for (const extension of extensions) extension.reset?.();
  livingWorkspaceRuntime.clear();
  invalidateCustomerCreateSurfaceOwnership();
  invalidateCustomerEditSurfaceOwnership();
  invalidateOfferEditSurfaceOwnership();
  invalidateTaskCreateSurfaceOwnership();
  invalidateTaskEditSurfaceOwnership();
  invalidateOrderEditSurfaceOwnership();
  invalidateDeliveryEditSurfaceOwnership();
  invalidateInvoiceEditSurfaceOwnership();
  invalidatePaymentEditSurfaceOwnership();
  invalidateCollectionActionEditSurfaceOwnership();
  invalidateSupplierEditSurfaceOwnership();
  invalidateStockOperationSurfaceOwnership();
  invalidateProductEditSurfaceOwnership();
  invalidateGoalEditSurfaceOwnership();
  invalidateGoalCreateSurfaceOwnership();
  invalidateCalendarConflictSurfaceOwnership();
  invalidateCompanyProfileEditSurfaceOwnership();
  invalidateCompanyProfileCandidateSurfaceOwnership();
  invalidateCompanyUnitActionSurfaceOwnership();
  invalidateCompanyUnitFormSurfaceOwnership();
  invalidateCompanyGoalCreateSurfaceOwnership();
  invalidateCompanyAssetCreateSurfaceOwnership();
  invalidateCompanySourceCreateSurfaceOwnership();
}

export type {
  ConversationExtensionRequest,
  ConversationExtensionResult,
  ConversationExtensionSource,
  ConversationExtensionStatus,
} from "./conversation-extension-contract";
