// Small shared helper for the Phase C structured-evidence adapters
// (currency/weather/places/routes) — they all call plain public REST APIs
// via fetch, none needs an SDK, but each needs the same timeout/JSON
// handling. Kept here instead of duplicated four times.
export type FetchJsonOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "timeout" | "unavailable" | "invalid_response" };

export async function fetchJson<T>(url: string, options: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<FetchJsonOutcome<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: options.headers });
    if (!response.ok) return { ok: false, reason: "unavailable" };
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") return { ok: false, reason: "timeout" };
    return { ok: false, reason: "invalid_response" };
  } finally {
    clearTimeout(timeout);
  }
}
