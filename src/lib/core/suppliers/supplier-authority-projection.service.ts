import { prisma } from "@/lib/core/shared/prisma";
import { evaluateKnowledgeSignal, type KnowledgeProjection } from "@/lib/executive-knowledge-authority";

export async function buildSupplierAuthorityProjections(organizationId: string): Promise<KnowledgeProjection[]> {
  const suppliers = await prisma.supplier.findMany({ where: { organizationId, riskNotes: { not: null } }, select: { id: true, displayName: true, riskNotes: true } });
  return suppliers.flatMap((supplier) => {
    if (!supplier.riskNotes?.trim()) return [];
    return evaluateKnowledgeSignal({ producer: "USER_STATEMENT", key: `supplier_risk_note:${supplier.id}`, value: `${supplier.displayName}: ${supplier.riskNotes}`, epistemicType: "FACT", verified: false, userConfirmed: true, durable: true, metadata: { sourceRef: `Supplier:${supplier.id}` } }).projections.filter((projection) => projection.target === "COMPANY_MODEL");
  });
}
