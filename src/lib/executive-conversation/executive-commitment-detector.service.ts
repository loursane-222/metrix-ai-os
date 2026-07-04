import type { CommitmentOutcome, CommitmentOutcomeSignal } from "./executive-commitment.types";
import type { ConversationPhase } from "./executive-conversation.types";

type OutcomeKeywordSet = {
  outcome: CommitmentOutcome;
  baseConfidence: number;
  keywords: string[];
};

const MIN_CONFIDENCE = 0.72;
const MATCH_BOOST = 0.07;
const MAX_CONFIDENCE = 0.97;

const OUTCOME_KEYWORD_SETS: OutcomeKeywordSet[] = [
  {
    outcome: "SUCCESS",
    baseConfidence: 0.80,
    keywords: [
      "hallettim",
      "tamamladım",
      "başardım",
      "çözdüm",
      "işe yaradı",
      "sonuç aldım",
      "gerçekleştirdim",
      "başarılı oldu",
      "yaptım ve oldu",
      "uyguladım ve çalıştı",
    ],
  },
  {
    outcome: "SUCCESS",
    baseConfidence: 0.74,
    // "yaptım" tek başına zayıf — sadece COMMITTED fazında güçlü
    keywords: [
      "yaptım",
      "uyguladım",
      "oldu",
    ],
  },
  {
    outcome: "FAILURE",
    baseConfidence: 0.78,
    keywords: [
      "işe yaramadı",
      "çalışmadı",
      "sonuç alamadım",
      "başaramadım",
      "denedim ama olmadı",
      "olmadı",
      "çözüm bulamadım",
      "uyguladım ama çalışmadı",
    ],
  },
  {
    outcome: "ABANDONED",
    baseConfidence: 0.80,
    keywords: [
      "vazgeçtim",
      "bıraktım",
      "iptal ettim",
      "yapmayacağım",
      "olmayacak",
      "şimdilik dur",
      "erteledim",
      "bunu yapmıyorum",
      "iptal",
    ],
  },
];

const COMMITTED_ONLY_SUCCESS_KEYWORDS = ["yaptım", "uyguladım", "oldu"];

export function detectCommitmentOutcome(
  message: string,
  previousPhase?: ConversationPhase | null,
): CommitmentOutcomeSignal | null {
  const normalized = message.toLowerCase();
  const isCommittedPhase = previousPhase === "COMMITTED";

  let best: CommitmentOutcomeSignal | null = null;

  for (const set of OUTCOME_KEYWORD_SETS) {
    const matched = set.keywords.filter((kw) => normalized.includes(kw));
    if (matched.length === 0) continue;

    // Zayıf SUCCESS keywords (yaptım, uyguladım, oldu) sadece COMMITTED fazında geçerli
    const hasOnlyWeakKeywords = matched.every((kw) =>
      COMMITTED_ONLY_SUCCESS_KEYWORDS.includes(kw),
    );
    if (hasOnlyWeakKeywords && !isCommittedPhase) continue;

    const boost = Math.min((matched.length - 1) * MATCH_BOOST, 0.18);
    const confidence = Math.min(set.baseConfidence + boost, MAX_CONFIDENCE);

    if (confidence < MIN_CONFIDENCE) continue;

    if (best === null || confidence > best.confidence) {
      best = {
        outcome: set.outcome,
        confidence,
        rawKeywords: matched,
      };
    }
  }

  return best;
}
