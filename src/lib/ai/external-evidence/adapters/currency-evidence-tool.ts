import type { ExternalEvidenceResult, ExternalEvidenceTool } from "../external-evidence.types";
import { fetchJson } from "./fetch-with-timeout";

// Real current FX evidence via Frankfurter (European Central Bank
// reference rates, published daily) — free, keyless, structured JSON. No
// generic web-search fallback for currency: section 6/17 explicitly forbid
// presenting a scraped/unverified number as a canonical current rate.
export type CurrencyEvidencePayload = Readonly<{
  base: string;
  quote: string;
  rate: number;
  amount: number;
  convertedAmount: number;
  // The rate's own publication date, as reported by the provider — this is
  // the freshness signal that matters for FX, distinct from retrievedAt
  // (when METRIX fetched it).
  asOfDate: string;
}>;

export type CurrencyEvidenceQuery = Readonly<{ amount: number; base: string; quote: string }>;

type FrankfurterResponse = { amount: number; base: string; date: string; rates: Record<string, number> };

export function createCurrencyEvidenceTool(): ExternalEvidenceTool {
  return {
    capability: "currency",
    async fetch(query: string): Promise<ExternalEvidenceResult> {
      const retrievedAt = new Date().toISOString();
      let params: CurrencyEvidenceQuery;
      try {
        params = JSON.parse(query) as CurrencyEvidenceQuery;
      } catch {
        return { status: "FAILED", capability: "currency", query, retrievedAt, failureReason: "invalid_response" };
      }
      const base = params.base?.toUpperCase();
      const quote = params.quote?.toUpperCase();
      const amount = params.amount;
      if (!base || !quote || !Number.isFinite(amount) || amount <= 0) {
        return { status: "FAILED", capability: "currency", query, retrievedAt, failureReason: "invalid_response" };
      }
      if (base === quote) {
        const payload: CurrencyEvidencePayload = { base, quote, rate: 1, amount, convertedAmount: amount, asOfDate: retrievedAt.slice(0, 10) };
        return { status: "SUCCESS", capability: "currency", query, retrievedAt, provenance: [{ providerId: "frankfurter_ecb", sourceName: "Frankfurter (ECB reference rates)", sourceUrl: "https://frankfurter.dev" }], payload };
      }
      const url = `https://api.frankfurter.dev/v1/latest?${new URLSearchParams({ base, symbols: quote })}`;
      const outcome = await fetchJson<FrankfurterResponse>(url);
      if (!outcome.ok) {
        return { status: "FAILED", capability: "currency", query, retrievedAt, failureReason: outcome.reason };
      }
      const rate = outcome.data.rates[quote];
      if (typeof rate !== "number") {
        return { status: "FAILED", capability: "currency", query, retrievedAt, failureReason: "no_results" };
      }
      // Multiplication is done here, in code, deterministically — never left
      // to the model — so there is no risk of an LLM arithmetic or
      // base/quote-inversion mistake (Phase C, section 6).
      const payload: CurrencyEvidencePayload = {
        base,
        quote,
        rate,
        amount,
        convertedAmount: Math.round(amount * rate * 100) / 100,
        asOfDate: outcome.data.date,
      };
      return {
        status: "SUCCESS",
        capability: "currency",
        query,
        retrievedAt,
        observedAt: outcome.data.date,
        provenance: [{ providerId: "frankfurter_ecb", sourceName: "Frankfurter (ECB reference rates)", sourceUrl: "https://frankfurter.dev" }],
        payload,
      };
    },
  };
}
