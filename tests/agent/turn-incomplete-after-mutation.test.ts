import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { setDefaultModelProvider } from "@openai/agents";
import {
  ScriptedModel,
  assistantMessage,
  functionCall,
  modelError
} from "@openai/agents/testing";

import { db } from "../../src/lib/db";

// Counts every getSessionId() call so a test can fail exactly the LAST one —
// the call runMetrixExecutiveTurn itself makes after run() has returned.
const hooks = vi.hoisted(() => ({ calls: 0, failOnCall: -1 }));

// Only the OpenAI Conversations network session is replaced by an in-memory
// one; the SDK loop, the business tools, the canonical runtime, the action
// verification and the notification emitter are all real.
vi.mock("@openai/agents", async importOriginal => {
  const actual: any = await importOriginal();

  class InMemoryConversationsSession extends actual.MemorySession {
    constructor(_options?: unknown) {
      super({});
    }

    async getSessionId() {
      hooks.calls += 1;
      if (hooks.calls === hooks.failOnCall) throw new Error("conversation id unavailable");
      return super.getSessionId();
    }
  }

  return { ...actual, OpenAIConversationsSession: InMemoryConversationsSession };
});

const { runMetrixExecutiveTurn } = await import(
  "../../src/lib/agent/metrix-executive-agent"
);
const { MetrixExecutiveTurnIncompleteError } = await import(
  "../../src/lib/agent/turn-incomplete-error"
);
const { endToolCallCapture } = await import(
  "../../src/lib/agent/tools/metrix-business-tool-runtime"
);

let currentModel: InstanceType<typeof ScriptedModel>;
let sessionIdCallsPerTurn = 0;

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `incomplete-org-${suffix}`;
const userId = `incomplete-user-${suffix}`;

const createTask = (callId: string) =>
  functionCall(
    "task_create",
    { title: "Deniz'i ara", priority: "MEDIUM", dueAt: "2026-09-19T11:15:00+03:00" },
    { callId }
  );

function turn(turnId: string) {
  return runMetrixExecutiveTurn({
    actorUserId: userId,
    organizationId,
    timezone: "Europe/Istanbul",
    referenceTimeIso: "2026-09-19T07:48:30.000Z",
    turnId,
    message: "Bugün saat 11:15'te Deniz'i ara diye görev oluştur."
  });
}

const script = (steps: unknown[]) => {
  currentModel = new ScriptedModel(steps as any);
};

async function state() {
  return {
    tasks: await db.task.count({ where: { organizationId, title: "Deniz'i ara" } }),
    notifications: await db.notification.count({
      where: { organizationId, sourceType: "Task" }
    }),
    taskCreates: await db.actionExecution.count({
      where: { organizationId, actionType: "task.create" }
    })
  };
}

async function rejection(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the turn to reject");
}

beforeAll(async () => {
  setDefaultModelProvider({ getModel: async () => currentModel } as any);

  await db.organization.create({ data: { id: organizationId, name: "Incomplete Turn Tenant" } });
  await db.user.create({
    data: { id: userId, email: `${userId}@example.test`, name: "Incomplete Turn User" }
  });
  await db.organizationMember.create({ data: { organizationId, userId, role: "OWNER" } });
});

