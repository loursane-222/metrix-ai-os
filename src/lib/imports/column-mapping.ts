import { createOpenAiProvider } from "@/lib/ai/providers/openai-provider";
import { mockProvider } from "@/lib/ai/providers/mock-provider";
import { resolveConfiguredAiProvider } from "@/lib/ai/providers/provider-policy";
import type { MemoryContext } from "@/lib/memory/memory-context.types";

// Shared by all 9 domain header-mapping modules (customer, product, invoice,
// supplier, payment, offer, order, stock, production) — one algorithm to
// keep correct instead of nine copies that can silently drift apart.

export const normalizeHeader = (value: string) =>
  value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// Aliases at least this long are also matched as a substring of the
// normalized header ("İsim/Ünvan" → contains "unvan"), not just an exact
// match — real spreadsheets combine or extend the canonical wording far
// more often than they use it verbatim. Shorter aliases stay exact-match
// only: as a substring inside an unrelated longer word they're a real
// false-positive risk that a few more letters of context removes. Live
// testing caught this at exactly 4 characters — "isim" (name) as a fuzzy
// alias matched inside "iletişim" (contact/communication), a completely
// unrelated, extremely common header word that happens to contain it —
// and a phone-number column got claimed as the customer's name before
// the AI fallback (and its own value-shape safety check) ever ran. 5 is
// the shortest length that survived a real file without a collision.
const CONTAINS_MATCH_MIN_LENGTH = 5;

export type ColumnMapping<TField extends string> = Readonly<{
  mapping: Readonly<Record<string, TField | "unmapped">>;
  unmapped: readonly string[];
}>;

export function detectColumnMapping<TField extends string>(
  headers: readonly string[],
  fields: readonly TField[],
  aliases: Readonly<Record<TField, readonly string[]>>,
): ColumnMapping<TField> {
  const mapping: Record<string, TField | "unmapped"> = {};
  const claimedFields = new Set<TField>();
  for (const header of headers) {
    const needle = normalizeHeader(header);
    // Exact match always wins over a fuzzy one, checked across every field
    // before any field's substring match is even considered — a short,
    // generic alias like "cari" is deliberately a substring of a more
    // specific sibling header's own exact alias ("carikod" for cariKodu),
    // and checking substrings first would let the generic one shadow the
    // specific one purely because of field list order.
    const field = needle
      ? fields.find((candidate) => !claimedFields.has(candidate) && aliases[candidate].includes(needle))
        ?? fields.find((candidate) =>
          !claimedFields.has(candidate)
          && aliases[candidate].some((alias) => alias.length >= CONTAINS_MATCH_MIN_LENGTH && needle.includes(alias)),
        )
      : undefined;
    if (field) {
      mapping[header] = field;
      claimedFields.add(field);
    } else {
      mapping[header] = "unmapped";
    }
  }
  const unmapped = headers.filter((header) => mapping[header] === "unmapped");
  return { mapping, unmapped };
}

const emptyContext: MemoryContext = {
  version: "v1",
  generatedAt: new Date(0).toISOString(),
  organizationId: "",
  totalIncluded: 0,
  facts: [],
  processes: [],
  strategic: [],
  preferences: [],
  highlights: [],
  conflicts: [],
};

const headerMappingAiProvider = createOpenAiProvider({ maxOutputTokens: 400, temperature: 0 });

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
}

// A field whose real-world values are always/never digit-only. Used as a
// sanity check on the AI's proposed mapping, independent of what the model
// said — live testing caught it confidently mapping a phone-number column
// ("İletişim Numarası", sample "05551234567") to a customer NAME field
// from the header text alone. Giving the model the sample value fixes the
// obvious cases; this catches ones that don't fit either heuristic.
export type ValueShapeConstraint = "must-be-digits" | "must-not-be-digits";

function violatesValueShape(sampleValue: string | null, constraint: ValueShapeConstraint | undefined): boolean {
  if (!sampleValue || !constraint) return false;
  const isDigitsOnly = /^\d+$/.test(sampleValue.replace(/[\s()+\-.,]/g, ""));
  if (constraint === "must-be-digits") return !isDigitsOnly;
  return isDigitsOnly;
}

export type UnmappedHeaderWithSample = Readonly<{ header: string; sampleValue: string | null }>;

