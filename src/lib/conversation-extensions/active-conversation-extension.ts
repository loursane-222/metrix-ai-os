import { customerEditConversationExtension } from "./customer-edit-conversation-extension";
import { customerManagementConversationExtension } from "./customer-management-conversation-extension";
import { taskManagementConversationExtension } from "./task-management-conversation-extension";
import { offerEditConversationExtension } from "./offer-edit-conversation-extension";
import { offerManagementConversationExtension } from "./offer-management-conversation-extension";
import { paymentManagementConversationExtension } from "./payment-management-conversation-extension";
import { invoiceManagementConversationExtension } from "./invoice-management-conversation-extension";
import { supplierManagementConversationExtension } from "./supplier-management-conversation-extension";
import { orderManagementConversationExtension } from "./order-management-conversation-extension";
import { orderEditConversationExtension } from "./order-edit-conversation-extension";
import { deliveryEditConversationExtension } from "./delivery-edit-conversation-extension";
import { deliveryManagementConversationExtension } from "./delivery-management-conversation-extension";
import { stockManagementConversationExtension } from "./stock-management-conversation-extension";
import { productManagementConversationExtension } from "./product-management-conversation-extension";
import { accountingManagementConversationExtension } from "./accounting-management-conversation-extension";
import { financeManagementConversationExtension } from "./finance-management-conversation-extension";
import { teamManagementConversationExtension } from "./team-management-conversation-extension";
import { goalManagementConversationExtension } from "./goal-management-conversation-extension";
import { calendarManagementConversationExtension } from "./calendar-management-conversation-extension";
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
import { invalidateOrderEditSurfaceOwnership } from "@/lib/orders/order-edit-surface-command-channel";
import { invalidateDeliveryEditSurfaceOwnership } from "@/lib/deliveries/delivery-edit-surface-command-channel";

const FALLBACK_TURN_WINDOW_MS = 1_500;
const MAX_TURN_CACHE_SIZE = 100;
const extensions: readonly ConversationExtension[] = [calendarManagementConversationExtension, customerEditConversationExtension, offerEditConversationExtension, orderEditConversationExtension, deliveryEditConversationExtension, customerManagementConversationExtension, offerManagementConversationExtension, taskManagementConversationExtension, paymentManagementConversationExtension, invoiceManagementConversationExtension, supplierManagementConversationExtension, orderManagementConversationExtension, deliveryManagementConversationExtension, stockManagementConversationExtension, productManagementConversationExtension, financeManagementConversationExtension, accountingManagementConversationExtension, teamManagementConversationExtension, goalManagementConversationExtension];

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
  invalidateOrderEditSurfaceOwnership();
  invalidateDeliveryEditSurfaceOwnership();
}

export type {
  ConversationExtensionRequest,
  ConversationExtensionResult,
  ConversationExtensionSource,
  ConversationExtensionStatus,
} from "./conversation-extension-contract";
