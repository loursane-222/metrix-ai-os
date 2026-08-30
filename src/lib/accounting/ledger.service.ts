import type { LedgerSourceType, Prisma } from "@prisma/client";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import { isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";

const ACCOUNT_IDS = Object.freeze({
  cash: "ledger-account-100",
  receivables: "ledger-account-120",
  inventory: "ledger-account-153",
  vatReceivable: "ledger-account-191",
  payables: "ledger-account-320",
  vatPayable: "ledger-account-391",
  domesticSales: "ledger-account-600",
  generalExpense: "ledger-account-770",
});

const DESCRIPTIONS = Object.freeze({
  invoiceSent: "Fatura gönderildi",
  expenseRecognized: "Gider kaydedildi",
  expenseSettled: "Gider ödemesi kaydedildi",
  paymentApplied: "Tahsilat kaydedildi",
  purchaseInvoiceConfirmed: "Alış faturası kaydedildi",
  supplierPaymentApplied: "Tedarikçi ödemesi kaydedildi",
});
const ZERO = BigInt(0);

type Money = Prisma.Decimal | number | string;
type Line = Readonly<{ accountId: string; debitCents?: bigint; creditCents?: bigint }>;

export async function recordInvoiceSent(input: {
  tx: PrismaTransactionClient;
  organizationId: string;
  invoiceId: string;
  entryDate: Date;
  netAmount: Money;
  taxAmount: Money;
  totalAmount: Money;
  currency: string;
}) {
  const net = toCents(input.netAmount);
  const tax = toCents(input.taxAmount);
  const total = toCents(input.totalAmount);
  assertBalancedAmounts(total, net + tax, "Invoice");
  return createEntry(input.tx, {
    organizationId: input.organizationId,
    entryDate: input.entryDate,
    description: DESCRIPTIONS.invoiceSent,
    sourceType: "INVOICE",
    sourceId: input.invoiceId,
    currency: input.currency,
    lines: [
      { accountId: ACCOUNT_IDS.receivables, debitCents: total },
      { accountId: ACCOUNT_IDS.domesticSales, creditCents: net },
      ...(tax > ZERO ? [{ accountId: ACCOUNT_IDS.vatPayable, creditCents: tax }] : []),
    ],
  });
}

export async function recordExpenseCreated(input: { tx: PrismaTransactionClient; organizationId: string; expenseId: string; entryDate: Date; amount: Money; currency: string }) {
  const amount = toCents(input.amount);
  return createEntry(input.tx, { ...input, description: DESCRIPTIONS.expenseRecognized, sourceType: "EXPENSE", sourceId: input.expenseId, lines: [{ accountId: ACCOUNT_IDS.generalExpense, debitCents: amount }, { accountId: ACCOUNT_IDS.payables, creditCents: amount }] });
}

/**
 * Expense'in gerçek ödeme (payable settlement) tarafı — recordExpenseCreated
 * ile ekonomik tanımayı (bugün) fiili nakit çıkışından (ödendiğinde) ayırır.
 * recordPaymentApplication'ın payable aynası: her ExpenseSettlement için
 * bir kez, sourceId expenseSettlement.id'dir (expenseId değil) — böylece
 * aynı gidere yapılan birden fazla kısmi ödeme (organizationId, sourceType,
 * sourceId, description) unique constraint'inde çakışmaz.
 */
export async function recordExpenseSettlementApplication(input: { tx: PrismaTransactionClient; organizationId: string; expenseSettlementId: string; entryDate: Date; amount: Money; currency: string }) {
  const amount = toCents(input.amount);
  return createEntry(input.tx, { ...input, description: DESCRIPTIONS.expenseSettled, sourceType: "EXPENSE_SETTLEMENT", sourceId: input.expenseSettlementId, lines: [{ accountId: ACCOUNT_IDS.payables, debitCents: amount }, { accountId: ACCOUNT_IDS.cash, creditCents: amount }] });
}

/**
 * Payment is not matched to a specific Invoice in the current schema; it
 * reduces the aggregate 120 Alıcılar balance. Fires once per Settlement
 * Application with the incremental applied amount (not the cumulative
 * payment total) — sourceId is the Application id, not the Payment id, so
 * repeated partial applications against the same Payment each get their own
 * entry instead of colliding on the (organizationId, sourceType, sourceId,
 * description) unique constraint. 100 "Kasa/Banka" is a single combined
 * account in this chart of accounts — CASH and BANK_TRANSFER settlements
 * both post here; the real cash-vs-bank distinction lives in
 * FinancialAccountMovement/FinancialAccount, not in this coarse ledger.
 */
export async function recordPaymentApplication(input: { tx: PrismaTransactionClient; organizationId: string; applicationId: string; entryDate: Date; amount: Money; currency: string }) {
  const amount = toCents(input.amount);
  return createEntry(input.tx, { ...input, description: DESCRIPTIONS.paymentApplied, sourceType: "PAYMENT_APPLICATION", sourceId: input.applicationId, lines: [{ accountId: ACCOUNT_IDS.cash, debitCents: amount }, { accountId: ACCOUNT_IDS.receivables, creditCents: amount }] });
}

/**
 * Purchase Invoice'ın gerçek ekonomik tanıma anı — recordInvoiceSent'in
 * payable/purchase aynası. dr Stoklar (net) + dr İndirilecek KDV (tax), cr
 * Satıcılar (total) — sales tarafının vatPayable (391, output/liability)
 * hesabından KASITLI olarak ayrı bir vatReceivable (191, input/asset)
 * hesabına postalar; ikisini karıştırmak muhasebesel olarak yanlış olurdu.
 */
export async function recordPurchaseInvoiceConfirmed(input: {
  tx: PrismaTransactionClient;
  organizationId: string;
  purchaseInvoiceId: string;
  entryDate: Date;
  netAmount: Money;
  taxAmount: Money;
  totalAmount: Money;
  currency: string;
}) {
  const net = toCents(input.netAmount);
  const tax = toCents(input.taxAmount);
  const total = toCents(input.totalAmount);
  assertBalancedAmounts(total, net + tax, "PurchaseInvoice");
  return createEntry(input.tx, {
    organizationId: input.organizationId,
    entryDate: input.entryDate,
    description: DESCRIPTIONS.purchaseInvoiceConfirmed,
    sourceType: "PURCHASE_INVOICE",
    sourceId: input.purchaseInvoiceId,
    currency: input.currency,
    lines: [
      { accountId: ACCOUNT_IDS.inventory, debitCents: net },
      ...(tax > ZERO ? [{ accountId: ACCOUNT_IDS.vatReceivable, debitCents: tax }] : []),
      { accountId: ACCOUNT_IDS.payables, creditCents: total },
    ],
  });
}

/**
 * Tedarikçiye gerçek para çıkışı — recordExpenseSettlementApplication /
 * recordPaymentApplication'ın supplier-payable aynası. sourceId
 * supplierPayment.id'dir (purchaseInvoiceId değil) — aynı faturaya yapılan
 * birden fazla kısmi ödeme (organizationId, sourceType, sourceId,
 * description) unique constraint'inde çakışmaz.
 */
export async function recordSupplierPaymentApplication(input: { tx: PrismaTransactionClient; organizationId: string; supplierPaymentId: string; entryDate: Date; amount: Money; currency: string }) {
  const amount = toCents(input.amount);
  return createEntry(input.tx, { ...input, description: DESCRIPTIONS.supplierPaymentApplied, sourceType: "SUPPLIER_PAYMENT", sourceId: input.supplierPaymentId, lines: [{ accountId: ACCOUNT_IDS.payables, debitCents: amount }, { accountId: ACCOUNT_IDS.cash, creditCents: amount }] });
}

export async function reverseSourceEntries(input: { tx: PrismaTransactionClient; organizationId: string; sourceType: LedgerSourceType; sourceId: string; entryDate: Date }) {
  const originals = await input.tx.ledgerEntry.findMany({
    where: { organizationId: input.organizationId, sourceType: input.sourceType, sourceId: input.sourceId, reversalOfId: null, reversal: null },
    include: { lines: true },
  });
  for (const original of originals) {
    await createEntry(input.tx, {
      organizationId: input.organizationId,
      entryDate: input.entryDate,
      description: `Ters kayıt: ${original.description}`,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reversalOfId: original.id,
      currency: original.lines[0]?.currency ?? "TRY",
      lines: original.lines.map((line) => ({ accountId: line.accountId, debitCents: line.creditCents, creditCents: line.debitCents })),
    });
  }
}

/**
 * Ledger projection replay-safe'tir: (organizationId, sourceType, sourceId,
 * description) unique constraint'i P2002 ile çakışırsa (örn. üst katmandaki
 * Settlement idempotency replay bir şekilde bu fonksiyona ikinci kez
 * ulaşırsa, ya da bir handler retry'ı transaction dışı bir noktada tekrar
 * dener), yeni bir satır üretmeye çalışıp patlamak yerine zaten var olan
 * kaydı bulup onu döndürür — projection idempotent kalır.
 */
async function createEntry(tx: PrismaTransactionClient, input: { organizationId: string; entryDate: Date; description: string; sourceType: LedgerSourceType; sourceId: string; reversalOfId?: string; currency: string; lines: readonly Line[] }) {
  assertBalancedLines(input.lines);
  try {
    return await tx.ledgerEntry.create({
      data: {
        organizationId: input.organizationId,
        entryDate: input.entryDate,
        description: input.description,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        reversalOfId: input.reversalOfId,
        lines: { create: input.lines.map((line) => ({ accountId: line.accountId, debitCents: line.debitCents ?? ZERO, creditCents: line.creditCents ?? ZERO, currency: input.currency })) },
      },
      include: { lines: true },
    });
  } catch (error) {
    if (isIdempotencyKeyCollision(error)) {
      const existing = await tx.ledgerEntry.findFirst({
        where: { organizationId: input.organizationId, sourceType: input.sourceType, sourceId: input.sourceId, description: input.description },
        include: { lines: true },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

function assertBalancedLines(lines: readonly Line[]) {
  if (lines.length < 2) throw new Error("LEDGER_ENTRY_REQUIRES_TWO_LINES");
  const debit = lines.reduce((sum, line) => sum + (line.debitCents ?? ZERO), ZERO);
  const credit = lines.reduce((sum, line) => sum + (line.creditCents ?? ZERO), ZERO);
  assertBalancedAmounts(debit, credit, "Ledger entry");
  if (lines.some((line) => (line.debitCents ?? ZERO) <= ZERO && (line.creditCents ?? ZERO) <= ZERO)) throw new Error("LEDGER_LINE_AMOUNT_MUST_BE_POSITIVE");
}

function assertBalancedAmounts(debit: bigint, credit: bigint, label: string) {
  if (debit !== credit) throw new Error(`${label} ledger entry is not balanced.`);
}

export function toCents(value: Money): bigint {
  const normalized = typeof value === "object" && value !== null && "toFixed" in value ? value.toFixed(2) : Number(value).toFixed(2);
  if (!/^-?\d+\.\d{2}$/u.test(normalized)) throw new Error("Invalid monetary value.");
  const negative = normalized.startsWith("-");
  const digits = normalized.replace("-", "").replace(".", "");
  return BigInt(`${negative ? "-" : ""}${digits}`);
}
