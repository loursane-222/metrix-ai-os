// Legacy Domain Semantic Ownership Final Consolidation: the active
// dispatch list below is no longer declared inline here — it is imported
// from conversation-extension-ownership-registry.ts, the single shared
// classification boundary that decides which extensions may still be
// active semantic owners and why (PRESENTATION_NAVIGATION /
// CANONICAL_CONTINUATION_APPROVAL / CONTEXT_BOUND_WORKSPACE_COMMAND), plus
// an explicit, honest RESIDUAL_LEGACY_EXTENSIONS list for the extensions
// this operation could not yet retire without real capability loss — see
// that file's own header for the full reasoning and the operation's final
// report for the itemized closure path. This file no longer needs a
// per-domain import for each extension at all.
//
// orchestrationConversationExtension (the generic natural-language
// business-write fallback, ~/orchestration-conversation-extension.ts) was
// already retired in an earlier phase (Legacy Conversation Ownership &
// Dangling Stream Closure) — it was an independent semantic cognition
// owner (its own free-text-to-plan LLM call via resolveGeneralOrchestrationPlan),
// competing with the METRIX Executive Agent for any business-write
// utterance nothing more specific claimed, and proven (2026-09-05,
// requestId 909f3ce6) to leave the underlying /api/ai/chat invocation
// dangling until the platform force-killed it. Its execution capability
// (runOrchestration, multi-step atomic plans with compensation) is
// preserved and unchanged — the Agent's own execute_business_action tool
// (src/lib/executive-agent/tools/action-tools.ts) accepts the same
// multi-step plan shape. orchestrationApprovalConversationExtension
// (registered below via the registry, CANONICAL_CONTINUATION_APPROVAL) is
// unrelated and stays: it only confirms an ALREADY-decided pending
// approval by exact phrase, never interprets a new business intent.
import { REGISTERED_EXTENSIONS, RESIDUAL_LEGACY_EXTENSIONS } from "./conversation-extension-ownership-registry";
import type {
  ConversationExtension,
  ConversationExtensionRequest,
  ConversationExtensionResult,
} from "./conversation-extension-contract";
import { isProvisionalConversationHandoff } from "./conversation-extension-handoff";
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
// Dispatched set = every classified owner (REGISTERED_EXTENSIONS) plus every
// honestly-labeled residual (RESIDUAL_LEGACY_EXTENSIONS) — see the registry
// file's own header for why residuals stay functionally active. Order is a
// priority list only (first-match-wins arbitration below), not a semantic-
// ownership grant — registration in one of the two registry lists is what
// grants dispatch eligibility at all.
const extensions: readonly ConversationExtension[] = [
  ...REGISTERED_EXTENSIONS.map((entry) => entry.extension),
  ...RESIDUAL_LEGACY_EXTENSIONS.map((entry) => entry.extension),
];

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
    // Shared arbitration: first-match-wins array order is a priority list,
    // not a semantic-ownership decision. A domain extension whose grammar
    // happened to match the utterance's surface shape but whose OWN entity
    // resolution came back NOT_FOUND has not conclusively established this
    // turn belongs to its domain — the subject may belong to a different,
    // later (or fallback) owner. Proven necessary by a real incident: a
    // customer extension's grammar briefly also matched a team role-change
    // turn and claimed it via a NOT_FOUND-driven clarification instead of
    // declining, pre-empting the team extension later in this same array.
    // But NOT_FOUND doesn't always mean "wrong domain" — it can just as
    // legitimately mean "right domain, this specific record doesn't exist"
    // (e.g. "Atlas teklifini aç" when no customer named Atlas exists: the
    // offer extension IS the correct owner and should say so). So a
    // NOT_FOUND clarification is provisional, not discarded: kept as a
    // fallback answer and only superseded if something LATER in the array
    // actually claims the turn — never silently dropped in favor of nothing.
    // AMBIGUOUS is left alone entirely: that extension really is the right
    // domain, it just needs to disambiguate among its own records.
    // Generalized provisional-claim rule (isProvisionalConversationHandoff,
    // conversation-extension-handoff.ts): covers both the NOT_FOUND
    // clarification case above AND a weak OBSERVED claim on an actionable
    // mutation operation with nothing actually executed (the Universal
    // Semantic Authority arbitration contract — see that function's own
    // comment). Kept as a last-resort fallback answer, never dropped, but a
    // later extension or the generic orchestration fallback gets first
    // chance to produce the real claim.
    let provisionalCandidate: Omit<ConversationExtensionResult, "duplicate"> | null = null;
    for (const extension of active) {
      const candidate = request.activeWorkspaceContext === undefined
        ? await extension.execute(request.utterance, request.source, correlationId)
        : await extension.execute(request.utterance, request.source, correlationId, request.activeWorkspaceContext);
      if (candidate.status === "NOT_HANDLED") continue;
      if (isProvisionalConversationHandoff(candidate.handoff)) {
        provisionalCandidate ??= candidate;
        continue;
      }
      return candidate;
    }
    return provisionalCandidate ?? { status: "NOT_HANDLED" as const, handoff: null };
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
