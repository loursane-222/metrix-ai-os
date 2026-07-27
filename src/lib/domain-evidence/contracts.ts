export type DomainEvidenceVerificationStatus =
  | "CANONICAL"
  | "USER_CONFIRMED"
  | "AUTHORITY_CONFIRMED";

export type DomainEvidenceType =
  | "ORGANIZATION_RECORD"
  | "CUSTOMER_RECORD"
  | "CUSTOMER_CONTACT_RECORD"
  | "CUSTOMER_COMMERCIAL_TERMS_RECORD"
  | "PRODUCT_RECORD"
  | "QUOTE_RECORD"
  | "PAYMENT_RECORD"
  | "COLLECTION_RECORD"
  | "GOAL_RECORD"
  | "EXECUTIVE_ACTION_RECORD"
  | "EXECUTIVE_ACTION_RESULT"
  | "PRIOR_EXECUTIVE_DECISION"
  | "EXECUTIVE_OUTCOME_RECORD"
  | "VERIFIED_COMPANY_MEMORY";

export type DomainEvidenceV1 = Readonly<{
  evidenceId: string;
  evidenceType: DomainEvidenceType;
  sourceDomain: string;
  sourceRecordId: string;
  organizationId: string;
  observedAt: string;
  verificationStatus: DomainEvidenceVerificationStatus;
  provenance: Readonly<{
    owner: "CANONICAL_DOMAIN_RECORD";
    repository: string;
  }>;
  adapterId: string;
  adapterVersion: "1.0";
  confidence: number;
  effectiveAt?: string;
  summary: string;
  managementCategory:
    | "company"
    | "customers"
    | "personnel"
    | "sales"
    | "finance"
    | "operations"
    | "memory";
}>;

export type DomainEvidenceState = "AVAILABLE" | "EMPTY" | "FAILED";

export type DomainEvidenceAdapterResult = Readonly<{
  sourceDomain: string;
  connected: boolean;
  domainState: DomainEvidenceState;
  evidence: readonly DomainEvidenceV1[];
  reason: string;
}>;

export interface DomainEvidenceAdapter {
  readonly adapterId: string;
  readonly adapterVersion: "1.0";
  readonly sourceDomain: string;
  read(organizationId: string): Promise<DomainEvidenceAdapterResult>;
}
