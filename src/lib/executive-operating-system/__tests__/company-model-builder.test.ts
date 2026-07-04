import { describe, expect, it } from "vitest";
import { buildCompanyModel } from "../company-model-builder.service";
import type { MemoryContext, MemoryContextItem } from "@/lib/memory/memory-context.types";

// ─── Fixture Helpers ──────────────────────────────────────────────────────────

const EMPTY_CTX: MemoryContext = {
  version: "v1",
  generatedAt: "2026-06-29T00:00:00.000Z",
  organizationId: "org-test",
  totalIncluded: 0,
  facts: [],
  processes: [],
  strategic: [],
  preferences: [],
  highlights: [],
  conflicts: [],
};

function item(
  key: string,
  value: string,
  overrides: Partial<MemoryContextItem> = {},
): MemoryContextItem {
  return {
    id: `id-${key}`,
    type: "FACT",
    key,
    value,
    subjectType: "ORGANIZATION",
    subjectId: null,
    confidence: 95,
    source: "USER_PROVIDED",
    isUserConfirmed: true,
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
    ...overrides,
  };
}

function ctx(patch: Partial<MemoryContext>): MemoryContext {
  return { ...EMPTY_CTX, ...patch };
}

// ─── Temel Davranış ───────────────────────────────────────────────────────────

describe("buildCompanyModel — null / boş girdi", () => {
  it("null → EMPTY_COMPANY_MODEL shape", () => {
    const result = buildCompanyModel(null);
    expect(result.industry).toBeNull();
    expect(result.city).toBeNull();
    expect(result.teamSize).toBeNull();
    expect(result.growthPhase).toBe("unknown");
    expect(result.topGoal).toBeNull();
    expect(result.cashPriority).toBeNull();
    expect(result.primaryCustomerType).toBeNull();
    expect(result.learnedFacts).toHaveLength(0);
    expect(result.confidence).toBe("none");
  });

  it("boş context → tüm birincil alanlar null, confidence none", () => {
    const result = buildCompanyModel(EMPTY_CTX);
    expect(result.industry).toBeNull();
    expect(result.confidence).toBe("none");
  });
});

// ─── Alan Eşlemeleri ─────────────────────────────────────────────────────────

describe("buildCompanyModel — alan eşlemeleri", () => {
  it("industry key → industry alanına taşınır", () => {
    const result = buildCompanyModel(ctx({ facts: [item("industry", "İnşaat")] }));
    expect(result.industry).toBe("İnşaat");
  });

  it("city key → city alanına taşınır", () => {
    const result = buildCompanyModel(ctx({ facts: [item("city", "İstanbul")] }));
    expect(result.city).toBe("İstanbul");
  });

  it("operating_region alias → city alanına taşınır", () => {
    const result = buildCompanyModel(ctx({ facts: [item("operating_region", "Ankara")] }));
    expect(result.city).toBe("Ankara");
  });

  it("team_size sayısal string → number", () => {
    const result = buildCompanyModel(ctx({ facts: [item("team_size", "15")] }));
    expect(result.teamSize).toBe(15);
  });

  it("employee_count alias → teamSize alanına taşınır", () => {
    const result = buildCompanyModel(ctx({ facts: [item("employee_count", "30")] }));
    expect(result.teamSize).toBe(30);
  });

  it("top_goal strategic → topGoal alanına taşınır", () => {
    const result = buildCompanyModel(
      ctx({ strategic: [item("top_goal", "Ciroyu 2x artırmak", { type: "STRATEGIC" })] }),
    );
    expect(result.topGoal).toBe("Ciroyu 2x artırmak");
  });

  it("primary_goal alias → topGoal alanına taşınır", () => {
    const result = buildCompanyModel(ctx({ facts: [item("primary_goal", "100 müşteri")] }));
    expect(result.topGoal).toBe("100 müşteri");
  });

  it("cashflow_priority → cashPriority alanına taşınır", () => {
    const result = buildCompanyModel(ctx({ facts: [item("cashflow_priority", "gergin")] }));
    expect(result.cashPriority).toBe("gergin");
  });

  it("cash_flow_status alias → cashPriority alanına taşınır", () => {
    const result = buildCompanyModel(ctx({ facts: [item("cash_flow_status", "rahat")] }));
    expect(result.cashPriority).toBe("rahat");
  });

  it("primary_customer_type → primaryCustomerType alanına taşınır", () => {
    const result = buildCompanyModel(ctx({ facts: [item("primary_customer_type", "kurumsal")] }));
    expect(result.primaryCustomerType).toBe("kurumsal");
  });

  it("customer_type alias → primaryCustomerType alanına taşınır", () => {
    const result = buildCompanyModel(ctx({ facts: [item("customer_type", "bireysel")] }));
    expect(result.primaryCustomerType).toBe("bireysel");
  });

  it("growthPhase her zaman unknown", () => {
    const result = buildCompanyModel(ctx({ facts: [item("industry", "Yazılım")] }));
    expect(result.growthPhase).toBe("unknown");
  });
});

