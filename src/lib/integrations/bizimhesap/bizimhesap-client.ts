// Minimal BizimHesap REST adapter. Ported knowledge only (base URL, the
// two-header auth shape, and the handful of read endpoints this operation
// needs) — none of the legacy service's Prisma/encryption/action-runtime
// wiring is carried over; NEXT has its own credential storage and sync
// action. Product/warehouse/stock response shapes are UNDOCUMENTED by
// BizimHesap itself, so they are intentionally typed as opaque records —
// never trust an inferred schema, always verify against a live account.

const BASE_URL = "https://bizimhesap.com/api/b2b";

export type BizimHesapCredentials = {
  token: string;
  firmId?: string;
};

export type BizimHesapRecord = Record<string, unknown>;

export class BizimHesapRequestError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(`BizimHesap request failed: ${code}`);
    this.name = "BizimHesapRequestError";
    this.code = code;
    this.status = status;
  }
}

export class MissingPartnerKeyError extends Error {
  readonly code = "MISSING_BIZIMHESAP_PARTNER_KEY";

  constructor() {
    super(
      "BIZIMHESAP_PARTNER_KEY is not configured — a real partner " +
        "credential with BizimHesap is required before any connection " +
        "can be attempted"
    );
    this.name = "MissingPartnerKeyError";
  }
}

function requirePartnerKey(): string {
  const key = process.env.BIZIMHESAP_PARTNER_KEY;

  if (!key || key.trim().length === 0) {
    throw new MissingPartnerKeyError();
  }

  return key;
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

async function bizimHesapRequest(
  path: string,
  credentials: BizimHesapCredentials,
  fetchImpl: FetchLike
): Promise<unknown> {
  const partnerKey = requirePartnerKey();

  const response = await fetchImpl(`${BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Key: partnerKey,
      Token: credentials.token
    }
  });

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new BizimHesapRequestError(
      `INVALID_RESPONSE_${response.status}`,
      response.status
    );
  }

  if (!response.ok) {
    throw new BizimHesapRequestError(
      `HTTP_${response.status}`,
      response.status
    );
  }

  return body;
}

function asRecordArray(body: unknown): BizimHesapRecord[] {
  return Array.isArray(body)
    ? body.filter(
        (item): item is BizimHesapRecord =>
          typeof item === "object" && item !== null
      )
    : [];
}

export async function bizimHesapListProducts(
  credentials: BizimHesapCredentials,
  fetchImpl: FetchLike = fetch
): Promise<BizimHesapRecord[]> {
  return asRecordArray(
    await bizimHesapRequest("/products", credentials, fetchImpl)
  );
}

export async function bizimHesapListWarehouses(
  credentials: BizimHesapCredentials,
  fetchImpl: FetchLike = fetch
): Promise<BizimHesapRecord[]> {
  return asRecordArray(
    await bizimHesapRequest("/warehouses", credentials, fetchImpl)
  );
}

export async function bizimHesapGetStock(
  credentials: BizimHesapCredentials,
  warehouseId: string,
  fetchImpl: FetchLike = fetch
): Promise<BizimHesapRecord[]> {
  return asRecordArray(
    await bizimHesapRequest(
      `/inventory/${encodeURIComponent(warehouseId)}`,
      credentials,
      fetchImpl
    )
  );
}

/** Cheapest real connectivity check available on this API surface. */
export async function bizimHesapVerifyCredentials(
  credentials: BizimHesapCredentials,
  fetchImpl: FetchLike = fetch
): Promise<boolean> {
  await bizimHesapListWarehouses(credentials, fetchImpl);
  return true;
}
