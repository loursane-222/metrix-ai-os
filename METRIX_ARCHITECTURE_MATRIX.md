# METRIX — Architecture & Domain Consolidation Matrix

Snapshot date: 2026-08-01. HEAD at time of audit: `443fdb0`.
Method: constitution corpus (68 docs converted from `/Users/mac/Desktop/METRIX FOUNDATION`, plus the repo's living `docs/constitution/source/*`) cross-referenced against `prisma/schema.prisma`, `src/lib`, `src/components`, `src/app`, and `package.json`. Every row below is backed by a file path, a grep hit, or a Prisma model name — not inference.

This document supersedes `METRIX_LIVING_WORKSPACE_KANIT.txt` and `METRIX_LIVING_WORKSPACE_V1_UYGULAMA_DENETIMI.txt` (removed — they were a stale, unfinished evidence dump from 9 commits prior with no verdict ever written into them).

## 1. Living Workspace architecture verdict

**Not yet a single conversation surface.** It is a hybrid:

- `src/lib/living-workspace/contracts.ts` → `WORKSPACE_DOMAINS = ["company", "customer", "product"]`. Only these 3 domains have a registered directive/surface type.
- `src/lib/living-workspace/domain-adapters.ts` → `DOMAIN_SURFACE_ADAPTERS` has exactly 3 entries (company, customer, product), each backed by a real API route.
- `ExecutiveAppShell.tsx` mounts `LivingWorkspaceHost` (the conversation+surface split view) **only on the literal `/metrix` route**. Every other `/metrix/*` route renders as a conventional routed Next.js page — the opposite of "URL değişmez, workspace değişir."
- 16 of those routed pages (`accounting, collections, company-dna, daily-rhythm, documents, finance, goals, offers, opinion, reports, sales, suppliers, tasks, team, templates, work-plan`) render the literal placeholder `<UnavailableBusinessSurface surface="..." />`.

Classification: **kısmen uygulanmış** (partially implemented) at the architecture layer — the pattern (conversation → inline surface → escalate to full page) is proven for 3 domains, not generalized.

## 2. Domain-by-domain classification

| Domain | Status | Evidence |
|---|---|---|
| Şirket (Company) | **Uygulanmış** | `CompanyOperatingScreen.tsx`, `src/lib/company/*`, Prisma `CompanyProfile`/`CompanyUnit`/`CompanyAsset`/`CompanyDataSource`, registered Living Workspace domain |
| Müşteriler (Customers/CRM core) | **Uygulanmış** (core) / **hiç uygulanmamış** (pipeline depth) | Create/edit/detail wired into Living Workspace (commit `c31415f`), Prisma `Customer`/`CustomerContact`/`CustomerCommercialTerms`. No Note/Call/Meeting/Deal/Pipeline model exists anywhere — CRM "history/notes/calls/meetings/opportunities/pipeline" from the constitution is unbuilt. |
| Ürünler (Products) | **Uygulanmış** | `ProductCanonicalScreen.tsx`, Prisma `ProductService`, registered domain (read/list/detail only, no create/edit surface yet) |
| Teklif (Offers) | **Kısmen** | Prisma `Quote`/`QuoteEvent` + `src/lib/core/quotes/*` service layer exist; zero UI — `/metrix/offers` is a stub. WhatsApp send / PDF-open tracking / Onayla-Fiyat Öner-Reddet flow: **hiç uygulanmamış**. |
| Tahsilat (Collections) | **Kısmen** | Prisma `CollectionAction`/`CollectionActionEvent`/`Payment` + service layer exist; `/metrix/collections` is a stub |
| Muhasebe (Accounting) | **Hiç uygulanmamış** (beyond one slice) | Only `Expense` model exists. No Cari, Fatura/Invoice, Stok, Mizan, Bilanço, Gelir Tablosu, Nakit Akışı, Çek, Senet, Banka, Kasa, KDV, Stopaj entities anywhere in schema or code. `/metrix/accounting` is a stub. |
| Tedarikçi (Suppliers) | **Hiç uygulanmamış** | No model, no lib code. `/metrix/suppliers` is a stub. |
| Belge (Documents, generic) | **Hiç uygulanmamış** (generic) / partial (customer-scoped) | Only `CustomerDocumentAttachment` + customer-scoped extraction exist. No OCR, no general intake pipeline, no camera/mail/WhatsApp document routing. `/metrix/documents` is a stub. |
| İş Planı (Work Plan) | **Hiç uygulanmamış** | No lib code, stub route only |
| Takvim (Calendar) | **Hiç uygulanmamış** | No model, no lib/component code — only a marketing mockup scene references "calendar" |
| Hedefler (Goals) | **Kısmen** | Prisma `SalesGoal` + API routes exist; `/metrix/goals` is a stub |
| Ekip (Team) | **Hiç uygulanmamış** (beyond org membership) | Only generic `OrganizationMember`; no team/capacity/responsibility model. Stub route. |
| Görevler (Tasks) | **Hiç uygulanmamış** | No `Task` model (`ExecutiveAction` is a distinct AI-recommendation concept, not a user task system). Stub route. |
| Bildirimler (Notifications) | **Hiç uygulanmamış** | No model or code anywhere |
| Raporlar (Reports) | **Kısmen** (strong backend) | Rich Prisma model set (`ReportTemplate`, `ReportAssignment`, `ReportSubmission`, `KpiDefinition`, etc.) + `src/lib/executive-reporting/*`; `/metrix/reports` is a stub. Best backend-to-UI ratio of any missing surface — good first candidate if this domain is prioritized. |
| Voice | **Uygulanmış** (thin, correctly single-runtime) | `src/lib/voice/*`, folded into the same conversation tab, not a second brain — matches constitution's "no second planner" rule as far as this audit checked |
| OCR | **Hiç uygulanmamış** | No OCR/vision library in `package.json`, no OCR service code |
| WhatsApp | **Hiç uygulanmamış** | Zero references anywhere in code or dependencies |
| Mail | **Kısmen** | `Resend` (send) and Gmail OAuth (read-only connection status) both exist as two separate, non-overlapping mechanisms — not a duplicate, just incomplete (no unified mail surface) |
| İmza (Signatures) | **Hiç uygulanmamış** | No e-signature code or dependency |
| Approval | **Kısmen** | `ActionApproval` Prisma model + `action-runtime/policy/approval-store.ts` wired into the business-candidate/executive-action runtime; not exposed as its own discrete surface |
| Dynamic Forms | **Uygulanmış** (scoped) | `CustomFieldDefinition` + company/customer custom-field wiring; not a generic form builder beyond those two domains |
| Universal Input | **Uygulanmış** | `src/lib/input-authority/*`, `src/lib/universal-capture/*` — real shared infrastructure under both the conversation tab and Living Workspace surfaces |

## 3. Consolidation actions taken in this phase

1. **Removed dead code**: `src/components/metrix-workspace/MetrixWorkspace.tsx` (3,954 lines) + `src/lib/metrix-workspace/` (2 files, 1,205 lines). This was a fully-built, localStorage-backed (`metrix_workspace_v1`, not Prisma) parallel implementation of the same 16 domains that are now stub routes. It was not imported by any route or component in the tree (verified by grep) — an orphaned duplicate left behind after the stub-page approach superseded it. Updated `ExecutivePresenceOrb.boundary.test.ts`, which had a defensive assertion reading this file's source, to remove the now-moot check.
2. **Removed stale audit artifacts**: `METRIX_LIVING_WORKSPACE_KANIT.txt` and `METRIX_LIVING_WORKSPACE_V1_UYGULAMA_DENETIMI.txt` — both were snapshots from 9 commits prior whose captured diff has since been committed, and neither ever recorded an actual verdict or test-run result despite claiming to be evidentiary/audit documents.

## 4. Explicitly NOT touched, and why

- **`/metrix/accounting` vs `/metrix/finance` — initially flagged as a suspected duplicate route, retracted after checking**: the legacy (now-deleted) `MetrixWorkspace.tsx` nav treated "Muhasebe" (accounting) and "Finans" (finance) as two distinct nav entries in different sections, not the same concept twice. Merging them without knowing what "Finans" was meant to cover (cash/treasury? vs. bookkeeping?) would be inventing a product decision, not consolidating. Left as-is; needs a product answer, not a code answer.
- **The `daily-briefing` / `executive-daily-briefing-v2` naming**: `v2` is a sub-module *consumed by* the still-current `daily-briefing-orchestrator.service.ts`, not a sibling that replaced a same-named `v1`. This is a naming oddity, not a confirmed duplicate — left alone pending a closer look, since renaming risks breaking the active pipeline for cosmetic reasons.
- **The `executive-*-intelligence` / `executive-*-signal` / `executive-decision-*` clusters** (6+ directories each with overlapping-sounding names): the repo-inventory agent found real cross-imports between them (layered, not parallel), so collapsing them needs actual design review, not a blind merge.

## 5. The scope question this audit surfaces

14 of the ~20 domains named in the operating brief (Muhasebe depth, Tedarikçi, generic Belge/OCR, İş Planı, Takvim, Ekip, Görevler, Bildirimler, İmza, WhatsApp, and the UI layer for Teklif/Tahsilat/Hedefler/Raporlar) have **no existing implementation to consolidate** — they would need to be built from zero: new Prisma models, migrations, business logic, and Living Workspace surfaces. Muhasebe in particular requires real Turkish tax/accounting rules (KDV rates, stopaj, chart of accounts, Mizan/Bilanço construction) that are business/legal inputs, not implementation choices.

This is genuinely a different kind of work than the dead-code/duplicate-ownership cleanup in §3 — it's net-new product construction, which the operating brief itself frames as out of scope ("Bu görev feature implementasyonu değildir"). Flagging this rather than silently picking an interpretation or silently building 14 domains' worth of financial/legal logic unsupervised.
