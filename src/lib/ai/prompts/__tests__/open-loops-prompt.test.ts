import { describe, it, expect } from "vitest";
import { formatExecutiveFollowUpIntelligence, buildBaseMetrixPrompt } from "../prompt-format";
import type { BuildSystemPromptInput } from "../prompt.types";
import type { MemoryContext } from "@/lib/memory/memory-context.types";
import type { ExecutiveFollowUpPromptSummary } from "@/lib/executive-follow-up-intelligence";

// ─── Fixtures ────────────────────────────────────────────────────────────────

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

function makeMinimalPromptInput(): BuildSystemPromptInput {
  return {
    memoryContext: makeEmptyMemoryContext(),
    organizationSummary: "Test sirket.",
    personContext: [],
  };
}

function makeFollowUp(
  overrides: Partial<ExecutiveFollowUpPromptSummary> = {},
): ExecutiveFollowUpPromptSummary {
  return {
    summaryLine: "3 aksiyon acik, 1 gecikmis.",
    executionScoreLabel: "Orta",
    topCriticalFollowUp: null,
    hasOverdue: false,
    ...overrides,
  };
}

// ─── formatExecutiveFollowUpIntelligence (pure fonksiyon) ────────────────────

describe("formatExecutiveFollowUpIntelligence", () => {
  it("null/undefined verilince bolum render edilmez", () => {
    expect(formatExecutiveFollowUpIntelligence(null)).toBeNull();
    expect(formatExecutiveFollowUpIntelligence(undefined)).toBeNull();
  });

  it("dolu ozet verilince baslik ve ozet satirini icerir", () => {
    const result = formatExecutiveFollowUpIntelligence(makeFollowUp())!;
    expect(result).toContain("Acik donguler / aksiyon icra takibi:");
    expect(result).toContain("- Özet: 3 aksiyon acik, 1 gecikmis.");
    expect(result).toContain("- İcra değerlendirmesi: Orta");
  });

  it("topCriticalFollowUp varsa kritik bekleyen satiri eklenir", () => {
    const result = formatExecutiveFollowUpIntelligence(
      makeFollowUp({ topCriticalFollowUp: "Odeme takibi 3 gundur bekliyor" }),
    )!;
    expect(result).toContain("- Kritik bekleyen: Odeme takibi 3 gundur bekliyor");
  });

  it("hasOverdue false ise gecikmis aksiyon satiri gorunmez", () => {
    const result = formatExecutiveFollowUpIntelligence(makeFollowUp({ hasOverdue: false }))!;
    expect(result).not.toContain("Gecikmiş aksiyon var");
  });

  it("hasOverdue true ise gecikmis aksiyon satiri gorunur", () => {
    const result = formatExecutiveFollowUpIntelligence(makeFollowUp({ hasOverdue: true }))!;
    expect(result).toContain("- Gecikmiş aksiyon var.");
  });

  it("tek kisa davranis talimati satiri mevcut", () => {
    const result = formatExecutiveFollowUpIntelligence(makeFollowUp())!;
    expect(result).toContain(
      "- Açık döngüleri unutma; yalnızca konuşmayla ilgiliyse veya zamanı geldiyse doğal biçimde kullan, kapanış kanıtı olmadan tamamlandı sayma.",
    );
  });

  it("ham JSON veya [object Object] asla prompt'a girmez", () => {
    const result = formatExecutiveFollowUpIntelligence(makeFollowUp())!;
    expect(result).not.toContain("[object Object]");
    expect(result).not.toMatch(/^\s*[[{]/);
    expect(result).not.toContain('"summaryLine"');
  });

  it("summaryLine 160 karakteri asmaz, kirpilirsa kelime sinirinda kesilir", () => {
    const longSummary = "A".repeat(50) + " " + "B".repeat(50) + " " + "C".repeat(100);
    const result = formatExecutiveFollowUpIntelligence(
      makeFollowUp({ summaryLine: longSummary }),
    )!;
    const ozetLine = result.split("\n").find((line) => line.startsWith("- Özet: "))!;
    const ozetValue = ozetLine.replace("- Özet: ", "");
    expect(ozetValue.length).toBeLessThanOrEqual(160);
    expect(ozetValue.endsWith("…")).toBe(true);
    // kelime ortasinda kesilmemis olmali (C harfleriyle bolunmemis)
    expect(ozetValue).not.toMatch(/C+…$/);
  });

  it("summaryLine limit altindaysa degismeden kalir", () => {
    const shortSummary = "3 aksiyon acik, 1 gecikmis.";
    const result = formatExecutiveFollowUpIntelligence(
      makeFollowUp({ summaryLine: shortSummary }),
    )!;
    expect(result).toContain(`- Özet: ${shortSummary}`);
    expect(result).not.toContain("…");
  });

  it("topCriticalFollowUp 180 karakteri asmaz, kirpilirsa kelime sinirinda kesilir", () => {
    const longCritical = "X".repeat(60) + " " + "Y".repeat(60) + " " + "Z".repeat(100);
    const result = formatExecutiveFollowUpIntelligence(
      makeFollowUp({ topCriticalFollowUp: longCritical }),
    )!;
    const criticalLine = result.split("\n").find((line) => line.startsWith("- Kritik bekleyen: "))!;
    const criticalValue = criticalLine.replace("- Kritik bekleyen: ", "");
    expect(criticalValue.length).toBeLessThanOrEqual(180);
    expect(criticalValue.endsWith("…")).toBe(true);
    expect(criticalValue).not.toMatch(/Z+…$/);
  });

  it("topCriticalFollowUp limit altindaysa degismeden kalir", () => {
    const shortCritical = "Büyük müşteriye teklif takibi 4 gündür bekliyor";
    const result = formatExecutiveFollowUpIntelligence(
      makeFollowUp({ topCriticalFollowUp: shortCritical }),
    )!;
    expect(result).toContain(`- Kritik bekleyen: ${shortCritical}`);
  });

  it("hedef ciktiya birebir uyar: hafif ornek", () => {
    const result = formatExecutiveFollowUpIntelligence(
      makeFollowUp({
        summaryLine: "2 aksiyon acik, kritik durum yok.",
        executionScoreLabel: "İyi",
      }),
    );
    expect(result).toBe(
      [
        "Acik donguler / aksiyon icra takibi:",
        "- Özet: 2 aksiyon acik, kritik durum yok.",
        "- İcra değerlendirmesi: İyi",
        "- Açık döngüleri unutma; yalnızca konuşmayla ilgiliyse veya zamanı geldiyse doğal biçimde kullan, kapanış kanıtı olmadan tamamlandı sayma.",
      ].join("\n"),
    );
  });

  it("hedef ciktiya birebir uyar: kritik ornek", () => {
    const result = formatExecutiveFollowUpIntelligence(
      makeFollowUp({
        summaryLine: "5 aksiyon acik, 2 gecikmis.",
        executionScoreLabel: "Zayif",
        topCriticalFollowUp: "Büyük müşteriye teklif takibi 4 gündür bekliyor",
        hasOverdue: true,
      }),
    );
    expect(result).toBe(
      [
        "Acik donguler / aksiyon icra takibi:",
        "- Özet: 5 aksiyon acik, 2 gecikmis.",
        "- İcra değerlendirmesi: Zayif",
        "- Kritik bekleyen: Büyük müşteriye teklif takibi 4 gündür bekliyor",
        "- Gecikmiş aksiyon var.",
        "- Açık döngüleri unutma; yalnızca konuşmayla ilgiliyse veya zamanı geldiyse doğal biçimde kullan, kapanış kanıtı olmadan tamamlandı sayma.",
      ].join("\n"),
    );
  });
});

// ─── buildBaseMetrixPrompt entegrasyonu ──────────────────────────────────────

describe("buildBaseMetrixPrompt — Open Loops kosulsuz erisim", () => {
  it("executiveManagerContext null olsa bile (requiresExecutiveReasoning=false) open loops render edilir", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      requiresExecutiveReasoning: false,
      executiveManagerContext: null,
      executiveFollowUpIntelligence: makeFollowUp({ summaryLine: "Benzersiz-ozet-XYZ" }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).toContain("Benzersiz-ozet-XYZ");
  });

  it("open loops verisi tam olarak bir kez gorunur (duplicate yok)", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      requiresExecutiveReasoning: false,
      executiveManagerContext: null,
      executiveFollowUpIntelligence: makeFollowUp({ summaryLine: "Benzersiz-ozet-XYZ" }),
    };
    const prompt = buildBaseMetrixPrompt(input);
    const occurrences = prompt.split("Benzersiz-ozet-XYZ").length - 1;
    expect(occurrences).toBe(1);
  });

  it("executiveFollowUpIntelligence yoksa hicbir Open Loops bolumu render edilmez", () => {
    const input: BuildSystemPromptInput = {
      ...makeMinimalPromptInput(),
      requiresExecutiveReasoning: false,
      executiveManagerContext: null,
      executiveFollowUpIntelligence: null,
    };
    const prompt = buildBaseMetrixPrompt(input);
    expect(prompt).not.toContain("Acik donguler / aksiyon icra takibi:");
  });
});
