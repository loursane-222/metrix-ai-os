import { describe, expect, it } from "vitest";
import { resolveCustomerReference, type ResolvableCustomer } from "../customer-resolution";
const row = (id: string, displayName: string, extra: Partial<ResolvableCustomer> = {}): ResolvableCustomer => ({ id, displayName, legalName: null, phone: null, email: null, cariKodu: null, taxNumber: null, ...extra });
describe("resolveCustomerReference", () => {
  const customers = [row("c1", "İzmir İnşaat", { legalName: "İZMİR İNŞAAT A.Ş.", phone: "+90 555 111", email: "info@izmir.test", cariKodu: "CR-01", taxNumber: "1234567890" }), row("c2", "Izmir Lojistik"), row("c3", "Tek Müşteri")];
  it.each([["Tek Müşteri", "c3"], ["İZMİR İNŞAAT A.Ş.", "c1"], ["+90 555 111", "c1"], ["INFO@IZMIR.TEST", "c1"], ["CR-01", "c1"], ["1234567890", "c1"]])("resolves exact trusted identity %s", (query, id) => expect(resolveCustomerReference(customers, query)).toMatchObject({ status: "RESOLVED", customer: { id } }));
  it("returns not found and never fabricates an id", () => expect(resolveCustomerReference(customers, "olmayan")).toEqual({ status: "NOT_FOUND" }));
  it("returns safe options for ambiguous matches", () => expect(resolveCustomerReference(customers, "izmir")).toMatchObject({ status: "AMBIGUOUS", options: [{ id: "c1" }, { id: "c2" }] }));
});
