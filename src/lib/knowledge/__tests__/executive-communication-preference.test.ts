import { describe, it, expect } from "vitest";
import { MemoryItemSource, MemoryItemType, MemorySubjectType } from "@prisma/client";

import { detectExecutiveKnowledge } from "../executive-knowledge-acquisition-engine.service";
import { mapKnowledgeDetectionsToMemoryCandidates } from "../executive-knowledge-candidate-mapper.service";
import { buildBaseMetrixPrompt } from "@/lib/ai/prompts/prompt-format";

import type { BuildSystemPromptInput } from "@/lib/ai/prompts/prompt.types";
import type { MemoryContext, MemoryContextItem } from "@/lib/memory/memory-context.types";

// FAZ 5 — Production Dikeyi 1. Kullanıcının cevap uzunluğu / soru sıklığı
// tercihi mevcut PREFERENCE memory-candidate zincirine bağlanıyor:
// detectExecutiveKnowledge → mapKnowledgeDetectionsToMemoryCandidates →
// (createMissingMemoryCandidates / approval — mevcut genel altyapı,
// bu dosyada tekrar test edilmiyor) → buildMemoryContextForOrganization →
// buildBaseMetrixPrompt ("Tercih hafizasi:").

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

function makeMinimalPromptInput(
  preferences: MemoryContextItem[] = [],
): BuildSystemPromptInput {
  return {
    memoryContext: { ...makeEmptyMemoryContext(), preferences },
    organizationSummary: "Test sirket.",
    personContext: [],
  };
}

function makePreferenceItem(key: string, value: string): MemoryContextItem {
  return {
    id: `mem-${key}`,
    type: "PREFERENCE",
    key,
    value,
    subjectType: "USER",
    subjectId: null,
    confidence: 90,
    source: MemoryItemSource.CANDIDATE_APPROVED,
    isUserConfirmed: true,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  };
}

describe("communication preference detection (response length + question frequency)", () => {
  it("1: 'Bundan sonra cevapları kısa tut.' → kalıcı concise adayı", () => {
    const detections = detectExecutiveKnowledge({
      message: "Bundan sonra cevapları kısa tut.",
    });
    const match = detections.find((d) => d.canonicalKey === "response_length_preference");
    expect(match?.detectedValue).toBe("concise");
  });

  it("2: 'Genelde kısa ve net cevap ver.' → kalıcı concise adayı", () => {
    const detections = detectExecutiveKnowledge({
      message: "Genelde kısa ve net cevap ver.",
    });
    const match = detections.find((d) => d.canonicalKey === "response_length_preference");
    expect(match?.detectedValue).toBe("concise");
  });

  it("3: 'Bu cevabı kısa yaz.' → kalıcı aday üretilmez (turn-içi talep)", () => {
    const detections = detectExecutiveKnowledge({ message: "Bu cevabı kısa yaz." });
    expect(detections.find((d) => d.canonicalKey === "response_length_preference")).toBeUndefined();
  });

  it("4: 'Şimdi detaylı anlat.' → kalıcı aday üretilmez (turn-içi talep)", () => {
    const detections = detectExecutiveKnowledge({ message: "Şimdi detaylı anlat." });
    expect(detections.find((d) => d.canonicalKey === "response_length_preference")).toBeUndefined();
  });

  it("5: 'Bundan sonra daha detaylı cevap ver.' → kalıcı detailed adayı", () => {
    const detections = detectExecutiveKnowledge({
      message: "Bundan sonra daha detaylı cevap ver.",
    });
    const match = detections.find((d) => d.canonicalKey === "response_length_preference");
    expect(match?.detectedValue).toBe("detailed");
  });

  it("6: 'Bana sürekli soru sorma.' → minimize_unnecessary_questions adayı", () => {
    const detections = detectExecutiveKnowledge({ message: "Bana sürekli soru sorma." });
    const match = detections.find((d) => d.canonicalKey === "question_frequency_preference");
    expect(match?.detectedValue).toBe("minimize_unnecessary_questions");
  });

  it("7: 'Bu konuda bana soru sorma.' → kalıcı aday üretilmez (konuya özel)", () => {
    const detections = detectExecutiveKnowledge({ message: "Bu konuda bana soru sorma." });
    expect(detections.find((d) => d.canonicalKey === "question_frequency_preference")).toBeUndefined();
  });

  it("8: 'Karar vermeden önce bana daha çok soru sor.' → ask_more_before_deciding adayı", () => {
    const detections = detectExecutiveKnowledge({
      message: "Karar vermeden önce bana daha çok soru sor.",
    });
    const match = detections.find((d) => d.canonicalKey === "question_frequency_preference");
    expect(match?.detectedValue).toBe("ask_more_before_deciding");
  });

  it("11: alakasız bir iş mesajı hiçbir preference adayı üretmez", () => {
    const detections = detectExecutiveKnowledge({
      message: "Bu ay tahsilatlarımız kısa vadede biraz yavaşladı, uzun vadeli musteriyle gorusecegim.",
    });
    expect(detections.find((d) => d.canonicalKey === "response_length_preference")).toBeUndefined();
    expect(detections.find((d) => d.canonicalKey === "question_frequency_preference")).toBeUndefined();
  });
});

