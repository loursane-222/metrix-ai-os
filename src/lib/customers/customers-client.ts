// Customers UI Foundation — production-only client for /api/customers, /api/quotes, /api/payments.
// No localStorage, no mock data. Every field here mirrors the API response 1:1.

export type CustomerStatus = "ACTIVE" | "PASSIVE" | "BLOCKED";

export type CustomerContactRecord = {
  id: string;
  customerId: string;
  fullName: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerAddress = {
  line1?: string;
  line2?: string;
  district?: string;
  city?: string;
  postalCode?: string;
  country?: string;
} | null;

export type CustomerRecord = {
  id: string;
  organizationId: string;
  displayName: string;
  legalName: string | null;
  phone: string | null;
  email: string | null;
  balanceCents: string;
  currency: string;
  tier: string | null;
  healthScore: number | null;
  metrixNote: string | null;
  status: CustomerStatus;
  cariKodu: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  mersisNo: string | null;
  tradeRegistryNo: string | null;
  billingAddress: CustomerAddress;
  shippingAddress: CustomerAddress;
  eInvoiceEnabled: boolean;
  eArchiveEnabled: boolean;
  source: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  primaryContact: CustomerContactRecord | null;
};

export type PrimaryContactInput = {
  fullName?: string;
  title?: string;
  phone?: string;
  email?: string;
};

export type CreateCustomerBody = {
  displayName: string;
  legalName?: string;
  phone?: string;
  email?: string;
  metrixNote?: string;
};

export type UpdateCustomerBody = {
  displayName?: string;
  legalName?: string;
  phone?: string;
  email?: string;
  tier?: string;
  healthScore?: number;
  metrixNote?: string;
  status?: CustomerStatus;
  cariKodu?: string;
  taxNumber?: string;
  taxOffice?: string;
  mersisNo?: string;
  tradeRegistryNo?: string;
  billingAddress?: Record<string, unknown>;
  shippingAddress?: Record<string, unknown>;
  eInvoiceEnabled?: boolean;
  eArchiveEnabled?: boolean;
  primaryContact?: PrimaryContactInput;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function request<T>(
  path: string,
  method: "GET" | "POST" | "PATCH",
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
    const json = (await res.json()) as
      | { ok: true; data: T }
      | { ok: false; error: { message: string } };
    if (json.ok) return { ok: true, data: json.data };
    return { ok: false, error: json.error.message };
  } catch {
    return { ok: false, error: "Baglanti kurulamadi." };
  }
}

export function listCustomers(status?: CustomerStatus) {
  const qs = status ? `?status=${status}` : "";
  return request<{ customers: CustomerRecord[]; count: number }>(`/api/customers${qs}`, "GET");
}

export function getCustomer(customerId: string) {
  return request<{ customer: CustomerRecord }>(`/api/customers/${customerId}`, "GET");
}

export function createCustomer(body: CreateCustomerBody) {
  return request<{ customer: CustomerRecord }>(`/api/customers`, "POST", body);
}

export function executeCustomerCreateAction(body: CreateCustomerBody, idempotencyKey = crypto.randomUUID()) {
  return request<{ execution: CustomerActionExecutionResult & { entityRef?: { entityType: string; entityId: string } } }>(
    "/api/customers/actions/create", "POST", body, { "Idempotency-Key": idempotencyKey, "X-Correlation-Id": crypto.randomUUID() },
  );
}

export function resolveCustomerCreateConversationPlan(body: { utterance: string; pendingContext: { lifecycle: "OPENING" | "COLLECTING" | "READY"; fields: Record<string, string>; missingFields: Array<"displayName"> } | null }) {
  return request<{ plan: unknown }>("/api/customers/actions/create-command", "POST", body);
}

export function requestCustomerArchiveAction(customerId: string) {
  return request<{ approval: { approvalId: string; expiresAt: string; customerId: string } }>(`/api/customers/${customerId}/actions/archive`, "POST", { operation: "request" });
}

export function confirmCustomerArchiveAction(customerId: string, approvalId: string, idempotencyKey = crypto.randomUUID()) {
  return request<{ execution: CustomerActionExecutionResult }>(`/api/customers/${customerId}/actions/archive`, "POST", { operation: "confirm", approvalId }, { "Idempotency-Key": idempotencyKey, "X-Correlation-Id": crypto.randomUUID() });
}

export function cancelCustomerArchiveAction(customerId: string, approvalId: string) {
  return request<{ cancelled: true }>(`/api/customers/${customerId}/actions/archive`, "POST", { operation: "cancel", approvalId });
}

export function updateCustomer(customerId: string, body: UpdateCustomerBody) {
  return request<{ customer: CustomerRecord }>(`/api/customers/${customerId}`, "PATCH", body);
}

export function archiveCustomer(customerId: string) {
  return request<{ archived: boolean }>(`/api/customers/${customerId}/archive`, "POST");
}

export type CustomerActionExecutionResult = {
  actionName: string;
  executionId: string;
  status: "SUCCESS" | "FAILURE";
  outcome: "SUCCEEDED" | "NO_CHANGE" | "REPLAYED" | "FAILED";
  correlationId: string;
  operationId: string;
};

export type ExecuteCustomerUpdateActionInput = {
  customerId: string;
  patch: Record<string, unknown>;
  expectedVersion: string;
  originatingDraftId: string;
  originatingContextVersion: number;
  idempotencyKey: string;
  correlationId?: string;
};

/** Dar, customer.update'e özgü client — genel execute-any-action helper'ı değildir. */
export function executeCustomerUpdateAction(input: ExecuteCustomerUpdateActionInput) {
  const { customerId, patch, expectedVersion, originatingDraftId, originatingContextVersion, idempotencyKey, correlationId } =
    input;
  const resolvedCorrelationId = correlationId ?? crypto.randomUUID();

  return request<{ execution: CustomerActionExecutionResult }>(
    `/api/customers/${customerId}/actions/update`,
    "POST",
    { patch, expectedVersion, originatingDraftId, originatingContextVersion },
    {
      "Idempotency-Key": idempotencyKey,
      "X-Correlation-Id": resolvedCorrelationId,
    },
  );
}

/**
 * Dar, customer-edit-command'a özgü client. Yanıt gövdesi (`outcome`) burada
 * kasıtlı olarak `unknown` tutulur — çağıran (customer-edit-command-integration.ts)
 * onu ağdan geldiği haliyle, hiçbir tipe güvenmeden yeniden doğrular (bkz.
 * validateCustomerEditCommandResolution), sunucunun zaten yaptığı doğrulamayı
 * client sınırında tekrarlar.
 */
export function resolveCustomerEditCommand(customerId: string, body: { utterance: string; activeTab: string }) {
  return request<{ outcome: unknown }>(`/api/customers/${customerId}/actions/edit-command`, "POST", body);
}

export function createQuote(input: {
  customerId: string;
  title: string;
  amount?: number;
  currency?: string;
  notes?: string;
  idempotencyKey: string;
}) {
  const { idempotencyKey, ...body } = input;
  return request(`/api/quotes`, "POST", body, { "Idempotency-Key": idempotencyKey });
}

export function createPayment(input: {
  customerId: string;
  title: string;
  amount: number;
  currency?: string;
  dueDate?: string;
  notes?: string;
  idempotencyKey: string;
}) {
  const { idempotencyKey, ...body } = input;
  return request(`/api/payments`, "POST", body, { "Idempotency-Key": idempotencyKey });
}

export function formatTRY(cents: number | string, currency = "TRY"): string {
  const value = Math.round(Number(cents) / 100);
  const symbol = currency === "TRY" ? "₺" : `${currency} `;
  return `${symbol}${value.toLocaleString("tr-TR")}`;
}

// Compact form for tight KPI tiles — real value, abbreviated presentation
// (e.g. 24.800.000 -> "24,8M"), never a rounded/invented figure.
export function formatTRYCompact(cents: number | string, currency = "TRY"): string {
  const value = Math.round(Number(cents) / 100);
  const symbol = currency === "TRY" ? "₺" : `${currency} `;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}M`;
  if (abs >= 10_000) return `${symbol}${(value / 1_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}B`;
  return `${symbol}${value.toLocaleString("tr-TR")}`;
}

export function statusLabel(status: CustomerStatus): string {
  if (status === "ACTIVE") return "Aktif";
  if (status === "PASSIVE") return "Pasif";
  return "Bloke";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatRelativeDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Bugun";
  if (diffDays === 1) return "1 gun once";
  if (diffDays < 30) return `${diffDays} gun once`;
  return formatDate(value);
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

const AVATAR_HUES = [172, 190, 210, 260, 24, 340];

export function avatarHueFor(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length]!;
}

export type PortfolioInsight = { lead: string; highlight: string };

// Rule-based portfolio insight — derived only from real fields (status, healthScore,
// missing contact). Never a generative/fabricated summary or invented count.
export function buildPortfolioInsight(customers: CustomerRecord[]): PortfolioInsight {
  if (customers.length === 0) {
    return { lead: "Portfoyunuz henuz bos.", highlight: "Ilk musteri kaydini olusturarak baslayin." };
  }
  const blocked = customers.filter((c) => c.status === "BLOCKED").length;
  if (blocked > 0) {
    return { lead: "Portfoyunuzde dikkat gereken kayitlar var.", highlight: `${blocked} musteri bloke durumda.` };
  }
  const lowHealth = customers.filter((c) => c.healthScore !== null && c.healthScore < 40).length;
  if (lowHealth > 0) {
    return { lead: "Portfoyunuzu yakindan takip edin.", highlight: `${lowHealth} musteride iliski skoru dusuk.` };
  }
  const missingContact = customers.filter((c) => !c.primaryContact && !c.phone && !c.email).length;
  if (missingContact > 0) {
    return { lead: "Kimlik bilgilerini tamamlayin.", highlight: `${missingContact} musteride iletisim bilgisi eksik.` };
  }
  const activeCount = customers.filter((c) => c.status === "ACTIVE").length;
  return {
    lead: "Musteri portfoyunuzu tek noktadan yonetiyorsunuz.",
    highlight: `${activeCount} aktif musteri su anda takip altinda.`,
  };
}
