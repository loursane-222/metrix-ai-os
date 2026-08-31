import type { ExternalEvidenceResult, ExternalEvidenceTool } from "../external-evidence.types";
import { fetchJson } from "./fetch-with-timeout";
import { geocodeAddress } from "./osm-geocoding";

// Real route/travel-time evidence: geocode origin+destination via
// Nominatim, then compute the route via OSRM's public demo routing server
// (free, keyless). Baseline routability only — this server does not report
// live traffic, so the payload never claims a "current" traffic condition
// (Phase C, section 9's "do not claim live traffic if provider does not
// provide it"). Read-only: computes evidence only, never books or sends
// anything (section 16).
export type RoutesEvidencePayload = Readonly<{
  origin: string;
  destination: string;
  distanceKm: number;
  durationMinutes: number;
  mode: "driving";
  trafficAware: false;
}>;

export type RoutesEvidenceQuery = Readonly<{ origin: string; destination: string }>;

type OsrmRouteResponse = {
  code: string;
  routes?: Array<{ distance: number; duration: number }>;
};

export function createRoutesEvidenceTool(): ExternalEvidenceTool {
  return {
    capability: "routes",
    async fetch(query: string): Promise<ExternalEvidenceResult> {
      const retrievedAt = new Date().toISOString();
      let params: RoutesEvidenceQuery;
      try {
        params = JSON.parse(query) as RoutesEvidenceQuery;
      } catch {
        return { status: "FAILED", capability: "routes", query, retrievedAt, failureReason: "invalid_response" };
      }
      if (!params.origin?.trim() || !params.destination?.trim()) {
        return { status: "FAILED", capability: "routes", query, retrievedAt, failureReason: "invalid_response" };
      }

      const [origin, destination] = await Promise.all([
        geocodeAddress(params.origin),
        geocodeAddress(params.destination),
      ]);
      if (!origin || !destination) {
        return { status: "FAILED", capability: "routes", query, retrievedAt, failureReason: "no_results" };
      }

      const url = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=false`;
      const outcome = await fetchJson<OsrmRouteResponse>(url);
      if (!outcome.ok) {
        return { status: "FAILED", capability: "routes", query, retrievedAt, failureReason: outcome.reason };
      }
      const route = outcome.data.routes?.[0];
      if (outcome.data.code !== "Ok" || !route) {
        return { status: "FAILED", capability: "routes", query, retrievedAt, failureReason: "no_results" };
      }

      const payload: RoutesEvidencePayload = {
        origin: origin.displayName,
        destination: destination.displayName,
        distanceKm: Math.round((route.distance / 1000) * 10) / 10,
        durationMinutes: Math.round(route.duration / 60),
        mode: "driving",
        trafficAware: false,
      };
      return {
        status: "SUCCESS",
        capability: "routes",
        query,
        retrievedAt,
        provenance: [{ providerId: "osrm", sourceName: "OSRM routing", sourceUrl: "https://project-osrm.org" }],
        payload,
      };
    },
  };
}