// The deterministic pass above is the free, instant first line and covers
// the vast majority of real exports. No fixed alias list can anticipate
// every wording a spreadsheet uses ("İsim/Ünvan" vs "Firma" vs "Cari
// Ünvanı"), so whatever's left unmapped after it goes through the model,
// asked to match by MEANING rather than exact wording — grounded in an
// actual sample value from the column, not just the header text, since
// header text alone is exactly what led the model to confidently map a
// phone-number column to a name field in live testing. Fails closed: any
// AI error, malformed response, or a proposed mapping that fails the
// value-shape check for its field leaves the affected header unmapped,
// exactly as if this fallback hadn't run, rather than risking a wrong
// field assignment — a header left unmapped is a visibly missing column
// in the preview table; a wrongly mapped one silently populates the wrong
// field.
export async function resolveUnmappedHeadersWithAi<TField extends string>(input: {
  unmappedHeaders: readonly UnmappedHeaderWithSample[];
  candidateFields: ReadonlyArray<{ field: TField; label: string; valueShape?: ValueShapeConstraint; required?: boolean }>;
}): Promise<Readonly<Partial<Record<string, TField>>>> {
  if (input.unmappedHeaders.length === 0 || input.candidateFields.length === 0) return {};
  try {
    const provider = resolveConfiguredAiProvider() === "openai" ? headerMappingAiProvider : mockProvider;
    const requiredFields = input.candidateFields.filter((item) => item.required).map((item) => item.field);
    const systemPrompt = [
      "Bir Excel/CSV içe aktarma aracının parçasısın. Görevin, kullanıcının dosyasındaki sütun başlıklarını sistemin beklediği alanlarla ANLAM bakımından eşleştirmek — kelimenin birebir aynısı olması gerekmiyor.",
      "Her başlığın yanında o sütundan gerçek bir örnek değer verilecek. Kararını başlık metninden ÇOK örnek değere dayandır — başlık yanıltıcı olabilir ama gerçek veri değeri hangi alana ait olduğunu netleştirir (örn. sayısal bir telefon numarası asla bir isim alanına ait olamaz).",
      requiredFields.length > 0
        ? `Şu alanlar ZORUNLUDUR ve dolmazsa satır hiç içe aktarılmaz: ${requiredFields.join(", ")}. Bir sütun birden fazla benzer alana uyabiliyorsa (örn. hem genel isim hem resmî/ticari ünvan olabilir) ve adaylardan biri zorunluysa, o sütunu daha spesifik ama zorunlu OLMAYAN bir alana atamak yerine zorunlu alana ata — zorunlu alanı boş bırakmak satırın tamamen atlanmasına yol açar.`
        : null,
      "Yalnızca geçerli JSON döndür, başka hiçbir metin ekleme. Format: {\"başlık metni\": \"alanAdi\"}.",
      "Yalnızca verilen alan adı listesindeki değerleri kullan. Emin olmadığın başlıkları JSON çıktısına hiç dahil etme — tahmin üretme.",
      "Her alan adını en fazla bir başlığa ata.",
    ].filter((line): line is string => Boolean(line)).join("\n");
    const userMessage = [
      "Beklenen alanlar (alanAdi: açıklama):",
      ...input.candidateFields.map(({ field, label, required }) => `- ${field}: ${label}${required ? " (ZORUNLU)" : ""}`),
      "",
      "Eşleştirilecek sütun başlıkları (örnek değerleriyle):",
      ...input.unmappedHeaders.map(({ header, sampleValue }) => `- ${header}${sampleValue ? ` — örnek değer: "${sampleValue}"` : " — örnek değer yok"}`),
    ].join("\n");
    const response = await provider.generateResponse({ systemPrompt, userMessage, context: emptyContext });
    const parsed: unknown = JSON.parse(stripFence(response.content));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const fieldConstraints = new Map<string, ValueShapeConstraint | undefined>(input.candidateFields.map((item) => [item.field, item.valueShape]));
    const validFields = new Set<string>(input.candidateFields.map((item) => item.field));
    const result: Partial<Record<string, TField>> = {};
    const claimedFields = new Set<TField>();
    for (const { header, sampleValue } of input.unmappedHeaders) {
      const value = (parsed as Record<string, unknown>)[header];
      if (typeof value !== "string" || !validFields.has(value) || claimedFields.has(value as TField)) continue;
      if (violatesValueShape(sampleValue, fieldConstraints.get(value))) {
        console.warn("[column_mapping_ai_fallback] rejected a mapping that failed its field's value-shape check", { header, field: value, sampleValue });
        continue;
      }
      result[header] = value as TField;
      claimedFields.add(value as TField);
    }
    return result;
  } catch (error) {
    console.warn("[column_mapping_ai_fallback] failed", { errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return {};
  }
}

function firstNonEmptyValue(rows: readonly Record<string, string>[], header: string): string | null {
  for (const row of rows) {
    const value = row[header];
    if (value) return value;
  }
  return null;
}

// Single entry point each domain's import service calls: runs the free
// deterministic pass first, and only spends an AI call on whatever's left
// unmapped (often nothing, so the common case stays instant).
export async function detectColumnMappingWithAiFallback<TField extends string>(
  headers: readonly string[],
  rows: readonly Record<string, string>[],
  fields: readonly TField[],
  aliases: Readonly<Record<TField, readonly string[]>>,
  labels: Readonly<Record<TField, string>>,
  valueShapes?: Partial<Record<TField, ValueShapeConstraint>>,
  requiredFields?: readonly TField[],
): Promise<ColumnMapping<TField>> {
  const deterministic = detectColumnMapping(headers, fields, aliases);
  if (deterministic.unmapped.length === 0) return deterministic;
  const claimed = new Set<TField>();
  for (const value of Object.values(deterministic.mapping)) {
    if (value !== "unmapped") claimed.add(value as TField);
  }
  const requiredSet = new Set<TField>(requiredFields ?? []);
  const candidateFields = fields.filter((field) => !claimed.has(field)).map((field) => ({ field, label: labels[field], valueShape: valueShapes?.[field], required: requiredSet.has(field) }));
  const unmappedHeaders = deterministic.unmapped.map((header) => ({ header, sampleValue: firstNonEmptyValue(rows, header) }));
  const aiMapping = await resolveUnmappedHeadersWithAi({ unmappedHeaders, candidateFields });
  if (Object.keys(aiMapping).length === 0) return deterministic;
  const mapping: Record<string, TField | "unmapped"> = { ...deterministic.mapping };
  for (const [header, field] of Object.entries(aiMapping)) {
    if (field) mapping[header] = field;
  }
  const unmapped = headers.filter((header) => mapping[header] === "unmapped");
  return { mapping, unmapped };
}
