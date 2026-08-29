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

export type FieldVisitReportOutcome =
  | { status: "PARSE_FAILED" }
  | {
      status: "LOGGED";
      fieldVisitId: string;
      customerNameRaw: string;
      customerResolved: boolean;
      requestTypes: readonly string[];
      orderCreated: boolean;
      paymentCreated: boolean;
    };

export function submitFieldVisitReport(message: string, correlationId = crypto.randomUUID()) {
  return request<{ report: FieldVisitReportOutcome }>(
    "/api/field-visits/report",
    { message },
    { "X-Correlation-Id": correlationId },
  );
}

export type FieldVisitWeeklySummary = {
  repUserId: string | null;
  weekStart: string;
  weekEnd: string;
  visitCount: number;
  distinctCustomerCount: number;
  distinctRepCount: number;
  requestTypeCounts: Readonly<Record<string, number>>;
  linkedOrderCount: number;
  linkedPaymentCount: number;
  linkedPaymentTotal: number;
  openUnresolvedIntentCount: number;
};

export type CompanyMonthlyGoalStatus = {
  monthlyTarget: number;
  monthToDateRevenue: number;
  forecastedMonthEndRevenue: number;
  goalAchievementRate: number;
  monthToDateCashCollection: number;
};

export type RepGoalStatus = {
  visitTarget: number | null;
  visitActual: number;
  salesTarget: number | null;
  salesActual: number;
  collectionTarget: number | null;
  collectionActual: number;
  // Present only for a TEAM-scope aggregate — the number of reps summed
  // into these totals.
  repCount?: number;
};

export type FieldVisitWeeklySummaryLookup =
  | { status: "ALLOWED"; summary: FieldVisitWeeklySummary; scope: "SELF" | "COLLEAGUE" | "TEAM"; repFullName: string | null; companyGoalStatus: CompanyMonthlyGoalStatus | null; personalGoalStatus: RepGoalStatus | null }
  | { status: "DENIED" }
  | { status: "NOT_FOUND" }
  | { status: "AMBIGUOUS"; options: readonly string[] };

export function fetchFieldVisitWeeklySummary(targetReference: string | null, correlationId = crypto.randomUUID()) {
  return request<{ lookup: FieldVisitWeeklySummaryLookup }>(
    "/api/field-visits/weekly-summary",
    { targetReference },
    { "X-Correlation-Id": correlationId },
  );
}
