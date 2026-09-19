// Schema-only diagnostics for the BizimHesap responses. BizimHesap
// publishes no response example for /products, /warehouses or /inventory,
// so the first real-account run has to be able to say WHY a body was not
// understood without anyone reading the body itself.
//
// What is emitted is structure only: HTTP status, JSON top-level type,
// item count, key NAMES of the first item (or of the object) and which of
// the parser's known id/name keys were found. Never a value, never a
// header, never the request — so nothing merchant- or customer-specific
// can reach a log or the browser.

// The field names the sync parser recognises. Shared so the diagnostic
// reports exactly what the parser looks for, not a copy that can drift.
export const RECORD_ID_KEYS = ["id", "Id", "ID", "code", "Code"] as const;
export const RECORD_NAME_KEYS = [
  "name",
  "Name",
  "title",
  "Title",
  "warehouseName",
  "productName"
] as const;

const MAX_KEYS = 30;
const MAX_KEY_LENGTH = 40;

export type BizimHesapSchemaDiagnostic = {
  endpoint: string;
  status?: number;
  topLevel: "array" | "object" | "empty" | "scalar" | "unparseable";
  count?: number;
  keys: string[];
  // Object bodies only: keys whose value is a list (e.g. a wrapped "data").
  listKeys: string[];
  recognizedId: string | null;
  recognizedName: string | null;
};

function keyNames(record: Record<string, unknown>): string[] {
  return Object.keys(record)
    .slice(0, MAX_KEYS)
    .map((key) => key.slice(0, MAX_KEY_LENGTH));
}

function firstRecognised(
  record: Record<string, unknown>,
  candidates: readonly string[]
): string | null {
  return candidates.find((key) => record[key] !== undefined) ?? null;
}

export function describeBizimHesapSchema(
  endpoint: string,
  body: unknown,
  status?: number
): BizimHesapSchemaDiagnostic {
  const base = { endpoint, ...(status === undefined ? {} : { status }) };

  if (Array.isArray(body)) {
    const first = body.find(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null && !Array.isArray(item)
    );

    return {
      ...base,
      topLevel: body.length === 0 ? "empty" : "array",
      count: body.length,
      keys: first ? keyNames(first) : [],
      listKeys: [],
      recognizedId: first ? firstRecognised(first, RECORD_ID_KEYS) : null,
      recognizedName: first ? firstRecognised(first, RECORD_NAME_KEYS) : null
    };
  }

  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;

    return {
      ...base,
      topLevel: "object",
      keys: keyNames(record),
      listKeys: keyNames(
        Object.fromEntries(
          Object.entries(record).filter(([, value]) => Array.isArray(value))
        )
      ),
      recognizedId: null,
      recognizedName: null
    };
  }

  return {
    ...base,
    topLevel: body === undefined ? "unparseable" : "scalar",
    keys: [],
    listKeys: [],
    recognizedId: null,
    recognizedName: null
  };
}

export function logBizimHesapSchema(diagnostic: BizimHesapSchemaDiagnostic) {
  console.warn("[bizimhesap:schema]", JSON.stringify(diagnostic));
}
