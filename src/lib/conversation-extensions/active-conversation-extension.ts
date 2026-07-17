import { customerEditConversationExtension } from "./customer-edit-conversation-extension";
import type {
  ConversationExtension,
  ConversationExtensionRequest,
  ConversationExtensionResult,
} from "./conversation-extension-contract";

const FALLBACK_TURN_WINDOW_MS = 1_500;
const MAX_TURN_CACHE_SIZE = 100;
const extensions: readonly ConversationExtension[] = [customerEditConversationExtension];

type CachedTurn = {
  createdAt: number;
  result: Promise<Omit<ConversationExtensionResult, "duplicate">>;
};

const turnCache = new Map<string, CachedTurn>();

export async function executeActiveConversationExtension(
  request: ConversationExtensionRequest,
): Promise<ConversationExtensionResult> {
  const active = extensions.find((extension) => extension.getActiveScopeKey() !== null);
  if (!active) return { status: "NOT_HANDLED", message: null, duplicate: false };

  const scopeKey = active.getActiveScopeKey();
  if (!scopeKey) return { status: "NOT_HANDLED", message: null, duplicate: false };

  const now = Date.now();
  pruneTurnCache(now);
  const turnKey = request.turnKey?.trim() || fallbackTurnKey(request, scopeKey);
  const cached = turnCache.get(turnKey);
  if (cached) {
    return { ...(await cached.result), duplicate: true };
  }

  const result = active.execute(request.utterance);
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