// ─── teamSize Dönüşümü ───────────────────────────────────────────────────────

describe("buildCompanyModel — teamSize dönüşümü", () => {
  it("temiz sayı → number", () => {
    const result = buildCompanyModel(ctx({ facts: [item("team_size", "5")] }));
    expect(result.teamSize).toBe(5);
  });

  it("sayısal olmayan string → null", () => {
    const result = buildCompanyModel(ctx({ facts: [item("team_size", "bilinmiyor")] }));
    expect(result.teamSize).toBeNull();
  });

  it("boş string → null", () => {
    const result = buildCompanyModel(ctx({ facts: [item("team_size", "  ")] }));
    expect(result.teamSize).toBeNull();
  });

  it("sıfır → null (pozitif değer gerekli)", () => {
    const result = buildCompanyModel(ctx({ facts: [item("team_size", "0")] }));
    expect(result.teamSize).toBeNull();
  });

  it("sayıyla başlayan string → parseInt davranışı", () => {
    const result = buildCompanyModel(ctx({ facts: [item("team_size", "20 kişi")] }));
    expect(result.teamSize).toBe(20);
  });
});

// ─── Confidence Hesaplama ─────────────────────────────────────────────────────

describe("buildCompanyModel — confidence hesaplama", () => {
  it("0 alan → none", () => {
    expect(buildCompanyModel(EMPTY_CTX).confidence).toBe("none");
  });

  it("1 alan dolu → low", () => {
    const result = buildCompanyModel(ctx({ facts: [item("industry", "İnşaat")] }));
    expect(result.confidence).toBe("low");
  });

  it("2 alan dolu → low", () => {
    const result = buildCompanyModel(
      ctx({ facts: [item("industry", "İnşaat"), item("city", "İzmir")] }),
    );
    expect(result.confidence).toBe("low");
  });

  it("3 alan dolu → medium", () => {
    const result = buildCompanyModel(
      ctx({ facts: [item("industry", "İnşaat"), item("city", "İzmir"), item("team_size", "10")] }),
    );
    expect(result.confidence).toBe("medium");
  });

  it("4 alan dolu → medium", () => {
    const result = buildCompanyModel(
      ctx({
        facts: [
          item("industry", "İnşaat"),
          item("city", "İzmir"),
          item("team_size", "10"),
          item("cashflow_priority", "gergin"),
        ],
      }),
    );
    expect(result.confidence).toBe("medium");
  });

  it("5 alan dolu → high", () => {
    const result = buildCompanyModel(
      ctx({
        facts: [
          item("industry", "Perakende"),
          item("city", "Bursa"),
          item("team_size", "25"),
          item("cashflow_priority", "rahat"),
          item("primary_customer_type", "bireysel"),
        ],
      }),
    );
    expect(result.confidence).toBe("high");
  });

  it("6 alan dolu → high", () => {
    const result = buildCompanyModel(
      ctx({
        facts: [
          item("industry", "Perakende"),
          item("city", "Bursa"),
          item("team_size", "25"),
          item("cashflow_priority", "rahat"),
          item("primary_customer_type", "bireysel"),
        ],
        strategic: [item("top_goal", "Büyümek", { type: "STRATEGIC" })],
      }),
    );
    expect(result.confidence).toBe("high");
  });
});

