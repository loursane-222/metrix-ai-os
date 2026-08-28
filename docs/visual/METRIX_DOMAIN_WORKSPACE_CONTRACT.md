# METRIX Domain Workspace Contract

**Dosya:** `METRIX_DOMAIN_WORKSPACE_CONTRACT.md`  
**Durum:** Canonical Workspace Visual / Interaction Contract  
**Sürüm:** 1.0  
**Canonical referans:** Kullanıcı tarafından sağlanan `workspace tasarım 1.jpg`  
**Bağlı üst kontrat:** `METRIX_VISUAL_EXPERIENCE_CONTRACT.md`  
**Kapsam:** Tüm METRIX business domainlerinde kullanılan ortak **Domain Workspace Shell**, KPI alanı, toolbar, liste yapısı, satır davranışı, pagination ve workspace'in ana METRIX yüzeyiyle ilişkisi.  
**Kapsam dışı:** Bir satır/entity açıldığında gösterilecek ayrıntılı **Detail Workspace**. Bu alan ayrı referans görsel ve ayrı kontratla tanımlanacaktır.

---

# 0. Sözleşmenin Amacı

Bu belge yalnız “Müşteriler” ekranını tarif etmez.

Referans görseldeki `Workspace / Müşteriler` yüzeyi, METRIX'in bütün business domainlerinde kullanılacak ortak workspace dilinin canonical görsel örneğidir.

Amaç:

```text
aynı shell
+ aynı görsel hiyerarşi
+ aynı interaction modeli
+ domain'e özgü KPI'lar
+ domain'e özgü entity listesi
+ domain'e özgü aksiyonlar
= METRIX Domain Workspace
```

Domain değiştiğinde workspace başka bir ürün veya başka bir tasarım sistemine dönüşmez.

**Hard rule:** Her domain için ayrı dashboard tasarlanmayacaktır.

---

# 1. Workspace'in Ürün Rolü

Workspace klasik navigation ile gidilen bir sayfa değildir.

Workspace:

- METRIX konuşma bağlamından doğar;
- ilgili domain aktive olduktan sonra açılır;
- METRIX'in kullanıcının gözü önünde işlem yaptığı business surface'tir;
- kullanıcı gerektiğinde aynı surface üzerinde doğrudan işlem yapabilir;
- ana conversation/input deneyimini ortadan kaldırmaz.

Workspace bir **operational projection surface**'tir; yeni bir uygulama kabuğu değildir.

---

# 2. Parent Contract Invariants

`METRIX_VISUAL_EXPERIENCE_CONTRACT.md` içindeki aşağıdaki kurallar workspace tarafından değiştirilemez:

```text
METRIX merkezdir.
Conversation süreklidir.
Input dokunulmazdır.
Domain context ile aktive olur.
Workspace ilgili domain'den doğar.
Workspace desktop'ta fullscreen değildir.
Business truth presentation tarafından üretilmez.
```

Bu kontrat parent kontratı genişletir; override etmez.

Çelişki halinde parent kontratın ana deneyim sınırları geçerlidir.

---

# 3. Canonical Workspace Anatomy

Her domain workspace'i aşağıdaki sırayı korur:

```text
┌────────────────────────────────────────────┐
│ DOMAIN HEADER                          ×   │
│ Workspace / {Domain}                       │
├────────────────────────────────────────────┤
│ KPI 1 │ KPI 2 │ KPI 3 │ KPI 4              │
├────────────────────────────────────────────┤
│ SEARCH              FILTER  VIEW  ACTION   │
├────────────────────────────────────────────┤
│ COLUMN HEADER                              │
├────────────────────────────────────────────┤
│ ENTITY ROW                                 │
│ ENTITY ROW                                 │
│ ENTITY ROW                                 │
│ ENTITY ROW                                 │
│ ...                                        │
├────────────────────────────────────────────┤
│ RESULT COUNT              PAGINATION       │
└────────────────────────────────────────────┘
```

Bu dikey bilgi mimarisi bütün domainlerde invariant'tır.

---

# 4. Workspace Shell

## 4.1 Görsel karakter

Referans görseldeki shell korunacaktır:

- çok koyu lacivert/siyah yüzey;
- hafif transparan/glass karakter;
- ince düşük kontrast perimeter border;
- büyük fakat kontrollü corner radius;
- iç yüzeylerde hafif mavi ton farkı;
- cyan/violet yalnız vurgu ve state için;
- yoğun neon bombardımanı yok;
- okunabilirlik dekorasyondan üstündür.

