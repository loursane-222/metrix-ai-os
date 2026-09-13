import {
  tool,
  type RunContext
} from "@openai/agents";

import { z } from "zod";

import {
  executeTaskCreate
} from "../../actions/task-create";

export type ExecutiveToolContext = {
  actorUserId: string;
  organizationId: string;
  turnId: string;
};

const TaskCreateToolParameters = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe(
      "Oluşturulacak görevin kısa ve açık başlığı"
    ),

  priority: z
    .enum(["LOW", "MEDIUM", "HIGH"])
    .default("MEDIUM")
    .describe(
      "Görevin önceliği"
    ),

  dueAt: z
    .string()
    .datetime()
    .optional()
    .describe(
      "Biliniyorsa ISO 8601 kesin son tarih/saat"
    )
});

function requireTrustedContext(
  runContext:
    | RunContext<ExecutiveToolContext>
    | undefined
): ExecutiveToolContext {
  const context = runContext?.context;

  if (
    !context ||
    !context.actorUserId?.trim() ||
    !context.organizationId?.trim() ||
    !context.turnId?.trim()
  ) {
    throw new Error(
      "Trusted executive tool context is required"
    );
  }

  return context;
}

export function createTaskCreateTool() {
  return tool<
    typeof TaskCreateToolParameters,
    ExecutiveToolContext
  >({
    name: "task_create",

    description:
      "Şirket için gerçek bir görev oluşturur. " +
      "Yalnız kullanıcı açıkça görev oluşturmak, " +
      "hatırlatılacak bir iş kaydetmek veya bir işi " +
      "takibe almak istediğinde kullan. " +
      "Başarı yalnız doğrulanmış runtime sonucu ile vardır.",

    parameters: TaskCreateToolParameters,

    async execute(
      args,
      runContext
    ) {
      const context =
        requireTrustedContext(runContext);

      return executeTaskCreate({
        actorUserId:
          context.actorUserId,

        organizationId:
          context.organizationId,

        idempotencyKey:
          `turn:${context.turnId}:task.create`,

        title:
          args.title,

        priority:
          args.priority,

        dueAt:
          args.dueAt
      });
    }
  });
}
