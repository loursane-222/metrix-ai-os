import type {
  ConfidenceLevel,
  SuggestedHandling,
  UserMotivation,
} from "@/lib/conversation-understanding";
import type {
  CoreExecutionMode,
  CoreExecutionStrategy,
} from "@/lib/executive-request-resolution";

/**
 * Canonical Executive Orchestrator artifact for one turn.
 *
 * It records the management need and intervention boundary already supported
 * by upstream understanding/assessment. It is not reasoning, a planner,
 * capability/tool selection, behavior, conversation copy, or execution.
 */
export type ExecutiveDirectiveV1 = Readonly<{
  schemaVersion: "1.0";
  source:
    | "conversation_understanding"
    | "conversation_understanding_and_assessment";
  primaryIntent: UserMotivation;
  interventionLevel: SuggestedHandling;
  authorityMode: Extract<
    CoreExecutionMode,
    "RESPONSE_ONLY" | "READ_ONLY" | "DRAFT" | "DEFERRED" | "CLARIFICATION"
  >;
  actionStrategy: Extract<
    CoreExecutionStrategy,
    "ANSWER" | "READ" | "ANALYZE" | "WORKFLOW"
  > | null;
  confirmationPolicy: "NONE" | "CONFIRM_BEFORE_ACTION";
  reasoningMode: "DETERMINISTIC" | "ASSESSMENT_INFORMED";
  requiresExecutiveReasoning: boolean;
  confidence: ConfidenceLevel;
}>;
