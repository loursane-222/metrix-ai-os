import { customerEditConversationExtension } from "./customer-edit-conversation-extension";
import { customerManagementConversationExtension } from "./customer-management-conversation-extension";
import type {
  ConversationExtension,
  ConversationExtensionRequest,
  ConversationExtensionResult,
} from "./conversation-extension-contract";

const FALLBACK_TURN_WINDOW_MS = 1_500;
const MAX_TURN_CACHE_SIZE = 100;
const extensions: readonly ConversationExtension[] = [customerEditConversationExtension, customerManagementConversationExtension];

type CachedTurn = {
  createdAt: number;
  result: Promise<Omit<ConversationExtensionResult, "duplicate">>;
};

const turnCache = new Map<string, CachedTurn>();

export async function executeActiveConversationExtension(
  request: ConversationExtensionRequest,
): Promise<ConversationExtensionResult> {
  const active = extensions.filter((extension) => extension.getActiveScopeKey() !== null);
  if (active.length === 0) return { status: "NOT_HANDLED", message: null, duplicate: false };
  const scopeKey = active.map((extension) => extension.getActiveScopeKey()).filter(Boolean).join("|");

  const now = Date.now();
  pruneTurnCache(now);
  const turnKey = request.turnKey?.trim() || fallbackTurnKey(request, scopeKey);
  const cached = turnCache.get(turnKey);
  if (cached) {
    return { ...(await cached.result), duplicate: true };
  }

  const result = (async () => {
    for (const extension of active) {
      const candidate = await extension.execute(request.utterance, request.source);
      if (candidate.status !== "NOT_HANDLED") return candidate;
    }
    return { status: "NOT_HANDLED" as const, message: null };
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

export type {
  ConversationExtensionRequest,
  ConversationExtensionResult,
  ConversationExtensionSource,
  ConversationExtensionStatus,
} from "./conversation-extension-contract";
