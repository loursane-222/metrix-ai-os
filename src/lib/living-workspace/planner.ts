import type { WorkspaceDirective, WorkspaceDomain } from "./contracts";

const CONFIG = {
  company: { entityType: "Company", title: "Şirket Yönetim Özeti", subtitle: "Şirket görünümü", type: "management-summary", route: "/metrix/company", columns: ["summary", "risks", "opportunities", "dataQuality"] },
  customer: { entityType: "Customer", title: "Müşteriler", subtitle: "Aktif müşteri kayıtları", type: "entity-list", route: "/metrix/customers", columns: ["displayName", "status", "balanceCents", "currency", "updatedAt"] },
  supplier: { entityType: "Supplier", title: "Tedarikçi Performansı", subtitle: "Tedarikçi kayıtları", type: "entity-list", route: "/metrix/suppliers", columns: ["displayName", "score", "onTimeDeliveryRate", "avgLeadTimeDays", "dependencyRiskFlag", "updatedAt"] },
  product: { entityType: "ProductService", title: "Ürünler", subtitle: "Ürün ve hizmet kayıtları", type: "entity-list", route: "/metrix/products", columns: ["name", "type", "category", "priceCents", "currency", "status", "stock"] },
  notification: { entityType: "Notification", title: "Bildirimler", subtitle: "Güncel bildirimler", type: "entity-list", route: "/metrix/notifications", columns: ["title", "severity", "type", "isRead", "createdAt"] },
  task: { entityType: "Task", title: "Görevler", subtitle: "Görev kayıtları", type: "entity-list", route: "/metrix/tasks", columns: ["title", "dueDate", "priority", "status"] },
  calendar: { entityType: "CalendarEvent", title: "Takvim", subtitle: "Olaylar, görevler ve vadeler", type: "timeline", route: "/metrix/calendar", columns: ["title", "startAt", "endAt", "allDay", "status", "recurrenceFrequency"] },
  offer: { entityType: "Quote", title: "Teklifler", subtitle: "Teklif kayıtları", type: "entity-list", route: "/metrix/offers", columns: ["customerName", "title", "amount", "status", "updatedAt"] },
  payment: { entityType: "Payment", title: "Tahsilatlar", subtitle: "Tahsilat kayıtları", type: "entity-list", route: "/metrix/collections", columns: ["title", "invoiceNumber", "invoiceTitle", "amount", "currency", "status", "dueDate"] },
  invoice: { entityType: "Invoice", title: "Faturalar", subtitle: "Fatura kayıtları", type: "entity-list", route: "/metrix/invoices", columns: ["invoiceNumber", "title", "totalAmount", "currency", "status", "paymentCount", "paymentReferences", "dueDate"] },
  accounting: { entityType: "AccountingSummary", title: "Finansal Özet", subtitle: "Muhasebe görünümü", type: "management-summary", route: "/metrix/accounting", columns: ["cashPosition", "totalReceivable", "totalPayable", "monthlyRevenue", "monthlyExpense", "monthlyTaxLiability"] },
  finance: { entityType: "FinanceSummary", title: "Finansal Durum", subtitle: "Finansal yönetim görünümü", type: "management-summary", route: "/metrix/finance", columns: ["accountingSummary", "financialHealthIntelligence", "expenseContext", "expenseIntelligence"] },
  team: { entityType: "OrganizationMember", title: "Ekip Yönetimi", subtitle: "Ekip üyeleri", type: "entity-list", route: "/metrix/team", columns: ["email", "role", "status", "joinedAt"] },
  goal: { entityType: "SalesGoal", title: "Hedefler", subtitle: "Şirket hedefleri", type: "entity-list", route: "/metrix/goals", columns: ["title", "period", "status", "targetRevenueCents", "targetCollectionCents", "actualValue", "forecastValue", "startsAt", "endsAt"] },
  order: { entityType: "Order", title: "Siparişler", subtitle: "Sipariş kayıtları", type: "entity-list", route: "/metrix/orders", columns: ["orderNumber", "priorityLabel", "reservationStatus", "fulfillmentSummary", "priorityExplanation", "deliveryProgressSummary", "revisionHistorySummary"] },
  delivery: { entityType: "Delivery", title: "İrsaliyeler", subtitle: "İrsaliye kayıtları", type: "entity-list", route: "/metrix/deliveries", columns: ["deliveryNumber", "carrier", "integritySummary", "onTimeDeliveryRate", "firstAttemptSuccessRate", "damageRate"] },
  stock: { entityType: "Stock", title: "Stok", subtitle: "Stok kayıtları", type: "entity-list", route: "/metrix/stock", columns: ["productServiceName", "warehouseName", "quantity", "reservedQuantity", "availableQuantity", "status", "updatedAt"] },
} as const;

