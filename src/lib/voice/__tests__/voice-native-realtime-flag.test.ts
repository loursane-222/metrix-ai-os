import { describe, it, expect, afterEach } from "vitest";
import {
  isVoiceNativeRealtimeEnabled,
  shouldSkipHttpVoicePipeline,
  resolveNativeRealtimeVoice,
  resolveNativeRealtimeVoiceFromEnv,
  shouldServerAutoInterruptResponse,
} from "../voice-native-realtime-flag";

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

describe("shouldServerAutoInterruptResponse", () => {
  it("disables server VAD auto-interrupt in native mode so the client can validate echo", () => {
    expect(shouldServerAutoInterruptResponse(true)).toBe(false);
  });

  it("preserves the existing server setting while native mode is off", () => {
    expect(shouldServerAutoInterruptResponse(false)).toBe(true);
  });
});

// Faz 1A.2 — Voice Identity, selectable via env. resolveNativeRealtimeVoice
// is pure (rawValue as a parameter) so the normalize+allowlist logic is
// testable independent of process.env; resolveNativeRealtimeVoiceFromEnv is
// the thin wrapper voice/session/route.ts actually calls.
describe("resolveNativeRealtimeVoice", () => {
  it("10: empty string — falls back to cedar", () => {
    expect(resolveNativeRealtimeVoice("")).toBe("cedar");
  });

  it("10: undefined/null — falls back to cedar", () => {
    expect(resolveNativeRealtimeVoice(undefined)).toBe("cedar");
    expect(resolveNativeRealtimeVoice(null)).toBe("cedar");
  });

  it("11: invalid/unknown value — falls back to cedar, never forwarded as-is", () => {
    expect(resolveNativeRealtimeVoice("nova")).toBe("cedar");
    expect(resolveNativeRealtimeVoice("not-a-real-voice")).toBe("cedar");
  });

  it("12: case/whitespace-insensitive — 'CEDAR', ' cedar ' both normalize to cedar", () => {
    expect(resolveNativeRealtimeVoice("CEDAR")).toBe("cedar");
    expect(resolveNativeRealtimeVoice("  cedar  ")).toBe("cedar");
  });

  it("13: 'ash' resolves to 'ash'", () => {
    expect(resolveNativeRealtimeVoice("ash")).toBe("ash");
  });

  it("14: 'echo' resolves to 'echo'", () => {
    expect(resolveNativeRealtimeVoice("echo")).toBe("echo");
  });

  it("15: 'verse' resolves to 'verse'", () => {
    expect(resolveNativeRealtimeVoice("verse")).toBe("verse");
  });

  it("17: unsupported 'onyx' (the production TTS voice, not a valid Realtime voice) — falls back to cedar", () => {
    expect(resolveNativeRealtimeVoice("onyx")).toBe("cedar");
  });

  it("accepts every SDK-verified allowlisted voice unchanged", () => {
    for (const voice of ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"]) {
      expect(resolveNativeRealtimeVoice(voice)).toBe(voice);
    }
  });
});

// voice/session/route.ts uses this exact function to resolve the Realtime
// session's audio.output.voice — CHAT_VOICE_REALTIME_VOICE, not a
// NEXT_PUBLIC_-prefixed name (see voice-native-realtime-flag.ts for why).
const VOICE_ENV_KEY = "CHAT_VOICE_REALTIME_VOICE";

describe("resolveNativeRealtimeVoiceFromEnv", () => {
  afterEach(() => {
    delete process.env[VOICE_ENV_KEY];
  });

  it("9: default (no env override) resolves to 'cedar' — METRIX's male voice identity, not 'marin'", () => {
    delete process.env[VOICE_ENV_KEY];
    expect(resolveNativeRealtimeVoiceFromEnv()).toBe("cedar");
    expect(resolveNativeRealtimeVoiceFromEnv()).not.toBe("marin");
  });

  it("16: session payload uses whatever the resolver produces from the env override", () => {
    process.env[VOICE_ENV_KEY] = "ash";
    expect(resolveNativeRealtimeVoiceFromEnv()).toBe("ash");
  });
});
