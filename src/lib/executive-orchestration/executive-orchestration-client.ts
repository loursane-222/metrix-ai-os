export type OrchestrationStepView = {
  sequence: number;
  domain: string;
  actionName: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
  resultEntityType: string | null;
  resultEntityId: string | null;
  errorMessage: string | null;
};

export type OrchestrationView = {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
  triggerUtterance: string;
  steps: OrchestrationStepView[];
};

export type OrchestrationPlanAndRunOutcome =
  | { status: "NOT_HANDLED" }
  | { status: "CLARIFICATION_REQUIRED" }
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
