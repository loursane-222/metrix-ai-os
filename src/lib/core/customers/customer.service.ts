import { prisma } from "@/lib/core/shared/prisma";
import { ApiValidationError } from "@/lib/api/validation";
import {
  getPrimaryContactForCustomer,
  getPrimaryContactsByCustomerId,
  upsertPrimaryContactForCustomer,
} from "@/lib/core/customer-contacts/customer-contact.service";

import {
  archiveCustomer,
  createCustomer,
  findCustomerByIdentity,
  getCustomerById,
  listCustomersForOrganization,
  updateCustomer,
} from "./customer.repository";

import type {
  CreateCustomerInput,
  CustomerResult,
  CustomerWithPrimaryContact,
  ListCustomersInput,
  UpdateCustomerInput,
} from "./customer.types";

export async function createNewCustomer(input: CreateCustomerInput): Promise<CustomerWithPrimaryContact> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.displayName, "displayName");
  if (input.healthScore !== undefined) assertHealthScore(input.healthScore);

  const duplicate = await findCustomerByIdentity(
    input.organizationId,
    input.displayName,
    input.phone,
    input.email,
    undefined,
    { cariKodu: input.cariKodu, taxNumber: input.taxNumber },
  );
  if (duplicate) {
    throw new ApiValidationError(
      `A customer with this identity already exists: ${duplicate.displayName}.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const customer = await createCustomer(input, tx);

    const primaryContact = await upsertPrimaryContactForCustomer(
      {
        organizationId: input.organizationId,
        customerId: customer.id,
        fullName: input.primaryContact?.fullName,
        title: input.primaryContact?.title,
        phone: input.primaryContact?.phone,
        email: input.primaryContact?.email,
      },
      tx,
    );

    return { ...customer, primaryContact };
  });
}

export async function getCustomerByIdForOrganization(
  id: string,
  organizationId: string,
): Promise<CustomerWithPrimaryContact | null> {
  assertNonEmpty(id, "id");
  assertNonEmpty(organizationId, "organizationId");

  const customer = await getCustomerById(id, organizationId);
  if (!customer) return null;

  const primaryContact = await getPrimaryContactForCustomer(organizationId, id);
  return { ...customer, primaryContact };
}

export async function listCustomers(input: ListCustomersInput): Promise<CustomerWithPrimaryContact[]> {
  assertNonEmpty(input.organizationId, "organizationId");

  const customers = await listCustomersForOrganization(input);
  const contactsByCustomerId = await getPrimaryContactsByCustomerId(
    input.organizationId,
    customers.map((customer) => customer.id),
  );

  return customers.map((customer) => ({
    ...customer,
    primaryContact: contactsByCustomerId.get(customer.id) ?? null,
  }));
}

export async function updateCustomerDetails(input: UpdateCustomerInput): Promise<CustomerWithPrimaryContact> {
  assertNonEmpty(input.id, "id");
  assertNonEmpty(input.organizationId, "organizationId");
  if (input.healthScore !== undefined) assertHealthScore(input.healthScore);

  return prisma.$transaction(async (tx) => {
    await updateCustomer(input, tx);

    let primaryContact = await getPrimaryContactForCustomer(input.organizationId, input.id);
    if (input.primaryContact) {
      primaryContact = await upsertPrimaryContactForCustomer(
        {
          organizationId: input.organizationId,
          customerId: input.id,
          fullName: input.primaryContact.fullName,
          title: input.primaryContact.title,
          phone: input.primaryContact.phone,
          email: input.primaryContact.email,
        },
        tx,
      );
    }

    const updated = await getCustomerById(input.id, input.organizationId, tx);
    if (!updated) {
      throw new ApiValidationError("Customer not found.");
    }

    return { ...updated, primaryContact };
  });
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

export type { CustomerResult };
