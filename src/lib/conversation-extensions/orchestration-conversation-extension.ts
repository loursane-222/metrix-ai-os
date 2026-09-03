import type { ConversationExtension } from "./conversation-extension-contract";
import { orchestrationHandoff, CONVERSATION_EXTENSION_DOMAINS, type ConversationExtensionDomain, type ConversationExtensionHandoff } from "./conversation-extension-handoff";
import { requestOrchestrationPlanAndRun, type OrchestrationView } from "@/lib/executive-orchestration/executive-orchestration-client";
import { getActiveConversationId } from "./active-conversation-session";

// This extension is registered LAST in active-conversation-extension.ts's
// array on purpose — every other, more specific extension (customer-edit,
// order-management, ...) gets first refusal on an utterance. This one is
// the general-purpose fallback: it only ever sees an utterance that NOTHING
// more specific already handled. There used to be a hand-enumerated verb
// pre-filter here (ACTION_VERB_STEM) to avoid spending an LLM call on
// obviously non-action turns — removed deliberately: it silently excluded
// any verb form not anticipated (e.g. "yap", "olsun"), which meant a real,
// executable UPDATE/CREATE utterance using one of those forms never reached
// this fallback at all and fell through to free-text narration instead. The
// real, correct classification (is this actually a real, executable plan
// against METRIX's own action catalog, or unsupported) already happens
// entirely inside general-plan-resolver.ts's own LLM prompt — a regex in
// front of it duplicated and undermined that, incompletely. Every unclaimed
// utterance now reaches the real classifier; the resolver itself returns
// NOT_HANDLED cheaply for genuine non-action turns.
// Action Runtime's own naming convention (see registry/manifests/*.actions.ts
// — "customer.update", "supplier.create", ...) already carries the real
// operation; deriving from it here (only for the single-step case that
// actually reaches lastSuccessfulOperationContext) avoids the fallback
// handoff below defaulting every completed orchestration to CREATE
// regardless of what actually ran. Anything not recognized as create/update
// stays UNKNOWN — never guessed as CREATE.
function deriveOperationFromActionName(actionName: string): ConversationExtensionHandoff["operation"] {
  if (actionName.endsWith(".create")) return "CREATE";
  if (actionName.endsWith(".update")) return "UPDATE";
  return "UNKNOWN";
}

function resolvedSingleStepEntity(orchestration: OrchestrationView): { entityId: string; entityDomain: ConversationExtensionDomain; operation: ConversationExtensionHandoff["operation"] } | null {
  if (orchestration.steps.length !== 1) return null;
  const step = orchestration.steps[0]!;
  if (step.status !== "COMPLETED" || !step.resultEntityId) return null;
  const domain = (CONVERSATION_EXTENSION_DOMAINS as readonly string[]).includes(step.domain) ? (step.domain as ConversationExtensionDomain) : null;
  if (!domain) return null;
  return { entityId: step.resultEntityId, entityDomain: domain, operation: deriveOperationFromActionName(step.actionName) };
}

