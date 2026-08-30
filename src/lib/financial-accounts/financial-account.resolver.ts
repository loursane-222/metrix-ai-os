import { FinancialAccountStatus } from "@prisma/client";
import { normalizeAccountName, normalizeIban, type FinancialAccountIdentity } from "./financial-account.contract";

export type FinancialAccountResolution =
  | { kind: "RESOLVED"; account: FinancialAccountIdentity }
  | { kind: "AMBIGUOUS"; candidates: FinancialAccountIdentity[] }
  | { kind: "INACTIVE"; candidates: FinancialAccountIdentity[] }
  | { kind: "NOT_FOUND" };

export function resolveFinancialAccount(accounts: readonly FinancialAccountIdentity[], organizationId: string, reference: string): FinancialAccountResolution {
  const raw = reference.trim();
  if (!raw) return { kind: "NOT_FOUND" };
  const scopedAccounts = accounts.filter((account) => account.organizationId === organizationId);
  const byId = scopedAccounts.filter((account) => account.id === raw);
  if (byId.length === 1) return usable(byId);

  let iban: string | null = null;
  try { iban = normalizeIban(raw); } catch { /* ordinary account names are not IBANs */ }
  if (iban) {
    const byIban = scopedAccounts.filter((account) => account.iban === iban);
    if (byIban.length) return usable(byIban);
  }

  const needle = normalizeAccountName(raw);
  const exact = scopedAccounts.filter((account) => account.normalizedName === needle);
  if (exact.length) return usable(exact);
  const partial = scopedAccounts.filter((account) => account.normalizedName.includes(needle));
  return partial.length ? usable(partial) : { kind: "NOT_FOUND" };
}

function usable(matches: FinancialAccountIdentity[]): FinancialAccountResolution {
  const active = matches.filter((account) => account.status === FinancialAccountStatus.ACTIVE);
  if (active.length === 1) return { kind: "RESOLVED", account: active[0]! };
  if (active.length > 1) return { kind: "AMBIGUOUS", candidates: active };
  return { kind: "INACTIVE", candidates: matches };
}