Başlangıç token'ları:

```css
--workspace-bg: rgba(5, 12, 25, 0.94);
--workspace-surface-1: rgba(12, 24, 43, 0.82);
--workspace-surface-2: rgba(15, 29, 50, 0.72);

--workspace-border: rgba(145, 175, 220, 0.18);
--workspace-divider: rgba(145, 175, 220, 0.11);

--workspace-text: rgba(255,255,255,.94);
--workspace-secondary: rgba(210,222,242,.62);
--workspace-muted: rgba(190,205,230,.42);

--workspace-blue: #3B8CFF;
--workspace-violet: #7554FF;
--workspace-cyan: #43D9FF;
--workspace-positive: #38D878;
```

Final renkler screenshot calibration ile referansa göre kesinleştirilir.

## 4.2 Boyut

Workspace desktop'ta **full-screen değildir**.

Parent surface tarafından ayrılan permitted region içinde çalışır.

Workspace'in yüksekliği:

- üst bara kadar ulaşabilir;
- input safe-zone'a giremez;
- viewport yüksekliğini körlemesine kullanamaz.

Workspace'in genişliği parent visual contract'ta tanımlanan workspace presentation geometrisine uyar.

Bu kontrat workspace'i `100vw × 100vh` yapma yetkisi vermez.

## 4.3 Internal spacing

Referansın ferah fakat kompakt yoğunluğu korunmalıdır.

Başlangıç sistemi:

```text
outer padding:      20–28px
section gap:        16–22px
KPI gap:            12–16px
row horizontal pad: 16–20px
row vertical pad:   11–15px
```

Kesin değerler referans screenshot ile kalibre edilir.

---

# 5. Domain Header

Workspace'in en üstünde sade bir context header bulunur.

Format:

```text
Workspace / {Domain}
```

Örnek:

```text
Workspace / Müşteriler
Workspace / Teklifler
Workspace / Faturalar
Workspace / Tahsilatlar
Workspace / Görevler
```

## 5.1 Header kuralları

- Büyük hero heading kullanılmaz.
- Breadcrumb zinciri uzatılmaz.
- Logo eklenmez.
- Domain icon zorunlu değildir.
- Sağ üstte close (`×`) bulunur.
- Close action workspace'i kapatır ve kullanıcıyı ana METRIX yüzeyine geri bırakır.
- Conversation state kaybolmaz.

Header bilgi verir; navigation bar'a dönüşmez.

---

# 6. KPI Strip — COMMON STRUCTURE, DOMAIN-SPECIFIC CONTENT

Workspace'in ilk bilgi katmanı KPI strip'tir.

Referans Müşteriler örneği:

```text
Toplam Müşteri
Toplam Ciro
Toplam Alacak
Ortalama Vade
```

Bunlar **Müşteriler domainine özgüdür**.

Diğer domainler aynı KPI'ları kopyalamaz.

## 6.1 KPI sayısı

Desktop'ta ideal:

```text
3–4 KPI
```

4 canonical üst sınırdır.

Gerçek domain semantiği 3 KPI gerektiriyorsa boş dördüncü kart yaratılmaz.

5–8 KPI'yı tek satıra sıkıştırmak yasaktır.

## 6.2 KPI anatomy

Her KPI card:

```text
[optional semantic icon] KPI LABEL

PRIMARY VALUE

[optional delta/status] [comparison context]
```

Örnek:

```text
Toplam Ciro
₺28.450.000
+24%  vs geçen ay
```

## 6.3 KPI selection rule

KPI'lar:

- domainin en önemli yönetim göstergelerini temsil eder;
- listede zaten görünen detayları tekrarlamak için kullanılmaz;
- yalnız mevcut canonical business data'dan üretilir;
- UI tarafından hesaplanıp business truth haline getirilmez.

## 6.4 Domain örnekleri

Aşağıdaki örnekler **görsel/semantik rehberdir**; repository'de karşılığı olmayan metric'i yaratma yetkisi vermez.

