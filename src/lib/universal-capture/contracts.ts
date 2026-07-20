import type { ModuleFieldValueType } from "@/lib/field-authority/field-authority";
import type { EntityReference } from "@/lib/executive-request-resolution/entity-resolution.types";

export const CAPTURE_LIMITS = Object.freeze({ candidates: 100, observations: 100, evidence: 20, evidenceText: 300, metadataKeys: 20, metadataText: 200 });
export type CaptureOperation = "CREATE" | "UPDATE" | "ENRICH";
export type CaptureSource = Readonly<{ id: string; category: string; adapter: string; version: string }>;
export type CaptureEvidence = Readonly<{ kind: string; sourceRef?: string; excerpt?: string; observedAt?: string }>;
export type EntityHint = Readonly<{ entityType: string; reference?: string; identifiers?: Readonly<Record<string, string>>; createIfMissing?: boolean }>;
export type FieldHint = Readonly<{ fieldId?: string; key?: string; label?: string; valueType?: ModuleFieldValueType }>;
export type CaptureFieldCandidateInput = Readonly<{ candidateId: string; field: FieldHint; rawValue: unknown; confidence: number; evidence?: readonly CaptureEvidence[]; warnings?: readonly string[]; explicit: boolean; observedAt: string }>;
export type CanonicalCaptureEnvelope = Readonly<{ captureId: string; correlationId: string; sessionRef?: string; conversationRef?: string; source: CaptureSource; sourceRef?: string; occurredAt: string; receivedAt: string; transport?: Readonly<Record<string, string | number | boolean>>; entityHints: readonly EntityHint[]; observations: readonly Readonly<{ kind: string; value: string; evidence?: readonly CaptureEvidence[] }>[]; fieldCandidates: readonly CaptureFieldCandidateInput[]; requestedOperation: CaptureOperation; explicitCommitIntent: boolean; adapterMetadata: Readonly<{ name: string; version: string }> }>;
export type TrustedCaptureContext = Readonly<{ organizationId: string; actorId: string; permissions: readonly string[] }>;

export type EntityResolutionStatus = "RESOLVED" | "NEW_ENTITY" | "AMBIGUOUS" | "NOT_FOUND" | "CONFLICT" | "UNSUPPORTED";
export type CaptureEntityCandidate = Readonly<{ reference: EntityReference; displayName?: string; score: number; evidence: readonly CaptureEvidence[] }>;
export type CaptureEntityResolution = Readonly<{ status: EntityResolutionStatus; entityType: string; reference: EntityReference | null; candidates: readonly CaptureEntityCandidate[]; confidence: number; evidence: readonly CaptureEvidence[]; reasonCodes: readonly string[] }>;
export type EntityResolutionProvider = Readonly<{ entityType: string; resolve(input: Readonly<{ context: TrustedCaptureContext; hint: EntityHint; operation: CaptureOperation }>): Promise<CaptureEntityResolution>; readBaseline?(input: Readonly<{ context: TrustedCaptureContext; reference: EntityReference }>): Promise<Readonly<Record<string, unknown>>> }>;

export type FieldResolutionStatus = "RESOLVED" | "AMBIGUOUS" | "UNKNOWN" | "READ_ONLY" | "FORBIDDEN" | "DEPRECATED" | "TYPE_INCOMPATIBLE";
export type ValidationState = "VALID" | "INVALID";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type ConfidenceDisposition = "AUTO_DRAFT" | "ASK_SHORT_CONFIRMATION" | "SUGGEST" | "REQUIRE_EXPLICIT_CONFIRMATION" | "REQUIRE_APPROVAL" | "REJECT";
export type ConfidenceDecision = Readonly<{ score: number; level: ConfidenceLevel; reasons: readonly string[]; disposition: ConfidenceDisposition }>;
export type ConflictStatus = "NO_CONFLICT" | "SAME_VALUE" | "ADD_MISSING" | "UPDATE_PROPOSED" | "CONFIRMATION_REQUIRED" | "APPROVAL_REQUIRED" | "AMBIGUOUS" | "REJECTED";
export type ResolvedCaptureCandidate = Readonly<{ candidateId: string; captureId: string; entityRef: EntityReference | null; fieldId: string; fieldLabel: string; rawValue: unknown; normalizedValue: unknown; confidence: ConfidenceDecision; evidence: readonly CaptureEvidence[]; warnings: readonly string[]; validationState: ValidationState; conflictStatus: ConflictStatus; decisionState: ConfidenceDisposition; requiresConfirmation: boolean; requiresApproval: boolean; observedAt: string }>;
export type DraftOperation = Readonly<{ kind: "SET" | "CLEAR"; fieldId: string; value: unknown }>;
export type DeltaStatus = "ADDED" | "UPDATED" | "CLEARED" | "UNCHANGED" | "CONFLICTED" | "REJECTED" | "PENDING_CONFIRMATION" | "PENDING_APPROVAL";
export type DeltaItem = Readonly<{ fieldId: string; label: string; previousValue?: unknown; nextValue?: unknown; status: DeltaStatus; display: Readonly<{ sensitivity: "PUBLIC" | "INTERNAL" | "SENSITIVE"; redactValue: boolean }> }>;
export type CaptureDelta = Readonly<{ added: readonly DeltaItem[]; updated: readonly DeltaItem[]; cleared: readonly DeltaItem[]; unchanged: readonly DeltaItem[]; conflicted: readonly DeltaItem[]; rejected: readonly DeltaItem[]; pendingConfirmation: readonly DeltaItem[]; pendingApproval: readonly DeltaItem[] }>;
export type UniversalCaptureResult = Readonly<{ captureId: string; status: "DRAFT_READY" | "REVIEW_REQUIRED" | "REJECTED" | "NO_CHANGE"; entityResolution: CaptureEntityResolution; resolvedCandidates: readonly ResolvedCaptureCandidate[]; unresolvedCandidates: readonly Readonly<{ candidateId: string; status: FieldResolutionStatus; reason: string }>[]; rejectedCandidates: readonly Readonly<{ candidateId: string; reason: string }>[]; conflicts: readonly ResolvedCaptureCandidate[]; draftOperations: readonly DraftOperation[]; approvalRequirements: readonly Readonly<{ fieldId: string; reason: string }>[]; delta: CaptureDelta; userInteraction: "NONE" | "CONFIRMATION" | "APPROVAL" | "CLARIFICATION"; lifecycle: Readonly<{ phase: string; safeSummary: string; candidateCount: number }>; noOpReason?: string; duplicate: boolean }>;

export type CaptureIdempotencyStore = { get(captureId: string, organizationId: string): UniversalCaptureResult | undefined; set(captureId: string, organizationId: string, result: UniversalCaptureResult): void };
