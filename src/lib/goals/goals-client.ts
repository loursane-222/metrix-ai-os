export type GoalPeriod = "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";
export type GoalStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";
export type GoalScope = "COMPANY" | "TEAM" | "PERSON" | "CUSTOMER_SEGMENT" | "PRODUCT" | "BRANCH";
export type GoalType = "SALES" | "COLLECTION" | "REVENUE" | "GROSS_PROFIT" | "NEW_CUSTOMER" | "ACTIVITY" | "CUSTOM";
export type GoalRecord = { id: string; title: string; period: GoalPeriod; status: GoalStatus; targetRevenueCents: string | null; targetCollectionCents: string | null; targetValue: string | null; actualValue: string | null; forecastValue: string | null; startsAt: string | null; endsAt: string | null; scope: GoalScope; scopeRefId: string | null; goalType: GoalType; currency: string | null; ownerUserId: string | null; kpiDefinitionId: string | null; updatedAt: string };
export type GoalPayload = { title: string; period: GoalPeriod; targetRevenueCents?: number; targetCollectionCents?: number; startsAt?: string; endsAt?: string; scope?: GoalScope; goalType?: GoalType; currency?: string };
export type GoalUpdatePayload = Partial<Pick<GoalPayload, "title" | "period" | "targetRevenueCents" | "targetCollectionCents" | "startsAt" | "endsAt"> & { status: GoalStatus }>;
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function request<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
    const json = await response.json() as { ok?: boolean; data?: T; error?: { message?: string } };
    return response.ok && json.ok && json.data ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? "Hedef işlemi tamamlanamadı." };
  } catch { return { ok: false, error: "Bağlantı kurulamadı." }; }
}

export function listGoals(): Promise<Result<{ goals: GoalRecord[]; count: number }>> { return request("/api/goals"); }
export function getGoal(goalId: string): Promise<Result<{ goal: GoalRecord }>> { return request(`/api/goals/${encodeURIComponent(goalId)}`); }
export function createGoal(payload: GoalPayload): Promise<Result<{ goal: GoalRecord }>> { return request("/api/goals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
export function updateGoal(goalId: string, payload: GoalUpdatePayload): Promise<Result<{ goal: GoalRecord }>> { return request(`/api/goals/${encodeURIComponent(goalId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
export function cancelGoal(goalId: string): Promise<Result<{ archived: boolean }>> { return request(`/api/goals/${encodeURIComponent(goalId)}/archive`, { method: "POST" }); }
export function resolveGoalEditCommandRequest(goalId: string, payload: { utterance: string; activeTab: string }): Promise<Result<{ outcome: unknown }>> { return request(`/api/goals/${encodeURIComponent(goalId)}/actions/edit-command`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
export function resolveGoalCreateCommandRequest(payload: { utterance: string; activeTab: string }): Promise<Result<{ outcome: unknown }>> { return request("/api/goals/actions/create-command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
