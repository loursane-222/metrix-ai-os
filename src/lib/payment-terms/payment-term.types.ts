export const PAYMENT_TERM_SCHEMA_VERSION = 1 as const;

export type PaymentTermAllocation =
  | { allocationType: "PERCENTAGE"; percentageBasisPoints: number }
  | { allocationType: "FIXED_AMOUNT"; amountCents: string; currency: string }
  | { allocationType: "REMAINDER" };

export type PaymentTermMaturity =
  | { maturityBasis: "IMMEDIATE" }
  | {
      maturityBasis: "DAYS_AFTER_REFERENCE";
      days: number;
      referenceDateType: "QUOTE_DATE" | "ORDER_DATE" | "INVOICE_DATE" | "DELIVERY_DATE";
    }
  | { maturityBasis: "FIXED_DATE"; dueDate: string };

export type PaymentTermComponent = PaymentTermAllocation & PaymentTermMaturity;

export type StructuredPaymentTerm = {
  schemaVersion: typeof PAYMENT_TERM_SCHEMA_VERSION;
  strategy: "SCHEDULE";
  description?: string;
  components: PaymentTermComponent[];
};

export type MaterializedMaturity = {
  componentIndex: number;
  amountCents: string;
  dueDate: string;
};
