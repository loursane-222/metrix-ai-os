// Collection Action (Tahsilat Aksiyonlari) suggestions — production-only client
// for /api/collection-actions. Mirrors payments-client.ts.

export type CollectionActionType = "CALL" | "MEETING" | "LEGAL_NOTICE" | "REMINDER" | "NEGOTIATION" | "FOLLOW_UP";
export type CollectionActionStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "DISMISSED";

export type CollectionActionRow = {
  id: string;
  actionType: CollectionActionType;
  status: CollectionActionStatus;
  title: string;
  aiReason: string | null;
  priority: number;
  createdAt: string;
  payment: {
    title: string;
    person: { fullName: string } | null;
  };
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function request<T>(
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json", ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as { ok: true; data: T } | { ok: false; error: { message: string } };
    if (json.ok) return { ok: true, data: json.data };
    return { ok: false, error: json.error.message };
  } catch {
    return { ok: false, error: "Baglanti kurulamadi." };
  }
}

export function listCollectionActions() {
  return request<{ collectionActions: CollectionActionRow[]; count: number }>("/api/collection-actions", "GET");
}

export type CollectionLifecycleStatus = "IN_PROGRESS" | "DONE" | "DISMISSED";

export type CollectionActionExecutionResult = {
  status: string;
  entityRef?: { entityType: string; entityId: string };
};

export function requestCollectionLifecycleAction(collectionActionId: string, status: CollectionLifecycleStatus) {
  return request<{ approval: { approvalId: string; expiresAt: string; collectionActionId: string; status: CollectionLifecycleStatus } }>(
    `/api/collection-actions/${collectionActionId}/actions/set-lifecycle`, "POST", { operation: "request", status },
  );
}

export function confirmCollectionLifecycleAction(collectionActionId: string, approvalId: string, status: CollectionLifecycleStatus, idempotencyKey = crypto.randomUUID()) {
  return request<{ execution: CollectionActionExecutionResult }>(
    `/api/collection-actions/${collectionActionId}/actions/set-lifecycle`, "POST", { operation: "confirm", approvalId, status },
    { "Idempotency-Key": idempotencyKey, "X-Correlation-Id": crypto.randomUUID() },
  );
}

export function cancelCollectionLifecycleAction(collectionActionId: string, approvalId: string) {
  return request<{ cancelled: true }>(`/api/collection-actions/${collectionActionId}/actions/set-lifecycle`, "POST", { operation: "cancel", approvalId });
}
export function resolveCollectionActionEditCommandRequest(payload: { utterance: string; activeTab: string }) { return request<{ outcome: unknown }>("/api/collection-actions/actions/edit-command", "POST", payload); }
