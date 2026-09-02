// Lazy — see company-query-readers.ts's defaultPrisma for why this can't be
// a top-level static import.
async function defaultPrisma(): Promise<typeof import("@/lib/core/shared/prisma").prisma> {
  return (await import("@/lib/core/shared/prisma")).prisma;
}

// No embedding/vector search exists anywhere in this codebase (confirmed:
// zero hits for embedding/pgvector/vector( across src/). Conversation has no
// customerId link either — it's organization-scoped free text only. This is
// therefore a bounded keyword search over past Message content, never a full
// history load: at most RESULT_LIMIT distinct conversations, each trimmed to
// a short snippet around the match. That satisfies "retrieval, not loading
// the whole history into the prompt" with the primitives this schema
// actually has.

const RESULT_LIMIT = 5;
const SNIPPET_RADIUS = 220;

export type ConversationHistoryHit = Readonly<{
  conversationId: string;
  conversationTitle: string | null;
  createdAt: string;
  snippet: string;
}>;

type MessageRow = {
  id: string;
  conversationId: string;
  content: string;
  createdAt: Date;
  conversation: { title: string | null };
};

type MessageReader = { findMany(args: unknown): Promise<MessageRow[]> };

function buildSnippet(content: string, keywords: readonly string[]): string {
  const lower = content.toLowerCase();
  const hitIndex = keywords
    .map((keyword) => lower.indexOf(keyword.toLowerCase()))
    .find((index) => index >= 0);
  if (hitIndex === undefined) return content.slice(0, SNIPPET_RADIUS * 2).trim();
  const start = Math.max(0, hitIndex - SNIPPET_RADIUS);
  const end = Math.min(content.length, hitIndex + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return `${prefix}${content.slice(start, end).trim()}${suffix}`;
}

/**
 * Keyword search over past conversations (not the current thread), most
 * recent match per conversation first. `keywords` should already be
 * meaningful terms (customer name + topic words) — empty/blank keywords are
 * dropped, and an all-empty list returns no results rather than the whole
 * table.
 */
export async function searchConversationHistory(
  organizationId: string,
  input: Readonly<{ excludeConversationId: string; keywords: readonly string[] }>,
  db?: { message: MessageReader },
): Promise<readonly ConversationHistoryHit[]> {
  const keywords = input.keywords.map((k) => k.trim()).filter((k) => k.length >= 2);
  if (keywords.length === 0) return Object.freeze([]);

  const client = db ?? (await defaultPrisma()) as unknown as { message: MessageReader };
  const rows = await client.message.findMany({
    where: {
      conversation: { organizationId, id: { not: input.excludeConversationId } },
      OR: keywords.map((keyword) => ({ content: { contains: keyword, mode: "insensitive" } })),
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true, conversationId: true, content: true, createdAt: true,
      conversation: { select: { title: true } },
    },
  });

  const seenConversations = new Set<string>();
  const hits: ConversationHistoryHit[] = [];
  for (const row of rows) {
    if (seenConversations.has(row.conversationId)) continue;
    seenConversations.add(row.conversationId);
    hits.push(Object.freeze({
      conversationId: row.conversationId,
      conversationTitle: row.conversation.title,
      createdAt: row.createdAt.toISOString(),
      snippet: buildSnippet(row.content, keywords),
    }));
    if (hits.length >= RESULT_LIMIT) break;
  }
  return Object.freeze(hits);
}
