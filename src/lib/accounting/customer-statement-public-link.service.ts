import { ApiValidationError } from "@/lib/api/validation";
import { generateSecureToken, hashSecret } from "@/lib/auth/shared/crypto";
import { prisma } from "@/lib/core/shared/prisma";
import { getCustomerStatement, type CustomerStatement } from "./customer-statement.service";

// Same secure-token pattern as offer-public-link.service.ts, but the token
// lives on Customer (not on a single document) and the statement itself is
// never persisted — getPublicStatementByToken recomputes it live from
// getCustomerStatement() on every visit, so the link always shows the
// CURRENT balance, never a stale snapshot.
export async function ensurePublicStatementToken(customerId: string, organizationId: string): Promise<string> {
  if (!customerId.trim() || !organizationId.trim()) throw new ApiValidationError("customerId and organizationId are required.");
  const token = generateSecureToken();
  const updated = await prisma.customer.updateMany({
    where: { id: customerId, organizationId },
    data: { publicStatementTokenHash: hashSecret(token), publicStatementTokenCreatedAt: new Date() },
  });
  if (!updated.count) throw new ApiValidationError("Customer not found.", 404);
  return token;
}

export type PublicCustomerStatement = Readonly<{
  organizationName: string;
  customerName: string;
  customerPhone: string | null;
  statement: CustomerStatement;
  generatedAt: string;
}>;

export async function getPublicStatementByToken(token: string): Promise<PublicCustomerStatement | null> {
  if (!token.trim()) return null;
  const customer = await prisma.customer.findFirst({
    where: { publicStatementTokenHash: hashSecret(token) },
    select: { id: true, organizationId: true, displayName: true, phone: true, organization: { select: { name: true } } },
  });
  if (!customer) return null;
  const statement = await getCustomerStatement(customer.organizationId, customer.id);
  if (!statement) return null;
  return {
    organizationName: customer.organization.name,
    customerName: customer.displayName,
    customerPhone: customer.phone,
    statement,
    generatedAt: new Date().toISOString(),
  };
}
