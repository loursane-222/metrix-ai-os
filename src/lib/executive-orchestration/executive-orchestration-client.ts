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

export type OrchestrationQuoteFollowupOutcome =
  | { status: "NOT_HANDLED" }
  | { status: "CLARIFICATION_REQUIRED"; message: string }
  | { status: "RUN_COMPLETE"; summary: string; orchestration: OrchestrationView }
  | { status: "REQUEST_FAILED"; error: string };

export async function requestOrchestrationQuoteFollowup(utterance: string): Promise<OrchestrationQuoteFollowupOutcome> {
  const response = await fetch("/api/executive-orchestration/quote-followup", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ utterance }),
  });
  const json = (await response.json()) as { ok?: boolean; data?: { outcome: OrchestrationQuoteFollowupOutcome }; error?: { message?: string } };
  if (!response.ok || !json.ok || !json.data) {
    return { status: "REQUEST_FAILED", error: json.error?.message ?? "Orkestrasyon çalıştırılamadı." };
  }
  return json.data.outcome;
}
