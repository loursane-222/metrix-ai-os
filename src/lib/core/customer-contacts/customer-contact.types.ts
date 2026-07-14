import type { CustomerContact, CustomerContactSource } from "@prisma/client";

export type CustomerContactResult = CustomerContact;

export type UpsertPrimaryContactInput = {
  organizationId: string;
  customerId: string;
  fullName?: string;
  title?: string;
  phone?: string;
  email?: string;
  personId?: string;
  source?: CustomerContactSource;
};

export function hasContactContent(
  input: Pick<UpsertPrimaryContactInput, "fullName" | "title" | "phone" | "email" | "personId">,
): boolean {
  return Boolean(input.fullName || input.title || input.phone || input.email || input.personId);
}
