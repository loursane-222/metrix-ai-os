import { describe, expect, it } from "vitest";
import { customerImportConversationExtension } from "../customer-import-conversation-extension";

describe("customerImportConversationExtension", () => {
  it("matches the original literal phrasing", async () => {
    const result = await customerImportConversationExtension.execute("excel'den müşteri aktar", "written", "corr-1");
    expect(result.status).toBe("HANDOFF");
    expect(result.handoff?.outcomeCode).toBe("CUSTOMER_IMPORT_OPENED");
  });

  it("matches natural conjugations the old anchored regex missed", async () => {
    for (const phrase of [
      "excelden müşteri aktaracağız.",
      "müşterilerimi excelden aktarmak istiyorum",
      "csv'den müşteri yüklemek istiyorum lütfen",
      "excel'deki müşterileri aktarır mısın",
    ]) {
      const result = await customerImportConversationExtension.execute(phrase, "written", "corr-1");
      expect(result.status, phrase).toBe("HANDOFF");
    }
  });

  it("does not handle unrelated text", async () => {
    const result = await customerImportConversationExtension.execute("merhaba nasılsın", "written", "corr-1");
    expect(result.status).toBe("NOT_HANDLED");
  });

  it("does not handle a phrase missing the excel/csv source", async () => {
    const result = await customerImportConversationExtension.execute("müşteri aktar", "written", "corr-1");
    expect(result.status).toBe("NOT_HANDLED");
  });
});
