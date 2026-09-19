import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runAwarenessSweep: vi.fn(async () => ({
    considered: 3,
    evaluated: 2,
    notified: 1,
    suppressed: 1,
    alreadyEvaluated: 1,
    skippedMuted: 0,
    failed: 0,
    deferred: 0
  }))
}));

vi.mock("../../src/lib/awareness/awareness-sweep", () => ({
  runAwarenessSweep: mocks.runAwarenessSweep
}));

import { GET, POST } from "../../src/app/api/internal/awareness/sweep/route";

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  mocks.runAwarenessSweep.mockClear();
});

const call = (handler: typeof GET, authorization?: string) =>
  handler(new Request("https://metrix.test/api/internal/awareness/sweep", {
    method: "GET",
    headers: authorization ? { authorization } : {}
  }));

describe("protected awareness sweep endpoint", () => {
  it("fails closed with no CRON_SECRET configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await call(GET, "Bearer anything");

    expect(response.status).toBe(503);
    expect(mocks.runAwarenessSweep).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong secret without running anything", async () => {
    process.env.CRON_SECRET = "s3cret";

    expect((await call(GET)).status).toBe(401);
    expect((await call(POST, "Bearer wrong")).status).toBe(401);
    expect(mocks.runAwarenessSweep).not.toHaveBeenCalled();
  });

  it("with the secret (GET or POST) runs one sweep and returns counts only", async () => {
    process.env.CRON_SECRET = "s3cret";

    for (const handler of [GET, POST]) {
      const response = await call(handler, "Bearer s3cret");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(body).toEqual({
        ok: true,
        considered: 3,
        evaluated: 2,
        notified: 1,
        suppressed: 1,
        alreadyEvaluated: 1,
        skippedMuted: 0,
        failed: 0,
        deferred: 0
      });
    }

    expect(mocks.runAwarenessSweep).toHaveBeenCalledTimes(2);
  });
});
