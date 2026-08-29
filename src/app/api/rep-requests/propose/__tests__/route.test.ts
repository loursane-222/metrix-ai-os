import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireAuthContextFromCookiesMock, proposeRepRequestMock } = vi.hoisted(() => ({
  requireAuthContextFromCookiesMock: vi.fn(),
  proposeRepRequestMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: requireAuthContextFromCookiesMock,
}));
vi.mock("@/lib/rep-requests/rep-request-propose-orchestrator.service", () => ({
  proposeRepRequest: proposeRepRequestMock,
}));
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})) },
}));

import { AuthError } from "@/lib/auth/shared/auth.errors";
import { POST } from "../route";

const FAKE_AUTH_CONTEXT = {
  user: { id: "user_1" },
  organization: { id: "org_1" },
  membership: { role: "EMPLOYEE" },
  session: { id: "session_1", createdAt: new Date("2026-08-29T00:00:00.000Z"), expiresAt: new Date("2026-08-29T01:00:00.000Z") },
};

function buildRequest(body: Record<string, unknown> | string): Request {
  return new Request("http://localhost/api/rep-requests/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/rep-requests/propose", () => {
  beforeEach(() => {
    requireAuthContextFromCookiesMock.mockReset().mockResolvedValue(FAKE_AUTH_CONTEXT);
    proposeRepRequestMock.mockReset();
  });

  it("rejects a missing domain with 400", async () => {
    const response = await POST(buildRequest({ message: "sipariş açmak istiyorum, onaya gönder" }));
    expect(response.status).toBe(400);
    expect(proposeRepRequestMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid domain with 400", async () => {
    const response = await POST(buildRequest({ domain: "NOT_A_DOMAIN", message: "x" }));
    expect(response.status).toBe(400);
  });

  it("rejects an empty message with 400", async () => {
    const response = await POST(buildRequest({ domain: "ORDER", message: "   " }));
    expect(response.status).toBe(400);
    expect(proposeRepRequestMock).not.toHaveBeenCalled();
  });

  it("passes the trusted server auth context, domain, and message through to the orchestrator", async () => {
    proposeRepRequestMock.mockResolvedValue({ status: "PROPOSED" });
    await POST(buildRequest({ domain: "ORDER", message: "Atlas İnşaat için sipariş, onaya gönder." }));
    expect(proposeRepRequestMock).toHaveBeenCalledWith({ authContext: FAKE_AUTH_CONTEXT, domain: "ORDER", message: "Atlas İnşaat için sipariş, onaya gönder." });
  });

  it("returns the orchestrator result wrapped as { report } on success", async () => {
    const report = { status: "PROPOSED", domain: "ORDER", customerNameRaw: "Atlas İnşaat" };
    proposeRepRequestMock.mockResolvedValue(report);
    const response = await POST(buildRequest({ domain: "ORDER", message: "x" }));
    const json = (await response.json()) as { ok: true; data: { report: unknown } };
    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { report } });
  });

  it("maps a thrown AuthError to its own status", async () => {
    requireAuthContextFromCookiesMock.mockRejectedValue(new AuthError("no session", 401));
    const response = await POST(buildRequest({ domain: "ORDER", message: "x" }));
    expect(response.status).toBe(401);
  });
});
