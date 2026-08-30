import { describe, expect, it } from "vitest";

const databaseUrl = process.env.DELIVERY_CONCURRENCY_INTEGRATION_DATABASE_URL;

/**
 * Bkz. settlement-concurrency.integration.test.ts — aynı gerçek-Postgres,
 * env-var-gated desen. Mocked unit testlerin (delivery-overshipping-lock.
 * service.test.ts) KANITLAYAMADIĞI şeyi kanıtlar: gerçek eşzamanlı
 * transaction'lar altında Postgres'in row-level SELECT...FOR UPDATE
 * kilidinin, aynı OrderItem'a karşı iki gerçek eşzamanlı
 * createDeliveryFromOrder çağrısının ikisinin de sevkiyat ceiling'ini
 * aşmasını gerçekten engellediğini doğrular. Varsayılan test koşusunda
 * (DELIVERY_CONCURRENCY_INTEGRATION_DATABASE_URL set değilken) skip edilir.
 */
describe.skipIf(!databaseUrl)("Delivery overshipping concurrency against migrated PostgreSQL", () => {
  it("OVERSHIPPING CEILING: two truly concurrent autoDispatch calls that would together exceed an OrderItem's quantity never both fully dispatch", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [{ prisma }, { createDeliveryFromOrder }] = await Promise.all([
      import("@/lib/core/shared/prisma"),
      import("@/lib/core/deliveries/delivery.service"),
    ]);

    const organization = await prisma.organization.create({ data: { name: `Delivery concurrency ceiling ${Date.now()}` } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: "Concurrency Test Customer" } });
    const product = await prisma.productService.create({ data: { organizationId: organization.id, name: "Concurrency Test Product", type: "PRODUCT" } });
    const order = await prisma.order.create({
      data: { organizationId: organization.id, orderNumber: `SIP-CONC-${Date.now()}`, customerId: customer.id, status: "READY", currency: "TRY" },
    });
    const orderItem = await prisma.orderItem.create({
      data: { organizationId: organization.id, orderId: order.id, productServiceId: product.id, name: "Line 1", quantity: 10, unitPriceCents: BigInt(100), lineTotalCents: BigInt(1000) },
    });

    try {
      const attempt = () =>
        createDeliveryFromOrder({ organizationId: organization.id, sourceOrderId: order.id, items: [{ orderItemId: orderItem.id, quantity: 6 }], autoDispatch: true });

      const results = await Promise.allSettled([attempt(), attempt()]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const dispatchedItems = await prisma.deliveryItem.findMany({
        where: { orderItemId: orderItem.id, organizationId: organization.id, delivery: { status: { in: ["DISPATCHED", "AT_DELIVERY_POINT", "DELIVERED", "COMPLETED"] } } },
      });
      const totalDispatched = dispatchedItems.reduce((sum, item) => sum + Number(item.quantity), 0);
      expect(totalDispatched).toBeLessThanOrEqual(10);
      expect(totalDispatched).toBe(6); // exactly one 6-unit dispatch ever committed, never 12
    } finally {
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.$disconnect();
    }
  });

  it("allows two truly concurrent autoDispatch calls that together still fit within the OrderItem ceiling", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [{ prisma }, { createDeliveryFromOrder }] = await Promise.all([
      import("@/lib/core/shared/prisma"),
      import("@/lib/core/deliveries/delivery.service"),
    ]);

    const organization = await prisma.organization.create({ data: { name: `Delivery concurrency fit ${Date.now()}` } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: "Concurrency Test Customer" } });
    const product = await prisma.productService.create({ data: { organizationId: organization.id, name: "Concurrency Test Product", type: "PRODUCT" } });
    const order = await prisma.order.create({
      data: { organizationId: organization.id, orderNumber: `SIP-CONC-${Date.now()}`, customerId: customer.id, status: "READY", currency: "TRY" },
    });
    const orderItem = await prisma.orderItem.create({
      data: { organizationId: organization.id, orderId: order.id, productServiceId: product.id, name: "Line 1", quantity: 10, unitPriceCents: BigInt(100), lineTotalCents: BigInt(1000) },
    });

    try {
      const attempt = () =>
        createDeliveryFromOrder({ organizationId: organization.id, sourceOrderId: order.id, items: [{ orderItemId: orderItem.id, quantity: 4 }], autoDispatch: true });

      const [a, b] = await Promise.all([attempt(), attempt()]);
      expect(a?.id).not.toBe(b?.id);

      const dispatchedItems = await prisma.deliveryItem.findMany({
        where: { orderItemId: orderItem.id, organizationId: organization.id, delivery: { status: { in: ["DISPATCHED", "AT_DELIVERY_POINT", "DELIVERED", "COMPLETED"] } } },
      });
      const totalDispatched = dispatchedItems.reduce((sum, item) => sum + Number(item.quantity), 0);
      expect(totalDispatched).toBe(8);
    } finally {
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.$disconnect();
    }
  });

  it("MULTI-LINE CEILING: per-OrderItem ceilings are enforced independently and lock order never deadlocks across reversed item orderings", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [{ prisma }, { createDeliveryFromOrder }] = await Promise.all([
      import("@/lib/core/shared/prisma"),
      import("@/lib/core/deliveries/delivery.service"),
    ]);

    const organization = await prisma.organization.create({ data: { name: `Delivery concurrency multiline ${Date.now()}` } });
    const customer = await prisma.customer.create({ data: { organizationId: organization.id, displayName: "Concurrency Test Customer" } });
    const product = await prisma.productService.create({ data: { organizationId: organization.id, name: "Concurrency Test Product", type: "PRODUCT" } });
    const order = await prisma.order.create({
      data: { organizationId: organization.id, orderNumber: `SIP-CONC-${Date.now()}`, customerId: customer.id, status: "READY", currency: "TRY" },
    });
    // item-1 ceiling is tight (10, two concurrent 6-unit requests must conflict);
    // item-2 ceiling is loose (5, two concurrent 1-unit requests both fit).
    const itemTight = await prisma.orderItem.create({
      data: { organizationId: organization.id, orderId: order.id, productServiceId: product.id, name: "Tight Line", quantity: 10, unitPriceCents: BigInt(100), lineTotalCents: BigInt(1000) },
    });
    const itemLoose = await prisma.orderItem.create({
      data: { organizationId: organization.id, orderId: order.id, productServiceId: product.id, name: "Loose Line", quantity: 5, unitPriceCents: BigInt(100), lineTotalCents: BigInt(500) },
    });

    try {
      // Deliberately reversed item order between the two concurrent calls —
      // without the ORDER BY id fix in the lock query this can deadlock.
      const attemptA = () =>
        createDeliveryFromOrder({
          organizationId: organization.id,
          sourceOrderId: order.id,
          items: [{ orderItemId: itemTight.id, quantity: 6 }, { orderItemId: itemLoose.id, quantity: 1 }],
          autoDispatch: true,
        });
      const attemptB = () =>
        createDeliveryFromOrder({
          organizationId: organization.id,
          sourceOrderId: order.id,
          items: [{ orderItemId: itemLoose.id, quantity: 1 }, { orderItemId: itemTight.id, quantity: 6 }],
          autoDispatch: true,
        });

      const results = await Promise.allSettled([attemptA(), attemptB()]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Neither call deadlocks (both settle); the tight ceiling forces
      // exactly one to fail even though the loose ceiling would allow both.
      expect(fulfilled.length + rejected.length).toBe(2);
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const tightDispatched = await prisma.deliveryItem.findMany({
        where: { orderItemId: itemTight.id, organizationId: organization.id, delivery: { status: { in: ["DISPATCHED", "AT_DELIVERY_POINT", "DELIVERED", "COMPLETED"] } } },
      });
      expect(tightDispatched.reduce((sum, item) => sum + Number(item.quantity), 0)).toBe(6);
    } finally {
      await prisma.organization.delete({ where: { id: organization.id } });
      await prisma.$disconnect();
    }
  });
});
