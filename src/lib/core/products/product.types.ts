import type { Prisma, ProductService, ProductServiceStatus, ProductServiceType } from "@prisma/client";

export type ProductServiceResult = ProductService;

export type CreateProductServiceInput = {
  organizationId: string;
  name: string;
  type: ProductServiceType;
  category?: string;
  unit?: string;
  costCents?: bigint;
  priceCents?: bigint;
  currency?: string;
  stockBehavior?: string;
  attributesJson?: Prisma.InputJsonValue;
};

export type UpdateProductServiceInput = {
  id: string;
  organizationId: string;
  name?: string;
  type?: ProductServiceType;
  category?: string;
  unit?: string;
  costCents?: bigint;
  priceCents?: bigint;
  currency?: string;
  stockBehavior?: string;
  attributesJson?: Prisma.InputJsonValue;
  status?: ProductServiceStatus;
};

export type ListProductServicesInput = {
  organizationId: string;
  type?: ProductServiceType;
  status?: ProductServiceStatus;
  limit?: number;
};