```text
Müşteriler
- Toplam Müşteri
- Toplam Ciro
- Toplam Alacak
- Ortalama Vade

Teklifler
- Açık Teklif
- Toplam Teklif Tutarı
- Onay Bekleyen
- Dönüşüm Oranı

Faturalar
- Toplam Fatura
- Kesilen Tutar
- Açık Bakiye
- Vadesi Geçen

Tahsilatlar
- Toplam Tahsilat
- Beklenen Tahsilat
- Geciken
- Ortalama Tahsilat Süresi

Görevler
- Açık Görev
- Bugün
- Geciken
- Tamamlanma Oranı
```

Canonical domain model farklıysa canonical data modeli kazanır.

---

# 7. KPI Card Visual Contract

KPI kartları referanstaki gibi:

- aynı yükseklikte;
- eşit görsel ağırlıkta;
- dark translucent surface;
- thin border;
- düşük radius;
- büyük primary value;
- küçük label;
- delta için semantic color

kullanır.

Kartlar grafik paneline dönüşmez.

Yasak:

- mini dashboard charts;
- sparklines sırf dekorasyon için;
- gauge bombardımanı;
- gradient-filled KPI cards;
- her KPI için farklı neon renk;
- büyük icon illustration.

KPI strip bir **executive glance layer**'dır.

---

# 8. Toolbar

KPI strip'in altında tek satırlık operational toolbar bulunur.

Canonical sıra:

```text
SEARCH | FILTER | OPTIONAL VIEW/UTILITY | PRIMARY ACTION
```

Referans Müşteriler:

```text
[Müşteri ara...] [Filter] [Utility] [+ Yeni Müşteri]
```

## 8.1 Search

Search alanı toolbar'ın en geniş öğesidir.

Placeholder domain'e göre değişir:

```text
Müşteri ara...
Teklif ara...
Fatura ara...
Görev ara...
```

Search yalnız presentation filter ise server/business semantics'i değiştirmez.

## 8.2 Filter

Filter compact icon button olarak kalabilir.

Açıldığında domainin gerçek filtre yeteneklerini kullanır.

UI yeni filtre semantiği uydurmaz.

## 8.3 Utility / view control

Referanstaki üçüncü küçük kontrol **zorunlu global kontrol değildir**.

Yalnız ilgili domainde gerçek işlev varsa gösterilir.

Boş dekoratif buton eklenmez.

## 8.4 Primary action

Sağ uçta domainin temel create/action kontrolü bulunabilir.

Örnek:

```text
+ Yeni Müşteri
+ Yeni Teklif
+ Yeni Fatura
+ Yeni Görev
```

Domainin create capability'si yoksa buton gösterilmez.

Primary action:

- violet/blue luminous treatment;
- yüksek contrast;
- tek baskın CTA

olmalıdır.

Bir toolbar'da birden fazla primary CTA bulunmaz.

---

# 9. Entity List — CORE DOMAIN PATTERN

Workspace'in ana gövdesi **liste**dir.

Bu liste data-heavy enterprise table'a dönüşmemelidir.

Kullanıcının açık kuralı:

> Satırlarda detay bombardımanı olmayacak.

## 9.1 Information density

Default workspace listesi entity'yi hızlı tanımak ve seçmek için gereken minimum bilgiyi gösterir.

Müşteri referansı:

```text
Müşteri                 Bakiye
Global Corp             ₺1.250.000      >
Teknoloji A.Ş.          ₺980.000        >
```

Yani:

```text
PRIMARY IDENTITY
ONE HIGH-VALUE SECONDARY VALUE
DISCLOSURE / OPEN DETAIL
```

temel pattern'dir.

## 9.2 Domain adaptation

Aynı yapı diğer domainlere semantik olarak adapte edilir.

Örnek:

```text
Teklif
Teklif / Müşteri                Tutar
TKL-2026-0042 · Global Corp     ₺425.000    >

Fatura
Fatura / Müşteri                Bakiye
FTR-2026-0188 · Global Corp     ₺120.000    >

Görev
Görev                           Durum
Sözleşme revizyonunu tamamla    Bugün       >
```

Ancak her domain için **2–3 kolon daha ekleyelim** yaklaşımı default değildir.

## 9.3 Progressive disclosure

Detay workspace'e taşınır.

Listede görünmemesi gereken tipik bilgiler:

- tam adres;
- telefon;
- e-posta;
- uzun status history;
- cari hareket detayları;
- invoice line items;
- tüm tarihler;
- kullanıcı notları;
- score breakdown;
- belge listesi.

Ana liste scan surface'tir; detail surface değildir.

---

# 10. List Header

List header yalnız mevcut kolonların isimlerini gösterir.

