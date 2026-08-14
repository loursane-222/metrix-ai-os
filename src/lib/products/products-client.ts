export type ProductType = "PRODUCT" | "SERVICE";
export type ProductStatus = "ACTIVE" | "PASSIVE" | "ARCHIVED";
export type ProductRecord = { id: string; name: string; type: ProductType; category: string | null; unit: string | null; costCents: string | null; priceCents: string | null; currency: string; stockBehavior: string | null; status: ProductStatus; updatedAt: string };
export type ProductApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function productRequest<T>(productId: string, suffix = "", init?: RequestInit): Promise<ProductApiResult<T>> {
  try {
    const response = await fetch(`/api/products/${encodeURIComponent(productId)}${suffix}`, { credentials: "include", cache: "no-store", ...init });
    const json = await response.json() as { ok?: boolean; data?: T; error?: { message?: string } };
    return response.ok && json.ok && json.data ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? "Ürün işlemi tamamlanamadı." };
  } catch { return { ok: false, error: "Bağlantı kurulamadı." }; }
}

export function getProduct(productId: string): Promise<ProductApiResult<{ product: ProductRecord }>> { return productRequest(productId); }
export function updateProduct(productId: string, payload: Record<string, unknown>): Promise<ProductApiResult<{ product: ProductRecord }>> { return productRequest(productId, "", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
export function archiveProduct(productId: string): Promise<ProductApiResult<{ archived: boolean }>> { return productRequest(productId, "/archive", { method: "POST" }); }
export function resolveProductEditCommandRequest(productId: string, payload: { utterance: string; activeTab: string }): Promise<ProductApiResult<{ outcome: unknown }>> { return productRequest(productId, "/actions/edit-command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
