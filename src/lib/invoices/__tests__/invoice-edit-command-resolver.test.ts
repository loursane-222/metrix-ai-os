import { describe, expect, it, vi } from "vitest";
import { resolveInvoiceEditCommand } from "../invoice-edit-command-resolver";

describe("resolveInvoiceEditCommand", () => {
  it("resolves a draft invoice send command", async () => {
    const generateText = vi.fn(async () => '{"result":"executable","action":"send"}');
    await expect(resolveInvoiceEditCommand({ utterance: "faturayı gönder", activeTab: "actions", context: { invoiceNumber: "FTR-1", status: "DRAFT" }, generateText })).resolves.toEqual({ kind: "resolved", resolution: { kind: "executable", command: { type: "send" } } });
  });

  it.each(["SENT", "PAID", "CANCELLED"])("returns unsupported without consulting the model for %s", async (status) => {
    const generateText = vi.fn(async () => '{"result":"executable","action":"send"}');
    await expect(resolveInvoiceEditCommand({ utterance: "gönder", activeTab: "actions", context: { invoiceNumber: "FTR-1", status }, generateText })).resolves.toEqual({ kind: "resolved", resolution: { kind: "unsupported" } });
    expect(generateText).not.toHaveBeenCalled();
  });
});
