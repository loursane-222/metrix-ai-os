// The single shared visual-isolation boundary for every business
// Presentation surface (LIST/ENTITY/METRICS/CHART/CALENDAR/DOCUMENT/...).
// Practically opaque (95% solid, matching the app's own --background
// value) so the METRIX hub's own lines/icons/glow — painted behind these
// surfaces — never show through the content, while staying visually
// identical to METRIX's existing dark card language: same border,
// rounding, width and margin as before. Padding is deliberately not
// included here — it already varies slightly by presentation type
// (LIST/ENTITY use p-4, DOCUMENT/CALENDAR use p-3 sm:p-4) and that
// existing variation is preserved, not unified.
//
// This constant is the one place that decides Presentation-surface
// opacity. It has no bearing on, and is never applied to, the
// conversation/chat surface, the text/voice input bar, or the METRIX
// hub/ecosystem screen — those keep their own existing transparency
// untouched.
export const PRESENTATION_SURFACE_CLASS =
  "mx-auto mt-5 w-full max-w-3xl rounded-2xl border border-white/10 bg-[#0a0a0a]/95";
