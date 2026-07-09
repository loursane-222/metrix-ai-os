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

function mergeMindStateList<T extends { id: string }>(
  current: T[],
  previous: T[] | undefined,
): T[] {
  const merged = [...current];
  const seenIds = new Set(current.map((item) => item.id));
  for (const item of previous ?? []) {
    if (!seenIds.has(item.id)) {
      merged.push(item);
      seenIds.add(item.id);
    }
  }
  return merged.slice(0, MIND_STATE_LIST_CAP);
}

export function observeExecutiveMindState(
  input: MindStateObservationInput,
): ExecutiveMindState | null {
  try {
    const { state, conversationSignal, objectionSignal, recommendationPackage, previousMindState } = input;

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
          },
        ]
      : [];

    const currentBeliefs: ExecutiveMindBelief[] =
      state.phase === "COMMITTED" && state.committedTitle
        ? [
            {
              id: `commitment-${state.committedTitle}`,
              summary: `Kullanıcı "${state.committedTitle}" kararına bağlandı.`,
            },
          ]
        : [];

    const hypotheses = mergeMindStateList(currentHypotheses, previousMindState?.hypotheses);
    const beliefs = mergeMindStateList(currentBeliefs, previousMindState?.beliefs);

    return { attentionFocus, workingMemory, hypotheses, beliefs };
  } catch (error) {
    console.warn("[ExecutiveMindState] observation failed:", error);
    return null;
  }
}
