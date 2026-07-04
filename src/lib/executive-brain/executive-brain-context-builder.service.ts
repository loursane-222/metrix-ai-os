import { PersonType, type Event, type Organization, type Person } from "@prisma/client";

import { listActiveMemoryItemsByOrganization } from "@/lib/core/memory-items/memory-item.service";
import type { MemoryItemResult } from "@/lib/core/memory-items/memory-item.types";
import { prisma } from "@/lib/core/shared/prisma";

import type {
  BuildExecutiveBrainContextInput,
  ExecutiveBrainContext,
  ExecutiveBrainSignal,
  ExecutiveBrainSourceReliability,
  ExecutiveBrainSourceReliabilityLevel,
} from "./executive-brain.types";

const DEFAULT_MAX_MEMORY_ITEMS = 50;
const DEFAULT_MAX_PEOPLE = 50;
const DEFAULT_MAX_EVENTS = 75;

type AdapterResult = {
  signals: {
    ownerSignals?: ExecutiveBrainSignal[];
    companySignals?: ExecutiveBrainSignal[];
    customerSignals?: ExecutiveBrainSignal[];
    personnelSignals?: ExecutiveBrainSignal[];
    salesSignals?: ExecutiveBrainSignal[];
    financeSignals?: ExecutiveBrainSignal[];
    operationsSignals?: ExecutiveBrainSignal[];
    memorySignals?: ExecutiveBrainSignal[];
  };
  reliability: ExecutiveBrainSourceReliability;
};

export async function buildExecutiveBrainContext(
  input: BuildExecutiveBrainContextInput = {},
): Promise<ExecutiveBrainContext> {
  const now = input.now ?? new Date();
  const organizationId = input.organizationId?.trim();

  if (!organizationId) {
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
      sourceReliability: [
        buildReliability({
          source: "organization",
          connected: false,
          reliability: "UNAVAILABLE",
          signalCount: 0,
          reason: "organizationId was not provided.",
        }),
      ],
    };
  }

  const [
    organizationAdapter,
    memoryAdapter,
    peopleAdapter,
    eventAdapter,
  ] = await Promise.all([
    readOrganizationSignals(organizationId),
    readMemorySignals(organizationId, clampLimit(input.maxMemoryItems, DEFAULT_MAX_MEMORY_ITEMS)),
    readPeopleSignals(organizationId, clampLimit(input.maxPeople, DEFAULT_MAX_PEOPLE)),
    readEventSignals(organizationId, clampLimit(input.maxEvents, DEFAULT_MAX_EVENTS)),
  ]);

  return mergeAdapterResults(now, [
    organizationAdapter,
    memoryAdapter,
    peopleAdapter,
    eventAdapter,
    buildUnavailableAdapter("quotes", "No quote repository or schema model exists yet."),
    buildUnavailableAdapter(
      "payments_collections",
      "No payment or collection repository/schema model exists yet.",
    ),
    buildUnavailableAdapter(
      "jobs_work_schedule",
      "No job or work schedule repository/schema model exists yet.",
    ),
  ]);
}

async function readOrganizationSignals(
  organizationId: string,
): Promise<AdapterResult> {
  try {
    const organization = await prisma.organization.findUnique({
      where: {
        id: organizationId,
      },
    });

    if (!organization) {
      return {
        signals: {
          companySignals: [],
        },
        reliability: buildReliability({
          source: "organization",
          connected: true,
          reliability: "LOW",
          signalCount: 0,
          reason: "Organization was not found.",
        }),
      };
    }

    const signals = mapOrganizationToSignals(organization);

    return {
      signals: {
        companySignals: signals,
      },
      reliability: buildReliability({
        source: "organization",
        connected: true,
        reliability: signals.length > 0 ? "HIGH" : "LOW",
        signalCount: signals.length,
        reason: "Read-only organization profile fields were loaded.",
      }),
    };
  } catch {
    return buildFailedAdapter("organization");
  }
}

async function readMemorySignals(
  organizationId: string,
  maxItems: number,
): Promise<AdapterResult> {
  try {
    const memoryItems = await listActiveMemoryItemsByOrganization(organizationId);
    const signals = memoryItems.slice(0, maxItems).map(mapMemoryItemToSignal);

    return {
      signals: {
        memorySignals: signals,
      },
      reliability: buildReliability({
        source: "memory",
        connected: true,
        reliability: signals.length > 0 ? "HIGH" : "LOW",
        signalCount: signals.length,
        reason: "Active memory items were loaded read-only.",
      }),
    };
  } catch {
    return buildFailedAdapter("memory");
  }
}

