import type { CanonicalCapabilityResult } from "../agent/turn-result";
import type {
  CalendarView,
  ConnectActionView,
  DocumentView,
  EntityView,
  ListView,
  Presentation,
  PresentationField,
  PresentationRow
} from "./contracts";

const TITLE_BY_CAPABILITY: Record<string, string> = {
  customer_create: "Müşteri",
  customer_lookup: "Müşteriler",
  customer_update: "Müşteri",
  task_create: "Görev",
  task_list: "Görevler",
  task_update: "Görev",
  product_service_lookup: "Ürün ve Hizmetler",
  quote_create: "Teklif",
  quote_lookup: "Teklifler",
  quote_update: "Teklif",
  quote_mark_won: "Teklif",
  order_create_from_quote: "Sipariş",
  order_lookup: "Siparişler",
  invoice_create_from_order: "Fatura",
  invoice_lookup: "Faturalar",
  invoice_receivable_lookup: "Alacaklar",
  receivables_summary: "Alacak Durumu",
  sales_summary: "Satış Özeti",
  collection_record: "Tahsilat",
  collection_lookup: "Tahsilatlar",
  location_create: "Lokasyon",
  location_lookup: "Lokasyonlar",
  supplier_create: "Tedarikçi",
  supplier_lookup: "Tedarikçiler",
  purchase_record: "Satın Alma",
  inventory_transfer: "Stok Transferi",
  inventory_lookup: "Stok",
  transformation_record: "Dönüşüm"
  ,calendar_list: "Takvim", calendar_create: "Takvim", calendar_update: "Takvim"
  ,mail_search: "E-postalar", mail_send: "E-posta"
  ,integration_status: "Bağlantı Durumu", integration_connect: "Bağlantı", integration_disconnect: "Bağlantı"
  ,document_generate: "Belge"
  ,approval_request: "Onay", approval_resolve: "Onay", approval_list: "Onaylar"
  ,notification_create: "Bildirim", notification_mark_read: "Bildirim", notification_list: "Bildirimler"
};

const PRIMARY_KEYS = [
  "name", "title", "invoiceNumber", "orderNumber", "purchaseNumber",
  "settlementId", "email", "productServiceId", "kind"
];
const SECONDARY_KEYS = [
  "totalAmount", "outstanding", "collected", "amount", "quantity",
  "totalCostCents", "status", "collectionState", "direction",
  // Generic display line a capability may supply alongside `title`
  // (already a PRIMARY_KEY) when its natural secondary text is a
  // composed, human-readable summary rather than one raw field.
  "subtitle"
];

// Every foreign/primary-key field in this codebase's canonical results is
// named "id" or ends in "Id" (organizationId, userId, assignedToUserId,
// createdByUserId, productServiceId, sourceId, ...). Excluding by this
// naming convention — never a per-capability list — is what keeps
// internal identifiers out of ordinary generic ENTITY presentations
// centrally, without any component or capability having to hide them
// one at a time. They remain fully present on the canonical result and
// on this same record's own `raw`/`data` — only the human-facing field
// list is filtered.
const INTERNAL_IDENTIFIER_KEY_PATTERN = /^id$|Id$/;

