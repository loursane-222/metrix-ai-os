import type { ExecutivePresenceSurface } from "@/lib/ai/identity/executive-identity-prompt";

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
