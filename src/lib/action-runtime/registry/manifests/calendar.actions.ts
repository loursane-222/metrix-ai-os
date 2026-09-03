import type { ActionDefinition } from "../action-registry.types";

const OWNER_MODULE = "calendar";

/**
 * Calendar domaini önceden Action Registry'de HİÇ yoktu ve HTTP route'ları
 * (create/[id] PATCH/status/reschedule) authorizeLegacyMutation'ı bile
 * kullanmıyordu — kanıtlanmış en zayıf-governed bypass (bkz. proje
 * checkpoint'i, Faz 1). requiredPermissionSet burada bilinçli olarak boş
 * bırakılmıştır: bugünkü gerçek yetkilendirme durumu da budur (yalnızca
 * requireAuthContextFromCookies — organizasyon üyeliği yeterli, ayrı bir
 * "calendar.write" permission'ı hiçbir role'e hiçbir yerde tanımlı değil).
 * Registry'ye yeni bir gate eklemek approval/permission boundary'sini
 * DEĞİŞTİRİR; bu yüzden burada mevcut gerçek durum birebir yansıtılır.
 */
export const calendarActionDefinitions: ActionDefinition[] = [
  {
    actionName: "calendar_event.create",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      title: { type: "string", required: true },
      description: { type: "string", required: false },
      startAt: { type: "string", required: true },
      endAt: { type: "string", required: true },
      allDay: { type: "boolean", required: false },
      blockType: { type: "enum", required: false, enumValues: ["MEETING", "FOCUS_TIME", "TRAVEL", "LEAVE", "PRODUCTION", "DO_NOT_DISTURB", "CUSTOMER_VISIT"] },
      relatedTaskId: { type: "string", required: false },
      relatedCustomerId: { type: "string", required: false },
      relatedOrderId: { type: "string", required: false },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: [],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: "calendar_event.status_transition",
  },
  {
    actionName: "calendar_event.update",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      eventId: { type: "string", required: true },
      title: { type: "string", required: false },
      description: { type: "string", required: false },
      allDay: { type: "boolean", required: false },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: [],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: "calendar_event.update",
  },
  {
    actionName: "calendar_event.status_transition",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      eventId: { type: "string", required: true },
      toStatus: { type: "enum", required: true, enumValues: ["DRAFT", "PLANNED", "CONFIRMED", "CANCELLED", "POSTPONED", "COMPLETED", "ARCHIVED"] },
      reason: { type: "string", required: false },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: [],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: false,
    compensationRef: null,
  },
  {
    actionName: "calendar_event.reschedule",
    actionClass: "DOMAIN",
    ownerModule: OWNER_MODULE,
    inputSchema: {
      eventId: { type: "string", required: true },
      startAt: { type: "string", required: true },
      endAt: { type: "string", required: true },
      reason: { type: "string", required: false },
    },
    riskLevelBase: "LOW",
    requiredPermissionSet: [],
    approvalPolicy: "NONE",
    approvalTtlClass: "STANDARD",
    isReversible: true,
    compensationRef: "calendar_event.reschedule",
  },
];
