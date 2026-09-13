import { db } from "../db";

export type CreateCustomerInput = {
  organizationId: string;
  name: string;
  email?: string;
  externalId?: string;
};

function requireOrganizationId(
  organizationId: string
): string {
  const value = organizationId.trim();

  if (!value) {
    throw new Error("organizationId is required");
  }

  return value;
}

export async function createCustomerForOrganization(
  input: CreateCustomerInput
) {
  const organizationId =
    requireOrganizationId(input.organizationId);

  return db.customer.create({
    data: {
      organizationId,
      name: input.name,
      email: input.email,
      externalId: input.externalId
    }
  });
}

export async function listCustomersForOrganization(
  organizationIdInput: string
) {
  const organizationId =
    requireOrganizationId(organizationIdInput);

  return db.customer.findMany({
    where: {
      organizationId
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}
