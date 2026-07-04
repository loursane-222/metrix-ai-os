export type CommitmentOutcome = "SUCCESS" | "FAILURE" | "ABANDONED";

export type ConversationPhase =
  | "INITIAL"
  | "RECOMMENDATION_GIVEN"
  | "OBJECTION_HANDLED"
  | "CLARIFYING"
  | "ALTERNATIVE_OFFERED"
  | "COMMITTED"
  | "REVISED"
  | "OPEN_ENDED";

/**
 * Unified conversation state carried in Message.metadata.conversationState.
 *
 * This is intentionally kept as a single flat object for backward-compatible
 * DB serialization. A structural split into separate sub-types is deferred
 * (see FAZ 4A audit) — use the Pick utility types below for layer-specific
 * consumption.
 *
 * Logical ownership:
 *  - @ownership executive-brain-owned   → phase transition fields computed by
 *    executive-conversation-engine.service. These drive the LLM prompt and
 *    state machine logic.
 *  - @ownership decision-loop-integration → commitment fields computed by
 *    executive-commitment-engine.service but consumed by the chat route to
 *    trigger decision registration. Executive brain sets them; chat layer reads
 *    them.
 *  - @ownership conversation-metadata   → technical bookkeeping (timestamps).
 */
export type ExecutiveConversationState = {
  // ── Phase State ─────────────────────────────────────────────────────────────
  /** @ownership executive-brain-owned */
  phase: ConversationPhase;
  /** @ownership executive-brain-owned */
  lastRecommendationTitle: string | null;
  /** @ownership executive-brain-owned */
  lastRecommendationRationale: string | null;
  /** @ownership executive-brain-owned */
  lastObjectionType: string | null;
  /** @ownership executive-brain-owned */
  objectionCount: number;
  /** @ownership executive-brain-owned */
  clarifyingQuestion: string | null;
  /** @ownership executive-brain-owned */
  commitmentRequest: string | null;
  /** @ownership executive-brain-owned */
  isRevisionRequired: boolean;

  // ── Decision Integration ─────────────────────────────────────────────────────
  /** @ownership decision-loop-integration */
  committedTitle: string | null;
  /** @ownership decision-loop-integration */
  committedAt: string | null;
  /** @ownership decision-loop-integration */
  followUpDueAt: string | null;
  /** @ownership decision-loop-integration */
  commitmentOutcome: CommitmentOutcome | null;

  // ── Metadata ─────────────────────────────────────────────────────────────────
  /** @ownership conversation-metadata */
  updatedAt: string;
};

/**
 * Phase-transition fields owned exclusively by executive-brain.
 * Safe to pass into executive-conversation-engine without chat-layer concerns.
 */
export type ExecutiveConversationPhaseState = Pick<
  ExecutiveConversationState,
  | "phase"
  | "lastRecommendationTitle"
  | "lastRecommendationRationale"
  | "lastObjectionType"
  | "objectionCount"
  | "clarifyingQuestion"
  | "commitmentRequest"
  | "isRevisionRequired"
>;

/**
 * Decision-tracking fields consumed by the chat route to register commitments
 * and outcomes in the decision loop. Computed by executive-brain but read by
 * the chat layer.
 */
export type ExecutiveConversationDecisionIntegration = Pick<
  ExecutiveConversationState,
  "committedTitle" | "committedAt" | "followUpDueAt" | "commitmentOutcome"
>;

/**
 * Technical bookkeeping fields not tied to either executive-brain or
 * decision-loop logic.
 */
export type ExecutiveConversationMetadataState = Pick<
  ExecutiveConversationState,
  "updatedAt"
>;

export type ExecutiveObjectionType =
  | "BUDGET_CONSTRAINT"
  | "TIME_CONSTRAINT"
  | "TEAM_CONSTRAINT"
  | "ALTERNATIVE_REQUEST"
  | "REJECTION"
  | "NEW_INFORMATION";

export type ExecutiveRecommendationAlternative = {
  title: string;
  rationale: string;
  tradeoff: string;
  whenToChoose: string;
  actions: string[];
};

export type ExecutiveRecommendationPackage = {
  primaryAction: string;
  primaryRationale: string;
  primaryConfidenceLabel: "GÜÇLÜ" | "ORTA" | "TEMKİNLİ";
  primaryEvidence: string[];
  alternatives: ExecutiveRecommendationAlternative[];
  objectionType: ExecutiveObjectionType | null;
  objectionResponse: string | null;
  nextBestAlternative: string | null;
  revisionTrigger: string;
  hasEnoughContext: boolean;
};
