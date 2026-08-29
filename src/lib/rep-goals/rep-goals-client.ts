export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function request<T>(path: string, body: Record<string, unknown>, headers?: Record<string, string>): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: true; data: T } | { ok: false; error: { message: string } };
    if (json.ok) return { ok: true, data: json.data };
    return { ok: false, error: json.error.message };
  } catch {
    return { ok: false, error: "Baglanti kurulamadi." };
  }
}

export type RepGoalCreateOutcome =
  | { status: "PARSE_FAILED" }
  | { status: "DENIED" }
  | { status: "REP_NOT_FOUND" }
  | { status: "REP_AMBIGUOUS"; options: readonly string[] }
  | { status: "SET"; repFullName: string; visitTargetSet: boolean; salesTargetSet: boolean; collectionTargetSet: boolean };

export function submitRepGoalReport(message: string, correlationId = crypto.randomUUID()) {
  return request<{ report: RepGoalCreateOutcome }>(
    "/api/rep-goals/report",
    { message },
    { "X-Correlation-Id": correlationId },
  );
}
