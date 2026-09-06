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
import { actionRegistry } from "@/lib/action-runtime/registry";
import { runOrchestration } from "@/lib/executive-orchestration/executive-orchestration.service";
import { resolveEntityReference, ENTITY_REFERENCE_FIELDS } from "@/lib/executive-orchestration/entity-resolvers";
import { isStepReference } from "@/lib/executive-orchestration/executive-orchestration.types";
import { findPatchProvenanceViolation, verifyValueProvenance } from "./write-argument-provenance";
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

// Mirrors general-plan-resolver.ts's own per-field resolution loop exactly
// (same ENTITY_REFERENCE_FIELDS map, same resolveEntityReference call) —
// the shared invariant is enforced by reusing the SAME function, not by
// reimplementing resolution logic a second time. A {"$stepRef": N} value
// is left untouched (it names an earlier step's not-yet-created entity;
// resolveStepArgs substitutes it later, at actual execution time).
async function resolveStepEntityReferences(
  steps: RawOrchestrationStep[],
  organizationId: string,
): Promise<{ ok: true; steps: RawOrchestrationStep[] } | { ok: false; error: Record<string, unknown> }> {
  const resolvedSteps: RawOrchestrationStep[] = [];
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex]!;
    const resolvedArgs: Record<string, unknown> = {};
    for (const [fieldName, value] of Object.entries(step.args)) {
      // A $stepRef value arrives as a nested object ({"$stepRef": N}), never
      // a string — typeof already routes it into the pass-through branch
      // below; isStepReference is checked too only so this stays correct
      // even if a caller ever passes it pre-stringified.
      const domain = ENTITY_REFERENCE_FIELDS[fieldName];
      if (!domain || typeof value !== "string" || isStepReference(value)) {
        resolvedArgs[fieldName] = value;
        continue;
      }
      const resolution = await resolveEntityReference(domain, organizationId, value);
      if (resolution.status !== "RESOLVED") {
        return {
          ok: false,
          error: {
            status: "ENTITY_REFERENCE_UNRESOLVED",
            step: stepIndex + 1,
            actionName: step.actionName,
            field: fieldName,
            reference: value,
            resolution,
          },
        };
      }
      resolvedArgs[fieldName] = resolution.id;
    }
    resolvedSteps.push({ domain: step.domain, actionName: step.actionName, args: resolvedArgs });
  }
  return { ok: true, steps: resolvedSteps };
}

// Stage 1 Production Reliability Closure — write-argument authority.
// Proven live: a customer's phone number from ~20 turns earlier was used
// as the "new" value for "Bu müşterinin telefonunu değiştir." (no number
// given this turn). Semantic context (which entity — activeWorkspaceContext,
// resolveStepEntityReferences above) is legitimately derived from wherever
// the conversation establishes it; a mutation's actual NEW VALUE is a
// stricter authority that may only come from this turn's own message.
//
// Scope, deliberately kept small and field-NAME-keyed — the same pattern
// ENTITY_REFERENCE_FIELDS already uses, not a second per-action registry:
// - Entity-reference fields (ENTITY_REFERENCE_FIELDS) are skipped here —
//   by this point they are already a resolved, real id, not a user-typed
//   value; resolveStepEntityReferences above is their own authority check.
// - A small set of plumbing fields (WRITE_PROVENANCE_EXEMPT_FIELDS) that
//   are never something the user "says" — a version stamp read back from
//   the database, an idempotency key, a boolean flag — have nothing to
//   verify provenance for.
// - dueDate/startAt/endAt are deliberately exempt too: they are ALREADY
//   protected by their own deterministic resolver tools (resolve_calendar_expression,
//   resolve_relative_due_date — see constitution.ts's own "never invent an
//   absolute date" rule), whose computed ISO output legitimately does not
//   appear verbatim in the user's raw text. That is a different, already-
//   solved provenance path, not something this generic text-matching check
//   can safely re-verify — flagged here explicitly, not silently dropped.
// - Enum-typed fields (e.g. task.priority, quote lifecycle status) are
//   exempt for the same reason: their value is a short internal code the
//   model maps from the user's own words ("kazanıldı" -> "WON"), not a
//   verbatim copy this text-matching check could ever recognize. This is
//   derived from the action's REAL, already-existing manifest schema
//   (actionRegistry.getActionDefinition(...).inputSchema[field].type ===
//   "enum") — not a hand-maintained field-name list, and not a second
//   registry.
//
// Every OTHER string/number argument — on any action, not just ones using
// the `patch: { type: "json" }` convention — is checked the same way
// patch leaves already were, closing the gap the previous version of this
// check had (only patch-shaped update actions were covered; a create
// action's plain top-level fields, e.g. payment.create's `amount` or
// task.create's `title`, were not).
const WRITE_PROVENANCE_EXEMPT_FIELDS = new Set([
  "expectedVersion", "idempotencyKey", "originatingDraftId", "originatingContextVersion",
  "autoDispatch", "allowConflict", "dueDate", "startAt", "endAt",
]);

