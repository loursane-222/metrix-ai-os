import { FinancialAccountType } from "@prisma/client";
import { createFinancialAccount, deactivateFinancialAccount, getFinancialAccount, updateFinancialAccount } from "@/lib/financial-accounts";
import type { ActionHandler } from "../../execution";

export const financialAccountCreateHandler: ActionHandler = async (envelope) => {
  const account = await createFinancialAccount(envelope.executionContext.organizationId, {
    type: requiredType(envelope.input.type), name: requiredString(envelope.input.name, "name"), currency: requiredString(envelope.input.currency, "currency"),
    bankName: optionalString(envelope.input.bankName), branchName: optionalString(envelope.input.branchName), iban: optionalString(envelope.input.iban), accountNumber: optionalString(envelope.input.accountNumber),
  });
  return success(account.id, "financial_account.create completed.");
};

export const financialAccountUpdateHandler: ActionHandler = async (envelope) => {
  const id = requiredString(envelope.input.financialAccountId, "financialAccountId");
  if (envelope.input.type !== undefined) throw new Error("financial account type is immutable.");
  if (envelope.input.currency !== undefined) throw new Error("financial account currency is immutable.");
  await updateFinancialAccount(envelope.executionContext.organizationId, id, {
    ...(envelope.input.name !== undefined ? { name: requiredString(envelope.input.name, "name") } : {}),
    ...(envelope.input.bankName !== undefined ? { bankName: nullableString(envelope.input.bankName, "bankName") } : {}),
    ...(envelope.input.branchName !== undefined ? { branchName: nullableString(envelope.input.branchName, "branchName") } : {}),
    ...(envelope.input.iban !== undefined ? { iban: nullableString(envelope.input.iban, "iban") } : {}),
    ...(envelope.input.accountNumber !== undefined ? { accountNumber: nullableString(envelope.input.accountNumber, "accountNumber") } : {}),
  });
  return success(id, "financial_account.update completed.");
};

export const financialAccountDeactivateHandler: ActionHandler = async (envelope) => {
  const id = requiredString(envelope.input.financialAccountId, "financialAccountId");
  const before = await getFinancialAccount(envelope.executionContext.organizationId, id);
  if (!before) throw new Error("financial account not found.");
  await deactivateFinancialAccount(envelope.executionContext.organizationId, id);
  return { ...success(id, "financial_account.deactivate completed."), ...(before.status === "INACTIVE" ? { resultOutcome: "NO_CHANGE" as const } : {}) };
};

function success(id: string, resultSummary: string) { return { status: "SUCCESS" as const, entityRef: { entityType: "financial_account", entityId: id }, resultSummary, metadata: { financialAccountId: id }, domainEvents: [], sideEffects: [] }; }
function requiredString(value: unknown, field: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`); return value.trim(); }
function optionalString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function nullableString(value: unknown, field: string): string | null { if (value === null) return null; if (typeof value !== "string") throw new Error(`${field} must be a string or null.`); return value.trim() || null; }
function requiredType(value: unknown): FinancialAccountType { if (value !== FinancialAccountType.CASH && value !== FinancialAccountType.BANK) throw new Error("type must be CASH or BANK."); return value; }
