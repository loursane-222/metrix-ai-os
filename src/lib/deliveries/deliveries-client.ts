export type DeliveryRecord = {
  id: string;
  deliveryNumber: string;
  organizationId: string;
  sourceOrderId: string;
  customerId: string;
  status: string;
  carrier: string | null;
  deliveryAddress: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function listDeliveries(): Promise<DeliveryApiResult<{ deliveries: DeliveryRecord[]; count: number }>> {
  try {
    const response = await fetch("/api/deliveries", { credentials: "include" });
    const json = await response.json() as { ok?: boolean; data?: { deliveries: DeliveryRecord[]; count: number }; error?: { message?: string } };
    if (json.ok && json.data) return { ok: true, data: json.data };
    return { ok: false, error: json.error?.message ?? "İrsaliyeler alınamadı." };
  } catch {
    return { ok: false, error: "Bağlantı kurulamadı." };
  }
}

export async function createDeliveryFromOrder(orderId: string, autoDispatch = false): Promise<DeliveryApiResult<{ delivery: DeliveryRecord }>> {
  try {
    const response = await fetch("/api/deliveries/from-order", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId, autoDispatch }),
    });
    const json = await response.json() as { ok?: boolean; data?: { delivery: DeliveryRecord }; error?: { message?: string } };
    if (json.ok && json.data) return { ok: true, data: json.data };
    return { ok: false, error: json.error?.message ?? "İrsaliye oluşturulamadı." };
  } catch {
    return { ok: false, error: "Bağlantı kurulamadı." };
  }
}
