import { tool, type RunContext } from "@openai/agents";

import { z } from "zod";

import { executeCustomerCreate } from "../../actions/customer-create";

import type { ExecutiveToolContext } from "./task-create-tool";

const CustomerCreateToolParameters = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe(
      "Kullanıcının müşteri adı olarak söylediği tam ifade. " +
      "Son ekleri, kodları, numaraları veya UUID-benzeri parçaları ayırma, " +
      "kısaltma ya da normalize etme."
    ),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .describe("Kullanıcı verdiyse müşterinin e-posta adresi")
});

function requireTrustedContext(
  runContext: RunContext<ExecutiveToolContext> | undefined
): ExecutiveToolContext {
  const context = runContext?.context;

  if (
    !context ||
    !context.actorUserId?.trim() ||
    !context.organizationId?.trim() ||
    !context.turnId?.trim()
  ) {
    throw new Error("Trusted executive tool context is required");
  }

  return context;
}

export function createCustomerCreateTool() {
  return tool<typeof CustomerCreateToolParameters, ExecutiveToolContext>({
    name: "customer_create",

    description:
      "Şirket için gerçek bir müşteri oluşturur. " +
      "Yalnız kullanıcı açıkça müşteri oluşturmak istediğinde kullan. " +
      "name, kullanıcının söylediği müşteri adının eksiksiz literal ifadesi olmalıdır; " +
      "isimdeki son ekleri, kodları, numaraları veya UUID-benzeri parçaları ayrı kimlik olarak yorumlama. " +
      "email yalnız kullanıcı verdiyse gönderilir. " +
      "Başarı yalnız doğrulanmış runtime sonucu ile vardır.",

    parameters: CustomerCreateToolParameters,

    async execute(args, runContext) {
      const context = requireTrustedContext(runContext);

      return executeCustomerCreate({
        actorUserId: context.actorUserId,
        organizationId: context.organizationId,
        idempotencyKey: `turn:${context.turnId}:customer.create`,
        name: args.name,
        email: args.email
      });
    }
  });
}
