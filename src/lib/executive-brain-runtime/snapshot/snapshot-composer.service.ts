import type {
  SnapshotComposerInput,
  SnapshotComposerResult,
  ExecutiveBrainSnapshot,
  ExecutiveBrainSnapshotStatus,
} from "./snapshot.types";
import type { ExecutiveExecutionContext } from "../executive-adapter/execution-context.types";

function computeStatus(
  ctx: ExecutiveExecutionContext | null,
  modulesRun: SnapshotComposerInput["modulesRun"],
): ExecutiveBrainSnapshotStatus {
  if (modulesRun.length === 0) return "empty";
  if (ctx?.executiveReasoning) return "fresh";
  return "partial";
}

/**
 * composeExecutiveBrainSnapshot — ExecutionContext typed field'larından snapshot üretir.
 *
 * Alan kaynakları:
 *   - userIntentSummary       ← ctx.conversationUnderstanding.reasoning.summary
 *   - situationSummary        ← ctx.executiveContext.situationSummary
 *   - companySituationSummary ← ctx.companyModel (industry + growthPhase)
 *   - currentExecutiveOpinion ← ctx.executiveReasoning.summary
 *   - topRisk                 ← ctx.executiveReasoning.risks[0]?.title
 *   - topPriority             ← ctx.executiveReasoning.priorities[0]?.title
 *   - recommendedAction       ← ctx.recommendedNextMove.title
 *   - confidence              ← ctx.executiveReasoning.confidence
 *
 * Bilinçli null bırakılan alanlar:
 *   - openDecisionsSummary  → decision-loop bu fazda stub
 *   - commitmentsSummary    → bu fazda adapter yok
 *   - learningSummary       → learning-loop bu fazda stub
 *   - staleReason           → staleness composer'ın sorumluluğu değil
 */
export function composeExecutiveBrainSnapshot(
  input: SnapshotComposerInput,
): SnapshotComposerResult {
  if (input.updateMode === "skip" && input.previousSnapshot !== null) {
    return { snapshot: input.previousSnapshot, mergedFields: [], skippedFields: [] };
  }

  const ctx = input.executionContext;

  const userIntentSummary       = ctx?.conversationUnderstanding?.reasoning.summary ?? null;
  const situationSummary        = ctx?.executiveContext?.situationSummary ?? null;
  const companySituationSummary = ctx?.companyModel
    ? `${ctx.companyModel.industry ?? "unknown"}, ${ctx.companyModel.growthPhase}`
    : null;
  const currentExecutiveOpinion = ctx?.executiveReasoning?.summary ?? null;
  const topRisk                 = ctx?.executiveReasoning?.risks[0]?.title ?? null;
  const topPriority             = ctx?.executiveReasoning?.priorities[0]?.title ?? null;
  const recommendedAction       = ctx?.recommendedNextMove?.title ?? null;

  const candidates: [string, string | null][] = [
    ["userIntentSummary",       userIntentSummary],
    ["situationSummary",        situationSummary],
    ["companySituationSummary", companySituationSummary],
    ["currentExecutiveOpinion", currentExecutiveOpinion],
    ["topRisk",                 topRisk],
    ["topPriority",             topPriority],
    ["recommendedAction",       recommendedAction],
  ];

  const mergedFields: string[] = [];
  const skippedFields: string[] = [];
  for (const [name, value] of candidates) {
    if (value !== null) mergedFields.push(name);
    else skippedFields.push(name);
  }
  skippedFields.push("openDecisionsSummary", "commitmentsSummary", "learningSummary");

  const snapshot: ExecutiveBrainSnapshot = {
    status: computeStatus(ctx, input.modulesRun),
    generatedAt: new Date().toISOString(),
    sourceMessageId: input.messageId,
    currentExecutiveOpinion,
    situationSummary,
    userIntentSummary,
    companySituationSummary,
    topPriority,
    topRisk,
    recommendedAction,
    openDecisionsSummary: null,
    commitmentsSummary: null,
    learningSummary: null,
    confidence: ctx?.executiveReasoning?.confidence ?? 0,
    staleReason: null,
    lastSignals: input.signals,
    lastModulesRun: input.modulesRun,
    workerError: null,
  };

  return { snapshot, mergedFields, skippedFields };
}