async function readPeopleSignals(
  organizationId: string,
  maxPeople: number,
): Promise<AdapterResult> {
  try {
    const people = await prisma.person.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: maxPeople,
    });
    const customerSignals = people
      .filter((person) => person.type === PersonType.CUSTOMER)
      .map(mapCustomerPersonToSignal);
    const personnelSignals = people
      .filter((person) => person.type === PersonType.EMPLOYEE)
      .map(mapEmployeePersonToSignal);

    return {
      signals: {
        customerSignals,
        personnelSignals,
      },
      reliability: buildReliability({
        source: "people",
        connected: true,
        reliability: people.length > 0 ? "MEDIUM" : "LOW",
        signalCount: people.length,
        reason: "People records were loaded read-only.",
      }),
    };
  } catch {
    return buildFailedAdapter("people");
  }
}

async function readEventSignals(
  organizationId: string,
  maxEvents: number,
): Promise<AdapterResult> {
  try {
    const events = await prisma.event.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: maxEvents,
    });

    const financeSignals = events
      .filter(isFinanceEvent)
      .map((event) => mapEventToSignal(event, "finance_event"));
    const salesSignals = events
      .filter(isSalesEvent)
      .map((event) => mapEventToSignal(event, "sales_event"));
    const operationsSignals = events
      .filter(isOperationsEvent)
      .map((event) => mapEventToSignal(event, "operations_event"));

    return {
      signals: {
        financeSignals,
        salesSignals,
        operationsSignals,
      },
      reliability: buildReliability({
        source: "events",
        connected: true,
        reliability: events.length > 0 ? "MEDIUM" : "LOW",
        signalCount: events.length,
        reason: "Organization events were loaded read-only and categorized.",
      }),
    };
  } catch {
    return buildFailedAdapter("events");
  }
}

function mergeAdapterResults(
  now: string | Date,
  adapters: AdapterResult[],
): ExecutiveBrainContext {
  return {
    now,
    ownerSignals: mergeSignals(adapters, "ownerSignals"),
    companySignals: mergeSignals(adapters, "companySignals"),
    customerSignals: mergeSignals(adapters, "customerSignals"),
    personnelSignals: mergeSignals(adapters, "personnelSignals"),
    salesSignals: mergeSignals(adapters, "salesSignals"),
    financeSignals: mergeSignals(adapters, "financeSignals"),
    operationsSignals: mergeSignals(adapters, "operationsSignals"),
    memorySignals: mergeSignals(adapters, "memorySignals"),
    sourceReliability: adapters.map((adapter) => adapter.reliability),
  };
}

function mergeSignals(
  adapters: AdapterResult[],
  key: keyof AdapterResult["signals"],
): ExecutiveBrainSignal[] {
  return adapters.flatMap((adapter) => adapter.signals[key] ?? []);
}

function mapOrganizationToSignals(
  organization: Organization,
): ExecutiveBrainSignal[] {
  return [
    buildSignal("organization", "name", organization.name, 0.95, organization.id),
    buildSignal(
      "organization",
      "industry",
      organization.industry,
      0.85,
      organization.id,
    ),
    buildSignal(
      "organization",
      "company_size",
      organization.companySize,
      0.8,
      organization.id,
    ),
    buildSignal("organization", "city", organization.city, 0.85, organization.id),
    buildSignal(
      "organization",
      "description",
      organization.description,
      0.7,
      organization.id,
    ),
  ].filter(isSignalPresent);
}

function mapMemoryItemToSignal(memoryItem: MemoryItemResult): ExecutiveBrainSignal {
  return {
    id: memoryItem.id,
    key: memoryItem.key,
    value: memoryItem.value,
    category: memoryItem.type,
    source: `memory:${memoryItem.source}`,
    confidence: normalizeStoredConfidence(memoryItem.confidence),
    createdAt: memoryItem.updatedAt.toISOString(),
    evidenceRef: `memory:${memoryItem.id}`,
  };
}

function mapCustomerPersonToSignal(person: Person): ExecutiveBrainSignal {
  return {
    id: person.id,
    key: "customer_record",
    value: buildPersonValue(person),
    category: person.type,
    source: "people",
    confidence: 0.65,
    createdAt: person.updatedAt.toISOString(),
    evidenceRef: `people:${person.id}`,
  };
}

