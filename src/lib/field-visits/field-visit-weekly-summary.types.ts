import type { FieldVisitRequestType } from "@/lib/core/field-visits/field-visit.types";

export type FieldVisitWeeklySummary = Readonly<{
  repUserId: string | null;
  weekStart: string;
  weekEnd: string;
  visitCount: number;
  distinctCustomerCount: number;
  distinctRepCount: number;
  requestTypeCounts: Readonly<Record<FieldVisitRequestType, number>>;
  linkedOrderCount: number;
  linkedPaymentCount: number;
  linkedPaymentTotal: number;
  openUnresolvedIntentCount: number;
}>;

export type FieldVisitWeeklySummaryAccessResult =
  | Readonly<{ status: "ALLOWED"; summary: FieldVisitWeeklySummary }>
  | Readonly<{ status: "DENIED" }>;
