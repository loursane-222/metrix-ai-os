import type { FinancialInstrument, InstrumentAllocation, InstrumentDirection, InstrumentStatus, InstrumentType, PaymentMethod } from "@prisma/client";

export type { InstrumentType, InstrumentDirection, InstrumentStatus };

export type RegisterInstrumentInput = {
  organizationId: string;
  instrumentType: InstrumentType;
  direction: InstrumentDirection;
  customerId?: string;
  supplierId?: string;
  amount: number;
  currency?: string;
  issueDate?: Date;
  maturityDate: Date;
  instrumentNumber?: string;
  bankName?: string;
  branchName?: string;
  drawerName?: string;
  notes?: string;
  actorId: string;
};

export type ApplyInstrumentToObligationInput = {
  organizationId: string;
  instrumentId: string;
  obligationScheduleLineId: string;
  amount: number;
  actorId: string;
};

export type ApplyInstrumentToObligationOutcome = {
  instrument: FinancialInstrument;
  allocation: InstrumentAllocation;
};

export type ClearInstrumentInput = {
  organizationId: string;
  instrumentId: string;
  paymentMethod: PaymentMethod;
  financialAccountReference: string;
  occurredAt?: Date;
  actorId: string;
};

export type ClearedAllocationResult = {
  allocationId: string;
  obligationScheduleLineId: string;
  settledReferenceType: "SETTLEMENT" | "SUPPLIER_PAYMENT" | "EXPENSE_SETTLEMENT";
  settledReferenceId: string;
  movementId: string;
};

export type ClearInstrumentOutcome = {
  instrument: FinancialInstrument;
  clearedAllocations: ClearedAllocationResult[];
};

export type BounceInstrumentInput = {
  organizationId: string;
  instrumentId: string;
  reason: string;
  actorId: string;
};

export type CancelInstrumentInput = {
  organizationId: string;
  instrumentId: string;
  reason: string;
  actorId: string;
};
