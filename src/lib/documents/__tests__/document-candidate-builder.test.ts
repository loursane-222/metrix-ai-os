import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StructuredExtractionPayload, StructuredFieldCandidate } from "@/lib/field-authority/structured-field-ingestion";

const { resolveCounterpartyMock, resolvePurchaseOrderMock, persistMock } = vi.hoisted(() => ({
  resolveCounterpartyMock: vi.fn(),
  resolvePurchaseOrderMock: vi.fn(),
  persistMock: vi.fn(),
}));

vi.mock("../document-counterparty-resolution", () => ({
  resolveCounterpartyForDocument: resolveCounterpartyMock,
  resolvePurchaseOrderForDocument: resolvePurchaseOrderMock,
}));
vi.mock("@/lib/business-reality-candidates/business-candidate.service", () => ({
  persistBusinessPropositions: persistMock,
}));

import { buildAndPersistDocumentCandidate } from "../document-candidate-builder";

function candidate(fieldId: string, value: string): StructuredFieldCandidate {
  return { fieldId, extractedValue: value, normalizedValue: value, confidence: 0.9, source: { sourceId: "s1", mediaType: "application/pdf" }, warnings: [], conflicts: [], conflictStatus: "NONE", requiresUserConfirmation: true };
}
function extraction(candidates: StructuredFieldCandidate[]): StructuredExtractionPayload { return { candidates, unsupportedObservations: [] }; }

const baseInput = { organizationId: "org-1", actorId: "actor-1", attachmentId: "att-1" };

