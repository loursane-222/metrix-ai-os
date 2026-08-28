# METRIX Entity Detail Workspace Contract

**Dosya:** `METRIX_DETAIL_WORKSPACE_CONTRACT.md`  
**Durum:** Canonical Entity Detail Workspace Visual / Interaction Contract  
**Sürüm:** 1.0  
**Canonical referans:** Kullanıcı tarafından sağlanan `workspace detay 1.jpg`  
**Bağlı kontratlar:**  
- `METRIX_VISUAL_EXPERIENCE_CONTRACT.md`
- `METRIX_DOMAIN_WORKSPACE_CONTRACT.md`

**Kapsam:** Bir domain workspace'indeki entity satırı açıldıktan sonra kullanılan ortak Detail Workspace sistemi; entity identity/header, sekmeler, özet bilgi alanları, finansal/operasyonel özet, KPI/metric strip, son hareketler ve entity-level actions.  
**Kapsam dışı:** Yeni business capability, yeni business metric, yeni permission/approval modeli veya domain-specific business logic tasarlamak.

---

# 0. Sözleşmenin Amacı

Bu belge yalnız `Global Corp` müşteri detayını tarif etmez.

Referans görseldeki müşteri detay yüzeyi, METRIX'in farklı business domainlerinde entity detaylarının nasıl sunulacağına ilişkin **canonical visual and interaction pattern**'dir.

Amaç:

```text
DOMAIN WORKSPACE
      ↓
ENTITY SELECTION
      ↓
ENTITY DETAIL WORKSPACE
      ↓
SUMMARY → RELATED DATA → ACTION
```

Detail workspace'in görevi, overview listesindeki minimal bilgiyi kontrollü progressive disclosure ile derinleştirmektir.

Her domain kendi gerçek entity modelini ve ilişkili business verisini getirir; fakat görsel hiyerarşi ve interaction dili ortak kalır.

---

# 1. Parent Contract Invariants

Bu kontrat önceki iki kontratı genişletir; yeniden tanımlamaz.

Aşağıdaki kurallar değişmez:

```text
METRIX merkezdir.
Conversation süreklidir.
Persistent input dokunulmazdır.
Workspace desktop'ta fullscreen değildir.
Domain workspace ortak shell kullanır.
Overview listesi minimaldir.
Detail yalnız entity seçildikten sonra açılır.
Business truth presentation tarafından üretilmez.
```

Detail workspace yeni bir page/app/navigation authority oluşturamaz.

---

# 2. Detail Workspace'in Rolü

Overview workspace:

```text
scan → find → select
```

Detail workspace:

```text
understand → inspect → act
```

içindir.

Bu ayrım korunmalıdır.

Ana domain listesine detay yüklemek yerine derin bilgi detail workspace'e taşınır.

---

# 3. Canonical Detail Anatomy

Referans görsel aşağıdaki bilgi mimarisini tanımlar:

```text
┌─────────────────────────────────────────────┐
│ ENTITY IDENTITY                   ACTIONS   │
│ Global Corp                     Edit   More │
├─────────────────────────────────────────────┤
│ TAB  TAB  TAB  TAB  TAB  TAB                │
├─────────────────────────────────────────────┤
│                                             │
│ PRIMARY INFORMATION   PRIMARY SUMMARY       │
│                                             │
├─────────────────────────────────────────────┤
│ METRIC │ METRIC │ METRIC │ METRIC │ METRIC │
├─────────────────────────────────────────────┤
│                                             │
│ RECENT ACTIVITY / RELATED RECORDS           │
│                                             │
├─────────────────────────────────────────────┤
│          VIEW ALL / CONTINUE                │
└─────────────────────────────────────────────┘
```

Bu yapı bütün domainlerde aynı içerik isimlerini zorunlu kılmaz.

**Yapısal hiyerarşi ortaktır; business content domain-specific'tir.**

---

# 4. Detail Shell

Detail workspace, parent `DomainWorkspaceShell` görsel ailesinin devamıdır.

