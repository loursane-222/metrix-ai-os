/**
 * Semantic UI tools — METRIX OpenAI-Native Jarvis Interaction.
 *
 * Two generic tools, open_workspace and close_workspace. Neither carries
 * business authority (Hard Principle C): neither invents data, neither
 * commits a mutation, both only ever project an already-canonical
 * navigation descriptor into a route + (for task.create) a Universal Input
 * Authority field batch. The Agent decides intent, domain, entity, and any
 * prefill values from its own reading of the conversation — these tools
 * only execute the resulting UI decision safely.
 *
 * Direct Executive Hot-Path Migration: open_workspace's generic branch
 * (everything except task.create's own prefill path) delegates straight to
 * resolveBusinessNavigation — the exact same deterministic, zero-LLM
 * resolver business-navigation.ts's own pre-Executive dispatch already
 * used for every domain (customer/offer/calendar/company/accounting/
 * report/document/kpi/performance/team/task/product/stock/order/invoice/
 * payment/supplier). No new resolver, no new entity-matching logic, no
 * per-domain bypass — the Agent's tool-call arguments are simply wrapped
 * into the same BusinessNavigationRequest shape classifyConversation used
 * to produce, and handed to the identical function.
 */

import { z } from "zod";
import { tool } from "@openai/agents";
import { resolvedEvidence, type ExecutiveAgentRunContext, type ExecutiveWorkspaceNavigation } from "../types";
import { listCustomers as listCustomersForOrg } from "@/lib/core/customers/customer.service";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { listQuotesByOrganization } from "@/lib/core/quotes/quote.service";
import {
  projectBusinessNavigation, resolveBusinessNavigation, createCalendarClock,
  type BusinessNavigationDescriptor,
} from "@/lib/executive-request-resolution/business-navigation";
import { buildListableDomainSnapshotFetcher } from "@/lib/executive-request-resolution";
import type { UniversalInputAuthorityCommand } from "@/lib/input-authority";
import type { BusinessNavigationRequest, ConversationUnderstanding } from "@/lib/conversation-understanding";

const GENERIC_NAV_DOMAINS = [
  "company", "customer", "offer", "product", "task", "calendar", "accounting",
  "team", "report", "document", "kpi", "stock", "order", "invoice", "payment",
  "supplier", "performance",
] as const;

// A synthetic ConversationUnderstanding wrapping only the tool's own
// arguments — never null businessNavigation, never shouldAskClarification,
// always high confidence: the Agent already decided this is a real
// navigation intent by calling the tool, so the generic per-domain
// resolution inside resolveBusinessNavigation runs unhindered by the
// blanket "ask first" gate that guards the classifier's own uncertainty.
function buildSyntheticUnderstanding(businessNavigation: BusinessNavigationRequest): ConversationUnderstanding {
  return {
    conversationKind: "company_related", userMotivation: "planlama", companyRelevance: "high",
    actionExpectation: "explicit", confidence: "high", shouldAskClarification: false,
    shouldInvokeExecutiveBrain: true, suggestedHandling: "executive_reasoning",
    managementIntent: null, queryPlan: null, businessNavigation, workspaceControl: null,
    externalEvidenceNeed: null, artifactRequest: null,
    reasoning: { summary: "open_workspace tool call", observations: [], uncertainty: [], whyThisHandling: "Executive tool-selected navigation." },
  };
}

