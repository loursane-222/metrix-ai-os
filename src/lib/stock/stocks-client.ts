export type StockRecord = {
  id: string;
  organizationId: string;
  productServiceId: string;
  warehouseId: string;
  location: string | null;
  quantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  status: string;
  lot: string | null;
  batch: string | null;
  serialNumber: string | null;
  productService: { id: string; name: string; type: string; unit: string | null };
  warehouse: { id: string; name: string; code: string };
  updatedAt: string;
};

export type WarehouseRecord = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  type: string | null;
  address: string | null;
};

export type StockApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type StockCountRecord = {
  id: string;
  stockId: string;
  status: string;
  systemQuantityAtCount: string;
  countedQuantity: string;
  varianceQuantity: string;
  investigationNote: string | null;
  stock?: StockRecord;
};

export async function listStock(): Promise<StockApiResult<{ stocks: StockRecord[]; count: number }>> {
  try {
    const response = await fetch("/api/stock", { credentials: "include" });
    const json = await response.json() as { ok?: boolean; data?: { stocks: StockRecord[]; count: number }; error?: { message?: string } };
    if (json.ok && json.data) return { ok: true, data: json.data };
    return { ok: false, error: json.error?.message ?? "Stok listesi alınamadı." };
  } catch {
    return { ok: false, error: "Bağlantı kurulamadı." };
  }
}

export async function listWarehouses(): Promise<StockApiResult<{ warehouses: WarehouseRecord[]; count: number }>> {
  try {
    const response = await fetch("/api/stock/warehouse", { credentials: "include" });
    const json = await response.json() as { ok?: boolean; data?: { warehouses: WarehouseRecord[]; count: number }; error?: { message?: string } };
    if (json.ok && json.data) return { ok: true, data: json.data };
    return { ok: false, error: json.error?.message ?? "Depo listesi alınamadı." };
  } catch {
    return { ok: false, error: "Bağlantı kurulamadı." };
  }
}

export async function transferStockApi(input: { productServiceId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number; reason?: string }): Promise<StockApiResult<{ source: StockRecord; destination: StockRecord }>> {
  try {
    const response = await fetch("/api/stock/transfer", { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(input) });
    const json = await response.json() as { ok?: boolean; data?: { source: StockRecord; destination: StockRecord }; error?: { message?: string } };
    if (json.ok && json.data) return { ok: true, data: json.data };
    return { ok: false, error: json.error?.message ?? "Transfer gerçekleştirilemedi." };
  } catch {
    return { ok: false, error: "Bağlantı kurulamadı." };
  }
}

async function stockRequest<T>(url: string, init?: RequestInit): Promise<StockApiResult<T>> {
  try {
    const response = await fetch(url, { credentials: "include", ...init });
    const json = await response.json() as { ok?: boolean; data?: T; error?: { message?: string } };
    if (json.ok && json.data) return { ok: true, data: json.data };
    return { ok: false, error: json.error?.message ?? "Stok işlemi gerçekleştirilemedi." };
  } catch {
    return { ok: false, error: "Bağlantı kurulamadı." };
  }
}

export function recordStockCount(input: { stockId: string; countedQuantity: number; note?: string }) {
  return stockRequest<{ record: StockCountRecord }>("/api/stock/counts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
}

export function listPendingStockCounts() {
  return stockRequest<{ records: StockCountRecord[]; count: number }>("/api/stock/counts");
}

export function resolveStockCount(countRecordId: string, resolution: "CONFIRM" | "DISMISS", note?: string) {
  return stockRequest<{ record: StockCountRecord }>(`/api/stock/counts/${encodeURIComponent(countRecordId)}/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ resolution, note }) });
}

export function getStockHealth() {
  return stockRequest<{ status: string; healthSummary: string; categories: Record<string, { count: number; sampleStockIds: string[] }> }>("/api/stock/intelligence/health");
}

export function getStockExecutiveSignals() {
  return stockRequest<{ status: string; healthSummary: string; openVarianceCount: number; riskSignalCount: number; opportunitySignalCount: number; operationalSignalCount: number }>("/api/stock/intelligence/executive");
}