describe("communication preference → MemoryCandidateDescriptor mapping", () => {
  it("kalıcı concise tespiti PREFERENCE tipinde, USER subject'li bir aday üretir", () => {
    const detections = detectExecutiveKnowledge({
      message: "Bundan sonra cevapları kısa tut.",
    });
    const candidates = mapKnowledgeDetectionsToMemoryCandidates({
      detections,
      organizationId: "org-1",
      createdByUserId: "user-1",
      sourceMessageId: "msg-1",
    });

    const candidate = candidates.find((c) => c.proposedKey === "response_length_preference");
    expect(candidate).toMatchObject({
      subjectType: MemorySubjectType.USER,
      proposedType: MemoryItemType.PREFERENCE,
      proposedKey: "response_length_preference",
      proposedValue: "concise",
      source: MemoryItemSource.USER_PROVIDED,
    });
  });

  it("9: aynı kalıcı ifade tekrarlandığında aynı (tip, anahtar, değer) üçlüsünü üretir — genel candidate/promotion dedup bu üçlü uzerinden calisir", () => {
    const first = mapKnowledgeDetectionsToMemoryCandidates({
      detections: detectExecutiveKnowledge({ message: "Bundan sonra cevapları kısa tut." }),
      organizationId: "org-1",
      createdByUserId: "user-1",
      sourceMessageId: "msg-1",
    }).find((c) => c.proposedKey === "response_length_preference");

    const second = mapKnowledgeDetectionsToMemoryCandidates({
      detections: detectExecutiveKnowledge({ message: "Genelde kısa ve net cevap ver." }),
      organizationId: "org-1",
      createdByUserId: "user-1",
      sourceMessageId: "msg-2",
    }).find((c) => c.proposedKey === "response_length_preference");

    expect(first?.proposedValue).toBe(second?.proposedValue);
    expect([first?.proposedType, first?.proposedKey]).toEqual([
      second?.proposedType,
      second?.proposedKey,
    ]);
  });

  it("10: ters bir kalıcı tercih aynı anahtarda farklı değer üretir — mevcut supersede/conflict altyapısı (approveMemoryCandidateForOrganization → findSupersedeConflict) bu (tip, anahtar) eşleşmesi ve değer farkı üzerinden calisip iki celiskili aktif kayit birakmaz", () => {
    const conciseCandidate = mapKnowledgeDetectionsToMemoryCandidates({
      detections: detectExecutiveKnowledge({ message: "Bundan sonra cevapları kısa tut." }),
      organizationId: "org-1",
      createdByUserId: "user-1",
      sourceMessageId: "msg-1",
    }).find((c) => c.proposedKey === "response_length_preference");

    const detailedCandidate = mapKnowledgeDetectionsToMemoryCandidates({
      detections: detectExecutiveKnowledge({ message: "Bundan sonra daha detaylı cevap ver." }),
      organizationId: "org-1",
      createdByUserId: "user-1",
      sourceMessageId: "msg-2",
    }).find((c) => c.proposedKey === "response_length_preference");

    expect(conciseCandidate?.proposedKey).toBe(detailedCandidate?.proposedKey);
    expect(conciseCandidate?.proposedValue).not.toBe(detailedCandidate?.proposedValue);
  });
});

describe("persisted preference reaches the next-turn system prompt", () => {
  it("aktif bir 'response_length_preference: concise' hafıza kaydı 'Tercih hafizasi' bolumune girer", () => {
    const detections = detectExecutiveKnowledge({
      message: "Bundan sonra cevapları kısa tut.",
    });
    const candidate = mapKnowledgeDetectionsToMemoryCandidates({
      detections,
      organizationId: "org-1",
      createdByUserId: "user-1",
      sourceMessageId: "msg-1",
    }).find((c) => c.proposedKey === "response_length_preference");

    expect(candidate).toBeDefined();

    // Candidate onaylandığında (approveMemoryCandidateForOrganization) aynı
    // key/value ile ACTIVE bir MemoryItem oluşur; o kaydı burada simüle
    // edip buildMemoryContextForOrganization'ın ürettiği preferences
    // listesinin prompt'a nasıl girdiğini doğruluyoruz.
    const preferenceItem = makePreferenceItem(
      candidate!.proposedKey,
      candidate!.proposedValue,
    );

    const prompt = buildBaseMetrixPrompt(makeMinimalPromptInput([preferenceItem]));

    expect(prompt).toContain("Tercih hafizasi:");
    expect(prompt).toContain("- response_length_preference: concise");
  });

  it("preference yokken 'Tercih hafizasi' bolumu bos gorunur (regresyon yok)", () => {
    const prompt = buildBaseMetrixPrompt(makeMinimalPromptInput([]));
    expect(prompt).toContain("Tercih hafizasi:\n- Yok.");
  });
});
