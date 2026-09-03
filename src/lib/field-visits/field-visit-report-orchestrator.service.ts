import { randomUUID } from "crypto";
import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { buildExecutionContext } from "@/lib/action-runtime/gateway/execution-context";
import { executeCanonicalOperation, type CanonicalOperationV1 } from "@/lib/canonical-operation";
import { listCustomers } from "@/lib/core/customers/customer.service";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { createCalendarClock } from "@/lib/executive-request-resolution";
import { linkFieldVisitOutcomeById } from "@/lib/core/field-visits/field-visit.service";
import { parseFieldVisitReport } from "./field-visit-report-parser.service";
import type { FieldVisitReportExtraction } from "./field-visit-report-parser.types";

export type FieldVisitReportOutcome =
  | Readonly<{ status: "PARSE_FAILED" }>
  | Readonly<{
      status: "LOGGED";
      fieldVisitId: string;
      customerNameRaw: string;
      customerResolved: boolean;
      requestTypes: readonly string[];
      orderCreated: boolean;
      paymentCreated: boolean;
    }>;

const ISTANBUL_UTC_OFFSET = "+03:00";

/**
 * Turkey has run permanently on UTC+3 since 2016 (DST abolished) — a fixed
 * offset is correct here, not a simplification that will drift.
 */
function combineIstanbulDateTime(dateIso: string, time: string | null): Date {
  if (!time) return new Date();
  return new Date(`${dateIso}T${time}:00${ISTANBUL_UTC_OFFSET}`);
}

// order.create only ever creates an empty DRAFT shell (no line-item/price
// fields exist on the action at all) — so a stated product/quantity is
// recorded here as descriptive notes for the back office to price and fill
// in, never as a fabricated priced line item.
function orderNotesFromIntent(extraction: FieldVisitReportExtraction): string {
  const orderIntent = extraction.orderIntent;
  if (!orderIntent) return "";
  const qty = orderIntent.quantity !== null ? `${orderIntent.quantity} adet` : null;
  const product = orderIntent.productRef ?? "ürün (adı belirtilmedi, netleştirilmeli)";
  return `Saha ziyareti sırasında bildirilen sipariş talebi: ${[qty, product].filter(Boolean).join(" ")}.`;
}

export async function processFieldVisitReport(input: {
  authContext: AuthContext;
  message: string;
  correlationId?: string;
}): Promise<FieldVisitReportOutcome> {
  const correlationId = input.correlationId ?? randomUUID();
  const clock = createCalendarClock(new Date());

  const extraction = await parseFieldVisitReport({ message: input.message, referenceDate: clock.today });
  if (!extraction) return { status: "PARSE_FAILED" };

  const executionContext = buildExecutionContext(input.authContext);
  const organizationId = executionContext.organizationId;
  // A field rep's role (EMPLOYEE/TEAM_LEAD) intentionally does NOT carry
  // orders.write/payments.write in ROLE_PERMISSIONS — that would open the
  // general order/payment mutation surface app-wide. This trusted,
  // server-only flow grants that pair narrowly, only for the two sub-calls
  // below, scoped to exactly the order/payment this verified visit report
  // produces.
  const orderPaymentExecutionContext = {
    ...executionContext,
    permissions: [...executionContext.permissions, "orders.write", "payments.write"],
  };

  const customers = await listCustomers({ organizationId, limit: 5000 });
  const resolution = resolveCustomerReference(customers, extraction.customerNameRaw);
  const customerId = resolution.status === "RESOLVED" ? resolution.customer.id : null;

  const startAt = combineIstanbulDateTime(clock.today, extraction.startTime);
  const endAt = extraction.endTime ? combineIstanbulDateTime(clock.today, extraction.endTime) : null;

  // A visit is real regardless of whether METRIX can match the customer
  // account — but an order/payment needs a real customerId, so a mismatch
  // there is surfaced on the visit itself rather than silently dropped.
  const unresolvedParts: string[] = [];
  if (customerId === null && (extraction.orderIntent || extraction.paymentIntent)) {
    unresolvedParts.push(`Müşteri "${extraction.customerNameRaw}" sistemde net olarak eşleşmediği için bildirilen sipariş/ödeme kaydı otomatik oluşturulamadı.`);
  }

  function operation(capability: string, payload: Record<string, unknown>, entityType: string): CanonicalOperationV1 {
    return {
      operationId: `field-visit-report:${correlationId}:${capability}`,
      correlationId,
      organizationId,
      actorId: input.authContext.user.id,
      source: "system",
      type: "EXECUTE",
      domain: entityType,
      entity: { entityType },
      capability,
      payload,
      revealIntent: { explicit: false },
    };
  }

  const visitResult = await executeCanonicalOperation(
    operation("field_visit.create", {
      customerId: customerId ?? undefined,
      customerNameRaw: extraction.customerNameRaw,
      contactNameRaw: extraction.contactNameRaw ?? undefined,
      startAt: startAt.toISOString(),
      endAt: endAt ? endAt.toISOString() : undefined,
      notes: extraction.notes,
      requestTypes: extraction.requestTypes,
      unresolvedIntent: unresolvedParts.length ? unresolvedParts.join(" ") : undefined,
    }, "field_visit"),
    { authContext: input.authContext, executionContext },
  );
  if (visitResult.status !== "EXECUTED" || !visitResult.entity?.entityId) {
    throw new Error(`field_visit.create failed: ${visitResult.failureMessage ?? visitResult.status}`);
  }
  const fieldVisitId = visitResult.entity.entityId;

  let orderId: string | null = null;
  let paymentId: string | null = null;

  if (customerId && extraction.orderIntent) {
    const orderResult = await executeCanonicalOperation(
      operation("order.create", { customerId, notes: orderNotesFromIntent(extraction) }, "order"),
      { authContext: input.authContext, executionContext: orderPaymentExecutionContext },
    );
    if (orderResult.status === "EXECUTED" && orderResult.entity?.entityId) orderId = orderResult.entity.entityId;
  }

  if (customerId && extraction.paymentIntent) {
    const paymentResult = await executeCanonicalOperation(
      operation("payment.create", {
        customerId,
        title: `Saha ziyareti tahsilatı — ${extraction.customerNameRaw}, ${clock.today}`,
        amount: extraction.paymentIntent.amount,
        currency: extraction.paymentIntent.currency,
      }, "payment"),
      { authContext: input.authContext, executionContext: orderPaymentExecutionContext },
    );
    if (paymentResult.status === "EXECUTED" && paymentResult.entity?.entityId) paymentId = paymentResult.entity.entityId;
  }

  if (orderId || paymentId) {
    await linkFieldVisitOutcomeById(fieldVisitId, organizationId, {
      relatedOrderId: orderId ?? undefined,
      relatedPaymentId: paymentId ?? undefined,
    });
  }

  return {
    status: "LOGGED",
    fieldVisitId,
    customerNameRaw: extraction.customerNameRaw,
    customerResolved: customerId !== null,
    requestTypes: extraction.requestTypes,
    orderCreated: orderId !== null,
    paymentCreated: paymentId !== null,
  };
}