export const orchestrationConversationExtension: ConversationExtension = {
  // Not surface-scoped — see payment-reminder-conversation-extension.ts for
  // why this must return a non-null key rather than unconditional null.
  getActiveScopeKey() { return typeof window === "undefined" ? null : `orchestration:${window.location.pathname}`; },
  async execute(utterance) {
    const text = utterance.trim();

    const outcome = await requestOrchestrationPlanAndRun(text, getActiveConversationId());

    if (outcome.status === "NOT_HANDLED") return { status: "NOT_HANDLED", handoff: null };

    if (outcome.status === "PLAN_INVALID") {
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: "CREATE",
          outcomeCode: "ORCHESTRATION_PLAN_INVALID",
          resultStatus: "FAILED",
          entityResolution: "NOT_REQUIRED",
        }),
      };
    }

    if (outcome.status === "CLARIFICATION_REQUIRED") {
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: "QUERY",
          outcomeCode: "ORCHESTRATION_CLARIFICATION_NEEDED",
          resultStatus: "CLARIFICATION_REQUIRED",
          entityResolution: "UNKNOWN",
        }),
      };
    }

    if (outcome.status === "REQUEST_FAILED") {
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: "CREATE",
          outcomeCode: "ORCHESTRATION_REQUEST_FAILED",
          resultStatus: "FAILED",
          entityResolution: "NOT_REQUIRED",
        }),
      };
    }

    const { orchestration } = outcome;

    if (orchestration.status === "COMPLETED") {
      // resultStatus EXECUTED + mutationPerformed already produces an
      // accurate deterministic confirmation ("İşlemi tamamladım.") — no
      // custom prompt guidance needed for this branch.
      // Single-step plans (the common one-intent case) carry the real
      // entity id/domain from the orchestration engine's own step result
      // (already populated for $stepN cross-step references — reused here,
      // not recomputed) so lastSuccessfulOperationContext works for ANY
      // domain that reaches Action Runtime through this shared fallback,
      // not just the domains with their own conversation-extension
      // coordinator. Multi-step plans are left without a single resolved
      // entity — deliberately ambiguous, never guessed.
      const resolvedEntity = resolvedSingleStepEntity(orchestration);
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: resolvedEntity?.operation ?? "CREATE",
          outcomeCode: "ORCHESTRATION_COMPLETED",
          resultStatus: "EXECUTED",
          entityResolution: "RESOLVED",
          mutationPerformed: true,
          entityId: resolvedEntity?.entityId ?? null,
          entityDomain: resolvedEntity?.entityDomain ?? null,
        }),
      };
    }

    if (orchestration.status === "AWAITING_APPROVAL") {
      // resultStatus APPROVAL_REQUIRED already produces an accurate
      // deterministic message ("onayınızı bekliyorum") — no custom prompt
      // guidance needed. The user's next confirming utterance ("evet",
      // "onaylıyorum", ...) is picked up by
      // orchestration-approval-conversation-extension.ts, which resumes
      // this exact orchestration by id.
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: "CREATE",
          outcomeCode: "ORCHESTRATION_AWAITING_APPROVAL",
          resultStatus: "APPROVAL_REQUIRED",
          entityResolution: "RESOLVED",
        }),
      };
    }

    if (orchestration.status === "FAILED") {
      // resultStatus FAILED already produces an accurate, generic
      // deterministic message — no custom prompt guidance needed.
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: "CREATE",
          outcomeCode: "ORCHESTRATION_FAILED",
          resultStatus: "FAILED",
          entityResolution: "RESOLVED",
        }),
      };
    }

    if (orchestration.status === "COMPENSATED") {
      // The plan failed but every already-COMPLETED step was successfully
      // reversed — a clean, definite outcome (not full success, but not an
      // ambiguous partial state either). No accurate deterministic
      // template exists for this yet, so the model follows this domain's
      // own outcomeCode-specific prompt guidance in route.ts.
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: "CREATE",
          outcomeCode: "ORCHESTRATION_COMPENSATED",
          resultStatus: "FAILED",
          entityResolution: "RESOLVED",
        }),
      };
    }

    if (orchestration.status === "COMPENSATION_FAILED") {
      // The plan failed AND the automatic reversal of earlier steps itself
      // failed — this must be surfaced loudly (a human needs to check the
      // affected records), never hidden behind a generic failure message.
      return {
        status: "HANDOFF",
        handoff: orchestrationHandoff({
          operation: "CREATE",
          outcomeCode: "ORCHESTRATION_COMPENSATION_FAILED",
          resultStatus: "FAILED",
          entityResolution: "RESOLVED",
        }),
      };
    }

    // PARTIALLY_COMPLETED has no accurate deterministic template
    // (buildUniversalHandoffMessage only knows full success or full
    // failure) — resultStatus OBSERVED + empty candidateNames deliberately
    // falls through to null there, so the model instead follows this
    // domain's own outcomeCode-specific prompt guidance in route.ts.
    // Reachable only for orchestration rows written before compensation
    // existed (see the enum comment in schema.prisma) — no current code
    // path produces this status anymore.
    return {
      status: "HANDOFF",
      handoff: orchestrationHandoff({
        operation: "CREATE",
        outcomeCode: "ORCHESTRATION_PARTIALLY_COMPLETED",
        resultStatus: "OBSERVED",
        entityResolution: "RESOLVED",
      }),
    };
  },
};
