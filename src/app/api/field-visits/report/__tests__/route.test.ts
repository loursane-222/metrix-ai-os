import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireAuthContextFromCookiesMock, processFieldVisitReportMock } = vi.hoisted(() => ({
  requireAuthContextFromCookiesMock: vi.fn(),
  processFieldVisitReportMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: requireAuthContextFromCookiesMock,
}));

vi.mock("@/lib/field-visits/field-visit-report-orchestrator.service", () => ({
  processFieldVisitReport: processFieldVisitReportMock,
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
  membership: { role: "EMPLOYEE" },
  session: { id: "session_1", createdAt: new Date("2026-08-29T00:00:00.000Z"), expiresAt: new Date("2026-08-29T01:00:00.000Z") },
};

function buildRequest(body: Record<string, unknown> | string, correlationId?: string): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (correlationId) headers.set("X-Correlation-Id", correlationId);
  return new Request("http://localhost/api/field-visits/report", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/field-visits/report", () => {
  beforeEach(() => {
    requireAuthContextFromCookiesMock.mockReset().mockResolvedValue(FAKE_AUTH_CONTEXT);
    processFieldVisitReportMock.mockReset();
  });

  it("rejects an empty message with 400", async () => {
    const response = await POST(buildRequest({ message: "   " }));
    expect(response.status).toBe(400);
    expect(processFieldVisitReportMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const response = await POST(buildRequest("not json"));
    expect(response.status).toBe(400);
  });

  it("passes the trusted server auth context and message through to the orchestrator", async () => {
    processFieldVisitReportMock.mockResolvedValue({ status: "LOGGED", fieldVisitId: "visit-1" });
    await POST(buildRequest({ message: "Arde Yapı ile toplantı yapıldı." }));
    expect(processFieldVisitReportMock).toHaveBeenCalledWith(
      expect.objectContaining({ authContext: FAKE_AUTH_CONTEXT, message: "Arde Yapı ile toplantı yapıldı." }),
    );
  });

  it("uses the X-Correlation-Id header when present", async () => {
    processFieldVisitReportMock.mockResolvedValue({ status: "LOGGED", fieldVisitId: "visit-1" });
    await POST(buildRequest({ message: "x" }, "corr_from_header"));
    expect(processFieldVisitReportMock).toHaveBeenCalledWith(expect.objectContaining({ correlationId: "corr_from_header" }));
  });

  it("returns the orchestrator result wrapped as { report } on success", async () => {
    const report = { status: "LOGGED", fieldVisitId: "visit-1", orderCreated: false, paymentCreated: false };
    processFieldVisitReportMock.mockResolvedValue(report);
    const response = await POST(buildRequest({ message: "x" }));
    const json = (await response.json()) as { ok: true; data: { report: unknown } };
    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { report } });
  });

  it("maps a thrown AuthError to its own status", async () => {
    requireAuthContextFromCookiesMock.mockRejectedValue(new AuthError("no session", 401));
    const response = await POST(buildRequest({ message: "x" }));
    expect(response.status).toBe(401);
  });

  it("maps an unrecognized thrown error to a safe generic 500", async () => {
    processFieldVisitReportMock.mockRejectedValue(new Error("internal db explosion, host=10.0.0.5"));
    const response = await POST(buildRequest({ message: "x" }));
    const json = (await response.json()) as { ok: false; error: { message: string } };
    expect(response.status).toBe(500);
    expect(json.error.message).toBe("Bu işlemi gerçekleştiremedim. Tekrar dener misiniz?");
  });
});
