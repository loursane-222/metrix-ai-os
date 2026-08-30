import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Invoice Phase 7 canonical contract", () => {
  it("Invoice carries Order/Delivery provenance (nullable, additive)", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model Invoice {");
    expect(schema).toContain("orderId        String?");
    expect(schema).toContain("deliveryId     String?");
    expect(schema).toContain("order          Order?        @relation(fields: [orderId], references: [id], onDelete: SetNull)");
    expect(schema).toContain("delivery       Delivery?     @relation(fields: [deliveryId], references: [id], onDelete: SetNull)");
  });

  it("Invoice has its own real line/item authority (InvoiceItem), mirroring the OrderItem/QuoteItem basis-points convention", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model InvoiceItem {");
    expect(schema).toContain("orderItemId         String?");
    expect(schema).toContain("discountBasisPoints Int             @default(0)");
    expect(schema).toContain("vatRateBasisPoints  Int             @default(0)");
  });

  it("invoice.service.ts never touches Stock — invoicing is not a stock movement authority (Phase 6 invariant carried into Phase 7)", () => {
    const service = readFileSync(join(process.cwd(), "src/lib/core/invoices/invoice.service.ts"), "utf8");
    expect(service).not.toMatch(/stock\.service|stockService|consumeStockForDelivery|reserveStockForOrder|releaseStockForOrder/i);
  });

  it("createInvoiceFromOrder derives lines from OrderItem, never re-reads Quote/QuoteItem", () => {
    const service = readFileSync(join(process.cwd(), "src/lib/core/invoices/invoice.service.ts"), "utf8");
    const fnStart = service.indexOf("export async function createInvoiceFromOrder");
    const fnBody = service.slice(fnStart, fnStart + 4000);
    expect(fnBody).not.toMatch(/tx\.quote\.|sourceQuote|quoteItem/i);
    expect(fnBody).toContain("order.items.find");
  });
});