Yeni modal/dialog tasarımı yaratılmaz.

Visual character:

- dark navy / near-black;
- translucent layered surfaces;
- thin blue-grey borders;
- restrained cyan/violet accents;
- subtle internal depth;
- medium radius;
- high information readability;
- low decorative noise.

Detail yüzeyi parent workspace'ten kopuk görünmemelidir.

---

# 5. Entity Identity Header

Detail'in ilk satırı entity'nin kimliğini açık biçimde gösterir.

Referans:

```text
[G] Global Corp                         [Edit] [More]
```

## 5.1 Identity anatomy

```text
[optional entity marker/avatar]
PRIMARY ENTITY NAME
optional concise status/context
                         ENTITY ACTIONS
```

Primary entity name detail yüzeyinin en güçlü text identity'sidir.

## 5.2 Domain adaptation

Örnekler:

```text
Müşteri:
[G] Global Corp

Teklif:
[icon] TKL-2026-0042 · Global Corp

Fatura:
[icon] FTR-2026-0188 · Global Corp

Görev:
[icon] Sözleşme revizyonunu tamamla

Ürün:
[icon] Ürün / SKU adı
```

Gerçek naming canonical data modelinden gelir.

---

# 6. Entity Actions

Header sağında yalnız yüksek değerli entity-level actions bulunur.

Referans:

```text
Edit
More
```

## 6.1 Action hierarchy

- doğrudan ve sık kullanılan action → visible icon/button;
- secondary/rare actions → overflow;
- destructive action → primary yüzeye taşınmaz;
- permission/approval canonical runtime'dan gelir.

## 6.2 Yasak

- header'ı 6–10 icon ile doldurmak;
- her capability'yi görünür action yapmak;
- UI içinde yeni permission kuralı oluşturmak;
- edit iconuna domain-specific mutation logic gömmek.

---

# 7. Tab Navigation

Referans müşteri detail'i:

```text
Genel Bilgiler
Cari Hareketleri
Faturalar
Tahsilatlar
Teklifler
Notlar & Belgeler
```

Bu tab isimleri **Müşteriler domainine özgüdür**.

## 7.1 Tab role

Tab'lar aynı entity'nin ilişkili business projections'ını gösterir.

Tab değişimi:

- entity context'i değiştirmez;
- detail workspace'i kapatmaz;
- yeni global navigation oluşturmaz;
- conversation context'i kaybetmez.

## 7.2 Active state

Referanstaki active tab:

- primary text daha açık;
- altında ince violet/cyan accent line;
- inactive tab'lar muted;
- büyük pill/tab button kullanılmaz.

## 7.3 Tab count

Yalnız gerçekten anlamlı relationship surfaces gösterilir.

Sırf simetri için boş tab eklenmez.

Çok fazla ilişki varsa bütün tab'ları tek satıra sıkıştırmak yerine canonical UX çözümü ayrıca belirlenir.

---

# 8. General / Summary Tab Pattern

Referanstaki `Genel Bilgiler` tab'ı detail'in executive summary yüzeyidir.

Bu tab'ın canonical katmanları:

```text
A. identity/business information
B. primary analytical/financial summary
C. compact metrics
D. recent activity
E. deeper-view action
```

Her domain birebir finansal donut kullanmak zorunda değildir.

---

# 9. Primary Information Panel

Referans:

```text
Firma Bilgileri

Vergi No
Yetkili
Telefon
E-posta
Adres
```

Bu panel entity'nin temel tanımlayıcı ve operational bilgilerini gösterir.

## 9.1 Pattern

```text
PANEL TITLE

LABEL        VALUE
LABEL        VALUE
LABEL        VALUE
...
```

## 9.2 Density

Bilgiler:

- label/value çiftleri;
- tek bakışta okunabilir;
- compact;
- gereksiz card nesting olmadan

sunulur.

Form görünümüne dönüşmez.

Detail read mode ile edit mode ayrıdır.

---

# 10. Primary Summary / Analytical Panel

Referansta sağ panel:

