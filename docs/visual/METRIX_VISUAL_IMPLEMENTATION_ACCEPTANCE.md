# METRIX Visual Implementation Acceptance

**Dosya:** `METRIX_VISUAL_IMPLEMENTATION_ACCEPTANCE.md`  
**Durum:** Canonical Visual Acceptance / Verification Contract  
**Sürüm:** 1.0

**Bağlı kontratlar:**
- `METRIX_VISUAL_EXPERIENCE_CONTRACT.md`
- `METRIX_DOMAIN_WORKSPACE_CONTRACT.md`
- `METRIX_DETAIL_WORKSPACE_CONTRACT.md`

**Amaç:** METRIX visual implementation'ının yalnız “çalışıyor” değil, canonical referanslara yeterince yakın olduğunu kanıtlamak.

---

# 0. Acceptance Prensibi

Bu çalışma test/build geçince tamamlanmış sayılmaz.

Aşağıdaki üç şey birlikte kanıtlanmalıdır:

```text
1. Runtime regression yok
2. Interaction contract doğru
3. Visual fidelity canonical referansa yeterince yakın
```

**Hard rule:**

> Görsel kanıt olmadan “tamamlandı”, “referansa uygun”, “pixel-perfect”, “production-ready” veya benzeri kabul ifadesi kullanılamaz.

---

# 1. Canonical Inputs

Implementasyon ajanı aşağıdaki dosyaları aynı anda authoritative input olarak kabul etmelidir.

## 1.1 Ana deneyim

```text
Contract:
METRIX_VISUAL_EXPERIENCE_CONTRACT.md

Reference:
canonical METRIX main visual reference
```

## 1.2 Domain workspace

```text
Contract:
METRIX_DOMAIN_WORKSPACE_CONTRACT.md

Reference:
canonical domain workspace reference
```

## 1.3 Entity detail workspace

```text
Contract:
METRIX_DETAIL_WORKSPACE_CONTRACT.md

Reference:
canonical entity detail workspace reference
```

Referans görsel dosyalarının gerçek repo path'leri implementation başlamadan önce kayda alınmalıdır.

---

# 2. Authority Order

Bir çelişki halinde authority sırası:

```text
1. Explicit user corrections embodied in contracts
2. Contract hard invariants
3. Canonical visual references
4. Existing visual implementation
5. Implementer preference
```

Implementer preference hiçbir zaman reference veya contract override edemez.

---

# 3. No-Redesign Directive

Ajan:

- yeniden tasarım yapamaz;
- “daha modern” yorum ekleyemez;
- layout sadeleştiremez;
- yeni navigation ekleyemez;
- visual hierarchy değiştiremez;
- referansta olmayan dashboard pattern'i ekleyemez;
- eksik gördüğü alanı kendi tasarım zevkiyle dolduramaz.

Görev:

```text
interpret less
measure more
implement
capture
compare
correct
```

---

# 4. Required Implementation Loop

Her visual surface için aşağıdaki loop zorunludur:

```text
REFERENCE
   ↓
IMPLEMENT
   ↓
RUN REAL APP
   ↓
CAPTURE FIXED-VIEWPORT SCREENSHOT
   ↓
COMPARE
   ↓
IDENTIFY DIFFERENCES
   ↓
CORRECT ONLY MEASURED DIFFERENCES
   ↓
RE-CAPTURE
   ↓
REPEAT UNTIL ACCEPTANCE
```

Tek pass implementasyon kabul edilmez.

---

# 5. Required Surfaces

Minimum üç surface ayrı ayrı kabul edilmelidir:

```text
A. Main METRIX visual experience
B. Domain Workspace overview
C. Entity Detail Workspace
```

Bir surface'in başarılı olması diğer surface'leri otomatik kabul ettirmez.

---

# 6. Fixed Viewports

Desktop canonical acceptance için minimum:

```text
1920 × 1080
1440 × 900
1366 × 768
```

Eğer production kullanıcı tabanı için repository'de farklı canonical desktop viewport varsa buna eklenebilir.

Her viewport'ta:

- global composition;
- overflow;
- textbox safe-zone;
- workspace sizing;
- domain geometry;
- typography;
- list density

