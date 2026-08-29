import type { RepRequestDomain } from "./rep-request.types";

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

export type RepRequestProposeOutcome =
  | { status: "PARSE_FAILED" }
  | { status: "CUSTOMER_NOT_FOUND"; customerNameRaw: string }
  | { status: "CUSTOMER_AMBIGUOUS"; customerNameRaw: string; options: readonly string[] }
  | { status: "PROPOSED"; domain: RepRequestDomain; customerNameRaw: string };

export function proposeRepRequestMessage(domain: RepRequestDomain, message: string, correlationId = crypto.randomUUID()) {
  return request<{ report: RepRequestProposeOutcome }>(
    "/api/rep-requests/propose",
    { domain, message },
    { "X-Correlation-Id": correlationId },
  );
}

export type RepRequestReviewOutcome =
  | { status: "PARSE_FAILED" }
  | { status: "DENIED" }
  | { status: "REP_NOT_FOUND" }
  | { status: "REP_AMBIGUOUS"; options: readonly string[] }
  | { status: "NO_PENDING_REQUEST"; repFullName: string }
  | { status: "CANDIDATE_AMBIGUOUS"; repFullName: string; options: readonly string[] }
  | { status: "DECIDED"; decision: "APPROVE" | "REJECT"; domain: RepRequestDomain; repFullName: string; customerNameRaw: string };

export function reviewRepRequestMessage(message: string, correlationId = crypto.randomUUID()) {
  return request<{ review: RepRequestReviewOutcome }>(
    "/api/rep-requests/review",
    { message },
    { "X-Correlation-Id": correlationId },
  );
}