Referans:

```text
Müşteri                         Bakiye
```

Header:

- düşük contrast;
- row'lardan daha küçük;
- sticky olabilir;
- ayrı ağır toolbar görünümü oluşturmaz.

---

# 11. Entity Row

Her satır tek bir entity'yi temsil eder.

## 11.1 Anatomy

Minimum:

```text
[optional identity marker] PRIMARY LABEL    SECONDARY VALUE    >
```

Müşteri örneğindeki harf/avatar dairesi identity helper'dır.

Tüm domainlerde harf avatarı zorunlu değildir.

Domain semantiğine uygun küçük marker kullanılabilir.

## 11.2 Row height

Row'lar kompakt fakat rahat tıklanabilir olmalıdır.

Başlangıç hedefi:

```css
min-height: 52px;
```

Pointer ve touch accessibility korunur.

## 11.3 Default state

Default row:

- transparent/dark;
- subtle divider;
- primary text açık;
- secondary value sağa hizalı;
- disclosure icon düşük contrast.

## 11.4 Hover

Hover:

- hafif surface lift;
- border/edge luminance artışı;
- cursor pointer;
- layout shift yok.

## 11.5 Selected / focused

Referans `Global Corp` satırındaki cyan-violet outline selected/focused state örneğidir.

Selected state:

- ince luminous outline;
- düşük yoğunluklu iç glow;
- text contrast artışı;
- satır boyutu değişmez.

Bu glow bütün satırlarda sürekli açık tutulmaz.

---

# 12. Row → Detail Transition

Bir entity row'a tıklanınca entity detail açılır.

Bu kontrat detail'in iç tasarımını tanımlamaz.

Sadece transition contract:

```text
Domain Workspace
      ↓
select entity
      ↓
selection state acknowledged
      ↓
Detail Workspace
```

Detail açıldığında entity identity kaybolmamalıdır.

Kullanıcı hangi domain ve hangi entity içinde olduğunu anlayabilmelidir.

Detail tasarımının:

- bilgileri;
- cari hareketleri;
- faturaları;
- tahsilatları;
- teklifleri;
- müşteri skorunu;
- segmenti;
- domain'e özgü diğer ilişkili bilgileri

nasıl göstereceği **METRIX_DETAIL_WORKSPACE_CONTRACT.md** ile ayrıca tanımlanacaktır.

Bu kontratı implement eden ajan detail layout uyduramaz.

---

# 13. Pagination / Result Footer

Liste footer'ında iki işlev bulunur:

```text
result range / total
pagination
```

Referans:

```text
1–8 / 1248                         < 1 2 3 … 156 >
```

## 13.1 Kurallar

- Footer compact kalır.
- Pagination listeden görsel olarak daha baskın olmaz.
- Current page subtle violet state kullanabilir.
- Page değişimi workspace shell'i kapatmaz.
- Search/filter state korunur.
- Business data pagination semantics mevcut API/data layer'a uyar.

Infinite scroll sırf modern görünmesi için eklenmez.

---

# 14. Workspace Scroll Contract

Workspace shell viewport dışına taşmamalıdır.

Header/KPI/toolbar mümkün olduğunca context olarak korunurken entity listesi kendi available region'ında scroll edebilir.

Önerilen yapı:

```css
.workspace {
  display: grid;
  grid-template-rows:
    auto
    auto
    auto
    minmax(0, 1fr);
}

.entity-list-region {
  min-height: 0;
  overflow-y: auto;
}
```

Global page scroll oluşturulmaz.

Persistent METRIX input safe-zone ihlal edilmez.

---

# 15. Cross-Domain Component Model

Tüm domainler ortak component primitive'lerini kullanmalıdır.

Conceptual model:

```tsx
<DomainWorkspaceShell domain={domain}>
  <WorkspaceHeader />
  <DomainKpiStrip />
  <DomainToolbar />
  <EntityList>
    <EntityRow />
  </EntityList>
  <Pagination />
</DomainWorkspaceShell>
```

Bu kod birebir zorunlu API değildir; architecture intent'i gösterir.

Hard architectural principle:

```text
shared visual shell
≠ shared business semantics
```

Yani aynı component dili kullanılmalı fakat Müşteriler mantığı Teklifler domainine kopyalanmamalıdır.

---

# 16. Domain Configuration Boundary

Presentation mapping gerekiyorsa aşağıdaki gibi explicit ve typed olabilir:

