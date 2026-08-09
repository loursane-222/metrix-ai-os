import type { SupplierStatus } from "@prisma/client";
export type SupplierContactInput = { fullName?: string; title?: string; phone?: string; email?: string };
export type SupplierCustomFieldValueInput = { definitionId: string; value: unknown };
export type CreateSupplierInput = { organizationId: string; displayName: string; legalName?: string; phone?: string; email?: string; website?: string; taxNumber?: string; taxOffice?: string; currency?: string; address?: Record<string, unknown>; metrixNote?: string; riskNotes?: string; primaryContact?: SupplierContactInput; customFields?: SupplierCustomFieldValueInput[] };
export type UpdateSupplierInput = Omit<CreateSupplierInput, "displayName"> & { id: string; displayName?: string; status?: SupplierStatus };
export type ListSuppliersInput = { organizationId: string; status?: SupplierStatus; limit?: number };
