import type { ExecutiveObjectionSignal, ExecutiveObjectionType } from "./executive-recommendation.types";
import type { ExecutiveRecommendationPackage } from "./executive-recommendation.types";
import type { ConversationSignalType, ConversationPhase, ExecutiveConversationState } from "./executive-conversation.types";
import type { CommitmentOutcomeSignal } from "./executive-commitment.types";
import { buildCommitmentTracking } from "./executive-commitment-engine.service";
import type {
  ExecutiveMindState,
  ExecutiveMindWorkingMemoryItem,
  ExecutiveMindHypothesis,
  ExecutiveMindBelief,
} from "@/lib/ai/executive-conversation.types";

export type BuildConversationStateInput = {
  previousState: ExecutiveConversationState | null;
  conversationSignal: { type: ConversationSignalType; confidence: number } | null;
  objectionSignal: ExecutiveObjectionSignal | null;
  outcomeSignal: CommitmentOutcomeSignal | null;
  recommendationPackage: ExecutiveRecommendationPackage | null;
};

const STRONG_COMMITMENT_TYPES: ConversationSignalType[] = ["COMMITMENT"];

export function buildExecutiveConversationState(
  input: BuildConversationStateInput,
): ExecutiveConversationState {
  const { previousState, conversationSignal, objectionSignal, outcomeSignal, recommendationPackage } = input;
  const now = new Date().toISOString();

  const lastRecommendationTitle =
    recommendationPackage?.primaryAction ??
    previousState?.lastRecommendationTitle ??
    null;

  const lastRecommendationRationale =
    recommendationPackage?.primaryRationale ??
    previousState?.lastRecommendationRationale ??
    null;

  const previousObjCount = previousState?.objectionCount ?? 0;

  // Outcome sinyali tüm diğer sinyallere göre öncelikli
  if (outcomeSignal) {
    const commitment = buildCommitmentTracking({
      previousState,
      conversationSignal: null,
      outcomeSignal,
      resolvedCommittedTitle: lastRecommendationTitle,
    });
    return {
      phase: "COMMITTED",
      lastRecommendationTitle,
      lastRecommendationRationale,
      lastObjectionType: previousState?.lastObjectionType ?? null,
      objectionCount: previousObjCount,
      clarifyingQuestion: null,
      commitmentRequest: null,
      isRevisionRequired: false,
      ...commitment,
      updatedAt: now,
    };
  }

  if (objectionSignal) {
    const phase = resolveObjectionPhase(objectionSignal.type, previousState);
    const commitment = buildCommitmentTracking({
      previousState,
      conversationSignal: null,
      outcomeSignal: null,
      resolvedCommittedTitle: lastRecommendationTitle,
    });
    return {
      phase,
      lastRecommendationTitle,
      lastRecommendationRationale,
      lastObjectionType: objectionSignal.type,
      objectionCount: previousObjCount + 1,
      clarifyingQuestion: null,
      commitmentRequest: null,
      isRevisionRequired: false,
      ...commitment,
      updatedAt: now,
    };
  }

  if (conversationSignal) {
    const signalType = conversationSignal.type;

    if (STRONG_COMMITMENT_TYPES.includes(signalType)) {
      const commitment = buildCommitmentTracking({
        previousState,
        conversationSignal,
        outcomeSignal: null,
        resolvedCommittedTitle: lastRecommendationTitle,
      });
      return {
        phase: "COMMITTED",
        lastRecommendationTitle,
        lastRecommendationRationale,
        lastObjectionType: previousState?.lastObjectionType ?? null,
        objectionCount: previousObjCount,
        clarifyingQuestion: null,
        commitmentRequest: buildCommitmentRequest(lastRecommendationTitle),
        isRevisionRequired: false,
        ...commitment,
        updatedAt: now,
      };
    }

    if (signalType === "UNCERTAINTY") {
      const commitment = buildCommitmentTracking({
        previousState,
        conversationSignal: null,
        outcomeSignal: null,
        resolvedCommittedTitle: lastRecommendationTitle,
      });
      return {
        phase: "CLARIFYING",
        lastRecommendationTitle,
        lastRecommendationRationale,
        lastObjectionType: previousState?.lastObjectionType ?? null,
        objectionCount: previousObjCount,
        clarifyingQuestion: buildClarifyingQuestion(lastRecommendationTitle, previousState),
        commitmentRequest: null,
        isRevisionRequired: false,
        ...commitment,
        updatedAt: now,
      };
    }

    if (signalType === "NEW_INFORMATION") {
      const commitment = buildCommitmentTracking({
        previousState,
        conversationSignal: null,
        outcomeSignal: null,
        resolvedCommittedTitle: lastRecommendationTitle,
      });
      return {
        phase: "REVISED",
        lastRecommendationTitle,
        lastRecommendationRationale,
        lastObjectionType: previousState?.lastObjectionType ?? null,
        objectionCount: previousObjCount,
        clarifyingQuestion: null,
        commitmentRequest: null,
        isRevisionRequired: true,
        ...commitment,
        updatedAt: now,
      };
    }

    if (signalType === "REJECTION") {
      const commitment = buildCommitmentTracking({
        previousState,
        conversationSignal: null,
        outcomeSignal: null,
        resolvedCommittedTitle: lastRecommendationTitle,
      });
      return {
        phase: "ALTERNATIVE_OFFERED",
        lastRecommendationTitle,
        lastRecommendationRationale,
        lastObjectionType: null,
        objectionCount: previousObjCount,
        clarifyingQuestion: null,
        commitmentRequest: null,
        isRevisionRequired: false,
        ...commitment,
        updatedAt: now,
      };
    }

    if (signalType === "ACCEPTANCE") {
      const commitment = buildCommitmentTracking({
        previousState,
        conversationSignal: null,
        outcomeSignal: null,
        resolvedCommittedTitle: lastRecommendationTitle,
      });
      return {
        phase: "RECOMMENDATION_GIVEN",
        lastRecommendationTitle,
        lastRecommendationRationale,
        lastObjectionType: previousState?.lastObjectionType ?? null,
        objectionCount: previousObjCount,
        clarifyingQuestion: null,
        commitmentRequest: buildSoftCommitmentRequest(lastRecommendationTitle),
        isRevisionRequired: false,
        ...commitment,
        updatedAt: now,
      };
    }

    if (signalType === "OPEN_ENDED") {
      const commitment = buildCommitmentTracking({
        previousState,
        conversationSignal: null,
        outcomeSignal: null,
        resolvedCommittedTitle: lastRecommendationTitle,
      });
      return {
        phase: "OPEN_ENDED",
        lastRecommendationTitle,
        lastRecommendationRationale,
        lastObjectionType: previousState?.lastObjectionType ?? null,
        objectionCount: previousObjCount,
        clarifyingQuestion: null,
        commitmentRequest: null,
        isRevisionRequired: false,
        ...commitment,
        updatedAt: now,
      };
    }
  }

  const phase: ConversationPhase = recommendationPackage?.hasEnoughContext
    ? "RECOMMENDATION_GIVEN"
    : previousState?.phase ?? "INITIAL";

  const commitment = buildCommitmentTracking({
    previousState,
    conversationSignal: null,
    outcomeSignal: null,
    resolvedCommittedTitle: lastRecommendationTitle,
  });

  return {
    phase,
    lastRecommendationTitle,
    lastRecommendationRationale,
    lastObjectionType: previousState?.lastObjectionType ?? null,
    objectionCount: previousObjCount,
    clarifyingQuestion: null,
    commitmentRequest: null,
    isRevisionRequired: false,
    ...commitment,
    updatedAt: now,
  };
}

