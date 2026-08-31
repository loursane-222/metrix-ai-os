import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCurrencyEvidenceTool } from "../adapters/currency-evidence-tool";
import { createWeatherEvidenceTool } from "../adapters/weather-evidence-tool";
import { createPlacesEvidenceTool } from "../adapters/places-evidence-tool";
import { createRoutesEvidenceTool } from "../adapters/routes-evidence-tool";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe("Phase C structured evidence adapters", () => {
  afterEach(() => vi.unstubAllGlobals());

  describe("currency", () => {
    it("does not call the provider for a same-currency conversion (rate is trivially 1)", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const tool = createCurrencyEvidenceTool();
      const result = await tool.fetch(JSON.stringify({ amount: 50, base: "TRY", quote: "TRY" }));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: "SUCCESS", payload: { rate: 1, convertedAmount: 50 } });
    });

    it("computes the converted amount from the real provider rate without inverting base/quote", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ amount: 1, base: "EUR", date: "2026-09-01", rates: { TRY: 52.5 } })));
      const tool = createCurrencyEvidenceTool();
      const result = await tool.fetch(JSON.stringify({ amount: 1000, base: "EUR", quote: "TRY" }));
      expect(result).toMatchObject({
        status: "SUCCESS",
        payload: { base: "EUR", quote: "TRY", rate: 52.5, amount: 1000, convertedAmount: 52500 },
      });
    });

    it("normalizes a provider failure to a structured FAILED result", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));
      const tool = createCurrencyEvidenceTool();
      const result = await tool.fetch(JSON.stringify({ amount: 1, base: "USD", quote: "TRY" }));
      expect(result).toMatchObject({ status: "FAILED", failureReason: "unavailable" });
    });

    it("rejects malformed query without ever calling the provider", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const tool = createCurrencyEvidenceTool();
      const result = await tool.fetch("not json");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: "FAILED", failureReason: "invalid_response" });
    });
  });

  describe("weather", () => {
    it("selects the correct forecast day for today vs tomorrow", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonResponse({ results: [{ name: "Ankara", latitude: 39.9, longitude: 32.8, country: "Türkiye" }] }))
        .mockResolvedValueOnce(jsonResponse({
          daily: {
            time: ["2026-09-01", "2026-09-02"],
            temperature_2m_max: [28, 30],
            temperature_2m_min: [16, 17],
            precipitation_probability_max: [0, 20],
            weathercode: [1, 3],
          },
        }));
      vi.stubGlobal("fetch", fetchMock);
      const tool = createWeatherEvidenceTool();
      const result = await tool.fetch(JSON.stringify({ location: "Ankara", when: "tomorrow" }));
      expect(result).toMatchObject({
        status: "SUCCESS",
        payload: { date: "2026-09-02", tempMaxC: 30, tempMinC: 17, precipitationProbabilityPercent: 20 },
      });
    });

    it("fails with no_results when the location cannot be geocoded", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [] })));
      const tool = createWeatherEvidenceTool();
      const result = await tool.fetch(JSON.stringify({ location: "Nonexistent Place Xyz", when: "today" }));
      expect(result).toMatchObject({ status: "FAILED", failureReason: "no_results" });
    });
  });

  describe("places", () => {
    it("shapes provider results into structured place evidence", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([
        { display_name: "The Italian Cut, Çankaya, Ankara", lat: "39.92", lon: "32.83", type: "restaurant" },
      ])));
      const tool = createPlacesEvidenceTool();
      const result = await tool.fetch(JSON.stringify({ query: "İtalyan restoranı", near: "Çankaya, Ankara" }));
      expect(result).toMatchObject({
        status: "SUCCESS",
        payload: { resultCount: 1, results: [{ name: "The Italian Cut", category: "restaurant" }] },
      });
    });

    it("fails with no_results when nothing is found", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
      const tool = createPlacesEvidenceTool();
      const result = await tool.fetch(JSON.stringify({ query: "hiçbir şey bulunmayacak sorgu", near: null }));
      expect(result).toMatchObject({ status: "FAILED", failureReason: "no_results" });
    });
  });

  describe("routes", () => {
    it("computes distance/duration and never claims live traffic", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonResponse([{ display_name: "İzmir, Türkiye", lat: "38.42", lon: "27.14" }]))
        .mockResolvedValueOnce(jsonResponse([{ display_name: "Bursa, Türkiye", lat: "40.18", lon: "29.06" }]))
        .mockResolvedValueOnce(jsonResponse({ code: "Ok", routes: [{ distance: 343899.7, duration: 11692.8 }] }));
      vi.stubGlobal("fetch", fetchMock);
      const tool = createRoutesEvidenceTool();
      const result = await tool.fetch(JSON.stringify({ origin: "İzmir", destination: "Bursa" }));
      expect(result).toMatchObject({
        status: "SUCCESS",
        payload: { distanceKm: 343.9, durationMinutes: 195, mode: "driving", trafficAware: false },
      });
    });

    it("fails with no_results when either endpoint cannot be geocoded", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
      const tool = createRoutesEvidenceTool();
      const result = await tool.fetch(JSON.stringify({ origin: "Nowhereville", destination: "Bursa" }));
      expect(result).toMatchObject({ status: "FAILED", failureReason: "no_results" });
    });
  });
});
