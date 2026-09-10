import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { speechCreate } = vi.hoisted(() => ({ speechCreate: vi.fn() }));

vi.mock("openai", () => ({
  default: class OpenAI {
    audio = { speech: { create: speechCreate } };
  },
}));

const { requireAuthContextFromCookies } = vi.hoisted(() => ({
  requireAuthContextFromCookies: vi.fn().mockResolvedValue({ user: { id: "user", voicePreference: null } }),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies,
  authFail: () => Response.json({ ok: false }, { status: 401 }),
}));

import { TTS_DELIVERY_SPEED } from "@/lib/voice/voice-preference-authority";
import { POST } from "../route";

describe("chat fallback TTS voice authority", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalPreference = process.env.METRIX_VOICE_PREFERENCE;
  const originalLegacy = process.env.CHAT_VOICE_REALTIME_VOICE;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.METRIX_VOICE_PREFERENCE;
    delete process.env.CHAT_VOICE_REALTIME_VOICE;
    requireAuthContextFromCookies.mockResolvedValue({ user: { id: "user", voicePreference: null } });
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
      speed: TTS_DELIVERY_SPEED,
      instructions: expect.stringContaining("Bu cümlede risk var"),
    }));
  });

  it("preserves incremental PCM bytes and logs first enqueue before stream completion", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    let source!: ReadableStreamDefaultController<Uint8Array>;
    speechCreate.mockResolvedValue({ body: new ReadableStream<Uint8Array>({ start(controller) { source = controller; } }) });
    try {
      const response = await callRoute();
      const reader = response.body!.getReader();
      source.enqueue(new Uint8Array([1, 2]));
      expect((await reader.read()).value).toEqual(new Uint8Array([1, 2]));
      const events = () => info.mock.calls.map((call) => JSON.parse(String(call[1])).event);
      expect(events()).toContain("tts_first_client_enqueue");
      expect(events()).not.toContain("tts_request_done");
      source.enqueue(new Uint8Array([3, 4]));
      source.close();
      expect((await reader.read()).value).toEqual(new Uint8Array([3, 4]));
      expect((await reader.read()).done).toBe(true);
      expect(events().filter((event) => event === "tts_first_client_enqueue")).toHaveLength(1);
      expect(events().indexOf("tts_first_byte")).toBeLessThan(events().indexOf("tts_first_client_enqueue"));
    } finally { info.mockRestore(); }
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

  it("gives the user's own stored voicePreference precedence over the server-wide env default", async () => {
    process.env.METRIX_VOICE_PREFERENCE = "executive_male";
    requireAuthContextFromCookies.mockResolvedValue({ user: { id: "user", voicePreference: "executive_female" } });
    await callRoute();
    expect(speechCreate).toHaveBeenCalledWith(expect.objectContaining({ voice: "coral" }));
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
