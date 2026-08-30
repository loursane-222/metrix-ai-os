import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("Phase 9 Purchase Lifecycle — canonical schema/authority contract", () => {
  it("PurchaseOrder/PurchaseOrderItem/GoodsReceipt/GoodsReceiptItem/PurchaseInvoice/PurchaseInvoiceItem/SupplierPayment all exist, org-scoped", () => {
    const schema = read("prisma/schema.prisma");
    for (const model of ["PurchaseOrder", "PurchaseOrderItem", "GoodsReceipt", "GoodsReceiptItem", "PurchaseInvoice", "PurchaseInvoiceItem", "SupplierPayment"]) {
      expect(schema).toContain(`model ${model} {`);
    }
  });

  it("purchase-order.service.ts never touches Stock — PurchaseOrder is a commercial commitment only", () => {
    const service = read("src/lib/core/purchase-orders/purchase-order.service.ts");
    expect(service).not.toMatch(/stock\.service|receiveStock|reverseGoodsReceiptStock|updateStockQuantity/i);
  });

  it("purchase-invoice.service.ts never touches Stock — Purchase Invoice cannot move stock by itself", () => {
    const service = read("src/lib/core/purchase-invoices/purchase-invoice.service.ts");
    expect(service).not.toMatch(/stock\.service|receiveStock|reverseGoodsReceiptStock|updateStockQuantity/i);
  });

  it("supplier-payment.service.ts never touches Stock and never bypasses FinancialAccountMovement", () => {
    const service = read("src/lib/core/supplier-payments/supplier-payment.service.ts");
    expect(service).not.toMatch(/stock\.service|receiveStock/i);
    expect(service).toContain("createSupplierPaymentMovement");
  });

  it("GoodsReceipt is the only caller of the canonical receiveStock/reverseGoodsReceiptStock authority in the purchase domain", () => {
    const goodsReceiptService = read("src/lib/core/goods-receipts/goods-receipt.service.ts");
    expect(goodsReceiptService).toContain("receiveStock(");
    expect(goodsReceiptService).toContain("reverseGoodsReceiptStock(");
  });

  it("Purchase Invoice ≠ Expense: PurchaseInvoice has its own table/repository, never writes to the Expense model", () => {
    const repo = read("src/lib/core/purchase-invoices/purchase-invoice.repository.ts");
    expect(repo).not.toMatch(/\.expense\.(create|update)/i);
  });

  it("Purchase Invoice ≠ Supplier Payment: settlement lives in a separate SupplierPayment table, not on PurchaseInvoice itself", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("model SupplierPayment {");
    expect(schema).toContain("purchaseInvoice    PurchaseInvoice            @relation(fields: [purchaseInvoiceId], references: [id], onDelete: Restrict)");
  });

  it("Goods Receipt ≠ Purchase Invoice: PurchaseInvoice.sourceGoodsReceiptId is optional/nullable provenance, not a merged record", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("sourceGoodsReceiptId  String?");
  });

  it("payable ≠ money movement: ObligationScheduleLine (payable/maturity) is a distinct model from SupplierPayment (the actual cash outflow)", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("purchaseInvoiceId String?                        @unique"); // ObligationScheduleLine's link
    expect(schema).toContain("model SupplierPayment {");
  });

  it("obligation materialization for PurchaseInvoice never runs at DRAFT — only from confirmPurchaseInvoice's handler, as a non-critical follow-up", () => {
    const handler = read("src/lib/action-runtime/domains/purchase-invoices/purchase-invoice-confirm-handler.ts");
    const createHandler = read("src/lib/action-runtime/domains/purchase-invoices/purchase-invoice-create-handler.ts");
    expect(handler).toContain("materializePurchaseInvoicePayableSchedule");
    expect(createHandler).not.toContain("materializePurchaseInvoicePayableSchedule");
  });

  it("supplierPayment.apply and supplierPayment.reverse are gated behind the CONDITIONAL approval gateway, matching payment.apply/expense.settle", () => {
    const manifest = read("src/lib/action-runtime/registry/manifests/supplier-payments.actions.ts");
    expect(manifest).toContain('approvalPolicy: "CONDITIONAL"');
    expect(manifest).toContain('riskLevelBase: "HIGH"');
  });
});