kontrol edilir.

---

# 7. Screenshot Naming Convention

Her acceptance screenshot deterministic isimle kaydedilmelidir.

Önerilen yapı:

```text
artifacts/visual-acceptance/
  main/
    main-1920x1080.png
    main-1440x900.png
    main-1366x768.png

  workspace/
    customers-1920x1080.png
    customers-1440x900.png
    customers-1366x768.png

  detail/
    customer-detail-1920x1080.png
    customer-detail-1440x900.png
    customer-detail-1366x768.png
```

Timestamp içeren rastgele isimler canonical acceptance için kullanılmamalıdır.

---

# 8. Main Surface Acceptance

Ana METRIX ekranı için aşağıdaki bölgeler ayrı ayrı incelenir.

## 8.1 Global composition

Kontrol:

```text
hub position
hub scale
domain radial distribution
top controls
conversation vertical placement
persistent textbox
empty-space balance
```

## 8.2 Hub

Kontrol:

```text
diameter
inner shell
outer rings
cyan/blue/violet/magenta balance
glow spread
label placement
visual dominance
```

Hub ekranı referanstan daha büyükse kabul edilmez.

## 8.3 Domain nodes

Kontrol:

```text
node position
icon scale
label position
neutral blur
neutral opacity
active clarity
active luminance
```

## 8.4 Connection network

Bu alan ayrı hard acceptance'tır.

Kontrol:

```text
left primary trunk
right primary trunk
secondary routes
turn count
turn radius
straight-segment length
micro-trace density
stroke hierarchy
particle distribution
```

Aşağıdaki görünümler otomatik red sebebidir:

```text
tentacle
wavy
sinusoidal
spider web
random bezier
equal-weight paths
```

## 8.5 Conversation and textbox

Kontrol:

```text
textbox bottom position
textbox width
conversation height
message density
input readability
workspace-open behavior
```

Textbox asla covered/collapsed olmamalıdır.

---

# 9. Main Motion Acceptance

Static screenshot yeterli değildir.

Video veya kısa screen recording ile aşağıdakiler kanıtlanmalıdır:

```text
idle
→ domain relevant
→ active domain
→ hub-to-domain energy flow
→ workspace opening
```

Motion acceptance sırasında:

- enerji yönü hub → domain;
- layout shift yok;
- repeated-wave animation yok;
- active domain netleşiyor;
- diğer domainler düşük odakta kalıyor;
- input kullanılabilir kalıyor.

---

# 10. Domain Workspace Acceptance

Canonical workspace reference ile aşağıdakiler karşılaştırılır:

```text
outer shell
header
KPI strip
toolbar
search field
compact icon controls
primary CTA
list header
row density
selected row
balance/value alignment
pagination
background/border hierarchy
```

---

# 11. Workspace Geometry Checks

Ölçülmesi gereken minimum:

```text
workspace outer width
workspace outer height
outer padding
header height
KPI card width
KPI card height
KPI gap
toolbar height
search width
CTA width
row height
list viewport height
footer height
corner radius
```

"Yaklaşık benziyor" tek başına acceptance değildir.

---

# 12. Workspace Semantic Checks

Her domain için:

```text
3–4 meaningful KPIs
minimal entity list
one high-value secondary value/status
at most one primary CTA
canonical search/filter behavior
row → detail transition
```

Ana listede bilgi bombardımanı red sebebidir.

---

# 13. Detail Workspace Acceptance

Canonical detail reference ile:

```text
entity identity
header actions
tabs
active underline
primary information panel
analytical panel
chart geometry
metric strip
recent activity
deep-view action
```

karşılaştırılır.

---

# 14. Detail Density Checks

Kontrol:

```text
field label/value spacing
two-column balance
chart/legend balance
metric count
activity row height
bottom CTA/action prominence
```

Detail surface ERP table'a dönüşürse acceptance başarısızdır.

---

# 15. Visual Difference Categories

Her iteration'da farklar aşağıdaki kategorilerden biriyle loglanmalıdır.

