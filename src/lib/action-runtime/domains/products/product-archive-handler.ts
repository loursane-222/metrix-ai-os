import { archiveProductServiceById, getProductServiceByIdForOrganization } from "@/lib/core/products/product.service";
import type { ActionHandler } from "../../execution";

export const productArchiveHandler: ActionHandler = async (envelope) => {
  const productServiceId = envelope.input.productServiceId;
  if (typeof productServiceId !== "string" || !productServiceId.trim()) throw new Error("productServiceId is required.");
  const organizationId = envelope.executionContext.organizationId;
  const existing = await getProductServiceByIdForOrganization(productServiceId, organizationId);
  if (!existing) throw new Error("Product not found.");
  if (existing.status === "ARCHIVED") {
    return { status: "SUCCESS", entityRef: { entityType: "product", entityId: productServiceId }, resultOutcome: "NO_CHANGE", metadata: { productServiceId }, domainEvents: [], sideEffects: [] };
  }
  await archiveProductServiceById(productServiceId, organizationId);
  return {
    status: "SUCCESS", entityRef: { entityType: "product", entityId: productServiceId },
    resultSummary: "product.archive completed.", metadata: { productServiceId },
    domainEvents: [], sideEffects: [],
  };
};
