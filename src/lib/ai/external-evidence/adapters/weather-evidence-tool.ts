import type { ExternalEvidenceResult, ExternalEvidenceTool } from "../external-evidence.types";
import { fetchJson } from "./fetch-with-timeout";

// Real current/forecast weather evidence via Open-Meteo — free, keyless,
// structured JSON, no API key/registration required. Location is resolved
// through Open-Meteo's own geocoding endpoint first (distinct from the
// Nominatim geocoder used by places/routes: Open-Meteo's geocoder is
// purpose-built for the city/place names weather questions use).
export type WeatherEvidencePayload = Readonly<{
  resolvedLocation: string;
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationProbabilityPercent: number;
  conditionCode: number;
}>;

export type WeatherEvidenceQuery = Readonly<{ location: string; when: "today" | "tomorrow" }>;

type GeocodingResponse = { results?: Array<{ name: string; latitude: number; longitude: number; country?: string }> };
type ForecastResponse = {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    weathercode: number[];
  };
};

export function createWeatherEvidenceTool(): ExternalEvidenceTool {
  return {
    capability: "weather",
    async fetch(query: string): Promise<ExternalEvidenceResult> {
      const retrievedAt = new Date().toISOString();
      let params: WeatherEvidenceQuery;
      try {
        params = JSON.parse(query) as WeatherEvidenceQuery;
      } catch {
        return { status: "FAILED", capability: "weather", query, retrievedAt, failureReason: "invalid_response" };
      }
      if (!params.location?.trim()) {
        return { status: "FAILED", capability: "weather", query, retrievedAt, failureReason: "invalid_response" };
      }

      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: params.location, count: "1", language: "tr" })}`;
      const geoOutcome = await fetchJson<GeocodingResponse>(geoUrl);
      if (!geoOutcome.ok) {
        return { status: "FAILED", capability: "weather", query, retrievedAt, failureReason: geoOutcome.reason };
      }
      const place = geoOutcome.data.results?.[0];
      if (!place) {
        return { status: "FAILED", capability: "weather", query, retrievedAt, failureReason: "no_results" };
      }

      const forecastUrl = `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode",
        timezone: "auto",
        forecast_days: "2",
      })}`;
      const forecastOutcome = await fetchJson<ForecastResponse>(forecastUrl);
      if (!forecastOutcome.ok) {
        return { status: "FAILED", capability: "weather", query, retrievedAt, failureReason: forecastOutcome.reason };
      }

      const dayIndex = params.when === "tomorrow" ? 1 : 0;
      const daily = forecastOutcome.data.daily;
      if (!daily.time[dayIndex]) {
        return { status: "FAILED", capability: "weather", query, retrievedAt, failureReason: "no_results" };
      }

      const payload: WeatherEvidencePayload = {
        resolvedLocation: `${place.name}${place.country ? `, ${place.country}` : ""}`,
        date: daily.time[dayIndex]!,
        tempMaxC: daily.temperature_2m_max[dayIndex]!,
        tempMinC: daily.temperature_2m_min[dayIndex]!,
        precipitationProbabilityPercent: daily.precipitation_probability_max[dayIndex]!,
        conditionCode: daily.weathercode[dayIndex]!,
      };
      return {
        status: "SUCCESS",
        capability: "weather",
        query,
        retrievedAt,
        observedAt: daily.time[dayIndex]!,
        provenance: [{ providerId: "open_meteo", sourceName: "Open-Meteo", sourceUrl: "https://open-meteo.com" }],
        payload,
      };
    },
  };
}
