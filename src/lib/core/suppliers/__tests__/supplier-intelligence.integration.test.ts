import { describe, expect, it } from "vitest";

const databaseUrl = process.env.SUPPLIER_INTELLIGENCE_INTEGRATION_DATABASE_URL;

describe.skipIf(!databaseUrl)("Supplier phase 2 canonical intelligence", () => {
  it("derives performance from receipts and projects supplier/customer notes", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [{ prisma }, { receiveStock }, intelligence, supplierAuthority, customerAuthority] = await Promise.all([
      import("@/lib/core/shared/prisma"),
      import("@/lib/core/stock/stock.service"),
      import("../supplier-intelligence.service"),
      import("../supplier-authority-projection.service"),
      import("@/lib/core/customers/customer-authority-projection.service"),
    ]);
    const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const organization = await prisma.organization.create({ data: { name: `TEDARIKCI FAZ2 ACCEPTANCE ${suffix}` } });
    try {
      const [product, warehouse, supplier, alternative, customer] = await Promise.all([
        prisma.productService.create({ data: { organizationId: organization.id, name: `Çelik ${suffix}`, type: "PRODUCT" } }),
        prisma.warehouse.create({ data: { organizationId: organization.id, name: "Ana Depo", code: `ANA-${suffix}` } }),
        prisma.supplier.create({ data: { organizationId: organization.id, displayName: "ABC Metal", riskNotes: "Bu tedarikçinin bulunduğu bölgede döviz kuru dalgalanması riski yüksek" } }),
        prisma.supplier.create({ data: { organizationId: organization.id, displayName: "Alternatif Metal" } }),
        prisma.customer.create({ data: { organizationId: organization.id, displayName: "Atlas Müşteri", metrixNote: "Tahsilat görüşmelerinde finans direktörü dahil edilmeli" } }),
      ]);
      await prisma.supplierProduct.createMany({ data: [{ organizationId: organization.id, supplierId: supplier.id, productServiceId: product.id }, { organizationId: organization.id, supplierId: alternative.id, productServiceId: product.id }] });
      const now = Date.now();
      await receiveStock({ organizationId: organization.id, productServiceId: product.id, warehouseId: warehouse.id, supplierId: supplier.id, quantity: 60, expectedAt: new Date(now + 2 * 86_400_000), unitCostCents: BigInt(10000), qualityFlag: "OK" });
      await receiveStock({ organizationId: organization.id, productServiceId: product.id, warehouseId: warehouse.id, supplierId: supplier.id, quantity: 30, expectedAt: new Date(now - 2 * 86_400_000), unitCostCents: BigInt(11000), qualityFlag: "PARTIAL" });
      await receiveStock({ organizationId: organization.id, productServiceId: product.id, warehouseId: warehouse.id, supplierId: supplier.id, quantity: 10, expectedAt: new Date(now), unitCostCents: BigInt(10500), qualityFlag: "DAMAGED" });

      const delivery = await intelligence.computeSupplierDeliveryPerformance(supplier.id, organization.id);
      const score = await intelligence.computeSupplierScore(supplier.id, organization.id);
      const alternatives = await intelligence.listAlternativeSuppliers(product.id, organization.id, supplier.id);
      expect(delivery).toMatchObject({ totalReceipts: 3, measuredReceipts: 3 });
      expect(delivery.onTimeRate).not.toBeNull();
      expect(score).toEqual(expect.any(Number));
      expect(alternatives.map((item) => item.supplier.displayName)).toContain("Alternatif Metal");

      const supplierProjections = await supplierAuthority.buildSupplierAuthorityProjections(organization.id);
      expect(supplierProjections).toEqual(expect.arrayContaining([expect.objectContaining({ key: `supplier_risk_note:${supplier.id}`, value: expect.stringContaining("döviz kuru dalgalanması") })]));
      const customerProjections = await customerAuthority.buildCustomerAuthorityProjections(organization.id);
      expect(customerProjections).toEqual(expect.arrayContaining([expect.objectContaining({ key: `customer_note:${customer.id}`, value: expect.stringContaining("finans direktörü") })]));
    } finally {
      await prisma.organization.delete({ where: { id: organization.id } });
      expect(await prisma.organization.count({ where: { id: organization.id } })).toBe(0);
      await prisma.$disconnect();
    }
  });
});
