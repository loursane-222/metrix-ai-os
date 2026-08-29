// Offers UI Foundation — production-only client for /api/quotes. No
// localStorage, no mock data. Every field here mirrors the API response 1:1.
// Mirrors customers-client.ts's request()/ApiResult<T> convention exactly.

export type QuoteStatus = "DRAFT" | "SENT" | "VIEWED" | "NEGOTIATION" | "WON" | "LOST" | "CANCELLED";

export type QuoteItemRecord = {
  id: string;
  quoteId: string;
  productServiceId: string | null;
  name: string;
  unit: string | null;
  quantity: string;
  unitPriceCents: string;
  discountBasisPoints: number;
  vatRateBasisPoints: number;
  lineTotalCents: string;
  sortOrder: number;
};

export type QuoteRecord = {
  id: string;
  organizationId: string;
  customerId: string | null;
  customerName: string;
  title: string;
  amount: string | null;
  currency: string;
  status: QuoteStatus;
  sentAt: string | null;
  viewedAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  notes: string | null;
  customerNote: string | null;
  specialTerms: string | null;
  validUntil: string | null;
  generalDiscountBasisPoints: number | null;
  paymentTerm: string | null;
  paymentTermStructured?: unknown | null;
  deliveryTerm: string | null;
  deliveryMethod: string | null;
  metadata: { emailDispatch?: { recipientEmail: string; providerMessageId: string | null; dispatchedAt: string } } | null;
  createdAt: string;
  updatedAt: string;
  items: QuoteItemRecord[];
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

export function listQuotes(status?: QuoteStatus) {
  const qs = status ? `?status=${status}` : "";
  return request<{ quotes: QuoteRecord[] }>(`/api/quotes${qs}`, "GET");
}

export function getQuote(quoteId: string) {
  return request<{ quote: QuoteRecord }>(`/api/quotes/${quoteId}`, "GET");
}

export function createOffer(input: { customerId: string; title: string; idempotencyKey?: string }) {
  const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID();
  return request<{ quote: QuoteRecord }>(
    `/api/quotes`,
    "POST",
    { customerId: input.customerId, title: input.title },
    { "Idempotency-Key": idempotencyKey },
  );
}

export type QuoteActionExecutionResult = {
  actionName: string;
  executionId: string;
  status: "SUCCESS" | "FAILURE";
  outcome: "SUCCEEDED" | "NO_CHANGE" | "REPLAYED" | "FAILED";
  correlationId: string;
  operationId: string;
};

export type ExecuteQuoteUpdateActionInput = {
  quoteId: string;
  patch: Record<string, unknown>;
  expectedVersion: string;
  idempotencyKey: string;
  correlationId?: string;
};

/** Dar, quote.update'e özgü client — genel execute-any-action helper'ı değildir. */
export function executeQuoteUpdateAction(input: ExecuteQuoteUpdateActionInput) {
  const { quoteId, patch, expectedVersion, idempotencyKey, correlationId } = input;
  return request<{ execution: QuoteActionExecutionResult }>(
    `/api/quotes/${quoteId}/actions/update`,
    "POST",
    { patch, expectedVersion },
    { "Idempotency-Key": idempotencyKey, "X-Correlation-Id": correlationId ?? crypto.randomUUID() },
  );
}

/** quote.send'e özgü client — DRAFT/NEGOTIATION -> SENT internal durum geçişi. Gerçek dış dünya gönderimi quote.dispatch'tedir (aşağıda). */
export function executeQuoteSendAction(quoteId: string, idempotencyKey = crypto.randomUUID()) {
  return request<{ execution: QuoteActionExecutionResult }>(
    `/api/quotes/${quoteId}/actions/send`,
    "POST",
    {},
    { "Idempotency-Key": idempotencyKey, "X-Correlation-Id": crypto.randomUUID() },
  );
}

export type QuoteDispatchRecipientPreview = { status: "RESOLVED"; email: string } | { status: "MISSING_EMAIL" } | { status: "NOT_SENT" };

/** quote.dispatch'in EXPLICIT approval akışı — request önizlemeyle gerçek alıcıyı döner, confirm gerçek e-postayı gönderir. */
export function requestQuoteDispatch(quoteId: string) {
  return request<{ approval: { approvalId: string; expiresAt: string; quoteId: string }; recipientPreview: QuoteDispatchRecipientPreview }>(
    `/api/quotes/${quoteId}/actions/dispatch`,
    "POST",
    { operation: "request" },
  );
}

export function confirmQuoteDispatch(quoteId: string, approvalId: string, idempotencyKey = crypto.randomUUID()) {
  return request<{ execution: QuoteActionExecutionResult & { metadata?: Record<string, unknown> } }>(
    `/api/quotes/${quoteId}/actions/dispatch`,
    "POST",
    { operation: "confirm", approvalId },
    { "Idempotency-Key": idempotencyKey, "X-Correlation-Id": crypto.randomUUID() },
  );
}

export function cancelQuoteDispatch(quoteId: string, approvalId: string) {
  return request<{ cancelled: true }>(`/api/quotes/${quoteId}/actions/dispatch`, "POST", { operation: "cancel", approvalId });
}

/**
 * Dar, offer-edit-command'a özgü client. Yanıt gövdesi (`outcome`) burada
 * kasıtlı olarak `unknown` tutulur — bkz. resolveCustomerEditCommand aynı
 * desen: çağıran ağdan geldiği haliyle hiçbir tipe güvenmeden yeniden doğrular.
 */
export function resolveOfferEditCommand(quoteId: string, body: { utterance: string; activeTab: string }) {
  return request<{ outcome: unknown }>(`/api/quotes/${quoteId}/actions/edit-command`, "POST", body);
}

export function formatTRY(cents: number | string, currency = "TRY"): string {
  const value = typeof cents === "string" ? Number(cents) : cents;
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value / 100);
}
