/**
 * Canonical read/write/query pass-through tools.
 *
 * Grand Consolidation Operation, section 27: read and write live on the same
 * canonical semantics. These tools are a thin gate onto the already-existing
 * executeCanonicalOperation (src/lib/canonical-operation) — the same entry
 * point routes, gateways and the customer/quote/order/etc. action UIs already
 * use. No business logic is duplicated here; a capability id maps 1:1 onto
 * an already-registered read or write capability (see
 * src/lib/canonical-operation/capabilities/{read,write}-capabilities.ts).
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { tool } from "@openai/agents";
import { executeCanonicalOperation } from "@/lib/canonical-operation";
import type { CanonicalOperationSource, CanonicalOperationType, CanonicalOperationV1 } from "@/lib/canonical-operation/types";
import {
  executeCompanyQueryPlan,
  buildCompanyQueryResponse,
  type CompanyQueryPlan,
} from "@/lib/company-query-authority";
import type { ExecutiveAgentRunContext } from "../types";

const READ_CAPABILITIES = [
  "customer.read",
  "quote.read",
  "order.read",
  "invoice.read",
  "task.read",
  "inventory.position",
  "calendar.read",
  "team.read",
] as const;

// Capability id -> CanonicalOperationType. Mirrors the convention already
// used by every existing caller of executeCanonicalOperation (customer
// archive/update routes, calendar routes, task/quote/invoice action routes)
// — never guessed, read off those real call sites.
const WRITE_CAPABILITY_TYPE: Record<string, CanonicalOperationType> = {
  "customer.create": "CREATE",
  "customer.update": "UPDATE",
  "customer.archive": "ARCHIVE",
  "quote.create": "CREATE",
  "quote.update": "UPDATE",
  "quote.send": "UPDATE",
  "order.create": "CREATE",
  "order.update": "UPDATE",
  "order.cancel": "ARCHIVE",
  "invoice.create": "CREATE",
  "invoice.send": "UPDATE",
  "invoice.void": "ARCHIVE",
  "settlement.create": "CREATE",
  "settlement.reverse": "EXECUTE",
  "task.create": "CREATE",
  "task.complete": "UPDATE",
  "task.cancel": "ARCHIVE",
  "inventory.receive": "EXECUTE",
  "inventory.transfer": "EXECUTE",
  "inventory.adjust": "EXECUTE",
  "calendar.create": "CREATE",
  "calendar.update": "UPDATE",
  "calendar.reschedule": "UPDATE",
  "team.update": "UPDATE",
};

export function buildCompanyReadTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_read",
    description:
      "Reads one canonical business record (customer, quote, order, invoice, task, inventory position, calendar event, or team member) by its id. " +
      "Use company_query instead for counts, cross-domain composition, or a bundle of facts about one customer.",
    parameters: z.object({
      capability: z.enum(READ_CAPABILITIES),
      entityId: z.string().describe("The canonical record id to read."),
    }),
    async execute(input) {
      const operation: CanonicalOperationV1 = {
        operationId: randomUUID(),
        correlationId: runContext.correlationId,
        organizationId: runContext.organizationId,
        actorId: runContext.actorId,
        source: resolveOperationSource(runContext.channel),
        type: "QUERY",
        domain: input.capability.split(".")[0] ?? "unknown",
        entity: { entityType: input.capability.split(".")[0] ?? "unknown", entityId: input.entityId },
        capability: input.capability,
        payload: {},
        revealIntent: { explicit: false },
        provenance: { conversationId: runContext.conversationId },
      };
      const result = await executeCanonicalOperation(operation, { authContext: runContext.authContext });
      return {
        status: result.status,
        data: result.status === "READ_COMPLETED" ? result.data : null,
        failureClassification: result.status === "READ_COMPLETED" ? null : result.failureClassification,
      };
    },
  });
}

function resolveOperationSource(channel: ExecutiveAgentRunContext["channel"]): CanonicalOperationSource {
  return channel === "voice" ? "voice" : "written";
}

const WRITE_CAPABILITIES = Object.keys(WRITE_CAPABILITY_TYPE) as [string, ...string[]];

export function buildCompanyWriteTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_write",
    description:
      "Proposes ONE canonical business mutation (create/update/archive/execute) through METRIX's real Policy -> Approval -> Action Runtime -> Readback pipeline. " +
      "This never mutates directly: the result tells you whether it executed, needs approval, or failed — never assume success from calling this tool alone.",
    parameters: z.object({
      capability: z.enum(WRITE_CAPABILITIES).describe("A registered write capability id, e.g. \"task.complete\", \"customer.update\"."),
      entityId: z.string().nullable().describe("The existing record's id, or null when creating a new one."),
      // A JSON object encoded as a string, not a nested object schema: an
      // arbitrary-keys object (z.record) cannot satisfy OpenAI's strict
      // Structured Outputs mode (every object schema must declare
      // additionalProperties: false, which a capability-specific payload
      // can't do ahead of time). Parsed immediately below.
      payloadJson: z.string().describe("Capability-specific fields as a JSON object string, e.g. {\"status\":\"DONE\"} for task.complete."),
    }),
    async execute(input) {
      const domain = input.capability.split(".")[0] ?? "unknown";
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(input.payloadJson) as Record<string, unknown>;
      } catch {
        return { status: "FAILED", mutationPerformed: false, readback: null, failureClassification: "VALIDATION_FAILED", failureMessage: "payloadJson is not valid JSON." };
      }
      const operation: CanonicalOperationV1 = {
        operationId: randomUUID(),
        correlationId: runContext.correlationId,
        organizationId: runContext.organizationId,
        actorId: runContext.actorId,
        source: resolveOperationSource(runContext.channel),
        type: WRITE_CAPABILITY_TYPE[input.capability] ?? "EXECUTE",
        domain,
        entity: input.entityId ? { entityType: domain, entityId: input.entityId } : { entityType: domain },
        capability: input.capability,
        payload,
        revealIntent: { explicit: false },
        provenance: { conversationId: runContext.conversationId },
      };
      const result = await executeCanonicalOperation(operation, { authContext: runContext.authContext });
      return {
        status: result.status,
        mutationPerformed: result.mutationPerformed,
        readback: result.readback,
        failureClassification: result.status === "FAILED" || result.status === "UNSUPPORTED" || result.status === "CONFLICT" ? result.failureClassification : null,
        failureMessage: (result as { failureMessage?: string }).failureMessage ?? null,
      };
    },
  });
}

const COMPANY_QUERY_SCOPE = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("domain_count"),
    domain: z.enum(["customers", "stock", "order", "invoice", "payment", "supplier", "product", "task", "team", "goal"]),
  }),
  z.object({
    scope: z.literal("customer_set"),
    setPipeline: z.array(z.object({
      set: z.enum(["CUSTOMERS_WITH_QUOTE_SENT", "CUSTOMERS_WITH_CONFIRMED_ORDER", "CUSTOMERS_WITH_RECEIVABLE_BALANCE"]),
      op: z.enum(["BASE", "INTERSECT", "EXCEPT"]),
    })).min(1).max(4),
    dateRange: z.union([
      z.object({ kind: z.literal("CURRENT_MONTH") }),
      z.object({ kind: z.literal("PREVIOUS_MONTH") }),
      z.object({ kind: z.literal("LAST_N_DAYS"), days: z.number().int().positive() }),
    ]).nullable(),
  }),
  z.object({
    scope: z.literal("single_customer"),
    customerReference: z.string(),
    facts: z.array(z.enum(["QUOTE_HISTORY", "ORDER_HISTORY", "RECEIVABLE_POSITION", "COMMERCIAL_TERMS", "CONVERSATION_HISTORY"])).min(1).max(5),
    dateRange: z.union([
      z.object({ kind: z.literal("CURRENT_MONTH") }),
      z.object({ kind: z.literal("PREVIOUS_MONTH") }),
      z.object({ kind: z.literal("LAST_N_DAYS"), days: z.number().int().positive() }),
    ]).nullable(),
    conversationTopicKeywords: z.array(z.string()).nullable(),
  }),
]);

export function buildCompanyQueryTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_query",
    description:
      "Cross-domain deterministic company fact tool: exact counts (\"kaç müşterim var\"), customer-set composition " +
      "(\"teklif gönderdiğim ama sipariş vermeyen müşteriler\"), or a bundled fact-set about ONE named customer " +
      "(quote/order history, receivable position, commercial terms, past conversation history). " +
      "This tool never produces judgment — it only returns deterministic facts; form your own assessment on top of them.",
    parameters: z.object({ plan: COMPANY_QUERY_SCOPE }),
    async execute(input) {
      // judgmentNeed is deliberately never accepted from the Agent and always
      // false: buildCompanyQueryJudgment (a second, separate judgment-
      // generating model call) is retired as a cognition owner in this
      // operation — the Executive Agent itself is the only judgment producer.
      const plan = { ...input.plan, judgmentNeed: false } as CompanyQueryPlan;
      const result = await executeCompanyQueryPlan(runContext.organizationId, plan, {
        now: new Date(),
        timeZone: runContext.timeZone,
        conversationId: runContext.conversationId,
      });
      return {
        factsText: buildCompanyQueryResponse(result),
        result,
      };
    },
  });
}
