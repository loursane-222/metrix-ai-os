"use client";

import { useEffect, useRef, useState } from "react";

import type {
  CalendarPresentationEvent,
  CalendarView
} from "../../lib/presentation/contracts";

import { PRESENTATION_SURFACE_CLASS } from "./presentation-surface";

import {
  type CalendarMode,
  HOURS_OF_DAY,
  addDays,
  allDayEventsForDay,
  eventsForDay,
  formatHourLabel,
  isSameDay,
  isSameMonth,
  layoutTimedEvents,
  monthGridDays,
  mondayIndex,
  navigateReferenceDate,
  nowIndicatorPercent,
  startOfDay,
  startOfWeek,
  weekDays
} from "./calendar-layout";

const WEEKDAY_SHORT = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];
const WEEKDAY_LONG = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const MONTH_LONG = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

// Fixed row height for one hour on the DAY/WEEK vertical time axis, in
// pixels — real temporal positioning (an event's block position reflects
// its actual time), not a list with a timestamp next to it.
const HOUR_HEIGHT_PX = 48;

function formatTime(date: Date): string {
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function EventChip({ event }: { event: CalendarPresentationEvent }) {
  return (
    <div
      className="truncate rounded-md bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-200 sm:text-[11px]"
      title={event.title}
    >
      {event.allDay ? event.title : `${formatTime(new Date(event.startsAt))} ${event.title}`}
    </div>
  );
}

function NavButton({
  onClick,
  label,
  children
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-sm text-white/60 hover:bg-white/10 hover:text-white"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function CalendarToolbar({
  title,
  heading,
  mode,
  onSetMode,
  onPrev,
  onNext,
  onToday
}: {
  title: string;
  heading: string;
  mode: CalendarMode;
  onSetMode: (mode: CalendarMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span className="text-xs text-white/50">{heading}</span>
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <div className="flex items-center gap-1">
          <NavButton label="Önceki" onClick={onPrev}>‹</NavButton>
          <button
            className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
            onClick={onToday}
            type="button"
          >
            Bugün
          </button>
          <NavButton label="Sonraki" onClick={onNext}>›</NavButton>
        </div>
        <div
          aria-label="Görünüm"
          className="flex rounded-lg border border-white/10 bg-white/[.02] p-0.5"
          role="tablist"
        >
          {(["DAY", "WEEK", "MONTH"] as const).map(candidate => (
            <button
              aria-pressed={mode === candidate}
              className={`rounded-md px-2 py-1 text-xs transition ${
                mode === candidate
                  ? "bg-sky-400/15 text-sky-200"
                  : "text-white/50 hover:text-white"
              }`}
              key={candidate}
              onClick={() => onSetMode(candidate)}
              type="button"
            >
              {candidate === "DAY" ? "Gün" : candidate === "WEEK" ? "Hafta" : "Ay"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HourAxis() {
  return (
    <div className="w-11 shrink-0 sm:w-12">
      {HOURS_OF_DAY.map(hour => (
        <div
          className="border-t border-white/5 pr-1.5 pt-0.5 text-right text-[10px] text-white/35 first:border-t-0"
          key={hour}
          style={{ height: HOUR_HEIGHT_PX }}
        >
          {hour > 0 ? formatHourLabel(hour) : null}
        </div>
      ))}
    </div>
  );
}

function TimedEventBlocks({
  day,
  events
}: {
  day: Date;
  events: CalendarPresentationEvent[];
}) {
  const positioned = layoutTimedEvents(events, day);
  const nowPercent = nowIndicatorPercent(day);

  return (
    <>
      {HOURS_OF_DAY.map(hour => (
        <div
          className="border-t border-white/5 first:border-t-0"
          key={hour}
          style={{ height: HOUR_HEIGHT_PX }}
        />
      ))}
      {positioned.map(positionedEvent => (
        <div
          className="absolute overflow-hidden rounded-md border border-sky-400/30 bg-sky-400/15 px-1.5 py-0.5 text-[10px] text-sky-100 sm:text-[11px]"
          key={positionedEvent.event.id}
          style={{
            top: `${positionedEvent.topPercent}%`,
            height: `calc(${positionedEvent.heightPercent}% - 2px)`,
            left: `calc(${(positionedEvent.column / positionedEvent.columns) * 100}% + 2px)`,
            width: `calc(${100 / positionedEvent.columns}% - 4px)`
          }}
          title={positionedEvent.event.title}
        >
          <span className="block truncate font-medium">
            {positionedEvent.event.title}
          </span>
          <span className="block truncate text-[9px] text-sky-200/70 sm:text-[10px]">
            {formatTime(new Date(positionedEvent.event.startsAt))}
          </span>
        </div>
      ))}
      {nowPercent !== undefined && (
        <div
          className="pointer-events-none absolute left-0 right-0 flex items-center"
          style={{ top: `${nowPercent}%` }}
        >
          <span className="-ml-1 h-2 w-2 shrink-0 rounded-full bg-sky-400" />
          <span className="h-px flex-1 bg-sky-400/80" />
        </div>
      )}
    </>
  );
}

function DayGrid({
  referenceDate,
  events,
  hasNotice
}: {
  referenceDate: Date;
  events: CalendarPresentationEvent[];
  hasNotice: boolean;
}) {
  const day = startOfDay(referenceDate);
  const allDay = allDayEventsForDay(events, day);
  const timedCount = layoutTimedEvents(events, day).length;
  const nowPercent = nowIndicatorPercent(day);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const targetPercent =
      nowPercent !== undefined
        ? Math.max(0, nowPercent - 15)
        : (8 / 24) * 100;

    container.scrollTop = (targetPercent / 100) * container.scrollHeight;
    // Re-run whenever the viewed day changes — a fresh turn's result
    // should scroll to its own relevant time, not wherever the user last
    // scrolled a previous day to.
  }, [day.getTime(), nowPercent]);

  return (
    <div>
      {allDay.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1 border-b border-white/10 pb-2">
          {allDay.map(event => (
            <EventChip event={event} key={event.id} />
          ))}
        </div>
      )}
      <div
        className="relative max-h-[420px] overflow-y-auto rounded-lg border border-white/10 bg-white/[.02]"
        ref={scrollRef}
      >
        <div className="flex" style={{ height: HOURS_OF_DAY.length * HOUR_HEIGHT_PX }}>
          <HourAxis />
          <div className="relative flex-1 border-l border-white/10">
            <TimedEventBlocks day={day} events={events} />
          </div>
        </div>
      </div>
      {allDay.length === 0 && timedCount === 0 && !hasNotice && (
        <p className="mt-2 text-center text-xs text-white/35">
          Bu gün için etkinlik yok.
        </p>
      )}
    </div>
  );
}

function WeekGrid({
  referenceDate,
  events
}: {
  referenceDate: Date;
  events: CalendarPresentationEvent[];
}) {
  const days = weekDays(referenceDate);
  const today = startOfDay(new Date());
  const columnMinWidth = 108;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    container.scrollTop = (8 / 24) * container.scrollHeight;
  }, [days[0]?.getTime()]);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 44 + days.length * columnMinWidth }}>
        <div className="flex">
          <div className="w-11 shrink-0 sm:w-12" />
          {days.map(day => {
            const isToday = isSameDay(day, today);

            return (
              <div
                className="min-w-[108px] flex-1 border-b border-white/10 pb-1.5 text-center"
                key={day.toISOString()}
              >
                <div className="text-[10px] font-medium text-white/40">
                  {WEEKDAY_SHORT[mondayIndex(day)]}
                </div>
                <div
                  className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isToday ? "bg-sky-400 font-semibold text-black" : "text-white/70"
                  }`}
                >
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex max-h-[420px] overflow-y-auto" ref={scrollRef}>
          <HourAxis />
          {days.map(day => (
            <div
              className="relative min-w-[108px] flex-1 border-l border-white/10"
              key={day.toISOString()}
              style={{ height: HOURS_OF_DAY.length * HOUR_HEIGHT_PX }}
            >
              <TimedEventBlocks day={day} events={events} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({
  referenceDate,
  events,
  onSelectDay
}: {
  referenceDate: Date;
  events: CalendarPresentationEvent[];
  onSelectDay: (day: Date) => void;
}) {
  const days = monthGridDays(referenceDate);
  const today = startOfDay(new Date());

  return (
    <div>
      <div className="grid grid-cols-7 text-center text-[10px] font-medium text-white/40 sm:text-xs">
        {WEEKDAY_SHORT.map(day => (
          <div className="py-1.5" key={day}>{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-white/10">
        {days.map(day => {
          const dayEvents = eventsForDay(events, day);
          const inMonth = isSameMonth(day, referenceDate);
          const isToday = isSameDay(day, today);

          return (
            <button
              className={`min-h-[64px] w-full bg-[#0a0a0a] p-1 text-left transition hover:bg-white/[.05] sm:min-h-[88px] sm:p-1.5 ${
                inMonth ? "" : "opacity-35"
              }`}
              key={day.toISOString()}
              onClick={() => onSelectDay(day)}
              type="button"
            >
              <div
                className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                  isToday ? "bg-sky-400 font-semibold text-black" : "text-white/70"
                }`}
              >
                {day.getDate()}
              </div>
              <div className="flex flex-col gap-0.5">
                {dayEvents.slice(0, 3).map(event => (
                  <EventChip event={event} key={event.id} />
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-white/40">
                    +{dayEvents.length - 3} daha
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarPresentationView({
  presentation
}: {
  presentation: CalendarView;
}) {
  const [mode, setMode] = useState<CalendarMode>(presentation.mode);
  const [referenceDate, setReferenceDate] = useState(
    () => new Date(presentation.referenceDate)
  );

  // A fresh canonical result (a new turn) always takes over the view —
  // the calendar reflects what METRIX just did/found, not wherever the
  // user was previously browsing.
  useEffect(() => {
    setMode(presentation.mode);
    setReferenceDate(new Date(presentation.referenceDate));
  }, [presentation.mode, presentation.referenceDate]);

  const heading =
    mode === "MONTH"
      ? `${MONTH_LONG[referenceDate.getMonth()]} ${referenceDate.getFullYear()}`
      : mode === "WEEK"
        ? (() => {
            const start = startOfWeek(referenceDate);
            const end = addDays(start, 6);
            return `${start.getDate()} – ${end.getDate()} ${MONTH_LONG[end.getMonth()]} ${end.getFullYear()}`;
          })()
        : `${referenceDate.getDate()} ${MONTH_LONG[referenceDate.getMonth()]} ${referenceDate.getFullYear()}, ${WEEKDAY_LONG[mondayIndex(referenceDate)]}`;

  return (
    <section
      aria-label={presentation.title}
      className={`${PRESENTATION_SURFACE_CLASS} p-3 sm:p-4`}
    >
      <CalendarToolbar
        heading={heading}
        mode={mode}
        onNext={() =>
          setReferenceDate(current => navigateReferenceDate(current, mode, 1))
        }
        onPrev={() =>
          setReferenceDate(current => navigateReferenceDate(current, mode, -1))
        }
        onSetMode={setMode}
        onToday={() => setReferenceDate(new Date())}
        title={presentation.title}
      />
      {presentation.notice && (
        <p
          className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
          role="status"
        >
          {presentation.notice}
        </p>
      )}
      {mode === "MONTH" && (
        <MonthGrid
          events={presentation.events}
          onSelectDay={day => {
            setReferenceDate(day);
            setMode("DAY");
          }}
          referenceDate={referenceDate}
        />
      )}
      {mode === "WEEK" && (
        <WeekGrid events={presentation.events} referenceDate={referenceDate} />
      )}
      {mode === "DAY" && (
        <DayGrid
          events={presentation.events}
          hasNotice={Boolean(presentation.notice)}
          referenceDate={referenceDate}
        />
      )}
    </section>
  );
}
