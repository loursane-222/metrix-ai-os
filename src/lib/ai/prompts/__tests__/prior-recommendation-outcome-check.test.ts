import { describe, it, expect } from "vitest";
import { buildBaseMetrixPrompt } from "../prompt-format";
import type { BuildSystemPromptInput } from "../prompt.types";
import type {
  ExecutiveConversationState,
  ExecutiveMindBelief,
  ExecutiveRecommendationPackage,
} from "@/lib/ai/executive-conversation.types";
import type { MemoryContext } from "@/lib/memory/memory-context.types";

// FAZ 5 — Production Dikeyi 2. Ayni primaryAction daha once FAILURE/ABANDONED
// olmus bir commitment belief'i ile eslesirse, "Yonetim kanaati" bolumune
// yapisal bir "ONCEKI SONUC KONTROLU" satiri eklenir. Eslesme yoksa cikti
// degismez. primaryConfidenceLabel asla degistirilmez (Truth Engine/Faz 3
// kapsamina girilmiyor).

const PRIMARY_ACTION = "Müşteriye ödeme planı teklif et";

function makeEmptyMemoryContext(): MemoryContext {
  return {
    version: "v1",
    generatedAt: "2026-07-12T00:00:00.000Z",
    organizationId: "test-org",
    totalIncluded: 0,
    highlights: [],
    strategic: [],
    facts: [],
    processes: [],
    preferences: [],
    conflicts: [],
  };
}

function makeRecommendationPackage(
  overrides: Partial<ExecutiveRecommendationPackage> = {},
): ExecutiveRecommendationPackage {
  return {
    primaryAction: PRIMARY_ACTION,
    primaryRationale: "Tahsilat gecikmesi 45 günü aştı.",
    primaryConfidenceLabel: "GÜÇLÜ",
    primaryEvidence: ["45 gün gecikmiş 120.000 TL alacak var."],
    alternatives: [],
    objectionType: null,
    objectionResponse: null,
    nextBestAlternative: null,
    revisionTrigger: "Ödeme durumu değiştiğinde yeniden değerlendir.",
    hasEnoughContext: true,
    ...overrides,
  };
}

function makeBelief(id: string, summary: string): ExecutiveMindBelief {
  return { id, summary, lastReinforcedAt: "2026-07-12T00:00:00.000Z" };
}

function makeConversationState(
  beliefs: ExecutiveMindBelief[] = [],
): ExecutiveConversationState {
  return {
    phase: "OPEN_ENDED",
    lastRecommendationTitle: null,
    lastRecommendationRationale: null,
    lastObjectionType: null,
    objectionCount: 0,
    clarifyingQuestion: null,
    commitmentRequest: null,
    isRevisionRequired: false,
    committedTitle: null,
    committedAt: null,
    followUpDueAt: null,
    commitmentOutcome: null,
    updatedAt: "2026-07-12T00:00:00.000Z",
    mindState: { attentionFocus: null, workingMemory: [], hypotheses: [], beliefs },
  };
}

function makePromptInput(
  recommendationPackage: ExecutiveRecommendationPackage,
  beliefs: ExecutiveMindBelief[] = [],
): BuildSystemPromptInput {
  return {
    memoryContext: makeEmptyMemoryContext(),
    organizationSummary: "Test sirket.",
    personContext: [],
    recommendationPackage,
    conversationState: makeConversationState(beliefs),
  };
}

const FAILURE_SUMMARY = `Kullanıcı "${PRIMARY_ACTION}" kararını denedi ama sonuç vermedi; yeni kanıt nedeniyle yeniden değerlendirme gerekiyor.`;
const ABANDONED_SUMMARY = `Kullanıcı "${PRIMARY_ACTION}" kararından vazgeçti; yeniden değerlendirme gerekiyor.`;
const PENDING_SUMMARY = `Kullanıcı "${PRIMARY_ACTION}" kararına bağlandı.`;

