// Invoices UI Foundation — production-only client for /api/invoices. No localStorage, no mock data.

export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "CANCELLED";

export type InvoiceRecord = {
  id: string;
  organizationId: string;
  customerId: string | null;
  quoteId: string | null;
  invoiceNumber: string;
  title: string;
  amount: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  currency: string;
  dueDate: string | null;
  status: InvoiceStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateInvoiceBody = {
  customerId: string;
  title: string;
  amount: number;
  quoteId?: string;
  taxRate?: number;
  currency?: string;
};

export type InvoiceActionExecutionResult = {
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

export function listInvoices() {
  return request<{ invoices: InvoiceRecord[]; count: number }>("/api/invoices", "GET");
}

export function executeInvoiceCreateAction(body: CreateInvoiceBody, idempotencyKey = crypto.randomUUID()) {
  return request<{ execution: InvoiceActionExecutionResult & { entityRef?: { entityId: string } } }>(
    "/api/invoices/actions/create", "POST", body, { "Idempotency-Key": idempotencyKey, "X-Correlation-Id": crypto.randomUUID() },
  );
}

export function executeInvoiceSendAction(invoiceId: string, idempotencyKey = crypto.randomUUID()) {
  return request<{ execution: InvoiceActionExecutionResult }>(
    `/api/invoices/${invoiceId}/actions/send`, "POST", {},
    { "Idempotency-Key": idempotencyKey, "X-Correlation-Id": crypto.randomUUID() },
  );
}

export function resolveInvoiceEditCommandRequest(invoiceId: string, payload: { utterance: string; activeTab: string }) {
  return request<{ outcome: unknown }>(`/api/invoices/${encodeURIComponent(invoiceId)}/actions/edit-command`, "POST", payload);
}
