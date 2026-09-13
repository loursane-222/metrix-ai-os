import { z } from "zod";

import {
  executeCustomerCreate
} from "../../actions/customer-create";
import {
  executeTaskCreate
} from "../../actions/task-create";
import {
  lookupCustomersForOrganization
} from "../../data/customer-lookup";

import type {
  ExecutiveToolContext,
  MetrixTrustedToolContext
} from "../types";

export type {
  MetrixTrustedToolContext
} from "../types";

export const TaskCreateToolParameters = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("Oluşturulacak görevin kısa ve açık başlığı"),
  priority: z
    .enum(["LOW", "MEDIUM", "HIGH"])
    .default("MEDIUM")
    .describe("Görevin önceliği"),
  dueAt: z
    .string()
    .optional()
    .describe("Biliniyorsa ISO 8601 kesin son tarih/saat")
});

export const CustomerCreateToolParameters = z.object({
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

export const CustomerLookupToolParameters = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("Aranacak müşterinin adı veya adının bilinen kısmı")
});

export type MetrixBusinessToolName =
  | "task_create"
  | "customer_create"
  | "customer_lookup";

type MetrixBusinessToolContract = {
  name: MetrixBusinessToolName;
  description: string;
  parameters:
    | typeof TaskCreateToolParameters
    | typeof CustomerCreateToolParameters
    | typeof CustomerLookupToolParameters;
};

export const TASK_CREATE_BUSINESS_TOOL = {
  name: "task_create",
  description:
    "Şirket için gerçek bir görev oluşturur. " +
    "Yalnız kullanıcı açıkça görev oluşturmak, " +
    "hatırlatılacak bir iş kaydetmek veya bir işi " +
    "takibe almak istediğinde kullan. " +
    "Başarı yalnız doğrulanmış runtime sonucu ile vardır.",
  parameters: TaskCreateToolParameters
} as const;

export const CUSTOMER_CREATE_BUSINESS_TOOL = {
  name: "customer_create",
  description:
    "Şirket için gerçek bir müşteri oluşturur. " +
    "Yalnız kullanıcı açıkça müşteri oluşturmak istediğinde kullan. " +
    "name, kullanıcının söylediği müşteri adının eksiksiz literal ifadesi olmalıdır; " +
    "isimdeki son ekleri, kodları, numaraları veya UUID-benzeri parçaları ayrı kimlik olarak yorumlama. " +
    "email yalnız kullanıcı verdiyse gönderilir. " +
    "Başarı yalnız doğrulanmış runtime sonucu ile vardır.",
  parameters: CustomerCreateToolParameters
} as const;

export const CUSTOMER_LOOKUP_BUSINESS_TOOL = {
  name: "customer_lookup",
  description:
    "Şirketin gerçek müşteri kayıtlarında isimle arama yapar. " +
    "Kullanıcı bir müşteri hakkında şirket kaydına dayalı bilgi " +
    "istediğinde kullan. Sonucu tahmin etme; yalnız tool tarafından " +
    "dönen müşteri kayıtlarını şirket gerçeği olarak kullan.",
  parameters: CustomerLookupToolParameters
} as const;

export const METRIX_BUSINESS_TOOL_CONTRACTS: readonly MetrixBusinessToolContract[] = [
  TASK_CREATE_BUSINESS_TOOL,
  CUSTOMER_CREATE_BUSINESS_TOOL,
  CUSTOMER_LOOKUP_BUSINESS_TOOL
];

function responsesParameters(
  parameters: MetrixBusinessToolContract["parameters"]
) {
  const {
    $schema: _schema,
    ...jsonSchema
  } = z.toJSONSchema(parameters);

  return jsonSchema;
}

export const METRIX_RESPONSES_FUNCTION_TOOLS =
  METRIX_BUSINESS_TOOL_CONTRACTS.map(
    ({ name, description, parameters }) => ({
      type: "function" as const,
      name,
      description,
      parameters: responsesParameters(parameters)
    })
  );

function parseArguments(argumentsJson: string): unknown {
  return JSON.parse(argumentsJson);
}

export function metrixTrustedToolContextForExecutiveTurn(
  context: ExecutiveToolContext | undefined
): MetrixTrustedToolContext {
  if (
    !context ||
    !context.actorUserId?.trim() ||
    !context.organizationId?.trim() ||
    !context.turnId?.trim()
  ) {
    throw new Error("Trusted executive tool context is required");
  }

  return {
    actorUserId: context.actorUserId,
    organizationId: context.organizationId,
    idempotencyScope: `turn:${context.turnId}`,
    timezone: context.timezone ?? "UTC",
    referenceTimeIso:
      context.referenceTimeIso ?? new Date().toISOString()
  };
}

export async function executeMetrixBusinessTool(
  input: {
    name: MetrixBusinessToolName;
    argumentsJson: string;
    context: MetrixTrustedToolContext;
  }
): Promise<unknown> {
  switch (input.name) {
    case "task_create": {
      const args = TaskCreateToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      return executeTaskCreate({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        idempotencyKey:
          `${input.context.idempotencyScope}:task.create`,
        title: args.title,
        priority: args.priority,
        dueAt: args.dueAt
      });
    }

    case "customer_create": {
      const args = CustomerCreateToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      return executeCustomerCreate({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        idempotencyKey:
          `${input.context.idempotencyScope}:customer.create`,
        name: args.name,
        email: args.email
      });
    }

    case "customer_lookup": {
      const args = CustomerLookupToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      const customers =
        await lookupCustomersForOrganization({
          actorUserId: input.context.actorUserId,
          organizationId: input.context.organizationId,
          query: args.query
        });

      return {
        source: "COMPANY_REALITY",
        query: args.query,
        count: customers.length,
        customers
      };
    }
  }
}
