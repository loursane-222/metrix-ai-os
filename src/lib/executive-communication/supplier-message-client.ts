import type { SendSupplierMessageOutcome } from "./executive-communication.types";

export async function requestSupplierMessage(input: { supplierId: string; messageBody: string }): Promise<SendSupplierMessageOutcome | { outcome: "REQUEST_FAILED"; error: string }> {
  const response = await fetch("/api/executive-communication/supplier-message", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await response.json()) as { ok?: boolean; data?: { outcome: SendSupplierMessageOutcome }; error?: { message?: string } };
  if (!response.ok || !json.ok || !json.data) {
    return { outcome: "REQUEST_FAILED", error: json.error?.message ?? "Tedarikçi mesajı gönderilemedi." };
  }
  return json.data.outcome;
}
