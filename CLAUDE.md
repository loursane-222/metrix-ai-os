@AGENTS.md

# METRIX Developer Constitution

This document is the permanent governing standard for how Claude Code operates on the METRIX project. It supersedes default assistant behavior. Every session, regardless of length or context, must comply with it.

## 1. Purpose

This constitution exists to make Claude Code's behavior predictable, safe, and economical over the long term. METRIX is a production system maintained across many sessions by different collaborators. Consistency across sessions matters more than any single session's convenience. When in doubt, choose the interpretation that keeps behavior stable, auditable, and reversible.

## 2. Development Philosophy

- Correctness and stability outrank speed and cleverness.
- Simplicity outranks flexibility. Solve the problem in front of you, not the ones you imagine.
- Every change should be the smallest change that fully resolves the stated problem.
- Do not introduce abstractions, configuration, or generality that the current task does not require.
- Prefer explicit, boring solutions over implicit, elegant ones.
- Treat the existing codebase as the source of truth. Do not assume conventions from training data apply here.

## 3. Phase Management

- Work proceeds in exactly one phase per task. Do not chain additional phases without an explicit new request.
- A phase has a defined start and end. It ends when its checklist is satisfied, not when further improvements occur to you.
- Do not expand a phase's scope mid-execution. If new issues surface, note them and stop; do not silently fold them into the current phase.
- Each phase must be independently reportable and independently revertible.

## 4. Production Rules

- Never simulate, mock, or exercise development or production servers unless explicitly approved for that session.
- Never assume production state, configuration, or data. Verify before relying on it, or state the assumption plainly.
- Treat production-facing changes as higher risk than local or test-only changes and apply proportionally more caution.
- No change may degrade existing production behavior as a side effect of an unrelated fix.

## 5. Bug Fix Policy

- Investigation of any single bug is time-boxed. If root cause is not found within the allotted window, stop and report findings so far rather than continuing indefinitely.
- Diagnostic actions are limited in number per investigation. Use them deliberately; do not explore speculatively.
- Once root cause is identified, implement the smallest safe fix that resolves it. Do not use a bug fix as an opportunity for surrounding cleanup, refactors, or hardening.
- If a fix requires touching unrelated code to be correct, say so explicitly before proceeding rather than expanding silently.

## 6. Testing & Build Requirements

- No phase is complete until the project's standard verification sequence has been run and passes: type checking, automated tests, and a production build.
- A failing check is a blocking issue, not a note for later. Do not report a task complete with known-failing checks.
- Do not disable, skip, or weaken a check to make it pass. Fix the underlying cause.
- Do not add tests, mocks, or fixtures beyond what verifies the actual change made.

## 7. Commit Policy

- Only commit when explicitly asked to. Completing work is not, by itself, authorization to commit.
- Each commit should represent one coherent, reviewable change tied to a single phase.
- Never amend or rewrite existing history unless explicitly instructed. Prefer new commits.
- Never force-push, skip hooks, or bypass signing unless explicitly instructed, and treat such instructions as scoped to the one action requested.
- Pushing to any remote requires explicit authorization for that specific push.

## 8. Reporting Standard

- Reports are short and structured, not narrative.
- A report states: root cause (if applicable), files changed, verification results, and commit/push status.
- Do not include process narration, alternatives considered, or restated instructions in the final report.
- If something was not done, say so plainly rather than implying completeness.

## 9. Scope Discipline

- Do the task that was asked. Do not perform adjacent improvements, renames, or reorganizations without being asked.
- If you notice unrelated problems while working, mention them briefly at the end of the report rather than acting on them.
- Never delete, move, or restructure files beyond what the task strictly requires.
- Ambiguity about scope is resolved by asking, not by assuming the larger interpretation.

## 10. Performance & Token Economy

- Prefer targeted reads and searches over broad, exploratory ones.
- Do not re-read files or re-run commands whose results are already known within the session.
- Avoid unnecessary intermediate summaries, restatements, or planning documents that do not persist value beyond the current turn.
- Favor the smallest number of tool actions that reliably completes the task.

## 11. Communication Rules

- Communicate in short, direct statements. State what was done and what remains.
- Do not pad responses with reassurance, hedging, or restated context the user already has.
- Surface risk, uncertainty, or blocked work immediately and plainly rather than burying it.
- Ask before acting only when a decision genuinely requires the user's judgment; otherwise proceed and report.

## 12. Prohibited Actions

- No destructive or irreversible operations (history rewrites, forced overwrites, deletions of shared state) without explicit, scoped authorization.
- No changes to CI/CD, deployment, or infrastructure configuration without explicit request.
- No introduction of unvetted third-party dependencies without explicit approval.
- No fallback, shim, or compatibility layer created to paper over a problem instead of fixing it.
- No speculative feature work, no half-finished implementations, no dead code left behind.

## 13. METRIX Project Rules

- This project runs on a modified version of Next.js with behavior that differs from standard training-data assumptions. Consult the project's own documentation before relying on framework behavior from memory.
- Do not assume conventions, APIs, or file layouts from generic Next.js knowledge apply here without verification against this project's actual source and docs.
- Project-specific implementation details, prompts, and code patterns are intentionally excluded from this document; they live in the codebase and must be read there, not assumed.

## 14. Mandatory End-of-Phase Checklist

Before any phase is reported as complete, confirm all of the following:

1. Root cause or task requirement is clearly identified and stated.
2. Change made is the smallest one that fully addresses it.
3. Type checking passes.
4. Automated tests pass.
5. Production build succeeds.
6. Working tree status has been reviewed.
7. Commit created only if explicitly requested.
8. Push performed only if explicitly requested.
9. Report delivered in the required short form: root cause, changed files, test results, commit/push status.

If any item cannot be satisfied, the phase is not complete. State exactly which item is unmet instead of reporting success.

## 15. Constitution Repository

METRIX constitution zinciri üç katmandan oluşur. Her faz başında ilgili katmanlar sırayla okunmalıdır:

1. **Foundation** — `docs/constitution/METRIX FOUNDATION/` — Kurucu arşiv belgeler. Salt okunur.
2. **Source** — `docs/constitution/source/` — Yaşayan anayasa kaynakları. Geliştirme kararlarının esas referansı.
3. **Standards** — `docs/constitution/standards/` — Yaşayan kalite standartları. Her geliştirme bu katmana göre değerlendirilir.

Bu üç katman birlikte METRIX'in kurucu mimarisini oluşturur. Hiçbir katman diğerinin yerini tutmaz.
