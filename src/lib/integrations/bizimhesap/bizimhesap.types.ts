// Field shapes below come only from BizimHesap's public API docs
// (apidocs.bizimhesap.com) as of 2026-08-24 — the invoice/order payload is
// documented in full; the product/warehouse/stock RESPONSE shapes are not
// (the docs show only the request method/URL for those, no example JSON).
// Those three are therefore typed as opaque records — passed through as-is
// rather than parsed into fields we cannot verify exist.

export type BizimHesapCredentials = Readonly<{
  // Per-merchant token, obtained from the merchant's own BizimHesap account.
  token: string;
  // BizimHesap firm id, required by addinvoice's "firmId" field. Optional at
  // connect time (single-firm accounts may not need one) — required only
  // when actually pushing an invoice.
  firmId?: string;
}>;

export type BizimHesapCurrency = "TL" | "USD" | "EUR" | "CHF" | "GBP";

export type BizimHesapInvoiceLine = Readonly<{
  productId: string;
  productName: string;
  note?: string;
  barcode?: string;
  taxRate: number;
  quantity: number;
  unitPrice: number;
  grossPrice: number;
  discount: number;
  net: number;
  tax: number;
  total: number;
}>;

export type BizimHesapInvoicePayload = Readonly<{
  firmId: string;
  invoiceNo?: string;
  invoiceType: 3 | 5; // 3 = Sales, 5 = Purchase, per BizimHesap's addinvoice docs
  note?: string;
  dates: Readonly<{ invoiceDate: string; deliveryDate?: string; dueDate: string }>;
  customer: Readonly<{
    customerId: string;
    title: string;
    address: string;
    taxOffice?: string;
    taxNo?: string;
    email?: string;
    phone?: string;
  }>;
  details: readonly BizimHesapInvoiceLine[];
  amounts: Readonly<{ currency: BizimHesapCurrency; gross: number; discount: number; net: number; tax: number; total: number }>;
}>;

export type BizimHesapInvoiceResult = Readonly<{ guid: string; url: string }>;

export type BizimHesapCatalogSnapshot = Readonly<{
  fetchedAt: string;
  products: readonly Record<string, unknown>[];
  warehouses: readonly Record<string, unknown>[];
}>;

export type BizimHesapConnectionStatus = Readonly<{
  connected: boolean;
  status: "CONNECTED" | "ERROR" | "NOT_CONNECTED";
  connectedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastErrorCode: string | null;
}>;
