import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createExecutivePresenceEngine,
  createExecutivePresenceEventBus,
  type ExecutivePresenceEvent,
} from "@/lib/executive-presence/behavior-runtime";
import { createExecutivePresenceBehaviorAdapter } from "../ExecutivePresenceBehaviorAdapter";
import { scheduleExecutivePresenceClockTick } from "../ExecutivePresenceClockTickHost";

const listeningStarted: ExecutivePresenceEvent = {
  type: "VOICE_LISTENING_STARTED",
  eventId: "voice-start-1",
  source: "test",
  timestamp: 1_000,
  correlationId: "conversation-1",
};

describe("Executive Presence React behavior adapter", () => {
  afterEach(() => vi.useRealTimers());

  it("owns one bus and engine, attaches once, and disposes once", () => {
    const bus = createExecutivePresenceEventBus();
    const realEngine = createExecutivePresenceEngine();
    const detach = vi.fn();
    const attach = vi.fn(() => detach);
    const destroy = vi.fn(realEngine.destroy);
    const engine = {
      dispatch: realEngine.dispatch,
      getSnapshot: realEngine.getSnapshot,
      subscribe: realEngine.subscribe,
      attachEventBus: attach,
      destroy,
    };
    const createBus = vi.fn(() => bus);
    const createEngine = vi.fn(() => engine);
    const adapter = createExecutivePresenceBehaviorAdapter({ createBus, createEngine });

    expect(createBus).toHaveBeenCalledTimes(1);
    expect(createEngine).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledTimes(1);
    adapter.destroy();
    adapter.destroy();
    expect(detach).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("starts idle, publishes typed events, and preserves event idempotency", () => {
    const adapter = createExecutivePresenceBehaviorAdapter();
    const listener = vi.fn();
    adapter.subscribe(listener);
    const publish = adapter.publish;

    expect(adapter.getSnapshot().status).toBe("idle");
    publish(listeningStarted);
    const listeningSnapshot = adapter.getSnapshot();
    expect(listeningSnapshot.status).toBe("listening");
    expect(listener).toHaveBeenCalledTimes(1);

    publish({ ...listeningStarted, timestamp: 2_000 });
    expect(adapter.getSnapshot()).toBe(listeningSnapshot);
    expect(listener).toHaveBeenCalledTimes(1);
    adapter.destroy();
  });

  it("does not schedule a clock tick unless the host is explicitly activated", () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    createExecutivePresenceBehaviorAdapter();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it("schedules one boundary tick and cancel prevents delivery", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const publish = vi.fn();
    const cancel = scheduleExecutivePresenceClockTick({
      visibleUntil: 3_000,
      eventId: () => "clock-1",
      publish,
    });

    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1_999);
    expect(publish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(publish).toHaveBeenCalledWith({
      type: "CLOCK_TICK",
      eventId: "clock-1",
      source: "executive-presence-react-adapter",
      timestamp: 3_000,
    });
    cancel();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("supports effect-style replacement and unmount cancellation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const publish = vi.fn();
    const firstCancel = scheduleExecutivePresenceClockTick({
      visibleUntil: 2_000,
      eventId: () => "clock-old",
      publish,
    });
    firstCancel();
    const replacementCancel = scheduleExecutivePresenceClockTick({
      visibleUntil: 4_000,
      eventId: () => "clock-new",
      publish,
    });

    vi.advanceTimersByTime(1_000);
    expect(publish).not.toHaveBeenCalled();
    replacementCancel();
    vi.runAllTimers();
    expect(publish).not.toHaveBeenCalled();
  });

  it("expires completed and error feedback back to idle", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    for (const outcome of ["FEEDBACK_COMPLETED", "FEEDBACK_ERROR"] as const) {
      const adapter = createExecutivePresenceBehaviorAdapter();
      adapter.publish(
        outcome === "FEEDBACK_COMPLETED"
          ? { type: outcome, eventId: `${outcome}-1`, source: "test", timestamp: 10_000 }
          : {
              type: outcome,
              eventId: `${outcome}-1`,
              source: "test",
              timestamp: 10_000,
              error: "failed",
              errorCategory: "operation",
            },
      );
      const feedback = adapter.getSnapshot().terminalFeedback;
      expect(feedback).not.toBeNull();
      const cancel = scheduleExecutivePresenceClockTick({
        visibleUntil: feedback!.visibleUntil,
        eventId: () => `${outcome}-tick`,
        publish: adapter.publish,
      });
      vi.advanceTimersByTime(feedback!.visibleUntil - Date.now());
      expect(adapter.getSnapshot().status).toBe("idle");
      cancel();
      adapter.destroy();
      vi.setSystemTime(10_000);
    }
  });
});
