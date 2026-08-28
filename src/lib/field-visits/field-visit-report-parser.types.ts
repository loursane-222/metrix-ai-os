export type FieldVisitRequestTypeExtracted = "DISPLAY_REQUEST" | "SAMPLE_REQUEST" | "OTHER";

export type FieldVisitOrderIntent = Readonly<{
  productRef: string | null;
  quantity: number | null;
}>;

// amount is never null when this object is present — the parser collapses
// a payment intent with no stated amount to a null FieldVisitPaymentIntent
// entirely, since "a payment happened, for an unknown amount" isn't
// actionable and shouldn't be represented as a half-filled object.
export type FieldVisitPaymentIntent = Readonly<{
  amount: number;
  currency: string;
}>;

export type FieldVisitReportExtraction = Readonly<{
  customerNameRaw: string;
  contactNameRaw: string | null;
  startTime: string | null;
  endTime: string | null;
  notes: string;
  requestTypes: readonly FieldVisitRequestTypeExtracted[];
  orderIntent: FieldVisitOrderIntent | null;
  paymentIntent: FieldVisitPaymentIntent | null;
}>;

export type FieldVisitReportParseInput = Readonly<{
  message: string;
  referenceDate: string;
}>;
