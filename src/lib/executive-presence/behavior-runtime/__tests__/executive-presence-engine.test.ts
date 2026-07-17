import { describe, expect, it, vi } from "vitest";

import { createExecutivePresenceEventBus } from "../executive-presence-event-bus";
import { createExecutivePresenceEngine } from "../executive-presence-engine";
import type { ExecutivePresenceEvent } from "../executive-presence-events";

const BASE_TIME = 1_000_000;

function event<T extends ExecutivePresenceEvent>(value: T): T {
  return value;
}

function voiceStarted(id = "voice-start", correlationId = "voice-1", source = "voice", scopeId = "chat") {
  return event({
    eventId: id,
    type: "VOICE_LISTENING_STARTED",
    source,
    timestamp: BASE_TIME,
    correlationId,
    scopeId,
  });
}

function thinkingStarted(id = "think-start", correlationId = "turn-1") {
  return event({
    eventId: id,
    type: "CONVERSATION_THINKING_STARTED",
    source: "conversation",
    timestamp: BASE_TIME + 10,
    correlationId,
    scopeId: "chat",
  });
}

function applyingStarted(id = "apply-start", correlationId = "surface-1") {
  return event({
    eventId: id,
    type: "SURFACE_APPLY_STARTED",
    source: "customer-surface",
    timestamp: BASE_TIME + 20,
    correlationId,
    operationId: `op-${correlationId}`,
    scopeId: "customer-1",
  });
}

function executionStarted(id = "execute-start", correlationId = "action-1") {
  return event({
    eventId: id,
    type: "ACTION_EXECUTION_STARTED",
    source: "action-runtime",
    timestamp: BASE_TIME + 30,
    correlationId,
    operationId: `op-${correlationId}`,
    scopeId: "customer-1",
  });
}

function approvalRequested(id = "approval-start", correlationId = "approval-1") {
  return event({
    eventId: id,
    type: "APPROVAL_REQUESTED",
    source: "approval-runtime",
    timestamp: BASE_TIME + 40,
    correlationId,
    operationId: `op-${correlationId}`,
    scopeId: "customer-1",
  });
}

describe("Executive Presence Engine — projection and precedence", () => {
  it("starts idle without events", () => {
    expect(createExecutivePresenceEngine().getSnapshot()).toMatchObject({
      status: "idle",
      activeSignals: [],
      terminalOutcome: null,
    });
  });

  it("projects voice start as listening and matching end as idle", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(voiceStarted());
    expect(engine.getSnapshot().status).toBe("listening");

    engine.dispatch({
      eventId: "voice-end",
      type: "VOICE_LISTENING_ENDED",
      source: "voice",
      timestamp: BASE_TIME + 1,
      correlationId: "voice-1",
      scopeId: "chat",
    });
    expect(engine.getSnapshot().status).toBe("idle");
  });

  it("projects thinking over listening", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(voiceStarted());
    engine.dispatch(thinkingStarted());
    expect(engine.getSnapshot().status).toBe("thinking");
  });

  it("projects applying over thinking and listening", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(voiceStarted());
    engine.dispatch(thinkingStarted());
    engine.dispatch(applyingStarted());
    expect(engine.getSnapshot().status).toBe("applying");
  });

  it("projects executing over applying, thinking and listening", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(voiceStarted());
    engine.dispatch(thinkingStarted());
    engine.dispatch(applyingStarted());
    engine.dispatch(executionStarted());
    expect(engine.getSnapshot().status).toBe("executing");
  });

  it("projects pending approval over every other active status", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(voiceStarted());
    engine.dispatch(thinkingStarted());
    engine.dispatch(applyingStarted());
    engine.dispatch(executionStarted());
    engine.dispatch(approvalRequested());
    expect(engine.getSnapshot()).toMatchObject({
      status: "awaiting_approval",
      activeOperationId: "op-approval-1",
      source: "approval-runtime",
    });
  });

  it("reveals the next valid active status after approval resolves", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(executionStarted());
    engine.dispatch(approvalRequested());
    engine.dispatch({
      eventId: "approval-resolved",
      type: "APPROVAL_RESOLVED",
      source: "approval-runtime",
      timestamp: BASE_TIME + 50,
      correlationId: "approval-1",
      operationId: "op-approval-1",
      scopeId: "customer-1",
    });
    expect(engine.getSnapshot().status).toBe("executing");
  });
});

