# Stage 2 — Executive Awareness / Always-On Watch

Canonical flow: `EVENT → EVIDENCE → (single Executive Agent) JUDGMENT → LIFECYCLE → DELIVERY`.

## Components

- **Observation**: `src/lib/executive-autonomous-watch/executive-autonomous-watch-evidence.service.ts` —
  adapts the existing deterministic `executive-alerts` engine (via
  `buildExecutiveOperatingContext`) into `AwarenessEvidenceEnvelope[]`. No judgment.
- **Judgment**: `src/lib/executive-agent/awareness-judgment.ts` (`runAwarenessJudgment`) —
  headless invocation of the same canonical Executive Agent (same constitution,
  same model) used by chat. One bounded call per organization per watch cycle;
  skipped entirely when there is no evidence. Returns `AwarenessJudgment[]`
  (`disposition`, `significance`, `confidence`, `insight`, `category`, …).
- **Lifecycle**: `src/lib/executive-autonomous-watch/executive-autonomous-watch-insight.repository.ts` +
  Prisma model `ExecutiveAwarenessInsight` — restart-safe dedup/escalation/resolution,
  keyed by a fingerprint derived from the judgment's own evidence set (never
  the Agent's prose), so the same underlying issue lands on the same row run to run.
- **Delivery**: `src/lib/executive-autonomous-watch/executive-autonomous-watch-delivery.service.ts` —
  preference-gated (`OrganizationMember.awarenessMuteAll` / `awarenessMutedCategories`)
  fanout to OWNER/EXECUTIVE members via the existing `notify()`.
- **Orchestration / scheduler entry**: `src/lib/executive-autonomous-watch/executive-autonomous-watch.service.ts`,
  invoked by the pre-existing `/api/executive-watch/run` endpoint and its
  GitHub Actions cron (`.github/workflows/executive-watch.yml`, every 3h) — unchanged.

## Retired authority

`executive-autonomous-watch.service.ts` previously computed its own
CRITICAL/HIGH severity threshold and notified directly (a second, competing
judgment owner). That judgment is retired; the module is now plumbing only.
`executive-prioritization` and `executive-operating-rhythm` remain available
as deterministic evidence/candidate producers but their own priority-level /
posture fields are not treated as final by Stage 2.

## Known scope limits (not built this pass)

- Evidence source wired: `executive-alerts` only (finance/collections/forecast/
  quote-pipeline/execution-gap/currency/market/strategic — 7 categories).
  Stock intelligence, calendar intelligence, personnel, communications, and
  external evidence are classified but not yet wired as additional
  observation adapters. The adapter pattern (`AwarenessEvidenceEnvelope`) is
  designed so each is a new adapter function, not a redesign.
- Financial-reminder-scheduler, calendar-meeting-reminder, daily-briefing, and
  rep-morning-briefing continue to self-notify as pre-existing domain
  reminders; they were not routed through Stage 2 in this pass (high blast
  radius across production revenue paths — left untouched by design).
