import { describe, it, expect, vi, beforeEach } from "vitest";

const { recordEvent } = vi.hoisted(() => ({ recordEvent: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: vi.fn().mockResolvedValue({
    user: { id: "user_1" },
    organization: { id: "org_1" },
  }),
  authFail: (error: unknown) =>
    Response.json({ ok: false, error: { message: String(error) } }, { status: 500 }),
}));

vi.mock("@/lib/core/events/event.service", () => ({ recordEvent }));

import { POST } from "../route";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/ai/chat/voice/session/end", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/chat/voice/session/end", () => {
  beforeEach(() => {
    recordEvent.mockClear();
  });

  it("records a VOICE_SESSION_ENDED event with the reported usage", async () => {
    const response = await POST(buildRequest({
      voiceSessionId: "voice_1",
      durationMs: 45230,
      inputTokens: 1200,
      outputTokens: 340,
      totalTokens: 1540,
      reason: "explicit_user_stop",
    }));

    expect(response.status).toBe(200);
    expect(recordEvent).toHaveBeenCalledWith({
      organizationId: "org_1",
      actorUserId: "user_1",
      eventType: "VOICE_SESSION_ENDED",
      entityType: "VoiceSession",
      payload: {
        voiceSessionId: "voice_1",
        durationMs: 45230,
        reason: "explicit_user_stop",
        inputTokens: 1200,
        outputTokens: 340,
        totalTokens: 1540,
      },
      source: "USER",
    });
  });

  it("defaults reason to 'unknown' when omitted", async () => {
    await POST(buildRequest({
      voiceSessionId: "voice_2",
      durationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    }));

    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ reason: "unknown" }) }),
    );
  });

  it("rejects a negative durationMs", async () => {
    const response = await POST(buildRequest({
      voiceSessionId: "voice_3",
      durationMs: -5,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    }));

    expect(response.status).toBe(400);
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("rejects a missing voiceSessionId", async () => {
    const response = await POST(buildRequest({
      durationMs: 100,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    }));

    expect(response.status).toBe(400);
    expect(recordEvent).not.toHaveBeenCalled();
  });
});
