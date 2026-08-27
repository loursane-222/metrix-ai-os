import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_REALTIME_USAGE_TOTALS,
  accumulateRealtimeUsage,
  buildVoiceSessionEndPayload,
  reportVoiceSessionEnd,
} from "../useVoiceChatConnection";

describe("accumulateRealtimeUsage", () => {
  it("adds a response's token usage onto the running totals", () => {
    const afterFirst = accumulateRealtimeUsage(EMPTY_REALTIME_USAGE_TOTALS, {
      input_tokens: 100,
      output_tokens: 40,
      total_tokens: 140,
    });
    expect(afterFirst).toEqual({ inputTokens: 100, outputTokens: 40, totalTokens: 140 });

    const afterSecond = accumulateRealtimeUsage(afterFirst, {
      input_tokens: 50,
      output_tokens: 10,
      total_tokens: 60,
    });
    expect(afterSecond).toEqual({ inputTokens: 150, outputTokens: 50, totalTokens: 200 });
  });

  it("leaves totals unchanged when usage is missing or malformed", () => {
    expect(accumulateRealtimeUsage(EMPTY_REALTIME_USAGE_TOTALS, undefined)).toEqual(EMPTY_REALTIME_USAGE_TOTALS);
    expect(accumulateRealtimeUsage(EMPTY_REALTIME_USAGE_TOTALS, null)).toEqual(EMPTY_REALTIME_USAGE_TOTALS);
    expect(accumulateRealtimeUsage(EMPTY_REALTIME_USAGE_TOTALS, { input_tokens: "not a number" }))
      .toEqual(EMPTY_REALTIME_USAGE_TOTALS);
  });
});

describe("buildVoiceSessionEndPayload", () => {
  it("returns null when the call never reached a connected state", () => {
    const payload = buildVoiceSessionEndPayload({
      voiceSessionId: "voice_1",
      reason: "startup_failure",
      connectedAt: null,
      endedAt: 1000,
      usage: EMPTY_REALTIME_USAGE_TOTALS,
    });
    expect(payload).toBeNull();
  });

  it("computes duration from connectedAt to endedAt and carries usage through", () => {
    const payload = buildVoiceSessionEndPayload({
      voiceSessionId: "voice_1",
      reason: "explicit_user_stop",
      connectedAt: 1000,
      endedAt: 46230,
      usage: { inputTokens: 1200, outputTokens: 340, totalTokens: 1540 },
    });
    expect(payload).toEqual({
      voiceSessionId: "voice_1",
      durationMs: 45230,
      reason: "explicit_user_stop",
      inputTokens: 1200,
      outputTokens: 340,
      totalTokens: 1540,
    });
  });

  it("never reports a negative duration", () => {
    const payload = buildVoiceSessionEndPayload({
      voiceSessionId: "voice_1",
      reason: "unknown",
      connectedAt: 1000,
      endedAt: 900,
      usage: EMPTY_REALTIME_USAGE_TOTALS,
    });
    expect(payload?.durationMs).toBe(0);
  });
});

describe("reportVoiceSessionEnd", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const payload = {
    voiceSessionId: "voice_1",
    durationMs: 1000,
    reason: "explicit_user_stop",
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
  };

  it("sends via sendBeacon when available and succeeds", () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { sendBeacon });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    reportVoiceSessionEnd(payload);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe("/api/ai/chat/voice/session/end");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to a keepalive fetch when sendBeacon is unavailable", () => {
    vi.stubGlobal("navigator", {});
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    reportVoiceSessionEnd(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ai/chat/voice/session/end");
    expect(init).toMatchObject({ method: "POST", keepalive: true, credentials: "include" });
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it("falls back to fetch when sendBeacon returns false", () => {
    const sendBeacon = vi.fn().mockReturnValue(false);
    vi.stubGlobal("navigator", { sendBeacon });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    reportVoiceSessionEnd(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
