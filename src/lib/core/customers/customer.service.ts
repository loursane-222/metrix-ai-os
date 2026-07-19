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

    if (input.commercialTerms) await tx.customerCommercialTerms.create({ data: { organizationId: input.organizationId, customerId: customer.id, ...input.commercialTerms } });
    if (input.customFields?.length) {
      const definitions = await tx.customFieldDefinition.findMany({ where: { organizationId: input.organizationId, module: "customers", entityType: "customer", active: true, id: { in: input.customFields.map((item) => item.definitionId) } } });
      if (definitions.length !== input.customFields.length) throw new ApiValidationError("Custom field definition is unavailable for this organization.");
      await Promise.all(input.customFields.map((item) => tx.customerCustomFieldValue.create({ data: { organizationId: input.organizationId, customerId: customer.id, definitionId: item.definitionId, valueJson: item.value as never } })));
    }

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
    if (input.commercialTerms) await tx.customerCommercialTerms.upsert({ where: { customerId: input.id }, create: { organizationId: input.organizationId, customerId: input.id, ...input.commercialTerms }, update: input.commercialTerms });
    if (input.customFields) {
      const definitions = await tx.customFieldDefinition.findMany({ where: { organizationId: input.organizationId, module: "customers", entityType: "customer", active: true, id: { in: input.customFields.map((item) => item.definitionId) } } });
      if (definitions.length !== input.customFields.length) throw new ApiValidationError("Custom field definition is unavailable for this organization.");
      await Promise.all(input.customFields.map((item) => tx.customerCustomFieldValue.upsert({ where: { customerId_definitionId: { customerId: input.id, definitionId: item.definitionId } }, create: { organizationId: input.organizationId, customerId: input.id, definitionId: item.definitionId, valueJson: item.value as never }, update: { valueJson: item.value as never } })));
    }

    const updated = await getCustomerById(input.id, input.organizationId, tx);
    if (!updated) {
      throw new ApiValidationError("Customer not found.");
    }

    return { ...updated, primaryContact };
  });
}

export type UpdateCustomerVersionGuardResult =
  | { outcome: "NOT_FOUND" }
  | { outcome: "VERSION_CONFLICT" }
  | { outcome: "NO_CHANGE"; customer: CustomerResult }
  | { outcome: "UPDATED"; customer: CustomerResult };

/**
 * Optimistic concurrency korumalı güncelleme. Customer modelinde ayrı bir
 * version alanı olmadığından expectedUpdatedAt, updatedAt üzerinden bir
 * sürüm işareti olarak kullanılır. Aynı transaction içinde önce mevcut
 * kaydın hâlâ beklenen sürümde olduğu doğrulanır, sonra güncelleme
 * updatedAt eşleşmesi koşuluyla uygulanır — iki adım arasındaki yarış
 * durumlarına karşı da korumalıdır. Patch içeriği mevcut değerlerle
 * birebir aynıysa hiçbir mutasyon yapılmadan NO_CHANGE döner.
 */
export async function updateCustomerWithVersionGuard(
  input: UpdateCustomerInput & { expectedUpdatedAt: Date },
): Promise<UpdateCustomerVersionGuardResult> {
  assertNonEmpty(input.id, "id");
  assertNonEmpty(input.organizationId, "organizationId");
  if (input.healthScore !== undefined) assertHealthScore(input.healthScore);

  return prisma.$transaction(async (tx) => {
    const existing = await getCustomerById(input.id, input.organizationId, tx);
    if (!existing) {
      return { outcome: "NOT_FOUND" };
    }

    if (existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      return { outcome: "VERSION_CONFLICT" };
    }

    if (isNoopCustomerPatch(existing, input)) {
      return { outcome: "NO_CHANGE", customer: existing };
    }

    const affectedCount = await updateCustomer(input, tx, input.expectedUpdatedAt);
    if (affectedCount === 0) {
      return { outcome: "VERSION_CONFLICT" };
    }
    if (input.primaryContact) await upsertPrimaryContactForCustomer({ organizationId: input.organizationId, customerId: input.id, ...input.primaryContact }, tx);
    if (input.commercialTerms) await tx.customerCommercialTerms.upsert({ where: { customerId: input.id }, create: { organizationId: input.organizationId, customerId: input.id, ...input.commercialTerms }, update: input.commercialTerms });
    if (input.customFields) {
      const definitions = await tx.customFieldDefinition.findMany({ where: { organizationId: input.organizationId, module: "customers", entityType: "customer", active: true, id: { in: input.customFields.map((item) => item.definitionId) } } });
      if (definitions.length !== input.customFields.length) throw new ApiValidationError("Custom field definition is unavailable for this organization.");
      await Promise.all(input.customFields.map((item) => tx.customerCustomFieldValue.upsert({ where: { customerId_definitionId: { customerId: input.id, definitionId: item.definitionId } }, create: { organizationId: input.organizationId, customerId: input.id, definitionId: item.definitionId, valueJson: item.value as never }, update: { valueJson: item.value as never } })));
    }

    const updated = await getCustomerById(input.id, input.organizationId, tx);
    if (!updated) {
      return { outcome: "NOT_FOUND" };
    }

    return { outcome: "UPDATED", customer: updated };
  });
}

function isNoopCustomerPatch(existing: CustomerResult, input: UpdateCustomerInput): boolean {
  if (input.primaryContact || input.commercialTerms || input.customFields) return false;
  const scalarFields = [
    "displayName",
    "legalName",
    "phone",
    "email",
    "tier",
    "healthScore",
    "metrixNote",
    "status",
    "cariKodu",
    "taxNumber",
    "taxOffice",
    "mersisNo",
    "tradeRegistryNo",
    "eInvoiceEnabled",
    "eArchiveEnabled",
    "currency",
  ] as const;

  for (const field of scalarFields) {
    const value = input[field];
    if (value !== undefined && value !== existing[field]) {
      return false;
    }
  }

  if (
    input.billingAddress !== undefined &&
    JSON.stringify(input.billingAddress) !== JSON.stringify(existing.billingAddress)
  ) {
    return false;
  }

  if (
    input.shippingAddress !== undefined &&
    JSON.stringify(input.shippingAddress) !== JSON.stringify(existing.shippingAddress)
  ) {
    return false;
  }

  return true;
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