function isEnumField(actionName: string, fieldName: string): boolean {
  if (!actionRegistry.hasAction(actionName)) return false;
  return actionRegistry.getActionDefinition(actionName).inputSchema[fieldName]?.type === "enum";
}

function findWriteArgumentProvenanceViolation(
  steps: RawOrchestrationStep[],
  currentTurnMessage: string,
): Record<string, unknown> | null {
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex]!;
    for (const [fieldName, value] of Object.entries(step.args)) {
      if (ENTITY_REFERENCE_FIELDS[fieldName] || WRITE_PROVENANCE_EXEMPT_FIELDS.has(fieldName)) continue;
      if (fieldName === "patch" && value && typeof value === "object" && !Array.isArray(value)) {
        const violation = findPatchProvenanceViolation(value as Record<string, unknown>, currentTurnMessage);
        if (violation) {
          return { status: "WRITE_VALUE_PROVENANCE_UNVERIFIED", step: stepIndex + 1, actionName: step.actionName, field: violation.field, value: violation.value };
        }
        continue;
      }
      if (typeof value !== "string" && typeof value !== "number") continue;
      if (isStepReference(value)) continue;
      if (isEnumField(step.actionName, fieldName)) continue;
      if (!verifyValueProvenance(value, currentTurnMessage)) {
        return { status: "WRITE_VALUE_PROVENANCE_UNVERIFIED", step: stepIndex + 1, actionName: step.actionName, field: fieldName, value };
      }
    }
  }
  return null;
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
      // Stage 1 Production Reliability Closure: proven live (delivery.createFromOrder
      // NOT_FOUND for a real, existing order; payment.create NOT_FOUND for a
      // real, existing customer — both by-label references the Agent itself
      // supplies, since it has no reason to know a real cuid). Root cause:
      // this tool used to hand args straight to runOrchestration with zero
      // entity-reference resolution — that resolution only ever existed in
      // general-plan-resolver.ts (a separate, older orchestration path this
      // tool never called). Same shared entity-resolvers.ts map/function
      // general-plan-resolver.ts already uses, applied here too, so the SAME
      // canonical reference resolves to the SAME authoritative entity
      // regardless of which path executes the action — not a per-domain
      // patch.
      const resolvedStepsResult = await resolveStepEntityReferences(steps, runContext.organizationId);
      if (!resolvedStepsResult.ok) {
        return resolvedEvidence({ factScope: "actions.execution", data: resolvedStepsResult.error, source: "entity-resolvers" });
      }
      const provenanceViolation = findWriteArgumentProvenanceViolation(resolvedStepsResult.steps, runContext.currentTurnMessage);
      if (provenanceViolation) {
        return resolvedEvidence({ factScope: "actions.execution", data: provenanceViolation, source: "write-argument-provenance" });
      }
      const view = await runOrchestration({
        auth: runContext.authContext,
        triggerUtterance: `executive_agent:${randomUUID()}`,
        plan: { steps: resolvedStepsResult.steps.map((step) => ({ domain: step.domain, actionName: step.actionName, argsTemplate: step.args })) },
      });
      return resolvedEvidence({ factScope: "actions.execution", data: view, source: "executive-orchestration" });
    },
  });
}
