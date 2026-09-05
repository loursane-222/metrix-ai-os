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

type RawOrchestrationStep = { domain: string; actionName: string; args: Record<string, unknown> };

function parseOrchestrationSteps(stepsJson: string): RawOrchestrationStep[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stepsJson);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const steps: RawOrchestrationStep[] = [];
  for (const raw of parsed) {
    if (
      !raw || typeof raw !== "object"
      || typeof (raw as Record<string, unknown>).domain !== "string"
      || typeof (raw as Record<string, unknown>).actionName !== "string"
      || typeof (raw as Record<string, unknown>).args !== "object"
      || (raw as Record<string, unknown>).args === null
    ) return null;
    const step = raw as { domain: string; actionName: string; args: Record<string, unknown> };
    steps.push({ domain: step.domain, actionName: step.actionName, args: step.args });
  }
  return steps;
}

export function buildExecuteBusinessActionTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "execute_business_action",
    description:
      "Proposes and runs one or more real business actions (from list_available_business_actions) as ONE atomic plan through METRIX's real policy/approval/execution/readback pipeline — the same General Orchestration engine, with the same automatic compensation (undo of already-completed steps) if a later step in the SAME call fails. " +
      "Use one call with multiple steps for a genuinely multi-step user request (e.g. \"create the order, then its delivery note\"), not several separate calls — separate calls do not get compensation across each other. " +
      "A later step's args may reference an earlier step's created entity with {\"$stepRef\": <1-based step number>} instead of a literal value. " +
      "This is a proposal, not a guaranteed mutation: read the returned status per step — RUNNING/COMPLETED means it actually went through (check the step's own result before claiming success); " +
      "AWAITING_APPROVAL means a human must approve before anything happens — tell the user that, don't claim it's done; FAILED means it did not happen; COMPENSATED means a later step failed and every earlier completed step in this same call was automatically reversed.",
    parameters: z.object({
      // JSON-encoded, not a nested object schema: an arbitrary-keys object
      // (z.record) can't satisfy OpenAI's strict Structured Outputs mode
      // (every object schema must set additionalProperties: false, which a
      // per-action field set can't declare ahead of time).
      stepsJson: z.string().describe(
        "One or more steps to run as ONE atomic plan, as a JSON array: "
        + "[{\"domain\": \"task\", \"actionName\": \"task.complete\", \"args\": {...}}, ...]. "
        + "domain/actionName come from list_available_business_actions; args are that action's required fields.",
      ),
    }),
    async execute(input) {
      const steps = parseOrchestrationSteps(input.stepsJson);
      if (!steps) {
        return resolvedEvidence({ factScope: "actions.execution", data: { error: "stepsJson must be a non-empty JSON array of {domain, actionName, args} steps." }, source: "executive-orchestration" });
      }
      const view = await runOrchestration({
        auth: runContext.authContext,
        triggerUtterance: `executive_agent:${randomUUID()}`,
        plan: { steps: steps.map((step) => ({ domain: step.domain, actionName: step.actionName, argsTemplate: step.args })) },
      });
      return resolvedEvidence({ factScope: "actions.execution", data: view, source: "executive-orchestration" });
    },
  });
}
