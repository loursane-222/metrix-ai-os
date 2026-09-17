export type DocumentMetaField = { label: string; value: string };

export type DocumentLineModel = {
  name: string;
  unit: string | null;
  quantity: number;
  unitPriceCents: string;
  vatRateBasisPoints: number;
  lineTotalCents: string;
};

/**
 * Generic canonical document model. Every source type (Quote/Offer,
 * Invoice, and future document kinds) maps its own persisted entity into
 * this one shape; the renderer knows nothing about where the data came
 * from. Sol never constructs this directly — only the deterministic
 * source builders in src/lib/documents/sources do.
 */
export type DocumentModel = {
  kind: string;
  documentTitle: string;
  documentNumber: string;
  organizationName: string;
  customerName: string;
  issuedAt: string;
  currency: string;
  lines: DocumentLineModel[];
  totalCents: string;
  meta: DocumentMetaField[];
  notes: string | null;
};