describe("document-candidate-builder — fail-closed candidate construction", () => {
  beforeEach(() => {
    resolveCounterpartyMock.mockReset();
    resolvePurchaseOrderMock.mockReset();
    persistMock.mockReset().mockResolvedValue([{ id: "candidate-1" }]);
  });

  it("SALES_INVOICE: missing amount ⇒ NEEDS_REVIEW MISSING_CRITICAL_FIELDS, never persists a candidate", async () => {
    const result = await buildAndPersistDocumentCandidate({ ...baseInput, domain: "SALES_INVOICE", extraction: extraction([candidate("document.SALES_INVOICE.title", "Fatura")]) });
    expect(result).toEqual({ status: "NEEDS_REVIEW", reason: "MISSING_CRITICAL_FIELDS" });
    expect(persistMock).not.toHaveBeenCalled();
  });

  it("SALES_INVOICE: ambiguous customer evidence ⇒ NEEDS_REVIEW with candidate names, never persists", async () => {
    resolveCounterpartyMock.mockResolvedValue({ status: "AMBIGUOUS", candidateNames: ["Atlas A.Ş.", "Atlas İnşaat"] });
    const result = await buildAndPersistDocumentCandidate({
      ...baseInput, domain: "SALES_INVOICE",
      extraction: extraction([candidate("document.SALES_INVOICE.title", "Fatura"), candidate("document.SALES_INVOICE.amount", "1000"), candidate("document.SALES_INVOICE.customerNameEvidence", "Atlas")]),
    });
    expect(result).toEqual({ status: "NEEDS_REVIEW", reason: "COUNTERPARTY_AMBIGUOUS", candidateNames: ["Atlas A.Ş.", "Atlas İnşaat"] });
    expect(persistMock).not.toHaveBeenCalled();
  });

  it("SALES_INVOICE: resolved customer ⇒ CREATED, customerId injected as an approved-ready change alongside the extracted fields", async () => {
    resolveCounterpartyMock.mockResolvedValue({ status: "RESOLVED", kind: "CUSTOMER", id: "customer-1", name: "Atlas A.Ş." });
    const result = await buildAndPersistDocumentCandidate({
      ...baseInput, domain: "SALES_INVOICE",
      extraction: extraction([candidate("document.SALES_INVOICE.title", "Fatura"), candidate("document.SALES_INVOICE.amount", "1000"), candidate("document.SALES_INVOICE.customerNameEvidence", "Atlas")]),
    });
    expect(result).toEqual({ status: "CREATED", candidateId: "candidate-1" });
    const persistedInput = persistMock.mock.calls[0]![0];
    expect(persistedInput.propositions[0].targetDomain).toBe("Invoice");
    const fieldPaths = persistedInput.propositions[0].changes.map((c: { fieldPath: string }) => c.fieldPath);
    expect(fieldPaths).toContain("customerId");
    expect(fieldPaths).not.toContain("customerNameEvidence"); // evidence-only field never becomes a mutation field
  });

  it("PURCHASE_INVOICE: supplier resolves but no matching Purchase Order ⇒ NEEDS_REVIEW, never invents a standalone-invoice path", async () => {
    resolveCounterpartyMock.mockResolvedValue({ status: "RESOLVED", kind: "SUPPLIER", id: "supplier-1", name: "Tedarikçi A" });
    resolvePurchaseOrderMock.mockResolvedValue({ status: "NOT_FOUND" });
    const result = await buildAndPersistDocumentCandidate({
      ...baseInput, domain: "PURCHASE_INVOICE",
      extraction: extraction([candidate("document.PURCHASE_INVOICE.supplierInvoiceNumber", "SUP-1"), candidate("document.PURCHASE_INVOICE.supplierNameEvidence", "Tedarikçi"), candidate("document.PURCHASE_INVOICE.poNumberEvidence", "PO-99")]),
    });
    expect(result).toEqual({ status: "NEEDS_REVIEW", reason: "PURCHASE_ORDER_NOT_FOUND" });
    expect(persistMock).not.toHaveBeenCalled();
  });

  it("EXPENSE_RECEIPT: never blocks on an unresolved vendor — proceeds to CREATED with entityResolutionStatus UNRESOLVED", async () => {
    resolveCounterpartyMock.mockResolvedValue({ status: "NOT_FOUND" });
    const result = await buildAndPersistDocumentCandidate({
      ...baseInput, domain: "EXPENSE_RECEIPT",
      extraction: extraction([candidate("document.EXPENSE_RECEIPT.title", "Ofis kirası"), candidate("document.EXPENSE_RECEIPT.category", "RENT"), candidate("document.EXPENSE_RECEIPT.amount", "500"), candidate("document.EXPENSE_RECEIPT.expenseDate", "2026-09-01"), candidate("document.EXPENSE_RECEIPT.supplierNameEvidence", "Bilinmeyen A.Ş.")]),
    });
    expect(result).toEqual({ status: "CREATED", candidateId: "candidate-1" });
    const persistedInput = persistMock.mock.calls[0]![0];
    expect(persistedInput.propositions[0].entityResolutionStatus).toBe("UNRESOLVED");
    const fieldPaths = persistedInput.propositions[0].changes.map((c: { fieldPath: string }) => c.fieldPath);
    expect(fieldPaths).not.toContain("supplierId"); // never guessed
  });

  it("CHEQUE direction RECEIVED resolves a Customer counterparty, never a Supplier", async () => {
    resolveCounterpartyMock.mockResolvedValue({ status: "RESOLVED", kind: "CUSTOMER", id: "customer-1", name: "Atlas A.Ş." });
    await buildAndPersistDocumentCandidate({
      ...baseInput, domain: "CHEQUE",
      extraction: extraction([
        candidate("document.FINANCIAL_INSTRUMENT.instrumentType", "CHEQUE"),
        candidate("document.FINANCIAL_INSTRUMENT.direction", "RECEIVED"),
        candidate("document.FINANCIAL_INSTRUMENT.amount", "2000"),
        candidate("document.FINANCIAL_INSTRUMENT.maturityDate", "2026-12-01"),
        candidate("document.FINANCIAL_INSTRUMENT.counterpartyNameEvidence", "Atlas"),
      ]),
    });
    expect(resolveCounterpartyMock).toHaveBeenCalledWith("org-1", "CUSTOMER", "Atlas");
    const fieldPaths = persistMock.mock.calls[0]![0].propositions[0].changes.map((c: { fieldPath: string }) => c.fieldPath);
    expect(fieldPaths).toContain("customerId");
    expect(fieldPaths).not.toContain("supplierId");
  });

  it("PROMISSORY_NOTE direction ISSUED resolves a Supplier counterparty", async () => {
    resolveCounterpartyMock.mockResolvedValue({ status: "RESOLVED", kind: "SUPPLIER", id: "supplier-1", name: "Tedarikçi A" });
    await buildAndPersistDocumentCandidate({
      ...baseInput, domain: "PROMISSORY_NOTE",
      extraction: extraction([
        candidate("document.FINANCIAL_INSTRUMENT.instrumentType", "PROMISSORY_NOTE"),
        candidate("document.FINANCIAL_INSTRUMENT.direction", "ISSUED"),
        candidate("document.FINANCIAL_INSTRUMENT.amount", "2000"),
        candidate("document.FINANCIAL_INSTRUMENT.maturityDate", "2026-12-01"),
        candidate("document.FINANCIAL_INSTRUMENT.counterpartyNameEvidence", "Tedarikçi"),
      ]),
    });
    expect(resolveCounterpartyMock).toHaveBeenCalledWith("org-1", "SUPPLIER", "Tedarikçi");
  });

  it("EXPENSE_RECEIPT: missing amount ⇒ NEEDS_REVIEW MISSING_CRITICAL_FIELDS, never persists", async () => {
    const result = await buildAndPersistDocumentCandidate({ ...baseInput, domain: "EXPENSE_RECEIPT", extraction: extraction([candidate("document.EXPENSE_RECEIPT.title", "Ofis kirası"), candidate("document.EXPENSE_RECEIPT.category", "RENT")]) });
    expect(result).toEqual({ status: "NEEDS_REVIEW", reason: "MISSING_CRITICAL_FIELDS" });
    expect(persistMock).not.toHaveBeenCalled();
    expect(resolveCounterpartyMock).not.toHaveBeenCalled();
  });

  it("FINANCIAL_INSTRUMENT: missing maturityDate ⇒ NEEDS_REVIEW MISSING_CRITICAL_FIELDS, never resolves a counterparty or persists", async () => {
    const result = await buildAndPersistDocumentCandidate({
      ...baseInput, domain: "CHEQUE",
      extraction: extraction([candidate("document.FINANCIAL_INSTRUMENT.instrumentType", "CHEQUE"), candidate("document.FINANCIAL_INSTRUMENT.direction", "RECEIVED"), candidate("document.FINANCIAL_INSTRUMENT.amount", "1000")]),
    });
    expect(result).toEqual({ status: "NEEDS_REVIEW", reason: "MISSING_CRITICAL_FIELDS" });
    expect(resolveCounterpartyMock).not.toHaveBeenCalled();
    expect(persistMock).not.toHaveBeenCalled();
  });

  it("FINANCIAL_INSTRUMENT: an invalid/garbled direction value ⇒ NEEDS_REVIEW MISSING_CRITICAL_FIELDS rather than guessing RECEIVED or ISSUED", async () => {
    const result = await buildAndPersistDocumentCandidate({
      ...baseInput, domain: "CHEQUE",
      extraction: extraction([candidate("document.FINANCIAL_INSTRUMENT.instrumentType", "CHEQUE"), candidate("document.FINANCIAL_INSTRUMENT.direction", "SIDEWAYS"), candidate("document.FINANCIAL_INSTRUMENT.amount", "1000"), candidate("document.FINANCIAL_INSTRUMENT.maturityDate", "2026-12-01")]),
    });
    expect(result).toEqual({ status: "NEEDS_REVIEW", reason: "MISSING_CRITICAL_FIELDS" });
    expect(persistMock).not.toHaveBeenCalled();
  });

  it("UNKNOWN domain always fails closed to NEEDS_REVIEW without attempting any resolution", async () => {
    const result = await buildAndPersistDocumentCandidate({ ...baseInput, domain: "UNKNOWN", extraction: extraction([]) });
    expect(result).toEqual({ status: "NEEDS_REVIEW", reason: "DOCUMENT_DOMAIN_UNKNOWN" });
    expect(resolveCounterpartyMock).not.toHaveBeenCalled();
    expect(persistMock).not.toHaveBeenCalled();
  });
});
