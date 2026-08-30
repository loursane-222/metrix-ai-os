import { FinancialAccountStatus, FinancialAccountType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/shared/prisma";
import {
  FinancialAccountDuplicateError,
  FinancialAccountValidationError,
  normalizeAccountName,
  normalizeCurrency,
  normalizeIban,
  type FinancialAccountCreateInput,
  type FinancialAccountUpdateInput,
} from "./financial-account.contract";

export function listFinancialAccounts(organizationId: string, options?: { includeInactive?: boolean }) {
  requireText(organizationId, "organizationId");
  return prisma.financialAccount.findMany({
    where: { organizationId, ...(options?.includeInactive ? {} : { status: FinancialAccountStatus.ACTIVE }) },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}

export function getFinancialAccount(organizationId: string, id: string) {
  requireText(organizationId, "organizationId");
  requireText(id, "id");
  return prisma.financialAccount.findFirst({ where: { id, organizationId } });
}

export async function createFinancialAccount(organizationId: string, input: FinancialAccountCreateInput) {
  requireText(organizationId, "organizationId");
  const normalized = normalizeCreateInput(input);
  await assertNoDuplicate(organizationId, normalized);
  try {
    return await prisma.financialAccount.create({ data: { organizationId, ...normalized } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new FinancialAccountDuplicateError("A financial account with this identifier already exists.");
    throw error;
  }
}

export async function updateFinancialAccount(organizationId: string, id: string, input: FinancialAccountUpdateInput) {
  const existing = await getFinancialAccount(organizationId, id);
  if (!existing) throw new FinancialAccountValidationError("financial account not found.");
  const data = normalizeUpdateInput(input, existing.type);
  const candidate = { ...existing, ...data };
  await assertNoDuplicate(organizationId, candidate, id);
  try {
    return await prisma.financialAccount.update({ where: { id, organizationId }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new FinancialAccountDuplicateError("A financial account with this identifier already exists.");
    throw error;
  }
}

export async function deactivateFinancialAccount(organizationId: string, id: string) {
  const existing = await getFinancialAccount(organizationId, id);
  if (!existing) throw new FinancialAccountValidationError("financial account not found.");
  if (existing.status === FinancialAccountStatus.INACTIVE) return existing;
  return prisma.financialAccount.update({ where: { id, organizationId }, data: { status: FinancialAccountStatus.INACTIVE } });
}

function normalizeCreateInput(input: FinancialAccountCreateInput) {
  const name = requireText(input.name, "name");
  if (!Object.values(FinancialAccountType).includes(input.type)) throw new FinancialAccountValidationError("type must be CASH or BANK.");
  const bankName = optionalText(input.bankName);
  const branchName = optionalText(input.branchName);
  const iban = normalizeIban(input.iban);
  const accountNumber = optionalText(input.accountNumber);
  assertMetadataBoundary(input.type, { bankName, branchName, iban, accountNumber });
  return { type: input.type, name, normalizedName: normalizeAccountName(name), currency: normalizeCurrency(input.currency), bankName, branchName, iban, accountNumber };
}

function normalizeUpdateInput(input: FinancialAccountUpdateInput, type: FinancialAccountType) {
  const data: { name?: string; normalizedName?: string; bankName?: string | null; branchName?: string | null; iban?: string | null; accountNumber?: string | null } = {};
  if (input.name !== undefined) { data.name = requireText(input.name, "name"); data.normalizedName = normalizeAccountName(data.name); }
  if (input.bankName !== undefined) data.bankName = optionalText(input.bankName);
  if (input.branchName !== undefined) data.branchName = optionalText(input.branchName);
  if (input.iban !== undefined) data.iban = normalizeIban(input.iban);
  if (input.accountNumber !== undefined) data.accountNumber = optionalText(input.accountNumber);
  assertMetadataBoundary(type, data);
  if (!Object.keys(data).length) throw new FinancialAccountValidationError("at least one mutable field is required.");
  return data;
}

function assertMetadataBoundary(type: FinancialAccountType, metadata: { bankName?: string | null; branchName?: string | null; iban?: string | null; accountNumber?: string | null }): void {
  if (type === FinancialAccountType.CASH && Object.values(metadata).some(Boolean)) throw new FinancialAccountValidationError("CASH accounts cannot carry bank metadata.");
}

async function assertNoDuplicate(organizationId: string, candidate: { type: FinancialAccountType; normalizedName: string; currency: string; iban?: string | null; bankName?: string | null; accountNumber?: string | null }, excludeId?: string): Promise<void> {
  const evidence: Prisma.FinancialAccountWhereInput[] = [{ type: candidate.type, normalizedName: candidate.normalizedName, currency: candidate.currency }];
  if (candidate.iban) evidence.push({ iban: candidate.iban });
  if (candidate.type === FinancialAccountType.BANK && candidate.accountNumber && candidate.bankName) evidence.push({ accountNumber: candidate.accountNumber, bankName: { equals: candidate.bankName, mode: "insensitive" } });
  const duplicate = await prisma.financialAccount.findFirst({ where: { organizationId, ...(excludeId ? { id: { not: excludeId } } : {}), OR: evidence }, select: { id: true } });
  if (duplicate) throw new FinancialAccountDuplicateError("A possible duplicate financial account already exists; explicit resolution is required.");
}

function requireText(value: string, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new FinancialAccountValidationError(`${field} is required.`);
  return value.trim();
}
function optionalText(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
