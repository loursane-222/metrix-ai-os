import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireCurrentUserFromCookies: vi.fn().mockResolvedValue({ id: "user-test" }),
  authFail: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
}));

import { POST } from "../route";

type SessionBody = {
  session: { audio: { input: { turn_detection: Record<string, unknown> }; output: { voice: string } } };
};

describe("onboarding realtime voice session", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalPreference = process.env.METRIX_VOICE_PREFERENCE;
  const originalLegacy = process.env.ONBOARDING_VOICE_REALTIME_VOICE;
  let body: SessionBody | null;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.METRIX_VOICE_PREFERENCE;
    delete process.env.ONBOARDING_VOICE_REALTIME_VOICE;
    body = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as SessionBody;
      return new Response(JSON.stringify({ value: "secret", expires_at: 123 }), { status: 200 });
    }));
  });

  afterEach(() => {
    restoreEnv("OPENAI_API_KEY", originalApiKey);
    restoreEnv("METRIX_VOICE_PREFERENCE", originalPreference);
    restoreEnv("ONBOARDING_VOICE_REALTIME_VOICE", originalLegacy);
    vi.unstubAllGlobals();
  });

  it("uses canonical male and preserves client-owned response creation", async () => {
    expect((await POST()).status).toBe(200);
    expect(body?.session.audio.output.voice).toBe("cedar");
    expect(body?.session.audio.input.turn_detection).toMatchObject({
      type: "semantic_vad",
      create_response: false,
      interrupt_response: true,
    });
  });

  it("uses the canonical female voice", async () => {
    process.env.METRIX_VOICE_PREFERENCE = "executive_female";
    await POST();
    expect(body?.session.audio.output.voice).toBe("marin");
  });

  it("keeps a valid legacy onboarding override when canonical is unset", async () => {
    process.env.ONBOARDING_VOICE_REALTIME_VOICE = "ash";
    await POST();
    expect(body?.session.audio.output.voice).toBe("ash");
  });

  it("rejects an invalid legacy provider voice", async () => {
    process.env.ONBOARDING_VOICE_REALTIME_VOICE = "not-a-voice";
    await POST();
    expect(body?.session.audio.output.voice).toBe("cedar");
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
