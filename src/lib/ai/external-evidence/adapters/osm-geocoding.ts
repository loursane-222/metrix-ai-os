import { fetchJson } from "./fetch-with-timeout";

// Shared geocoder for the places and routes adapters — OpenStreetMap's
// Nominatim, free and keyless. A distinct, descriptive User-Agent is
// required by Nominatim's usage policy (unauthenticated requests without
// one are rejected/rate-limited more aggressively).
const NOMINATIM_USER_AGENT = "metrix-ai-os external-evidence (contact: ops@metrixgm.com)";

export type GeocodedLocation = Readonly<{
  displayName: string;
  lat: number;
  lon: number;
}>;

type NominatimSearchResult = Array<{
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  category?: string;
}>;

export async function geocodeAddress(query: string): Promise<GeocodedLocation | null> {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
  })}`;
  const outcome = await fetchJson<NominatimSearchResult>(url, { headers: { "User-Agent": NOMINATIM_USER_AGENT } });
  if (!outcome.ok || outcome.data.length === 0) return null;
  const first = outcome.data[0]!;
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { displayName: first.display_name, lat, lon };
}

export async function searchPlaces(query: string, limit = 5): Promise<NominatimSearchResult> {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: String(limit),
  })}`;
  const outcome = await fetchJson<NominatimSearchResult>(url, { headers: { "User-Agent": NOMINATIM_USER_AGENT } });
  return outcome.ok ? outcome.data : [];
}
