import { describe, expect, it } from "vitest";
import { revalidateOrderEditCommandResolution, validateOrderEditCommandResolution } from "../order-edit-command-contract";

describe("order edit command contract", () => {
  it("accepts every allowlisted action shape", () => {
    expect(validateOrderEditCommandResolution({ result: "executable", action: "revise_quantity", orderItemId: "item_1", quantity: 4, reason: "Artış" })?.kind).toBe("executable");
    expect(validateOrderEditCommandResolution({ result: "executable", action: "revise_deadline", deadlineAt: null })?.kind).toBe("executable");
    expect(validateOrderEditCommandResolution({ result: "executable", action: "remove_item", orderItemId: "item_1" })?.kind).toBe("executable");
    expect(validateOrderEditCommandResolution({ result: "executable", action: "record_exception", category: "QUALITY_ISSUE", note: "Kontrol" })?.kind).toBe("executable");
    expect(validateOrderEditCommandResolution({ result: "executable", action: "transition_status", toStatus: "APPROVED" })?.kind).toBe("executable");
    expect(validateOrderEditCommandResolution({ result: "executable", action: "cancel", reason: "Müşteri vazgeçti" })?.kind).toBe("executable");
  });
  it("rejects malformed or allowlist-outside commands", () => {
    expect(validateOrderEditCommandResolution({ result: "executable", action: "revise_quantity", orderItemId: "item_1", quantity: 0 })).toBeNull();
    expect(validateOrderEditCommandResolution({ result: "executable", action: "record_exception", category: "HACKED" })).toBeNull();
    expect(validateOrderEditCommandResolution({ result: "executable", action: "transition_status", toStatus: "DELETED" })).toBeNull();
    expect(validateOrderEditCommandResolution({ result: "executable", action: "cancel", reason: "" })).toBeNull();
    expect(validateOrderEditCommandResolution({ result: "executable", action: "delete_order" })).toBeNull();
  });
  it("supports unsupported and clarification while requiring a message", () => {
    expect(validateOrderEditCommandResolution({ result: "unsupported" })).toEqual({ kind: "unsupported" });
    expect(validateOrderEditCommandResolution({ result: "clarification_required", message: "Hangi kalem?" })).toEqual({ kind: "clarification_required", message: "Hangi kalem?" });
    expect(validateOrderEditCommandResolution({ result: "clarification_required" })).toBeNull();
  });
  it("revalidates the wire shape from scratch", () => {
    expect(revalidateOrderEditCommandResolution({ kind: "executable", command: { type: "revise_deadline", deadlineAt: "2026-09-20T12:00:00.000Z" } })?.kind).toBe("executable");
    expect(revalidateOrderEditCommandResolution({ kind: "executable", command: { type: "cancel" } })).toBeNull();
    expect(revalidateOrderEditCommandResolution({ kind: "executable", command: { type: "not_real" } })).toBeNull();
  });
});
