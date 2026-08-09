import { prisma } from "@/lib/core/shared/prisma";
import { evaluateKnowledgeSignal, type KnowledgeProjection } from "@/lib/executive-knowledge-authority";

export async function buildCustomerAuthorityProjections(organizationId: string): Promise<KnowledgeProjection[]> {
  const customers = await prisma.customer.findMany({ where: { organizationId, metrixNote: { not: null } }, select: { id: true, displayName: true, metrixNote: true } });
  return customers.flatMap((customer) => {
    if (!customer.metrixNote?.trim()) return [];
    return evaluateKnowledgeSignal({ producer: "USER_STATEMENT", key: `customer_note:${customer.id}`, value: `${customer.displayName}: ${customer.metrixNote}`, epistemicType: "FACT", verified: false, userConfirmed: true, durable: true, metadata: { sourceRef: `Customer:${customer.id}` } }).projections.filter((projection) => projection.target === "COMPANY_MODEL");
  });
}
