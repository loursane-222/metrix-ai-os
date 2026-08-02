// Payments UI Foundation — production-only client for /api/payments. No localStorage, no mock data.

export type PaymentStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";

export type PaymentRecord = {
  id: string;
  organizationId: string;
  customerId: string | null;
  personId: string | null;
  quoteId: string | null;
  title: string;
  amount: string;
  paidAmount: string;
  currency: string;
  dueDate: string | null;
  status: PaymentStatus;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePaymentBody = {
  customerId: string;
  title: string;
  amount: number;
  currency?: string;
  quoteId?: string;
  dueDate?: string;
  notes?: string;
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

export function listPayments() {
  return request<{ payments: PaymentRecord[]; count: number }>("/api/payments", "GET");
}

export function createPayment(body: CreatePaymentBody, idempotencyKey = crypto.randomUUID()) {
  return request<{ payment: PaymentRecord }>("/api/payments", "POST", body, { "Idempotency-Key": idempotencyKey });
}