```ts
type DomainWorkspacePresentation = {
  domainId: DomainId;
  title: string;
  searchPlaceholder: string;
  kpis: WorkspaceKpiDefinition[];
  primaryAction?: WorkspaceActionDefinition;
  columns: WorkspaceColumnDefinition[];
  rowPresentation: WorkspaceRowPresentation;
};
```

Ancak:

- business query;
- permission;
- calculation;
- mutation;
- approval;
- persistence

bu presentation config içinde tanımlanmaz.

---

# 17. METRIX-Driven Operation Contract

Workspace yalnız kullanıcının elle tıkladığı UI değildir.

METRIX aynı surface üzerinde kullanıcı adına işlem yapabilir.

Örnek:

```text
User:
"Global Corp'u aç."

METRIX:
Müşteriler workspace'i açar.
Global Corp satırını bulur.
Selection state görünür.
Detail workspace'e geçer.
```

veya:

```text
User:
"Yeni müşteri ekle."

METRIX:
Müşteriler domainini aktive eder.
Workspace'i açar.
Canonical create flow'u başlatır.
İşlem presentation'da görünür.
```

UI'nin gösterdiği state ile METRIX'in söylediği state çelişemez.

---

# 18. User-Driven Operation Contract

Kullanıcı aynı workspace'i manuel olarak da kullanabilir.

Desteklenebilecek interaction'lar:

- search;
- filter;
- pagination;
- row selection;
- primary action;
- close.

Bu manuel işlemler METRIX runtime ile paralel, bağımsız bir business authority oluşturmamalıdır.

Aynı canonical action/data yolları kullanılmalıdır.

---

# 19. Loading State

Workspace açıldığında fake data gösterilmez.

Loading:

- shell geometry'yi korur;
- KPI alanı ve listede restrained skeleton kullanılabilir;
- neon pulse bombardımanı yapılmaz;
- layout data geldiğinde sıçramamalıdır.

METRIX başarı narrasyonu data gerçekten hazır olmadan üretilmemelidir.

---

# 20. Empty State

Entity bulunmuyorsa liste alanında sade empty state gösterilir.

Örnek:

```text
Henüz müşteri yok.
```

ve domain izin veriyorsa ilgili primary action.

Empty state:

- full-screen illustration değildir;
- ecosystem görsel dilini taklit eden büyük dekorasyon içermez;
- KPI truth'u uydurmaz.

---

# 21. Error State

Workspace data load başarısızsa:

- eski data yeniymiş gibi gösterilmez;
- hatayı gizleyen endless skeleton kullanılmaz;
- compact error state gösterilir;
- uygun retry action varsa sunulur;
- METRIX konuşması aynı failure truth ile uyumlu olur.

---

# 22. Permissions / Capability Visibility

Bir action kullanıcının yetkisinde değilse presentation canonical policy sonucuna uyar.

UI kendi permission sistemi oluşturmaz.

Primary action'ın görünürlüğü/disabled state'i mevcut capability/policy authority'sinden gelir.

---

# 23. Typography Contract

Referans görselin hiyerarşisi korunur.

Önerilen başlangıç:

```text
Workspace title      20–24px / medium
KPI label            12–14px / medium
KPI value            22–30px / regular-medium
KPI comparison       11–12px
Search/input          14px
Column header         12–13px
Row primary           14–16px
Row secondary         14–16px
Pagination            13–14px
```

Kesin değerler screenshot calibration ile belirlenir.

Tabular financial values mümkünse:

```css
font-variant-numeric: tabular-nums;
```

kullanır.

---

# 24. Monetary / Numeric Presentation

Workspace presentation locale-aware olmalıdır.

Türkçe/TL örneği:

```text
₺28.450.000
₺1.250.000
1.248
32 Gün
```

Formatting UI tarafından business value değiştirmeden yapılır.

Negatif/pozitif delta semantic olarak ayrılır.

Renk tek anlam taşıyıcısı değildir; `+`, `-`, label veya icon da state'i açıklar.

---

# 25. Icon Contract

KPI iconları ve toolbar iconları aynı visual family içinde olmalıdır.

Referans dili:

- küçük;
- luminous;
- cyan/blue/violet;
- dark translucent icon well;
- kontrollü glow.

Yasak:

- emoji;
- rastgele farklı icon setleri;
- dev illustration;
- multicolor consumer-app iconography.

