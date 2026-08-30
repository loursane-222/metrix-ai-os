import { prisma } from "@/lib/core/shared/prisma";
import { computeLineNetCents, computeLineTotalCents, centsToAmount } from "@/lib/core/quotes/quote-totals";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "../integration-secret-crypto";
import {
  bizimHesapAddInvoice,
  bizimHesapListProducts,
  bizimHesapListWarehouses,
  bizimHesapVerifyCredentials,
} from "./bizimhesap-client";
import type {
  BizimHesapCatalogSnapshot,
  BizimHesapConnectionStatus,
  BizimHesapCredentials,
  BizimHesapInvoiceLine,
  BizimHesapInvoiceResult,
} from "./bizimhesap.types";

const PROVIDER = "bizimhesap";

function readCredentials(credentialsEncrypted: string): BizimHesapCredentials {
  return JSON.parse(decryptIntegrationSecret(credentialsEncrypted)) as BizimHesapCredentials;
}

export async function connectBizimHesap(input: { organizationId: string; credentials: BizimHesapCredentials }): Promise<void> {
  if (!input.credentials.token.trim()) throw new Error("BIZIMHESAP_TOKEN_MISSING");
  // Verifies the Token is real before ever storing it — never persist an
  // unverified credential.
  await bizimHesapVerifyCredentials(input.credentials);
  const credentialsEncrypted = encryptIntegrationSecret(JSON.stringify(input.credentials));
  await prisma.integrationConnection.upsert({
    where: { organizationId_provider: { organizationId: input.organizationId, provider: PROVIDER } },
    create: { organizationId: input.organizationId, provider: PROVIDER, credentialsEncrypted },
    update: { credentialsEncrypted, status: "CONNECTED", connectedAt: new Date(), lastErrorAt: null, lastErrorCode: null },
  });
}

export async function getBizimHesapStatus(organizationId: string): Promise<BizimHesapConnectionStatus> {
  const row = await prisma.integrationConnection.findUnique({ where: { organizationId_provider: { organizationId, provider: PROVIDER } } });
  if (!row) return { connected: false, status: "NOT_CONNECTED", connectedAt: null, lastSuccessfulSyncAt: null, lastErrorCode: null };
  return {
    connected: row.status === "CONNECTED",
    status: row.status === "CONNECTED" ? "CONNECTED" : "ERROR",
    connectedAt: row.connectedAt.toISOString(),
    lastSuccessfulSyncAt: row.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
  };
}

export async function disconnectBizimHesap(organizationId: string): Promise<void> {
  await prisma.integrationConnection.deleteMany({ where: { organizationId, provider: PROVIDER } });
}

// Read-only snapshot, never merged into METRIX's own canonical Product/Stock
// domain — that domain still owns its own data (Tek Gerçeklik İlkesi). This
// is purely "what does BizimHesap currently show", for the user to compare
// and reconcile manually. A real merge/reconciliation strategy is future
// scope, not this v1.
export async function syncBizimHesapCatalog(organizationId: string): Promise<BizimHesapCatalogSnapshot> {
  const row = await prisma.integrationConnection.findUnique({ where: { organizationId_provider: { organizationId, provider: PROVIDER } } });
  if (!row) throw new Error("BIZIMHESAP_NOT_CONNECTED");
  const credentials = readCredentials(row.credentialsEncrypted);
  try {
    const [products, warehouses] = await Promise.all([
      bizimHesapListProducts(credentials),
      bizimHesapListWarehouses(credentials),
    ]);
    await prisma.integrationConnection.update({ where: { id: row.id, organizationId }, data: { status: "CONNECTED", lastSuccessfulSyncAt: new Date(), lastErrorAt: null, lastErrorCode: null } });
    return { fetchedAt: new Date().toISOString(), products, warehouses };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "BIZIMHESAP_SYNC_FAILED";
    await prisma.integrationConnection.update({ where: { id: row.id, organizationId }, data: { status: "ERROR", lastErrorAt: new Date(), lastErrorCode: code } });
    throw error;
  }
}

export type PushInvoiceLineInput = {
  name: string;
  quantity: number;
  unitPriceCents: bigint;
  discountBasisPoints: number;
  vatRateBasisPoints: number;
  productServiceId?: string | null;
};

export async function pushInvoiceToBizimHesap(input: {
  organizationId: string;
  invoice: { invoiceNumber: string; title: string; amount: number; taxRate: number; taxAmount: number; totalAmount: number; currency: string; dueDate: Date | null; items: readonly PushInvoiceLineInput[] };
  customer: { id: string; displayName: string; legalName: string | null; taxOffice: string | null; taxNumber: string | null; email: string | null; phone: string | null; addressLine: string | null };
}): Promise<BizimHesapInvoiceResult> {
  const row = await prisma.integrationConnection.findUnique({ where: { organizationId_provider: { organizationId: input.organizationId, provider: PROVIDER } } });
  if (!row) throw new Error("BIZIMHESAP_NOT_CONNECTED");
  const credentials = readCredentials(row.credentialsEncrypted);
  if (!credentials.firmId) throw new Error("BIZIMHESAP_FIRM_ID_MISSING");
  const currency = toBizimHesapCurrency(input.invoice.currency);
  const now = new Date();
  const details = buildBizimHesapInvoiceLines(input.invoice);
  try {
    const result = await bizimHesapAddInvoice(credentials, {
      firmId: credentials.firmId,
      invoiceNo: input.invoice.invoiceNumber,
      invoiceType: 3,
      dates: {
        invoiceDate: now.toISOString(),
        dueDate: (input.invoice.dueDate ?? now).toISOString(),
      },
      customer: {
        customerId: input.customer.id,
        title: input.customer.legalName ?? input.customer.displayName,
        address: input.customer.addressLine ?? "",
        taxOffice: input.customer.taxOffice ?? undefined,
        taxNo: input.customer.taxNumber ?? undefined,
        email: input.customer.email ?? undefined,
        phone: input.customer.phone ?? undefined,
      },
      details,
      amounts: {
        currency,
        gross: input.invoice.amount,
        discount: 0,
        net: input.invoice.amount,
        tax: input.invoice.taxAmount,
        total: input.invoice.totalAmount,
      },
    });
    await prisma.integrationConnection.update({ where: { id: row.id, organizationId: input.organizationId }, data: { status: "CONNECTED", lastSuccessfulSyncAt: new Date(), lastErrorAt: null, lastErrorCode: null } });
    return result;
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "BIZIMHESAP_PUSH_FAILED";
    await prisma.integrationConnection.update({ where: { id: row.id, organizationId: input.organizationId }, data: { status: "ERROR", lastErrorAt: new Date(), lastErrorCode: code } });
    throw error;
  }
}

