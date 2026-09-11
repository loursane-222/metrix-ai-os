/**
 * Semantic UI tool — METRIX OpenAI-Native Jarvis Interaction, Phase 1.
 *
 * Single generic tool for opening a workspace surface. It carries NO
 * business authority (Hard Principle C): it never invents data, never
 * commits a mutation, and only ever projects an already-canonical
 * navigation descriptor (the exact same projectBusinessNavigation used by
 * business-navigation.ts's own deterministic path) into a route + a
 * Universal Input Authority field batch. The Agent decides intent, domain,
 * entity, and any prefill values from its own reading of the conversation —
 * this tool only executes the resulting UI-open decision safely.
 *
 * Field batch reuses the exact `data-executive-target` ids each screen
 * already registers via useUniversalInputRegistrations (see
 * TaskCreateScreen.tsx) and the SAME command.batch/finalFocusTargetId
 * mechanism business-navigation's own ExecutiveNavigationCommand already
 * supports end-to-end (executive-navigation-command.ts,
 * ExecutiveNavigationCommandHost.tsx) — no new client-side plumbing.
 */

import { z } from "zod";
import { tool } from "@openai/agents";
import { resolvedEvidence, type ExecutiveAgentRunContext, type ExecutiveWorkspaceNavigation } from "../types";
import { listCustomers as listCustomersForOrg } from "@/lib/core/customers/customer.service";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { projectBusinessNavigation, type BusinessNavigationDescriptor } from "@/lib/executive-request-resolution/business-navigation";
import type { UniversalInputAuthorityCommand } from "@/lib/input-authority";

export function buildOpenWorkspaceTool(
  runContext: ExecutiveAgentRunContext,
  onWorkspaceNavigate: (payload: ExecutiveWorkspaceNavigation) => void,
) {
  return tool({
    name: "open_workspace",
    description:
      "Opens a METRIX workspace surface for the user to see and, if a create surface, edit BEFORE anything is saved — this never commits a mutation itself. " +
      "domain=\"customer\", mode=\"detail\": opens an existing customer's record (customerReference = the name/reference the user said). " +
      "domain=\"task\", mode=\"create\": opens the new-task form; optionally pre-fill taskTitle/taskDueDate/assignSelf from what the user already told you so they only have to review and save — never invent a title or date the user did not imply. " +
      "Use this for \"aç\", \"göster\", \"ekranını getir\", \"hazırla ama önce göster/kaydetme\" style requests. For a request to actually CREATE/SAVE a task right now, use execute_business_action(\"task.create\") instead, not this tool.",
    parameters: z.object({
      domain: z.enum(["task", "customer"]).describe("Which workspace to open."),
      mode: z.enum(["create", "detail"]).describe("\"create\" for a new-record form (task only, for now). \"detail\" for an existing record (customer only, for now)."),
      customerReference: z.string().nullable().describe("For domain=customer: the customer's name or reference exactly as the user said it. Null otherwise."),
      taskTitle: z.string().nullable().describe("For domain=task mode=create: prefill title, only if the user's own words already imply one (e.g. \"Ahmet'i ara\"). Null to leave blank."),
      taskDueDate: z.string().nullable().describe("For domain=task mode=create: prefill due date as an ISO date (YYYY-MM-DD), resolved the same way you already resolve task.create's own dueDate argument. Null to leave blank."),
      assignSelf: z.boolean().nullable().describe("For domain=task mode=create: true to prefill the assignee as the current user, when the user implied it's their own task. Null/false to leave unassigned."),
    }),
    async execute(input) {
      if (input.domain === "customer" && input.mode === "detail") {
        if (!input.customerReference?.trim()) {
          return resolvedEvidence({ factScope: "workspace.open_workspace", data: { status: "MISSING_ENTITY" as const }, source: "open-workspace" });
        }
        const customers = await listCustomersForOrg({ organizationId: runContext.organizationId, limit: 5000 });
        const resolution = resolveCustomerReference(customers, input.customerReference);
        if (resolution.status === "NOT_FOUND") {
          return resolvedEvidence({ factScope: "workspace.open_workspace", data: { status: "NOT_FOUND" as const }, source: "customer-resolution" });
        }
        if (resolution.status === "AMBIGUOUS") {
          return resolvedEvidence({ factScope: "workspace.open_workspace", data: { status: "AMBIGUOUS" as const, options: resolution.options.map((option) => option.displayName) }, source: "customer-resolution" });
        }
        const descriptor: BusinessNavigationDescriptor = { domain: "customer", kind: "customer.detail", customerId: resolution.customer.id };
        const projection = projectBusinessNavigation(descriptor);
        onWorkspaceNavigate({ route: projection.route, expectedSurfaceAuthorityKey: projection.expectedSurfaceAuthorityKey });
        return resolvedEvidence({ factScope: "workspace.open_workspace", data: { status: "OPENED" as const, customerDisplayName: resolution.customer.displayName }, source: "open-workspace" });
      }
      if (input.domain === "task" && input.mode === "create") {
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
      return resolvedEvidence({ factScope: "workspace.open_workspace", data: { status: "UNSUPPORTED" as const }, source: "open-workspace" });
    },
  });
}
