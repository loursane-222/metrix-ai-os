import type { ExecutivePresenceEvent } from "./executive-presence-events";
import type { ExecutivePresenceEventBus } from "./executive-presence-event-bus";
import { createBoundedEventIdMemory } from "./bounded-event-id-memory";
import type {
  ExecutivePresenceActiveSignal,
  ExecutivePresenceEngineOptions,
  ExecutivePresenceErrorCategory,
  ExecutivePresenceSignalCategory,
  ExecutivePresenceSnapshot,
  ExecutivePresenceSnapshotListener,
  ExecutivePresenceTerminalFeedback,
} from "./executive-presence.types";

const COMPLETED_MIN_MS = 2_000;
const COMPLETED_MAX_MS = 5_000;
const DEFAULT_ERROR_MS = 8_000;
const DEFAULT_PROCESSED_EVENT_LIMIT = 1_024;

const STATUS_BY_CATEGORY: Readonly<
  Record<ExecutivePresenceSignalCategory, ExecutivePresenceActiveSignal["status"]>
> = Object.freeze({
  voice_listening: "listening",
  conversation_thinking: "thinking",
  surface_applying: "applying",
  approval_pending: "awaiting_approval",
  action_executing: "executing",
});

const PRECEDENCE: Readonly<Record<ExecutivePresenceActiveSignal["status"], number>> =
  Object.freeze({
    listening: 1,
    thinking: 2,
    applying: 3,
    executing: 4,
    awaiting_approval: 5,
  });

type StartEvent = Extract<
  ExecutivePresenceEvent,
  | { type: "VOICE_LISTENING_STARTED" }
  | { type: "CONVERSATION_THINKING_STARTED" }
  | { type: "SURFACE_APPLY_STARTED" }
  | { type: "APPROVAL_REQUESTED" }
  | { type: "ACTION_EXECUTION_STARTED" }
>;

export type ExecutivePresenceEngine = Readonly<{
  dispatch: (event: ExecutivePresenceEvent) => ExecutivePresenceSnapshot;
  getSnapshot: () => ExecutivePresenceSnapshot;
  subscribe: (listener: ExecutivePresenceSnapshotListener) => () => void;
  attachEventBus: (bus: ExecutivePresenceEventBus) => () => void;
  destroy: () => void;
}>;

function signalKey(
  category: ExecutivePresenceSignalCategory,
  source: string,
  correlationId: string,
): string {
  return `${category}\u0000${source}\u0000${correlationId}`;
}

function freezeSignal(signal: ExecutivePresenceActiveSignal): ExecutivePresenceActiveSignal {
  return Object.freeze(signal);
}

function emptySnapshot(): ExecutivePresenceSnapshot {
  return Object.freeze({
    status: "idle",
    activeSignals: Object.freeze([]),
    activeOperationId: null,
    correlationId: null,
    scopeId: null,
    source: null,
    reason: null,
    error: null,
    errorCategory: null,
    startedAt: null,
    updatedAt: null,
    terminalOutcome: null,
    terminalFeedback: null,
  });
}

function categoryForStart(event: StartEvent): ExecutivePresenceSignalCategory {
  switch (event.type) {
    case "VOICE_LISTENING_STARTED":
      return "voice_listening";
    case "CONVERSATION_THINKING_STARTED":
      return "conversation_thinking";
    case "SURFACE_APPLY_STARTED":
      return "surface_applying";
    case "APPROVAL_REQUESTED":
      return "approval_pending";
    case "ACTION_EXECUTION_STARTED":
      return "action_executing";
  }
}

function areActiveSignalsEqual(
  left: ExecutivePresenceActiveSignal,
  right: ExecutivePresenceActiveSignal,
): boolean {
  return (
    left.category === right.category &&
    left.status === right.status &&
    left.source === right.source &&
    left.correlationId === right.correlationId &&
    left.operationId === right.operationId &&
    left.scopeId === right.scopeId &&
    left.reason === right.reason &&
    left.startedAt === right.startedAt &&
    left.updatedAt === right.updatedAt
  );
}

function areTerminalFeedbackValuesEqual(
  left: ExecutivePresenceTerminalFeedback | null,
  right: ExecutivePresenceTerminalFeedback | null,
): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  return (
    left.outcome === right.outcome &&
    left.source === right.source &&
    left.correlationId === right.correlationId &&
    left.operationId === right.operationId &&
    left.scopeId === right.scopeId &&
    left.reason === right.reason &&
    left.error === right.error &&
    left.errorCategory === right.errorCategory &&
    left.startedAt === right.startedAt &&
    left.visibleUntil === right.visibleUntil
  );
}