```text
Finansal Özet

donut:
₺1.250.000
Toplam Alacak

Vadesi Gelmemiş   ₺850.000
Vadesi 1–30 Gün   ₺250.000
Vadesi 31–60 Gün  ₺100.000
Vadesi 60+ Gün    ₺50.000
```

Bu panelin amacı entity'nin en önemli dağılımını veya analitik özetini tek bakışta göstermektir.

## 10.1 Chart is not mandatory

Donut chart **müşteri finansal özeti için referans örneğidir**.

Diğer domainlerde veri semantiği gerektirmiyorsa donut kullanılmaz.

Alternatif canonical presentation:

- compact breakdown;
- progress;
- status distribution;
- stage distribution;
- financial aging;
- performance summary.

Chart yalnız business insight sağlıyorsa kullanılır.

Dekoratif chart yasaktır.

## 10.2 Summary hierarchy

Analytical panel:

```text
summary title
primary metric
visual distribution (if meaningful)
legend / breakdown
```

şeklinde okunmalıdır.

---

# 11. Chart Contract

Chart kullanılırsa:

- dark surface üzerinde yüksek okunabilirlik;
- sınırlı 3–5 semantic accent;
- legend değerleri açık;
- primary number chart merkezinde veya yakınında;
- tooltip gerekiyorsa erişilebilir;
- animation kısa ve restrained.

Yasak:

- 3D chart;
- perspective;
- excessive glow;
- unlabeled chart;
- rainbow palette;
- chart'ın business değerinden daha baskın olması.

---

# 12. Compact Metric Strip

Referans:

```text
Açık Fatura | Müşteri Skoru | Segment | İlk İşlem Tarihi | Toplam İşlem
15 Adet       87 / 100         A         12.03.2021          ₺48.250.000
```

Bu alan overview workspace KPI strip'iyle aynı şey değildir.

## 12.1 Ayrım

Overview KPI:

```text
domain-level executive metrics
```

Detail metric:

```text
selected entity-level summary metrics
```

Bu iki seviye karıştırılmamalıdır.

## 12.2 Metric count

Desktop'ta yaklaşık:

```text
3–5 compact metrics
```

uygundur.

Entity semantiği daha az gerektiriyorsa boş kart yaratılmaz.

## 12.3 Metric anatomy

```text
LABEL
PRIMARY VALUE
optional qualifier
```

Metric card'lar aynı görsel ağırlıkta olmalıdır.

---

# 13. Scores and Segments

Referanstaki:

```text
Müşteri Skoru 87 / 100
Segment A
Potansiyel: Yüksek
```

yalnız canonical business modelde gerçekten mevcutsa gösterilir.

UI:

- kendi müşteri skoru hesaplayamaz;
- segment uyduramaz;
- eksik değeri tahmin edemez.

Score/segment business engine'den gelir.

Presentation yalnız gösterir.

---

# 14. Recent Activity Panel

Referanstaki `Son Hareketler`, detail yüzeyinin önemli pattern'idir.

Amaç:

**entity ile ilgili son önemli business olaylarını kronolojik ve kompakt biçimde göstermek.**

Referans:

```text
Fatura Tahsilatı    INV-2024-1256    ₺150.000    14.05.2024
Fatura Kesildi      INV-2024-1255    ₺320.000    13.05.2024
Tahsilat            RCPT-2024-889    ₺100.000    10.05.2024
Teklif Gönderildi   Q-2024-556       ₺450.000    09.05.2024
```

## 14.1 Activity anatomy

Minimum pattern:

```text
[event marker]
EVENT LABEL
RELATED RECORD / REFERENCE
OPTIONAL HIGH-VALUE VALUE
DATE / TIME
```

Her event aynı kolonları zorunlu kullanmaz.

## 14.2 Semantic event marker

Küçük icon/color marker event type'ı ayırt edebilir.

Renk tek anlam taşıyıcısı değildir.

Event label açıkça yazılır.

## 14.3 Density

Recent activity:

- kısa liste;
- en yeni üstte;
- yaklaşık 4–7 visible row;
- detay bombardımanı yok.

