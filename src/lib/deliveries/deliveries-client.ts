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
  integritySummary: string;
  onTimeDeliveryRate: string | null;
  firstAttemptSuccessRate: string | null;
  damageRate: string | null;
  items?: Array<{ id: string; name: string; conditionFlag: string | null }>;
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

export async function getCarrierPerformance(): Promise<DeliveryApiResult<{ status: string; carrierPerformanceSummary: string; carriers: Array<{ carrier: string; onTimeDeliveryRate: string | null; damageRate: string | null; averageDeliveryHours: number | null }> }>> {
  try {
    const response = await fetch("/api/deliveries/intelligence/carriers", { credentials: "include" });
    const json = await response.json() as { ok?: boolean; data?: { status: string; carrierPerformanceSummary: string; carriers: Array<{ carrier: string; onTimeDeliveryRate: string | null; damageRate: string | null; averageDeliveryHours: number | null }> }; error?: { message?: string } };
    return json.ok && json.data ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? "Taşıyıcı performansı ölçülemedi." };
  } catch { return { ok: false, error: "Bağlantı kurulamadı." }; }
}

export async function getDeliveryPerformance(): Promise<DeliveryApiResult<{ status: string; onTimeDeliveryRate: string | null; firstAttemptSuccessRate: string | null; damageRate: string | null }>> {
  try {
    const response = await fetch("/api/deliveries/intelligence/performance", { credentials: "include" });
    const json = await response.json() as { ok?: boolean; data?: { status: string; onTimeDeliveryRate: string | null; firstAttemptSuccessRate: string | null; damageRate: string | null }; error?: { message?: string } };
    return json.ok && json.data ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? "Teslim performansı ölçülemedi." };
  } catch { return { ok: false, error: "Bağlantı kurulamadı." }; }
}

export async function recordDeliveryProof(deliveryId: string, proof: Record<string, unknown>): Promise<DeliveryApiResult<{ delivery: DeliveryRecord }>> {
  try {
    const response = await fetch(`/api/deliveries/${encodeURIComponent(deliveryId)}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "proof", ...proof }) });
    const json = await response.json() as { ok?: boolean; data?: { delivery: DeliveryRecord }; error?: { message?: string } };
    return json.ok && json.data ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? "Teslim kanıtı kaydedilemedi." };
  } catch { return { ok: false, error: "Bağlantı kurulamadı." }; }
}

export async function addDeliveryException(deliveryId: string, category: string, note?: string): Promise<DeliveryApiResult<{ exception: { id: string } }>> {
  try {
    const response = await fetch(`/api/deliveries/${encodeURIComponent(deliveryId)}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "exception", category, note }) });
    const json = await response.json() as { ok?: boolean; data?: { exception: { id: string } }; error?: { message?: string } };
    return json.ok && json.data ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? "Teslimat istisnası kaydedilemedi." };
  } catch { return { ok: false, error: "Bağlantı kurulamadı." }; }
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
