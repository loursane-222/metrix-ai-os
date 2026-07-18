import type { MemoryContext } from "@/lib/memory/memory-context.types";
import { evaluateKnowledgeSignal } from "./executive-knowledge-authority.service";
import type { KnowledgeProjection } from "./executive-knowledge-authority.types";

export function buildMemoryAuthorityProjections(
  memoryContext: MemoryContext | null,
): KnowledgeProjection[] {
  if (!memoryContext) return [];

  return [
    ...(memoryContext.facts ?? []),
    ...(memoryContext.processes ?? []),
    ...(memoryContext.strategic ?? []),
    ...(memoryContext.preferences ?? []),
  ].flatMap((item) =>
    evaluateKnowledgeSignal({
      producer: "EXISTING_MEMORY",
      key: item.key,
      value: item.value,
      memoryItemType: item.type,
      userConfirmed: item.isUserConfirmed,
      verified: true,
      durable: true,
      confidence: item.confidence,
      metadata: { memoryItemId: item.id, source: item.source },
    }).projections,
  );
}
