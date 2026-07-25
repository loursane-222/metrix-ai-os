import { describe, expect, it } from "vitest";
import { buildManagerAdviceAdvisoryPrompt } from "../manager-advice-advisory-prompt.service";
import type { ManagerAdviceAugmentationContext } from "../manager-advice-augmentation.types";

describe("executive gap reasoner context", () => {
  it("projects a gap as structured internal context without a fixed user answer", () => {
    const context = {
      analysis: { category: "COLLECTION", readiness: "INSUFFICIENT" },
      guidance: { keyConsiderations: [], risks: [], missingInformation: [] },
      executiveGapSignal: {
        reason: "readiness:INSUFFICIENT category:COLLECTION",
        category: "COLLECTION",
        readiness: "INSUFFICIENT",
      },
    } as unknown as ManagerAdviceAugmentationContext;

    const prompt = buildManagerAdviceAdvisoryPrompt(context);
    expect(prompt).toContain("Yapılandırılmış kritik bağlam sinyali");
    expect(prompt).toContain("Bu sinyal kullanıcı cevabı değildir");
    expect(prompt).not.toContain("vadesi geçmiş yaklaşık toplam alacağımız ne kadar");
  });
});