// ─── learnedFacts ─────────────────────────────────────────────────────────────

describe("buildCompanyModel — learnedFacts", () => {
  it("tüm kategorilerden item'lar learnedFacts'e eklenir", () => {
    const result = buildCompanyModel(
      ctx({
        facts: [item("industry", "İnşaat")],
        processes: [item("main_challenge", "Tahsilat", { type: "PROCESS" })],
        strategic: [item("top_goal", "Büyüme", { type: "STRATEGIC" })],
        preferences: [item("decision_preference", "hızlı", { type: "PREFERENCE" })],
      }),
    );
    expect(result.learnedFacts).toHaveLength(4);
  });

  it("fact'ın key ve value'su learnedFacts'e aktarılır", () => {
    const result = buildCompanyModel(ctx({ facts: [item("industry", "Yazılım")] }));
    expect(result.learnedFacts[0].key).toBe("industry");
    expect(result.learnedFacts[0].value).toBe("Yazılım");
  });

  it("ONBOARDING source → 'onboarding' olarak eşlenir", () => {
    const result = buildCompanyModel(
      ctx({ facts: [item("industry", "Gıda", { source: "ONBOARDING" })] }),
    );
    expect(result.learnedFacts[0].source).toBe("onboarding");
  });

  it("SYSTEM_INFERRED source → 'inferred' olarak eşlenir", () => {
    const result = buildCompanyModel(
      ctx({ facts: [item("industry", "Gıda", { source: "SYSTEM_INFERRED" })] }),
    );
    expect(result.learnedFacts[0].source).toBe("inferred");
  });

  it("EVENT_DERIVED source → 'inferred' olarak eşlenir", () => {
    const result = buildCompanyModel(
      ctx({ facts: [item("industry", "Gıda", { source: "EVENT_DERIVED" })] }),
    );
    expect(result.learnedFacts[0].source).toBe("inferred");
  });

  it("USER_PROVIDED source → 'memory' olarak eşlenir", () => {
    const result = buildCompanyModel(
      ctx({ facts: [item("industry", "Gıda", { source: "USER_PROVIDED" })] }),
    );
    expect(result.learnedFacts[0].source).toBe("memory");
  });

  it("USER_CORRECTION source → 'memory' olarak eşlenir", () => {
    const result = buildCompanyModel(
      ctx({ facts: [item("industry", "Gıda", { source: "USER_CORRECTION" })] }),
    );
    expect(result.learnedFacts[0].source).toBe("memory");
  });

  it("bilinmeyen source → 'unknown' olarak eşlenir", () => {
    const result = buildCompanyModel(
      ctx({ facts: [item("industry", "Gıda", { source: "SOME_FUTURE_SOURCE" })] }),
    );
    expect(result.learnedFacts[0].source).toBe("unknown");
  });

  it("confidence 95 (0-100 skala) → 'high' olarak eşlenir", () => {
    const result = buildCompanyModel(
      ctx({ facts: [item("industry", "Gıda", { confidence: 95 })] }),
    );
    expect(result.learnedFacts[0].confidence).toBe("high");
  });

  it("confidence 50 (0-100 skala) → 'low' olarak eşlenir", () => {
    const result = buildCompanyModel(
      ctx({ facts: [item("industry", "Gıda", { confidence: 50 })] }),
    );
    expect(result.learnedFacts[0].confidence).toBe("low");
  });

  it("confidence 0.9 (0-1 skala) → 'high' olarak eşlenir", () => {
    const result = buildCompanyModel(
      ctx({ facts: [item("industry", "Gıda", { confidence: 0.9 })] }),
    );
    expect(result.learnedFacts[0].confidence).toBe("high");
  });

  it("boş context → learnedFacts boş dizi", () => {
    const result = buildCompanyModel(EMPTY_CTX);
    expect(result.learnedFacts).toHaveLength(0);
  });
});