---

# 26. Primary CTA Contract

Referanstaki `+ Yeni Müşteri` butonu ortak CTA stilinin canonical örneğidir.

Visual:

```text
violet → blue/violet controlled gradient
white text
subtle outer glow
rounded rectangle
high contrast
```

Hover:

- luminance hafif artar;
- scale animation ya hiç kullanılmaz ya çok minimaldir.

Primary CTA workspace'in tek en baskın interactive control'üdür.

---

# 27. Focus / Keyboard Contract

Workspace keyboard ile kullanılabilir olmalıdır.

Beklenen sıra:

```text
close
→ search
→ filter
→ utility
→ primary action
→ rows
→ pagination
```

Gerçek DOM sırası doğal interaction akışını desteklemelidir.

Selected row ile keyboard focus birbirine karıştırılmamalıdır.

Focus-visible state açıkça görünmelidir.

---

# 28. Workspace Animation

Workspace açılış animasyonunun origin davranışı parent contract'a tabidir.

Workspace içindeki component'ler açılırken büyük staggered animation yapılmaz.

Öneri:

```text
shell emergence
→ 40–100 ms sonra content opacity
→ data ready state
```

KPI kartlarının tek tek zıplaması, row'ların tek tek uçması yasaktır.

Workspace operational surface'tir; intro animation değildir.

---

# 29. Visual Density Invariant

Workspace'in temel ilkesi:

**summary first, scan second, detail on demand.**

Bu nedenle:

```text
KPI → hızlı durum
Toolbar → işlem
List → tarama/seçim
Detail → derin bilgi
```

Her şeyi aynı ekrana doldurmak kontrata aykırıdır.

Özellikle ana listede detail bombardımanı yasaktır.

---

# 30. Domain Adaptation Rules

Yeni bir domain workspace'i oluşturulurken implementasyon ajanı şu soruları sırayla cevaplamalıdır:

```text
1. Bu domainin canonical entity'si nedir?
2. Yönetici için en değerli 3–4 KPI hangileridir?
3. Entity'yi listede tanımak için gereken primary identity nedir?
4. Scan sırasında gereken tek en değerli secondary value/status nedir?
5. Domainin gerçek primary action'ı var mı?
6. Hangi filtreler canonical olarak mevcut?
7. Satıra tıklanınca hangi canonical detail entity açılır?
```

Bu soruların cevabı repository/business contract'tan gelmelidir.

UI tasarımcısı business semantics uydurmaz.

---

# 31. Prohibited Patterns

Kesinlikle yasaktır:

- her domain için farklı workspace layout;
- dashboard tile bombardımanı;
- 5+ KPI'yı tek satıra sıkıştırmak;
- ana listede çok kolonlu ERP tablosu;
- her satıra çok sayıda action icon koymak;
- her satırda chart;
- workspace içinde ikinci sidebar;
- workspace içinde navigation rail;
- domain menüsü;
- full-screen desktop workspace;
- persistent input'ın kapanması;
- generic modal styling;
- bright white workspace;
- primary CTA dışında her şeyi neon yapmak;
- fake KPI;
- UI'da hesaplanan canonical olmayan business metric;
- domain-specific business logic'i shared visual component'e gömmek.

---

# 32. Detail Workspace Boundary

Bu kontrat yalnız **domain overview workspace** içindir.

Entity detail için aşağıdaki alanlar intentionally deferred'dır:

```text
Detail header
Entity identity
Detail KPI strip
Tabs
General information
Financial movements
Invoices
Collections
Offers
Tasks
Documents
Scores
Segments
Timeline
Entity actions
Edit behavior
Detail-level navigation
```

Referans Müşteri detayında istenen:

```text
müşteri bilgileri
cari hareketler
kesilen faturalar
tahsilatlar
teklifler
müşteri skoru
potansiyel segmenti
...
```

gibi yapıların nasıl sunulacağı sonraki canonical detail reference ile belirlenecektir.

**Implementasyon ajanı bu kontrattan detail tasarımı türetemez.**

---

# 33. Screenshot Acceptance Protocol

Workspace implementasyonu yalnız test/build başarısıyla kabul edilmez.

Her canonical viewport için screenshot alınır.

Karşılaştırılacak bölgeler:

```text
shell geometry
header position
KPI card proportions
KPI spacing
toolbar proportions
search width
CTA visual weight
list density
row height
selected-row treatment
financial alignment
footer/pagination
background tone
border luminance
corner radius
overall vertical rhythm
```

