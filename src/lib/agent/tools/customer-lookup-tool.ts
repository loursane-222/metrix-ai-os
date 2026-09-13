import {
  tool,
  type RunContext
} from "@openai/agents";

import {
  z
} from "zod";

import {
  lookupCustomersForOrganization
} from "../../data/customer-lookup";

import type {
  ExecutiveToolContext
} from "./task-create-tool";

const CustomerLookupParameters =
  z.object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe(
        "Aranacak müşterinin adı veya adının bilinen kısmı"
      )
  });

function requireTrustedContext(
  runContext:
    | RunContext<ExecutiveToolContext>
    | undefined
): ExecutiveToolContext {
  const context =
    runContext?.context;

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

export function createCustomerLookupTool() {
  return tool<
    typeof CustomerLookupParameters,
    ExecutiveToolContext
  >({
    name: "customer_lookup",

    description:
      "Şirketin gerçek müşteri kayıtlarında isimle arama yapar. " +
      "Kullanıcı bir müşteri hakkında şirket kaydına dayalı bilgi " +
      "istediğinde kullan. Sonucu tahmin etme; yalnız tool tarafından " +
      "dönen müşteri kayıtlarını şirket gerçeği olarak kullan.",

    parameters:
      CustomerLookupParameters,

    async execute(
      args,
      runContext
    ) {
      const context =
        requireTrustedContext(
          runContext
        );

      const customers =
        await lookupCustomersForOrganization({
          actorUserId:
            context.actorUserId,
          organizationId:
            context.organizationId,
          query:
            args.query
        });

      return {
        source:
          "COMPANY_REALITY",
        query:
          args.query,
        count:
          customers.length,
        customers
      };
    }
  });
}
