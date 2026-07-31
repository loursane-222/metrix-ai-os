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
  return Object.freeze({ directiveId, correlationId: input.correlationId, source: input.source, focus: `${input.domain}:${config.entityType}`, title: config.title, domain: input.domain, entityType: config.entityType, presentationMode: input.presentationMode ?? "inline", surfaces: [Object.freeze({ surfaceId: `${directiveId}:primary`, type: config.type, domain: input.domain, entityType: config.entityType, title: config.title, columns: config.columns, actions: ["open-full-page"] })], primarySurfaceId: `${directiveId}:primary`, replacePolicy: "replace", continuityKey: `${input.domain}:${config.entityType}`, generatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(), confidence: 1, rationaleCode: "CANONICAL_DOMAIN_COMMAND", fullPageRoute: config.route, permissions: [`${input.domain}.read`], dataRequirements: [`canonical:${input.domain}`] });
}

/** Projects an already-resolved Customer navigation target into the existing Workspace Directive authority. */
export function createCustomerWorkspaceDirective(input: { route: string; source: "written" | "voice"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  const match = input.route.match(/^\/metrix\/customers(?:\/([^/]+))?(?:\/(edit))?\/?$/u);
  if (!match) return null;
  const entityId = match[1] && match[1] !== "new" ? decodeURIComponent(match[1]) : undefined;
  const businessSurface = match[1] === "new" ? "customer-create" : match[2] === "edit" ? "customer-edit" : entityId ? "customer-detail" : "customer-list";
  const base = createWorkspaceDirective({ domain: "customer", source: input.source, correlationId: input.correlationId, now: input.now });
  const title = businessSurface === "customer-create" ? "Yeni Müşteri" : businessSurface === "customer-edit" ? "Müşteri Düzenle" : businessSurface === "customer-detail" ? "Müşteri" : "Müşteriler";
  return Object.freeze({ ...base, title, focus: entityId ? `customer:Customer:${entityId}` : `customer:${businessSurface}`, entityId, businessSurface, fullPageRoute: input.route });
}
