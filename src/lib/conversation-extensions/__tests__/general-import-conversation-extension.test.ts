import { describe, expect, it } from "vitest";
import { generalImportConversationExtension } from "../general-import-conversation-extension";

describe("generalImportConversationExtension", () => {
  it("matches a domain-less import phrase and asks for clarification instead of navigating", async () => {
    const result = await generalImportConversationExtension.execute("excelden içe aktar", "written", "corr-1");
    expect(result.status).toBe("HANDOFF");
    expect(result.handoff?.resultStatus).toBe("CLARIFICATION_REQUIRED");
    expect(result.handoff?.outcomeCode).toBe("IMPORT_DOMAIN_CLARIFICATION_REQUIRED");
    expect(result.handoff?.navigationRequested).toBe(false);
  });

  it("matches common phrasing variants", async () => {
    for (const phrase of ["excel'den içe aktar", "excel aktar", "csv'den aktar", "excel yükle"]) {
      const result = await generalImportConversationExtension.execute(phrase, "written", "corr-1");
      expect(result.status, phrase).toBe("HANDOFF");
    }
  });

  it("does not handle a phrase that already names a domain (the specific import extensions own that case)", async () => {
    const result = await generalImportConversationExtension.execute("excel'den müşteri aktar", "written", "corr-1");
    expect(result.status).toBe("NOT_HANDLED");
  });

  it("does not handle unrelated text", async () => {
    const result = await generalImportConversationExtension.execute("merhaba nasılsın", "written", "corr-1");
    expect(result.status).toBe("NOT_HANDLED");
  });
});
