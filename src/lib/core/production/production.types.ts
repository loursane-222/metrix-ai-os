import type { MachineStatus, ProductionOrderStatus, WorkCenterStatus } from "@prisma/client";

export type ProductionOrderCustomFieldValueInput = { definitionId: string; value: unknown };

export type CreateProductionOrderInput = {
  organizationId: string;
  orderNumber: string;
  sourceOrderId?: string;
  productServiceId?: string;
  workCenterId?: string;
  quantityPlanned: number;
  plannedStartAt?: string;
  plannedEndAt?: string;
  notes?: string;
  customFields?: ProductionOrderCustomFieldValueInput[];
};

export type UpdateProductionOrderInput = Omit<CreateProductionOrderInput, "orderNumber" | "quantityPlanned"> & {
  id: string;
  orderNumber?: string;
  status?: ProductionOrderStatus;
  quantityPlanned?: number;
  quantityProduced?: number;
  actualStartAt?: string;
  actualEndAt?: string;
  statusChangeReason?: string;
};

export type ListProductionOrdersInput = { organizationId: string; status?: ProductionOrderStatus; limit?: number };

export type CreateWorkCenterInput = { organizationId: string; name: string; code: string; notes?: string };
export type UpdateWorkCenterInput = { id: string; organizationId: string; name?: string; code?: string; status?: WorkCenterStatus; notes?: string };
export type ListWorkCentersInput = { organizationId: string; status?: WorkCenterStatus; limit?: number };

export type CreateMachineInput = { organizationId: string; workCenterId: string; name: string; code: string; notes?: string };
export type UpdateMachineInput = { id: string; organizationId: string; workCenterId?: string; name?: string; code?: string; status?: MachineStatus; notes?: string };
export type ListMachinesInput = { organizationId: string; workCenterId?: string; status?: MachineStatus; limit?: number };
