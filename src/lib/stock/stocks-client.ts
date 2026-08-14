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
  notes: string | null;
};

export type ProductOption = { id: string; name: string; type: string; unit: string | null };
export type SupplierOption = { id: string; displayName: string };

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

export async function createWarehouseApi(input: { name: string; code: string; type?: string; address?: string; notes?: string }): Promise<StockApiResult<{ warehouse: WarehouseRecord }>> {
  return stockRequest<{ warehouse: WarehouseRecord }>("/api/stock/warehouse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listStockFormOptions(): Promise<StockApiResult<{ products: ProductOption[]; suppliers: SupplierOption[]; warehouses: WarehouseRecord[] }>> {
  try {
    const [productsResponse, suppliersResponse, warehousesResponse] = await Promise.all([
      fetch("/api/products?type=PRODUCT&status=ACTIVE", { credentials: "include" }),
      fetch("/api/suppliers", { credentials: "include" }),
      fetch("/api/stock/warehouse", { credentials: "include" }),
    ]);
    const productsJson = await productsResponse.json() as { ok?: boolean; data?: { products: ProductOption[] }; error?: { message?: string } };
    const suppliersJson = await suppliersResponse.json() as { ok?: boolean; data?: { suppliers: SupplierOption[] }; error?: { message?: string } };
    const warehousesJson = await warehousesResponse.json() as { ok?: boolean; data?: { warehouses: WarehouseRecord[] }; error?: { message?: string } };
    if (!productsResponse.ok || !productsJson.ok || !productsJson.data) return { ok: false, error: productsJson.error?.message ?? "Ürünler alınamadı." };
    if (!suppliersResponse.ok || !suppliersJson.ok || !suppliersJson.data) return { ok: false, error: suppliersJson.error?.message ?? "Tedarikçiler alınamadı." };
    if (!warehousesResponse.ok || !warehousesJson.ok || !warehousesJson.data) return { ok: false, error: warehousesJson.error?.message ?? "Depolar alınamadı." };
    return { ok: true, data: { products: productsJson.data.products, suppliers: suppliersJson.data.suppliers, warehouses: warehousesJson.data.warehouses } };
  } catch {
    return { ok: false, error: "Bağlantı kurulamadı." };
  }
}

export async function resolveStockOperationCommandRequest(input: { utterance: string; activeTab: string }): Promise<StockApiResult<{ outcome: unknown }>> {
  return stockRequest<{ outcome: unknown }>("/api/stock/actions/edit-command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
}

export function receiveStockApi(input: {
  productServiceId: string;
  warehouseId: string;
  quantity: number;
  lot?: string;
  batch?: string;
  serialNumber?: string;
  location?: string;
  reason?: string;
  supplierId?: string;
  expectedAt?: string;
  unitCostCents?: number;
  qualityFlag?: string;
}): Promise<StockApiResult<{ stock: StockRecord }>> {
  return stockRequest<{ stock: StockRecord }>("/api/stock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function transferStockApi(input: { productServiceId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number; lot?: string; batch?: string; serialNumber?: string; reason?: string }): Promise<StockApiResult<{ source: StockRecord; destination: StockRecord }>> {
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
