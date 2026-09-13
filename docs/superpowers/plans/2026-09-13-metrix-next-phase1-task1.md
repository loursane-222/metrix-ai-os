# METRIX Next Phase 1 — Task 1 Implementation Plan

Goal: Create the smallest independently runnable METRIX Next application shell.

Constraints:
- No runtime dependency on metrix-ai-os.
- No classifier/router/planner/narration layer.
- This task adds transport and tooling only; no business logic yet.
- Tests first for the production route/isolation behavior.
- No push and no deploy.

Acceptance:
1. POST /api/metrix exists and returns typed EXECUTIVE_NOT_WIRED 501 response.
2. Production source contains no old-repository runtime reference.
3. Typecheck, test, build and git diff --check pass.
