# METRIX Visual Implementation Operation

**Status:** Execution Directive  
**Scope:** Canonical visual implementation  
**Required contracts:**
- `docs/visual/METRIX_VISUAL_EXPERIENCE_CONTRACT.md`
- `docs/visual/METRIX_DOMAIN_WORKSPACE_CONTRACT.md`
- `docs/visual/METRIX_DETAIL_WORKSPACE_CONTRACT.md`
- `docs/visual/METRIX_VISUAL_IMPLEMENTATION_ACCEPTANCE.md`

**Required references:**
- `docs/visual/references/metrix-main-reference.jpg`
- `docs/visual/references/domain-workspace-reference.jpg`
- `docs/visual/references/detail-workspace-reference.jpg`

---

## 1. Mission

Implement the canonical METRIX visual experience inside the existing production frontend.

This is **not** a redesign, architecture, capability, runtime or business-logic operation.

The supplied contracts are authoritative. The supplied images are canonical visual references, not inspiration.

Authority order:

1. Explicit contract hard rules / user corrections
2. Canonical visual references
3. Existing visual implementation
4. Implementer preference

Where a reference conflicts with an explicit contract rule, the contract wins.

---

## 2. Runtime Boundary

Do not create or redesign:

- architecture
- runtime
- navigation authority
- business authority
- capability/domain model
- persistence
- approval/policy
- parallel state systems

Preserve existing:

- METRIX personality
- conversation runtime
- entity resolution
- canonical business navigation
- workspace commands
- action runtime
- persistence
- voice/text behavior
- production capabilities

The visual layer must not generate business truth.

Do not use UI string matching as domain/entity authority.

---

## 3. Implementation Order

Read **all four contracts and all three references first**.

Implementation order:

```text
PHASE 1 — Main METRIX Visual Experience
PHASE 2 — Domain Workspace
PHASE 3 — Entity Detail Workspace
```

Do not start Phase 2 before Phase 1 visual acceptance.
Do not start Phase 3 before Phase 2 visual acceptance.

`METRIX_VISUAL_IMPLEMENTATION_ACCEPTANCE.md` governs every phase.

---

## 4. Phase 1 Hard Rules

For the main METRIX surface:

- no sidebar
- no menu/navigation rail
- no bottom dock
- top-left = history control only
- top-right = settings control only
- no METRIX wordmark at top-left
- METRIX identity lives in the central hub
- hub must remain proportionate to a normal desktop viewport
- conversation flows above the textbox
- persistent textbox remains at the bottom and always usable
- neutral domains are muted/blurred
- relevant domain becomes clear through canonical runtime context
- desktop workspace can never become fullscreen

### Connection Network

The canonical reference does **not** use organic/tentacle paths.

Primary left/right trunks:

- originate from the horizontal center of the hub
- leave the hub straight
- remain predominantly horizontal
- are thicker than secondary paths

Secondary routes:

- begin with a straight segment
- use at most a controlled large-radius directional bend where required
- become straight again before reaching the domain

Prohibited:

- tentacles
- repeated S-curves
- sinusoidal/wavy routing
- random Bézier paths
- spider-web geometry
- equal stroke weights

Primary routes must be surrounded by thinner, irregular micro-traces above/below/behind them.

Target appearance:

**structured living data/energy bus, not organic cable.**

Prefer deterministic SVG geometry. Do not randomly generate routes.

Domain activation energy flows:

```text
METRIX HUB → ACTIVE DOMAIN
```

Animation must not distort path geometry.

---

## 5. No Redesign

Do not:

- modernize beyond the reference
- simplify the visual hierarchy
- introduce navigation
- enlarge the hub for drama
- replace the network language
- invent workspace internals
- invent metrics/capabilities
- alter runtime behavior to make visual implementation easier

Reference + contracts = target.

---

## 6. First Operation — READ ONLY

**Do not modify files yet.**

Inspect only the frontend/presentation chain relevant to Phase 1. Do not rediscover the entire repository.

Read all contracts and visually inspect all three reference images.

Then report only:

### A. Inputs
Confirm all 4 contracts and 3 reference images were found and actually inspected.

For each reference image, describe 3–6 concrete visual characteristics you can genuinely see. Do not infer unseen details.

### B. Existing Phase 1 Chain
List only the existing files/components directly relevant to the main visual experience.

### C. Protected Runtime Boundaries
Identify existing runtime/business/navigation boundaries that must remain unchanged.

### D. Planned Phase 1 Changes
List the files you expect to modify and one-line justification for each.

### E. Visual Invariants
Confirm the critical invariants for:
- hub
- domain placement
- primary trunks
- secondary routes
- micro-traces
- background
- blur hierarchy
- conversation
- persistent input

### F. Risks / Ambiguities
Report anything that cannot safely be determined from the contracts/reference/repository. Do not guess.

### G. Repository State
Read:

```bash
git status --short
git branch --show-current
```

Do not delete, overwrite, revert or claim ownership of pre-existing changes.

**Stop after this report and wait for approval.**

No edit, refactor, dependency installation, commit, push or deploy before approval.

---

## 7. Implementation Loop After Approval

For each phase:

```text
implement
→ run real app
→ fixed-viewport screenshot
→ compare with canonical reference
→ log differences
→ targeted correction
→ recapture
```

Minimum desktop acceptance viewports:

- 1920 × 1080
- 1440 × 900
- 1366 × 768

Difference categories:

```text
GEO    geometry
PATH   connection geometry
COLOR  color/luminance
GLOW   glow/blur/shadow
SPACE  spacing/rhythm
TYPE   typography
ICON   icon treatment
MOTION animation
STATE  interaction state
```

Correct measured differences only. Do not redesign unrelated areas.

---

## 8. Completion Rule

Code completion, passing tests or a successful build are **not** visual acceptance.

A phase requires:

- real application evidence
- deterministic screenshots
- canonical reference comparison
- required motion evidence
- protected persistent input
- runtime regression verification
- explicit remaining-differences report

Without visual evidence, report:

> Implementation completed; visual acceptance pending.

Never claim reference fidelity without comparison evidence.

---

## 9. Repository Safety

Do not overwrite unrelated work.

If existing uncommitted changes intersect the files you need to modify, stop and report the collision before editing.

Do not commit, push or deploy unless explicitly instructed.

If a visual requirement conflicts with canonical runtime behavior, do not create a workaround or parallel system. Stop and report the conflict.

---

**START CONDITION:** Perform Section 6 only. Read-only inspection first. Wait for explicit approval before implementation.