Tam history ayrı view/tab/action ile açılır.

---

# 15. View-All / Deep-Link Action

Referans alt kontrol:

```text
Tüm Hareketleri Görüntüle  >
```

Bu pattern, özet yüzeyinden daha derin ilişki görünümüne geçiş sağlar.

Örneğin:

```text
Tüm Hareketleri Görüntüle
Tüm Faturaları Görüntüle
Tüm Teklifleri Görüntüle
Tüm Aktiviteleri Görüntüle
```

Action detail shell içinde kalabilir veya ilgili relationship tab'ına geçebilir.

Yeni global page navigation oluşturmamalıdır.

---

# 16. Relationship Tabs

Entity ile ilişkili kayıtlar tab'larda açıldığında aynı shell korunur.

Örnek customer relationship:

```text
Cari Hareketleri
Faturalar
Tahsilatlar
Teklifler
Notlar & Belgeler
```

Bu tab'ların içerik pattern'i domain verisine göre:

- compact list;
- ledger;
- document list;
- timeline;
- status list

olabilir.

Ancak aynı tab içinde gereksiz dashboard üretmek yasaktır.

---

# 17. Cross-Domain Detail Model

Bütün domainler aşağıdaki conceptual model'i paylaşır:

```tsx
<EntityDetailWorkspace entity={entity}>
  <EntityHeader />
  <EntityRelationshipTabs />

  <ActiveDetailSurface>
    <PrimaryInfo />
    <PrimarySummary />
    <EntityMetricStrip />
    <RecentActivity />
    <DeepViewAction />
  </ActiveDetailSurface>
</EntityDetailWorkspace>
```

Bu birebir component API zorunluluğu değildir.

Architecture intent:

```text
shared visual detail shell
+ domain-specific data projection
```

---

# 18. Domain Adaptation Examples

Aşağıdaki örnekler yeni business capability yaratma yetkisi vermez.

## 18.1 Müşteri

```text
Primary info:
Firma bilgileri

Primary summary:
Finansal özet / alacak yaşlandırma

Metrics:
Açık fatura
Müşteri skoru
Segment
İlk işlem
Toplam işlem

Relationships:
Cari hareketler
Faturalar
Tahsilatlar
Teklifler
Notlar & Belgeler
```

## 18.2 Teklif

Olası presentation:

```text
Primary info:
Teklif bilgileri

Primary summary:
Tutar / durum / marj özeti

Metrics:
Toplam tutar
Geçerlilik
Kalem sayısı
Durum
Revision/version

Relationships:
Kalemler
Müşteri
Aktivite
Onay/versiyon geçmişi
Belgeler
```

## 18.3 Fatura

```text
Primary info:
Fatura bilgileri

Primary summary:
Ödeme / bakiye özeti

Metrics:
Fatura tutarı
Ödenen
Kalan
Vade
Durum

Relationships:
Kalemler
Tahsilatlar
Müşteri
Hareketler
Belgeler
```

## 18.4 Görev

```text
Primary info:
Görev bilgileri

Primary summary:
Durum / zaman / sorumluluk

Metrics:
Öncelik
Termin
Durum
Oluşturulma
Tamamlanma

Relationships:
Aktivite
İlgili kayıtlar
Notlar
Belgeler
```

Yalnız repository'deki gerçek model ve capability'ler uygulanır.

---

# 19. Progressive Disclosure Contract

Detail workspace bile bütün bilgiyi aynı anda göstermemelidir.

Bilgi hiyerarşisi:

```text
LEVEL 1
Entity identity

LEVEL 2
General summary

LEVEL 3
Compact entity metrics

LEVEL 4
Recent activity

LEVEL 5
Relationship tabs / full history / documents
```

Kullanıcı ihtiyaç duydukça derine iner.

---

# 20. Scroll Contract

Detail content permitted workspace region'ını aşarsa yalnız workspace detail content scroll eder.

Parent page global scroll oluşturmaz.

Öneri:

