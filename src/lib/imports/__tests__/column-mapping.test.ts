import { describe, expect, it, vi, beforeEach } from "vitest";

const generateResponse = vi.fn();

vi.mock("@/lib/ai/providers/provider-policy", () => ({
  resolveConfiguredAiProvider: () => "openai",
}));
vi.mock("@/lib/ai/providers/openai-provider", () => ({
  createOpenAiProvider: () => ({ name: "openai", generateResponse }),
}));

const { detectColumnMapping, detectColumnMappingWithAiFallback, resolveUnmappedHeadersWithAi } = await import("../column-mapping");

type TestField = "displayName" | "amount";
const FIELDS: readonly TestField[] = ["displayName", "amount"];
const ALIASES: Record<TestField, readonly string[]> = {
  displayName: ["unvan", "musteri"],
  amount: ["tutar"],
};
const LABELS: Record<TestField, string> = {
  displayName: "Müşteri Adı",
  amount: "Tutar",
};

function withSample(header: string, sampleValue: string | null = null) {
  return { header, sampleValue };
}

beforeEach(() => {
  generateResponse.mockReset();
});

describe("detectColumnMapping — exact vs fuzzy priority", () => {
  it("prefers an exact match over a shorter field's fuzzy substring match", () => {
    // "cari" (a real generic alias elsewhere) is a substring of "cariadi" —
    // this stays deterministic-only (no unmapped headers), but proves the
    // exact-first ordering the AI-fallback tests below rely on.
    const { mapping } = detectColumnMapping(["Ünvan"], FIELDS, ALIASES);
    expect(mapping["Ünvan"]).toBe("displayName");
  });
});

describe("resolveUnmappedHeadersWithAi", () => {
  it("adopts a valid AI-suggested mapping for headers the deterministic pass missed", async () => {
    generateResponse.mockResolvedValue({ content: JSON.stringify({ "İsim Soyisim": "displayName", "Toplam Bedel": "amount" }), model: "test", provider: "openai" });
    const result = await resolveUnmappedHeadersWithAi<TestField>({
      unmappedHeaders: [withSample("İsim Soyisim", "Ahmet Yılmaz"), withSample("Toplam Bedel", "1500")],
      candidateFields: [{ field: "displayName", label: LABELS.displayName }, { field: "amount", label: LABELS.amount }],
    });
    expect(result).toEqual({ "İsim Soyisim": "displayName", "Toplam Bedel": "amount" });
  });

  it("ignores a field name the AI invented that isn't in the candidate list", async () => {
    generateResponse.mockResolvedValue({ content: JSON.stringify({ "Notlar": "notes" }), model: "test", provider: "openai" });
    const result = await resolveUnmappedHeadersWithAi<TestField>({
      unmappedHeaders: [withSample("Notlar")],
      candidateFields: [{ field: "displayName", label: LABELS.displayName }],
    });
    expect(result).toEqual({});
  });

  it("only keeps the first claim of a field the AI assigned to two headers", async () => {
    generateResponse.mockResolvedValue({ content: JSON.stringify({ "Ad": "displayName", "Soyad": "displayName" }), model: "test", provider: "openai" });
    const result = await resolveUnmappedHeadersWithAi<TestField>({
      unmappedHeaders: [withSample("Ad", "Ahmet"), withSample("Soyad", "Yılmaz")],
      candidateFields: [{ field: "displayName", label: LABELS.displayName }],
    });
    expect(result).toEqual({ "Ad": "displayName" });
  });

  it("fails closed (returns no mapping) when the AI returns malformed JSON", async () => {
    generateResponse.mockResolvedValue({ content: "bu bir JSON değil", model: "test", provider: "openai" });
    const result = await resolveUnmappedHeadersWithAi<TestField>({
      unmappedHeaders: [withSample("Bilinmeyen Sütun")],
      candidateFields: [{ field: "displayName", label: LABELS.displayName }],
    });
    expect(result).toEqual({});
  });

  it("fails closed when the provider call itself throws", async () => {
    generateResponse.mockRejectedValue(new Error("network down"));
    const result = await resolveUnmappedHeadersWithAi<TestField>({
      unmappedHeaders: [withSample("Bilinmeyen Sütun")],
      candidateFields: [{ field: "displayName", label: LABELS.displayName }],
    });
    expect(result).toEqual({});
  });

  it("never calls the AI when nothing is left unmapped", async () => {
    const result = await resolveUnmappedHeadersWithAi<TestField>({ unmappedHeaders: [], candidateFields: [{ field: "displayName", label: LABELS.displayName }] });
    expect(result).toEqual({});
    expect(generateResponse).not.toHaveBeenCalled();
  });

  // Live production repro: the AI confidently mapped a phone-number column
  // ("İletişim Numarası", sample "05551234567") to a customer NAME field
  // when only given the header text. A name field can never be a bare
  // digit string — reject the proposed mapping instead of trusting it.
  it("rejects a proposed mapping whose sample value fails the field's value-shape check", async () => {
    generateResponse.mockResolvedValue({ content: JSON.stringify({ "İletişim Numarası": "displayName" }), model: "test", provider: "openai" });
    const result = await resolveUnmappedHeadersWithAi<TestField>({
      unmappedHeaders: [withSample("İletişim Numarası", "05551234567")],
      candidateFields: [{ field: "displayName", label: LABELS.displayName, valueShape: "must-not-be-digits" }],
    });
    expect(result).toEqual({});
  });

  it("accepts a proposed mapping whose sample value satisfies the field's value-shape check", async () => {
    generateResponse.mockResolvedValue({ content: JSON.stringify({ "İletişim Numarası": "amount" }), model: "test", provider: "openai" });
    const result = await resolveUnmappedHeadersWithAi<TestField>({
      unmappedHeaders: [withSample("İletişim Numarası", "05551234567")],
      candidateFields: [{ field: "amount", label: LABELS.amount, valueShape: "must-be-digits" }],
    });
    expect(result).toEqual({ "İletişim Numarası": "amount" });
  });
});

