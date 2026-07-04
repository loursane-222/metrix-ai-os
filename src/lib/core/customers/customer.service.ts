import {
  archiveCustomer,
  createCustomer,
  getCustomerById,
  listCustomersForOrganization,
  updateCustomer,
} from "./customer.repository";

import type { CreateCustomerInput, CustomerResult, ListCustomersInput, UpdateCustomerInput } from "./customer.types";

export async function createNewCustomer(input: CreateCustomerInput): Promise<CustomerResult> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.displayName, "displayName");
  if (input.healthScore !== undefined) assertHealthScore(input.healthScore);

  return createCustomer(input);
}

export async function getCustomerByIdForOrganization(
  id: string,
  organizationId: string,
): Promise<CustomerResult | null> {
  assertNonEmpty(id, "id");
  assertNonEmpty(organizationId, "organizationId");

  return getCustomerById(id, organizationId);
}

export async function listCustomers(input: ListCustomersInput): Promise<CustomerResult[]> {
  assertNonEmpty(input.organizationId, "organizationId");

  return listCustomersForOrganization(input);
}

export async function updateCustomerDetails(input: UpdateCustomerInput): Promise<void> {
  assertNonEmpty(input.id, "id");
  assertNonEmpty(input.organizationId, "organizationId");
  if (input.healthScore !== undefined) assertHealthScore(input.healthScore);

  return updateCustomer(input);
}

export async function archiveCustomerById(id: string, organizationId: string): Promise<void> {
  assertNonEmpty(id, "id");
  assertNonEmpty(organizationId, "organizationId");

  return archiveCustomer(id, organizationId);
}

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
}

function assertHealthScore(value: number): void {
  if (value < 0 || value > 100) {
    throw new Error("healthScore must be between 0 and 100.");
  }
}
