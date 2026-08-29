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

export type ReportSubmissionOutcome =
  | { status: "NO_OPEN_SUBMISSION" }
  | { status: "PARSE_FAILED" }
  | { status: "PARTIAL"; templateName: string; answeredNow: readonly string[]; remainingQuestions: readonly string[] }
  | { status: "SUBMITTED"; templateName: string; answeredNow: readonly string[] };

export function submitReportAnswerMessage(message: string, correlationId = crypto.randomUUID()) {
  return request<{ report: ReportSubmissionOutcome }>(
    "/api/reports/submission",
    { message },
    { "X-Correlation-Id": correlationId },
  );
}

export type ReportReviewOutcome =
  | { status: "PARSE_FAILED" }
  | { status: "DENIED" }
  | { status: "REP_NOT_FOUND" }
  | { status: "REP_AMBIGUOUS"; options: readonly string[] }
  | { status: "NO_PENDING_SUBMISSION"; repFullName: string }
  | { status: "REVIEWED"; repFullName: string; decision: "APPROVED" | "NEEDS_REVISION"; templateName: string };

export function submitReportReviewMessage(message: string, correlationId = crypto.randomUUID()) {
  return request<{ review: ReportReviewOutcome }>(
    "/api/reports/review",
    { message },
    { "X-Correlation-Id": correlationId },
  );
}
