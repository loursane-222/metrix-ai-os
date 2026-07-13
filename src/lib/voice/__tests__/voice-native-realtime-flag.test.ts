import { describe, it, expect, afterEach } from "vitest";
import { isVoiceNativeRealtimeEnabled, shouldSkipHttpVoicePipeline } from "../voice-native-realtime-flag";

// Faz 1A.1 — Native Voice Runtime. This is the single source of truth
// consumed by voice/session/route.ts (create_response), useVoiceChatConnection.ts
// and useVoiceExperienceOrchestrator.ts (event handling / HTTP exclusion) —
// see each call site's own comment.

const ENV_KEY = "NEXT_PUBLIC_VOICE_NATIVE_REALTIME_ENABLED";

describe("isVoiceNativeRealtimeEnabled", () => {
  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("1: flag unset (default) — disabled, matching today's production behavior", () => {
    delete process.env[ENV_KEY];
    expect(isVoiceNativeRealtimeEnabled()).toBe(false);
  });

  it("2: flag explicitly 'true' — enabled", () => {
    process.env[ENV_KEY] = "true";
    expect(isVoiceNativeRealtimeEnabled()).toBe(true);
  });

  it("any value other than the literal string 'true' stays disabled", () => {
    for (const value of ["false", "1", "TRUE", "yes", ""]) {
      process.env[ENV_KEY] = value;
      expect(isVoiceNativeRealtimeEnabled()).toBe(false);
    }
  });
});

// MetrixChatTab.tsx's send() uses this exact function to decide whether the
// existing HTTP /api/ai/chat + TTS pipeline should run for a given turn.
describe("shouldSkipHttpVoicePipeline", () => {
  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("3: native mode active + voice turn — HTTP pipeline is skipped", () => {
    process.env[ENV_KEY] = "true";
    expect(shouldSkipHttpVoicePipeline(true)).toBe(true);
  });

  it("4: native mode off + voice turn — HTTP pipeline still runs (today's behavior)", () => {
    delete process.env[ENV_KEY];
    expect(shouldSkipHttpVoicePipeline(true)).toBe(false);
  });

  it("text-mode sends are never skipped, regardless of the flag", () => {
    process.env[ENV_KEY] = "true";
    expect(shouldSkipHttpVoicePipeline(false)).toBe(false);
  });
});
