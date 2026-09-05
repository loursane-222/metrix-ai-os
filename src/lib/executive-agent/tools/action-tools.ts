/**
 * Write-capability tools — section 17/27/28/29/30/31: the Agent never
 * mutates directly. It discovers real, already-registered actions, then
 * proposes them through the existing General Orchestration engine
 * (src/lib/executive-orchestration), which is itself just a compiler onto
 * Canonical Operation -> Policy/Permission -> Approval -> Action Runtime ->
 * Connector -> Authoritative Readback. Nothing here re-implements any of
 * that; both tools are thin.
 */

import { z } from "zod";
import { tool } from "@openai/agents";
import { randomUUID } from "node:crypto";
import { buildActionCatalog } from "@/lib/executive-orchestration/action-catalog";
import { runOrchestration } from "@/lib/executive-orchestration/executive-orchestration.service";
import { resolvedEvidence, type ExecutiveAgentRunContext } from "../types";

export function buildListAvailableActionsTool() {
  return tool({
    name: "list_available_business_actions",
    description: "Lists the real business actions you're allowed to execute (name, whether it needs human approval, and its required fields). Call this before proposing any write so you use a real action name and real fields, never a guessed one.",
    parameters: z.object({}),
    async execute() {
      const catalog = buildActionCatalog();
      return resolvedEvidence({ factScope: "actions.catalog", data: catalog, source: "action-catalog" });
    },
  });
}

export function buildExecuteBusinessActionTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "execute_business_action",
    description:
      "Proposes and runs ONE real business action (from list_available_business_actions) through METRIX's real policy/approval/execution/readback pipeline. " +
      "This is a proposal, not a guaranteed mutation: read the returned status — RUNNING/COMPLETED means it actually went through (check the step's own result before claiming success); " +
      "AWAITING_APPROVAL means a human must approve before anything happens — tell the user that, don't claim it's done; FAILED means it did not happen.",
    parameters: z.object({
      domain: z.string().describe("The action's domain, e.g. \"task\", \"customer\" — the part before the dot in its actionName."),
      actionName: z.string().describe("The exact actionName from list_available_business_actions, e.g. \"task.complete\"."),
      // JSON-encoded, not a nested object schema: an arbitrary-keys object
      // (z.record) can't satisfy OpenAI's strict Structured Outputs mode
      // (every object schema must set additionalProperties: false, which a
      // per-action field set can't declare ahead of time).
      argsJson: z.string().describe("The action's required fields (matching its catalog schema) as a JSON object string."),
    }),
    async execute(input) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(input.argsJson) as Record<string, unknown>;
      } catch {
        return resolvedEvidence({ factScope: "actions.execution", data: { error: "argsJson is not valid JSON." }, source: "executive-orchestration" });
      }
      const view = await runOrchestration({
        auth: runContext.authContext,
        triggerUtterance: `executive_agent:${randomUUID()}`,
        plan: { steps: [{ domain: input.domain, actionName: input.actionName, argsTemplate: args }] },
      });
      return resolvedEvidence({ factScope: "actions.execution", data: view, source: "executive-orchestration" });
    },
  });
}
