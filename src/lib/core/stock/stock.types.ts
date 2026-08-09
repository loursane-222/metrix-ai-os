import type { StockStatus, MovementType, MovementSourceType, Prisma } from "@prisma/client";

export type { StockStatus, MovementType, MovementSourceType };

export type CreateWarehouseInput = {
  organizationId: string;
  name: string;
  code: string;
  type?: string;
  address?: string;
  notes?: string;
};

export type ReceiveStockInput = {
  organizationId: string;
  productServiceId: string;
  warehouseId: string;
  quantity: number;
  location?: string;
  lot?: string;
  batch?: string;
  serialNumber?: string;
  performedById?: string;
  reason?: string;
  supplierId?: string;
  expectedAt?: Date;
  unitCostCents?: bigint;
  qualityFlag?: string;
};

export type TransferStockInput = {
  organizationId: string;
  productServiceId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  lot?: string;
  batch?: string;
  serialNumber?: string;
  performedById?: string;
  reason?: string;
};

export type ListStockInput = {
  organizationId: string;
  warehouseId?: string;
  productServiceId?: string;
  status?: StockStatus;
  limit?: number;
};

export type StockResult = Prisma.StockGetPayload<{
  include: {
    productService: true;
    warehouse: true;
    movements: { orderBy: { createdAt: "desc" }; take: 10 };
    customFieldValues: true;
  };
}>;

export type WarehouseResult = Prisma.WarehouseGetPayload<{
  include: { stocks: { include: { productService: true } } };
}>;
