import { describe, expect, it, vi } from "vitest";
import { buildListableDomainSnapshotFetcher, LISTABLE_DOMAIN_LABELS } from "../listable-domain-registry";

vi.mock("@/lib/core/stock/stock.service", () => ({
  listStock: vi.fn(async () => [{ productService: { name: "Vida M6" } }, { productService: { name: "Somun M6" } }]),
  countStock: vi.fn(async () => 57),
}));
vi.mock("@/lib/core/orders/order.service", () => ({
  listOrders: vi.fn(async () => [{ orderNumber: "SIP-0001" }]),
  countOrders: vi.fn(async () => 12),
}));
vi.mock("@/lib/core/invoices/invoice.service", () => ({
  listInvoices: vi.fn(async () => [{ invoiceNumber: "FTR-0001" }]),
  countInvoices: vi.fn(async () => 8),
}));
vi.mock("@/lib/core/payments/payment.service", () => ({
  listPayments: vi.fn(async () => [{ title: "Ağustos tahsilatı" }]),
  countPayments: vi.fn(async () => 3),
}));
vi.mock("@/lib/core/suppliers/supplier.service", () => ({
  listSuppliers: vi.fn(async () => [{ displayName: "Atlas Metal" }]),
  countSuppliers: vi.fn(async () => 5),
}));
vi.mock("@/lib/core/products/product.service", () => ({
  listProductServices: vi.fn(async () => [{ name: "Çelik Profil" }]),
  countProductServices: vi.fn(async () => 20),
}));
vi.mock("@/lib/core/tasks", () => ({
  listTasks: vi.fn(async () => [{ title: "Teklifleri gözden geçir" }]),
  countTasks: vi.fn(async () => 4),
}));

describe("buildListableDomainSnapshotFetcher", () => {
  const fetchSnapshot = buildListableDomainSnapshotFetcher("org-1");

  it("shapes stock rows into productService names", async () => {
    expect(await fetchSnapshot("stock")).toEqual({ recordCount: 57, recordNames: ["Vida M6", "Somun M6"] });
  });
  it("shapes order rows into orderNumber", async () => {
    expect(await fetchSnapshot("order")).toEqual({ recordCount: 12, recordNames: ["SIP-0001"] });
  });
  it("shapes invoice rows into invoiceNumber", async () => {
    expect(await fetchSnapshot("invoice")).toEqual({ recordCount: 8, recordNames: ["FTR-0001"] });
  });
  it("shapes payment rows into title", async () => {
    expect(await fetchSnapshot("payment")).toEqual({ recordCount: 3, recordNames: ["Ağustos tahsilatı"] });
  });
  it("shapes supplier rows into displayName", async () => {
    expect(await fetchSnapshot("supplier")).toEqual({ recordCount: 5, recordNames: ["Atlas Metal"] });
  });
  it("shapes product rows into name", async () => {
    expect(await fetchSnapshot("product")).toEqual({ recordCount: 20, recordNames: ["Çelik Profil"] });
  });
  it("shapes task rows into title", async () => {
    expect(await fetchSnapshot("task")).toEqual({ recordCount: 4, recordNames: ["Teklifleri gözden geçir"] });
  });

  it("has a Turkish label for every listable domain", () => {
    expect(Object.keys(LISTABLE_DOMAIN_LABELS).sort()).toEqual(["invoice", "order", "payment", "product", "stock", "supplier", "task"]);
  });
});
