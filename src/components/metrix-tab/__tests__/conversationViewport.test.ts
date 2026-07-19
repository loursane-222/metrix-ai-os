import { describe, expect, it, vi } from "vitest";

import {
  CONVERSATION_NEAR_BOTTOM_PX,
  createConversationViewportState,
  createFrameScheduler,
  finishAssistantMessage,
  isConversationNearBottom,
  recordConversationScroll,
  restoreConversation,
  revealLatestUserMessage,
  startAssistantMessage,
  updateAssistantMessage,
} from "../conversationViewport";

describe("conversation viewport decisions", () => {
  it("does not start a scroll cycle on initial render", () => {
    expect(createConversationViewportState()).toEqual({
      activeAssistantGeneration: null,
      autoFollow: true,
    });
  });

  it("reveals a newly added user message", () => {
    expect(revealLatestUserMessage(createConversationViewportState()).decision).toBe(
      "force-to-latest",
    );
  });

  it("forces the first assistant chunk and follows later chunks", () => {
    const started = startAssistantMessage(createConversationViewportState(), 1);
    expect(started.decision).toBe("force-to-latest");
    expect(updateAssistantMessage(started.state, 1).decision).toBe(
      "follow-active-message",
    );
  });

  it("preserves position after the user scrolls up during streaming", () => {
    const started = startAssistantMessage(createConversationViewportState(), 1);
    const scrolled = recordConversationScroll(started.state, {
      clientHeight: 500,
      scrollHeight: 1400,
      scrollTop: 500,
    });
    expect(scrolled.state.autoFollow).toBe(false);
    expect(updateAssistantMessage(scrolled.state, 1).decision).toBe(
      "preserve-user-position",
    );
  });

  it("resets follow for a different assistant message", () => {
    const paused = { activeAssistantGeneration: 1, autoFollow: false } as const;
    const next = startAssistantMessage(paused, 2);
    expect(next).toEqual({
      decision: "force-to-latest",
      state: { activeAssistantGeneration: 2, autoFollow: true },
    });
  });

  it("resumes follow when the user returns to the bottom", () => {
    const paused = { activeAssistantGeneration: 1, autoFollow: false } as const;
    const returned = recordConversationScroll(paused, {
      clientHeight: 500,
      scrollHeight: 1400,
      scrollTop: 800,
    });
    expect(returned.state.autoFollow).toBe(true);
    expect(updateAssistantMessage(returned.state, 1).decision).toBe(
      "follow-active-message",
    );
  });

  it("does not scroll again when a streaming bubble is committed", () => {
    const paused = { activeAssistantGeneration: 4, autoFollow: false } as const;
    expect(finishAssistantMessage(paused, 4)).toEqual({
      decision: "no-op",
      state: { activeAssistantGeneration: null, autoFollow: false },
    });
  });

  it("forces conversation history selection and restore to the latest message", () => {
    const paused = { activeAssistantGeneration: 2, autoFollow: false } as const;
    expect(restoreConversation(paused)).toEqual({
      decision: "force-to-latest",
      state: { activeAssistantGeneration: null, autoFollow: true },
    });
  });

  it("uses an inclusive, single near-bottom threshold", () => {
    const metrics = { clientHeight: 500, scrollHeight: 1000, scrollTop: 0 };
    expect(
      isConversationNearBottom({
        ...metrics,
        scrollTop: 500 - CONVERSATION_NEAR_BOTTOM_PX,
      }),
    ).toBe(true);
    expect(
      isConversationNearBottom({
        ...metrics,
        scrollTop: 499 - CONVERSATION_NEAR_BOTTOM_PX,
      }),
    ).toBe(false);
  });

  it("is deterministic and does not mutate controller inputs", () => {
    const state = Object.freeze({ activeAssistantGeneration: 3, autoFollow: true });
    const metrics = Object.freeze({ clientHeight: 400, scrollHeight: 900, scrollTop: 100 });
    expect(recordConversationScroll(state, metrics)).toEqual(
      recordConversationScroll(state, metrics),
    );
    expect(state).toEqual({ activeAssistantGeneration: 3, autoFollow: true });
    expect(metrics).toEqual({ clientHeight: 400, scrollHeight: 900, scrollTop: 100 });
  });
});

describe("conversation viewport frame scheduler", () => {
  it("coalesces requests within a frame and safely cancels on unmount", () => {
    const frames: FrameRequestCallback[] = [];
    const cancelFrame = vi.fn();
    const first = vi.fn();
    const latest = vi.fn();
    const scheduler = createFrameScheduler(
      (callback) => {
        frames.push(callback);
        return 7;
      },
      cancelFrame,
    );

    scheduler.request(first);
    scheduler.request(latest);
    expect(first).not.toHaveBeenCalled();
    frames[0]?.(0);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();

    scheduler.request(first);
    scheduler.cancel();
    expect(cancelFrame).toHaveBeenCalledWith(7);
  });
});
