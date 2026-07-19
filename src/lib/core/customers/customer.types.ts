import type { Customer, CustomerStatus } from "@prisma/client";

import type { CustomerContactResult } from "@/lib/core/customer-contacts/customer-contact.types";

export type CustomerResult = Customer;

export type CustomerWithPrimaryContact = CustomerResult & {
  primaryContact: CustomerContactResult | null;
};

// Şekli belgeleyen referans tip. Prisma Json alanı olarak saklandığı için
// giriş/çıkış sınırında Record<string, unknown> olarak taşınır.
export type CustomerAddress = {
  line1?: string;
  line2?: string;
  district?: string;
  city?: string;
  postalCode?: string;
  country?: string;
};

export type CustomerAddressInput = Record<string, unknown>;

export type PrimaryContactInput = {
  fullName?: string;
  title?: string;
  phone?: string;
  email?: string;
};
export type CustomerCommercialTermsInput = { paymentTermDays?: number; creditLimitCents?: bigint; defaultCurrency?: string; discountRateBasisPoints?: number; deliveryTerm?: string; notes?: string };
export type CustomerCustomFieldValueInput = { definitionId: string; value: unknown };

export type CreateCustomerInput = {
  organizationId: string;
  displayName: string;
  legalName?: string;
  phone?: string;
  email?: string;
  balanceCents?: bigint;
  currency?: string;
  tier?: string;
  healthScore?: number;
  metrixNote?: string;
  cariKodu?: string;
  taxNumber?: string;
  taxOffice?: string;
  mersisNo?: string;
  tradeRegistryNo?: string;
  billingAddress?: CustomerAddressInput;
  shippingAddress?: CustomerAddressInput;
  eInvoiceEnabled?: boolean;
  eArchiveEnabled?: boolean;
  createdByUserId?: string;
  primaryContact?: PrimaryContactInput;
  commercialTerms?: CustomerCommercialTermsInput;
  customFields?: CustomerCustomFieldValueInput[];
};

export type UpdateCustomerInput = {
  id: string;
  organizationId: string;
  displayName?: string;
  legalName?: string;
  phone?: string;
  email?: string;
  balanceCents?: bigint;
  currency?: string;
  tier?: string;
  healthScore?: number;
  metrixNote?: string;
  status?: CustomerStatus;
  cariKodu?: string;
  taxNumber?: string;
  taxOffice?: string;
  mersisNo?: string;
  tradeRegistryNo?: string;
  billingAddress?: CustomerAddressInput;
  shippingAddress?: CustomerAddressInput;
  eInvoiceEnabled?: boolean;
  eArchiveEnabled?: boolean;
  updatedByUserId?: string;
  primaryContact?: PrimaryContactInput;
  commercialTerms?: CustomerCommercialTermsInput;
  customFields?: CustomerCustomFieldValueInput[];
};

export type ListCustomersInput = {
  organizationId: string;
  status?: CustomerStatus;
  limit?: number;
};
