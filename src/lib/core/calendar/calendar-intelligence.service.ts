import type { CalendarEventBlockType } from "@prisma/client";
import { ApiValidationError } from "@/lib/api/validation";
import { prisma } from "@/lib/core/shared/prisma";

export const DEFAULT_DAILY_CAPACITY_MINUTES = 480;
const BLOCK_LABELS: Record<CalendarEventBlockType, string> = {
  MEETING: "Toplantıda", FOCUS_TIME: "Odaklanıyor", TRAVEL: "Seyahatte", LEAVE: "İzinli",
  PRODUCTION: "Üretimde", DO_NOT_DISTURB: "Rahatsız Edilmemeli", CUSTOMER_VISIT: "Müşteri Ziyaretinde",
};
const DAY_LABELS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

export async function detectConflicts(input: { organizationId: string; startAt: Date; endAt: Date; participantMemberIds: string[]; participantCustomerIds: string[]; excludeEventId?: string }) {
  if (input.endAt <= input.startAt) throw new ApiValidationError("Bitiş başlangıçtan sonra olmalıdır.");
  if (!input.participantMemberIds.length && !input.participantCustomerIds.length) return [];
  return prisma.calendarEvent.findMany({
    where: {
      organizationId: input.organizationId, status: { not: "CANCELLED" }, ...(input.excludeEventId ? { id: { not: input.excludeEventId } } : {}),
      startAt: { lt: input.endAt }, endAt: { gt: input.startAt },
      participants: { some: { OR: [
        ...(input.participantMemberIds.length ? [{ memberId: { in: input.participantMemberIds } }] : []),
        ...(input.participantCustomerIds.length ? [{ customerId: { in: input.participantCustomerIds } }] : []),
      ] } },
    },
    select: { id: true, title: true, startAt: true, endAt: true, blockType: true, participants: { select: { memberId: true, customerId: true } } },
    orderBy: { startAt: "asc" },
  });
}

export async function computeAvailability(memberId: string, organizationId: string, at: Date) {
  const events = await prisma.calendarEvent.findMany({
    where: { organizationId, status: { not: "CANCELLED" }, startAt: { lte: at }, endAt: { gt: at }, participants: { some: { memberId } } },
    select: { id: true, title: true, startAt: true, endAt: true, blockType: true }, orderBy: { startAt: "asc" },
  });
  if (!events.length) return { status: "AVAILABLE" as const, label: "Müsait", at: at.toISOString(), events: [] };
  const typed = events.find((event) => event.blockType !== null);
  return { status: "BUSY" as const, label: typed?.blockType ? BLOCK_LABELS[typed.blockType] : "Meşgul", at: at.toISOString(), events };
}

export async function computeDailyCapacity(memberId: string, organizationId: string, date: Date) {
  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const events = await prisma.calendarEvent.findMany({ where: { organizationId, status: { not: "CANCELLED" }, startAt: { lt: dayEnd }, endAt: { gt: dayStart }, participants: { some: { memberId } } }, select: { startAt: true, endAt: true } });
  const scheduledMinutes = Math.round(events.reduce((sum, event) => sum + (Math.min(event.endAt.getTime(), dayEnd.getTime()) - Math.max(event.startAt.getTime(), dayStart.getTime())) / 60_000, 0));
  return { date: dayStart.toISOString(), scheduledMinutes, defaultCapacityMinutes: DEFAULT_DAILY_CAPACITY_MINUTES, utilizationPercent: Math.round((scheduledMinutes / DEFAULT_DAILY_CAPACITY_MINUTES) * 100) };
}

export async function computeExecutiveRhythm(memberId: string, organizationId: string, lookbackWeeks = 8) {
  const since = new Date(); since.setDate(since.getDate() - lookbackWeeks * 7);
  const events = await prisma.calendarEvent.findMany({ where: { organizationId, status: { not: "CANCELLED" }, startAt: { gte: since, lt: new Date() }, participants: { some: { memberId } } }, select: { title: true, startAt: true, blockType: true } });
  const groups = new Map<string, { count: number; day: number; hour: number; title: string; blockType: CalendarEventBlockType | null }>();
  for (const event of events) {
    const title = event.title.toLocaleLowerCase("tr-TR").replace(/\d+/gu, "").replace(/\s+/gu, " ").trim();
    const key = `${event.startAt.getDay()}:${event.startAt.getHours()}:${event.blockType ?? "BUSY"}:${title}`;
    const current = groups.get(key); groups.set(key, { count: (current?.count ?? 0) + 1, day: event.startAt.getDay(), hour: event.startAt.getHours(), title: event.title, blockType: event.blockType });
  }
  const notes: Array<string | null> = Array(7).fill(null);
  for (const group of groups.values()) if (group.count >= 3) {
    const activity = group.blockType ? BLOCK_LABELS[group.blockType] : group.title;
    notes[group.day] = `Genelde ${DAY_LABELS[group.day]} günleri saat ${String(group.hour).padStart(2, "0")}:00 civarında ${activity.toLocaleLowerCase("tr-TR")} oluyorsunuz.`;
  }
  return { lookbackWeeks, notes };
}
