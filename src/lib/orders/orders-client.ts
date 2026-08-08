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
