import {
  afterAll,
  describe,
  expect,
  it
} from "vitest";

import {
  Agent,
  Runner
} from "@openai/agents";

import {
  ScriptedModel,
  assistantMessage,
  functionCall
} from "@openai/agents/testing";

import {
  db
} from "../../src/lib/db";

import {
  createTaskListTool
} from "../../src/lib/agent/tools/task-list-tool";

import {
  createTaskUpdateTool
} from "../../src/lib/agent/tools/task-update-tool";

import type {
  MetrixExecutiveContext
} from "../../src/lib/agent/types";

const organizationIds: string[] = [];
const userIds: string[] = [];

function runnerFor(
  model: ScriptedModel
) {
  const agent =
    new Agent<MetrixExecutiveContext>({
      name: "METRIX",

      instructions:
        "Use the native tools for the requested business intent. " +
        "Never guess an ambiguous update target.",

      model,

      tools: [
        createTaskListTool(),
        createTaskUpdateTool()
      ]
    });

  return {
    agent,
    runner: new Runner({
      tracingDisabled: true
    })
  };
}

async function seedTenant(
  suffix: string
) {
  const organizationId =
    `awareness-org-${suffix}`;

  const userId =
    `awareness-user-${suffix}`;

  organizationIds.push(organizationId);
  userIds.push(userId);

  await db.organization.create({
    data: {
      id: organizationId,
      name: "Operational Awareness Tenant"
    }
  });

  await db.user.create({
    data: {
      id: userId,
      email: `${userId}@example.test`,
      name: "Operational Awareness User"
    }
  });

  await db.organizationMember.create({
    data: {
      organizationId,
      userId,
      role: "MEMBER"
    }
  });

  return { organizationId, userId };
}

