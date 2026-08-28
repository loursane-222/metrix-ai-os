import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runExecutiveWatchMock } = vi.hoisted(() => ({
  runExecutiveWatchMock: vi.fn(),
}));

vi.mock("@/lib/executive-autonomous-watch/executive-autonomous-watch.service", () => ({
  runExecutiveWatch: runExecutiveWatchMock,
}));

import { POST } from "../route";

const originalSecret = process.env.EXECUTIVE_WATCH_CRON_SECRET;

describe("POST /api/executive-watch/run", () => {
  beforeEach(() => {
    process.env.EXECUTIVE_WATCH_CRON_SECRET = "cron-secret";
    runExecutiveWatchMock.mockReset().mockResolvedValue({ processed: 2, totalAlertsFound: 1, totalNotificationsSent: 1, results: [] });
  });

  afterEach(() => restoreEnv("EXECUTIVE_WATCH_CRON_SECRET", originalSecret));

  it("does not run without a valid secret", async () => {
    const response = await callRoute("wrong-secret");
    expect(response.status).toBe(401);
    expect(runExecutiveWatchMock).not.toHaveBeenCalled();
  });

  it("runs the watch and returns its summary on a valid secret", async () => {
    const response = await callRoute();
    expect(response.status).toBe(200);
    expect(runExecutiveWatchMock).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ data: { processed: 2, totalAlertsFound: 1, totalNotificationsSent: 1 } });
  });

  it("returns a failing response without leaking internal error detail", async () => {
    runExecutiveWatchMock.mockRejectedValue(new Error("database connection string leaked"));
    const response = await callRoute();
    const json = await response.json();
    expect(response.status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("database connection string leaked");
  });
});

function callRoute(secret = "cron-secret"): Promise<Response> {
  return POST(new Request("http://localhost/api/executive-watch/run", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  }));
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
