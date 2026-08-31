import type { BusinessCandidateChangeProposal, BusinessProposition } from "@/lib/business-reality-candidates/contracts";
import { persistBusinessPropositions } from "@/lib/business-reality-candidates/business-candidate.service";
import type { StructuredFieldCandidate, StructuredExtractionPayload } from "@/lib/field-authority/structured-field-ingestion";
import type { DocumentDomain } from "./document-classifier";
import { resolveCounterpartyForDocument, resolvePurchaseOrderForDocument } from "./document-counterparty-resolution";

export type DocumentCandidateBuildResult =
  | { status: "CREATED"; candidateId: string }
  | { status: "NEEDS_REVIEW"; reason: string; candidateNames?: readonly string[] };

type BuildInput = {
  organizationId: string;
  actorId: string;
  conversationId?: string | null;
  attachmentId: string;
  domain: DocumentDomain;
  extraction: StructuredExtractionPayload;
};

function fieldValue(extraction: StructuredExtractionPayload, fieldId: string): string | null {
  const candidate = extraction.candidates.find((item) => item.fieldId === fieldId);
  return typeof candidate?.normalizedValue === "string" && candidate.normalizedValue.trim() ? candidate.normalizedValue.trim() : null;
}

function nonEvidenceChanges(extraction: StructuredExtractionPayload, domain: string): BusinessCandidateChangeProposal[] {
  return extraction.candidates
    .filter((candidate): candidate is StructuredFieldCandidate => candidate.fieldId.startsWith(`document.${domain}.`) && !candidate.fieldId.endsWith("Evidence"))
    .map((candidate) => ({
      fieldPath: candidate.fieldId.slice(`document.${domain}.`.length),
      proposedValue: typeof candidate.normalizedValue === "string" ? candidate.normalizedValue : String(candidate.normalizedValue ?? ""),
      confidence: candidate.confidence,
    }));
}

async function persist(input: BuildInput, proposition: Omit<BusinessProposition, "propositionId" | "propositionType">): Promise<DocumentCandidateBuildResult> {
  const [candidate] = await persistBusinessPropositions({
    organizationId: input.organizationId,
    conversationId: input.conversationId ?? undefined,
    sourceChannel: "OCR",
    sourceMessageId: undefined,
    sourceInputId: `document-attachment:${input.attachmentId}`,
    propositions: [{
      propositionId: `document-attachment:${input.attachmentId}`,
      propositionType: "DOCUMENT_EXTRACTION",
      ...proposition,
    }],
  });
  return { status: "CREATED", candidateId: candidate!.id };
}

export async function buildAndPersistDocumentCandidate(input: BuildInput): Promise<DocumentCandidateBuildResult> {
  switch (input.domain) {
    case "SALES_INVOICE": return buildSalesInvoiceCandidate(input);
    case "PURCHASE_INVOICE": return buildPurchaseInvoiceCandidate(input);
    case "EXPENSE_RECEIPT": return buildExpenseReceiptCandidate(input);
    case "CHEQUE":
    case "PROMISSORY_NOTE": return buildFinancialInstrumentCandidate(input);
    case "UNKNOWN": return { status: "NEEDS_REVIEW", reason: "DOCUMENT_DOMAIN_UNKNOWN" };
  }
}

async function buildSalesInvoiceCandidate(input: BuildInput): Promise<DocumentCandidateBuildResult> {
  const { extraction } = input;
  if (!fieldValue(extraction, "document.SALES_INVOICE.title") || !fieldValue(extraction, "document.SALES_INVOICE.amount")) {
    return { status: "NEEDS_REVIEW", reason: "MISSING_CRITICAL_FIELDS" };
  }
  const evidence = fieldValue(extraction, "document.SALES_INVOICE.customerNameEvidence");
  const resolution = await resolveCounterpartyForDocument(input.organizationId, "CUSTOMER", evidence);
  if (resolution.status === "NO_EVIDENCE") return { status: "NEEDS_REVIEW", reason: "COUNTERPARTY_EVIDENCE_MISSING" };
  if (resolution.status === "AMBIGUOUS") return { status: "NEEDS_REVIEW", reason: "COUNTERPARTY_AMBIGUOUS", candidateNames: resolution.candidateNames };
  if (resolution.status === "NOT_FOUND") return { status: "NEEDS_REVIEW", reason: "COUNTERPARTY_NOT_FOUND" };

  const changes = nonEvidenceChanges(extraction, "SALES_INVOICE");
  changes.push({ fieldPath: "customerId", proposedValue: resolution.id, confidence: 1 });
  return persist(input, {
    targetDomain: "Invoice",
    targetRecordId: null,
    entityResolutionStatus: "RESOLVED",
    operation: "CREATE",
    provenance: { source: "document-intelligence", attachmentId: input.attachmentId, domain: "SALES_INVOICE" },
    changes,
  });
}