describe(
  "METRIX task operational awareness acceptance",
  () => {
    it(
      "A: answers 'bugünkü açık görevlerim neler?' with only grounded, in-range tasks",
      async () => {
        const suffix =
          `${Date.now()}-${Math.random().toString(36).slice(2)}-a`;

        const { organizationId, userId } =
          await seedTenant(suffix);

        const turnId = `turn-a-${suffix}`;

        const otherUserId =
          `awareness-other-user-${suffix}`;

        await db.user.create({
          data: {
            id: otherUserId,
            email:
              `${otherUserId}@example.test`,
            name: "Other Colleague"
          }
        });

        const todayTask = await db.task.create({
          data: {
            organizationId,
            title: "Bugün teslim edilecek rapor",
            status: "OPEN",
            priority: "MEDIUM",
            dueAt: new Date(
              "2026-09-14T10:00:00.000Z"
            ),
            assignedToUserId: userId
          }
        });

        await db.task.create({
          data: {
            organizationId,
            title: "Yarının görevi",
            status: "OPEN",
            priority: "MEDIUM",
            dueAt: new Date(
              "2026-09-15T10:00:00.000Z"
            ),
            assignedToUserId: userId
          }
        });

        await db.task.create({
          data: {
            organizationId,
            title: "Bugün ama zaten bitmiş görev",
            status: "DONE",
            priority: "MEDIUM",
            dueAt: new Date(
              "2026-09-14T11:00:00.000Z"
            ),
            assignedToUserId: userId
          }
        });

        await db.task.create({
          data: {
            organizationId,
            title:
              "Bugün ama başka bir kullanıcıya atanmış görev",
            status: "OPEN",
            priority: "MEDIUM",
            dueAt: new Date(
              "2026-09-14T12:00:00.000Z"
            ),
            assignedToUserId: otherUserId
          }
        });

        const model = new ScriptedModel([
          [
            functionCall(
              "task_list",
              {
                status: "OPEN",
                dueAfter:
                  "2026-09-13T21:00:00.000Z",
                dueBefore:
                  "2026-09-14T21:00:00.000Z",
                assignedToMe: true
              },
              { callId: "call_a_1" }
            )
          ],
          [
            assistantMessage(
              "Bugün için tek açık göreviniz var: Bugün teslim edilecek rapor."
            )
          ]
        ]);

        const { agent, runner } =
          runnerFor(model);

        const result = await runner.run(
          agent,
          "Bugünkü açık görevlerim neler?",
          {
            context: {
              actorUserId: userId,
              organizationId,
              turnId
            }
          }
        );

        expect(result.finalOutput).toBe(
          "Bugün için tek açık göreviniz var: Bugün teslim edilecek rapor."
        );

        const toolOutput =
          model.calls[1]?.request.input;

        expect(
          Array.isArray(toolOutput)
        ).toBe(true);

        const functionResult = (
          Array.isArray(toolOutput)
            ? toolOutput
            : []
        ).find(
          (item) =>
            item.type ===
            "function_call_result"
        ) as
          | {
              output?: { text?: string };
            }
          | undefined;

        expect(
          functionResult
        ).toBeDefined();

        const grounded = JSON.parse(
          functionResult?.output?.text ?? "{}"
        ) as {
          source: string;
          count: number;
          tasks: Array<{
            id: string;
            title: string;
          }>;
        };

        expect(grounded.source).toBe(
          "COMPANY_REALITY"
        );

        expect(grounded.tasks).toHaveLength(1);

        expect(grounded.tasks[0]?.id).toBe(
          todayTask.id
        );

        expect(grounded.tasks[0]?.title).toBe(
          "Bugün teslim edilecek rapor"
        );

        expect(
          grounded.tasks.some(
            task =>
              task.title ===
              "Bugün ama başka bir kullanıcıya atanmış görev"
          )
        ).toBe(false);

        await db.user.delete({
          where: { id: otherUserId }
        });

        model.assertComplete();
      }
    );

    it(
      "B: answers 'geciken yüksek öncelikli işlerimiz var mı?' with only grounded overdue-high tasks",
      async () => {
        const suffix =
          `${Date.now()}-${Math.random().toString(36).slice(2)}-b`;

        const { organizationId, userId } =
          await seedTenant(suffix);

        const turnId = `turn-b-${suffix}`;

        const referenceTimeIso =
          "2026-09-14T09:00:00.000Z";

        const overdueHigh =
          await db.task.create({
            data: {
              organizationId,
              title: "Gecikmiş kritik görev",
              status: "OPEN",
              priority: "HIGH",
              dueAt: new Date(
                "2026-09-01T00:00:00.000Z"
              )
            }
          });

        await db.task.create({
          data: {
            organizationId,
            title: "Gecikmiş ama düşük öncelikli görev",
            status: "OPEN",
            priority: "LOW",
            dueAt: new Date(
              "2026-09-01T00:00:00.000Z"
            )
          }
        });

        await db.task.create({
          data: {
            organizationId,
            title: "Yüksek öncelikli ama henüz gecikmemiş görev",
            status: "OPEN",
            priority: "HIGH",
            dueAt: new Date(
              "2026-12-01T00:00:00.000Z"
            )
          }
        });

        const model = new ScriptedModel([
          [
            functionCall(
              "task_list",
              {
                status: "OPEN",
                priority: "HIGH",
                dueBefore: referenceTimeIso
              },
              { callId: "call_b_1" }
            )
          ],
          [
            assistantMessage(
              "Evet, geciken yüksek öncelikli bir göreviniz var: Gecikmiş kritik görev."
            )
          ]
        ]);

        const { agent, runner } =
          runnerFor(model);

        const result = await runner.run(
          agent,
          "Geciken yüksek öncelikli işlerimiz var mı?",
          {
            context: {
              actorUserId: userId,
              organizationId,
              turnId,
              referenceTimeIso
            }
          }
        );

        expect(result.finalOutput).toContain(
          "Gecikmiş kritik görev"
        );

        const toolOutput =
          model.calls[1]?.request.input;

        const functionResult = (
          Array.isArray(toolOutput)
            ? toolOutput
            : []
        ).find(
          (item) =>
            item.type ===
            "function_call_result"
        ) as
          | {
              output?: { text?: string };
            }
          | undefined;

        const grounded = JSON.parse(
          functionResult?.output?.text ?? "{}"
        ) as {
          tasks: Array<{ id: string }>;
        };

        expect(grounded.tasks).toHaveLength(1);

        expect(grounded.tasks[0]?.id).toBe(
          overdueHigh.id
        );

        model.assertComplete();
      }
    );

    it(
      "C: finds the named task then verifiably completes it, only announcing success after VERIFIED",
      async () => {
        const suffix =
          `${Date.now()}-${Math.random().toString(36).slice(2)}-c`;

        const { organizationId, userId } =
          await seedTenant(suffix);

        const turnId = `turn-c-${suffix}`;

        const target = await db.task.create({
          data: {
            organizationId,
            title: "Ahmet teklifini hazırlama",
            status: "OPEN",
            priority: "MEDIUM"
          }
        });

        const model = new ScriptedModel([
          [
            functionCall(
              "task_list",
              {
                titleContains:
                  "Ahmet teklifini hazırlama"
              },
              { callId: "call_c_1" }
            )
          ],
          [
            functionCall(
              "task_update",
              {
                taskId: target.id,
                status: "DONE"
              },
              { callId: "call_c_2" }
            )
          ],
          [
            assistantMessage(
              "Ahmet teklifini hazırlama görevini tamamlandı olarak işaretledim."
            )
          ]
        ]);

        const { agent, runner } =
          runnerFor(model);

        const result = await runner.run(
          agent,
          "Ahmet teklifini hazırlama görevini tamamlandı yap.",
          {
            context: {
              actorUserId: userId,
              organizationId,
              turnId
            }
          }
        );

        expect(result.finalOutput).toBe(
          "Ahmet teklifini hazırlama görevini tamamlandı olarak işaretledim."
        );

        expect(model.calls).toHaveLength(3);

        const updateTurnInput =
          model.calls[2]?.request.input;

        const updateResult = (
          Array.isArray(updateTurnInput)
            ? updateTurnInput
            : []
        ).find(
          (item) =>
            item.type ===
              "function_call_result" &&
            (item as { name?: string })
              .name === "task_update"
        ) as
          | {
              output?: { text?: string };
            }
          | undefined;

        const verified = JSON.parse(
          updateResult?.output?.text ?? "{}"
        ) as {
          action: string;
          status: string;
          verified: boolean;
          task: { id: string; status: string };
        };

        expect(verified).toMatchObject({
          action: "task.update",
          status: "VERIFIED",
          verified: true
        });

        expect(verified.task.id).toBe(
          target.id
        );

        expect(verified.task.status).toBe(
          "DONE"
        );

        const persisted = await db.task.findUnique(
          {
            where: { id: target.id }
          }
        );

        expect(persisted?.status).toBe(
          "DONE"
        );

        const execution =
          await db.actionExecution.findFirst({
            where: {
              organizationId,
              actionType: "task.update",
              resourceId: target.id
            }
          });

        expect(execution?.status).toBe(
          "VERIFIED"
        );

        model.assertComplete();
      }
    );

    it(
      "D: asks for clarification instead of guessing when two tasks match ambiguously",
      async () => {
        const suffix =
          `${Date.now()}-${Math.random().toString(36).slice(2)}-d`;

        const { organizationId, userId } =
          await seedTenant(suffix);

        const turnId = `turn-d-${suffix}`;

        const first = await db.task.create({
          data: {
            organizationId,
            title:
              "Ahmet teklifini hazırlama - Ocak",
            status: "OPEN",
            priority: "MEDIUM"
          }
        });

        const second = await db.task.create({
          data: {
            organizationId,
            title:
              "Ahmet teklifini hazırlama - Şubat",
            status: "OPEN",
            priority: "MEDIUM"
          }
        });

        const model = new ScriptedModel([
          [
            functionCall(
              "task_list",
              {
                titleContains:
                  "Ahmet teklifini hazırlama"
              },
              { callId: "call_d_1" }
            )
          ],
          [
            assistantMessage(
              "İki eşleşme buldum: Ocak ve Şubat görevleri. Hangisini kastettiniz?"
            )
          ]
        ]);

        const { agent, runner } =
          runnerFor(model);

        const result = await runner.run(
          agent,
          "Ahmet teklifini hazırlama görevini tamamlandı yap.",
          {
            context: {
              actorUserId: userId,
              organizationId,
              turnId
            }
          }
        );

        expect(result.finalOutput).toContain(
          "Hangisini kastettiniz"
        );

        expect(
          result.finalOutput
        ).not.toContain("VERIFIED");

        expect(model.calls).toHaveLength(2);

        const unchangedFirst =
          await db.task.findUnique({
            where: { id: first.id }
          });

        const unchangedSecond =
          await db.task.findUnique({
            where: { id: second.id }
          });

        expect(unchangedFirst?.status).toBe(
          "OPEN"
        );

        expect(unchangedSecond?.status).toBe(
          "OPEN"
        );

        const executions =
          await db.actionExecution.findMany({
            where: {
              organizationId,
              actionType: "task.update"
            }
          });

        expect(executions).toHaveLength(0);

        model.assertComplete();
      }
    );

    it(
      "E: denies a cross-tenant task_update argument and leaks no other organization's data",
      async () => {
        const suffix =
          `${Date.now()}-${Math.random().toString(36).slice(2)}-e`;

        const { organizationId, userId } =
          await seedTenant(suffix);

        const otherSuffix = `${suffix}-other`;

        const { organizationId: otherOrgId } =
          await seedTenant(otherSuffix);

        const turnId = `turn-e-${suffix}`;

        const foreignTask = await db.task.create(
          {
            data: {
              organizationId: otherOrgId,
              title:
                "Başka şirketin gizli görevi",
              status: "OPEN",
              priority: "HIGH"
            }
          }
        );

        const model = new ScriptedModel([
          [
            functionCall(
              "task_update",
              {
                taskId: foreignTask.id,
                status: "DONE"
              },
              { callId: "call_e_1" }
            )
          ],
          [
            assistantMessage(
              "Bu görevi bulamadım, herhangi bir değişiklik yapmadım."
            )
          ]
        ]);

        const { agent, runner } =
          runnerFor(model);

        const result = await runner.run(
          agent,
          "Şu görev id'sini tamamlandı yap: " +
            foreignTask.id,
          {
            context: {
              actorUserId: userId,
              organizationId,
              turnId
            }
          }
        );

        expect(result.finalOutput).toBe(
          "Bu görevi bulamadım, herhangi bir değişiklik yapmadım."
        );

        const toolTurnInput =
          model.calls[1]?.request.input;

        const functionResult = (
          Array.isArray(toolTurnInput)
            ? toolTurnInput
            : []
        ).find(
          (item) =>
            item.type ===
            "function_call_result"
        ) as
          | {
              output?: { text?: string };
            }
          | undefined;

        const serializedOutput =
          functionResult?.output?.text ?? "";

        expect(serializedOutput).not.toContain(
          "VERIFIED"
        );

        expect(serializedOutput).not.toContain(
          "Başka şirketin gizli görevi"
        );

        const unaffected = await db.task.findUnique(
          {
            where: { id: foreignTask.id }
          }
        );

        expect(unaffected?.status).toBe(
          "OPEN"
        );

        expect(
          unaffected?.organizationId
        ).toBe(otherOrgId);

        const leakedExecution =
          await db.actionExecution.findFirst({
            where: {
              organizationId,
              actionType: "task.update",
              resourceId: foreignTask.id
            }
          });

        expect(leakedExecution).toBeNull();

        model.assertComplete();
      }
    );
  }
);

afterAll(async () => {
  for (
    const organizationId
    of organizationIds
  ) {
    await db.actionExecution.deleteMany({
      where: { organizationId }
    });

    await db.task.deleteMany({
      where: { organizationId }
    });

    await db.organizationMember.deleteMany({
      where: { organizationId }
    });

    await db.organization.deleteMany({
      where: { id: organizationId }
    });
  }

  for (const userId of userIds) {
    await db.user.deleteMany({
      where: { id: userId }
    });
  }

  await db.$disconnect();
});
