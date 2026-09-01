import { readCanonicalDomainEvidence } from "@/lib/domain-evidence";
import type {
  DomainEvidenceAdapterResult,
  DomainEvidenceV1,
} from "@/lib/domain-evidence";

import type {
  BuildExecutiveBrainContextInput,
  ExecutiveBrainContext,
  ExecutiveBrainSignal,
  ExecutiveBrainSourceReliability,
} from "./executive-brain.types";

type SignalKey =
  | "companySignals"
  | "customerSignals"
  | "personnelSignals"
  | "salesSignals"
  | "financeSignals"
  | "operationsSignals"
  | "memorySignals";

const CATEGORY_TO_SIGNAL_KEY: Readonly<Record<
  DomainEvidenceV1["managementCategory"],
  SignalKey
>> = {
  company: "companySignals",
  customers: "customerSignals",
  personnel: "personnelSignals",
  sales: "salesSignals",
  finance: "financeSignals",
  operations: "operationsSignals",
  memory: "memorySignals",
};

/**
 * Canonical management context projection.
 *
 * Event, Message, Conversation, prompt text, telemetry and keyword matches are
 * structurally absent from this boundary. Only DomainEvidenceV1 produced by a
 * canonical repository adapter can become a management signal.
 */
export async function buildExecutiveBrainContext(
  input: BuildExecutiveBrainContextInput = {},
  onAdapterTiming?: (
    stage: "executive_brain_context_domain_evidence",
    phase: "start" | "end",
    elapsedMs: number,
    success: boolean,
    errorReason: string,
  ) => void,
): Promise<ExecutiveBrainContext> {
  const now = input.now ?? new Date();
  const organizationId = input.organizationId?.trim();

  if (!organizationId) {
    return emptyContext(now, [{
      source: "domain_evidence",
      reliability: "UNAVAILABLE",
      confidence: 0,
      connected: false,
      domainState: "FAILED",
      reason: "organizationId was not provided.",
      signalCount: 0,
    }]);
  }

  const startedAt = performance.now();
  onAdapterTiming?.("executive_brain_context_domain_evidence", "start", 0, true, "NONE");
  const adapters = await readCanonicalDomainEvidence(organizationId, input.organizationMembershipRole ?? undefined, {
    now: now instanceof Date ? now : new Date(now),
    timeZone: input.timeZone,
  });
  const success = adapters.every((adapter) => adapter.connected);
  onAdapterTiming?.(
    "executive_brain_context_domain_evidence",
    "end",
    Math.round(performance.now() - startedAt),
    success,
    success ? "NONE" : "ADAPTER_FAILURE",
  );

  const signals: Record<SignalKey, ExecutiveBrainSignal[]> = {
    companySignals: [],
    customerSignals: [],
    personnelSignals: [],
    salesSignals: [],
    financeSignals: [],
    operationsSignals: [],
    memorySignals: [],
  };

  for (const adapter of adapters) {
    for (const item of adapter.evidence) {
      signals[CATEGORY_TO_SIGNAL_KEY[item.managementCategory]].push(
        evidenceToSignal(item),
      );
    }
  }

  return {
    now,
    ownerSignals: [],
    ...signals,
    sourceReliability: adapters.map(adapterReliability),
    domainEvidence: adapters.flatMap((adapter) => adapter.evidence),
  };
}

function evidenceToSignal(item: DomainEvidenceV1): ExecutiveBrainSignal {
  return {
    id: item.sourceRecordId,
    key: item.evidenceType.toLowerCase(),
    value: item.summary,
    category: item.sourceDomain,
    source: `domain:${item.sourceDomain}`,
    confidence: item.confidence,
    createdAt: item.observedAt,
    evidenceRef: item.evidenceId,
    evidenceType: item.evidenceType,
    sourceDomain: item.sourceDomain,
    sourceRecordId: item.sourceRecordId,
    organizationId: item.organizationId,
    observedAt: item.observedAt,
    verificationStatus: item.verificationStatus,
    provenance: item.provenance,
    adapterId: item.adapterId,
    adapterVersion: item.adapterVersion,
  };
}

function adapterReliability(
  adapter: DomainEvidenceAdapterResult,
): ExecutiveBrainSourceReliability {
  return {
    source: adapter.sourceDomain,
    connected: adapter.connected,
    domainState: adapter.domainState,
    reliability: adapter.connected ? "HIGH" : "UNAVAILABLE",
    confidence: adapter.connected ? 0.9 : 0,
    signalCount: adapter.evidence.length,
    reason: adapter.reason,
  };
}

function emptyContext(
  now: string | Date,
  sourceReliability: ExecutiveBrainSourceReliability[],
): ExecutiveBrainContext {
  return {
    now,
    ownerSignals: [],
    companySignals: [],
    customerSignals: [],
    personnelSignals: [],
    salesSignals: [],
    financeSignals: [],
    operationsSignals: [],
    memorySignals: [],
    sourceReliability,
    domainEvidence: [],
  };
}