function resolveObjectionPhase(
  objectionType: ExecutiveObjectionType,
  previousState: ExecutiveConversationState | null,
): ConversationPhase {
  if (objectionType === "ALTERNATIVE_REQUEST") return "ALTERNATIVE_OFFERED";
  if (objectionType === "REJECTION") return "ALTERNATIVE_OFFERED";
  const prevCount = previousState?.objectionCount ?? 0;
  if (prevCount >= 2) return "OPEN_ENDED";
  return "OBJECTION_HANDLED";
}

function buildClarifyingQuestion(
  lastTitle: string | null,
  previousState: ExecutiveConversationState | null,
): string {
  if (previousState?.lastObjectionType === "BUDGET_CONSTRAINT") {
    return "Bütçe kısıtını netleştirelim: şu an için bütçe yok mu, yoksa bu ay mı zor?";
  }
  if (previousState?.lastObjectionType === "TIME_CONSTRAINT") {
    return "Ne zaman müsait olursunuz? Bir tarih belirleyelim.";
  }
  if (lastTitle) {
    return `"${lastTitle}" konusunda sizi duraksatan ne?`;
  }
  return "Bu konuda sizi en çok duraksatan nedir?";
}

function buildCommitmentRequest(lastTitle: string | null): string {
  if (lastTitle) {
    return `"${lastTitle}" için kim sorumlu, ne zaman başlıyor?`;
  }
  return "Bu kararı uygulayacak kişi kim ve ne zaman başlayacak?";
}