/**
 * Canonical InvoiceItem satırlarından gerçek, per-line KDV verisi taşıyan
 * BizimHesap detail satırları üretir — mixed-VAT bir invoice'ı tek blended
 * Invoice.taxRate'e indirgeyip vergi bilgisini kaybetmek yerine, her satırın
 * KENDİ vatRateBasisPoints'i BizimHesap'ın kendi (satır bazlı taxRate
 * destekleyen) details[] şemasına aktarılır.
 *
 * net/tax/total per-line, ham (Order'ın header-level generalDiscountBasisPoints'i
 * uygulanmadan önceki) computeLineNetCents/computeLineTotalCents ile
 * hesaplanır, sonra invoice'ın KENDİ header totalAmount/amount'ına göre
 * orantılı olarak yeniden ölçeklenir (son satır kalanı alır, asla bağımsız
 * yuvarlanmaz) — böylece Σ details[].total her zaman TAM OLARAK
 * amounts.total'a eşit olur (createInvoiceFromOrder'da bir Order genel
 * iskontosu varsa ham satır toplamı header toplamından farklı olabilir;
 * bu farkı burada, METRIX'in kendi InvoiceItem saklama biçimini
 * DEĞİŞTİRMEDEN, yalnız dışarı giden payload'da düzeltiyoruz).
 *
 * Fail-closed: hiç InvoiceItem yoksa (Phase 7 öncesi oluşturulmuş, historical
 * bir invoice — bilerek backfill edilmedi) sessizce yanlış/uydurma bir satır
 * göndermek yerine açıkça reddeder.
 */
export function buildBizimHesapInvoiceLines(invoice: {
  amount: number;
  taxAmount: number;
  totalAmount: number;
  items: readonly PushInvoiceLineInput[];
}): BizimHesapInvoiceLine[] {
  if (invoice.items.length === 0) {
    throw new Error("BIZIMHESAP_PUSH_NO_LINE_ITEMS: invoice has no InvoiceItem rows to push (created before Phase 7's line authority) — refusing to synthesize a fake line.");
  }

  const rawTotalsCents = invoice.items.map((item) => computeLineTotalCents(item));
  const rawNetsCents = invoice.items.map((item) => computeLineNetCents(item));
  const sumRawTotalCents = rawTotalsCents.reduce((sum, cents) => sum + cents, BigInt(0));
  const sumRawNetCents = rawNetsCents.reduce((sum, cents) => sum + cents, BigInt(0));
  const headerTotalCents = BigInt(Math.round(invoice.totalAmount * 100));
  const headerNetCents = BigInt(Math.round(invoice.amount * 100));

  let allocatedTotalCents = BigInt(0);
  let allocatedNetCents = BigInt(0);

  return invoice.items.map((item, index) => {
    const isLast = index === invoice.items.length - 1;
    const scaledTotalCents = isLast
      ? headerTotalCents - allocatedTotalCents
      : sumRawTotalCents === BigInt(0) ? BigInt(0) : (headerTotalCents * rawTotalsCents[index]!) / sumRawTotalCents;
    const scaledNetCents = isLast
      ? headerNetCents - allocatedNetCents
      : sumRawNetCents === BigInt(0) ? BigInt(0) : (headerNetCents * rawNetsCents[index]!) / sumRawNetCents;
    allocatedTotalCents += scaledTotalCents;
    allocatedNetCents += scaledNetCents;
    const scaledTaxCents = scaledTotalCents - scaledNetCents;

    const quantityMicros = BigInt(Math.round(item.quantity * 1_000_000));
    const grossCents = (item.unitPriceCents * quantityMicros) / BigInt(1_000_000);

    return {
      productId: item.productServiceId ?? "invoice-line",
      productName: item.name,
      taxRate: item.vatRateBasisPoints / 100,
      quantity: item.quantity,
      unitPrice: centsToAmount(item.unitPriceCents),
      grossPrice: centsToAmount(grossCents),
      // gross - discount = net must hold exactly for the payload we send,
      // so discount absorbs both the line's own discountBasisPoints AND its
      // proportional share of any Order-level general discount folded into
      // scaledNetCents above — not just the raw per-line discount alone.
      discount: centsToAmount(grossCents - scaledNetCents),
      net: centsToAmount(scaledNetCents),
      tax: centsToAmount(scaledTaxCents),
      total: centsToAmount(scaledTotalCents),
    };
  });
}

function toBizimHesapCurrency(currency: string): "TL" | "USD" | "EUR" | "CHF" | "GBP" {
  if (currency === "TRY") return "TL";
  if (currency === "USD" || currency === "EUR" || currency === "CHF" || currency === "GBP") return currency;
  throw new Error(`BIZIMHESAP_UNSUPPORTED_CURRENCY: ${currency}`);
}
