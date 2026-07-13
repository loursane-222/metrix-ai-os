import { describe, it, expect } from "vitest";
import {
  readTranscriptString,
  accumulateTranscriptDelta,
  resolveFinalAssistantTranscript,
  shouldSendResponseCancel,
} from "../useVoiceChatConnection";

// Faz 1A.1 — Native Voice Runtime. useVoiceChatConnection.ts is a "use
// client" hook built on RTCPeerConnection/document/AudioContext — this repo
// has no jsdom/testing-library dependency to instantiate it in a test
// environment (vitest.config.ts runs environment: "node"), and installing
// one is out of scope for this phase. These three functions were factored
// out of handleRealtimeEvent/cancelActiveResponse specifically so the
// essential decisions are still unit-testable without a DOM — the hook
// itself calls these same exported functions in production (not a parallel
// reimplementation), so these tests exercise the real logic.

describe("readTranscriptString", () => {
  it("reads the first matching key present on the event", () => {
    expect(readTranscriptString({ delta: "merhaba" }, ["delta", "text"])).toBe("merhaba");
    expect(readTranscriptString({ text: "merhaba" }, ["delta", "text"])).toBe("merhaba");
  });

  it("returns empty string when no key matches or value is empty", () => {
    expect(readTranscriptString({}, ["delta"])).toBe("");
    expect(readTranscriptString({ delta: "" }, ["delta"])).toBe("");
    expect(readTranscriptString({ delta: 42 }, ["delta"])).toBe("");
  });
});

describe("accumulateTranscriptDelta — assistant transcript delta accumulation", () => {
  it("5: accumulates deltas in order", () => {
    let buffer = "";
    buffer = accumulateTranscriptDelta(buffer, "Tahsilat");
    buffer = accumulateTranscriptDelta(buffer, " sürecini");
    buffer = accumulateTranscriptDelta(buffer, " hızlandıralım.");
    expect(buffer).toBe("Tahsilat sürecini hızlandıralım.");
  });

  it("does not reorder or drop chunks regardless of chunk size", () => {
    const chunks = ["B", "u", "r", "a", "d", "a"];
    const buffer = chunks.reduce(accumulateTranscriptDelta, "");
    expect(buffer).toBe("Burada");
  });
});

describe("resolveFinalAssistantTranscript — response.output_audio_transcript.done", () => {
  it("6: prefers the event's own final text when present", () => {
    const result = resolveFinalAssistantTranscript(
      "Tahsilat sür",
      "Tahsilat sürecini hızlandıralım.",
    );
    expect(result).toBe("Tahsilat sürecini hızlandıralım.");
  });

  it("6: falls back to the accumulated buffer when the done event carries no text", () => {
    const result = resolveFinalAssistantTranscript("Tahsilat sürecini hızlandıralım.", "");
    expect(result).toBe("Tahsilat sürecini hızlandıralım.");
  });
});

describe("shouldSendResponseCancel — barge-in cancel gate", () => {
  it("7: sends cancel only while a response is actually active", () => {
    expect(shouldSendResponseCancel(true)).toBe(true);
  });

  it("7: never sends cancel when no response is in flight (provider-cancel-nothing guard)", () => {
    expect(shouldSendResponseCancel(false)).toBe(false);
  });
});
