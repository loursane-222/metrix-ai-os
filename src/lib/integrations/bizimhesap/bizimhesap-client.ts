import type {
  BizimHesapCredentials,
  BizimHesapInvoicePayload,
  BizimHesapInvoiceResult,
} from "./bizimhesap.types";

const BASE_URL = "https://bizimhesap.com/api/b2b";

// BizimHesap's B2B API is provided per integration partner as a fixed "Key"
// header (issued by BizimHesap once METRIX registers as a partner — not
// something any single merchant provides) alongside each merchant's own
// per-account "Token". Never fabricate a value here.
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function partnerKey(): string {
  return requiredEnv("BIZIMHESAP_PARTNER_KEY");
}

function authHeaders(credentials: BizimHesapCredentials): Record<string, string> {
  return { Key: partnerKey(), Token: credentials.token };
}

async function bizimHesapRequest<T>(path: string, init: RequestInit & { headers: Record<string, string> }): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`BIZIMHESAP_INVALID_RESPONSE_${response.status}`);
  }
  if (!response.ok) throw new Error(`BIZIMHESAP_${response.status}`);
  return json as T;
}

export async function bizimHesapAddInvoice(credentials: BizimHesapCredentials, payload: BizimHesapInvoicePayload): Promise<BizimHesapInvoiceResult> {
  const result = await bizimHesapRequest<{ error: string; guid: string; url: string }>("/addinvoice", {
    method: "POST",
    headers: { ...authHeaders(credentials), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (result.error) throw new Error(`BIZIMHESAP_INVOICE_REJECTED: ${result.error}`);
  return { guid: result.guid, url: result.url };
}

export async function bizimHesapListProducts(credentials: BizimHesapCredentials): Promise<readonly Record<string, unknown>[]> {
  const result = await bizimHesapRequest<unknown>("/products", { method: "GET", headers: authHeaders(credentials) });
  return Array.isArray(result) ? result as Record<string, unknown>[] : [];
}

export async function bizimHesapListWarehouses(credentials: BizimHesapCredentials): Promise<readonly Record<string, unknown>[]> {
  const result = await bizimHesapRequest<unknown>("/warehouses", { method: "GET", headers: authHeaders(credentials) });
  return Array.isArray(result) ? result as Record<string, unknown>[] : [];
}

export async function bizimHesapGetStock(credentials: BizimHesapCredentials, warehouseId: string): Promise<readonly Record<string, unknown>[]> {
  const result = await bizimHesapRequest<unknown>(`/inventory/${encodeURIComponent(warehouseId)}`, { method: "GET", headers: authHeaders(credentials) });
  return Array.isArray(result) ? result as Record<string, unknown>[] : [];
}

// A cheap connectivity check for the "connect" flow — the warehouses
// endpoint is read-only and side-effect-free, so it's the safest way to
// confirm a Token is valid before storing it.
export async function bizimHesapVerifyCredentials(credentials: BizimHesapCredentials): Promise<void> {
  await bizimHesapListWarehouses(credentials);
}
