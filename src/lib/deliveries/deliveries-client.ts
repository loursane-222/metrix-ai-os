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
  customer?: { displayName: string };
  receiverName?: string | null;
  deliveryProof?: { confirmationCode?: string | null; signatureCaptured?: boolean | null; note?: string | null; recordedAt?: string } | null;
  cancellationReason?: string | null;
  items: Array<{ id: string; name: string; unit: string | null; quantity: string; conditionFlag: string | null }>;
  exceptions: Array<{ id: string; category: string; note: string | null; createdAt: string }>;
  statusHistory: Array<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; createdAt: string }>;
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

async function deliveryRequest<T>(deliveryId: string, init?: RequestInit): Promise<DeliveryApiResult<T>> {
  try {
    const response = await fetch(`/api/deliveries/${encodeURIComponent(deliveryId)}`, { credentials: "include", cache: "no-store", ...init });
    const json = await response.json() as { ok?: boolean; data?: T; error?: { message?: string } };
    return response.ok && json.ok && json.data ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? "İrsaliye işlemi tamamlanamadı." };
  } catch { return { ok: false, error: "Bağlantı kurulamadı." }; }
}

export function getDelivery(deliveryId: string): Promise<DeliveryApiResult<{ delivery: DeliveryRecord }>> { return deliveryRequest(deliveryId); }
export function mutateDelivery(deliveryId: string, payload: Record<string, unknown>): Promise<DeliveryApiResult<Record<string, unknown>>> { return deliveryRequest(deliveryId, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }

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