function mapEmployeePersonToSignal(person: Person): ExecutiveBrainSignal {
  return {
    id: person.id,
    key: "employee_record",
    value: buildPersonValue(person),
    category: person.type,
    source: "people",
    confidence: 0.65,
    createdAt: person.updatedAt.toISOString(),
    evidenceRef: `people:${person.id}`,
  };
}

function mapEventToSignal(event: Event, key: string): ExecutiveBrainSignal {
  return {
    id: event.id,
    key,
    value: buildEventValue(event),
    category: event.eventType,
    source: `event:${event.source}`,
    confidence: 0.55,
    createdAt: event.createdAt.toISOString(),
    evidenceRef: `event:${event.id}`,
  };
}

function buildPersonValue(person: Person): string {
  return [person.fullName, person.title, person.notes].filter(Boolean).join(" - ");
}

function buildEventValue(event: Event): string {
  return [
    event.eventType,
    event.entityType,
    event.entityId,
    stringifyPayload(event.payload),
  ]
    .filter(Boolean)
    .join(" - ");
}

function stringifyPayload(payload: unknown): string {
  if (payload === null || payload === undefined) {
    return "";
  }

  if (typeof payload === "string") {
    return payload;
  }

  if (typeof payload === "number" || typeof payload === "boolean") {
    return String(payload);
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

function isFinanceEvent(event: Event): boolean {
  return hasAnyTerm(event, [
    "payment",
    "collection",
    "invoice",
    "cash",
    "debt",
    "receivable",
    "tahsilat",
    "odeme",
    "fatura",
    "nakit",
    "borc",
    "alacak",
  ]);
}

function isSalesEvent(event: Event): boolean {
  return hasAnyTerm(event, [
    "quote",
    "proposal",
    "sales",
    "deal",
    "customer",
    "order",
    "teklif",
    "satis",
    "musteri",
    "siparis",
  ]);
}

function isOperationsEvent(event: Event): boolean {
  return hasAnyTerm(event, [
    "job",
    "work",
    "schedule",
    "delivery",
    "operation",
    "task",
    "is",
    "plan",
    "teslimat",
    "operasyon",
    "gorev",
  ]);
}

function hasAnyTerm(event: Event, terms: string[]): boolean {
  const text = normalizeText(
    [
      event.eventType,
      event.entityType,
      event.entityId,
      stringifyPayload(event.payload),
    ]
      .filter(Boolean)
      .join(" "),
  );

  return terms.some((term) => text.includes(normalizeText(term)));
}

function buildSignal(
  source: string,
  key: string,
  value: string | null | undefined,
  confidence: number,
  id: string,
): ExecutiveBrainSignal {
  return {
    id,
    key,
    value: value ?? "",
    source,
    confidence,
    evidenceRef: `${source}:${key}:${id}`,
  };
}

function isSignalPresent(signal: ExecutiveBrainSignal): boolean {
  return Boolean(signal.value?.trim());
}

function buildUnavailableAdapter(source: string, reason: string): AdapterResult {
  return {
    signals: {},
    reliability: buildReliability({
      source,
      connected: false,
      reliability: "UNAVAILABLE",
      signalCount: 0,
      reason,
    }),
  };
}

function buildFailedAdapter(source: string): AdapterResult {
  return {
    signals: {},
    reliability: buildReliability({
      source,
      connected: false,
      reliability: "UNAVAILABLE",
      signalCount: 0,
      reason: "Read-only adapter failed and returned a graceful fallback.",
    }),
  };
}

function buildReliability(input: {
  source: string;
  connected: boolean;
  reliability: ExecutiveBrainSourceReliabilityLevel;
  signalCount: number;
  reason: string;
}): ExecutiveBrainSourceReliability {
  return {
    source: input.source,
    connected: input.connected,
    reliability: input.reliability,
    signalCount: input.signalCount,
    confidence: reliabilityToConfidence(input.reliability, input.signalCount),
    reason: input.reason,
  };
}

function reliabilityToConfidence(
  reliability: ExecutiveBrainSourceReliabilityLevel,
  signalCount: number,
): number {
  if (reliability === "UNAVAILABLE") {
    return 0;
  }

  if (reliability === "LOW") {
    return signalCount > 0 ? 0.35 : 0.2;
  }

  if (reliability === "MEDIUM") {
    return signalCount > 0 ? 0.65 : 0.45;
  }

  return signalCount > 0 ? 0.9 : 0.7;
}

function normalizeStoredConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) {
    return 0.5;
  }

  return Math.min(1, Math.max(0, confidence / 100));
}

function clampLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(200, Math.floor(value)));
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}
