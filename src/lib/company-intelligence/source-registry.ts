import { prisma } from "@/lib/core/shared/prisma";
import type {
  AuthoritativeScopeRule,
  ConnectorCapabilityDescriptor,
  ConnectorConnectionMode,
  ConnectorProvider,
  ConnectorSourceDescriptor,
  ConnectorSourceHealth,
  ConnectorSourceStatus,
  ConnectorSourceType,
} from "./types";

type ConnectorSourceRow = {
  id: string;
  organizationId: string;
  sourceKey: string;
  sourceType: string;
  provider: string;
  displayName: string;
  status: string;
  connectionMode: string;
  capabilities: unknown;
  authoritativeScopes: unknown;
  health: unknown;
  lastObservedAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  metadata: unknown;
};

function toDescriptor(row: ConnectorSourceRow): ConnectorSourceDescriptor {
  return {
    id: row.id,
    organizationId: row.organizationId,
    sourceKey: row.sourceKey,
    sourceType: row.sourceType as ConnectorSourceType,
    provider: row.provider as ConnectorProvider,
    displayName: row.displayName,
    status: row.status as ConnectorSourceStatus,
    connectionMode: row.connectionMode as ConnectorConnectionMode,
    capabilities: Array.isArray(row.capabilities) ? (row.capabilities as ConnectorCapabilityDescriptor[]) : [],
    authoritativeScopes: Array.isArray(row.authoritativeScopes) ? (row.authoritativeScopes as AuthoritativeScopeRule[]) : [],
    health: (row.health as ConnectorSourceHealth | null) ?? null,
    lastObservedAt: row.lastObservedAt?.toISOString() ?? null,
    lastSuccessfulSyncAt: row.lastSuccessfulSyncAt?.toISOString() ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

export type RegisterSourceInput = {
  readonly organizationId: string;
  readonly sourceKey: string;
  readonly sourceType: ConnectorSourceType;
  readonly provider: ConnectorProvider;
  readonly displayName: string;
  readonly connectionMode: ConnectorConnectionMode;
  readonly capabilities: readonly ConnectorCapabilityDescriptor[];
  readonly authoritativeScopes: readonly AuthoritativeScopeRule[];
  readonly status?: ConnectorSourceStatus;
  readonly metadata?: Record<string, unknown>;
};

/**
 * Upsert on (organizationId, sourceKey) — bootstrap (see
 * native-source-bootstrap.ts) and connect/reconnect flows can call this
 * idempotently without a separate "does it already exist" check.
 */
export async function registerSource(input: RegisterSourceInput): Promise<ConnectorSourceDescriptor> {
  const row = await prisma.connectorSource.upsert({
    where: { organizationId_sourceKey: { organizationId: input.organizationId, sourceKey: input.sourceKey } },
    create: {
      organizationId: input.organizationId,
      sourceKey: input.sourceKey,
      sourceType: input.sourceType,
      provider: input.provider,
      displayName: input.displayName,
      connectionMode: input.connectionMode,
      capabilities: input.capabilities as object,
      authoritativeScopes: input.authoritativeScopes as object,
      status: input.status ?? "ACTIVE",
      metadata: input.metadata as object | undefined,
    },
    update: {
      sourceType: input.sourceType,
      provider: input.provider,
      displayName: input.displayName,
      connectionMode: input.connectionMode,
      capabilities: input.capabilities as object,
      authoritativeScopes: input.authoritativeScopes as object,
      ...(input.status ? { status: input.status } : {}),
      ...(input.metadata ? { metadata: input.metadata as object } : {}),
    },
  });
  return toDescriptor(row);
}

export async function getSourceById(organizationId: string, sourceId: string): Promise<ConnectorSourceDescriptor | null> {
  const row = await prisma.connectorSource.findFirst({ where: { id: sourceId, organizationId } });
  return row ? toDescriptor(row) : null;
}

export async function getSourceByKey(organizationId: string, sourceKey: string): Promise<ConnectorSourceDescriptor | null> {
  const row = await prisma.connectorSource.findUnique({ where: { organizationId_sourceKey: { organizationId, sourceKey } } });
  return row ? toDescriptor(row) : null;
}

export async function listSources(organizationId: string): Promise<readonly ConnectorSourceDescriptor[]> {
  const rows = await prisma.connectorSource.findMany({ where: { organizationId } });
  return rows.map(toDescriptor);
}

export async function recordSourceHealth(organizationId: string, sourceId: string, health: ConnectorSourceHealth): Promise<void> {
  await prisma.connectorSource.update({
    where: { id: sourceId, organizationId },
    data: { health: health as object, lastObservedAt: new Date(health.checkedAt) },
  });
}

/** Structural eligibility only — does this source claim to serve this fact scope at all. Truth Authority decides who wins. */
export function sourceSupportsFactScope(source: ConnectorSourceDescriptor, factScope: string, applicability: "READ" | "WRITE"): boolean {
  const descriptor = source.capabilities.find((c) => c.id === factScope);
  if (!descriptor) return false;
  return applicability === "READ" ? descriptor.read : descriptor.write;
}

export function isSourceHealthy(source: ConnectorSourceDescriptor): boolean {
  return source.status === "ACTIVE" && source.health?.status !== "UNAVAILABLE";
}
