export type OrderRecord = {
  id: string;
  orderNumber: string;
  organizationId: string;
  customerId: string;
  sourceQuoteId: string | null;
  status: string;
  priority: number;
  currency: string;
  deadlineAt: string | null;
  commitmentAt: string | null;
  createdAt: string;
  updatedAt: string;
  fulfillmentSummary: string;
  reservationStatus: string;
  priorityLabel: string;
  priorityExplanation: string;
  deliveryProgressSummary: string;
  revisionHistorySummary: string;
  customer?: { displayName: string };
  cancellationReason?: string | null;
  items: Array<{ id: string; name: string; unit: string | null; quantity: string; unitPriceCents: string; lineTotalCents: string }>;
  revisions: Array<{ id: string; revisionNumber: number; changeType: string; beforeSnapshot: unknown; afterSnapshot: unknown; reason: string | null; createdAt: string }>;
  exceptions: Array<{ id: string; category: string; note: string | null; createdAt: string }>;
  statusHistory: Array<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; createdAt: string }>;
};

export type OrderApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function listOrders(): Promise<OrderApiResult<{ orders: OrderRecord[]; count: number }>> {
  try {
    const response = await fetch("/api/orders", { credentials: "include" });
    const json = await response.json() as { ok?: boolean; data?: { orders: OrderRecord[]; count: number }; error?: { message?: string } };
    if (json.ok && json.data) return { ok: true, data: json.data };
    return { ok: false, error: json.error?.message ?? "Siparişler alınamadı." };
  } catch {
    return { ok: false, error: "Bağlantı kurulamadı." };
  }
}

export async function createOrderFromQuote(quoteId: string): Promise<OrderApiResult<{ order: OrderRecord }>> {
  try {
    const response = await fetch("/api/orders/from-quote", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteId }) });
    const json = await response.json() as { ok?: boolean; data?: { order: OrderRecord }; error?: { message?: string } };
    if (json.ok && json.data) return { ok: true, data: json.data };
    return { ok: false, error: json.error?.message ?? "Sipariş oluşturulamadı." };
  } catch {
    return { ok: false, error: "Bağlantı kurulamadı." };
  }
}

export async function reviseOrder(orderId: string, payload: Record<string, unknown>): Promise<OrderApiResult<{ revision: { id: string } }>> {
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "revise", ...payload }) });
    const json = await response.json() as { ok?: boolean; data?: { revision: { id: string } }; error?: { message?: string } };
    return json.ok && json.data ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? "Sipariş revize edilemedi." };
  } catch { return { ok: false, error: "Bağlantı kurulamadı." }; }
}

export async function addOrderException(orderId: string, category: string, note?: string): Promise<OrderApiResult<{ exception: { id: string } }>> {
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "exception", category, note }) });
    const json = await response.json() as { ok?: boolean; data?: { exception: { id: string } }; error?: { message?: string } };
    return json.ok && json.data ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? "Sipariş istisnası eklenemedi." };
  } catch { return { ok: false, error: "Bağlantı kurulamadı." }; }
}

async function orderRequest<T>(orderId: string, init?: RequestInit): Promise<OrderApiResult<T>> {
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { credentials: "include", cache: "no-store", ...init });
    const json = await response.json() as { ok?: boolean; data?: T; error?: { message?: string } };
    return response.ok && json.ok && json.data ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? "Sipariş işlemi tamamlanamadı." };
  } catch { return { ok: false, error: "Bağlantı kurulamadı." }; }
}

export function getOrder(orderId: string): Promise<OrderApiResult<{ order: OrderRecord }>> { return orderRequest(orderId); }

export function mutateOrder(orderId: string, payload: Record<string, unknown>): Promise<OrderApiResult<Record<string, unknown>>> {
  return orderRequest(orderId, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
}

export async function getDeliveryCommitmentRate(): Promise<OrderApiResult<{ rate: number | null; onTimeDeliveryRate: string | null; status: string }>> {
  try {
    const response = await fetch("/api/orders/intelligence/commitment", { credentials: "include" });
    const json = await response.json() as { ok?: boolean; data?: { rate: number | null; onTimeDeliveryRate: string | null; status: string }; error?: { message?: string } };
    return json.ok && json.data ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? "Teslim taahhüdü ölçülemedi." };
  } catch { return { ok: false, error: "Bağlantı kurulamadı." }; }
}
