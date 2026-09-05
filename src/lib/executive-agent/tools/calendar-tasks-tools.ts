/**
 * Calendar + Task tools. Calendar deliberately uses the canonical
 * multi-source projection (Google/iCloud/native), never a raw Prisma read —
 * section 52: the same projection Workspace shows must be what the Agent
 * answers "what's on my calendar" from.
 */

import { z } from "zod";
import { tool } from "@openai/agents";
import { resolveCanonicalCalendarProjection } from "@/lib/company-intelligence/calendar-projection";
import { listTasksForOrganization, countTaskSummary } from "@/lib/core/tasks/task.repository";
import { resolvedEvidence, type ExecutiveAgentRunContext } from "../types";

export function buildCalendarTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_calendar",
    description: "Real calendar events (from every connected calendar source) within a date range. Always use this for \"what's on my calendar\" — never answer from assumption, and a navigation acknowledgment (\"opened the calendar\") is never a substitute for actually answering this.",
    parameters: z.object({
      rangeStartIso: z.string().describe("Inclusive range start, ISO 8601."),
      rangeEndIso: z.string().describe("Exclusive range end, ISO 8601."),
    }),
    async execute(input) {
      const result = await resolveCanonicalCalendarProjection({
        organizationId: runContext.organizationId,
        userId: runContext.actorId,
        rangeStart: new Date(input.rangeStartIso),
        rangeEnd: new Date(input.rangeEndIso),
      });
      return resolvedEvidence({ factScope: "company.calendar", data: result, source: "company-intelligence (canonical calendar projection)" });
    },
  });
}

export function buildTasksTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "company_tasks",
    description: "Open/overdue/done task counts and, optionally, the task list filtered by status.",
    parameters: z.object({ status: z.enum(["OPEN", "DONE", "CANCELLED"]).nullable() }),
    async execute(input) {
      const [summary, tasks] = await Promise.all([
        countTaskSummary(runContext.organizationId),
        listTasksForOrganization({ organizationId: runContext.organizationId, status: input.status ?? undefined }),
      ]);
      return resolvedEvidence({ factScope: "company.tasks", data: { summary, tasks }, source: "task.repository" });
    },
  });
}