Referansla fark görüldüğünde yalnız fark kalibre edilir.

Redesign yapılmaz.

---

# 34. Acceptance Checklist

## Shell

- [ ] Workspace referanstaki koyu premium glass yüzeyi taşıyor.
- [ ] Desktop'ta fullscreen değil.
- [ ] Parent METRIX input safe-zone korunuyor.
- [ ] Header sade.
- [ ] Close control mevcut.
- [ ] Sidebar/menu yok.

## KPI

- [ ] 3–4 domain-relevant KPI.
- [ ] KPI'lar canonical data'dan geliyor.
- [ ] Kart geometrisi tutarlı.
- [ ] Primary value kolay taranıyor.
- [ ] Gereksiz chart yok.

## Toolbar

- [ ] Search ana geniş kontrol.
- [ ] Filter compact.
- [ ] Utility yalnız gerçek capability varsa.
- [ ] En fazla bir primary CTA.
- [ ] CTA domain'e uygun.

## List

- [ ] Ana içerik satır satır liste.
- [ ] Detail bombardımanı yok.
- [ ] Primary identity açık.
- [ ] Yalnız yüksek değerli secondary field/status gösteriliyor.
- [ ] Row detail'e açılıyor.
- [ ] Selected state referanstaki cyan/violet dili koruyor.

## Footer

- [ ] Result range/total var.
- [ ] Pagination compact.
- [ ] Current page görünür.
- [ ] State değişiminde workspace gereksiz kapanmıyor.

## Cross-domain

- [ ] Aynı shell tüm domainlerde kullanılabiliyor.
- [ ] Domain değişince business semantics doğru değişiyor.
- [ ] Yeni domain için yeni dashboard yaratılmıyor.
- [ ] Shared visual component business authority taşımıyor.

## Runtime

- [ ] METRIX voice/text commands workspace'i canonical yollarla yönetiyor.
- [ ] User manual interaction aynı canonical state/action modelini kullanıyor.
- [ ] UI business truth uydurmuyor.
- [ ] Loading/error/success narration visible state ile çelişmiyor.

## Deferred detail

- [ ] Entity detail layout bu implementasyonda uydurulmadı.
- [ ] Detail ayrı kontratı bekliyor.

---

# 35. Codex Implementation Directive

```text
METRIX_DOMAIN_WORKSPACE_CONTRACT.md is the canonical contract for all
domain overview workspaces.

The supplied workspace reference image is the canonical visual reference
for the workspace shell, KPI hierarchy, toolbar, compact entity list,
selected-row treatment and pagination.

This is NOT a customer-only design.

Implement one coherent workspace visual system that can project different
canonical business domains without creating a separate dashboard design
for each domain.

Preserve:
- shell geometry
- visual density
- KPI-first hierarchy
- compact toolbar
- minimal entity rows
- progressive disclosure
- dark navy glass treatment
- cyan/violet accent hierarchy

Do not:
- add a sidebar
- add domain navigation
- make the workspace fullscreen on desktop
- hide or cover the persistent METRIX input
- turn lists into dense ERP tables
- invent KPIs
- invent domain capabilities
- implement the entity-detail visual design from assumptions
- create parallel business/action/navigation authority

Domain-specific KPI definitions, row semantics, actions and filters must
come from the existing canonical METRIX domain/runtime/data contracts.

The detail workspace is intentionally deferred to a separate canonical
reference and contract.

Completion requires screenshot evidence against the supplied canonical
workspace reference. Tests/build alone are insufficient for visual
acceptance.
```

---

# 36. Canonical Workspace Statement

METRIX Domain Workspace'in değişmez modeli:

```text
DOMAIN CONTEXT
      ↓
3–4 EXECUTIVE KPIs
      ↓
SEARCH / FILTER / PRIMARY ACTION
      ↓
MINIMAL SCANNABLE ENTITY LIST
      ↓
SELECT ENTITY
      ↓
DETAIL WORKSPACE
```

Workspace'in görevi bütün business bilgisini tek yüzeye yığmak değildir.

Görevi:

**ilgili domainin durumunu birkaç saniyede göstermek, doğru entity'yi buldurmak ve METRIX'in ya da kullanıcının bir sonraki business action'a doğal biçimde geçmesini sağlamaktır.**

---

**END OF CONTRACT**