describe("Executive Presence Engine — correlation and ownership", () => {
  it("does not let a stale completion close a newer correlation", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(applyingStarted("old-start", "old"));
    engine.dispatch(applyingStarted("new-start", "new"));
    engine.dispatch({
      eventId: "old-success",
      type: "SURFACE_APPLY_SUCCEEDED",
      source: "customer-surface",
      timestamp: BASE_TIME + 30,
      correlationId: "old",
      operationId: "op-old",
      scopeId: "customer-1",
    });

    expect(engine.getSnapshot()).toMatchObject({ status: "applying", correlationId: "new" });
    expect(engine.getSnapshot().activeSignals).toHaveLength(1);
  });

  it("does not close a correlation when its operation ID does not match", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(executionStarted());
    engine.dispatch({
      eventId: "wrong-operation",
      type: "ACTION_EXECUTION_SUCCEEDED",
      source: "action-runtime",
      timestamp: BASE_TIME + 40,
      correlationId: "action-1",
      operationId: "op-other",
      scopeId: "customer-1",
    });
    expect(engine.getSnapshot().status).toBe("executing");
  });

  it("ignores duplicate event IDs idempotently", () => {
    const engine = createExecutivePresenceEngine();
    const listener = vi.fn();
    engine.subscribe(listener);
    const start = voiceStarted();
    const first = engine.dispatch(start);
    const second = engine.dispatch(start);
    expect(second).toBe(first);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps multiple same-category correlations active", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(voiceStarted("voice-a", "a"));
    engine.dispatch(voiceStarted("voice-b", "b"));
    expect(engine.getSnapshot().activeSignals).toHaveLength(2);

    engine.dispatch({
      eventId: "end-a",
      type: "VOICE_LISTENING_ENDED",
      source: "voice",
      timestamp: BASE_TIME + 2,
      correlationId: "a",
      scopeId: "chat",
    });
    expect(engine.getSnapshot()).toMatchObject({ status: "listening", correlationId: "b" });
  });

  it("SOURCE_RELEASED clears only signals matching its source and optional scope", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(voiceStarted("voice-a", "a", "voice-a", "scope-a"));
    engine.dispatch(voiceStarted("voice-b", "b", "voice-a", "scope-b"));
    engine.dispatch(thinkingStarted());
    engine.dispatch({
      eventId: "release",
      type: "SOURCE_RELEASED",
      source: "voice-a",
      timestamp: BASE_TIME + 30,
      scopeId: "scope-a",
    });
    expect(engine.getSnapshot().activeSignals.map((signal) => signal.correlationId)).toEqual([
      "turn-1",
      "b",
    ]);
  });

  it("bounds processed event IDs and permits an evicted ID to be processed again", () => {
    const engine = createExecutivePresenceEngine({ processedEventLimit: 2 });
    engine.dispatch(voiceStarted("reusable"));
    engine.dispatch({ eventId: "tick-1", type: "CLOCK_TICK", source: "clock", timestamp: BASE_TIME + 1 });
    engine.dispatch({ eventId: "tick-2", type: "CLOCK_TICK", source: "clock", timestamp: BASE_TIME + 2 });
    engine.dispatch({
      eventId: "reusable",
      type: "VOICE_LISTENING_ENDED",
      source: "voice",
      timestamp: BASE_TIME + 3,
      correlationId: "voice-1",
    });
    expect(engine.getSnapshot().status).toBe("idle");
  });
});