afterAll(async () => {
  hooks.failOnCall = -1;
  await db.notification.deleteMany({ where: { organizationId } });
  await db.actionExecution.deleteMany({ where: { organizationId } });
  await db.task.deleteMany({ where: { organizationId } });
  await db.organizationMember.deleteMany({ where: { organizationId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.organization.deleteMany({ where: { id: organizationId } });
});

describe("a turn that fails after a verified mutation", () => {
  it("a normal turn still makes exactly one Task, one task.create and one Notification", async () => {
    script([[createTask("call_ok")], [assistantMessage("Görev oluşturuldu.")]]);

    const callsBefore = hooks.calls;
    const result = await turn("turn-normal");
    sessionIdCallsPerTurn = hooks.calls - callsBefore;

    expect(result.finalOutput).toBe("Görev oluşturuldu.");
    expect(result.capabilityResults).toHaveLength(1);
    expect(result.capabilityResults[0]).toMatchObject({
      capability: "task_create",
      operation: "mutation",
      verification: { status: "VERIFIED", verified: true }
    });
    expect(await state()).toEqual({ tasks: 1, notifications: 1, taskCreates: 1 });
  });

  it("second model call fails → typed incomplete error; the Task and Notification stay; cause and verified result are preserved; capture is closed", async () => {
    script([
      [createTask("call_fail")],
      modelError(new Error("upstream model failure after the tool"))
    ]);
    const before = await state();

    const error = await rejection(turn("turn-model-fails"));

    expect(error).toBeInstanceOf(MetrixExecutiveTurnIncompleteError);
    expect(error.code).toBe("TURN_INCOMPLETE");
    expect(error.committed).toBe(true);
    expect((error.cause as Error).message).toBe("upstream model failure after the tool");
    expect(error.capabilityResults).toHaveLength(1);
    expect(error.capabilityResults[0]).toMatchObject({
      capability: "task_create",
      operation: "mutation",
      verification: { status: "VERIFIED", verified: true }
    });

    // Nothing rolled back: the mutation and its notification are committed once.
    const after = await state();
    expect(after.tasks - before.tasks).toBe(1);
    expect(after.notifications - before.notifications).toBe(1);
    expect(after.taskCreates - before.taskCreates).toBe(1);

    // No capture leak: the buffer for that turn was closed by the failure path.
    expect(endToolCallCapture("turn:turn-model-fails")).toEqual([]);
  });

  it("a failure AFTER run() returned (the final conversation-id lookup) is also reported as committed", async () => {
    // run() itself finishes normally; only the last getSessionId() call — the
    // one runMetrixExecutiveTurn makes after run() — fails.
    expect(sessionIdCallsPerTurn).toBeGreaterThan(0);
    script([[createTask("call_sid")], [assistantMessage("tamam")]]);
    hooks.failOnCall = hooks.calls + sessionIdCallsPerTurn;

    try {
      const error = await rejection(turn("turn-session-fails"));

      expect(error).toBeInstanceOf(MetrixExecutiveTurnIncompleteError);
      expect((error.cause as Error).message).toBe("conversation id unavailable");
      expect(error.capabilityResults[0].capability).toBe("task_create");
      expect(endToolCallCapture("turn:turn-session-fails")).toEqual([]);
    } finally {
      hooks.failOnCall = -1;
    }
  });

  it("a failure BEFORE any mutation keeps its ordinary exception — never committed", async () => {
    script([modelError(new Error("model unavailable before any tool"))]);
    const before = await state();

    const error = await rejection(turn("turn-pre-mutation"));

    expect(error).not.toBeInstanceOf(MetrixExecutiveTurnIncompleteError);
    expect(error.message).toBe("model unavailable before any tool");
    expect(error.committed).toBeUndefined();
    expect(await state()).toEqual(before);
    expect(endToolCallCapture("turn:turn-pre-mutation")).toEqual([]);
  });

  it("a verified READ followed by a failure is not a committed mutation", async () => {
    script([
      [functionCall("task_list", {}, { callId: "call_read" })],
      modelError(new Error("model failure after a read"))
    ]);

    const error = await rejection(turn("turn-read-then-fail"));

    expect(error).not.toBeInstanceOf(MetrixExecutiveTurnIncompleteError);
    expect(error.message).toBe("model failure after a read");
    expect(endToolCallCapture("turn:turn-read-then-fail")).toEqual([]);
  });

  it("the same failed submission (same turnId) replays the mutation instead of duplicating it", async () => {
    script([[createTask("call_a")], modelError(new Error("boom"))]);
    const first = await rejection(turn("turn-same-submission"));
    expect(first).toBeInstanceOf(MetrixExecutiveTurnIncompleteError);
    const afterFailure = await state();

    script([[createTask("call_b")], [assistantMessage("Görev zaten oluşturulmuştu.")]]);
    const retried = await turn("turn-same-submission");

    expect(retried.capabilityResults[0].verification).toMatchObject({
      status: "VERIFIED",
      replayed: true
    });
    expect(await state()).toEqual(afterFailure); // no second Task / task.create / Notification
  });

  it("a genuinely new submission is a new business action (new turnId → new Task), as before", async () => {
    const before = await state();
    script([[createTask("call_new")], [assistantMessage("Yeni görev oluşturuldu.")]]);

    await turn("turn-brand-new-submission");

    expect((await state()).tasks - before.tasks).toBe(1);
  });
});
