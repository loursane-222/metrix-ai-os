"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registerCalendarConflictSurfaceTarget, unregisterCalendarConflictSurfaceTarget } from "@/lib/calendar/calendar-command-channel";
import { useDomainWorkspaceClose } from "./DomainWorkspacePresentationContext";

type CalendarItem = { id: string; title: string; dueDate: string; endAt?: string; kind: string; status?: string; allDay?: boolean; canonical: boolean };
type ApiRow = { id: string; title?: string; invoiceNumber?: string; dueDate?: string; status?: string; occurrenceStartAt?: string; occurrenceEndAt?: string; startAt?: string; endAt?: string; allDay?: boolean; kind?: string; provider?: string };
type Member = { id: string; fullName: string | null; email: string; status: string };
type CalendarIntelligence = { availability: { label: string }; capacity: { scheduledMinutes: number; defaultCapacityMinutes: number; utilizationPercent: number }; rhythm: { notes: Array<string | null> } };
// Phase 12: financial-projections is a fifth "borrowed" (canonical=false,
// read-only, non-draggable — see the `canonical` gate in item()/timeline()
// below) source, fetched live and never persisted — see
// calendar-financial-projection.service.ts. It supplies its own `kind` per
// row (Tahsilat/Gider Ödemesi/Kart Ekstresi/Kredi Taksiti/Çek-Senet), so it
// does not need an entry in the kind ternary in load() below. Unlike the
// other borrowed sources it requires the same rangeStart/rangeEnd query
// params as /api/calendar-events, so it's built alongside calendarUrl in
// load() below rather than living in this unparameterized array.
const BORROWED_SOURCES = ["/api/tasks", "/api/invoices", "/api/payments", "/api/collection-actions"];
const STATUS_LABELS: Record<string, string> = { DRAFT: "Taslak", PLANNED: "Planlandı", CONFIRMED: "Onaylandı", CANCELLED: "İptal", POSTPONED: "Ertelendi", COMPLETED: "Tamamlandı", ARCHIVED: "Arşivlendi" };
const localValue = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
// "YYYY-MM-DD" -> local Date at midnight. Parsed manually (not via `new
// Date(string)`) so the day is never shifted by UTC-vs-local interpretation.
const parseFocusDate = (value: string): Date | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