describe("Executive Presence Engine — terminal feedback", () => {
  it("shows completed only when no durable higher-priority signal is active", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(approvalRequested());
    engine.dispatch({
      eventId: "feedback-success",
      type: "FEEDBACK_COMPLETED",
      source: "surface",
      timestamp: BASE_TIME + 50,
      reason: "saved",
    });
    expect(engine.getSnapshot()).toMatchObject({
      status: "awaiting_approval",
      terminalOutcome: null,
    });
    expect(engine.getSnapshot().terminalFeedback?.outcome).toBe("success");
  });

  it("replaces completed immediately when a new active event arrives", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch({
      eventId: "feedback-success",
      type: "FEEDBACK_COMPLETED",
      source: "surface",
      timestamp: BASE_TIME,
    });
    expect(engine.getSnapshot().status).toBe("completed");
    engine.dispatch(voiceStarted());
    expect(engine.getSnapshot()).toMatchObject({ status: "listening", terminalFeedback: null });
  });

  it("clamps completed visibility to the deterministic 2-5 second range", () => {
    const minimum = createExecutivePresenceEngine({ completedVisibilityMs: 100 });
    minimum.dispatch({ eventId: "done", type: "FEEDBACK_COMPLETED", source: "surface", timestamp: BASE_TIME });
    minimum.dispatch({ eventId: "before-min", type: "CLOCK_TICK", source: "clock", timestamp: BASE_TIME + 1_999 });
    expect(minimum.getSnapshot().status).toBe("completed");
    minimum.dispatch({ eventId: "at-min", type: "CLOCK_TICK", source: "clock", timestamp: BASE_TIME + 2_000 });
    expect(minimum.getSnapshot().status).toBe("idle");

    const maximum = createExecutivePresenceEngine({ completedVisibilityMs: 99_000 });
    maximum.dispatch({ eventId: "done", type: "FEEDBACK_COMPLETED", source: "surface", timestamp: BASE_TIME });
    maximum.dispatch({ eventId: "before-max", type: "CLOCK_TICK", source: "clock", timestamp: BASE_TIME + 4_999 });
    expect(maximum.getSnapshot().status).toBe("completed");
    maximum.dispatch({ eventId: "at-max", type: "CLOCK_TICK", source: "clock", timestamp: BASE_TIME + 5_000 });
    expect(maximum.getSnapshot().status).toBe("idle");
  });

  it("does not let presentation feedback error hide approval or execution", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(executionStarted());
    engine.dispatch(approvalRequested());
    engine.dispatch({
      eventId: "connection-error",
      type: "FEEDBACK_ERROR",
      source: "voice",
      timestamp: BASE_TIME + 50,
      error: "connection lost",
      errorCategory: "presentation_connection",
    });
    expect(engine.getSnapshot().status).toBe("awaiting_approval");
    expect(engine.getSnapshot().terminalFeedback?.errorCategory).toBe("presentation_connection");
  });

  it("does not reveal feedback that expired while durable work was active", () => {
    const engine = createExecutivePresenceEngine({ errorVisibilityMs: 500 });
    engine.dispatch(executionStarted());
    engine.dispatch({
      eventId: "hidden-error",
      type: "FEEDBACK_ERROR",
      source: "voice",
      timestamp: BASE_TIME + 40,
      error: "offline",
      errorCategory: "presentation_connection",
    });
    engine.dispatch({
      eventId: "execution-success-after-error-expiry",
      type: "ACTION_EXECUTION_SUCCEEDED",
      source: "action-runtime",
      timestamp: BASE_TIME + 600,
      correlationId: "action-1",
      operationId: "op-action-1",
      scopeId: "customer-1",
    });
    expect(engine.getSnapshot()).toMatchObject({ status: "completed", error: null });
  });

  it("expires error feedback deterministically using the configured duration", () => {
    const engine = createExecutivePresenceEngine({ errorVisibilityMs: 500 });
    engine.dispatch({
      eventId: "error",
      type: "FEEDBACK_ERROR",
      source: "voice",
      timestamp: BASE_TIME,
      error: "offline",
      errorCategory: "presentation_connection",
    });
    engine.dispatch({ eventId: "before", type: "CLOCK_TICK", source: "clock", timestamp: BASE_TIME + 499 });
    expect(engine.getSnapshot().status).toBe("error");
    engine.dispatch({ eventId: "expire", type: "CLOCK_TICK", source: "clock", timestamp: BASE_TIME + 500 });
    expect(engine.getSnapshot().status).toBe("idle");
  });

  it("turns successful action execution into terminal success feedback", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(executionStarted());
    engine.dispatch({
      eventId: "action-success",
      type: "ACTION_EXECUTION_SUCCEEDED",
      source: "action-runtime",
      timestamp: BASE_TIME + 100,
      correlationId: "action-1",
      operationId: "op-action-1",
      scopeId: "customer-1",
      reason: "updated",
    });
    expect(engine.getSnapshot()).toMatchObject({
      status: "completed",
      terminalOutcome: "success",
      activeOperationId: "op-action-1",
    });
  });

  it("turns failed execution into typed terminal operation error feedback", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(executionStarted());
    engine.dispatch({
      eventId: "action-failed",
      type: "ACTION_EXECUTION_FAILED",
      source: "action-runtime",
      timestamp: BASE_TIME + 100,
      correlationId: "action-1",
      operationId: "op-action-1",
      scopeId: "customer-1",
      error: "rejected",
    });
    expect(engine.getSnapshot()).toMatchObject({
      status: "error",
      terminalOutcome: "error",
      errorCategory: "operation",
      error: "rejected",
    });
  });
});