describe("detectColumnMappingWithAiFallback", () => {
  it("skips the AI call entirely when the deterministic pass already mapped everything", async () => {
    const { mapping, unmapped } = await detectColumnMappingWithAiFallback(["Ünvan", "Tutar"], [], FIELDS, ALIASES, LABELS);
    expect(mapping["Ünvan"]).toBe("displayName");
    expect(mapping["Tutar"]).toBe("amount");
    expect(unmapped).toEqual([]);
    expect(generateResponse).not.toHaveBeenCalled();
  });

  it("only asks the AI about fields the deterministic pass left unclaimed, using a real sample value from the rows", async () => {
    generateResponse.mockImplementation(async (input: { userMessage: string }) => {
      // "Ünvan" already claimed displayName deterministically — it must
      // not be offered to the AI as a candidate field to reassign.
      expect(input.userMessage).not.toContain("displayName:");
      expect(input.userMessage).toContain("amount:");
      expect(input.userMessage).toContain("2500");
      return { content: JSON.stringify({ "Fiyat": "amount", "İsim": "displayName" }), model: "test", provider: "openai" };
    });
    const rows = [{ "Ünvan": "Acme", "Fiyat": "2500", "İsim": "irrelevant" }];
    const { mapping, unmapped } = await detectColumnMappingWithAiFallback(["Ünvan", "Fiyat", "İsim"], rows, FIELDS, ALIASES, LABELS);
    expect(mapping["Ünvan"]).toBe("displayName");
    expect(mapping["Fiyat"]).toBe("amount");
    // The AI's (redundant, out-of-candidate-list) suggestion for "İsim"
    // must not resurrect an already-claimed field.
    expect(mapping["İsim"]).toBe("unmapped");
    expect(unmapped).toEqual(["İsim"]);
  });
});
