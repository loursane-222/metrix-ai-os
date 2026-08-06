import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const model = () => ({ count: vi.fn(), findMany: vi.fn() });
  return {
    customer: model(), productService: model(), quote: model(), invoice: model(),
    payment: model(), expense: model(), task: model(), person: model(),
  };
});

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: mocks }));

import {
  detectCanonicalBusinessFactEntities,
  readCanonicalBusinessFactsForMessage,
  serializeCanonicalBusinessFacts,
} from "../canonical-business-facts.service";

describe("canonical business facts", () => {
  it("detects every audited canonical entity", () => {
    expect(detectCanonicalBusinessFactEntities("Müşteri, ürün, teklif, fatura, tahsilat, gider, görev ve kişi sayılarını ver"))
      .toEqual(["customers", "products", "quotes", "invoices", "payments", "expenses", "tasks", "people"]);
  });

  it("reads the exact count and complete unfiltered list with organization scope", async () => {
    mocks.customer.count.mockResolvedValue(1);
    mocks.customer.findMany.mockResolvedValue([{ id: "c1", displayName: "Atlas", legalName: null, status: "ACTIVE" }]);

    const result = await readCanonicalBusinessFactsForMessage({ organizationId: "org-1", message: "Kaç müşterimiz var?" });

    expect(mocks.customer.count).toHaveBeenCalledWith({ where: { organizationId: "org-1" } });
    expect(mocks.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1" } }));
    expect(mocks.customer.findMany.mock.calls[0]?.[0]).not.toHaveProperty("take");
    expect(result[0]).toMatchObject({ model: "Customer", count: 1, records: [{ id: "c1", name: "Atlas" }] });
    expect(serializeCanonicalBusinessFacts(result)).toContain("exact organization-scoped total=1");
  });

  it("fails closed if count and complete list disagree", async () => {
    mocks.task.count.mockResolvedValue(2);
    mocks.task.findMany.mockResolvedValue([{ id: "t1", title: "Ara", status: "OPEN", priority: "HIGH" }]);
    await expect(readCanonicalBusinessFactsForMessage({ organizationId: "org-1", message: "Görevleri listele" }))
      .rejects.toThrow("count/list mismatch");
  });

  it.each([
    ["products", "productService", "Ürünleri listele", { id: "p1", name: "Danışmanlık", type: "SERVICE", category: null, status: "ACTIVE" }],
    ["quotes", "quote", "Kaç teklif var?", { id: "q1", title: "Teklif", customerName: "Atlas", status: "DRAFT" }],
    ["invoices", "invoice", "Faturaları listele", { id: "i1", invoiceNumber: "FTR-1", title: "Fatura", status: "DRAFT" }],
    ["payments", "payment", "Tahsilatlar hakkında bilgi ver", { id: "p1", title: "Tahsilat", status: "PENDING" }],
    ["expenses", "expense", "Toplam kaç gider var?", { id: "e1", title: "Kira", category: "RENT", status: "PAID" }],
    ["tasks", "task", "Görevleri listele", { id: "t1", title: "Ara", status: "OPEN", priority: "HIGH" }],
    ["people", "person", "Kaç kişi var?", { id: "u1", fullName: "Ada", type: "EMPLOYEE", title: null }],
  ] as const)("reads canonical %s without a sample/filter", async (_entity, delegate, message, row) => {
    mocks[delegate].count.mockResolvedValue(1);
    mocks[delegate].findMany.mockResolvedValue([row]);
    const result = await readCanonicalBusinessFactsForMessage({ organizationId: "org-1", message });
    expect(mocks[delegate].count).toHaveBeenLastCalledWith({ where: { organizationId: "org-1" } });
    const query = mocks[delegate].findMany.mock.calls.at(-1)?.[0];
    expect(query.where).toEqual({ organizationId: "org-1" });
    expect(query).not.toHaveProperty("take");
    expect(result[0]?.count).toBe(1);
  });
});
