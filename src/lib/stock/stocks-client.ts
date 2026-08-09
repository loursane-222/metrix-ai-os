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