/** Builds a surface only from an already-resolved canonical domain command. It does not interpret user language. */
export function createWorkspaceDirective(input: { domain: WorkspaceDomain; source: "written" | "voice" | "system"; correlationId: string; presentationMode?: "inline" | "split" | "focus"; now?: Date }): WorkspaceDirective {
  const config = CONFIG[input.domain];
  const now = input.now ?? new Date();
  const directiveId = crypto.randomUUID();
  return Object.freeze({ directiveId, correlationId: input.correlationId, source: input.source, focus: `${input.domain}:${config.entityType}`, title: config.title, subtitle: config.subtitle, domain: input.domain, entityType: config.entityType, presentationMode: input.presentationMode ?? "inline", surfaces: [Object.freeze({ surfaceId: `${directiveId}:primary`, type: config.type, domain: input.domain, entityType: config.entityType, title: config.title, columns: config.columns })], primarySurfaceId: `${directiveId}:primary`, replacePolicy: "replace", continuityKey: `${input.domain}:${config.entityType}`, generatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(), confidence: 1, rationaleCode: "CANONICAL_DOMAIN_COMMAND", navigationRoute: config.route, permissions: [`${input.domain}.read`], dataRequirements: [`canonical:${input.domain}`] });
}

/** Projects an already-resolved Task navigation target into the existing Workspace Directive authority. */
export function createTaskWorkspaceDirective(input: { route: string; source: "written" | "voice"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  const match = input.route.match(/^\/metrix\/tasks(?:\/(new|[^/]+))?\/?$/u);
  if (!match) return null;
  const entityId = match[1] && match[1] !== "new" ? decodeURIComponent(match[1]) : undefined;
  const businessSurface = match[1] === "new" ? "task-create" : entityId ? "task-detail" : "task-list";
  const base = createWorkspaceDirective({ domain: "task", source: input.source, correlationId: input.correlationId, now: input.now });
  const title = businessSurface === "task-create" ? "Yeni Görev" : businessSurface === "task-detail" ? "Görev Detayı" : "Görevler";
  const surfaces = entityId ? base.surfaces.map((surface) => Object.freeze({ ...surface, type: "entity-detail" as const, filters: [{ field: "id", operator: "eq" as const, value: entityId }] })) : base.surfaces;
  return Object.freeze({ ...base, title, entityId, surfaces, focus: entityId ? `task:Task:${entityId}` : businessSurface === "task-create" ? "task:task-create" : "task:Task", businessSurface, navigationRoute: input.route });
}

export function createCalendarWorkspaceDirective(input: { source: "written" | "voice" | "system"; correlationId: string; now?: Date }): WorkspaceDirective {
  const base = createWorkspaceDirective({ domain: "calendar", source: input.source, correlationId: input.correlationId, now: input.now });
  return Object.freeze({ ...base, title: "Takvim", subtitle: "Olaylar, görevler ve vadeler", businessSurface: "calendar" as const, navigationRoute: "/metrix/calendar", focus: "calendar:CalendarEvent" });
}

/** Projects an already-resolved Customer navigation target into the existing Workspace Directive authority. */
export function createCustomerWorkspaceDirective(input: { route: string; source: "written" | "voice"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  const match = input.route.match(/^\/metrix\/customers(?:\/([^/]+))?(?:\/(edit))?\/?$/u);
  if (!match) return null;
  const entityId = match[1] && match[1] !== "new" ? decodeURIComponent(match[1]) : undefined;
  const businessSurface = match[1] === "new" ? "customer-create" : match[2] === "edit" ? "customer-edit" : entityId ? "customer-detail" : "customer-list";
  const base = createWorkspaceDirective({ domain: "customer", source: input.source, correlationId: input.correlationId, now: input.now });
  const title = businessSurface === "customer-create" ? "Yeni Müşteri" : businessSurface === "customer-edit" ? "Müşteri Düzenle" : businessSurface === "customer-detail" ? "Müşteri" : "Müşteriler";
  return Object.freeze({ ...base, title, focus: entityId ? `customer:Customer:${entityId}` : `customer:${businessSurface}`, entityId, businessSurface, navigationRoute: input.route });
}

export function createSupplierWorkspaceDirective(input: { route: string; source: "written" | "voice" | "system"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  const match = input.route.match(/^\/metrix\/suppliers(?:\/(new|[^/]+))?\/?$/u); if (!match) return null;
  const entityId = match[1] && match[1] !== "new" ? decodeURIComponent(match[1]) : undefined;
  const businessSurface = match[1] === "new" ? "supplier-create" : entityId ? "supplier-detail" : "supplier-list";
  const base = createWorkspaceDirective({ domain: "supplier", source: input.source, correlationId: input.correlationId, now: input.now });
  return Object.freeze({ ...base, title: businessSurface === "supplier-create" ? "Yeni Tedarikçi" : "Tedarikçiler", entityId, businessSurface, navigationRoute: input.route, focus: entityId ? `supplier:Supplier:${entityId}` : `supplier:${businessSurface}` });
}

/** Projects an already-resolved Offer navigation target into the existing Workspace Directive authority. */
export function createOfferWorkspaceDirective(input: { route: string; source: "written" | "voice"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  const match = input.route.match(/^\/metrix\/offers(?:\/([^/]+)\/edit|\/create\/([^/]+))?\/?$/u);
  if (!match) return null;
  const editQuoteId = match[1] ? decodeURIComponent(match[1]) : undefined;
  const createCustomerId = match[2] ? decodeURIComponent(match[2]) : undefined;
  const businessSurface = editQuoteId ? "offer-edit" : createCustomerId ? "offer-create" : "offer-list";
  const entityId = editQuoteId ?? createCustomerId;
  const base = createWorkspaceDirective({ domain: "offer", source: input.source, correlationId: input.correlationId, now: input.now });
  const title = businessSurface === "offer-edit" ? "Teklif Düzenle" : businessSurface === "offer-create" ? "Yeni Teklif" : "Teklifler";
  const focus = businessSurface === "offer-edit" ? `offer:Quote:${entityId}` : businessSurface === "offer-create" ? `offer:offer-create:${entityId}` : "offer:offers-list";
  return Object.freeze({ ...base, title, focus, entityId, businessSurface, navigationRoute: input.route });
}

/** Projects an already-resolved Payment/Collection navigation target (list only, no detail surface yet) into the existing Workspace Directive authority. */
export function createPaymentWorkspaceDirective(input: { route: string; source: "written" | "voice" | "system"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  const match = input.route.match(/^\/metrix\/collections\/?$/u);
  if (!match) return null;
  const base = createWorkspaceDirective({ domain: "payment", source: input.source, correlationId: input.correlationId, now: input.now });
  return Object.freeze({ ...base, businessSurface: "payment-list" as const, navigationRoute: input.route });
}

/** Projects an already-resolved Invoice navigation target (list only, no detail surface yet) into the existing Workspace Directive authority. */
export function createInvoiceWorkspaceDirective(input: { route: string; source: "written" | "voice"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  const match = input.route.match(/^\/metrix\/invoices\/?$/u);
  if (!match) return null;
  const base = createWorkspaceDirective({ domain: "invoice", source: input.source, correlationId: input.correlationId, now: input.now });
  return Object.freeze({ ...base, businessSurface: "invoice-list" as const, navigationRoute: input.route });
}

export function createNotificationWorkspaceDirective(input: { route: string; source: "written" | "voice"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  if (!/^\/metrix\/notifications\/?$/u.test(input.route)) return null;
  const base = createWorkspaceDirective({ domain: "notification", source: input.source, correlationId: input.correlationId, now: input.now });
  return Object.freeze({ ...base, navigationRoute: input.route });
}

/** Projects the canonical accounting summary route into the existing Workspace Directive authority. */
export function createAccountingWorkspaceDirective(input: { route: string; source: "written" | "voice"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  if (!/^\/metrix\/accounting\/?$/u.test(input.route)) return null;
  const base = createWorkspaceDirective({ domain: "accounting", source: input.source, correlationId: input.correlationId, now: input.now });
  return Object.freeze({ ...base, navigationRoute: input.route });
}

export function createFinanceWorkspaceDirective(input: { route: string; source: "written" | "voice" | "system"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  if (!/^\/metrix\/finance\/?$/u.test(input.route)) return null;
  const base = createWorkspaceDirective({ domain: "finance", source: input.source, correlationId: input.correlationId, now: input.now });
  return Object.freeze({ ...base, navigationRoute: input.route });
}

export function createProductWorkspaceDirective(input: { route: string; source: "written" | "voice" | "system"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  if (!/^\/metrix\/products\/?$/u.test(input.route)) return null;
  const base = createWorkspaceDirective({ domain: "product", source: input.source, correlationId: input.correlationId, now: input.now });
  return Object.freeze({ ...base, businessSurface: "product-list" as const, navigationRoute: input.route });
}

export function createGoalWorkspaceDirective(input: { route: string; source: "written" | "voice" | "system"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  const match = input.route.match(/^\/metrix\/goals(?:\/(new|[^/]+))?\/?$/u);
  if (!match) return null;
  const entityId = match[1] && match[1] !== "new" ? decodeURIComponent(match[1]) : undefined;
  const businessSurface = match[1] === "new" ? "goal-create" : "goal-list";
  const base = createWorkspaceDirective({ domain: "goal", source: input.source, correlationId: input.correlationId, now: input.now });
  return Object.freeze({ ...base, title: businessSurface === "goal-create" ? "Yeni Hedef" : "Hedefler", entityId, businessSurface, navigationRoute: input.route, focus: entityId ? `goal:SalesGoal:${entityId}` : `goal:${businessSurface}` });
}

export function createOrderWorkspaceDirective(input: { route: string; source: "written" | "voice" | "system"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  const match = input.route.match(/^\/metrix\/orders(?:\/(new|[^/]+))?\/?$/u);
  if (!match) return null;
  const entityId = match[1] && match[1] !== "new" ? decodeURIComponent(match[1]) : undefined;
  const businessSurface = match[1] === "new" ? "order-create" : "order-list";
  const base = createWorkspaceDirective({ domain: "order", source: input.source, correlationId: input.correlationId, now: input.now });
  return Object.freeze({ ...base, title: businessSurface === "order-create" ? "Yeni Sipariş" : "Siparişler", entityId, businessSurface, navigationRoute: input.route, focus: entityId ? `order:Order:${entityId}` : `order:${businessSurface}` });
}

export function createDeliveryWorkspaceDirective(input: { route: string; source: "written" | "voice" | "system"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  const match = input.route.match(/^\/metrix\/deliveries(?:\/(new|[^/]+))?\/?$/u);
  if (!match) return null;
  const entityId = match[1] && match[1] !== "new" ? decodeURIComponent(match[1]) : undefined;
  const businessSurface = match[1] === "new" ? "delivery-create" : "delivery-list";
  const base = createWorkspaceDirective({ domain: "delivery", source: input.source, correlationId: input.correlationId, now: input.now });
  return Object.freeze({ ...base, title: businessSurface === "delivery-create" ? "Yeni İrsaliye" : "İrsaliyeler", entityId, businessSurface, navigationRoute: input.route, focus: entityId ? `delivery:Delivery:${entityId}` : `delivery:${businessSurface}` });
}

export function createStockWorkspaceDirective(input: { route: string; source: "written" | "voice" | "system"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  const match = input.route.match(/^\/metrix\/stock(?:\/(new|[^/]+))?\/?$/u);
  if (!match) return null;
  const entityId = match[1] && match[1] !== "new" ? decodeURIComponent(match[1]) : undefined;
  const businessSurface = match[1] === "new" ? "stock-create" : "stock-list";
  const base = createWorkspaceDirective({ domain: "stock", source: input.source, correlationId: input.correlationId, now: input.now });
  return Object.freeze({ ...base, title: businessSurface === "stock-create" ? "Stok Girişi" : "Stok", entityId, businessSurface, navigationRoute: input.route, focus: entityId ? `stock:Stock:${entityId}` : `stock:${businessSurface}` });
}

export function createTeamWorkspaceDirective(input: { route: string; source: "written" | "voice" | "system"; correlationId: string; now?: Date }): WorkspaceDirective | null {
  if (!/^\/metrix\/team\/?$/u.test(input.route)) return null;
  const base = createWorkspaceDirective({ domain: "team", source: input.source, correlationId: input.correlationId, now: input.now, presentationMode: input.source === "system" ? "focus" : "inline" });
  return Object.freeze({ ...base, businessSurface: "team-members" as const, navigationRoute: input.route, permissions: ["members.manage"] });
}

export function createCompanyWorkspaceDirective(input: { source: "written" | "voice" | "system"; correlationId: string; now?: Date }): WorkspaceDirective {
  const base = createWorkspaceDirective({ domain: "company", source: input.source, correlationId: input.correlationId, now: input.now });
  return Object.freeze({ ...base, title: "Şirketim", subtitle: "Canonical Company Reality", businessSurface: "company-operating" as const, navigationRoute: "/metrix/company", focus: "company:CompanyProfile" });
}