```text
GEO     geometry / position / size
TYPE    typography
COLOR   color / luminance
GLOW    glow / blur / shadow
SPACE   spacing / rhythm
ICON    icon scale / treatment
PATH    connection geometry
MOTION  animation
STATE   active / selected / hover / focus
DATA    wrong visible data projection
```

Örnek:

```text
PATH-01
Right trunk leaves hub with a curve.
Expected: straight horizontal tangent.

GEO-03
Hub diameter 236px.
Reference target visually ~190–205px at 1440 viewport.

SPACE-02
Conversation-to-input gap ~32px too large.
```

---

# 16. Correction Rule

Her correction cycle:

```text
observed difference
→ targeted change
→ regression capture
```

şeklinde olmalıdır.

Bir farkı düzeltirken unrelated visual redesign yapılmaz.

---

# 17. Optional Pixel-Diff

Mümkünse screenshot comparison için image-diff kullanılabilir.

Örnek araç sınıfları:

```text
Playwright screenshots
pixelmatch
ImageMagick compare
SSIM / perceptual diff
```

Ancak saf pixel diff tek authority değildir.

AI/reference render ile browser rasterization farklı olabileceği için acceptance:

```text
pixel/perceptual diff
+ geometric inspection
+ human visual comparison
```

üçlüsüne dayanır.

---

# 18. Playwright Recommendation

Mevcut repo ile uyumluysa fixed-viewport screenshot için Playwright tercih edilebilir.

Concept:

```ts
await page.setViewportSize({
  width: 1440,
  height: 900,
});

await page.goto(PRODUCTION_OR_LOCAL_URL);

await page.screenshot({
  path: "artifacts/visual-acceptance/main/main-1440x900.png",
  fullPage: false,
});
```

Bu örnek yeni test architecture kurma zorunluluğu değildir.

Repo'daki mevcut browser automation sistemi varsa o kullanılmalıdır.

---

# 19. Screenshot Preconditions

Screenshot alınmadan önce:

- fontlar yüklenmiş;
- initial loading tamamlanmış;
- deterministic data/state set edilmiş;
- animation frame doğru noktada stabilize edilmiş;
- browser zoom `%100`;
- viewport kesin;
- devtools kapalı;
- random data/particle layout stabilize edilmiş

olmalıdır.

Aksi halde screenshot karşılaştırması geçersizdir.

---

# 20. Determinism Requirement

Visual acceptance surface'leri mümkün olduğunca deterministic olmalıdır.

Yasak:

```text
random domain coordinates
random route generation
random KPI order
random row height
unseeded visual particles affecting layout
```

Particles random görünebilir ancak layout/geometriyi değiştiremez.

---

# 21. Runtime Regression Acceptance

Visual implementation aşağıdaki contract'ları bozamaz:

```text
conversation
entity resolution
business navigation
workspace commands
action runtime
mutation
approval
persistence
voice/text behavior
```

İlgili mevcut test suite'leri geçmelidir.

---

# 22. Build Acceptance

Minimum:

```text
typecheck
lint
tests
production build
```

repo'nun mevcut canonical komutlarıyla çalıştırılır.

Yeni acceptance framework uğruna mevcut build pipeline değiştirilmez.

---

# 23. Repository State

Acceptance sonunda:

```text
git diff --check
git status --short
```

raporlanır.

Unrelated file drift olmamalıdır.

Visual task dışı dosya değişiklikleri açıklanmalıdır.

---

# 24. Accessibility Acceptance

Minimum:

```text
history control keyboard accessible
settings control keyboard accessible
persistent input keyboard accessible
workspace controls keyboard accessible
tabs semantic
rows focusable when interactive
focus-visible visible
decorative SVG hidden from screen readers
reduced-motion supported
```

---

# 25. Performance Acceptance

Animation implementation için minimum:

```text
no obvious frame drops
no constant layout reflow
no React state update per animation frame
no uncontrolled DOM particle growth
no huge SVG filter cost on every element
```

Chrome performance profiling yalnız sorun görülürse derinleştirilir.

---

# 26. Failure Conditions

Aşağıdakilerden biri varsa visual acceptance başarısızdır:

```text
sidebar added
menu added
METRIX wordmark added top-left
hub oversized
connection routes wavy/tentacle-like
workspace fullscreen
input hidden/covered
domain list turned into dense ERP table
detail redesigned independently
fake KPI/metric introduced
visual result not screenshot-compared
agent claims completion without evidence
```

---

# 27. Required Final Evidence Package

Ajan final raporunda minimum aşağıdakileri sunmalıdır.

## A. Changed files

```text
file list
purpose of each file
```

## B. Runtime verification

```text
tests
typecheck
build
```

## C. Visual evidence

```text
main screenshots
workspace screenshots
detail screenshots
```

## D. Motion evidence

```text
domain activation / energy flow / workspace opening recording
```

## E. Difference report

```text
remaining known visual differences
```

"Yok" deniyorsa bunu reference comparison desteklemelidir.

---

# 28. Completion Language

Aşağıdaki ifadeler ancak evidence tamamlandıysa kullanılabilir:

```text
Visual acceptance passed.
Reference-calibrated.
Production visual contract accepted.
```

Evidence eksikse doğru ifade:

```text
Implementation completed; visual acceptance pending.
```

veya:

```text
Visual acceptance incomplete because ...
```

---

# 29. Recommended Implementation Order

Tek seferde bütün görsel sistemi değiştirmek yerine aynı canonical iş içinde şu sıra önerilir:

```text
1. Parent shell / background
2. Hub geometry
3. Domain coordinates
4. Deterministic SVG network
5. Domain states
6. Conversation/input
7. Domain workspace
8. Detail workspace
9. Motion
10. Multi-viewport calibration
11. Runtime regression
12. Final visual acceptance
```

Bu sıra phased product rollout anlamına gelmez.

Aynı implementation operation içinde dependency sırasıdır.

---

# 30. Codex / Claude Code Master Directive

Aşağıdaki direktif üç kontrat ve üç referans görselle birlikte verilmelidir:

```text
You are implementing the canonical METRIX visual experience.

Authoritative contracts:
- METRIX_VISUAL_EXPERIENCE_CONTRACT.md
- METRIX_DOMAIN_WORKSPACE_CONTRACT.md
- METRIX_DETAIL_WORKSPACE_CONTRACT.md
- METRIX_VISUAL_IMPLEMENTATION_ACCEPTANCE.md

Authoritative visual references:
- main METRIX ecosystem reference
- domain workspace reference
- entity detail workspace reference

Do not redesign.
Do not reinterpret the product.
Do not add navigation.
Do not add a sidebar.
Do not make desktop workspaces fullscreen.
Do not hide or compress the persistent METRIX input.
Do not create organic/wavy connection paths.
Do not invent business metrics, capabilities or states.
Do not alter canonical runtime/business authority to simplify the UI.

The implementation must be performed inside the existing METRIX
architecture.

For every visual surface:
1. implement,
2. run the real application,
3. capture deterministic fixed-viewport screenshots,
4. compare against the canonical reference,
5. log measurable visual differences,
6. correct those differences,
7. recapture.

Do not claim visual completion after code/tests/build alone.

Visual completion requires:
- reference screenshots,
- fixed viewport evidence,
- motion evidence for the main ecosystem,
- runtime regression proof,
- explicit disclosure of any remaining visual differences.

The supplied references are not inspiration.
They are acceptance targets.

Where an explicit contract rule differs from a concept/reference artifact,
the contract wins.
```

---

# 31. Final Acceptance Statement

METRIX visual implementation ancak şu zincir kanıtlandığında tamamlanmış kabul edilir:

```text
CONTRACT
   ↓
REFERENCE
   ↓
IMPLEMENTATION
   ↓
REAL APP
   ↓
SCREENSHOT / MOTION EVIDENCE
   ↓
COMPARISON
   ↓
CORRECTION
   ↓
REGRESSION
   ↓
ACCEPTANCE
```

Amaç bir AI ajanının kendi yaptığı UI'ı “benziyor” diye değerlendirmesi değildir.

Amaç:

**canonical referans ile production implementasyonu arasında ölçülebilir, tekrarlanabilir ve görsel kanıtla doğrulanmış bir acceptance süreci kurmaktır.**

---

**END OF ACCEPTANCE CONTRACT**
