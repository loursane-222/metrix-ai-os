import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("delivery operational intelligence contract", () => {
  const service = readFileSync("src/lib/core/deliveries/delivery-intelligence.service.ts", "utf8");
  const migration = readFileSync("prisma/migrations/20260809160000_add_delivery_intelligence/migration.sql", "utf8");

  it("uses canonical lifecycle, condition and commitment evidence", () => {
    expect(service).toContain("FAILED_DELIVERY");
    expect(service).toContain("conditionFlags");
    expect(service).toContain("commitmentAt");
    expect(service).toContain("deliveredAt ?? row.dispatchedAt");
  });

  it("keeps proof text based and excludes unsupported capture capabilities", () => {
    expect(service).toContain("confirmationCode");
    expect(service).toContain("signatureCaptured");
    expect(service).not.toMatch(/photo|gps|qr|camera/iu);
  });

  it("adds condition and exception storage through a real additive migration", () => {
    expect(migration).toContain('ADD COLUMN "conditionFlag"');
    expect(migration).toContain('CREATE TABLE "DeliveryException"');
    expect(service).toContain("outerTx?: Prisma.TransactionClient");
  });
});