function buildSoftCommitmentRequest(lastTitle: string | null): string {
  if (lastTitle) {
    return `"${lastTitle}" için ilk adımı ne zaman atabilirsiniz?`;
  }
  return "İlk adımı ne zaman atabilirsiniz?";
}

/**
 * Executive Cognitive Stack v1 — Faz 2 (Mind State observer, gözlemci mod).
 * Yalnızca bu turn'ün zaten hesaplanmış sinyallerinden pasif bir görüntü
 * üretir. Hiçbir downstream karar mantığını beslemez — sonucu yalnızca
 * metadata'da taşınır.
 *
 * Faz 3 (evolution): yalnızca hypotheses/beliefs previousMindState ile
 * birleştirilir (id'ye göre dedupe, en yeni önce, max 3 kayıt). attentionFocus
 * ve workingMemory kasıtlı olarak Faz 2 davranışında kalır — stack dokümanı
 * (§2.2, §2.3) bu iki alanı "o anki görüntü", kümülatif olmayan alanlar
 * olarak tanımlar.
 */
export type MindStateObservationInput = {
  state: ExecutiveConversationState;
  conversationSignal: { type: ConversationSignalType; confidence: number } | null;
  objectionSignal: ExecutiveObjectionSignal | null;
  recommendationPackage: ExecutiveRecommendationPackage | null;
  previousMindState: ExecutiveMindState | null;
};

const MIND_STATE_LIST_CAP = 3;

/**
 * Executive Momentum v1 — Sonme (Decay). No turn counter exists anywhere in
 * the conversation chain, so age is measured in wall-clock time via each
 * item's lastReinforcedAt. No numeric value is specified by the stack doc or
 * existing code, so this is a conservative minimum: it only prunes items
 * that have gone stale across calendar days (the proven bug pattern —
 * resolved objections/commitments resurfacing "days later"), without risking
 * loss of same-session context.
 */
const MIND_STATE_ITEM_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function mergeMindStateList<T extends { id: string; lastReinforcedAt?: string }>(
  current: T[],
  previous: T[] | undefined,
  nowIso: string,
): T[] {
  const merged = [...current];
  const seenIds = new Set(current.map((item) => item.id));
  const nowMs = Date.parse(nowIso);
  for (const item of previous ?? []) {
    if (seenIds.has(item.id)) continue;
    if (typeof item.lastReinforcedAt === "string") {
      const ageMs = nowMs - Date.parse(item.lastReinforcedAt);
      if (Number.isFinite(ageMs) && ageMs > MIND_STATE_ITEM_MAX_AGE_MS) continue;
      merged.push(item);
    } else {
      // Legacy record predating decay tracking: grandfather it once with a
      // fresh stamp so it isn't dropped on this pass, then decay normally.
      merged.push({ ...item, lastReinforcedAt: nowIso });
    }
    seenIds.add(item.id);
  }
  return merged.slice(0, MIND_STATE_LIST_CAP);
}