```css
.detail-workspace {
  display: grid;
  grid-template-rows:
    auto
    auto
    minmax(0, 1fr);
}

.detail-content {
  min-height: 0;
  overflow-y: auto;
}
```

Entity identity ve tab context'i mümkün olduğunca görünür tutulmalıdır.

Persistent METRIX input safe-zone değişmez.

---

# 21. Edit Mode Boundary

Referanstaki edit control read-mode header'da görünür.

Edit seçildiğinde:

- canonical edit capability kullanılır;
- read surface'in tamamı rastgele forma dönüştürülmez;
- mevcut METRIX edit interaction pattern'i korunur;
- risky field/action varsa canonical approval policy uygulanır.

UI yeni mutation authority oluşturmaz.

---

# 22. METRIX-Driven Detail Operation

METRIX detail workspace'i kullanıcı adına yönetebilir.

Örnek:

```text
User:
"Global Corp'un son tahsilatlarını göster."

METRIX runtime:
customer resolves
→ Müşteriler domain
→ Global Corp entity
→ detail workspace
→ Tahsilatlar relationship surface
```

Visual layer yalnız canonical resolution/navigation state'ini gösterir.

UI text matching ile entity veya tab seçmez.

---

# 23. Visible Execution Principle

METRIX bir detail action gerçekleştirdiğinde kullanıcı mümkün olduğunca sonucu aynı surface üzerinde görmelidir.

Örnek:

```text
"Global Corp'un telefonunu güncelle."

canonical mutation succeeds
        ↓
visible detail field updates
        ↓
METRIX success narration
```

Başarı narrasyonu visible/canonical state ile çelişemez.

---

# 24. Loading Contract

Detail açılırken:

- entity identity biliniyorsa header erken render edilebilir;
- unresolved fields fake data ile doldurulmaz;
- content geometry skeleton ile korunabilir;
- loading state düşük hareketlidir.

Bir relationship tab yüklenirken bütün detail shell tekrar mount edilmemelidir.

---

# 25. Empty Relationship State

Örneğin müşteri için hiç teklif yoksa:

```text
Henüz teklif bulunmuyor.
```

gibi compact state gösterilir.

Eğer canonical capability izin veriyorsa uygun action sunulabilir.

Büyük illustration veya fake placeholder kayıt kullanılmaz.

---

# 26. Error Contract

Bir detail projection yüklenemezse:

- diğer doğrulanmış entity data gereksiz silinmez;
- yalnız başarısız region error state gösterebilir;
- stale data yeni data gibi sunulmaz;
- retry mümkünse lokal olarak sağlanır;
- METRIX narration failure truth ile uyumludur.

---

# 27. Visual Surface Hierarchy

Referansın yüzey katmanları:

```text
detail outer shell
    ↓
header / tabs
    ↓
large primary panels
    ↓
compact metric cards
    ↓
recent activity panel
    ↓
deep-view action
```

Her nested region aynı derecede border/glow almamalıdır.

Depth primarily:

- surface tone;
- subtle border;
- spacing;
- typography

ile kurulmalıdır.

---

# 28. Border / Glow Hierarchy

Önerilen:

```text
outer shell:
subtle blue-grey border

active tab:
violet underline

primary panels:
low-contrast border

metric cards:
even lower contrast border

interactive hover/focus:
temporary cyan/violet luminance

selected/active:
controlled glow
```

Tüm kartların sürekli neon outline taşıması yasaktır.

---

# 29. Typography Contract

Başlangıç hierarchy:

```text
Entity name          20–24px / medium
Tab                  13–15px
Panel title          14–16px / medium
Field label          12–14px / muted
Field value          13–15px / primary
Metric label         11–13px
Metric value         20–26px
Activity label       13–15px
Activity metadata    12–14px
```

Final ölçüler screenshot calibration ile belirlenir.

Financial/numeric values için:

```css
font-variant-numeric: tabular-nums;
```

tercih edilir.

---

# 30. Responsive Detail Behavior

Desktop canonical'dır.

Workspace genişliği daraldıkça:

