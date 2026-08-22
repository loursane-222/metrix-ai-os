export type PaymentReminderApiOutcome =
  | { status: "SENT"; customerName: string; result: { amountOwedText: string; currency: string; recipientEmail: string } }
  | { status: "NOT_HANDLED" }
  | { status: "CLARIFICATION_NEEDED"; candidateNames: readonly string[] }
  | { status: "NO_OUTSTANDING_BALANCE"; customerName: string }
  | { status: "SEND_FAILED"; customerName: string; error: string };

export async function requestPaymentReminder(utterance: string): Promise<PaymentReminderApiOutcome> {
  const response = await fetch("/api/executive-communication/payment-reminder", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ utterance }),
  });
  const json = (await response.json()) as { ok?: boolean; data?: { outcome: PaymentReminderApiOutcome }; error?: { message?: string } };
  if (!response.ok || !json.ok || !json.data) {
    return { status: "SEND_FAILED", customerName: "", error: json.error?.message ?? "Tahsilat hatırlatması gönderilemedi." };
  }
  return json.data.outcome;
}