export function observeExecutiveMindState(
  input: MindStateObservationInput,
): ExecutiveMindState | null {
  try {
    const { state, conversationSignal, objectionSignal, recommendationPackage, previousMindState } = input;
    const now = new Date().toISOString();

    const attentionFocus: string | null =
      objectionSignal?.type ??
      conversationSignal?.type ??
      (recommendationPackage ? "RECOMMENDATION" : state.phase);

    const workingMemory: ExecutiveMindWorkingMemoryItem[] = [
      { key: "phase", value: state.phase },
      ...(state.lastRecommendationTitle
        ? [{ key: "lastRecommendationTitle", value: state.lastRecommendationTitle }]
        : []),
    ];

    const currentHypotheses: ExecutiveMindHypothesis[] = objectionSignal
      ? [
          {
            id: `objection-${objectionSignal.type}`,
            summary: `Kullanıcı ${objectionSignal.type} tipinde bir çekince belirtmiş olabilir.`,
            lastReinforcedAt: now,
          },
        ]
      : [];

    const currentBeliefs: ExecutiveMindBelief[] =
      state.phase === "COMMITTED" && state.committedTitle
        ? [
            {
              id: `commitment-${state.committedTitle}`,
              summary: `Kullanıcı "${state.committedTitle}" kararına bağlandı.`,
              lastReinforcedAt: now,
            },
          ]
        : [];

    const hypotheses = mergeMindStateList(currentHypotheses, previousMindState?.hypotheses, now);
    const beliefs = mergeMindStateList(currentBeliefs, previousMindState?.beliefs, now);

    // Executive Intent Persistence (Faz 2). primaryIntent is established the
    // first time a well-formed recommendation exists, then carried forward
    // unchanged through minor topic drift (objections/clarifications/
    // commitments). It only updates again when the user gives a NEW_INFORMATION
    // signal — the existing signal for "this requires revising direction" —
    // so a stray sub-topic recommendation never silently overwrites it.
    const isNewDirectionSignal = conversationSignal?.type === "NEW_INFORMATION";
    const shouldSetIntent =
      !!recommendationPackage?.hasEnoughContext &&
      (!previousMindState?.primaryIntent || isNewDirectionSignal);

    const primaryIntent: string | null = shouldSetIntent
      ? recommendationPackage!.primaryAction
      : previousMindState?.primaryIntent ?? null;

    const intentConfidence = shouldSetIntent
      ? recommendationPackage!.primaryConfidenceLabel
      : previousMindState?.intentConfidence ?? null;

    // Executive Cognitive Stack v1 — Faz 4 (Cognitive Validation). Diagnostic-only:
    // list lengths and the cap constant, never hypothesis/belief summary text.
    console.info("[cognitive-validation][mind-state]", {
      label: "mind_state_merge",
      previousHypothesesCount: previousMindState?.hypotheses?.length ?? 0,
      currentHypothesesCount: currentHypotheses.length,
      mergedHypothesesCount: hypotheses.length,
      previousBeliefsCount: previousMindState?.beliefs?.length ?? 0,
      currentBeliefsCount: currentBeliefs.length,
      mergedBeliefsCount: beliefs.length,
      cap: MIND_STATE_LIST_CAP,
    });

    return { attentionFocus, workingMemory, hypotheses, beliefs, primaryIntent, intentConfidence };
  } catch (error) {
    console.warn("[ExecutiveMindState] observation failed:", error);
    return null;
  }
}
