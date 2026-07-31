import type { WorkspaceDirective, WorkspaceDomain } from "./contracts";

const CONFIG = {
  company: { entityType: "Company", title: "Şirket Yönetim Özeti", type: "management-summary", route: "/metrix/company", columns: ["summary", "risks", "opportunities", "dataQuality"] },
  customer: { entityType: "Customer", title: "Müşteriler", type: "entity-list", route: "/metrix/customers", columns: ["displayName", "status", "balanceCents", "currency", "updatedAt"] },
  product: { entityType: "ProductService", title: "Ürünler", type: "entity-list", route: "/metrix/products", columns: ["name", "type", "category", "priceCents", "currency", "status", "stock"] },
} as const;

/** Builds a surface only from an already-resolved canonical domain command. It does not interpret user language. */
export function createWorkspaceDirective(input: { domain: WorkspaceDomain; source: "written" | "voice" | "system"; correlationId: string; presentationMode?: "inline" | "split" | "focus"; now?: Date }): WorkspaceDirective {
  const config = CONFIG[input.domain];
  const now = input.now ?? new Date();
  const directiveId = crypto.randomUUID();
  return Object.freeze({ directiveId, correlationId: input.correlationId, source: input.source, focus: `${input.domain}:${config.entityType}`, title: config.title, domain: input.domain, entityType: config.entityType, presentationMode: input.presentationMode ?? "split", surfaces: [Object.freeze({ surfaceId: `${directiveId}:primary`, type: config.type, domain: input.domain, entityType: config.entityType, title: config.title, columns: config.columns, actions: ["open-full-page"] })], primarySurfaceId: `${directiveId}:primary`, replacePolicy: "replace", continuityKey: `${input.domain}:${config.entityType}`, generatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(), confidence: 1, rationaleCode: "CANONICAL_DOMAIN_COMMAND", fullPageRoute: config.route, permissions: [`${input.domain}.read`], dataRequirements: [`canonical:${input.domain}`] });
}
