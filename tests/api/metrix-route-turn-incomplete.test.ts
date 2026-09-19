import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runMetrixExecutiveTurn: vi.fn(),
  resolveAuthenticatedExecutiveContext: vi.fn(),
  projectionShouldFail: false
}));

vi.mock("../../src/lib/agent/metrix-executive-agent", () => ({
  runMetrixExecutiveTurn: mocks.runMetrixExecutiveTurn
}));

vi.mock("../../src/lib/auth/executive-session-context", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/auth/executive-session-context")
  >("../../src/lib/auth/executive-session-context");

  return {
    ...actual,
    resolveAuthenticatedExecutiveContext: mocks.resolveAuthenticatedExecutiveContext
  };
});

vi.mock("../../src/lib/presentation/project-result", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/presentation/project-result")
  >("../../src/lib/presentation/project-result");

  return {
    ...actual,
    projectCapabilityResults: (results: Parameters<typeof actual.projectCapabilityResults>[0]) => {
      if (mocks.projectionShouldFail) throw new Error("projection exploded");
      return actual.projectCapabilityResults(results);
    }
  };
});

const { POST } = await import("../../src/app/api/metrix/route");
const { MetrixExecutiveTurnIncompleteError } = await import(
  "../../src/lib/agent/turn-incomplete-error"
);
const { ExecutiveAuthenticationError } = await import(
  "../../src/lib/auth/executive-session-context"
);
const { canonicalResultForToolCall } = await import(
  "../../src/lib/agent/tools/metrix-business-tool-runtime"
);
const { projectCapabilityResults } = await import(
  "../../src/lib/presentation/project-result"
);

const auth = {
  actorUserId: "user-route-incomplete",
  organizationId: "org-route-incomplete",
  timezone: "Europe/Istanbul",
  referenceTimeIso: "2026-09-19T07:48:30.000Z"
};

const committedTask = canonicalResultForToolCall("task_create", {
  action: "task.create",
  status: "VERIFIED",
  verified: true,
  replayed: false,
  task: {
    id: "task-1",
    organizationId: auth.organizationId,
    title: "Deniz'i ara",
    priority: "MEDIUM",
    status: "OPEN",
    dueAt: "2026-09-19T08:15:00.000Z",
    assignedToUserId: auth.actorUserId
  }
});

function request(body: unknown) {
  return new Request("http://localhost/api/metrix", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

const validBody = { message: "Bugün saat 11:15'te Deniz'i ara diye görev oluştur.", turnId: "turn-route-1" };

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.projectionShouldFail = false;
  mocks.runMetrixExecutiveTurn.mockReset();
  mocks.resolveAuthenticatedExecutiveContext.mockReset();
  mocks.resolveAuthenticatedExecutiveContext.mockResolvedValue(auth);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorLog.mockRestore();
});

describe("/api/metrix — TURN_INCOMPLETE failure contract", () => {
  const incomplete = () =>
    new MetrixExecutiveTurnIncompleteError({
      cause: new Error("upstream model failure"),
      capabilityResults: [committedTask]
    });

  it("returns JSON (not a bare 500) with ok:false, TURN_INCOMPLETE, committed:true and the verified canonical results", async () => {
    mocks.runMetrixExecutiveTurn.mockRejectedValue(incomplete());

    const response = await POST(request(validBody));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.code).toBe("TURN_INCOMPLETE");
    expect(body.committed).toBe(true);
    expect(body.turnResult.capabilityResults).toEqual([committedTask]);
    expect(body.conversationId).toBeUndefined();
  });

  it("keeps the canonical presentation, projected deterministically from the committed results", async () => {
    mocks.runMetrixExecutiveTurn.mockRejectedValue(incomplete());

    const body = await (await POST(request(validBody))).json();
    const expected = projectCapabilityResults([committedTask]);

    expect(expected.length).toBeGreaterThan(0);
    expect(body.turnResult.presentations).toEqual(JSON.parse(JSON.stringify(expected)));
  });

  it("invents no Executive answer: executiveText is empty", async () => {
    mocks.runMetrixExecutiveTurn.mockRejectedValue(incomplete());

    const body = await (await POST(request(validBody))).json();

    expect(body.turnResult.executiveText).toBe("");
  });

  it("logs the real cause server-side (before responding), with the turn id and capability, not the payload", async () => {
    const error = incomplete();
    mocks.runMetrixExecutiveTurn.mockRejectedValue(error);

    await POST(request(validBody));

    expect(errorLog).toHaveBeenCalledTimes(1);
    const [label, context, cause] = errorLog.mock.calls[0];
    expect(String(label)).toContain("turn incomplete after committed mutation");
    expect(context).toEqual({ turnId: "turn-route-1", capabilities: ["task_create"] });
    expect(cause).toBe(error.cause);
    expect((cause as Error).message).toBe("upstream model failure");
  });

  it("a projection failure is logged but still returns the committed fact, never a 500 without JSON", async () => {
    mocks.runMetrixExecutiveTurn.mockRejectedValue(incomplete());
    mocks.projectionShouldFail = true;

    const response = await POST(request(validBody));
    const body = await response.json();

    expect(body.code).toBe("TURN_INCOMPLETE");
    expect(body.committed).toBe(true);
    expect(body.turnResult.presentations).toEqual([]);
    expect(body.turnResult.capabilityResults).toEqual([committedTask]);
    expect(errorLog).toHaveBeenCalledTimes(2);
  });
});

describe("/api/metrix — everything else keeps its existing behavior", () => {
  it("a generic failure (no verified mutation) is NOT reported as committed — it still propagates", async () => {
    mocks.runMetrixExecutiveTurn.mockRejectedValue(new Error("model unavailable"));

    await expect(POST(request(validBody))).rejects.toThrow("model unavailable");
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("authentication failure keeps its status and code", async () => {
    mocks.resolveAuthenticatedExecutiveContext.mockRejectedValue(
      new ExecutiveAuthenticationError("UNAUTHENTICATED", 401)
    );

    const response = await POST(request(validBody));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, code: "UNAUTHENTICATED" });
    expect(mocks.runMetrixExecutiveTurn).not.toHaveBeenCalled();
  });

  it("invalid JSON and invalid requests keep their 400 codes", async () => {
    const invalidJson = await POST(request("{not json"));
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).code).toBe("INVALID_JSON");

    const invalid = await POST(request({ message: "", turnId: "t" }));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).code).toBe("INVALID_REQUEST");
  });
});
