export type ProductionOrderStatus = "DRAFT" | "PLANNED" | "RELEASED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type ProductionOrderRecord = {
  id: string;
  orderNumber: string;
  status: ProductionOrderStatus;
  sourceOrderId: string | null;
  productServiceId: string | null;
  workCenterId: string | null;
  quantityPlanned: string;
  quantityProduced: string;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  notes: string | null;
  updatedAt: string;
};
export type ProductionApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function listProductionOrders(): Promise<ProductionApiResult<{ productions: ProductionOrderRecord[]; count: number }>> {
  try {
    const response = await fetch("/api/production", { credentials: "include" });
    const json = (await response.json()) as { ok?: boolean; data?: { productions: ProductionOrderRecord[]; count: number }; error?: { message?: string } };
    if (json.ok && json.data) return { ok: true, data: json.data };
    return { ok: false, error: json.error?.message ?? "Üretim emirleri alınamadı." };
  } catch {
    return { ok: false, error: "Bağlantı kurulamadı." };
  }
}

async function productionOrderRequest<T>(productionOrderId: string, suffix = "", init?: RequestInit): Promise<ProductionApiResult<T>> {
  try {
    const response = await fetch(`/api/production/${encodeURIComponent(productionOrderId)}${suffix}`, { credentials: "include", cache: "no-store", ...init });
    const json = (await response.json()) as { ok?: boolean; data?: T; error?: { message?: string } };
    return response.ok && json.ok && json.data ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? "Üretim emri işlemi tamamlanamadı." };
  } catch {
    return { ok: false, error: "Bağlantı kurulamadı." };
  }
}

export function getProductionOrder(productionOrderId: string): Promise<ProductionApiResult<{ productionOrder: ProductionOrderRecord }>> {
  return productionOrderRequest(productionOrderId);
}
export function updateProductionOrder(productionOrderId: string, payload: Record<string, unknown>): Promise<ProductionApiResult<{ productionOrder: ProductionOrderRecord }>> {
  return productionOrderRequest(productionOrderId, "", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
}
export function archiveProductionOrder(productionOrderId: string): Promise<ProductionApiResult<{ archived: boolean }>> {
  return productionOrderRequest(productionOrderId, "/archive", { method: "POST" });
}
