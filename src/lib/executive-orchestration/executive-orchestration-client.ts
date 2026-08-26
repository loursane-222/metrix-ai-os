export type OrchestrationStepView = {
  sequence: number;
  domain: string;
  actionName: string;
  status: "PENDING" | "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "FAILED" | "SKIPPED" | "COMPENSATING" | "COMPENSATED" | "COMPENSATION_FAILED" | "COMPENSATION_AWAITING_APPROVAL";
  resultEntityType: string | null;
  resultEntityId: string | null;
  errorMessage: string | null;
};

export type OrchestrationView = {
  id: string;
  status: "PENDING" | "RUNNING" | "AWAITING_APPROVAL" | "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED" | "COMPENSATING" | "COMPENSATED" | "COMPENSATION_FAILED";
  triggerUtterance: string;
  steps: OrchestrationStepView[];
};

export type OrchestrationPlanAndRunOutcome =
  | { status: "NOT_HANDLED" }
  | { status: "CLARIFICATION_REQUIRED" }
  | { status: "PLAN_INVALID"; reason: string }
  | { status: "RUN_COMPLETE"; summary: string; orchestration: OrchestrationView }
  | { status: "REQUEST_FAILED"; error: string };

export async function requestOrchestrationPlanAndRun(utterance: string): Promise<OrchestrationPlanAndRunOutcome> {
  const response = await fetch("/api/executive-orchestration/plan-and-run", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ utterance }),
  });
  const json = (await response.json()) as { ok?: boolean; data?: { outcome: OrchestrationPlanAndRunOutcome }; error?: { message?: string } };
  if (!response.ok || !json.ok || !json.data) {
    return { status: "REQUEST_FAILED", error: json.error?.message ?? "Orkestrasyon çalıştırılamadı." };
  }
  return json.data.outcome;
}

export async function requestPendingApproval(): Promise<OrchestrationView | null> {
  const response = await fetch("/api/executive-orchestration/pending-approval", {
    method: "GET",
    credentials: "include",
  });
  const json = (await response.json()) as { ok?: boolean; data?: { orchestration: OrchestrationView | null } };
  if (!response.ok || !json.ok || !json.data) return null;
  return json.data.orchestration;
}

export type OrchestrationApproveOutcome =
  | { status: "APPROVED"; orchestration: OrchestrationView }
  | { status: "NOT_FOUND" }
  | { status: "REQUEST_FAILED"; error: string };

export async function requestOrchestrationApprove(orchestrationId: string): Promise<OrchestrationApproveOutcome> {
  const response = await fetch(`/api/executive-orchestration/${orchestrationId}/approve`, {
    method: "POST",
    credentials: "include",
  });
  const json = (await response.json()) as { ok?: boolean; data?: { orchestration: OrchestrationView }; error?: { message?: string } };
  if (response.status === 404) return { status: "NOT_FOUND" };
  if (!response.ok || !json.ok || !json.data) {
    return { status: "REQUEST_FAILED", error: json.error?.message ?? "Onay işlenemedi." };
  }
  return { status: "APPROVED", orchestration: json.data.orchestration };
}
