import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createOrderWorkspaceDirective } from "@/lib/living-workspace";

describe("order phase 1 canonical contract", () => {
  it("keeps Order model organization-scoped with lifecycle enum", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model Order {");
    expect(schema).toContain("organizationId        String");
    expect(schema).toContain("enum OrderStatus {");
    expect(schema).toContain("DRAFT");
    expect(schema).toContain("COMPLETED");
    expect(schema).toContain("CANCELLED");
  });

  it("keeps OrderStatusHistory model for auditable transitions", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model OrderStatusHistory {");
    expect(schema).toContain("fromStatus     OrderStatus?");
    expect(schema).toContain("toStatus       OrderStatus");
    expect(schema).toContain("reason         String?");
    expect(schema).toContain("performedById  String?");
  });

  it("sourceQuoteId is nullable — order links to quote without copying it", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("sourceQuoteId         String?");
  });

  it("stores a structured payment-term snapshot and copies it during Quote conversion", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const service = readFileSync(join(process.cwd(), "src/lib/core/orders/order.service.ts"), "utf8");
    expect(schema).toContain("paymentTermSnapshot   Json?");
    expect(schema).toContain("paymentTermReferenceDatesSnapshot Json?");
    expect(service).toContain("paymentTermSnapshot: quote.paymentTermStructured");
    expect(service).not.toContain("paymentTermSnapshot: quote.sourceQuote");
  });

  it("Phase 6: snapshots commercial terms from Quote into Order/OrderItem at conversion time", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const service = readFileSync(join(process.cwd(), "src/lib/core/orders/order.service.ts"), "utf8");
    expect(schema).toContain("generalDiscountBasisPoints Int?");
    expect(schema).toContain("discountBasisPoints Int          @default(0)");
    expect(schema).toContain("vatRateBasisPoints  Int          @default(0)");
    expect(service).toContain("generalDiscountBasisPoints: quote.generalDiscountBasisPoints");
    expect(service).toContain("deliveryTerm: quote.deliveryTerm");
    expect(service).toContain("deliveryMethod: quote.deliveryMethod");
    expect(service).toContain("discountBasisPoints: item.discountBasisPoints");
    expect(service).toContain("vatRateBasisPoints: item.vatRateBasisPoints");
  });

  it("preserves the historical quote reference used by relative maturity", async () => {
    const { materializePaymentTerm, parseStructuredPaymentTerm, snapshotPaymentTermReferenceDates } = await import("@/lib/payment-terms");
    const snapshot = snapshotPaymentTermReferenceDates(new Date("2026-09-01T12:00:00.000Z"), new Date("2026-09-05T12:00:00.000Z"));
    const term = parseStructuredPaymentTerm({ schemaVersion: 1, strategy: "SCHEDULE", components: [{ allocationType: "PERCENTAGE", percentageBasisPoints: 10_000, maturityBasis: "DAYS_AFTER_REFERENCE", days: 30, referenceDateType: "QUOTE_DATE" }] });
    expect(materializePaymentTerm({ term, totalCents: BigInt(100), currency: "TRY", references: { QUOTE_DATE: new Date(`${snapshot.QUOTE_DATE}T00:00:00.000Z`) } })[0]?.dueDate).toBe("2026-10-01");
  });

  it("projects list and create routes into canonical workspace surfaces", () => {
    expect(createOrderWorkspaceDirective({ route: "/metrix/orders", source: "system", correlationId: "c" })?.businessSurface).toBe("order-list");
    expect(createOrderWorkspaceDirective({ route: "/metrix/orders/new", source: "system", correlationId: "c" })?.businessSurface).toBe("order-create");
  });

  it("returns null for unrecognised order routes", () => {
    expect(createOrderWorkspaceDirective({ route: "/metrix/customers", source: "system", correlationId: "c" })).toBeNull();
  });
});
