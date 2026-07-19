import type { ExecutivePresenceEvent } from "@/lib/executive-presence/behavior-runtime";

export type ExecutiveActivityKind =
  | "listening"
  | "planning"
  | "applying"
  | "approval"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export type ExecutiveActivityItem = Readonly<{
  id: string;
  kind: ExecutiveActivityKind;
  label: string;
  status: "active" | "completed" | "failed" | "cancelled";
  timestamp: number;
  operationId: string | null;
  reason: string | null;
  error: string | null;
}>;

export type ExecutiveActivitySnapshot = Readonly<{
  sessionId: string | null;
  items: readonly ExecutiveActivityItem[];
  outcome: "completed" | "failed" | "cancelled" | null;
  updatedAt: number | null;
}>;

export type ExecutiveActivityProjection = Readonly<{
  getSnapshot: () => ExecutiveActivitySnapshot;
  subscribe: (listener: () => void) => () => void;
  project: (event: ExecutivePresenceEvent) => void;
  destroy: () => void;
}>;

const EMPTY: ExecutiveActivitySnapshot = Object.freeze({
  sessionId: null,
  items: Object.freeze([]),
  outcome: null,
  updatedAt: null,
});

const START_TYPES = new Set<ExecutivePresenceEvent["type"]>([
  "VOICE_LISTENING_STARTED",
  "CONVERSATION_THINKING_STARTED",
  "SURFACE_APPLY_STARTED",
  "APPROVAL_REQUESTED",
  "ACTION_EXECUTION_STARTED",
]);

function correlationId(event: ExecutivePresenceEvent): string | null {
  return "correlationId" in event ? (event.correlationId ?? null) : null;
}

function operationId(event: ExecutivePresenceEvent): string | null {
  return "operationId" in event ? (event.operationId ?? null) : null;
}

function reason(event: ExecutivePresenceEvent): string | null {
  return "reason" in event ? (event.reason ?? null) : null;
}

function error(event: ExecutivePresenceEvent): string | null {
  return "error" in event ? (event.error ?? null) : null;
}

function descriptor(event: ExecutivePresenceEvent): {
  kind: ExecutiveActivityKind;
  label: string;
  status: ExecutiveActivityItem["status"];
  outcome?: ExecutiveActivitySnapshot["outcome"];
} | null {
  switch (event.type) {
    case "VOICE_LISTENING_STARTED": return { kind: "listening", label: "Komut dinleniyor", status: "active" };
    case "VOICE_LISTENING_ENDED": return { kind: "listening", label: "Sesli komut alındı", status: "completed" };
    case "CONVERSATION_THINKING_STARTED": return { kind: "planning", label: "Komut planlanıyor", status: "active" };
    case "CONVERSATION_THINKING_ENDED": return { kind: "planning", label: "Planlama tamamlandı", status: "completed" };
    case "SURFACE_APPLY_STARTED": return { kind: "applying", label: "Sayfa değişikliği uygulanıyor", status: "active" };
    case "SURFACE_APPLY_SUCCEEDED": return { kind: "applying", label: "Sayfa değişikliği doğrulandı", status: "completed" };
    case "SURFACE_APPLY_FAILED": return { kind: "applying", label: "Sayfa değişikliği uygulanamadı", status: "failed", outcome: "failed" };
    case "APPROVAL_REQUESTED": return { kind: "approval", label: "Onayınız bekleniyor", status: "active" };
    case "APPROVAL_RESOLVED": return { kind: "approval", label: "Onay kararı alındı", status: "completed" };
    case "APPROVAL_EXPIRED": return { kind: "approval", label: "Onay süresi doldu", status: "failed", outcome: "failed" };
    case "ACTION_EXECUTION_STARTED": return { kind: "executing", label: "İşlem uygulanıyor", status: "active" };
    case "ACTION_EXECUTION_SUCCEEDED": return { kind: "executing", label: "İşlem başarıyla uygulandı", status: "completed", outcome: "completed" };
    case "ACTION_EXECUTION_FAILED": return { kind: "executing", label: "İşlem başarısız oldu", status: "failed", outcome: "failed" };
    case "FEEDBACK_COMPLETED": return { kind: "completed", label: "Çalışma tamamlandı", status: "completed", outcome: "completed" };
    case "FEEDBACK_ERROR": return { kind: "failed", label: "Çalışma tamamlanamadı", status: "failed", outcome: "failed" };
    case "SOURCE_RELEASED": return { kind: "cancelled", label: "Çalışma iptal edildi", status: "cancelled", outcome: "cancelled" };
    case "CLOCK_TICK": return null;
  }
}

export function createExecutiveActivityProjection(): ExecutiveActivityProjection {
  const processed = new Set<string>();
  const listeners = new Set<() => void>();
  let snapshot = EMPTY;
  let destroyed = false;

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    project(event) {
      if (destroyed || processed.has(event.eventId)) return;
      processed.add(event.eventId);
      if (processed.size > 1024) processed.delete(processed.values().next().value!);

      const descriptorValue = descriptor(event);
      if (!descriptorValue) return;
      const eventSessionId = correlationId(event);
      const beginsNewSession = Boolean(
        eventSessionId && START_TYPES.has(event.type) && snapshot.sessionId !== eventSessionId,
      );
      if (eventSessionId && snapshot.sessionId && eventSessionId !== snapshot.sessionId && !beginsNewSession) {
        return;
      }
      const priorItems = beginsNewSession ? [] : snapshot.items;
      const item = Object.freeze({
        id: event.eventId,
        kind: descriptorValue.kind,
        label: descriptorValue.label,
        status: descriptorValue.status,
        timestamp: event.timestamp,
        operationId: operationId(event),
        reason: reason(event),
        error: error(event),
      });
      snapshot = Object.freeze({
        sessionId: eventSessionId ?? snapshot.sessionId,
        items: Object.freeze([...priorItems, item]),
        outcome: descriptorValue.outcome ?? (beginsNewSession ? null : snapshot.outcome),
        updatedAt: event.timestamp,
      });
      for (const listener of [...listeners]) listener();
    },
    destroy() {
      destroyed = true;
      listeners.clear();
      processed.clear();
    },
  });
}
