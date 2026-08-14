import { describe, expect, it } from "vitest";
import { revalidateDeliveryEditCommandResolution, validateDeliveryEditCommandResolution } from "../delivery-edit-command-contract";
describe("delivery edit command contract", () => {
  it("accepts every allowlisted action shape", () => {
    expect(validateDeliveryEditCommandResolution({ result: "executable", action: "flag_item_condition", deliveryItemId: "item_1", condition: "DAMAGED" })?.kind).toBe("executable");
    expect(validateDeliveryEditCommandResolution({ result: "executable", action: "record_exception", category: "PRODUCT_DAMAGED", note: "Kutu ezik" })?.kind).toBe("executable");
    expect(validateDeliveryEditCommandResolution({ result: "executable", action: "record_proof", receiverName: "Ayşe", signatureCaptured: true })?.kind).toBe("executable");
    expect(validateDeliveryEditCommandResolution({ result: "executable", action: "transition_status", toStatus: "PREPARING" })?.kind).toBe("executable");
    expect(validateDeliveryEditCommandResolution({ result: "executable", action: "cancel", reason: "Müşteri vazgeçti" })?.kind).toBe("executable");
  });
  it("rejects malformed or allowlist-outside commands", () => {
    expect(validateDeliveryEditCommandResolution({ result: "executable", action: "flag_item_condition", deliveryItemId: "item_1", condition: "LOST" })).toBeNull();
    expect(validateDeliveryEditCommandResolution({ result: "executable", action: "record_exception", category: "HACKED" })).toBeNull();
    expect(validateDeliveryEditCommandResolution({ result: "executable", action: "record_proof", signatureCaptured: "yes" })).toBeNull();
    expect(validateDeliveryEditCommandResolution({ result: "executable", action: "transition_status", toStatus: "DELETED" })).toBeNull();
    expect(validateDeliveryEditCommandResolution({ result: "executable", action: "cancel", reason: "" })).toBeNull();
  });
  it("supports clarification and revalidates the wire shape", () => {
    expect(validateDeliveryEditCommandResolution({ result: "clarification_required", message: "Hangi kalem?" })).toEqual({ kind: "clarification_required", message: "Hangi kalem?" });
    expect(revalidateDeliveryEditCommandResolution({ kind: "executable", command: { type: "flag_item_condition", deliveryItemId: "item_1", condition: "SHORT" } })?.kind).toBe("executable");
    expect(revalidateDeliveryEditCommandResolution({ kind: "executable", command: { type: "cancel" } })).toBeNull();
  });
});