export function buildOpenWorkspaceTool(
  runContext: ExecutiveAgentRunContext,
  onWorkspaceNavigate: (payload: ExecutiveWorkspaceNavigation) => void,
) {
  return tool({
    name: "open_workspace",
    description:
      "Opens a METRIX workspace surface for the user to see and, if a create surface, edit BEFORE anything is saved — this never commits a mutation itself. " +
      "domain=\"task\", target=\"create\": opens the new-task form; optionally pre-fill taskTitle/taskDueDate/assignSelf from what the user already told you — never invent a title or date the user did not imply. " +
      "Every other domain/target (customer detail/edit/create/list, offer list/create/edit, calendar, company, accounting, report, document, kpi, performance, team, and list surfaces for product/stock/order/invoice/payment/supplier/task) resolves the same real record the equivalent deterministic navigation always did — pass entityReference as the name/number the user said when target is detail/edit/create and one is needed. " +
      "Use this for \"aç\", \"göster\", \"ekranını getir\", \"hazırla ama önce göster/kaydetme\" style requests. For a request to actually CREATE/SAVE/UPDATE a record right now, use execute_business_action instead, not this tool.",
    parameters: z.object({
      domain: z.enum(GENERIC_NAV_DOMAINS).describe("Which workspace/domain to open."),
      target: z.enum(["root", "list", "detail", "edit", "create"]).describe("root: single-surface domains (company/accounting/report/document/kpi/performance/team/calendar). list: a record list. detail/edit: an existing record — pass entityReference. create: a new record — pass entityReference only when the create surface itself needs a related entity (e.g. offer create needs the customer); task create never needs one."),
      entityReference: z.string().nullable().describe("The name/number/reference the user said, for detail/edit/create targets that need one (e.g. a customer name, an order number). Null for root/list or when not needed."),
      calendarView: z.enum(["day", "week", "month"]).nullable().describe("For domain=calendar: requested view. Null for the surface's own default."),
      calendarDateKind: z.enum(["today", "tomorrow", "explicit"]).nullable().describe("For domain=calendar: a relative date keyword from the user's own words. Never compute an absolute date yourself — the server resolves it from the real clock. Null for no specific date."),
      calendarDateDay: z.number().int().min(1).max(31).nullable().describe("For calendarDateKind=explicit only: the day of month the user said."),
      calendarDateMonth: z.number().int().min(1).max(12).nullable().describe("For calendarDateKind=explicit only: the month the user said."),
      companySection: z.enum(["integrations"]).nullable().describe("For domain=company: which tab to land on. Null for the default (Genel Bakış)."),
      taskTitle: z.string().nullable().describe("For domain=task target=create: prefill title, only if the user's own words already imply one (e.g. \"Ahmet'i ara\"). Null to leave blank."),
      taskDueDate: z.string().nullable().describe("For domain=task target=create: prefill due date as an ISO date (YYYY-MM-DD), resolved the same way you already resolve task.create's own dueDate argument. Null to leave blank."),
      assignSelf: z.boolean().nullable().describe("For domain=task target=create: true to prefill the assignee as the current user, when the user implied it's their own task. Null/false to leave unassigned."),
    }),
    async execute(input) {
      if (input.domain === "task" && input.target === "create") {
        const descriptor: BusinessNavigationDescriptor = { domain: "task", kind: "task.create" };
        const projection = projectBusinessNavigation(descriptor);
        const batch: UniversalInputAuthorityCommand[] = [];
        if (input.taskTitle?.trim()) batch.push({ type: "SET", executiveTargetId: "field.tasks.create.task.title", value: input.taskTitle });
        if (input.taskDueDate?.trim()) batch.push({ type: "SET", executiveTargetId: "field.tasks.create.task.dueDate", value: input.taskDueDate });
        if (input.assignSelf) batch.push({ type: "SET", executiveTargetId: "field.tasks.create.task.assigneeUserId", value: runContext.actorId });
        onWorkspaceNavigate({
          route: projection.route,
          expectedSurfaceAuthorityKey: projection.expectedSurfaceAuthorityKey,
          ...(batch.length ? { batch, finalFocusTargetId: "field.tasks.create.task.title" } : {}),
        });
        return resolvedEvidence({ factScope: "workspace.open_workspace", data: { status: "OPENED" as const, prefillApplied: batch.length > 0 }, source: "open-workspace" });
      }

      const businessNavigation: BusinessNavigationRequest = {
        operation: "NAVIGATE",
        domain: input.domain,
        target: input.target,
        entityReference: input.entityReference,
        ...(input.calendarView ? { calendarView: input.calendarView } : {}),
        ...(input.calendarDateKind
          ? { calendarDate: input.calendarDateKind === "explicit" ? { kind: "explicit" as const, day: input.calendarDateDay ?? 1, month: input.calendarDateMonth ?? 1 } : { kind: input.calendarDateKind } }
          : {}),
        ...(input.companySection ? { companySection: input.companySection } : {}),
      };
      const resolution = await resolveBusinessNavigation({
        understanding: buildSyntheticUnderstanding(businessNavigation),
        activeWorkspaceContext: runContext.activeWorkspaceContext,
        calendarClock: createCalendarClock(new Date(), runContext.timeZone),
        rawMessage: runContext.currentTurnMessage,
        // Same ACTIVE-only filter route.ts's own pre-Executive dispatch used —
        // matches what the canonical Living Workspace Customers panel shows.
        listCustomers: async () => (input.domain === "customer" || input.domain === "offer")
          ? listCustomersForOrg({ organizationId: runContext.organizationId, status: "ACTIVE", limit: 5000 })
          : [],
        findLatestQuoteIdForCustomer: async (customerId) => {
          const quotes = await listQuotesByOrganization({ organizationId: runContext.organizationId });
          const candidate = quotes.filter((quote) => quote.customerId === customerId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
          return candidate?.id ?? null;
        },
        listDomainRecords: buildListableDomainSnapshotFetcher(runContext.organizationId),
      });
      if (resolution.status !== "RESOLVED") {
        return resolvedEvidence({
          factScope: "workspace.open_workspace",
          data: { status: resolution.status, ...(resolution.status === "CLARIFICATION_REQUIRED" ? { reason: resolution.reason } : {}) },
          source: "business-navigation",
        });
      }
      onWorkspaceNavigate(projectBusinessNavigation(resolution.descriptor));
      return resolvedEvidence({ factScope: "workspace.open_workspace", data: { status: "OPENED" as const }, source: "open-workspace" });
    },
  });
}

export function buildCloseWorkspaceTool(onWorkspaceClose: () => void) {
  return tool({
    name: "close_workspace",
    description:
      "Closes whichever Living Workspace surface is currently open and returns the user to full-screen chat. Domain-agnostic — call it regardless of which workspace is open; it always closes the one currently visible. Use for \"çalışma alanını kapat\", \"sohbete dön\" style requests. Never call this for a domain that isn't actually open.",
    parameters: z.object({}),
    async execute() {
      onWorkspaceClose();
      return resolvedEvidence({ factScope: "workspace.close_workspace", data: { status: "CLOSED" as const }, source: "close-workspace" });
    },
  });
}
