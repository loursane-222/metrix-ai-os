import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// route.ts pulls in prisma (rate-limit check), the cookie-based auth guard,
// and the event-recording service — all stubbed here so this test exercises
// only what it's actually about: the exact session-create request body sent
// to the Realtime API. Barge-in STT accuracy fix — see route.ts's
// transcription comment for the root-cause evidence (no input-audio-buffer
// loss found; the fix is model + language + domain prompt only).
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

type CapturedBody = {
  session: {
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

describe("voice session — transcription (barge-in STT accuracy fix)", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModelEnv = process.env.CHAT_VOICE_TRANSCRIPTION_MODEL;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.CHAT_VOICE_TRANSCRIPTION_MODEL;
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    if (originalModelEnv === undefined) {
      delete process.env.CHAT_VOICE_TRANSCRIPTION_MODEL;
    } else {
      process.env.CHAT_VOICE_TRANSCRIPTION_MODEL = originalModelEnv;
    }
    vi.unstubAllGlobals();
  });

  it("carries Turkish finance/domain terms via language + a short domain prompt", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();

    const response = await POST();
    expect(response.status).toBe(200);

    const { transcription } = getCapturedBody().session.audio.input;
    expect(transcription.language).toBe("tr");
    expect(transcription.prompt).toContain("nakit akışı");
    expect(transcription.prompt).toContain("METRIX");
    expect(transcription.prompt).toContain("tahsilat");
  });

  it("defaults to the more accurate installed-SDK transcription model", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();

    await POST();

    expect(getCapturedBody().session.audio.input.transcription.model).toBe("gpt-4o-transcribe");
  });

  it("still respects an explicit CHAT_VOICE_TRANSCRIPTION_MODEL override", async () => {
    process.env.CHAT_VOICE_TRANSCRIPTION_MODEL = "whisper-1";
    const { getCapturedBody } = mockFetchCapturingBody();

    await POST();

    expect(getCapturedBody().session.audio.input.transcription.model).toBe("whisper-1");
  });

  it("leaves turn_detection (semantic_vad, eagerness:high, interrupt_response:true) untouched", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();

    await POST();

    const { turn_detection } = getCapturedBody().session.audio.input;
    expect(turn_detection.type).toBe("semantic_vad");
    expect(turn_detection.eagerness).toBe("high");
    expect(turn_detection.interrupt_response).toBe(true);
  });

  it("leaves the realtime voice default (marin) untouched", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();

    await POST();

    expect(getCapturedBody().session.audio.output.voice).toBe("marin");
  });
});
