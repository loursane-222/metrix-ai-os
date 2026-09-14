import { z } from "zod";

import {
  executeCustomerCreate
} from "../../actions/customer-create";
import {
  executeTaskCreate
} from "../../actions/task-create";
import {
  executeTaskUpdate
} from "../../actions/task-update";
import {
  lookupCustomersForOrganization
} from "../../data/customer-lookup";
import {
  listTasksForOrganization
} from "../../data/task-list";

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

export const TaskListToolParameters = z.object({
  status: z
    .enum(["OPEN", "DONE", "CANCELLED"])
    .optional()
    .describe("Yalnız bu durumdaki görevleri getir"),
  priority: z
    .enum(["LOW", "MEDIUM", "HIGH"])
    .optional()
    .describe("Yalnız bu öncelikteki görevleri getir"),
  dueAfter: z
    .string()
    .optional()
    .describe(
      "Yalnız bu ISO 8601 zamanından sonra (dahil) süresi dolan görevleri getir"
    ),
  dueBefore: z
    .string()
    .optional()
    .describe(
      "Yalnız bu ISO 8601 zamanından önce (dahil) süresi dolan görevleri getir. " +
        "Geciken görevler için trusted reference time'ı kullan."
    ),
  titleContains: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Görev başlığında aranacak metin, kullanıcı belirli bir " +
        "görevi tarif ettiğinde kullan"
    ),
  createdByMe: z
    .boolean()
    .optional()
    .describe(
      "true ise yalnız konuşan kullanıcının kendi oluşturduğu görevleri getir"
    ),
  assignedToMe: z
    .boolean()
    .optional()
    .describe(
      "true ise yalnız konuşan kullanıcıya atanmış görevleri getir. " +
        "\"görevlerim\", \"bana atanmış görevler\", \"bugünkü görevlerim\" " +
        "gibi kullanıcının kendi sorumluluğundaki işleri sorduğu " +
        "ownership talepleri için bunu tercih et."
    )
});

export const TaskUpdateToolParameters = z.object({
  taskId: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Güncellenecek görevin task_list sonucundan alınan gerçek id'si. " +
        "Kullanıcı bir id söylemediyse önce task_list ile hedef görevi bul."
    ),
  status: z
    .enum(["OPEN", "DONE", "CANCELLED"])
    .optional()
    .describe("Görevin yeni durumu"),
  priority: z
    .enum(["LOW", "MEDIUM", "HIGH"])
    .optional()
    .describe("Görevin yeni önceliği"),
  dueAt: z
    .string()
    .optional()
    .describe("Görevin yeni ISO 8601 son tarih/saati")
});

export type MetrixBusinessToolName =
  | "task_create"
  | "task_list"
  | "task_update"
  | "customer_create"
  | "customer_lookup";

type MetrixBusinessToolContract = {
  name: MetrixBusinessToolName;
  description: string;
  parameters:
    | typeof TaskCreateToolParameters
    | typeof TaskListToolParameters
    | typeof TaskUpdateToolParameters
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

export const TASK_LIST_BUSINESS_TOOL = {
  name: "task_list",
  description:
    "Şirketin gerçek görev kayıtlarını okur. Kullanıcı açık/gecikmiş/" +
    "öncelikli/tarihli görevleri sorduğunda veya bir görevi tarife göre " +
    "bulmak (örn. güncellemek için) gerektiğinde kullan. Sonucu tahmin " +
    "etme; yalnız tool tarafından dönen görevleri şirket gerçeği olarak kullan. " +
    "Boş sonuç da geçerli bir şirket gerçeğidir.",
  parameters: TaskListToolParameters
} as const;

export const TASK_UPDATE_BUSINESS_TOOL = {
  name: "task_update",
  description:
    "Var olan gerçek bir görevin durumunu, önceliğini veya son tarihini " +
    "günceller. taskId yalnız task_list sonucundan alınmalıdır; kullanıcı " +
    "id söylemediyse önce task_list ile hedef görevi bul. Eşleşen birden " +
    "fazla görev varsa tahmin etme, kullanıcıya netleştirme sorusu sor. " +
    "Başarı yalnız doğrulanmış runtime sonucu ile vardır.",
  parameters: TaskUpdateToolParameters
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
  TASK_LIST_BUSINESS_TOOL,
  TASK_UPDATE_BUSINESS_TOOL,
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

    case "task_list": {
      const args = TaskListToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      const tasks =
        await listTasksForOrganization({
          actorUserId: input.context.actorUserId,
          organizationId: input.context.organizationId,
          status: args.status,
          priority: args.priority,
          dueAfter: args.dueAfter,
          dueBefore: args.dueBefore,
          titleContains: args.titleContains,
          createdByMe: args.createdByMe,
          assignedToMe: args.assignedToMe
        });

      return {
        source: "COMPANY_REALITY",
        count: tasks.length,
        tasks
      };
    }

    case "task_update": {
      const args = TaskUpdateToolParameters.parse(
        parseArguments(input.argumentsJson)
      );

      return executeTaskUpdate({
        actorUserId: input.context.actorUserId,
        organizationId: input.context.organizationId,
        idempotencyKey:
          `${input.context.idempotencyScope}:task.update:${args.taskId}`,
        taskId: args.taskId,
        status: args.status,
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
