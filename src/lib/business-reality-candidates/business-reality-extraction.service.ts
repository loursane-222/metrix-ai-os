import {
  BusinessCandidateOperation,
  BusinessCandidateSourceChannel,
  type Prisma,
} from "@prisma/client";
import { createHash } from "node:crypto";

import { prisma } from "@/lib/core/shared/prisma";
import { persistBusinessPropositions } from "./business-candidate.service";
import type { BusinessProposition } from "./contracts";

type ExtractedProposition = Readonly<{
  propositionType: string;
  targetDomain:
    | "Customer"
    | "CustomerCommercialTerms"
    | "CustomerContact"
    | "ProductService"
    | "ExecutiveAction";
  operation: "CREATE" | "UPDATE" | "ENRICH";
  targetName: string | null;
  confidence: number;
  verificationRequired: boolean;
  changes: readonly Readonly<{ fieldPath: string; proposedValue: unknown }>[];
  taskContext?: Readonly<{
    dueDate: string | null;
    ownerReference: string | null;
  }>;
}>;

type ExtractionEnvelope = Readonly<{
  classification: "BUSINESS_ASSERTION" | "BUSINESS_COMMAND" | "QUESTION" | "HYPOTHETICAL" | "JOKE" | "OTHER";
  propositions: readonly ExtractedProposition[];
}>;

export type GenerateBusinessRealityExtraction = (input: Readonly<{
  systemPrompt: string;
  userMessage: string;
}>) => Promise<string>;

export async function extractAndPersistBusinessCandidates(input: Readonly<{
  organizationId: string;
  conversationId: string;
  sourceMessageId: string;
  sourceChannel: BusinessCandidateSourceChannel;
  sourceAuthority: "USER" | "AI";
  requestId?: string;
  message: string;
  now?: Date;
  generateText: GenerateBusinessRealityExtraction;
}>) {
  if (input.sourceAuthority !== "USER") {
    return Object.freeze({ candidates: [], blockedAiGeneratedCount: 1, classification: "OTHER" as const });
  }

  const extracted = await extractBusinessCandidatePropositions(input);
  if (
    extracted.classification === "HYPOTHETICAL"
    || extracted.classification === "QUESTION"
    || extracted.classification === "JOKE"
  ) {
    return Object.freeze({
      candidates: [],
      blockedAiGeneratedCount: 0,
      classification: extracted.classification,
    });
  }

  const candidates = extracted.propositions.length === 0
    ? []
    : await persistBusinessPropositions({
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        sourceChannel: input.sourceChannel,
        sourceMessageId: input.sourceMessageId,
        sourceInputId: input.sourceMessageId,
        propositions: extracted.propositions,
      });

  return Object.freeze({
    candidates,
    blockedAiGeneratedCount: 0,
    classification: extracted.classification,
  });
}

export async function extractBusinessCandidatePropositions(input: Readonly<{
  organizationId: string;
  sourceMessageId: string;
  message: string;
  requestId?: string;
  now?: Date;
  generateText: GenerateBusinessRealityExtraction;
}>) {
  const envelope = await extractEnvelope(
    input.message,
    input.now ?? new Date(),
    input.generateText,
  );
  if (
    envelope.classification === "HYPOTHETICAL"
    || envelope.classification === "QUESTION"
    || envelope.classification === "JOKE"
  ) {
    return Object.freeze({
      classification: envelope.classification,
      propositions: Object.freeze([]) as readonly BusinessProposition[],
    });
  }
  const propositions = await Promise.all(
    envelope.propositions.map((proposition, index) =>
      resolveProposition(
        input.organizationId,
        input.sourceMessageId,
        input.requestId,
        proposition,
        index,
      )
    ),
  );
  return Object.freeze({
    classification: envelope.classification,
    propositions: Object.freeze(propositions.filter(
      (proposition): proposition is BusinessProposition => proposition !== null,
    )),
  });
}

