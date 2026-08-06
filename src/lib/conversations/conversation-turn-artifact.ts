import type { CanonicalBusinessFactEntity, CanonicalBusinessFacts } from "@/lib/canonical-business-facts/canonical-business-facts.service";

export type ConversationTurnArtifact = Readonly<{
  version: "v1";
  entity: CanonicalBusinessFactEntity;
  model: CanonicalBusinessFacts["model"];
  recordIds: readonly string[];
  displayOrder: readonly string[];
  records: readonly Readonly<Record<string, string | null>>[];
  sourceMessageId: string;
  organizationId: string;
  validUntil: string;
}>;

export function buildConversationTurnArtifacts(input: {
  facts: readonly CanonicalBusinessFacts[];
  sourceMessageId: string;
  organizationId: string;
  now?: Date;
  ttlMs?: number;
}): readonly ConversationTurnArtifact[] {
  const now = input.now ?? new Date();
  const validUntil = new Date(now.getTime() + (input.ttlMs ?? 15 * 60_000)).toISOString();
  return input.facts
    .filter((fact) => fact.records.length > 0)
    .map((fact) => Object.freeze({
      version: "v1" as const,
      entity: fact.entity,
      model: fact.model,
      recordIds: Object.freeze(fact.records.map((record) => String(record.id ?? "")).filter(Boolean)),
      displayOrder: Object.freeze(fact.records.map((record) => String(record.name ?? record.displayName ?? record.title ?? record.id ?? ""))),
      records: Object.freeze(fact.records.map((record) => Object.freeze({ ...record }))),
      sourceMessageId: input.sourceMessageId,
      organizationId: input.organizationId,
      validUntil,
    }));
}

export function readConversationTurnArtifacts(metadata: unknown, now = new Date()): readonly ConversationTurnArtifact[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as Record<string, unknown>).conversationTurnArtifacts;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is ConversationTurnArtifact => {
    if (!item || typeof item !== "object") return false;
    const value = item as Record<string, unknown>;
    return value.version === "v1"
      && typeof value.entity === "string"
      && typeof value.model === "string"
      && typeof value.sourceMessageId === "string"
      && typeof value.organizationId === "string"
      && typeof value.validUntil === "string"
      && new Date(value.validUntil).getTime() > now.getTime()
      && Array.isArray(value.recordIds)
      && Array.isArray(value.displayOrder)
      && Array.isArray(value.records);
  });
}