export function CalendarWorkspace({ onReady, requestId, requestedView, requestedDate }: { onReady?: () => void; requestId?: string; requestedView?: "day" | "week" | "month"; requestedDate?: string }) {
  const closeWorkspace = useDomainWorkspaceClose();
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [cursor, setCursor] = useState(() => (requestedDate && parseFocusDate(requestedDate)) || new Date());
  const [selected, setSelected] = useState(() => (requestedDate && parseFocusDate(requestedDate)) || new Date());
  const [view, setView] = useState<"month" | "week" | "day">(() => requestedView ?? "month");
  // Authority for view/date comes from the resolved navigation request
  // (business-navigation.ts), applied once per new request here. Any manual
  // Month/Week/Day switch or day click after that stays entirely owned by
  // this component's own state — this effect never re-fires for the same
  // requestId, so it never overrides a manual switch.
  const appliedRequestRef = useRef<string | undefined>(requestId);
  useEffect(() => {
    if (!requestId || appliedRequestRef.current === requestId) return;
    appliedRequestRef.current = requestId;
    if (requestedView) setView(requestedView);
    const parsed = requestedDate ? parseFocusDate(requestedDate) : null;
    if (parsed) { setSelected(parsed); setCursor(parsed); }
  }, [requestId, requestedView, requestedDate]);
  const [formOpen, setFormOpen] = useState(false); const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState(() => localValue(new Date())); const [endAt, setEndAt] = useState(() => localValue(new Date(Date.now() + 3_600_000))); const [allDay, setAllDay] = useState(false);
  const [members, setMembers] = useState<Member[]>([]); const [memberIds, setMemberIds] = useState<string[]>([]); const [blockType, setBlockType] = useState("");
  const [intelligence, setIntelligence] = useState<CalendarIntelligence | null>(null); const [pendingConflict, setPendingConflict] = useState<{ kind: "create"; body: Record<string, unknown> } | { kind: "move"; eventId: string; body: Record<string, unknown> } | null>(null);
  const range = useMemo(() => ({ start: new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1), end: new Date(cursor.getFullYear(), cursor.getMonth() + 2, 1) }), [cursor]);
  const load = useCallback(async () => {
    const financialProjectionsUrl = `/api/calendar-events/financial-projections?rangeStart=${encodeURIComponent(range.start.toISOString())}&rangeEnd=${encodeURIComponent(range.end.toISOString())}`;
    const calendarUrl = `/api/calendar-events?rangeStart=${encodeURIComponent(range.start.toISOString())}&rangeEnd=${encodeURIComponent(range.end.toISOString())}`;
    const [payloads, memberPayload] = await Promise.all([Promise.all([...BORROWED_SOURCES, financialProjectionsUrl, calendarUrl].map((source) => fetch(source, { credentials: "include" }).then((response) => response.json()).catch(() => null))), fetch("/api/organization-members", { credentials: "include" }).then((response) => response.json()).catch(() => null)]);
    const next: CalendarItem[] = [];
    payloads.forEach((payload, index) => {
      const key = ["tasks", "invoices", "payments", "collectionActions", "financialProjections", "events"][index]!;
      const rows: ApiRow[] | undefined = payload?.data?.[key]; if (!Array.isArray(rows)) return;
      rows.forEach((row) => {
        // canonical (drag/reschedule-eligible) only for native METRIX events —
        // a row.provider ("GOOGLE", set by toWorkspaceCalendarItem in the
        // unified Canonical Calendar Projection) has no native id to PATCH
        // /api/calendar-events/[eventId]/reschedule against; no calendar
        // WRITE exists for non-native sources in this operation.
        if (index === 5) { const dueDate = row.occurrenceStartAt ?? row.startAt; if (dueDate) next.push({ id: row.id, title: row.title ?? "Takvim olayı", dueDate, endAt: row.occurrenceEndAt ?? row.endAt, kind: "Toplantı", status: row.status, allDay: row.allDay, canonical: !row.provider }); return; }
        if (row.dueDate) next.push({ id: row.id, title: row.title ?? row.invoiceNumber ?? "Takip edilecek kayıt", dueDate: row.dueDate, kind: row.kind ?? (key === "tasks" ? "Görev" : key === "invoices" ? "Fatura" : key === "payments" ? "Tahsilat" : "Takip"), status: row.status, canonical: false });
      });
    }); setItems(next); if (Array.isArray(memberPayload?.data?.members)) setMembers(memberPayload.data.members); onReady?.();
  }, [onReady, range]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const memberId = memberIds[0]; if (!memberId) { setIntelligence(null); return; } void fetch(`/api/calendar-events/intelligence?memberId=${encodeURIComponent(memberId)}&at=${encodeURIComponent(new Date(startAt).toISOString())}`, { credentials: "include" }).then((response) => response.json()).then((payload) => payload?.data && setIntelligence(payload.data)).catch(() => setIntelligence(null)); }, [memberIds, startAt]);

  const openCreate = (day: Date) => { const start = new Date(day); start.setHours(9, 0, 0, 0); setSelected(day); setStartAt(localValue(start)); setEndAt(localValue(new Date(start.getTime() + 3_600_000))); setFormOpen(true); };
  const sendCreate = async (body: Record<string, unknown>) => { const response = await fetch("/api/calendar-events", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (response.status === 409) { setPendingConflict({ kind: "create", body }); return; } if (response.ok) { setTitle(""); setFormOpen(false); setPendingConflict(null); await load(); } };
  const create = async () => { if (!title.trim()) return; await sendCreate({ title, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), allDay, blockType: blockType || undefined, participants: memberIds.map((memberId) => ({ memberId })) }); };
  const sendMove = async (eventId: string, body: Record<string, unknown>) => { const response = await fetch(`/api/calendar-events/${encodeURIComponent(eventId)}/reschedule`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (response.status === 409) { setPendingConflict({ kind: "move", eventId, body }); return; } if (response.ok) { setPendingConflict(null); await load(); } };
  const move = async (eventId: string, day: Date) => { const item = items.find((candidate) => candidate.id === eventId && candidate.canonical); if (!item) return; const oldStart = new Date(item.dueDate); const nextStart = new Date(day); nextStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0); const duration = new Date(item.endAt ?? item.dueDate).getTime() - oldStart.getTime(); await sendMove(eventId, { startAt: nextStart.toISOString(), endAt: new Date(nextStart.getTime() + Math.max(duration, 3_600_000)).toISOString() }); };
  const confirmConflict = async () => { if (!pendingConflict) return; if (pendingConflict.kind === "create") await sendCreate({ ...pendingConflict.body, allowConflict: true }); else await sendMove(pendingConflict.eventId, { ...pendingConflict.body, allowConflict: true }); };
  useEffect(() => { const token = registerCalendarConflictSurfaceTarget({ getState: () => ({ pendingConflict }), setPendingConflict: (conflict) => setPendingConflict(conflict as typeof pendingConflict), confirmConflict, discardConflict: () => setPendingConflict(null) }); return () => unregisterCalendarConflictSurfaceTarget(token); }, [confirmConflict, pendingConflict]);
  const key = (day: Date) => localValue(day).slice(0, 10); const selectedKey = key(selected); const dayItems = (day: Date) => items.filter((item) => key(new Date(item.dueDate)) === key(day));
  const days = useMemo(() => { const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1); const offset = firstOfMonth.getDay() === 0 ? 6 : firstOfMonth.getDay() - 1; const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - offset); return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)); }, [cursor]);
  const weekStart = new Date(selected); weekStart.setDate(selected.getDate() - (selected.getDay() === 0 ? 6 : selected.getDay() - 1));
  const weekDays = Array.from({ length: 7 }, (_, index) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index));
  const item = (entry: CalendarItem) => <div className={`calendar-item calendar-status-${entry.status?.toLowerCase() ?? "open"}`} draggable={entry.canonical} key={`${entry.kind}:${entry.id}:${entry.dueDate}`} onDragStart={(event) => entry.canonical && event.dataTransfer.setData("text/calendar-event", entry.id)}><span>{entry.kind}</span><strong>{entry.title}</strong><small>{STATUS_LABELS[entry.status ?? ""] ?? entry.status ?? "Takipte"}</small></div>;
  const todayKey = key(new Date());
  const monthGrid = <div className="approved-calendar-month"><div className="approved-calendar-weekdays">{["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((day) => <span key={day}>{day}</span>)}</div><div className="approved-calendar-days">{days.map((day) => { const dayKey=key(day); return <button className={`${day.getMonth() !== cursor.getMonth() ? "is-outside" : ""} ${dayKey === selectedKey ? "is-selected" : ""} ${dayKey === todayKey ? "is-today" : ""}`} key={day.toISOString()} type="button" onClick={() => setSelected(day)} onDoubleClick={() => openCreate(day)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void move(event.dataTransfer.getData("text/calendar-event"), day)}><time>{day.getDate()}</time>{dayItems(day).slice(0, 3).map((entry) => <span className={entry.canonical ? "approved-calendar-mini is-canonical" : "approved-calendar-mini"} key={`${entry.kind}:${entry.id}`}>{new Intl.DateTimeFormat("tr-TR",{hour:"2-digit",minute:"2-digit"}).format(new Date(entry.dueDate))} {entry.title}</span>)}</button>})}</div></div>;
  const hours = Array.from({ length: 13 }, (_, index) => index + 8);
  const timeline = (timelineDays: Date[]) => <div className="approved-calendar-timeline"><div className="approved-calendar-timeline-head"><span />{timelineDays.map((day) => <button className={key(day) === todayKey ? "is-today" : ""} key={day.toISOString()} onClick={() => setSelected(day)} type="button">{new Intl.DateTimeFormat("tr-TR",{weekday:"short",day:"numeric"}).format(day)}</button>)}</div><div className="approved-calendar-all-day-row"><strong>Tüm gün</strong>{timelineDays.map((day) => <div key={day.toISOString()}>{dayItems(day).filter((entry)=>entry.allDay).map(item)}</div>)}</div><div className="approved-calendar-time-body"><div className="approved-calendar-gutter">{hours.map((hour)=><span key={hour}>{String(hour).padStart(2,"0")}:00</span>)}</div><div className="approved-calendar-time-columns">{timelineDays.map((day)=><div className={key(day)===todayKey?"is-today":""} key={day.toISOString()} onDoubleClick={()=>openCreate(day)} onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>void move(event.dataTransfer.getData("text/calendar-event"),day)}>{dayItems(day).filter((entry)=>!entry.allDay).map((entry)=>{const start=new Date(entry.dueDate);const end=new Date(entry.endAt??new Date(start.getTime()+3_600_000));const top=Math.max(0,((start.getHours()+start.getMinutes()/60)-8)*48);const height=Math.max(28,((end.getTime()-start.getTime())/3_600_000)*48);return <div className={entry.canonical?"approved-calendar-event is-canonical":"approved-calendar-event"} draggable={entry.canonical} key={`${entry.kind}:${entry.id}:${entry.dueDate}`} onDragStart={(event)=>entry.canonical&&event.dataTransfer.setData("text/calendar-event",entry.id)} style={{top,height}}><time>{new Intl.DateTimeFormat("tr-TR",{hour:"2-digit",minute:"2-digit"}).format(start)}</time><strong>{entry.title}</strong></div>})}</div>)}</div></div></div>;
  const form = formOpen ? <div className="calendar-event-form" role="dialog" aria-label="Yeni takvim olayı"><label>Başlık<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Başlangıç<input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></label><label>Bitiş<input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} /></label><label>Blok türü<select value={blockType} onChange={(event) => setBlockType(event.target.value)}><option value="">Genel / belirtilmedi</option><option value="MEETING">Toplantı</option><option value="FOCUS_TIME">Odaklanma</option><option value="TRAVEL">Seyahat</option><option value="LEAVE">İzin</option><option value="PRODUCTION">Üretim</option><option value="DO_NOT_DISTURB">Rahatsız Etmeyin</option><option value="CUSTOMER_VISIT">Müşteri Ziyareti</option></select></label><fieldset><legend>Katılımcılar</legend>{members.filter((member) => member.status === "ACTIVE").map((member) => <label key={member.id}><input type="checkbox" checked={memberIds.includes(member.id)} onChange={(event) => setMemberIds(event.target.checked ? [...memberIds, member.id] : memberIds.filter((id) => id !== member.id))} /> {member.fullName ?? member.email}</label>)}</fieldset>{intelligence ? <div className="calendar-intelligence"><strong>{intelligence.availability.label}</strong><span>{intelligence.capacity.scheduledMinutes} dk · %{intelligence.capacity.utilizationPercent}</span><small>480 dakikalık varsayılan çalışma kapasitesine göre</small></div> : null}<label><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} /> Tüm gün</label><button type="button" onClick={() => void create()}>Oluştur</button><button type="button" onClick={() => setFormOpen(false)}>Vazgeç</button></div> : null;
  const conflict = pendingConflict ? <div className="calendar-conflict" role="alert"><strong>Takvim çakışması bulundu</strong><p>Seçili katılımcının aynı saatlerde başka bir etkinliği var. Yine de devam etmek istiyor musunuz?</p><button type="button" onClick={() => void confirmConflict()}>Çakışmaya rağmen devam et</button><button type="button" onClick={() => setPendingConflict(null)}>Vazgeç</button></div> : null;
  const content = view === "month" ? monthGrid : view === "week" ? timeline(weekDays) : timeline([selected]);
  const navigate = (direction: number) => { if (view === "month") setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+direction,1)); else { const next=new Date(selected); next.setDate(selected.getDate()+direction*(view==="week"?7:1)); setSelected(next); setCursor(next); } };
  const periodLabel = view === "month" ? new Intl.DateTimeFormat("tr-TR",{month:"long",year:"numeric"}).format(cursor) : view === "week" ? `${new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"short"}).format(weekDays[0])} – ${new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"short"}).format(weekDays[6])}` : new Intl.DateTimeFormat("tr-TR",{dateStyle:"full"}).format(selected);
  return <div className="approved-calendar-container" data-approved-calendar-workspace data-calendar-view={view}><section className="approved-calendar-shell"><header className="approved-calendar-header"><h2>Takvim</h2><div className="approved-calendar-controls"><button onClick={()=>{const now=new Date();setSelected(now);setCursor(now)}} type="button">Bugün</button><button aria-label="Önceki dönem" onClick={()=>navigate(-1)} type="button">‹</button><button aria-label="Sonraki dönem" onClick={()=>navigate(1)} type="button">›</button><strong>{periodLabel}</strong><div className="approved-calendar-switch" role="tablist">{(["month","week","day"] as const).map((mode)=><button aria-selected={view===mode} key={mode} onClick={()=>setView(mode)} role="tab" type="button">{mode==="month"?"Ay":mode==="week"?"Hafta":"Gün"}</button>)}</div><button aria-label="Yeni takvim olayı" onClick={()=>openCreate(selected)} type="button">＋</button><button aria-label="Takvimi kapat" onClick={closeWorkspace} type="button">×</button></div></header><div className="approved-calendar-body">{conflict}{form}{content}</div></section></div>;
}
