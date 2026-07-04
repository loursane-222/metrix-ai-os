import {
  archiveProductService,
  createProductService,
  getProductServiceById,
  listProductServicesForOrganization,
  updateProductService,
} from "./product.repository";

import type {
  CreateProductServiceInput,
  ListProductServicesInput,
  ProductServiceResult,
  UpdateProductServiceInput,
} from "./product.types";

export async function createNewProductService(input: CreateProductServiceInput): Promise<ProductServiceResult> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.name, "name");

  return createProductService(input);
}

export async function getProductServiceByIdForOrganization(
  id: string,
  organizationId: string,
): Promise<ProductServiceResult | null> {
  assertNonEmpty(id, "id");
  assertNonEmpty(organizationId, "organizationId");

  return getProductServiceById(id, organizationId);
}

export async function listProductServices(input: ListProductServicesInput): Promise<ProductServiceResult[]> {
  assertNonEmpty(input.organizationId, "organizationId");

  return listProductServicesForOrganization(input);
}

export async function updateProductServiceDetails(input: UpdateProductServiceInput): Promise<void> {
  assertNonEmpty(input.id, "id");
  assertNonEmpty(input.organizationId, "organizationId");

  return updateProductService(input);
}

export async function archiveProductServiceById(id: string, organizationId: string): Promise<void> {
  assertNonEmpty(id, "id");
  assertNonEmpty(organizationId, "organizationId");

  return archiveProductService(id, organizationId);
}

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
}
