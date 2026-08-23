import { prisma } from "@/lib/core/shared/prisma";
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

export async function pushInvoiceToBizimHesap(input: {
  organizationId: string;
  invoice: { invoiceNumber: string; title: string; amount: number; taxRate: number; taxAmount: number; totalAmount: number; currency: string; dueDate: Date | null };
  customer: { id: string; displayName: string; legalName: string | null; taxOffice: string | null; taxNumber: string | null; email: string | null; phone: string | null; addressLine: string | null };
}): Promise<BizimHesapInvoiceResult> {
  const row = await prisma.integrationConnection.findUnique({ where: { organizationId_provider: { organizationId: input.organizationId, provider: PROVIDER } } });
  if (!row) throw new Error("BIZIMHESAP_NOT_CONNECTED");
  const credentials = readCredentials(row.credentialsEncrypted);
  if (!credentials.firmId) throw new Error("BIZIMHESAP_FIRM_ID_MISSING");
  const currency = toBizimHesapCurrency(input.invoice.currency);
  const now = new Date();
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
      // METRIX's Invoice model has no line-item table (single aggregate
      // amount) — represented honestly as one synthetic line, not invented
      // per-product detail.
      details: [{
        productId: "invoice-total",
        productName: input.invoice.title,
        taxRate: input.invoice.taxRate,
        quantity: 1,
        unitPrice: input.invoice.amount,
        grossPrice: input.invoice.amount,
        discount: 0,
        net: input.invoice.amount,
        tax: input.invoice.taxAmount,
        total: input.invoice.totalAmount,
      }],
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

function toBizimHesapCurrency(currency: string): "TL" | "USD" | "EUR" | "CHF" | "GBP" {
  if (currency === "TRY") return "TL";
  if (currency === "USD" || currency === "EUR" || currency === "CHF" || currency === "GBP") return currency;
  throw new Error(`BIZIMHESAP_UNSUPPORTED_CURRENCY: ${currency}`);
}
