import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("order operational intelligence contract", () => {
  const service = readFileSync("src/lib/core/orders/order-intelligence.service.ts", "utf8");
  const migration = readFileSync("prisma/migrations/20260809150000_add_order_intelligence/migration.sql", "utf8");

  it("uses canonical reservation, delivery and commitment evidence without capacity estimates", () => {
    expect(service).toContain("reservedInventory");
    expect(service).toContain("stockShortfall");
    expect(service).toContain("deliveredAt ?? delivery.dispatchedAt");
    expect(service).not.toMatch(/capacity|productionLoad|üretim kapasitesi/iu);
  });

  it("persists revision and exception audit models through a real migration", () => {
    expect(migration).toContain('CREATE TABLE "OrderRevision"');
    expect(migration).toContain('CREATE TABLE "OrderException"');
    expect(migration).toContain('ALTER TABLE "OrderItem" ADD COLUMN "removedAt"');
  });

  it("preserves removed items and supports the outer transaction pattern", () => {
    expect(service).toContain("removedAt: new Date()");
    expect(service).toContain("outerTx?: Prisma.TransactionClient");
    expect(service).not.toContain("orderItem.delete");
  });
});
