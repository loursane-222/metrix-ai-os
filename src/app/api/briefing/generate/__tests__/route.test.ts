import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listOrganizationsMock, runBriefingMock } = vi.hoisted(() => ({
  listOrganizationsMock: vi.fn(),
  runBriefingMock: vi.fn(),
}));

vi.mock("@/lib/core/organizations/organization.repository", () => ({
  listOrganizationsForDailyBriefing: listOrganizationsMock,
}));

vi.mock("@/lib/daily-briefing/daily-briefing-orchestrator.service", () => ({
  runBriefingOrchestration: runBriefingMock,
}));

import { POST } from "../route";

const originalSecret = process.env.BRIEFING_CRON_SECRET;

const organizations = [
  {
    id: "org-1",
    name: "Birinci Şirket",
    industry: "Üretim",
    companySize: "51-200",
    country: "TR",
    city: "İstanbul",
    description: "Endüstriyel ekipman üretir.",
    activeMemberCount: 1,
  },
  {
    id: "org-2",
    name: "İkinci Şirket",
    industry: null,
    companySize: null,
    country: null,
    city: null,
    description: null,
    activeMemberCount: 2,
  },
];

describe("POST /api/briefing/generate", () => {
  beforeEach(() => {
    process.env.BRIEFING_CRON_SECRET = "cron-secret";
    listOrganizationsMock.mockReset().mockResolvedValue(organizations);
    runBriefingMock.mockReset().mockResolvedValue({ wasAlreadyStored: false });
  });

  afterEach(() => restoreEnv("BRIEFING_CRON_SECRET", originalSecret));

  it("does not run without a valid secret", async () => {
    const response = await callRoute({}, "wrong-secret");
    expect(response.status).toBe(401);
    expect(listOrganizationsMock).not.toHaveBeenCalled();
  });

  it("runs once for one eligible organization", async () => {
    listOrganizationsMock.mockResolvedValue([organizations[0]]);
    const response = await callRoute({ isWeeklyDay: true });
    expect(response.status).toBe(200);
    expect(runBriefingMock).toHaveBeenCalledTimes(1);
    expect(runBriefingMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      isWeeklyDay: true,
    }));
  });

  it("runs separately for every eligible organization", async () => {
    await callRoute({});
    expect(runBriefingMock).toHaveBeenCalledTimes(2);
    expect(runBriefingMock.mock.calls.map(([input]) => input.organizationId)).toEqual(["org-1", "org-2"]);
  });

  it("continues after one organization fails and returns visible per-organization results", async () => {
    runBriefingMock.mockRejectedValueOnce(new Error("sensitive prompt")).mockResolvedValueOnce({ wasAlreadyStored: false });
    const response = await callRoute({});
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(runBriefingMock).toHaveBeenCalledTimes(2);
    expect(json.data).toMatchObject({ success: true, processed: 2, succeeded: 1, failed: 1 });
    expect(json.data.results).toEqual([
      expect.objectContaining({ organizationId: "org-1", status: "FAILED", errorCode: "BRIEFING_GENERATION_FAILED" }),
      expect.objectContaining({ organizationId: "org-2", status: "SUCCESS", errorCode: null }),
    ]);
    expect(JSON.stringify(json)).not.toContain("sensitive prompt");
  });

  it("returns a controlled empty result when no organization exists", async () => {
    listOrganizationsMock.mockResolvedValue([]);
    const response = await callRoute({});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { success: true, processed: 0, succeeded: 0, failed: 0, skipped: 0, results: [] },
    });
  });

  it("reports organizations without active members as skipped", async () => {
    listOrganizationsMock.mockResolvedValue([{ ...organizations[0], activeMemberCount: 0 }]);
    const response = await callRoute({});
    expect(response.status).toBe(200);
    expect(runBriefingMock).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      data: { processed: 0, skipped: 1, results: [{ status: "SKIPPED", errorCode: "NO_ACTIVE_MEMBERS" }] },
    });
  });

  it("rejects organizationId instead of routing to it", async () => {
    const response = await callRoute({ organizationId: "attacker-org" });
    expect(response.status).toBe(400);
    expect(listOrganizationsMock).not.toHaveBeenCalled();
    expect(runBriefingMock).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean isWeeklyDay", async () => {
    const response = await callRoute({ isWeeklyDay: "true" });
    expect(response.status).toBe(400);
    expect(listOrganizationsMock).not.toHaveBeenCalled();
  });

  it("builds context only from present safe organization fields", async () => {
    await callRoute({});
    expect(runBriefingMock.mock.calls[0][0].companyContext).toBe(
      "Şirket: Birinci Şirket\nSektör: Üretim\nŞirket büyüklüğü: 51-200\nÜlke: TR\nŞehir: İstanbul\nAçıklama: Endüstriyel ekipman üretir.",
    );
    expect(runBriefingMock.mock.calls[1][0].companyContext).toBe("Şirket: İkinci Şirket");
  });

  it("returns a failing HTTP response when all eligible organizations fail", async () => {
    runBriefingMock.mockRejectedValue(new Error("database details"));
    const response = await callRoute({});
    const json = await response.json();
    expect(response.status).toBe(500);
    expect(json.data).toMatchObject({ success: false, processed: 2, succeeded: 0, failed: 2 });
    expect(json.data.results).toHaveLength(2);
    expect(JSON.stringify(json)).not.toContain("database details");
  });
});

function callRoute(body: Record<string, unknown>, secret = "cron-secret"): Promise<Response> {
  return POST(new Request("http://localhost/api/briefing/generate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }));
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