async function buildPurchaseInvoiceCandidate(input: BuildInput): Promise<DocumentCandidateBuildResult> {
  const { extraction } = input;
  if (!fieldValue(extraction, "document.PURCHASE_INVOICE.supplierInvoiceNumber")) {
    return { status: "NEEDS_REVIEW", reason: "MISSING_CRITICAL_FIELDS" };
  }
  const supplierEvidence = fieldValue(extraction, "document.PURCHASE_INVOICE.supplierNameEvidence");
  const supplierResolution = await resolveCounterpartyForDocument(input.organizationId, "SUPPLIER", supplierEvidence);
  if (supplierResolution.status === "NO_EVIDENCE") return { status: "NEEDS_REVIEW", reason: "COUNTERPARTY_EVIDENCE_MISSING" };
  if (supplierResolution.status === "AMBIGUOUS") return { status: "NEEDS_REVIEW", reason: "COUNTERPARTY_AMBIGUOUS", candidateNames: supplierResolution.candidateNames };
  if (supplierResolution.status === "NOT_FOUND") return { status: "NEEDS_REVIEW", reason: "COUNTERPARTY_NOT_FOUND" };

  const poEvidence = fieldValue(extraction, "document.PURCHASE_INVOICE.poNumberEvidence");
  const poResolution = await resolvePurchaseOrderForDocument(input.organizationId, supplierResolution.id, poEvidence);
  if (poResolution.status !== "RESOLVED") {
    // No standalone purchaseInvoice.create action exists — fail closed
    // rather than inventing one. The reviewer must ensure a matching
    // PurchaseOrder exists (poNumber on the document must match an
    // existing PO for this supplier) and retry extraction.
    return { status: "NEEDS_REVIEW", reason: poResolution.status === "NO_EVIDENCE" ? "PURCHASE_ORDER_EVIDENCE_MISSING" : poResolution.status === "AMBIGUOUS" ? "PURCHASE_ORDER_AMBIGUOUS" : "PURCHASE_ORDER_NOT_FOUND" };
  }

  const changes = nonEvidenceChanges(extraction, "PURCHASE_INVOICE");
  changes.push({ fieldPath: "purchaseOrderId", proposedValue: poResolution.purchaseOrderId, confidence: 1 });
  return persist(input, {
    targetDomain: "PurchaseInvoice",
    targetRecordId: null,
    entityResolutionStatus: "RESOLVED",
    operation: "CREATE",
    provenance: { source: "document-intelligence", attachmentId: input.attachmentId, domain: "PURCHASE_INVOICE" },
    changes,
  });
}

async function buildExpenseReceiptCandidate(input: BuildInput): Promise<DocumentCandidateBuildResult> {
  const { extraction } = input;
  if (!fieldValue(extraction, "document.EXPENSE_RECEIPT.title") || !fieldValue(extraction, "document.EXPENSE_RECEIPT.category") || !fieldValue(extraction, "document.EXPENSE_RECEIPT.amount") || !fieldValue(extraction, "document.EXPENSE_RECEIPT.expenseDate")) {
    return { status: "NEEDS_REVIEW", reason: "MISSING_CRITICAL_FIELDS" };
  }
  // Expense.supplierId is optional (free-text vendorName always covers the
  // vendor) — a supplier is only attached when it resolves unambiguously;
  // no NEEDS_REVIEW block on an unresolved vendor for this domain.
  const evidence = fieldValue(extraction, "document.EXPENSE_RECEIPT.supplierNameEvidence");
  const resolution = evidence ? await resolveCounterpartyForDocument(input.organizationId, "SUPPLIER", evidence) : { status: "NO_EVIDENCE" as const };

  const changes = nonEvidenceChanges(extraction, "EXPENSE_RECEIPT");
  if (resolution.status === "RESOLVED") changes.push({ fieldPath: "supplierId", proposedValue: resolution.id, confidence: 1 });
  return persist(input, {
    targetDomain: "Expense",
    targetRecordId: null,
    entityResolutionStatus: resolution.status === "RESOLVED" ? "RESOLVED" : "UNRESOLVED",
    operation: "CREATE",
    provenance: { source: "document-intelligence", attachmentId: input.attachmentId, domain: "EXPENSE_RECEIPT" },
    changes,
  });
}

async function buildFinancialInstrumentCandidate(input: BuildInput): Promise<DocumentCandidateBuildResult> {
  const { extraction } = input;
  const direction = fieldValue(extraction, "document.FINANCIAL_INSTRUMENT.direction");
  if (!fieldValue(extraction, "document.FINANCIAL_INSTRUMENT.instrumentType") || (direction !== "RECEIVED" && direction !== "ISSUED") || !fieldValue(extraction, "document.FINANCIAL_INSTRUMENT.amount") || !fieldValue(extraction, "document.FINANCIAL_INSTRUMENT.maturityDate")) {
    return { status: "NEEDS_REVIEW", reason: "MISSING_CRITICAL_FIELDS" };
  }
  const evidence = fieldValue(extraction, "document.FINANCIAL_INSTRUMENT.counterpartyNameEvidence");
  // RECEIVED (this company holds it) ⇒ counterparty is a Customer who paid
  // with it; ISSUED (this company wrote it) ⇒ counterparty is a Supplier it
  // was paid to — mirrors financialInstrument.register's own customerId
  // XOR supplierId direction convention (Phase 10/11).
  const kind = direction === "RECEIVED" ? "CUSTOMER" : "SUPPLIER";
  const resolution = await resolveCounterpartyForDocument(input.organizationId, kind, evidence);
  if (resolution.status === "NO_EVIDENCE") return { status: "NEEDS_REVIEW", reason: "COUNTERPARTY_EVIDENCE_MISSING" };
  if (resolution.status === "AMBIGUOUS") return { status: "NEEDS_REVIEW", reason: "COUNTERPARTY_AMBIGUOUS", candidateNames: resolution.candidateNames };
  if (resolution.status === "NOT_FOUND") return { status: "NEEDS_REVIEW", reason: "COUNTERPARTY_NOT_FOUND" };

  const changes = nonEvidenceChanges(extraction, "FINANCIAL_INSTRUMENT");
  changes.push({ fieldPath: kind === "CUSTOMER" ? "customerId" : "supplierId", proposedValue: resolution.id, confidence: 1 });
  return persist(input, {
    targetDomain: "FinancialInstrument",
    targetRecordId: null,
    entityResolutionStatus: "RESOLVED",
    operation: "CREATE",
    provenance: { source: "document-intelligence", attachmentId: input.attachmentId, domain: input.domain },
    changes,
  });
}