1. primary two-column summary gerekirse stack olabilir;
2. metric strip wrap/compact grid'e geçebilir;
3. tabs overflow davranışı kontrollü uygulanır;
4. activity columns sadeleşebilir.

Ancak bilgi hiyerarşisi değişmez:

```text
identity
→ relationships
→ summary
→ metrics
→ activity
```

Mobile redesign bu kontratın kapsamı değildir.

---

# 31. Accessibility

- Entity actions keyboard accessible.
- Tabs gerçek tab semantics kullanmalıdır.
- Active tab yalnız renkle belirtilmemelidir.
- Charts accessible text summary taşımalıdır.
- Activity list semantic list/table yapısına uygun olmalıdır.
- Icon-only controls accessible name taşımalıdır.
- Focus-visible net olmalıdır.
- Contrast okunabilirlik standardını korumalıdır.

---

# 32. Data Truth Boundary

Detail workspace yalnız canonical data gösterir.

Presentation layer:

- score hesaplamaz;
- segment belirlemez;
- bakiye türetip canonical değer ilan etmez;
- invoice status tahmin etmez;
- payment reconciliation yapmaz;
- entity relation uydurmaz.

Derived presentation value gerekiyorsa canonical business/domain service tarafından sağlanmalıdır veya açıkça presentation-only calculation olarak tanımlanmış olmalıdır.

---

# 33. No-Redesign Rules

Implementasyon ajanı:

- detail'e sidebar ekleyemez;
- ayrı top navigation ekleyemez;
- entity header'ı hero banner yapamaz;
- her tab'a farklı design language veremez;
- dashboard grid bombardımanı yapamaz;
- sırf boşluğu doldurmak için chart ekleyemez;
- 10+ KPI'yı aynı anda gösteremez;
- recent activity'yi ağır ERP table'a çeviremez;
- edit mode'u canonical runtime dışında kuramaz;
- full-screen detail modal oluşturamaz;
- persistent METRIX input'ı örtemez;
- parent workspace görsel dilinden kopamaz.

---

# 34. Component Boundary Recommendation

Presentation componentleri conceptually:

```text
EntityDetailWorkspace
EntityDetailHeader
EntityActions
EntityRelationshipTabs
DetailSummaryGrid
EntityInformationPanel
EntityAnalyticalSummary
EntityMetricStrip
RecentActivityPanel
DeepViewAction
```

Domain-specific projection componentleri bu ortak shell'e veri verir.

Shared component içine müşteri, teklif veya fatura business rule'u hard-code edilmez.

---

# 35. State Model

Minimum presentation state:

```ts
type DetailWorkspaceState =
  | "opening"
  | "loading"
  | "ready"
  | "partial-error"
  | "error";

type DetailTabState =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error";
```

Entity identity ayrıca canonical resolved entity state'inden gelir.

---

# 36. Navigation / Context Preservation

Overview → detail geçişinde korunacak context:

```text
domain
search/filter state
pagination state
selected entity
conversation
METRIX input availability
```

Detail'den overview'a dönüldüğünde kullanıcı mümkün olduğunca önceki liste bağlamına döner.

Yeni baştan domain yüklemek varsayılan davranış olmamalıdır.

---

# 37. Screenshot Calibration Protocol

Detail implementation ancak fixed-viewport screenshot ile kabul edilir.

Referansla karşılaştırılacak bölgeler:

```text
outer shell
entity header
avatar/marker scale
action placement
tab spacing
active underline
two-column summary proportions
information panel density
chart size
legend alignment
metric-card geometry
activity row density
bottom deep-view control
border luminance
background tone
vertical rhythm
```

Farklar ölçülerek düzeltilir.

Yeni tasarım kararı eklenmez.

---

# 38. Acceptance Checklist

## Identity

- [ ] Entity adı ilk bakışta açık.
- [ ] Optional marker/avatar referans ağırlığında.
- [ ] Header action'ları sağda ve restrained.
- [ ] Header action bombardımanı yok.

## Tabs

