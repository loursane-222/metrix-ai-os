import type { ExecutiveLifecycleEnvelope, ExecutiveLifecycleSink } from "./executive-lifecycle.types";
import { assertExecutiveLifecycleEnvelope } from "./executive-lifecycle.validation";

export type ExecutiveLifecycleRegistry = Readonly<{
  publish: ExecutiveLifecycleSink;
  snapshot: (filter?: Readonly<{ organizationId?: string; actorId?: string; correlationId?: string; source?: ExecutiveLifecycleEnvelope["source"] }>) => readonly ExecutiveLifecycleEnvelope[];
  clear: () => void;
}>;

export function createExecutiveLifecycleRegistry(limit = 500): ExecutiveLifecycleRegistry {
  const retentionLimit = Math.max(1, Math.floor(limit));
  const entries = new Map<string, ExecutiveLifecycleEnvelope>();
  return Object.freeze({
    publish(envelope) {
      assertExecutiveLifecycleEnvelope(envelope);
      if (entries.has(envelope.envelopeId)) return;
      entries.set(envelope.envelopeId, Object.freeze(envelope));
      while (entries.size > retentionLimit) entries.delete(entries.keys().next().value!);
    },
    snapshot(filter = {}) {
      return Object.freeze([...entries.values()]
        .filter((entry) => !filter.organizationId || entry.organizationId === filter.organizationId)
        .filter((entry) => !filter.actorId || entry.actorId === filter.actorId)
        .filter((entry) => !filter.correlationId || entry.correlationId === filter.correlationId)
        .filter((entry) => !filter.source || entry.source === filter.source)
        .sort((left, right) => left.timestamp - right.timestamp || left.envelopeId.localeCompare(right.envelopeId)));
    },
    clear() { entries.clear(); },
  });
}

export const executiveLifecycleRegistry = createExecutiveLifecycleRegistry();
