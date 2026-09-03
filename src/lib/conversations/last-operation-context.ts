import type { ConversationExtensionHandoff } from "@/lib/conversation-extensions/conversation-extension-handoff";

// Domain-generic operation continuity: "aç bakayım"/"göster" style
// follow-ups resolve against whatever the last successful mutation was,
// regardless of which domain produced it. Sourced from the SAME
// ConversationExtensionHandoff every domain already builds (entityId/
// entityDomain are populated at a small number of shared projection points
// — see conversation-extension-handoff.ts, orchestration-conversation-
// extension.ts, customer-management-conversation-extension.ts,
// task-management-conversation-extension.ts — not per-domain here).
export type LastSuccessfulOperationContext = Readonly<{
  version: "v1";
  operation: ConversationExtensionHandoff["operation"];
  domain: string;
  entityId: string;
  entityDisplayName: string | null;
  outcomeCode: string;
  occurredAt: string;
  sourceMessageId: string;
  organizationId: string;
}>;

export function buildLastSuccessfulOperationContext(
  handoff: ConversationExtensionHandoff | null,
  input: Readonly<{ sourceMessageId: string; organizationId: string; now?: Date }>,
): LastSuccessfulOperationContext | null {
  if (!handoff) return null;
  if (handoff.resultStatus !== "EXECUTED") return null;
  if (!handoff.mutationPerformed) return null;
  const entityId = handoff.entityId;
  const domain = handoff.entityDomain;
  if (!entityId || !domain) return null;
  return Object.freeze({
    version: "v1" as const,
    operation: handoff.operation,
    domain,
    entityId,
    entityDisplayName: handoff.entityDisplayName,
    outcomeCode: handoff.outcomeCode,
    occurredAt: (input.now ?? new Date()).toISOString(),
    sourceMessageId: input.sourceMessageId,
    organizationId: input.organizationId,
  });
}

export function readLastSuccessfulOperationContext(metadata: unknown): LastSuccessfulOperationContext | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>).lastSuccessfulOperationContext;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    value.version !== "v1"
    || typeof value.operation !== "string"
    || typeof value.domain !== "string"
    || typeof value.entityId !== "string"
    || typeof value.outcomeCode !== "string"
    || typeof value.occurredAt !== "string"
    || typeof value.sourceMessageId !== "string"
    || typeof value.organizationId !== "string"
    || (value.entityDisplayName !== null && typeof value.entityDisplayName !== "string")
  ) return null;
  return Object.freeze({
    version: "v1" as const,
    operation: value.operation as ConversationExtensionHandoff["operation"],
    domain: value.domain,
    entityId: value.entityId,
    entityDisplayName: (value.entityDisplayName as string | null) ?? null,
    outcomeCode: value.outcomeCode,
    occurredAt: value.occurredAt,
    sourceMessageId: value.sourceMessageId,
    organizationId: value.organizationId,
  });
}