- [ ] Relationship tabs entity context içinde.
- [ ] Active tab ince violet accent ile belirgin.
- [ ] Inactive tab'lar muted.
- [ ] Tab değişimi workspace/context kaybettirmiyor.

## Summary

- [ ] Primary information panel okunabilir.
- [ ] Primary analytical summary business-relevant.
- [ ] Chart yalnız anlamlıysa var.
- [ ] Chart dekoratif değil.
- [ ] Panel yoğunluğu referansa yakın.

## Metrics

- [ ] 3–5 entity-level metric.
- [ ] Overview KPI ile entity metric karıştırılmıyor.
- [ ] Score/segment yalnız canonical data varsa.
- [ ] Fake metric yok.

## Activity

- [ ] Son hareketler kronolojik.
- [ ] Event label açık.
- [ ] Related record/value/date kompakt.
- [ ] 4–7 visible row hedefleniyor.
- [ ] Full history için progressive disclosure var.

## Visual

- [ ] Parent workspace dark navy glass dili korunuyor.
- [ ] Cyan/violet vurgu kontrollü.
- [ ] Sürekli neon border bombardımanı yok.
- [ ] Typography hierarchy referansa uygun.
- [ ] Global page scroll yok.

## Runtime

- [ ] Detail canonical entity resolution ile açılıyor.
- [ ] METRIX tab/action seçiminde canonical navigation kullanıyor.
- [ ] Manual ve AI-driven interaction parallel authority yaratmıyor.
- [ ] Mutation success visible state ile doğrulanıyor.
- [ ] Presentation business truth uydurmuyor.

## Parent experience

- [ ] Desktop'ta fullscreen değil.
- [ ] Persistent input korunuyor.
- [ ] Conversation continuity korunuyor.
- [ ] Detail kapanınca domain context kaybolmuyor.

---

# 39. Codex Implementation Directive

```text
METRIX_DETAIL_WORKSPACE_CONTRACT.md is the canonical visual and interaction
contract for entity-detail workspaces.

The supplied detail reference image is the canonical visual reference for:
- entity identity/header
- entity-level actions
- relationship tabs
- primary information panel
- analytical summary panel
- compact entity metrics
- recent activity
- progressive disclosure

This is NOT a Global Corp-only or Customer-only implementation.

Build a shared detail workspace visual system that projects canonical
domain-specific entity data.

Do not:
- redesign the reference
- add a sidebar or navigation rail
- make detail fullscreen on desktop
- cover the persistent METRIX input
- invent tabs
- invent KPIs or entity metrics
- invent scores or segments
- add decorative charts
- create parallel mutation/navigation/business authority
- hard-code Customer business rules into shared detail primitives

Where Customer-specific labels appear in the reference, treat them as an
example of the shared detail hierarchy, not as universal field names.

Domain-specific tabs, information, analytical summaries, metrics,
activities and actions must come from existing canonical METRIX business
contracts and data.

Preserve parent domain-workspace context when entering and leaving detail.

Completion requires fixed-viewport screenshot evidence against the
canonical detail reference. Tests/build alone are insufficient for visual
acceptance.
```

---

# 40. Canonical Detail Statement

METRIX Detail Workspace'in değişmez modeli:

```text
ENTITY IDENTITY
      ↓
RELATED BUSINESS SURFACES
      ↓
PRIMARY INFORMATION + PRIMARY SUMMARY
      ↓
ENTITY-LEVEL METRICS
      ↓
RECENT ACTIVITY
      ↓
DEEPER RELATIONSHIP VIEW / ACTION
```

Detail workspace'in amacı kullanıcıya bütün veritabanını göstermek değildir.

Amaç:

**seçilen business entity'nin kim olduğunu, mevcut durumunu, en önemli metriklerini, ilişkili iş akışlarını ve son hareketlerini tek bakışta anlaşılır hale getirmek; ardından kullanıcı veya METRIX'in doğru derinliğe ve doğru aksiyona ilerlemesini sağlamaktır.**

---

**END OF CONTRACT**
