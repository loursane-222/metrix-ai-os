import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireAuthContextFromCookiesMock, processRepGoalReportMock } = vi.hoisted(() => ({
  requireAuthContextFromCookiesMock: vi.fn(),
  processRepGoalReportMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: requireAuthContextFromCookiesMock,
}));
vi.mock("@/lib/rep-goals/rep-goal-create-orchestrator.service", () => ({
  processRepGoalReport: processRepGoalReportMock,
}));
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
  return new Request("http://localhost/api/rep-goals/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/rep-goals/report", () => {
  beforeEach(() => {
    requireAuthContextFromCookiesMock.mockReset().mockResolvedValue(FAKE_AUTH_CONTEXT);
    processRepGoalReportMock.mockReset();
  });

  it("rejects an empty message with 400", async () => {
    const response = await POST(buildRequest({ message: "   " }));
    expect(response.status).toBe(400);
    expect(processRepGoalReportMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const response = await POST(buildRequest("not json"));
    expect(response.status).toBe(400);
  });

  it("passes the trusted server auth context and message through to the orchestrator", async () => {
    processRepGoalReportMock.mockResolvedValue({ status: "SET", repFullName: "Ahmet" });
    await POST(buildRequest({ message: "Ahmet için 20 ziyaret hedefi koy" }));
    expect(processRepGoalReportMock).toHaveBeenCalledWith(
      expect.objectContaining({ authContext: FAKE_AUTH_CONTEXT, message: "Ahmet için 20 ziyaret hedefi koy" }),
    );
  });

  it("returns the orchestrator result wrapped as { report } on success", async () => {
    const report = { status: "SET", repFullName: "Ahmet", visitTargetSet: true, salesTargetSet: false, collectionTargetSet: false };
    processRepGoalReportMock.mockResolvedValue(report);
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
    processRepGoalReportMock.mockRejectedValue(new Error("internal db explosion, host=10.0.0.5"));
    const response = await POST(buildRequest({ message: "x" }));
    const json = (await response.json()) as { ok: false; error: { message: string } };
    expect(response.status).toBe(500);
    expect(json.error.message).toBe("Bu işlemi gerçekleştiremedim. Tekrar dener misiniz?");
  });
});
