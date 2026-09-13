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
  createTaskCreateTool
} from "../../src/lib/agent/tools/task-create-tool";

import type {
  MetrixExecutiveContext
} from "../../src/lib/agent/types";

const organizationIds: string[] = [];
const userIds: string[] = [];

describe(
  "METRIX Executive SDK pipeline acceptance",
  () => {
    it(
      "executes native model→tool→runtime→readback→model pipeline exactly once",
      async () => {
        const suffix =
          `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;

        const organizationId =
          `pipeline-org-${suffix}`;

        const userId =
          `pipeline-user-${suffix}`;

        const turnId =
          `pipeline-turn-${suffix}`;

        organizationIds.push(
          organizationId
        );

        userIds.push(
          userId
        );

        await db.organization.create({
          data: {
            id: organizationId,
            name: "Pipeline Acceptance Tenant"
          }
        });

        await db.user.create({
          data: {
            id: userId,
            email:
              `${userId}@example.test`,
            name:
              "Pipeline Acceptance User"
          }
        });

        await db.organizationMember.create({
          data: {
            organizationId,
            userId,
            role: "MEMBER"
          }
        });

        const productionAgentSource =
          await import(
            "node:fs/promises"
          ).then(
            (fs) =>
              fs.readFile(
                "src/lib/agent/metrix-executive-agent.ts",
                "utf8"
              )
          );

        expect(
          productionAgentSource
        ).toContain(
          'model: "gpt-5.6-sol"'
        );

        const model =
          new ScriptedModel([
            [
              functionCall(
                "task_create",
                {
                  title:
                    "Yarın Belgin tahsilatını kontrol et",
                  priority:
                    "HIGH"
                },
                {
                  callId:
                    "call_task_create_1"
                }
              )
            ],

            [
              assistantMessage(
                "Görevi oluşturdum ve doğruladım."
              )
            ]
          ]);

        const agent =
          new Agent<MetrixExecutiveContext>({
            name: "METRIX",

            instructions:
              "Use the native tool for the requested business mutation.",

            model,

            tools: [
              createTaskCreateTool()
            ]
          });

        const runner =
          new Runner({
            tracingDisabled: true
          });

        const result =
          await runner.run(
            agent,
            "Yarın Belgin tahsilatını kontrol et diye yüksek öncelikli görev oluştur.",
            {
              context: {
                actorUserId:
                  userId,

                organizationId,

                turnId
              }
            }
          );

        expect(
          result.finalOutput
        ).toBe(
          "Görevi oluşturdum ve doğruladım."
        );

        expect(
          model.calls
        ).toHaveLength(2);

        const lastInput =
          model.lastCall?.request.input;

        expect(
          Array.isArray(lastInput)
        ).toBe(true);

        if (!Array.isArray(lastInput)) {
          throw new Error(
            "Expected normalized model input array"
          );
        }

        const toolResult =
          lastInput.find(
            (item) =>
              item.type ===
              "function_call_result"
          );

        expect(
          toolResult
        ).toBeDefined();

        expect(
          toolResult
        ).toMatchObject({
          type:
            "function_call_result",
          name:
            "task_create",
          status:
            "completed"
        });

        const output =
          (
            toolResult as {
              output?: {
                type?: string;
                text?: string;
              };
            }
          ).output;

        expect(
          output?.type
        ).toBe("text");

        expect(
          typeof output?.text
        ).toBe("string");

        if (
          typeof output?.text !==
          "string"
        ) {
          throw new Error(
            "Expected serialized tool result text"
          );
        }

        const verifiedToolResult =
          JSON.parse(
            output.text
          ) as {
            action: string;
            status: string;
            verified: boolean;
            replayed: boolean;
            task: {
              id: string;
              organizationId: string;
              title: string;
              priority: string;
              status: string;
            };
          };

        expect(
          verifiedToolResult
        ).toMatchObject({
          action:
            "task.create",
          status:
            "VERIFIED",
          verified:
            true,
          replayed:
            false
        });

        expect(
          verifiedToolResult.task.organizationId
        ).toBe(
          organizationId
        );

        expect(
          verifiedToolResult.task.title
        ).toBe(
          "Yarın Belgin tahsilatını kontrol et"
        );

        expect(
          verifiedToolResult.task.priority
        ).toBe("HIGH");

        expect(
          verifiedToolResult.task.status
        ).toBe("OPEN");

        const tasks =
          await db.task.findMany({
            where: {
              organizationId,
              title:
                "Yarın Belgin tahsilatını kontrol et"
            }
          });

        expect(tasks).toHaveLength(1);

        expect(
          tasks[0]?.priority
        ).toBe("HIGH");

        expect(
          tasks[0]?.status
        ).toBe("OPEN");

        const executions =
          await db.actionExecution.findMany({
            where: {
              organizationId,
              actionType:
                "task.create"
            }
          });

        expect(
          executions
        ).toHaveLength(1);

        expect(
          executions[0]?.status
        ).toBe("VERIFIED");

        expect(
          executions[0]?.idempotencyKey
        ).toBe(
          `turn:${turnId}:task.create`
        );

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
      where: {
        organizationId
      }
    });

    await db.task.deleteMany({
      where: {
        organizationId
      }
    });

    await db.organizationMember.deleteMany({
      where: {
        organizationId
      }
    });

    await db.organization.deleteMany({
      where: {
        id: organizationId
      }
    });
  }

  for (
    const userId
    of userIds
  ) {
    await db.user.deleteMany({
      where: {
        id: userId
      }
    });
  }

  await db.$disconnect();
});
