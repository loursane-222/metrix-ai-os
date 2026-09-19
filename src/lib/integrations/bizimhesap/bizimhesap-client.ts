// Minimal BizimHesap REST adapter. Ported knowledge only (base URL, the
// two-header auth shape, and the handful of read endpoints this operation
// needs) — none of the legacy service's Prisma/encryption/action-runtime
// wiring is carried over; NEXT has its own credential storage and sync
// action. Product/warehouse/stock response shapes are UNDOCUMENTED by
// BizimHesap itself, so they are intentionally typed as opaque records —
// never trust an inferred schema, always verify against a live account.

import {
  describeBizimHesapSchema,
  logBizimHesapSchema
} from "./bizimhesap-schema-diagnostic";

const BASE_URL = "https://bizimhesap.com/api/b2b";

// The B2B "Key" header. BizimHesap's official API documentation
// (apidocs.bizimhesap.com — the products, warehouses and inventory pages)
// prints this one fixed value for every merchant and states nothing that
// makes it per-merchant, per-partner or secret. It is therefore the
// protocol's own constant, not deployment configuration: nobody sets it,
// nobody is asked for it. The merchant secret is the Token, which never
// lives in code or in the environment.
export const BIZIMHESAP_B2B_KEY = "BZMHB2B724018943908D0B82491F203F";

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
  let response: Awaited<ReturnType<FetchLike>>;

  try {
    response = await fetchImpl(`${BASE_URL}${path}`, {
      method: "GET",
      headers: {
        Key: BIZIMHESAP_B2B_KEY,
        Token: credentials.token
      }
    });
  } catch {
    // A transport-level failure says nothing about the credential; the
    // original error is dropped so no request detail can reach a log.
    throw new BizimHesapRequestError("NETWORK_ERROR");
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    logBizimHesapSchema(
      describeBizimHesapSchema(path, undefined, response.status)
    );
    throw new BizimHesapRequestError(
      `INVALID_RESPONSE_${response.status}`,
      response.status
    );
  }

  if (!response.ok) {
    logBizimHesapSchema(describeBizimHesapSchema(path, body, response.status));
    throw new BizimHesapRequestError(
      `HTTP_${response.status}`,
      response.status
    );
  }

  return body;
}

// The three read endpoints are documented only as "returns a list" (the
// official docs show no response example), so a non-array body is NOT an
// empty list — it is an unrecognised answer (e.g. an error object sent with
// HTTP 200) and must never be read as "connectivity proven".
function asRecordArray(body: unknown, endpoint: string): BizimHesapRecord[] {
  if (!Array.isArray(body)) {
    logBizimHesapSchema(describeBizimHesapSchema(endpoint, body));
    throw new BizimHesapRequestError("UNEXPECTED_RESPONSE_SHAPE");
  }

  return body.filter(
    (item): item is BizimHesapRecord =>
      typeof item === "object" && item !== null
  );
}

/**
 * Separates "the provider did not accept this credential" from "the
 * provider/network could not be reached", so the user is never told a
 * correct token is wrong because of an outage.
 */
export function bizimHesapFailureReason(
  error: BizimHesapRequestError
): "CREDENTIALS_REJECTED" | "PROVIDER_UNAVAILABLE" {
  const status = error.status;

  if (
    error.code === "NETWORK_ERROR" ||
    (status !== undefined &&
      (status >= 500 || status === 408 || status === 429))
  ) {
    return "PROVIDER_UNAVAILABLE";
  }

  return "CREDENTIALS_REJECTED";
}

export async function bizimHesapListProducts(
  credentials: BizimHesapCredentials,
  fetchImpl: FetchLike = fetch
): Promise<BizimHesapRecord[]> {
  return asRecordArray(
    await bizimHesapRequest("/products", credentials, fetchImpl),
    "/products"
  );
}

export async function bizimHesapListWarehouses(
  credentials: BizimHesapCredentials,
  fetchImpl: FetchLike = fetch
): Promise<BizimHesapRecord[]> {
  return asRecordArray(
    await bizimHesapRequest("/warehouses", credentials, fetchImpl),
    "/warehouses"
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
    ),
    "/inventory/{warehouseId}"
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
