import type { ExternalEvidenceResult, ExternalEvidenceTool } from "../external-evidence.types";
import { searchPlaces } from "./osm-geocoding";

// Real place-search evidence via OpenStreetMap/Nominatim — free, keyless.
// Read-only: this only finds and describes places, it never books, messages,
// or otherwise acts on them (Phase C, section 8/16).
export type PlacesEvidenceItem = Readonly<{
  name: string;
  address: string;
  category: string | null;
  lat: number;
  lon: number;
}>;

export type PlacesEvidencePayload = Readonly<{
  results: readonly PlacesEvidenceItem[];
  resultCount: number;
}>;

export type PlacesEvidenceQuery = Readonly<{ query: string; near: string | null }>;

export function createPlacesEvidenceTool(): ExternalEvidenceTool {
  return {
    capability: "places",
    async fetch(query: string): Promise<ExternalEvidenceResult> {
      const retrievedAt = new Date().toISOString();
      let params: PlacesEvidenceQuery;
      try {
        params = JSON.parse(query) as PlacesEvidenceQuery;
      } catch {
        return { status: "FAILED", capability: "places", query, retrievedAt, failureReason: "invalid_response" };
      }
      if (!params.query?.trim()) {
        return { status: "FAILED", capability: "places", query, retrievedAt, failureReason: "invalid_response" };
      }
      const searchText = params.near ? `${params.query} ${params.near}` : params.query;
      const raw = await searchPlaces(searchText, 5);
      if (raw.length === 0) {
        return { status: "FAILED", capability: "places", query, retrievedAt, failureReason: "no_results" };
      }
      const results: PlacesEvidenceItem[] = raw.map((item) => ({
        name: item.display_name.split(",")[0]!.trim(),
        address: item.display_name,
        category: item.type ?? item.category ?? null,
        lat: Number(item.lat),
        lon: Number(item.lon),
      }));
      const payload: PlacesEvidencePayload = { results, resultCount: results.length };
      return {
        status: "SUCCESS",
        capability: "places",
        query,
        retrievedAt,
        provenance: [{ providerId: "openstreetmap_nominatim", sourceName: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/copyright" }],
        payload,
      };
    },
  };
}
