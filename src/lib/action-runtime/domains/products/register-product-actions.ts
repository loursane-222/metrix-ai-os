import { createNewProductService, listProductServices } from "@/lib/core/products/product.service";
import type { ProductServiceType } from "@prisma/client";
import type { ActionExecutionEnvelope, ActionHandlerRegistry, HandlerResult } from "../../execution";

export function registerProductActions(registry: ActionHandlerRegistry): void {
  registry.registerHandler("product.create", handleProductCreate);
}

async function handleProductCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const name = requiredString(envelope.input.name, "name");
  const candidateId = requiredString(envelope.input.candidateId, "candidateId");
  const type = envelope.input.type === "SERVICE" ? "SERVICE" : "PRODUCT";
  const existing = (await listProductServices({
    organizationId: envelope.executionContext.organizationId,
    limit: 100,
  })).find((product) => normalize(product.name) === normalize(name) && product.status !== "ARCHIVED");
  const product = existing ?? await createNewProductService({
    organizationId: envelope.executionContext.organizationId,
    name,
    type: type as ProductServiceType,
    category: optionalString(envelope.input.category),
    unit: optionalString(envelope.input.unit),
    currency: optionalString(envelope.input.currency),
    attributesJson: { businessCandidateId: candidateId },
  });
  return {
    status: "SUCCESS",
    entityRef: { entityType: "product", entityId: product.id },
    resultSummary: existing ? "Canonical product already existed." : "Canonical product created.",
    metadata: { candidateId, duplicate: Boolean(existing) },
    domainEvents: [],
    sideEffects: [],
    resultOutcome: existing ? "NO_CHANGE" : undefined,
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
