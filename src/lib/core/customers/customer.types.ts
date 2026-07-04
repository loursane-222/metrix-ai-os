import type { Customer, CustomerStatus } from "@prisma/client";

export type CustomerResult = Customer;

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
};

export type ListCustomersInput = {
  organizationId: string;
  status?: CustomerStatus;
  limit?: number;
};
