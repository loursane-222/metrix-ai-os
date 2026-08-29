import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireAuthContextFromCookiesMock, processReportReviewMessageMock } = vi.hoisted(() => ({
  requireAuthContextFromCookiesMock: vi.fn(),
  processReportReviewMessageMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: requireAuthContextFromCookiesMock,
}));

vi.mock("@/lib/reports/report-review-orchestrator.service", () => ({
  processReportReviewMessage: processReportReviewMessageMock,
}));

// mapExecutionErrorToHttpResponse (imported by route.ts) pulls in
// domains/customers -> customer.service -> the real Prisma client, which
// throws at import time without DATABASE_URL. No test here touches Prisma.
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})) },
}));

import { AuthError } from "@/lib/auth/shared/auth.errors";
import { POST } from "../route";

const FAKE_AUTH_CONTEXT = {
  user: { id: "user_1" },
  organization: { id: "org_1" },
  membership: { role: "MANAGER" },
  session: { id: "session_1", createdAt: new Date("2026-08-29T00:00:00.000Z"), expiresAt: new Date("2026-08-29T01:00:00.000Z") },
};

function buildRequest(body: Record<string, unknown> | string): Request {
  return new Request("http://localhost/api/reports/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/reports/review", () => {
  beforeEach(() => {
    requireAuthContextFromCookiesMock.mockReset().mockResolvedValue(FAKE_AUTH_CONTEXT);
    processReportReviewMessageMock.mockReset();
  });

  it("rejects an empty message with 400", async () => {
    const response = await POST(buildRequest({ message: "   " }));
    expect(response.status).toBe(400);
    expect(processReportReviewMessageMock).not.toHaveBeenCalled();
  });

  it("passes the trusted server auth context and message through to the orchestrator", async () => {
    processReportReviewMessageMock.mockResolvedValue({ status: "REVIEWED" });
    await POST(buildRequest({ message: "Ahmet'in raporunu onayla" }));
    expect(processReportReviewMessageMock).toHaveBeenCalledWith({ authContext: FAKE_AUTH_CONTEXT, message: "Ahmet'in raporunu onayla" });
  });

  it("returns the orchestrator result wrapped as { review } on success", async () => {
    const review = { status: "REVIEWED", repFullName: "Ahmet Yılmaz", decision: "APPROVED", templateName: "Haftalık Yönetim Raporu" };
    processReportReviewMessageMock.mockResolvedValue(review);
    const response = await POST(buildRequest({ message: "x" }));
    const json = (await response.json()) as { ok: true; data: { review: unknown } };
    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { review } });
  });

  it("maps a thrown AuthError to its own status", async () => {
    requireAuthContextFromCookiesMock.mockRejectedValue(new AuthError("no session", 401));
    const response = await POST(buildRequest({ message: "x" }));
    expect(response.status).toBe(401);
  });
});
