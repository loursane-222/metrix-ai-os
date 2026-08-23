import { describe, expect, it, vi } from "vitest";

// canonical-contradiction-guard.ts imports ENTITY_PATTERNS from
// canonical-business-facts.service.ts (pure data), which also exports
// readCanonicalBusinessFactsForMessage and therefore imports prisma.ts at
// module load — stub it so loading this module doesn't require a real
// DATABASE_URL; nothing in this file executes a real query.
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

const { stripContradictingSentences } = await import("../canonical-contradiction-guard");
import type { CanonicalBusinessFacts } from "../canonical-business-facts.service";

function customerFacts(count: number): CanonicalBusinessFacts[] {
  return [{ entity: "customers", model: "Customer", count, records: [] }];
}

describe("stripContradictingSentences", () => {
  it("returns the text unchanged when there are no canonical facts to check against", () => {
    expect(stripContradictingSentences("Bir şey söylüyorum.", [])).toBe("Bir şey söylüyorum.");
  });

  it("removes a sentence that states a wrong customer count — the original Root Cause 2 bug", () => {
    const text = "Kesin değil, en az 3 müşteri biliniyor. Ayrıca güncel kayıtlarınızı gözden geçirmenizi öneririm.";
    const result = stripContradictingSentences(text, customerFacts(386));
    expect(result).not.toContain("3 müşteri");
    expect(result).toContain("güncel kayıtlarınızı gözden geçirmenizi öneririm");
  });

  it("keeps a sentence whose number matches the real canonical count", () => {
    const text = "Şirketinizde kayıtlı 386 müşteri var, bu sağlıklı bir büyüme gösteriyor.";
    expect(stripContradictingSentences(text, customerFacts(386))).toBe(text);
  });

  it("keeps sentences that mention the entity but contain no number at all", () => {
    const text = "Müşterileriniz genel olarak memnun görünüyor.";
    expect(stripContradictingSentences(text, customerFacts(386))).toBe(text);
  });

  it("keeps sentences about an entity type that has no canonical fact provided", () => {
    const text = "En az 12 açık göreviniz var.";
    expect(stripContradictingSentences(text, customerFacts(386))).toBe(text);
  });

  it("correctly parses Turkish thousands-separated numbers instead of splitting inside them", () => {
    const text = "Toplam 1.386 müşteri kaydı bulunuyor.";
    const result = stripContradictingSentences(text, customerFacts(386));
    // 1386 != 386, so this must be caught, not accidentally parsed as "1" and "386".
    expect(result).toBe("");
  });

  it("removes only the contradicting sentence, keeping the rest of the paragraph intact", () => {
    const text = "Finansal durumunuz iyi görünüyor. Kesin değil, en az 3 müşteri biliniyor. Tahsilat süreciniz düzenli işliyor.";
    const result = stripContradictingSentences(text, customerFacts(386));
    expect(result).toContain("Finansal durumunuz iyi görünüyor.");
    expect(result).toContain("Tahsilat süreciniz düzenli işliyor.");
    expect(result).not.toContain("en az 3 müşteri");
  });

  it("never lets a wrong count survive even when multiple canonical facts are checked at once", () => {
    const text = "386 müşteriniz ve 40 ürününüz var.";
    const facts: CanonicalBusinessFacts[] = [
      { entity: "customers", model: "Customer", count: 386, records: [] },
      { entity: "products", model: "ProductService", count: 12, records: [] },
    ];
    const result = stripContradictingSentences(text, facts);
    expect(result).toBe("");
  });
});