describe("Executive Presence Engine — subscriptions and immutability", () => {
  it("notifies subscribers only for meaningful snapshot changes", () => {
    const engine = createExecutivePresenceEngine();
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.dispatch({ eventId: "tick-1", type: "CLOCK_TICK", source: "clock", timestamp: BASE_TIME });
    engine.dispatch(voiceStarted());
    engine.dispatch({ eventId: "tick-2", type: "CLOCK_TICK", source: "clock", timestamp: BASE_TIME + 1 });
    engine.dispatch({ eventId: "unmatched-end", type: "VOICE_LISTENING_ENDED", source: "voice", timestamp: BASE_TIME + 2, correlationId: "other" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("notifies when an existing active correlation is meaningfully updated", () => {
    const engine = createExecutivePresenceEngine();
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.dispatch({
      ...voiceStarted(),
      reason: "waiting-for-speech",
    });
    engine.dispatch({
      ...voiceStarted("voice-update"),
      timestamp: BASE_TIME + 25,
      reason: "user-speaking",
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(engine.getSnapshot().activeSignals[0]).toMatchObject({
      reason: "user-speaking",
      startedAt: BASE_TIME,
      updatedAt: BASE_TIME + 25,
    });
  });

  it("notifies when terminal feedback expires and projects idle", () => {
    const engine = createExecutivePresenceEngine({ errorVisibilityMs: 500 });
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.dispatch({
      eventId: "connection-feedback",
      type: "FEEDBACK_ERROR",
      source: "voice",
      timestamp: BASE_TIME,
      error: "offline",
      errorCategory: "presentation_connection",
    });
    engine.dispatch({
      eventId: "expiry-tick",
      type: "CLOCK_TICK",
      source: "clock",
      timestamp: BASE_TIME + 500,
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0].status).toBe("idle");
  });

  it("unsubscribes and destroys engine and event-bus listeners safely", () => {
    const engine = createExecutivePresenceEngine();
    const bus = createExecutivePresenceEventBus();
    const listener = vi.fn();
    const unsubscribeSnapshot = engine.subscribe(listener);
    const detach = engine.attachEventBus(bus);
    bus.publish(voiceStarted());
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribeSnapshot();
    unsubscribeSnapshot();
    detach();
    detach();
    engine.destroy();
    engine.destroy();
    bus.publish(thinkingStarted());
    expect(engine.getSnapshot().status).toBe("listening");
  });

  it("does not expose mutable internal registries through snapshots", () => {
    const engine = createExecutivePresenceEngine();
    engine.dispatch(voiceStarted());
    const snapshot = engine.getSnapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.activeSignals)).toBe(true);
    expect(Object.isFrozen(snapshot.activeSignals[0])).toBe(true);
    expect(() => {
      (snapshot.activeSignals as unknown as ExecutivePresenceEvent[]).push(voiceStarted("mutate"));
    }).toThrow();
    expect(engine.getSnapshot().activeSignals).toHaveLength(1);
  });
});
