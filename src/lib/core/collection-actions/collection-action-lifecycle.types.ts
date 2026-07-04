import type { CollectionActionStatus } from "./collection-action.types";

export type LifecycleSignalType =
  | "STARTED_CONTACT"
  | "PROMISED_PAYMENT"
  | "PAYMENT_DATE_SET"
  | "PAYMENT_CONFIRMED"
  | "DISMISSED";

export type CollectionActionLifecycleSignal = {
  actionId: string;
  signalType: LifecycleSignalType;
  confidence: number;
  matchedCustomerName: string;
  currentStatus: CollectionActionStatus;
  proposedStatus: CollectionActionStatus | null;
  proposedNote: string | null;
  proposedExpectedDate: Date | null;
  proposedLastContactAt: Date | null;
};

export type LifecycleUpdateInput = {
  id: string;
  organizationId: string;
  status?: CollectionActionStatus;
  notes?: string;
  expectedPaymentDate?: Date;
  lastContactAt?: Date;
};

export type LifecycleApplyResult = {
  updated: number;
  skipped: number;
};
