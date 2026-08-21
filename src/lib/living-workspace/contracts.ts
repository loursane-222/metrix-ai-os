export const WORKSPACE_DOMAINS = ["company", "customer", "supplier", "product", "notification", "task", "calendar", "offer", "payment", "invoice", "accounting", "finance", "team", "goal", "order", "delivery", "stock", "report", "document", "kpi", "production"] as const;
export const WORKSPACE_SURFACES = ["management-summary", "entity-list", "entity-detail", "metric", "timeline", "form", "approval", "empty-data", "error"] as const;
export const WORKSPACE_PRESENTATIONS = ["inline", "split", "focus"] as const;
export type WorkspaceDomain = (typeof WORKSPACE_DOMAINS)[number];
export type WorkspaceSurfaceType = (typeof WORKSPACE_SURFACES)[number];
export type WorkspaceFilter = Readonly<{ field: string; operator: "eq" | "contains" | "gt"; value: string | number | boolean }>;
export type WorkspaceSurfaceDescriptor = Readonly<{
  surfaceId: string; type: WorkspaceSurfaceType; domain: WorkspaceDomain; entityType: string;
  title: string; description?: string; columns?: readonly string[]; filters?: readonly WorkspaceFilter[];
  sort?: Readonly<{ field: string; direction: "asc" | "desc" }>; actions?: readonly string[];
}>;
export type WorkspaceDirective = Readonly<{
  directiveId: string; correlationId: string; source: "written" | "voice" | "system";
  focus: string; title: string; subtitle?: string; domain: WorkspaceDomain; entityType: string; entityId?: string;
  presentationMode: (typeof WORKSPACE_PRESENTATIONS)[number]; surfaces: readonly WorkspaceSurfaceDescriptor[];
  primarySurfaceId: string; replacePolicy: "replace" | "refine"; continuityKey: string;
  generatedAt: string; expiresAt: string; confidence: number; rationaleCode: string; navigationRoute: string;
  permissions: readonly string[]; dataRequirements: readonly string[];
  businessSurface?: "customer-list" | "customer-create" | "customer-detail" | "customer-edit" | "customer-import" | "supplier-list" | "supplier-create" | "supplier-import" | "supplier-detail" | "task-create" | "offer-create" | "offer-edit" | "task-list" | "task-detail" | "offer-list" | "offer-import" | "invoice-list" | "invoice-import" | "payment-list" | "payment-import" | "collection-list" | "product-list" | "product-import" | "goal-list" | "goal-create" | "calendar" | "team-members" | "order-list" | "order-create" | "order-import" | "delivery-list" | "delivery-create" | "stock-list" | "stock-create" | "company-operating" | "document-list" | "kpi-list" | "production-list" | "production-create" | "production-detail";
}>;

export type ActiveWorkspaceContext = Readonly<{
  domain: WorkspaceDomain;
  businessSurface: WorkspaceDirective["businessSurface"] | null;
  entityType: string | null;
  entityId: string | null;
  title: string;
}>;

export function validateActiveWorkspaceContext(value: unknown): ActiveWorkspaceContext | null {
  if (!record(value) || Object.keys(value).some((key) => !ACTIVE_WORKSPACE_CONTEXT_KEYS.has(key))) return null;
  if (!WORKSPACE_DOMAINS.includes(value.domain as WorkspaceDomain) || !text(value.title)) return null;
  if (value.businessSurface !== null && (typeof value.businessSurface !== "string" || !WORKSPACE_BUSINESS_SURFACES.has(value.businessSurface))) return null;
  if (value.entityType !== null && !text(value.entityType)) return null;
  if (value.entityId !== null && !text(value.entityId)) return null;
  return Object.freeze(value as unknown as ActiveWorkspaceContext);
}