// ─── Pure Function Özellikleri ────────────────────────────────────────────────

describe("buildCompanyModel — pure function özellikleri", () => {
  it("aynı girdi → aynı çıktı (determinizm)", () => {
    const input = ctx({ facts: [item("industry", "Tekstil")] });
    const a = buildCompanyModel(input);
    const b = buildCompanyModel(input);
    expect(a).toEqual(b);
  });

  it("girdi context değiştirilmiyor (immutability)", () => {
    const input = ctx({ facts: [item("industry", "Tekstil")] });
    const originalFactsLength = input.facts.length;
    buildCompanyModel(input);
    expect(input.facts.length).toBe(originalFactsLength);
  });

  it("null girdi referans eşitliği yok (yeni nesne döner)", () => {
    const a = buildCompanyModel(null);
    const b = buildCompanyModel(null);
    expect(a).not.toBe(b);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe("buildCompanyModel — edge cases", () => {
  it("aynı key facts ve strategic içinde varsa facts kazanır", () => {
    // gatherAllItems: facts önce, strategic sonra — pickValue ilk eşleşeni alır
    const result = buildCompanyModel(
      ctx({
        facts: [item("industry", "facts-değeri")],
        strategic: [item("industry", "strategic-değeri", { type: "STRATEGIC" })],
      }),
    );
    expect(result.industry).toBe("facts-değeri");
  });

  it("key araması büyük harf 'Industry' → eşleşir", () => {
    const result = buildCompanyModel(ctx({ facts: [item("Industry", "Tekstil")] }));
    expect(result.industry).toBe("Tekstil");
  });

  it("key araması büyük harf 'INDUSTRY' → eşleşir", () => {
    const result = buildCompanyModel(ctx({ facts: [item("INDUSTRY", "Tekstil")] }));
    expect(result.industry).toBe("Tekstil");
  });

  it("key araması küçük harf 'industry' → eşleşir", () => {
    const result = buildCompanyModel(ctx({ facts: [item("industry", "Tekstil")] }));
    expect(result.industry).toBe("Tekstil");
  });

  it("value baştaki ve sondaki boşluklar trim edilir: '  İnşaat  ' → 'İnşaat'", () => {
    const result = buildCompanyModel(ctx({ facts: [item("industry", "  İnşaat  ")] }));
    expect(result.industry).toBe("İnşaat");
  });

  it("value sadece boşluksa null döner", () => {
    const result = buildCompanyModel(ctx({ facts: [item("industry", "   ")] }));
    expect(result.industry).toBeNull();
  });

  it("negatif team_size → null", () => {
    const result = buildCompanyModel(ctx({ facts: [item("team_size", "-5")] }));
    expect(result.teamSize).toBeNull();
  });

  it("learnedFacts sıralaması deterministik: facts → processes → strategic → preferences", () => {
    const result = buildCompanyModel(
      ctx({
        facts:       [item("f-key", "f-val")],
        processes:   [item("p-key", "p-val", { type: "PROCESS" })],
        strategic:   [item("s-key", "s-val", { type: "STRATEGIC" })],
        preferences: [item("pr-key", "pr-val", { type: "PREFERENCE" })],
      }),
    );
    expect(result.learnedFacts[0].key).toBe("f-key");
    expect(result.learnedFacts[1].key).toBe("p-key");
    expect(result.learnedFacts[2].key).toBe("s-key");
    expect(result.learnedFacts[3].key).toBe("pr-key");
  });
});
