import { describe, expect, it } from "vitest";
import { FinancialAccountStatus, FinancialAccountType, PaymentMethod } from "@prisma/client";
import {
  assertMethodAccountCompatibility,
  assertTransactionCurrencyMatchesAccount,
  normalizeIban,
  parsePaymentMethodText,
  type FinancialAccountIdentity,
} from "../financial-account.contract";
import { resolveFinancialAccount } from "../financial-account.resolver";

const accounts: FinancialAccountIdentity[] = [
  account("cash-main", "Merkez Kasa", FinancialAccountType.CASH, "TRY"),
  account("cash-branch", "Şube Kasa", FinancialAccountType.CASH, "TRY"),
  account("garanti-try", "Garanti TL", FinancialAccountType.BANK, "TRY", "TR330006100519786457841326"),
  account("garanti-eur", "Garanti EUR", FinancialAccountType.BANK, "EUR"),
  account("isbank-try", "İş Bankası TL", FinancialAccountType.BANK, "TRY"),
  { ...account("inactive", "Eski Kasa", FinancialAccountType.CASH, "TRY"), status: FinancialAccountStatus.INACTIVE },
  account("other-cash", "Merkez Kasa", FinancialAccountType.CASH, "TRY", undefined, "org-2"),
  account("other-bank", "Garanti Başka", FinancialAccountType.BANK, "TRY", "TR330006100519786457841326", "org-2"),
];

describe("structured payment method", () => {
  it.each([["nakit", PaymentMethod.CASH], ["havale", PaymentMethod.BANK_TRANSFER], ["EFT", PaymentMethod.BANK_TRANSFER], ["çek ile", PaymentMethod.CHEQUE], ["senet", PaymentMethod.PROMISSORY_NOTE]])("maps %s without creating settlement", (text, method) => expect(parsePaymentMethodText(text)).toBe(method));
  it("keeps maturity language separate", () => { expect(parsePaymentMethodText("peşin")).toBeNull(); expect(parsePaymentMethodText("30 gün nakit")).toBe(PaymentMethod.CASH); });
  it("enforces account type and active status", () => {
    expect(() => assertMethodAccountCompatibility(PaymentMethod.CASH, accounts[0]!)).not.toThrow();
    expect(() => assertMethodAccountCompatibility(PaymentMethod.BANK_TRANSFER, accounts[2]!)).not.toThrow();
    expect(() => assertMethodAccountCompatibility(PaymentMethod.CASH, accounts[2]!)).toThrow("CASH requires");
    expect(() => assertMethodAccountCompatibility(PaymentMethod.BANK_TRANSFER, accounts[0]!)).toThrow("BANK_TRANSFER requires");
    expect(() => assertMethodAccountCompatibility(PaymentMethod.CHEQUE, accounts[2]!)).toThrow("no direct financial-account settlement");
    expect(() => assertMethodAccountCompatibility(PaymentMethod.CREDIT_CARD, accounts[2]!)).toThrow("no direct financial-account settlement");
    expect(() => assertMethodAccountCompatibility(PaymentMethod.CASH, accounts[5]!)).toThrow("inactive");
  });
  it("fails closed on FX mismatch", () => { expect(() => assertTransactionCurrencyMatchesAccount("EUR", accounts[2]!)).toThrow("FX policy"); });
});

describe("financial account resolution", () => {
  it("resolves exact id, normalized name and valid IBAN", () => {
    expect(resolveFinancialAccount(accounts, "org-1", "cash-main")).toMatchObject({ kind: "RESOLVED", account: { id: "cash-main" } });
    expect(resolveFinancialAccount(accounts, "org-1", "merkez kasa")).toMatchObject({ kind: "RESOLVED", account: { id: "cash-main" } });
    expect(resolveFinancialAccount(accounts, "org-1", "TR33 0006 1005 1978 6457 8413 26")).toMatchObject({ kind: "RESOLVED", account: { id: "garanti-try" } });
    expect(normalizeIban("TR33 0006 1005 1978 6457 8413 26")).toBe("TR330006100519786457841326");
    expect(normalizeIban("tr330006100519786457841326")).toBe("TR330006100519786457841326");
    expect(normalizeIban("TR330006100519786457841326")).toBe("TR330006100519786457841326");
  });
  it("clarifies ambiguity, never creates, and rejects inactive use", () => {
    expect(resolveFinancialAccount(accounts, "org-1", "Garanti")).toMatchObject({ kind: "AMBIGUOUS", candidates: [{ id: "garanti-try" }, { id: "garanti-eur" }] });
    expect(resolveFinancialAccount(accounts, "org-1", "bilinmeyen banka")).toEqual({ kind: "NOT_FOUND" });
    expect(resolveFinancialAccount(accounts, "org-1", "Eski Kasa")).toMatchObject({ kind: "INACTIVE" });
  });
  it("isolates exact ID, IBAN, exact-name and partial-name paths by organization", () => {
    expect(resolveFinancialAccount(accounts, "org-2", "cash-main")).toEqual({ kind: "NOT_FOUND" });
    expect(resolveFinancialAccount(accounts, "org-2", "TR33 0006 1005 1978 6457 8413 26")).toMatchObject({ kind: "RESOLVED", account: { id: "other-bank", organizationId: "org-2" } });
    expect(resolveFinancialAccount(accounts, "org-2", "Merkez Kasa")).toMatchObject({ kind: "RESOLVED", account: { id: "other-cash", organizationId: "org-2" } });
    expect(resolveFinancialAccount(accounts, "org-2", "Garanti")).toMatchObject({ kind: "RESOLVED", account: { id: "other-bank", organizationId: "org-2" } });
  });
});

function account(id: string, name: string, type: FinancialAccountType, currency: string, iban?: string, organizationId = "org-1"): FinancialAccountIdentity {
  return { id, organizationId, type, name, normalizedName: name.toLocaleLowerCase("tr-TR"), currency, status: FinancialAccountStatus.ACTIVE, iban };
}
