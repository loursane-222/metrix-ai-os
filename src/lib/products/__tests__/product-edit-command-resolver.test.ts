import { describe, expect, it } from "vitest";
import { resolveProductEditCommand } from "../product-edit-command-resolver";

function resolve(modelOutput: string) {
  return resolveProductEditCommand({ utterance: "ürünü düzenle", activeTab: "actions", generateText: async () => modelOutput });
}

describe("product edit resolver", () => {
  it("resolves a valid set_field model output", async () => {
    await expect(resolve('{"result":"executable","action":"set_field","field":"priceCents","value":"500"}')).resolves.toEqual({ kind: "resolved", resolution: { kind: "executable", command: { type: "set_field", field: "priceCents", value: "500" } } });
  });

  it.each([["type", "WIDGET"], ["status", "DELETED"]])("rejects invalid enum value %s=%s", async (field, value) => {
    await expect(resolve(JSON.stringify({ result: "executable", action: "set_field", field, value }))).resolves.toEqual({ kind: "invalid_output" });
  });

  it("allows clear_field for a clearable field", async () => {
    await expect(resolve('{"result":"executable","action":"clear_field","field":"category"}')).resolves.toEqual({ kind: "resolved", resolution: { kind: "executable", command: { type: "clear_field", field: "category" } } });
  });

  it.each(["name", "type", "currency", "status"])("rejects clear_field for required field %s", async (field) => {
    await expect(resolve(JSON.stringify({ result: "executable", action: "clear_field", field }))).resolves.toEqual({ kind: "invalid_output" });
  });
});
