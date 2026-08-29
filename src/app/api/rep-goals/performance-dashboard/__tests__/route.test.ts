import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireAuthContextFromCookiesMock, resolvePerformanceDashboardMock } = vi.hoisted(() => ({
  requireAuthContextFromCookiesMock: vi.fn(),
  resolvePerformanceDashboardMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: requireAuthContextFromCookiesMock,
  authFail: (error: unknown) => new Response(JSON.stringify({ ok: false, error: { message: (error as Error).message } }), { status: 401 }),
}));
vi.mock("@/lib/rep-goals/performance-dashboard.service", () => ({
  resolvePerformanceDashboard: resolvePerformanceDashboardMock,
}));

import { GET } from "../route";

const FAKE_AUTH_CONTEXT = {
  user: { id: "user_1" },
  organization: { id: "org_1" },
  membership: { role: "MANAGER" },
};

describe("GET /api/rep-goals/performance-dashboard", () => {
  beforeEach(() => {
    requireAuthContextFromCookiesMock.mockReset().mockResolvedValue(FAKE_AUTH_CONTEXT);
    resolvePerformanceDashboardMock.mockReset();
  });

  it("returns the resolved dashboard wrapped as { dashboard } on success", async () => {
    const dashboard = { scope: "MANAGER", companyGoalStatus: null, teamGoalStatus: null, reps: [] };
    resolvePerformanceDashboardMock.mockResolvedValue(dashboard);

    const response = await GET();
    const json = (await response.json()) as { ok: true; data: { dashboard: unknown } };

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { dashboard } });
    expect(resolvePerformanceDashboardMock).toHaveBeenCalledWith(FAKE_AUTH_CONTEXT);
  });

  it("maps an auth failure to 401 without leaking internal detail", async () => {
    requireAuthContextFromCookiesMock.mockRejectedValue(new Error("no session"));
    const response = await GET();
    expect(response.status).toBe(401);
  });
});
