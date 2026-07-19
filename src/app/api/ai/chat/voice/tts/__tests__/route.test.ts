import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { speechCreate } = vi.hoisted(() => ({ speechCreate: vi.fn() }));

vi.mock("openai", () => ({
  default: class OpenAI {
    audio = { speech: { create: speechCreate } };
  },
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: vi.fn().mockResolvedValue({ user: { id: "user" } }),
  authFail: () => Response.json({ ok: false }, { status: 401 }),
}));

import { POST } from "../route";

describe("chat fallback TTS voice authority", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalPreference = process.env.METRIX_VOICE_PREFERENCE;
  const originalLegacy = process.env.CHAT_VOICE_REALTIME_VOICE;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.METRIX_VOICE_PREFERENCE;
    delete process.env.CHAT_VOICE_REALTIME_VOICE;
    speechCreate.mockResolvedValue({
      body: new ReadableStream({ start(controller) { controller.close(); } }),
    });
  });

  afterEach(() => {
    restoreEnv("OPENAI_API_KEY", originalApiKey);
    restoreEnv("METRIX_VOICE_PREFERENCE", originalPreference);
    restoreEnv("CHAT_VOICE_REALTIME_VOICE", originalLegacy);
    vi.clearAllMocks();
  });

  it("uses male onyx and preserves PCM streaming settings and style clause", async () => {
    const response = await callRoute("risk");
    expect(response.headers.get("Content-Type")).toBe("audio/pcm");
    expect(speechCreate).toHaveBeenCalledWith(expect.objectContaining({
      voice: "onyx",
      response_format: "pcm",
      stream_format: "audio",
      speed: 1.15,
      instructions: expect.stringContaining("Bu cümlede risk var"),
    }));
  });

  it("uses female coral and its delivery profile", async () => {
    process.env.METRIX_VOICE_PREFERENCE = "executive_female";
    await callRoute("question");
    expect(speechCreate).toHaveBeenCalledWith(expect.objectContaining({
      voice: "coral",
      instructions: expect.stringContaining("kadın genel müdürsün"),
    }));
  });

  it("invalid canonical preference safely uses male", async () => {
    process.env.METRIX_VOICE_PREFERENCE = "invalid";
    await callRoute();
    expect(speechCreate).toHaveBeenCalledWith(expect.objectContaining({ voice: "onyx" }));
  });

  it("does not derive fallback TTS from a legacy realtime override", async () => {
    process.env.CHAT_VOICE_REALTIME_VOICE = "ash";
    await callRoute();
    expect(speechCreate).toHaveBeenCalledWith(expect.objectContaining({ voice: "onyx" }));
  });
});

function callRoute(styleHint = "neutral"): Promise<Response> {
  return POST(new Request("http://localhost/api/ai/chat/voice/tts", {
    method: "POST",
    body: JSON.stringify({ text: "Test metni", styleHint }),
  }));
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
