import { describe, expect, it } from "vitest";
import { revalidateStockOperationCommandResolution, validateStockOperationCommandResolution } from "../stock-operation-command-contract";
describe("stock operation command contract", () => {
  it.each([["receipt", "supplierId"], ["transfer", "toWarehouseId"], ["warehouses", "notes"]])("accepts %s field isolation", (tabId, field) => expect(validateStockOperationCommandResolution({ result: "executable", action: "set_field", tabId, field, value: "x" })).not.toBeNull());
  it.each([["receipt", "toWarehouseId"], ["transfer", "supplierId"], ["warehouses", "quantity"]])("rejects %s fields from another tab", (tabId, field) => expect(validateStockOperationCommandResolution({ result: "executable", action: "set_field", tabId, field, value: "x" })).toBeNull());
  it("strictly revalidates transported resolutions", () => { expect(revalidateStockOperationCommandResolution({ kind: "executable", command: { type: "select_tab", tabId: "transfer" } })).toEqual({ kind: "executable", command: { type: "select_tab", tabId: "transfer" } }); expect(revalidateStockOperationCommandResolution({ kind: "executable", command: { type: "set_field", tabId: "receipt", field: "code", value: "X" } })).toBeNull(); });
});