function areExecutivePresenceSnapshotsMeaningfullyEqual(
  left: ExecutivePresenceSnapshot,
  right: ExecutivePresenceSnapshot,
): boolean {
  if (
    left.status !== right.status ||
    left.activeOperationId !== right.activeOperationId ||
    left.correlationId !== right.correlationId ||
    left.scopeId !== right.scopeId ||
    left.source !== right.source ||
    left.reason !== right.reason ||
    left.error !== right.error ||
    left.errorCategory !== right.errorCategory ||
    left.startedAt !== right.startedAt ||
    left.terminalOutcome !== right.terminalOutcome ||
    !areTerminalFeedbackValuesEqual(left.terminalFeedback, right.terminalFeedback) ||
    left.activeSignals.length !== right.activeSignals.length
  ) {
    return false;
  }

  for (let index = 0; index < left.activeSignals.length; index += 1) {
    if (!areActiveSignalsEqual(left.activeSignals[index], right.activeSignals[index])) {
      return false;
    }
  }

  return true;
}

export function createExecutivePresenceEngine(
  options: ExecutivePresenceEngineOptions = {},
): ExecutivePresenceEngine {
  const completedVisibilityMs = Math.min(
    COMPLETED_MAX_MS,
    Math.max(COMPLETED_MIN_MS, options.completedVisibilityMs ?? COMPLETED_MIN_MS),
  );
  const errorVisibilityMs = Math.max(0, options.errorVisibilityMs ?? DEFAULT_ERROR_MS);
  const processedEventLimit = Math.max(
    1,
    Math.floor(options.processedEventLimit ?? DEFAULT_PROCESSED_EVENT_LIMIT),
  );
  const activeSignals = new Map<string, ExecutivePresenceActiveSignal>();
  const processedEventIds = createBoundedEventIdMemory(processedEventLimit);
  const listeners = new Set<ExecutivePresenceSnapshotListener>();
  const busCleanups = new Set<() => void>();
  let terminalFeedback: ExecutivePresenceTerminalFeedback | null = null;
  let snapshot = emptySnapshot();
  let destroyed = false;

  function addSignal(event: StartEvent): void {
    const category = categoryForStart(event);
    const key = signalKey(category, event.source, event.correlationId);
    const existing = activeSignals.get(key);
    activeSignals.set(
      key,
      freezeSignal({
        category,
        status: STATUS_BY_CATEGORY[category],
        source: event.source,
        correlationId: event.correlationId,
        operationId: "operationId" in event ? (event.operationId ?? null) : null,
        scopeId: event.scopeId ?? null,
        reason: "reason" in event ? (event.reason ?? null) : null,
        startedAt: existing?.startedAt ?? event.timestamp,
        updatedAt: event.timestamp,
      }),
    );
    terminalFeedback = null;
  }

  function removeSignal(
    category: ExecutivePresenceSignalCategory,
    event: { source: string; correlationId: string; operationId?: string },
  ): ExecutivePresenceActiveSignal | null {
    const key = signalKey(category, event.source, event.correlationId);
    const existing = activeSignals.get(key) ?? null;
    if (
      existing &&
      (event.operationId === undefined || existing.operationId === event.operationId)
    ) {
      activeSignals.delete(key);
      return existing;
    }
    return null;
  }

  function createFeedback(params: {
    outcome: "success" | "error";
    event: ExecutivePresenceEvent & {
      correlationId?: string;
      operationId?: string;
      scopeId?: string;
      reason?: string;
      error?: string;
    };
    errorCategory?: ExecutivePresenceErrorCategory;
  }): void {
    terminalFeedback = Object.freeze({
      outcome: params.outcome,
      source: params.event.source,
      correlationId: params.event.correlationId ?? null,
      operationId: params.event.operationId ?? null,
      scopeId: params.event.scopeId ?? null,
      reason: params.event.reason ?? null,
      error: params.event.error ?? null,
      errorCategory: params.errorCategory ?? null,
      startedAt: params.event.timestamp,
      visibleUntil:
        params.event.timestamp +
        (params.outcome === "success" ? completedVisibilityMs : errorVisibilityMs),
    });
  }

  function applyEvent(event: ExecutivePresenceEvent): void {
    // Every event carries the deterministic clock forward. This prevents
    // expired feedback from resurfacing when durable work ends even if no
    // dedicated CLOCK_TICK was dispatched at the exact expiry boundary.
    if (terminalFeedback && event.timestamp >= terminalFeedback.visibleUntil) {
      terminalFeedback = null;
    }

    switch (event.type) {
      case "VOICE_LISTENING_STARTED":
      case "CONVERSATION_THINKING_STARTED":
      case "SURFACE_APPLY_STARTED":
      case "APPROVAL_REQUESTED":
      case "ACTION_EXECUTION_STARTED":
        addSignal(event);
        return;
      case "VOICE_LISTENING_ENDED":
        removeSignal("voice_listening", event);
        return;
      case "CONVERSATION_THINKING_ENDED":
        removeSignal("conversation_thinking", event);
        return;
      case "SURFACE_APPLY_SUCCEEDED": {
        const closed = removeSignal("surface_applying", event);
        if (closed) createFeedback({ outcome: "success", event });
        return;
      }
      case "SURFACE_APPLY_FAILED": {
        const closed = removeSignal("surface_applying", event);
        if (closed) createFeedback({ outcome: "error", event, errorCategory: "operation" });
        return;
      }
      case "APPROVAL_RESOLVED":
        removeSignal("approval_pending", event);
        return;
      case "APPROVAL_EXPIRED": {
        const closed = removeSignal("approval_pending", event);
        if (closed) createFeedback({ outcome: "error", event, errorCategory: "operation" });
        return;
      }
      case "ACTION_EXECUTION_SUCCEEDED": {
        const closed = removeSignal("action_executing", event);
        if (closed) createFeedback({ outcome: "success", event });
        return;
      }
      case "ACTION_EXECUTION_FAILED": {
        const closed = removeSignal("action_executing", event);
        if (closed) createFeedback({ outcome: "error", event, errorCategory: "operation" });
        return;
      }
      case "FEEDBACK_COMPLETED":
        createFeedback({ outcome: "success", event });
        return;
      case "FEEDBACK_ERROR":
        createFeedback({ outcome: "error", event, errorCategory: event.errorCategory });
        return;
      case "SOURCE_RELEASED":
        for (const [key, signal] of activeSignals) {
          if (
            signal.source === event.source &&
            (event.scopeId === undefined || signal.scopeId === event.scopeId)
          ) {
            activeSignals.delete(key);
          }
        }
        if (
          terminalFeedback?.source === event.source &&
          (event.scopeId === undefined || terminalFeedback.scopeId === event.scopeId)
        ) {
          terminalFeedback = null;
        }
        return;
      case "CLOCK_TICK":
        return;
    }
  }

  function project(timestamp: number): ExecutivePresenceSnapshot {
    const signals = [...activeSignals.values()].sort((left, right) => {
      const priority = PRECEDENCE[right.status] - PRECEDENCE[left.status];
      if (priority !== 0) return priority;
      if (left.startedAt !== right.startedAt) return right.startedAt - left.startedAt;
      return signalKey(left.category, left.source, left.correlationId).localeCompare(
        signalKey(right.category, right.source, right.correlationId),
      );
    });
    const frozenSignals = Object.freeze([...signals]);
    const selected = signals[0];

    if (selected) {
      return Object.freeze({
        status: selected.status,
        activeSignals: frozenSignals,
        activeOperationId: selected.operationId,
        correlationId: selected.correlationId,
        scopeId: selected.scopeId,
        source: selected.source,
        reason: selected.reason,
        error: null,
        errorCategory: null,
        startedAt: selected.startedAt,
        updatedAt: selected.updatedAt,
        terminalOutcome: null,
        terminalFeedback,
      });
    }

    if (terminalFeedback) {
      return Object.freeze({
        status: terminalFeedback.outcome === "success" ? "completed" : "error",
        activeSignals: frozenSignals,
        activeOperationId: terminalFeedback.operationId,
        correlationId: terminalFeedback.correlationId,
        scopeId: terminalFeedback.scopeId,
        source: terminalFeedback.source,
        reason: terminalFeedback.reason,
        error: terminalFeedback.error,
        errorCategory: terminalFeedback.errorCategory,
        startedAt: terminalFeedback.startedAt,
        updatedAt: timestamp,
        terminalOutcome: terminalFeedback.outcome,
        terminalFeedback,
      });
    }

    return Object.freeze({ ...emptySnapshot(), updatedAt: timestamp });
  }

  function dispatch(event: ExecutivePresenceEvent): ExecutivePresenceSnapshot {
    if (destroyed || !processedEventIds.remember(event.eventId)) return snapshot;
    applyEvent(event);
    const next = project(event.timestamp);
    if (!areExecutivePresenceSnapshotsMeaningfullyEqual(snapshot, next)) {
      snapshot = next;
      for (const listener of [...listeners]) listener(snapshot);
    }
    return snapshot;
  }

  function subscribe(listener: ExecutivePresenceSnapshotListener): () => void {
    if (destroyed) return () => undefined;
    listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      listeners.delete(listener);
    };
  }

  function attachEventBus(bus: ExecutivePresenceEventBus): () => void {
    if (destroyed) return () => undefined;
    const unsubscribe = bus.subscribe(dispatch);
    busCleanups.add(unsubscribe);
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      busCleanups.delete(unsubscribe);
      unsubscribe();
    };
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    for (const cleanup of busCleanups) cleanup();
    busCleanups.clear();
    listeners.clear();
    activeSignals.clear();
    processedEventIds.clear();
    terminalFeedback = null;
  }

  return Object.freeze({
    dispatch,
    getSnapshot: () => snapshot,
    subscribe,
    attachEventBus,
    destroy,
  });
}

export const EXECUTIVE_PRESENCE_COMPLETED_VISIBILITY_RANGE_MS = Object.freeze({
  minimum: COMPLETED_MIN_MS,
  maximum: COMPLETED_MAX_MS,
});
