// Tasks UI Foundation — production-only client for /api/tasks. No localStorage, no mock data.

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type TaskStatus = "OPEN" | "DONE" | "CANCELLED";

export type TaskRecord = {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeUserId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateTaskBody = {
  title: string;
  description?: string;
  dueDate?: string;
  priority?: TaskPriority;
  assigneeUserId?: string;
};

export type TaskActionExecutionResult = {
  status: string;
  entityRef?: { entityType: string; entityId: string };
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

export function listTasks(status?: TaskStatus) {
  const qs = status ? `?status=${status}` : "";
  return request<{ tasks: TaskRecord[]; count: number }>(`/api/tasks${qs}`, "GET");
}

export function executeTaskCreateAction(body: CreateTaskBody, idempotencyKey = crypto.randomUUID()) {
  return request<{ execution: TaskActionExecutionResult & { entityRef?: { entityId: string } } }>(
    "/api/tasks/actions/create", "POST", body, { "Idempotency-Key": idempotencyKey, "X-Correlation-Id": crypto.randomUUID() },
  );
}

export function executeTaskCompleteAction(taskId: string, idempotencyKey = crypto.randomUUID()) {
  return request<{ execution: TaskActionExecutionResult }>(
    `/api/tasks/${taskId}/actions/complete`, "POST", undefined, { "Idempotency-Key": idempotencyKey, "X-Correlation-Id": crypto.randomUUID() },
  );
}

export function resolveTaskEditCommandRequest(taskId: string, payload: { utterance: string; activeTab: string }) {
  return request<{ outcome: unknown }>(`/api/tasks/${encodeURIComponent(taskId)}/actions/edit-command`, "POST", payload);
}

export function resolveTaskCreateConversationPlan(body: { utterance: string; pendingContext: { lifecycle: "OPENING" | "COLLECTING" | "READY"; fields: Record<string, string> } | null }, correlationId?: string) {
  return request<{ plan: unknown }>("/api/tasks/actions/create-command", "POST", body, correlationId ? { "X-Correlation-Id": correlationId } : undefined);
}