async function extractEnvelope(
  message: string,
  now: Date,
  generateText: GenerateBusinessRealityExtraction,
): Promise<ExtractionEnvelope> {
  const raw = await generateText({
    systemPrompt: buildExtractionPrompt(now),
    userMessage: message,
  });
  return validateEnvelope(JSON.parse(stripFence(raw)));
}

function buildExtractionPrompt(now: Date): string {
  return [
    "You are the semantic Business Reality proposition extractor.",
    "Return JSON only. Never infer facts not explicitly asserted or commanded by the user.",
    "Questions, jokes and hypotheticals produce zero propositions.",
    "Uncertain assertions may produce propositions with confidence < 0.6 and verificationRequired=true.",
    "Split independent domains into independent propositions. Keep multiple fields for one target together.",
    "Allowed targetDomain values: Customer, CustomerCommercialTerms, CustomerContact, ProductService, ExecutiveAction.",
    "Allowed operations: CREATE, UPDATE, ENRICH.",
    "Field paths must be canonical: currency, commercialTerms.defaultCurrency, commercialTerms.paymentTermDays, primaryContact.fullName, primaryContact.title, name, type, title, reason, dueDate, ownerReference.",
    `Current ISO time: ${now.toISOString()}. Resolve relative dates against this time.`,
    'Shape: {"classification":"BUSINESS_ASSERTION|BUSINESS_COMMAND|QUESTION|HYPOTHETICAL|JOKE|OTHER","propositions":[{"propositionType":"string","targetDomain":"...","operation":"...","targetName":"string|null","confidence":0.0,"verificationRequired":true,"changes":[{"fieldPath":"string","proposedValue":null}],"taskContext":{"dueDate":"ISO|null","ownerReference":"string|null"}}]}',
  ].join("\n");
}

async function resolveProposition(
  organizationId: string,
  sourceMessageId: string,
  requestId: string | undefined,
  proposition: ExtractedProposition,
  index: number,
): Promise<BusinessProposition | null> {
  const canonical = canonicalizeProposition(proposition);
  const resolution = await resolveTarget(organizationId, canonical);
  if (canonical.operation !== "CREATE" && resolution.status === "NOT_FOUND") {
    return {
      ...baseProposition(sourceMessageId, canonical, index),
      targetRecordId: null,
      entityResolutionStatus: "NOT_FOUND",
      verificationRequired: true,
      provenance: provenance(canonical, resolution, requestId),
    };
  }
  return {
    ...baseProposition(sourceMessageId, canonical, index),
    targetRecordId: resolution.recordId,
    entityResolutionStatus: resolution.status,
    verificationRequired:
      canonical.verificationRequired
      || canonical.confidence < 0.6
      || resolution.status === "AMBIGUOUS"
      || resolution.status === "NOT_FOUND"
      || (canonical.operation === "CREATE" && resolution.status === "RESOLVED"),
    provenance: provenance(canonical, resolution, requestId),
  };
}

function canonicalizeProposition(proposition: ExtractedProposition): ExtractedProposition {
  if (proposition.targetDomain !== "ProductService" || !proposition.targetName?.trim()) {
    return proposition;
  }
  const changes = normalizeChanges(proposition);
  const hasName = changes.some((change) => change.fieldPath === "name");
  const hasType = changes.some((change) => change.fieldPath === "type");
  return {
    ...proposition,
    operation: proposition.operation === "ENRICH" ? "ENRICH" : "CREATE",
    changes: [
      ...(hasName ? changes : [{ fieldPath: "name", proposedValue: proposition.targetName }]),
      ...(hasType ? [] : [{ fieldPath: "type", proposedValue: "PRODUCT" }]),
    ],
  };
}

