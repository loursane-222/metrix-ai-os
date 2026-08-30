import { FinancialAccountStatus, FinancialAccountType, PaymentMethod } from "@prisma/client";

export { FinancialAccountStatus, FinancialAccountType, PaymentMethod };

export const PAYMENT_METHODS = Object.freeze(Object.values(PaymentMethod));
export const FINANCIAL_ACCOUNT_TYPES = Object.freeze(Object.values(FinancialAccountType));

export type FinancialAccountCreateInput = Readonly<{
  type: FinancialAccountType;
  name: string;
  currency: string;
  bankName?: string;
  branchName?: string;
  iban?: string;
  accountNumber?: string;
}>;

export type FinancialAccountUpdateInput = Readonly<{
  name?: string;
  bankName?: string | null;
  branchName?: string | null;
  iban?: string | null;
  accountNumber?: string | null;
}>;

export type FinancialAccountIdentity = Readonly<{
  id: string;
  organizationId: string;
  type: FinancialAccountType;
  name: string;
  normalizedName: string;
  currency: string;
  status: FinancialAccountStatus;
  bankName?: string | null;
  iban?: string | null;
  accountNumber?: string | null;
}>;

export class FinancialAccountValidationError extends Error {}
export class FinancialAccountDuplicateError extends Error {}

export function normalizeAccountName(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/gu, " ");
}

export function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) throw new FinancialAccountValidationError("currency must be a three-letter ISO code.");
  return currency;
}

export function normalizeIban(value: string | null | undefined): string | null {
  if (value == null || !value.trim()) return null;
  const iban = value.replace(/\s+/gu, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/u.test(iban) || !hasValidIbanChecksum(iban)) {
    throw new FinancialAccountValidationError("iban is invalid.");
  }
  return iban;
}

function hasValidIbanChecksum(iban: string): boolean {
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearranged) {
    const digits = character >= "A" ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function parsePaymentMethodText(text: string): PaymentMethod | null {
  const value = normalizeAccountName(text);
  if (hasPhrase(value, "nakit") || hasPhrase(value, "cash")) return PaymentMethod.CASH;
  if (["havale", "eft", "banka transferi"].some((phrase) => hasPhrase(value, phrase))) return PaymentMethod.BANK_TRANSFER;
  if (["kredi kartı", "credit card"].some((phrase) => hasPhrase(value, phrase))) return PaymentMethod.CREDIT_CARD;
  if (["çek", "cheque"].some((phrase) => hasPhrase(value, phrase))) return PaymentMethod.CHEQUE;
  if (["senet", "promissory note"].some((phrase) => hasPhrase(value, phrase))) return PaymentMethod.PROMISSORY_NOTE;
  return null; // "peşin" is maturity evidence, never CASH evidence.
}

function hasPhrase(value: string, phrase: string): boolean {
  return ` ${value.replace(/[^\p{L}\p{N}]+/gu, " ")} `.includes(` ${phrase} `);
}

export function assertMethodAccountCompatibility(method: PaymentMethod, account: FinancialAccountIdentity): void {
  if (account.status !== FinancialAccountStatus.ACTIVE) throw new FinancialAccountValidationError("financial account is inactive.");
  if (method === PaymentMethod.CASH && account.type !== FinancialAccountType.CASH) throw new FinancialAccountValidationError("CASH requires a CASH account.");
  if (method === PaymentMethod.BANK_TRANSFER && account.type !== FinancialAccountType.BANK) throw new FinancialAccountValidationError("BANK_TRANSFER requires a BANK account.");
  if (new Set<PaymentMethod>([PaymentMethod.CREDIT_CARD, PaymentMethod.CHEQUE, PaymentMethod.PROMISSORY_NOTE, PaymentMethod.OTHER]).has(method)) {
    throw new FinancialAccountValidationError(`${method} has no direct financial-account settlement contract in Phase 2.`);
  }
}

export function assertTransactionCurrencyMatchesAccount(transactionCurrency: string, account: FinancialAccountIdentity): void {
  if (normalizeCurrency(transactionCurrency) !== account.currency) throw new FinancialAccountValidationError("transaction currency does not match financial account currency; FX policy is not available.");
}