export const DOMAIN_RULES = {
  company: { entities: ["Company"], fields: ["summary", "risks", "opportunities", "dataQuality"], routes: ["/metrix/company"], actions: [] },
  customer: { entities: ["Customer"], fields: ["displayName", "legalName", "status", "balanceCents", "currency", "updatedAt"], routes: ["/metrix/customers"], actions: ["open-detail"] },
  supplier: { entities: ["Supplier"], fields: ["displayName", "legalName", "status", "taxNumber", "phone", "email", "score", "onTimeDeliveryRate", "avgLeadTimeDays", "dependencyRiskFlag", "updatedAt"], routes: ["/metrix/suppliers"], actions: ["open-detail"] },
  product: { entities: ["ProductService"], fields: ["name", "type", "category", "priceCents", "costCents", "currency", "status", "stock"], routes: ["/metrix/products"], actions: [] },
  notification: { entities: ["Notification"], fields: ["title", "body", "severity", "type", "isRead", "createdAt"], routes: ["/metrix/notifications"], actions: [] },
  task: { entities: ["Task"], fields: ["title", "description", "dueDate", "priority", "status"], routes: ["/metrix/tasks", "/metrix/tasks/new"], actions: [] },
  calendar: { entities: ["CalendarEvent"], fields: ["title", "startAt", "endAt", "allDay", "status", "recurrenceFrequency", "relatedTaskId", "relatedCustomerId", "relatedOrderId"], routes: ["/metrix/calendar"], actions: [] },
  offer: { entities: ["Quote"], fields: ["customerName", "title", "amount", "currency", "status", "updatedAt"], routes: ["/metrix/offers"], actions: [] },
  payment: { entities: ["Payment"], fields: ["title", "amount", "currency", "status", "dueDate", "createdAt", "invoiceNumber", "invoiceTitle"], routes: ["/metrix/collections"], actions: [] },
  invoice: { entities: ["Invoice"], fields: ["invoiceNumber", "title", "totalAmount", "currency", "status", "dueDate", "paymentCount", "paymentReferences"], routes: ["/metrix/invoices"], actions: [] },
  accounting: { entities: ["AccountingSummary"], fields: ["cashPosition", "totalReceivable", "totalPayable", "monthlyRevenue", "monthlyExpense", "monthlyTaxLiability"], routes: ["/metrix/accounting"], actions: [] },
  finance: { entities: ["FinanceSummary"], fields: ["accountingSummary", "financialHealthIntelligence", "expenseContext", "expenseIntelligence"], routes: ["/metrix/finance"], actions: [] },
  team: { entities: ["OrganizationMember"], fields: ["email", "role", "status", "joinedAt"], routes: ["/metrix/team"], actions: ["invite", "change-role", "disable"] },
  goal: { entities: ["SalesGoal"], fields: ["title", "period", "status", "targetRevenueCents", "targetCollectionCents", "actualValue", "forecastValue", "startsAt", "endsAt"], routes: ["/metrix/goals"], actions: [] },
  order: { entities: ["Order"], fields: ["orderNumber", "status", "fulfillmentSummary", "reservationStatus", "priorityLabel", "priorityExplanation", "deliveryProgressSummary", "revisionHistorySummary", "deadlineAt", "commitmentAt", "currency", "createdAt", "updatedAt"], routes: ["/metrix/orders", "/metrix/orders/new", "/metrix/orders/import"], actions: ["open-detail"] },
  delivery: { entities: ["Delivery"], fields: ["deliveryNumber", "status", "carrier", "integritySummary", "onTimeDeliveryRate", "firstAttemptSuccessRate", "damageRate", "deliveryAddress", "dispatchedAt", "deliveredAt", "createdAt", "updatedAt"], routes: ["/metrix/deliveries", "/metrix/deliveries/new"], actions: ["open-detail"] },
  stock: { entities: ["Stock"], fields: ["productServiceName", "warehouseName", "quantity", "reservedQuantity", "availableQuantity", "status", "lot", "batch", "serialNumber", "location", "healthSummary", "openVarianceCount", "riskSignalCount", "opportunitySignalCount", "createdAt", "updatedAt"], routes: ["/metrix/stock", "/metrix/stock/new"], actions: [] },
  report: { entities: ["ExecutiveReport"], fields: ["reportType", "title", "executiveSummary", "sections", "overallConfidence", "dataQualityNote", "generatedAt"], routes: ["/metrix/reports"], actions: [] },
  document: { entities: ["Document"], fields: ["filename", "mimeType", "sizeBytes", "relatedEntityType", "relatedEntityId", "documentType", "version", "status", "source", "verified", "createdAt", "updatedAt"], routes: ["/metrix/documents"], actions: [] },
  kpi: { entities: ["KpiDefinition"], fields: ["key", "label", "description", "scope", "period", "targetRelation", "active", "version", "rationale", "linkedGoalCount", "createdAt", "updatedAt"], routes: ["/metrix/kpis"], actions: [] },
  production: { entities: ["ProductionOrder"], fields: ["orderNumber", "status", "quantityPlanned", "quantityProduced", "plannedStartAt", "plannedEndAt", "actualStartAt", "actualEndAt", "notes", "createdAt", "updatedAt"], routes: ["/metrix/production", "/metrix/production/new"], actions: ["open-detail"] },
} as const;

