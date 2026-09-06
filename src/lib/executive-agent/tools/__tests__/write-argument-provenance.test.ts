import { describe, expect, it } from "vitest";
import { verifyValueProvenance, findPatchProvenanceViolation } from "../write-argument-provenance";

describe("verifyValueProvenance", () => {
  it("verifies a phone number stated explicitly in the current turn (test B: current-turn-explicit)", () => {
    expect(verifyValueProvenance("905551112233", "Bu müşterinin telefonunu 0555 111 22 33 yap.")).toBe(true);
  });

  it("rejects a value with no relation at all to the current turn's text (test A/E: stale history can never be authority — this function never even sees history, only the current turn)", () => {
    expect(verifyValueProvenance("905324445566", "Bu müşterinin telefonunu değiştir.")).toBe(false);
  });

  it("verifies a continuation reply that IS this turn's own message (test C: 'Yeni numara ne olsun?' -> '0555 111 22 33' — by the time this turn runs, currentTurnMessage IS that reply)", () => {
    expect(verifyValueProvenance("905551112233", "0555 111 22 33")).toBe(true);
  });

  it("verifies a second domain's value (a quote amount) the same generic way — no phone-specific logic", () => {
    expect(verifyValueProvenance(9999, "Bu teklifin tutarını 9999 TL yap.")).toBe(true);
    expect(verifyValueProvenance(9999, "Bu teklifi güncelle.")).toBe(false);
  });

  it("does not flag non-string/number leaves or empty values — nothing to verify provenance for", () => {
    expect(verifyValueProvenance(true, "herhangi bir mesaj")).toBe(true);
    expect(verifyValueProvenance(null, "herhangi bir mesaj")).toBe(true);
    expect(verifyValueProvenance("", "herhangi bir mesaj")).toBe(true);
  });

  it("tolerates reasonable formatting differences (spaces, an international prefix a normalizer added) via the digit-suffix check", () => {
    expect(verifyValueProvenance("905551112233", "telefonu 0555-111-22-33 olarak güncelle")).toBe(true);
  });
});

describe("findPatchProvenanceViolation", () => {
  it("finds the unverifiable leaf in a flat patch", () => {
    const violation = findPatchProvenanceViolation({ phone: "905324445566" }, "Bu müşterinin telefonunu değiştir.");
    expect(violation).toEqual({ field: "phone", value: "905324445566" });
  });

  it("returns null when every leaf verifies", () => {
    const violation = findPatchProvenanceViolation({ phone: "905551112233" }, "Bu müşterinin telefonunu 0555 111 22 33 yap.");
    expect(violation).toBeNull();
  });

  it("walks one level of nesting (primaryContact.phone-style fields)", () => {
    const violation = findPatchProvenanceViolation(
      { primaryContact: { phone: "905324445566" } },
      "Bu müşterinin telefonunu değiştir.",
    );
    expect(violation).toEqual({ field: "primaryContact.phone", value: "905324445566" });
  });
});
