import { archiveProductServiceById, getProductServiceByIdForOrganization } from "@/lib/core/products/product.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
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
  await notifyWithOwnerFanout({ organizationId, actorUserId: envelope.executionContext.actorId, type: "product.archived", title: "Ürün/hizmet arşivlendi", body: existing.name, entityType: "ProductService", entityId: productServiceId });
  return {
    status: "SUCCESS", entityRef: { entityType: "product", entityId: productServiceId },
    resultSummary: "product.archive completed.", metadata: { productServiceId },
    domainEvents: [], sideEffects: [],
  };
};
