import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireAuthContextFromCookiesMock, resolveFieldVisitWeeklySummaryRequestMock } = vi.hoisted(() => ({
  requireAuthContextFromCookiesMock: vi.fn(),
  resolveFieldVisitWeeklySummaryRequestMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: requireAuthContextFromCookiesMock,
}));
vi.mock("@/lib/field-visits/field-visit-weekly-summary-request.service", () => ({
  resolveFieldVisitWeeklySummaryRequest: resolveFieldVisitWeeklySummaryRequestMock,
}));
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})) },
}));

import { POST } from "../route";

const FAKE_AUTH_CONTEXT = {
  user: { id: "user_1" },
  organization: { id: "org_1" },
  membership: { role: "EMPLOYEE" },
  session: { id: "session_1", createdAt: new Date("2026-08-29T00:00:00.000Z"), expiresAt: new Date("2026-08-29T01:00:00.000Z") },
};

function buildRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/field-visits/weekly-summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/field-visits/weekly-summary", () => {
  beforeEach(() => {
    requireAuthContextFromCookiesMock.mockReset().mockResolvedValue(FAKE_AUTH_CONTEXT);
    resolveFieldVisitWeeklySummaryRequestMock.mockReset();
  });

  it("normalizes a blank targetReference to null before passing it through", async () => {
    resolveFieldVisitWeeklySummaryRequestMock.mockResolvedValue({ status: "DENIED" });
    await POST(buildRequest({ targetReference: "   " }));
    expect(resolveFieldVisitWeeklySummaryRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ authContext: FAKE_AUTH_CONTEXT, targetReference: null }),
    );
  });

  it("passes a real targetReference through trimmed", async () => {
    resolveFieldVisitWeeklySummaryRequestMock.mockResolvedValue({ status: "NOT_FOUND" });
    await POST(buildRequest({ targetReference: "  Ahmet  " }));
    expect(resolveFieldVisitWeeklySummaryRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ targetReference: "Ahmet" }),
    );
  });

  it("returns the lookup result wrapped as { lookup }", async () => {
    const lookup = { status: "ALLOWED", scope: "SELF", repFullName: null, summary: { visitCount: 3 } };
    resolveFieldVisitWeeklySummaryRequestMock.mockResolvedValue(lookup);
    const response = await POST(buildRequest({ targetReference: null }));
    const json = (await response.json()) as { ok: true; data: { lookup: unknown } };
    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { lookup } });
  });

  it("maps an unrecognized thrown error to a safe generic 500", async () => {
    resolveFieldVisitWeeklySummaryRequestMock.mockRejectedValue(new Error("internal db explosion, host=10.0.0.5"));
    const response = await POST(buildRequest({ targetReference: null }));
    const json = (await response.json()) as { ok: false; error: { message: string } };
    expect(response.status).toBe(500);
    expect(json.error.message).toBe("Bu işlemi gerçekleştiremedim. Tekrar dener misiniz?");
  });
});
