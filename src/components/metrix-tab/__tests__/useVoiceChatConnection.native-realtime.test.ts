import { describe, it, expect } from "vitest";
import {
  readTranscriptString,
  accumulateTranscriptDelta,
  resolveFinalAssistantTranscript,
  shouldSendResponseCancel,
  isFatalRealtimeErrorCode,
  shouldReportFailedResponseStatus,
  isDuplicateRealtimeEvent,
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
  it("sends cancel only while a response is actually active", () => {
    expect(shouldSendResponseCancel(true)).toBe(true);
  });

  it("never sends cancel when no response is in flight (provider-cancel-nothing guard)", () => {
    expect(shouldSendResponseCancel(false)).toBe(false);
  });

  it("8: single-cancel barge-in — active response cancels once, then the same check blocks a second send", () => {
    let hasActiveResponse = true;
    // First interrupt() call during playback: cancel fires.
    expect(shouldSendResponseCancel(hasActiveResponse)).toBe(true);
    // cancelActiveResponse() sets hasActiveResponseRef.current = false right
    // after sending — a second call in the same turn (e.g. a duplicate
    // speech_started before response.done arrives) must not send again.
    hasActiveResponse = false;
    expect(shouldSendResponseCancel(hasActiveResponse)).toBe(false);
  });
});

// Faz 1A.1 Stabilization — Stop treating every "error" event as
// session-fatal. The previous interrupt_response:true native configuration
// could race server auto-truncation with the client's response.cancel. The
// server race is now disabled in native mode, while this recovery policy
// remains defensive for provider errors. Per the installed SDK's own
// RealtimeErrorEvent doc comment ("most
// errors are recoverable and the session will stay open"), only a narrow
// allowlist of provider error codes should end the session.
describe("isFatalRealtimeErrorCode", () => {
  it("4: session/auth errors are fatal — session should stop", () => {
    expect(isFatalRealtimeErrorCode("session_expired")).toBe(true);
    expect(isFatalRealtimeErrorCode("authentication_error")).toBe(true);
    expect(isFatalRealtimeErrorCode("authorization_error")).toBe(true);
  });

  it("everything else (including undefined/unknown codes) is recoverable — session stays open", () => {
    expect(isFatalRealtimeErrorCode("invalid_request_error")).toBe(false);
    expect(isFatalRealtimeErrorCode("server_error")).toBe(false);
    expect(isFatalRealtimeErrorCode(undefined)).toBe(false);
    expect(isFatalRealtimeErrorCode("some_unknown_future_code")).toBe(false);
  });
});

// response.done's status field — none of these three ever end the session
// (only isFatalRealtimeErrorCode does); this only decides whether a
// response-level failure is worth an extra diagnostic log.
describe("shouldReportFailedResponseStatus", () => {
  it("1: 'completed' is fully normal — no report needed", () => {
    expect(shouldReportFailedResponseStatus("completed")).toBe(false);
  });

  it("2: 'cancelled' (a barge-in outcome) is fully normal — no report needed", () => {
    expect(shouldReportFailedResponseStatus("cancelled")).toBe(false);
  });

  it("3: 'failed' is a response-level failure worth reporting, but not fatal by itself", () => {
    expect(shouldReportFailedResponseStatus("failed")).toBe(true);
    // Confirmed separately: isFatalRealtimeErrorCode has no knowledge of
    // response.status at all — a "failed" response can never, by itself,
    // trigger stop()/setConnectionError.
  });
});

describe("accumulateTranscriptDelta — exact scenario from the stabilization spec", () => {
  it("6: 'Bugün' + ' en' + ' önemli' accumulates to 'Bugün en önemli'", () => {
    const buffer = ["Bugün", " en", " önemli"].reduce(accumulateTranscriptDelta, "");
    expect(buffer).toBe("Bugün en önemli");
  });
});

// Faz 1A.2 — defensive dedup against a redundant re-dispatch of the exact
// same response.output_audio_transcript.delta event (matched by the SDK's
// own per-event event_id).
describe("isDuplicateRealtimeEvent", () => {
  it("8: the same event_id seen twice in a row is treated as a duplicate", () => {
    expect(isDuplicateRealtimeEvent("evt_123", "evt_123")).toBe(true);
  });

  it("different event_ids are never duplicates", () => {
    expect(isDuplicateRealtimeEvent("evt_124", "evt_123")).toBe(false);
  });

  it("an undefined incoming event_id is never treated as a duplicate of a previous undefined", () => {
    expect(isDuplicateRealtimeEvent(undefined, undefined)).toBe(false);
  });

  it("the first delta of a response (no previous id yet) is never a duplicate", () => {
    expect(isDuplicateRealtimeEvent("evt_123", undefined)).toBe(false);
  });
});
