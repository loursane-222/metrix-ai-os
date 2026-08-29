import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runRepMorningBriefingMock } = vi.hoisted(() => ({
  runRepMorningBriefingMock: vi.fn(),
}));

vi.mock("@/lib/rep-goals/rep-morning-briefing-runner.service", () => ({
  runRepMorningBriefing: runRepMorningBriefingMock,
}));

import { POST } from "../route";

const originalSecret = process.env.REP_MORNING_BRIEFING_CRON_SECRET;

describe("POST /api/rep-goals/morning-briefing/run", () => {
  beforeEach(() => {
    process.env.REP_MORNING_BRIEFING_CRON_SECRET = "cron-secret";
    runRepMorningBriefingMock.mockReset().mockResolvedValue({ processed: 2, totalBriefingsSent: 1, results: [] });
  });

  afterEach(() => restoreEnv("REP_MORNING_BRIEFING_CRON_SECRET", originalSecret));

  it("does not run without a valid secret", async () => {
    const response = await callRoute("wrong-secret");
    expect(response.status).toBe(401);
    expect(runRepMorningBriefingMock).not.toHaveBeenCalled();
  });

  it("runs the briefing and returns its summary on a valid secret", async () => {
    const response = await callRoute();
    expect(response.status).toBe(200);
    expect(runRepMorningBriefingMock).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ data: { processed: 2, totalBriefingsSent: 1 } });
  });

  it("returns a failing response without leaking internal error detail", async () => {
    runRepMorningBriefingMock.mockRejectedValue(new Error("database connection string leaked"));
    const response = await callRoute();
    const json = await response.json();
    expect(response.status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("database connection string leaked");
  });
});

function callRoute(secret = "cron-secret"): Promise<Response> {
  return POST(new Request("http://localhost/api/rep-goals/morning-briefing/run", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  }));
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
