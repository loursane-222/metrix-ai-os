import {
  createPrimaryContact,
  findPrimaryContact,
  findPrimaryContactsForCustomers,
  updateContact,
} from "./customer-contact.repository";

import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import { hasContactContent } from "./customer-contact.types";
import type { CustomerContactResult, UpsertPrimaryContactInput } from "./customer-contact.types";

/**
 * Madde 3 (Musteriler Anayasasi): ilk kayit icin tek bir baslangic iletisim
 * kisisi yeterlidir, rol zorunlu degildir. Bos girdi verilirse hicbir contact
 * olusturulmaz — kullanici formu doldurmaya zorlanmaz.
 */
export async function upsertPrimaryContactForCustomer(
  input: UpsertPrimaryContactInput,
  tx?: PrismaTransactionClient,
): Promise<CustomerContactResult | null> {
  if (!hasContactContent(input)) return null;

  const existing = await findPrimaryContact(input.organizationId, input.customerId, tx);

  if (existing) {
    await updateContact(existing.id, input.organizationId, input, tx);
    return findPrimaryContact(input.organizationId, input.customerId, tx);
  }

  return createPrimaryContact(input, tx);
}

export async function getPrimaryContactForCustomer(
  organizationId: string,
  customerId: string,
): Promise<CustomerContactResult | null> {
  return findPrimaryContact(organizationId, customerId);
}

export async function getPrimaryContactsByCustomerId(
  organizationId: string,
  customerIds: string[],
): Promise<Map<string, CustomerContactResult>> {
  if (customerIds.length === 0) return new Map();

  const contacts = await findPrimaryContactsForCustomers(organizationId, customerIds);
  return new Map(contacts.map((contact) => [contact.customerId, contact]));
}
