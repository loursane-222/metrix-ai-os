import type { ExecutivePresenceSurface } from "@/lib/ai/identity/executive-identity-prompt";

/**
 * Canonical, deterministic conversation-behavior authority for one turn.
 * It realizes an already-resolved understanding; it does not create intent,
 * select tools/actions, perform reasoning, or contain response copy.
 */
export type ExecutiveBehaviorPlanV1 = Readonly<{
  schemaVersion: "1.0";
  source: "conversation_understanding";
  primaryBehavior:
    | "LISTEN"
    | "EXPLORE"
    | "CLARIFY"
    | "EXPLAIN"
    | "GUIDE"
    | "CHALLENGE"
    | "PROTECT"
    | "SUPPORT"
    | "ACT_WITH_USER"
    | "CONFIRM"
    | "WAIT"
    | "OBSERVE"
    | "FOLLOW_UP"
    | "RECOVER"
    | "CLOSE";
  interactionPosture:
    | "CALM"
    | "DIRECT"
    | "SUPPORTIVE"
    | "FIRM"
    | "CURIOUS"
    | "PROTECTIVE"
    | "REFLECTIVE"
    | "ACCOUNTABLE";
  questionPolicy:
    | "NONE"
    | "SINGLE_NECESSARY_QUESTION"
    | "PROGRESSIVE_CLARIFICATION"
    | "CONFIRM_UNDERSTANDING"
    | "DECISION_QUESTION";
  explanationPolicy: "NONE" | "BRIEF" | "FOCUSED" | "COMPARATIVE" | "STEPWISE" | "DEEP";
  challengePolicy:
    | "NONE"
    | "GENTLE_ALTERNATIVE"
    | "CLEAR_DISAGREEMENT"
    | "STRONG_OBJECTION"
    | "BLOCK_UNSAFE_ACTION";
  pacingIntent: "IMMEDIATE" | "CONCISE" | "MEASURED" | "DELIBERATE" | "WAITING";
  requiresExecutiveReasoning: boolean;
  confidence: "LOW" | "MEDIUM" | "HIGH";
}>;

export type LivingConversationMode =
  | "casual"
  | "personal"
  | "emotional"
  | "business"
  | "operational"
  | "decision"
  | "capability"
  | "self_identity"
  | "repair";

export type LivingExecutiveSemanticIntent =
  | "social_exchange"
  | "business_context"
  | "decision_support"
  | "operational_request";

export type LivingExecutiveSemanticHint = Readonly<{
  intent: LivingExecutiveSemanticIntent;
  confidence: "low" | "medium" | "high";
}>;

export type LivingBehaviorProfile = Readonly<{
  authorityId: "living-executive-presence-runtime";
  mode: LivingConversationMode;
  surface: ExecutivePresenceSurface;
  tone: "calm_mature" | "calm_human";
  ownership: "company_insider";
  directness: "direct" | "measured";
  warmth: "reserved" | "warm";
  assertiveness: "low" | "balanced" | "decisive";
  responseDensity: "brief" | "compact" | "substantive";
  questioning: "none" | "critical_single";
  recommendation: "none" | "reasoned_judgment" | "action_posture";
  disagreement: "calm_when_warranted";
  selfReference: "only_when_asked" | "identity_answer";
  capabilityExpression: "not_applicable" | "bounded_operational_scope";
  businessRedirection: "never_force" | "follow_user_intent";
  formatting: "natural_prose" | "spoken_plain_text";
  continuity: "preserve_character" | "preserve_without_reintroduction";
}>;

export type LivingBehaviorViolation =
  | "generic_assistant_register"
  | "external_advisor_register"
  | "casual_forced_to_business"
  | "self_identity_lost"
  | "capability_absolute_denial"
  | "capability_unbounded_claim"
  | "repair_mechanism_exposed"
  | "voice_report_format"
  | "unnecessary_identity_repetition";

export type LivingBehaviorValidationResult =
  | Readonly<{ valid: true; violation: null }>
  | Readonly<{ valid: false; violation: LivingBehaviorViolation }>;

export type LivingRepairGuidance = Readonly<{
  violation: LivingBehaviorViolation;
  instruction: string;
}>;