export function validateWorkspaceDirective(value: unknown): WorkspaceDirective | null {
  if (!record(value) || Object.keys(value).some((key) => !DIRECTIVE_KEYS.has(key))) return null;
  if (!text(value.directiveId) || !text(value.correlationId) || !["written", "voice", "system"].includes(String(value.source))) return null;
  if (!WORKSPACE_DOMAINS.includes(value.domain as WorkspaceDomain) || !WORKSPACE_PRESENTATIONS.includes(value.presentationMode as never)) return null;
  const rules = DOMAIN_RULES[value.domain as WorkspaceDomain];
  const validRoute = rules.routes.includes(value.navigationRoute as never) || (value.domain === "customer" && /^\/metrix\/customers(?:\/[^/]+(?:\/edit)?)?\/?$/u.test(String(value.navigationRoute))) || (value.domain === "supplier" && /^\/metrix\/suppliers(?:\/(new|import))?\/?$/u.test(String(value.navigationRoute))) || (value.domain === "offer" && /^\/metrix\/offers(?:\/(?:[^/]+\/edit|create\/[^/]+|import))?\/?$/u.test(String(value.navigationRoute))) || (value.domain === "goal" && /^\/metrix\/goals(?:\/(new|[^/]+))?\/?$/u.test(String(value.navigationRoute))) || (value.domain === "stock" && /^\/metrix\/stock(?:\/(new|[^/]+))?\/?$/u.test(String(value.navigationRoute))) || (value.domain === "product" && /^\/metrix\/products\/import\/?$/u.test(String(value.navigationRoute))) || (value.domain === "invoice" && /^\/metrix\/invoices\/import\/?$/u.test(String(value.navigationRoute))) || (value.domain === "payment" && /^\/metrix\/collections\/import\/?$/u.test(String(value.navigationRoute))) || (value.domain === "production" && /^\/metrix\/production(?:\/(new|[^/]+))?\/?$/u.test(String(value.navigationRoute)));
  if (value.businessSurface === "task-create" && value.domain !== "task") return null;
  if (!rules.entities.includes(value.entityType as never) || !validRoute) return null;
  if (!Array.isArray(value.surfaces) || !value.surfaces.length || !value.surfaces.every((surface) => validSurface(surface, value.domain as WorkspaceDomain, value.entityType as string))) return null;
  if (!value.surfaces.some((surface) => record(surface) && surface.surfaceId === value.primarySurfaceId)) return null;
  if (!Array.isArray(value.permissions) || !value.permissions.every(text) || !Array.isArray(value.dataRequirements) || !value.dataRequirements.every(text)) return null;
  if (value.businessSurface !== undefined && !["customer-list", "customer-create", "customer-detail", "customer-edit", "customer-import", "supplier-list", "supplier-create", "supplier-import", "supplier-detail", "task-create", "offer-create", "offer-edit", "task-list", "task-detail", "offer-list", "offer-import", "invoice-list", "invoice-import", "payment-list", "payment-import", "collection-list", "product-list", "product-import", "goal-list", "goal-create", "calendar", "team-members", "order-list", "order-create", "order-import", "delivery-list", "delivery-create", "stock-list", "stock-create", "company-operating", "document-list", "kpi-list", "production-list", "production-create", "production-detail"].includes(String(value.businessSurface))) return null;
  if (!text(value.focus) || !text(value.title) || !text(value.continuityKey) || !text(value.generatedAt) || !text(value.expiresAt) || !text(value.rationaleCode)) return null;
  if (!["replace", "refine"].includes(String(value.replacePolicy)) || typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) return null;
  return Object.freeze(value as unknown as WorkspaceDirective);
}

function validSurface(value: unknown, domain: WorkspaceDomain, entityType: string) {
  if (!record(value) || Object.keys(value).some((key) => !SURFACE_KEYS.has(key))) return false;
  if (!WORKSPACE_SURFACES.includes(value.type as WorkspaceSurfaceType) || value.domain !== domain || value.entityType !== entityType || !text(value.surfaceId) || !text(value.title)) return false;
  const rules = DOMAIN_RULES[domain];
  if (value.columns !== undefined && (!Array.isArray(value.columns) || !value.columns.every((field) => rules.fields.includes(field as never)))) return false;
  if (value.filters !== undefined && (!Array.isArray(value.filters) || !value.filters.every((filter) => record(filter) && rules.fields.includes(filter.field as never) && ["eq", "contains", "gt"].includes(String(filter.operator)) && ["string", "number", "boolean"].includes(typeof filter.value)))) return false;
  if (value.sort !== undefined && (!record(value.sort) || !rules.fields.includes(value.sort.field as never) || !["asc", "desc"].includes(String(value.sort.direction)))) return false;
  return value.actions === undefined || (Array.isArray(value.actions) && value.actions.every((action) => rules.actions.includes(action as never)));
}
const DIRECTIVE_KEYS = new Set(["directiveId","correlationId","source","focus","title","subtitle","domain","entityType","entityId","presentationMode","surfaces","primarySurfaceId","replacePolicy","continuityKey","generatedAt","expiresAt","confidence","rationaleCode","navigationRoute","permissions","dataRequirements","businessSurface"]);
const ACTIVE_WORKSPACE_CONTEXT_KEYS = new Set(["domain", "businessSurface", "entityType", "entityId", "title"]);
const WORKSPACE_BUSINESS_SURFACES = new Set(["customer-list", "customer-create", "customer-detail", "customer-edit", "customer-import", "supplier-list", "supplier-create", "supplier-import", "supplier-detail", "task-create", "offer-create", "offer-edit", "task-list", "task-detail", "offer-list", "offer-import", "invoice-list", "invoice-import", "payment-list", "payment-import", "collection-list", "product-list", "product-import", "goal-list", "goal-create", "calendar", "team-members", "order-list", "order-create", "order-import", "delivery-list", "delivery-create", "stock-list", "stock-create", "company-operating", "document-list", "kpi-list", "production-list", "production-create", "production-detail"]);
const SURFACE_KEYS = new Set(["surfaceId","type","domain","entityType","title","description","columns","filters","sort","actions"]);
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