// The only two schedule-anchor fields that exist anywhere in the schema
// today (confirmed against prisma/schema.prisma: Task.dueAt,
// CalendarEvent.startsAt) — used to decide, generically and by data
// shape alone, whether a single result is better shown as a calendar
// spotlight than a raw entity/list row. Adding a schedule anchor to a
// future capability's own result automatically participates in this
// same rule; no capability name is ever checked here.
function scheduleAnchor(
  record: Record<string, unknown>
): string | undefined {
  const candidate = record.dueAt ?? record.startsAt;

  return typeof candidate === "string" &&
    !Number.isNaN(Date.parse(candidate))
    ? candidate
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rowArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function label(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
}

function valueFor(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return undefined;
}

function toRow(raw: Record<string, unknown>): PresentationRow {
  return {
    id: typeof raw.id === "string" ? raw.id : undefined,
    primary: valueFor(raw, PRIMARY_KEYS) ?? (typeof raw.id === "string" ? raw.id : "—"),
    secondary: valueFor(raw, SECONDARY_KEYS),
    raw
  };
}

function scalarFields(record: Record<string, unknown>): PresentationField[] {
  const fields: PresentationField[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    if (INTERNAL_IDENTIFIER_KEY_PATTERN.test(key)) continue;
    if (Array.isArray(value)) fields.push({ label: label(key), value: `${value.length} kayıt` });
    else if (!isRecord(value)) fields.push({ label: label(key), value: String(value) });
  }
  return fields;
}

// A single scheduled item (a created/updated task, or a list narrowed to
// exactly one scheduled result) is more useful shown on the existing
// Calendar day view than as a raw entity/list row — reuses the same
// CalendarView the calendar_list capability already renders with,
// unmodified; no new UI. The event's own startsAt/endsAt stay full ISO
// instants, exactly like calendar_list already produces — the existing
// CalendarPresentationView component is what turns those into local,
// human-readable time, never this projection layer.
function singleEventCalendarView(
  title: string,
  record: Record<string, unknown>,
  anchor: string
): CalendarView {
  const endsAt =
    typeof record.endsAt === "string" &&
    !Number.isNaN(Date.parse(record.endsAt))
      ? record.endsAt
      : anchor;

  return {
    type: "CALENDAR",
    title,
    mode: "DAY",
    referenceDate: anchor,
    events: [
      {
        id: typeof record.id === "string" ? record.id : anchor,
        title: typeof record.title === "string" ? record.title : title,
        startsAt: anchor,
        endsAt,
        allDay: record.allDay === true
      }
    ]
  };
}

// The user-facing meaning of the external calendar's read status. Never
// carries a provider error text or id — only what was and was not
// verified. Nothing is said when the external calendar was read in full,
// or when it is simply not connected and METRIX events are shown.
function calendarNotice(
  externalCalendar: unknown,
  eventCount: number
): string | undefined {
  if (!isRecord(externalCalendar)) return undefined;

  switch (externalCalendar.status) {
    case "READ_FAILED":
      return "Bağlı Google Takvim şu anda doğrulanamadı; yalnızca METRIX takvimi gösteriliyor. Takvimin tamamı doğrulanmış değil.";
    case "READ_PARTIAL":
      return "Bağlı Google Takvim'deki bazı etkinlikler gösterilemiyor; liste eksik olabilir.";
    case "NOT_CONNECTED":
      return eventCount === 0
        ? "Google Takvim bağlı değil; yalnızca METRIX takvimi gösteriliyor."
        : undefined;
    default:
      return undefined;
  }
}

function project(result: CanonicalCapabilityResult): Presentation | null {
  const title = TITLE_BY_CAPABILITY[result.capability];
  if (!title || !isRecord(result.data)) return null;

  if (result.capability === "calendar_list" && rowArray(result.data.events)) {
    const notice = calendarNotice(result.data.externalCalendar, result.data.events.length);
    return {
      type: "CALENDAR",
      title,
      mode: result.data.mode === "WEEK" || result.data.mode === "DAY" ? result.data.mode : "MONTH",
      referenceDate: typeof result.data.referenceDate === "string" ? result.data.referenceDate : new Date().toISOString(),
      events: result.data.events.map(item => ({ id: String(item.id), title: String(item.title), startsAt: String(item.startsAt), endsAt: String(item.endsAt), allDay: item.allDay === true })),
      ...(notice ? { notice } : {})
    };
  }

  if (result.capability === "document_generate" && isRecord(result.data.document)) {
    const document = result.data.document;
    const view: DocumentView = {
      type: "DOCUMENT",
      title,
      artifactId: String(document.artifactId),
      version: Number(document.version),
      previewHtml: String(document.previewHtml)
    };
    return view;
  }

  if (
    result.capability === "integration_connect" &&
    result.data.alreadyConnected !== true &&
    typeof result.data.connectUrl === "string"
  ) {
    const view: ConnectActionView = {
      type: "CONNECT_ACTION",
      title,
      provider: String(result.data.provider ?? ""),
      description: String(result.data.description ?? ""),
      connectUrl: result.data.connectUrl
    };
    return view;
  }

  const list = Object.values(result.data).find(rowArray);
  if (list) {
    // Exactly one scheduled result is a spotlight on that one thing, not
    // a table — e.g. "az önce oluşturduğumuz X görevini göster" narrowing
    // to a single task with a real dueAt. A list of several tasks (some
    // of which happen to have due dates) stays a LIST; this never fires
    // for count !== 1.
    if (list.length === 1) {
      const anchor = scheduleAnchor(list[0]!);

      if (anchor) {
        return singleEventCalendarView(title, list[0]!, anchor);
      }
    }

    const view: ListView = {
      type: "LIST",
      title,
      metrics: [{ label: "Kayıt", value: String(list.length) }],
      rows: list.map(toRow)
    };
    return view;
  }

  const entity = Object.values(result.data).find(isRecord) ?? result.data;

  const entityAnchor = scheduleAnchor(entity);

  if (entityAnchor) {
    return singleEventCalendarView(title, entity, entityAnchor);
  }

  const view: EntityView = {
    type: "ENTITY",
    title,
    fields: scalarFields(entity),
    raw: entity
  };
  return view;
}

export function projectCapabilityResults(
  results: CanonicalCapabilityResult[]
): Presentation[] {
  const presentation = results.map(project).filter((item): item is Presentation => item !== null);
  return presentation.length ? [presentation[presentation.length - 1]!] : [];
}
