import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { speechCreate } = vi.hoisted(() => ({ speechCreate: vi.fn() }));

vi.mock("openai", () => ({
  default: class OpenAI {
    audio = { speech: { create: speechCreate } };
  },
}));

import { POST } from "../route";

describe("onboarding fallback TTS voice authority", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalPreference = process.env.METRIX_VOICE_PREFERENCE;
  const originalLegacy = process.env.ONBOARDING_VOICE_REALTIME_VOICE;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.METRIX_VOICE_PREFERENCE;
    delete process.env.ONBOARDING_VOICE_REALTIME_VOICE;
    speechCreate.mockResolvedValue({ arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)) });
  });

  afterEach(() => {
    restoreEnv("OPENAI_API_KEY", originalApiKey);
    restoreEnv("METRIX_VOICE_PREFERENCE", originalPreference);
    restoreEnv("ONBOARDING_VOICE_REALTIME_VOICE", originalLegacy);
    vi.clearAllMocks();
  });

  it("uses male onyx and preserves MP3 response behavior", async () => {
    const response = await callRoute();
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(speechCreate).toHaveBeenCalledWith(expect.objectContaining({
      voice: "onyx",
      response_format: "mp3",
      speed: 1.15,
      instructions: expect.stringContaining("erkek genel müdürsün"),
    }));
  });

  it("uses female coral and its onboarding delivery profile", async () => {
    process.env.METRIX_VOICE_PREFERENCE = "executive_female";
    await callRoute();
    expect(speechCreate).toHaveBeenCalledWith(expect.objectContaining({
      voice: "coral",
      instructions: expect.stringContaining("kadın genel müdürsün"),
    }));
  });

  it("invalid canonical preference safely uses male", async () => {
    process.env.METRIX_VOICE_PREFERENCE = "INVALID";
    await callRoute();
    expect(speechCreate).toHaveBeenCalledWith(expect.objectContaining({ voice: "onyx" }));
  });

  it("does not derive fallback TTS from a legacy realtime override", async () => {
    process.env.ONBOARDING_VOICE_REALTIME_VOICE = "ash";
    await callRoute();
    expect(speechCreate).toHaveBeenCalledWith(expect.objectContaining({ voice: "onyx" }));
  });
});

function callRoute(): Promise<Response> {
  return POST(new Request("http://localhost/api/onboarding/voice/tts", {
    method: "POST",
    body: JSON.stringify({ text: "Test metni" }),
  }));
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