function baseProposition(
  sourceMessageId: string,
  proposition: ExtractedProposition,
  index: number,
): Omit<BusinessProposition, "targetRecordId" | "entityResolutionStatus" | "provenance" | "verificationRequired"> {
  return {
    propositionId: createHash("sha256")
      .update(`${sourceMessageId}\0${index}\0${proposition.targetDomain}`)
      .digest("hex"),
    propositionType: proposition.propositionType,
    targetDomain: proposition.targetDomain,
    operation: BusinessCandidateOperation[proposition.operation],
    confidence: proposition.confidence,
    requiresApproval: true,
    changes: normalizeChanges(proposition).map((change) => ({
      fieldPath: change.fieldPath,
      proposedValue: change.proposedValue,
      confidence: proposition.confidence,
      requiresApproval: true,
    })),
  };
}

function normalizeChanges(
  proposition: ExtractedProposition,
): readonly Readonly<{ fieldPath: string; proposedValue: unknown }>[] {
  const normalized = proposition.changes
    .filter((change) => change.fieldPath !== "ownerReference")
    .map((change) => {
      if (
        proposition.targetDomain === "CustomerCommercialTerms"
        && change.fieldPath === "currency"
      ) {
        return {
          fieldPath: "commercialTerms.defaultCurrency",
          proposedValue: change.proposedValue,
        };
      }
      if (
        proposition.targetDomain === "CustomerCommercialTerms"
        && change.fieldPath === "paymentTermDays"
      ) {
        return {
          fieldPath: "commercialTerms.paymentTermDays",
          proposedValue: change.proposedValue,
        };
      }
      if (
        proposition.targetDomain === "ProductService"
        && ["product", "products", "productName", "displayName"].includes(change.fieldPath)
      ) {
        return {
          fieldPath: "name",
          proposedValue: change.proposedValue,
        };
      }
      return change;
    });
  if (proposition.targetDomain !== "ExecutiveAction") return normalized;
  const byPath = new Map(normalized.map((change) => [change.fieldPath, change]));
  if (proposition.taskContext?.dueDate && !byPath.has("dueDate")) {
    byPath.set("dueDate", {
      fieldPath: "dueDate",
      proposedValue: proposition.taskContext.dueDate,
    });
  }
  if (!byPath.has("ownerType")) {
    byPath.set("ownerType", {
      fieldPath: "ownerType",
      proposedValue: "UNASSIGNED",
    });
  }
  return [...byPath.values()];
}

async function resolveTarget(
  organizationId: string,
  proposition: ExtractedProposition,
): Promise<Readonly<{ status: BusinessProposition["entityResolutionStatus"]; recordId: string | null; candidateIds: readonly string[]; targetVersion: string | null }>> {
  if (proposition.targetDomain === "ExecutiveAction") {
    return { status: "NEW_ENTITY", recordId: null, candidateIds: [], targetVersion: null };
  }
  const targetName = proposition.targetName?.trim();
  if (!targetName) return { status: "UNRESOLVED", recordId: null, candidateIds: [], targetVersion: null };
  const normalized = normalizeName(targetName);

  if (proposition.targetDomain === "ProductService") {
    const records = await prisma.productService.findMany({
      where: { organizationId, status: { not: "ARCHIVED" } },
      select: { id: true, name: true, updatedAt: true },
      take: 100,
    });
    return resolutionFromMatches(
      records.filter((record) => normalizeName(record.name) === normalized),
      proposition.operation,
    );
  }

  const records = await prisma.customer.findMany({
    where: { organizationId, status: { not: "BLOCKED" } },
    select: { id: true, displayName: true, legalName: true, updatedAt: true },
    take: 100,
  });
  return resolutionFromMatches(
    records.filter((record) =>
      normalizeName(record.displayName) === normalized
      || (record.legalName ? normalizeName(record.legalName) === normalized : false)
    ),
    proposition.operation,
  );
}

function resolutionFromMatches(
  records: readonly Readonly<{ id: string; updatedAt: Date }>[],
  operation: ExtractedProposition["operation"],
) {
  const ids = records.map((record) => record.id);
  if (records.length === 1) return { status: "RESOLVED" as const, recordId: records[0]!.id, candidateIds: ids, targetVersion: records[0]!.updatedAt.toISOString() };
  if (records.length > 1) return { status: "AMBIGUOUS" as const, recordId: null, candidateIds: ids, targetVersion: null };
  return operation === "CREATE"
    ? { status: "NEW_ENTITY" as const, recordId: null, candidateIds: [], targetVersion: null }
    : { status: "NOT_FOUND" as const, recordId: null, candidateIds: [], targetVersion: null };
}

