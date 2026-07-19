import { afterEach, describe, expect, it, vi } from "vitest";

const { authMock, generateMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  generateMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: authMock,
  authFail: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
}));
vi.mock("@/lib/ai/orchestration.service", () => ({ generateAiResponse: generateMock }));

import { POST } from "../route";

afterEach(() => vi.unstubAllEnvs());

describe("AI mock response security", () => {
  it("is unavailable in production before parsing client authority", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(new Request("http://localhost/api/ai/mock-response", {
      method: "POST",
      body: JSON.stringify({ organizationId: "org_HACKED" }),
    }));

    expect(response.status).toBe(404);
    expect(authMock).not.toHaveBeenCalled();
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("uses the authenticated organization in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    authMock.mockResolvedValue({ organization: { id: "org_TRUSTED" } });
    generateMock.mockResolvedValue({ content: "ok" });
    const response = await POST(new Request("http://localhost/api/ai/mock-response", {
      method: "POST",
      body: JSON.stringify({ organizationId: "org_HACKED", conversationId: "conversation-1", userMessage: "hello" }),
    }));

    expect(response.status).toBe(200);
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org_TRUSTED" }));
  });
});
