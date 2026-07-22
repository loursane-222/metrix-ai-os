import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// route.ts pulls in prisma (rate-limit check), the cookie-based auth guard,
// and the event-recording service — all stubbed here so this test exercises
// only what it's actually about: the exact session-create request body sent
// to the Realtime API.
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { event: { count: vi.fn().mockResolvedValue(0) } },
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: vi.fn().mockResolvedValue({
    user: { id: "user_1" },
    organization: { id: "org_1" },
  }),
  authFail: (error: unknown) =>
    Response.json({ ok: false, error: { message: String(error) } }, { status: 500 }),
}));

vi.mock("@/lib/core/events/event.service", () => ({
  recordEvent: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "../route";
import { resolveVoiceVadEagerness } from "@/lib/voice/voice-native-realtime-flag";

type CapturedBody = {
  session: {
    instructions: string;
    audio: {
      input: {
        transcription: { model?: string; language?: string; prompt?: string };
        turn_detection: {
          type?: string;
          eagerness?: string;
          create_response?: boolean;
          interrupt_response?: boolean;
        };
      };
      output: { voice?: string };
    };
  };
};

function mockFetchCapturingBody(): { getCapturedBody: () => CapturedBody } {
  let capturedBody: CapturedBody | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body)) as CapturedBody;
      return new Response(JSON.stringify({ value: "secret_abc", expires_at: 123 }), {
        status: 200,
      });
    }),
  );
  return {
    getCapturedBody: () => {
      if (!capturedBody) throw new Error("fetch was never called");
      return capturedBody;
    },
  };
}

function sessionRequest(platformClass = "desktop"): Request {
  return new Request("http://localhost/api/ai/chat/voice/session", {
    method: "POST",
    body: JSON.stringify({ platformClass }),
  });
}

describe("voice session — transcript-gated native response", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModelEnv = process.env.CHAT_VOICE_TRANSCRIPTION_MODEL;
  const originalPreferenceEnv = process.env.METRIX_VOICE_PREFERENCE;
  const originalLegacyVoiceEnv = process.env.CHAT_VOICE_REALTIME_VOICE;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.CHAT_VOICE_TRANSCRIPTION_MODEL;
    delete process.env.METRIX_VOICE_PREFERENCE;
    delete process.env.CHAT_VOICE_REALTIME_VOICE;
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    if (originalModelEnv === undefined) {
      delete process.env.CHAT_VOICE_TRANSCRIPTION_MODEL;
    } else {
      process.env.CHAT_VOICE_TRANSCRIPTION_MODEL = originalModelEnv;
    }
    restoreEnv("METRIX_VOICE_PREFERENCE", originalPreferenceEnv);
    restoreEnv("CHAT_VOICE_REALTIME_VOICE", originalLegacyVoiceEnv);
    vi.unstubAllGlobals();
  });

  it("keeps Turkish transcription without a bias prompt", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();

    const response = await POST(sessionRequest());
    expect(response.status).toBe(200);

    const { transcription } = getCapturedBody().session.audio.input;
    expect(transcription.language).toBe("tr");
    expect(transcription).not.toHaveProperty("prompt");
  });

  it("uses the shared Executive Identity contract in session instructions", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();

    await POST(sessionRequest());

    const { instructions } = getCapturedBody().session;
    expect(instructions).toContain("Sen Metrix'sin");
    expect(instructions).toContain("AI Genel Müdürüsün");
    expect(instructions).toContain("Kendini asistan, bot, hafıza servisi");
    expect(instructions).toContain("Şirketinin AI Genel Müdürüyüm");
    expect(instructions).toContain("Kısa, doğal ve doğrudan cevap ver");
  });

  it("defaults to the more accurate installed-SDK transcription model", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();

    await POST(sessionRequest());

    expect(getCapturedBody().session.audio.input.transcription.model).toBe("gpt-4o-transcribe");
  });

  it("still respects an explicit CHAT_VOICE_TRANSCRIPTION_MODEL override", async () => {
    process.env.CHAT_VOICE_TRANSCRIPTION_MODEL = "whisper-1";
    const { getCapturedBody } = mockFetchCapturingBody();

    await POST(sessionRequest());

    expect(getCapturedBody().session.audio.input.transcription.model).toBe("whisper-1");
  });

  it("leaves turn_detection (semantic_vad, eagerness:high, interrupt_response:true) untouched", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();

    await POST(sessionRequest());

    const { turn_detection } = getCapturedBody().session.audio.input;
    expect(turn_detection.type).toBe("semantic_vad");
    expect(turn_detection.eagerness).toBe("high");
    expect(turn_detection.interrupt_response).toBe(true);
    expect(turn_detection.create_response).toBe(false);
  });

  it("uses balanced semantic VAD only for iOS Safari", () => {
    expect(resolveVoiceVadEagerness("ios-safari")).toBe("medium");
    expect(resolveVoiceVadEagerness("mobile-other")).toBe("high");
    expect(resolveVoiceVadEagerness("desktop")).toBe("high");
  });

  it("uses the canonical male realtime default", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();

    await POST(sessionRequest());

    expect(getCapturedBody().session.audio.output.voice).toBe("cedar");
  });

  it("uses the canonical female realtime voice", async () => {
    process.env.METRIX_VOICE_PREFERENCE = "executive_female";
    const { getCapturedBody } = mockFetchCapturingBody();

    await POST(sessionRequest());

    expect(getCapturedBody().session.audio.output.voice).toBe("marin");
  });

  it("falls back to canonical male for an invalid canonical env", async () => {
    process.env.METRIX_VOICE_PREFERENCE = "not-a-profile";
    process.env.CHAT_VOICE_REALTIME_VOICE = "ash";
    const { getCapturedBody } = mockFetchCapturingBody();

    await POST(sessionRequest());

    expect(getCapturedBody().session.audio.output.voice).toBe("cedar");
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