function provenance(
  proposition: ExtractedProposition,
  resolution: Readonly<{ status: string; candidateIds: readonly string[]; targetVersion: string | null }>,
  requestId: string | undefined,
): Readonly<Record<string, unknown>> {
  return {
    producer: "semantic-business-reality-extractor.v1",
    requestId: requestId ?? null,
    targetNameHash: proposition.targetName
      ? createHash("sha256").update(normalizeName(proposition.targetName)).digest("hex")
      : null,
    resolutionStatus: resolution.status,
    resolutionCandidateIds: [...resolution.candidateIds],
    targetVersion: resolution.targetVersion,
    taskContext: proposition.taskContext ?? null,
  };
}

function validateEnvelope(value: unknown): ExtractionEnvelope {
  if (!isObject(value) || !Array.isArray(value.propositions)) throw new TypeError("INVALID_REALITY_EXTRACTION");
  const classifications = new Set(["BUSINESS_ASSERTION", "BUSINESS_COMMAND", "QUESTION", "HYPOTHETICAL", "JOKE", "OTHER"]);
  if (typeof value.classification !== "string" || !classifications.has(value.classification)) {
    throw new TypeError("INVALID_REALITY_CLASSIFICATION");
  }
  const propositions = value.propositions.map(validateProposition);
  if (!["BUSINESS_ASSERTION", "BUSINESS_COMMAND"].includes(value.classification) && propositions.length > 0) {
    throw new TypeError("NON_BUSINESS_INPUT_CANNOT_PRODUCE_PROPOSITIONS");
  }
  return { classification: value.classification as ExtractionEnvelope["classification"], propositions };
}

function validateProposition(value: unknown): ExtractedProposition {
  if (!isObject(value) || !Array.isArray(value.changes) || value.changes.length === 0) {
    throw new TypeError("INVALID_BUSINESS_PROPOSITION");
  }
  const domains = new Set(["Customer", "CustomerCommercialTerms", "CustomerContact", "ProductService", "ExecutiveAction"]);
  const operations = new Set(["CREATE", "UPDATE", "ENRICH"]);
  if (
    typeof value.propositionType !== "string"
    || typeof value.targetDomain !== "string"
    || !domains.has(value.targetDomain)
    || typeof value.operation !== "string"
    || !operations.has(value.operation)
    || typeof value.confidence !== "number"
    || value.confidence < 0
    || value.confidence > 1
    || typeof value.verificationRequired !== "boolean"
  ) throw new TypeError("INVALID_BUSINESS_PROPOSITION_FIELDS");
  return {
    propositionType: value.propositionType,
    targetDomain: value.targetDomain as ExtractedProposition["targetDomain"],
    operation: value.operation as ExtractedProposition["operation"],
    targetName: typeof value.targetName === "string" ? value.targetName : null,
    confidence: value.confidence,
    verificationRequired: value.verificationRequired,
    changes: value.changes.map((change) => {
      if (!isObject(change) || typeof change.fieldPath !== "string" || !("proposedValue" in change)) {
        throw new TypeError("INVALID_BUSINESS_CHANGE");
      }
      return { fieldPath: change.fieldPath, proposedValue: change.proposedValue as Prisma.JsonValue };
    }),
    taskContext: isObject(value.taskContext)
      ? {
          dueDate: typeof value.taskContext.dueDate === "string" ? value.taskContext.dueDate : null,
          ownerReference: typeof value.taskContext.ownerReference === "string"
            ? value.taskContext.ownerReference
            : null,
        }
      : undefined,
  };
}

function normalizeName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function stripFence(value: string): string {
  return value.trim().replace(/^```json\s*/u, "").replace(/\s*```$/u, "");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
