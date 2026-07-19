import { describe, expect, it } from "vitest";
import { buildCustomerRoute } from "../customer-navigation";
describe("customer navigation", () => {
  it("builds only allowlisted routes", () => {
    expect(buildCustomerRoute({ kind: "customers.list" })).toBe("/metrix/customers");
    expect(buildCustomerRoute({ kind: "customer.create" })).toBe("/metrix/customers/new");
    expect(buildCustomerRoute({ kind: "customer.detail", customerId: "cust_1" })).toBe("/metrix/customers/cust_1");
    expect(buildCustomerRoute({ kind: "customer.edit", customerId: "cust_1" })).toBe("/metrix/customers/cust_1/edit");
  });
  it("rejects arbitrary model paths", () => expect(() => buildCustomerRoute({ kind: "customer.detail", customerId: "../admin" })).toThrow());
});
