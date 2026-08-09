import type { ConversationExtension } from "./conversation-extension-contract";
import { calendarHandoff } from "./conversation-extension-handoff";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";

const DAY_EXPRESSION = "bug[uü]n|yar[ıi]n|pazartesi|sal[ıi]|[çc]ar[şs]amba|per[şs]embe|cuma|cumartesi|pazar";
const SHOW = /^(?:takvimi|program[ıi]m[ıi])\s+g[öo]ster[.!]?$/iu;
const CREATE = new RegExp(`^(${DAY_EXPRESSION})\\s+saat\\s+(\\d{1,2}):(\\d{2})(?:'|’)?(?:te|ta|de|da)?\\s+(.+?)\\s+(?:ekle|ayarla)[.!]?$`, "iu");
const AVAILABILITY = /^(.+?)\s+(?:şu|su)\s+an\s+m(?:üsait|usait)\s+mi\??$/iu;
const DAY_INDEX: Readonly<Record<string, number>> = { pazar: 0, pazartesi: 1, sali: 2, carsamba: 3, persembe: 4, cuma: 5, cumartesi: 6 };

const normalize = (value: string) => value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ğ/g, "g");

function resolveStartAt(expression: string, hours: number, minutes: number, now = new Date()): Date | null {
  if (hours > 23 || minutes > 59) return null;
  const normalized = normalize(expression);
  const startAt = new Date(now);
  startAt.setHours(hours, minutes, 0, 0);
  if (normalized === "bugun") return startAt;
  if (normalized === "yarin") { startAt.setDate(startAt.getDate() + 1); return startAt; }
  const targetDay = DAY_INDEX[normalized];
  if (targetDay === undefined) return null;
  let dayOffset = (targetDay - now.getDay() + 7) % 7;
  if (dayOffset === 0 && startAt.getTime() <= now.getTime()) dayOffset = 7;
  startAt.setDate(startAt.getDate() + dayOffset);
  return startAt;
}

const result = (operation: "CREATE" | "NAVIGATE", code: string, success = true) => ({ status: "HANDOFF" as const, handoff: calendarHandoff({ operation, outcomeCode: code, resultStatus: success ? "EXECUTED" : "CLARIFICATION_REQUIRED", entityResolution: operation === "NAVIGATE" ? "NOT_REQUIRED" : success ? "RESOLVED" : "NOT_FOUND", mutationPerformed: success && operation !== "NAVIGATE", navigationRequested: success, navigationStatus: success ? "COMPLETED" : "NOT_REQUESTED" }) });
function navigate(source: "written" | "voice", correlationId: string) { void dispatchConversationNavigation({ route: "/metrix/calendar", source, correlationId, expectedSurfaceAuthorityKey: "calendar.events.page" }); }

export const calendarManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey: () => typeof window === "undefined" ? null : `calendar:${window.location.pathname}`,
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (SHOW.test(text)) { navigate(source, correlationId); return result("NAVIGATE", "CALENDAR_OPENED"); }
    const availabilityMatch = text.match(AVAILABILITY);
    if (availabilityMatch) {
      const memberResponse = await fetch("/api/organization-members", { credentials: "include" });
      const memberPayload = await memberResponse.json() as { data?: { members?: Array<{ id: string; fullName: string | null; email: string; status: string }> } };
      const requested = normalize(availabilityMatch[1]!.trim());
      const matches = (memberPayload.data?.members ?? []).filter((member) => member.status === "ACTIVE" && normalize(member.fullName ?? member.email).includes(requested));
      if (matches.length !== 1) return { status: "HANDOFF", handoff: calendarHandoff({ operation: "QUERY", outcomeCode: matches.length ? "CALENDAR_MEMBER_AMBIGUOUS" : "CALENDAR_MEMBER_NOT_FOUND", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: matches.length ? "AMBIGUOUS" : "NOT_FOUND", candidateNames: matches.map((member) => member.fullName ?? member.email) }) };
      const member = matches[0]!;
      const response = await fetch(`/api/calendar-events/intelligence?memberId=${encodeURIComponent(member.id)}&at=${encodeURIComponent(new Date().toISOString())}`, { credentials: "include" });
      const payload = await response.json() as { data?: { availability?: { label?: string } } };
      const label = payload.data?.availability?.label;
      if (!response.ok || !label) return { status: "HANDOFF", handoff: calendarHandoff({ operation: "QUERY", outcomeCode: "CALENDAR_AVAILABILITY_QUERY_FAILED", resultStatus: "FAILED", failureCode: "CALENDAR_AVAILABILITY_QUERY_FAILED" }) };
      return { status: "HANDOFF", handoff: calendarHandoff({ operation: "QUERY", outcomeCode: "CALENDAR_AVAILABILITY_FOUND", resultStatus: "OBSERVED", entityResolution: "RESOLVED", candidateNames: [`${member.fullName ?? member.email} - ${label}`] }) };
    }
    const match = text.match(CREATE);
    if (!match) return { status: "NOT_HANDLED", handoff: null };
    const startAt = resolveStartAt(match[1]!, Number(match[2]), Number(match[3]));
    if (!startAt) return result("CREATE", "CALENDAR_DATE_INVALID", false);
    const response = await fetch("/api/calendar-events", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: match[4]!.trim(), startAt: startAt.toISOString(), endAt: new Date(startAt.getTime() + 3_600_000).toISOString() }) });
    if (!response.ok) return result("CREATE", "CALENDAR_CREATE_FAILED", false);
    navigate(source, correlationId);
    return result("CREATE", "CALENDAR_EVENT_CREATED");
  },
};
