export type SupplierStatus = "ACTIVE" | "PASSIVE" | "ARCHIVED";
export type SupplierRecord = { id: string; displayName: string; legalName: string | null; phone: string | null; email: string | null; website: string | null; taxNumber: string | null; taxOffice: string | null; metrixNote: string | null; riskNotes: string | null; status: SupplierStatus; score?: number | null; executiveSummary?: unknown; deliveryPerformance?: unknown; qualityPerformance?: unknown; pricingPerformance?: unknown; riskProfile?: unknown; updatedAt: string };
export type SupplierApiResult<T> = { ok: true; data: T } | { ok: false; error: string };
export async function listSuppliers(): Promise<SupplierApiResult<{ suppliers: SupplierRecord[]; count: number }>> { try { const response = await fetch("/api/suppliers", { credentials: "include" }); const json = await response.json() as { ok?: boolean; data?: { suppliers: SupplierRecord[]; count: number }; error?: { message?: string } }; if (json.ok && json.data) return { ok: true, data: json.data }; return { ok: false, error: json.error?.message ?? "Tedarikçiler alınamadı." }; } catch { return { ok: false, error: "Bağlantı kurulamadı." }; } }

async function supplierRequest<T>(supplierId: string, suffix = "", init?: RequestInit): Promise<SupplierApiResult<T>> {
  try {
    const response = await fetch(`/api/suppliers/${encodeURIComponent(supplierId)}${suffix}`, { credentials: "include", cache: "no-store", ...init });
    const json = await response.json() as { ok?: boolean; data?: T; error?: { message?: string } };
    return response.ok && json.ok && json.data ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? "Tedarikçi işlemi tamamlanamadı." };
  } catch { return { ok: false, error: "Bağlantı kurulamadı." }; }
}

export function getSupplier(supplierId: string): Promise<SupplierApiResult<{ supplier: SupplierRecord }>> { return supplierRequest(supplierId); }
export function updateSupplier(supplierId: string, payload: Record<string, unknown>): Promise<SupplierApiResult<{ supplier: SupplierRecord }>> { return supplierRequest(supplierId, "", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
export function archiveSupplier(supplierId: string): Promise<SupplierApiResult<{ archived: boolean }>> { return supplierRequest(supplierId, "/archive", { method: "POST" }); }
