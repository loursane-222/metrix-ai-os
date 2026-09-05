/**
 * Company/Executive Memory tools — section 14: relevant retrieval on demand,
 * never the whole memory dumped into every turn's prompt. This is the
 * institutional-memory authority (src/lib/memory, src/lib/core/memory-items),
 * kept strictly separate from Agents SDK conversation-continuity state.
 */

import { z } from "zod";
import { tool } from "@openai/agents";
import { buildMemoryContextForOrganization } from "@/lib/memory/memory-context-builder.service";
import { listOpenExecutiveDecisionRecords } from "@/lib/executive-decision-loop/executive-decision-record.repository";
import { resolvedEvidence, type ExecutiveAgentRunContext } from "../types";

export function buildMemorySearchTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "memory_search_relevant",
    description:
      "Retrieves this company's institutional memory (strategic facts, business facts, process notes, user preferences), prioritized by type and by source " +
      "(a user's own correction always outranks a system inference). Use this instead of assuming you remember anything about the company yourself.",
    // Nullable, not .default(): OpenAI's strict Structured Outputs mode
    // requires every property to be in `required` with no schema-level
    // default — the model passes null to mean "use the default" instead.
    parameters: z.object({ maxItems: z.number().int().min(1).max(50).nullable() }),
    async execute(input) {
      const context = await buildMemoryContextForOrganization({ organizationId: runContext.organizationId, maxItems: input.maxItems ?? 20 });
      return resolvedEvidence({ factScope: "memory.relevant", data: context, source: "memory-context-builder.service" });
    },
  });
}

export function buildOpenCommitmentsTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "memory_open_commitments",
    description: "This company's currently open decisions/commitments (not yet closed) — for questions about what's still pending or previously committed to.",
    parameters: z.object({ maxItems: z.number().int().min(1).max(20).nullable() }),
    async execute(input) {
      const records = await listOpenExecutiveDecisionRecords(runContext.organizationId, input.maxItems ?? 10);
      return resolvedEvidence({ factScope: "memory.open_commitments", data: records, source: "executive-decision-loop" });
    },
  });
}