describe("recommendation prior-outcome check — buildBaseMetrixPrompt", () => {
  it("1: eşleşen FAILURE belief + aynı recommendation → ONCEKI SONUC KONTROLU (FAILURE) eklenir", () => {
    const prompt = buildBaseMetrixPrompt(
      makePromptInput(makeRecommendationPackage(), [
        makeBelief(`commitment-${PRIMARY_ACTION}`, FAILURE_SUMMARY),
      ]),
    );

    expect(prompt).toContain(
      "ONCEKI SONUC KONTROLU: Bu eylem daha once denendi ve sonuc vermedi.",
    );
  });

  it("2: eşleşen ABANDONED belief + aynı recommendation → ABANDONED'a özgü kontrol eklenir ('sonuç vermedi' demez)", () => {
    const prompt = buildBaseMetrixPrompt(
      makePromptInput(makeRecommendationPackage(), [
        makeBelief(`commitment-${PRIMARY_ACTION}`, ABANDONED_SUMMARY),
      ]),
    );

    expect(prompt).toContain(
      "ONCEKI SONUC KONTROLU: Bu eylemin onceki uygulamasi tamamlanmadi veya sonucu dogrulanmadi.",
    );
    expect(prompt).not.toContain("daha once denendi ve sonuc vermedi");
  });

  it("3: SUCCESS/bekleyen (outcome uyarısı olmayan) belief → kontrol eklenmez", () => {
    const prompt = buildBaseMetrixPrompt(
      makePromptInput(makeRecommendationPackage(), [
        makeBelief(`commitment-${PRIMARY_ACTION}`, PENDING_SUMMARY),
      ]),
    );

    expect(prompt).not.toContain("ONCEKI SONUC KONTROLU");
  });

  it("4: farklı commitment belief (farklı başlık) + recommendation → kontrol eklenmez", () => {
    const prompt = buildBaseMetrixPrompt(
      makePromptInput(makeRecommendationPackage(), [
        makeBelief(
          "commitment-Yeni personel işe al",
          `Kullanıcı "Yeni personel işe al" kararını denedi ama sonuç vermedi; yeni kanıt nedeniyle yeniden değerlendirme gerekiyor.`,
        ),
      ]),
    );

    expect(prompt).not.toContain("ONCEKI SONUC KONTROLU");
  });

  it("5: yalnızca benzer kelimeler taşıyan farklı bir eylem → kontrol eklenmez (substring eşleşmesi yok)", () => {
    const prompt = buildBaseMetrixPrompt(
      makePromptInput(makeRecommendationPackage(), [
        makeBelief(
          "commitment-Ödeme planlarının genel etkisini analiz et",
          `Kullanıcı "Ödeme planlarının genel etkisini analiz et" kararını denedi ama sonuç vermedi; yeni kanıt nedeniyle yeniden değerlendirme gerekiyor.`,
        ),
      ]),
    );

    expect(prompt).not.toContain("ONCEKI SONUC KONTROLU");
  });

  it("6: büyük/küçük harf ve baştaki/sondaki boşluk farkı olsa da doğru eşleşir", () => {
    const prompt = buildBaseMetrixPrompt(
      makePromptInput(makeRecommendationPackage(), [
        makeBelief(
          `commitment-  ${PRIMARY_ACTION.toLocaleUpperCase("tr-TR")}  `,
          FAILURE_SUMMARY,
        ),
      ]),
    );

    expect(prompt).toContain("ONCEKI SONUC KONTROLU");
  });

  it("7: eşleşme yokken (belief yok) recommendation bölümü değişmeden kalır", () => {
    const withBeliefs = buildBaseMetrixPrompt(makePromptInput(makeRecommendationPackage(), []));
    const withoutBeliefsField = buildBaseMetrixPrompt(
      (() => {
        const input = makePromptInput(makeRecommendationPackage(), []);
        return { ...input, conversationState: undefined };
      })(),
    );

    expect(withBeliefs).not.toContain("ONCEKI SONUC KONTROLU");
    expect(withBeliefs).toContain("- Oncelikli adim: " + PRIMARY_ACTION);
    expect(withBeliefs).toContain("- Kanaat gücü: GÜÇLÜ");
    // conversationState hic yokken de recommendation bolumu ayni kalir.
    expect(withoutBeliefsField).toContain("- Oncelikli adim: " + PRIMARY_ACTION);
  });

  it("8: FAILURE eşleşmesinde primaryConfidenceLabel değiştirilmez", () => {
    const prompt = buildBaseMetrixPrompt(
      makePromptInput(makeRecommendationPackage({ primaryConfidenceLabel: "GÜÇLÜ" }), [
        makeBelief(`commitment-${PRIMARY_ACTION}`, FAILURE_SUMMARY),
      ]),
    );

    expect(prompt).toContain("- Kanaat gücü: GÜÇLÜ");
  });

  it("9: ABANDONED eşleşmesinde eylem 'denendi ve başarısız oldu' şeklinde yanlış temsil edilmez", () => {
    const prompt = buildBaseMetrixPrompt(
      makePromptInput(makeRecommendationPackage(), [
        makeBelief(`commitment-${PRIMARY_ACTION}`, ABANDONED_SUMMARY),
      ]),
    );

    expect(prompt).not.toContain("denendi");
    expect(prompt).not.toContain("basarisiz oldu");
  });

  it("10: FAILURE talimatı aynı öneriyi tekrarlamama + yeni koşul/kanıt isteme + alternatif üretmeyi içerir", () => {
    const prompt = buildBaseMetrixPrompt(
      makePromptInput(makeRecommendationPackage(), [
        makeBelief(`commitment-${PRIMARY_ACTION}`, FAILURE_SUMMARY),
      ]),
    );

    expect(prompt).toContain("Ayni oneriyi degismeden tekrarlama");
    expect(prompt).toContain("degisen kosulu veya yeni kaniti acikla");
    expect(prompt).toContain("aksi halde alternatif uret");
  });
});
