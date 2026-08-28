# METRIX Visual Experience Contract

**Dosya:** `METRIX_VISUAL_EXPERIENCE_CONTRACT.md`  
**Durum:** Canonical Visual / Interaction Contract  
**Sürüm:** 1.0  
**Kapsam:** METRIX ana masaüstü deneyimi — ekosistem yüzeyi, merkez hub, domain ağı, konuşma alanı, sabit input ve workspace açılış davranışı.  
**Kapsam dışı:** Workspace iç tasarımı ve entity/detail workspace iç tasarımı. Bunlar ayrı referans görseller üzerinden sonraki kontratlarda tanımlanacaktır.

---

## 0. Sözleşmenin Amacı

Bu belge, METRIX'in ana görsel deneyimini yeniden tasarlamak için değil, mevcut canonical referans görselin görsel dilini ve kullanıcı tarafından açıkça belirlenmiş davranış düzeltmelerini implementasyon sözleşmesine dönüştürmek için vardır.

Bu belgeyi kullanan implementasyon ajanının görevi **tasarım yapmak değil, sözleşmeyi uygulamaktır**.

Referans görsel ile bu sözleşme arasında görev dağılımı şöyledir:

- **Referans görsel:** renk, atmosfer, ışık dili, zemin tonu, merkez hub karakteri, domain ikon karakteri, bağlantı ağının görsel yoğunluğu ve genel kompozisyon için canonical kaynaktır.
- **Bu sözleşme:** referans görselde hatalı/konsept seviyesinde olan alanları düzeltir; gerçek METRIX UX davranışını, geometrik invariant'ları ve implementasyon sınırlarını tanımlar.
- Kullanıcının bu sözleşmede açıkça belirtilen düzeltmeleri, referans görseldeki çelişen öğelerden üstündür.

**Hard rule:** Referans görselden esinlenilmiş alternatif bir dashboard üretilmeyecektir. Görsel dil yeniden yorumlanmayacaktır.

---

# 1. Ürün Deneyimi İlkesi

METRIX bir dashboard veya menü tabanlı SaaS arayüzü değildir.

Ana ekran, kullanıcının METRIX ile konuştuğu ve işletmenin domainlerini yaşayan bir dijital ekosistem olarak gördüğü tek bir çalışma yüzeyidir.

Kullanıcı:

1. METRIX ile yazar veya konuşur.
2. METRIX konuşmanın bağlamını anlar.
3. İlgili business domain görsel olarak aktive olur.
4. Merkez METRIX hub'dan ilgili domaine enerji/veri akışı görünür.
5. Gerekli olduğunda workspace, ilgili domain noktasından doğarak açılır.
6. METRIX işlemleri kullanıcının gözü önünde workspace üzerinde gerçekleştirir.
7. Sohbet ve input hiçbir zaman çalışma yüzeyi tarafından yok edilmez veya ezilmez.

Ana deneyim **conversation-first + living-business-ecosystem** modelidir.

---

# 2. Canonical Ekran Yapısı

Ana desktop yüzeyinde yalnız aşağıdaki kalıcı yapılar bulunur:

1. Sol üst: **Geçmiş Sohbetler** ikonu.
2. Sağ üst: **Ayarlar** ikonu.
3. Merkez/üst-orta ana alan: **METRIX Ecosystem Visual Field**.
4. Ecosystem içinde: **METRIX Central Hub**.
5. Hub çevresinde: **Business Domain Nodes**.
6. Hub ile domainler arasında: **Energy / Data Connection Network**.
7. Alt bölümde: **Conversation Stream**.
8. Ekranın en altında: **Persistent Universal Input / Textbox**.

### 2.1 Yasaklanan kalıcı UI

Ana yüzeyde aşağıdakiler bulunmayacaktır:

- sol sidebar;
- navigation rail;
- hamburger menü;
- domain menüsü;
- üstte METRIX wordmark;
- üstte ürün adı;
- klasik dashboard navigation;
- bottom navigation dock;
- sürekli açık workspace;
- tam ekran workspace.

METRIX adı/logo kimliği ana olarak **merkez hub içinde** yaşar.

---

# 3. Viewport ve Kompozisyon

## 3.1 Desktop-first hedef

Canonical desktop implementasyonu standart kullanıcı ekranları için tasarlanmalıdır; referans görseldeki fiziksel olarak aşırı geniş ekran oranı birebir viewport kabul edilmemelidir.

Öncelikli acceptance viewport'ları:

- 1920 × 1080
- 1728 × 1117
- 1512 × 982
- 1440 × 900
- 1366 × 768

Ana kompozisyon viewport'a oransal olarak ölçeklenmeli, fakat UI öğeleri viewport genişliğiyle doğrusal biçimde devleşmemelidir.

## 3.2 Safe frame

Ana yüzey:

```css
position: relative;
width: 100vw;
height: 100dvh;
overflow: hidden;
```

Sayfanın kendisinde global scroll bulunmaz.

İç bölgeler gerektiğinde kendi scroll davranışını yönetebilir.

## 3.3 Dikey zonlar

Ana ekran kavramsal olarak üç bölgeye ayrılır:

```text
┌─────────────────────────────────────────────┐
│              ECOSYSTEM FIELD                │
│                                             │
│             DOMAIN NETWORK                  │
│                  + HUB                      │
│                                             │
├─────────────────────────────────────────────┤
│            CONVERSATION STREAM              │
├─────────────────────────────────────────────┤
│             UNIVERSAL INPUT                 │
└─────────────────────────────────────────────┘
```

Bunlar sert görünür bölücüler değildir.

Ecosystem ile conversation aynı atmosferin parçalarıdır.

---

# 4. Background / Atmosfer

Referans görseldeki zemin karakteri korunacaktır.

## 4.1 Temel karakter

Zemin:

- koyu lacivert / siyaha yakın;
- düz saf siyah değildir;
- merkez çevresinde çok düşük yoğunluklu mavi/mor ışık yayılımına sahiptir;
- kenarlara doğru kararan vignette içerir;
- yüksek kontrastlı ancak premium ve sakin bir teknoloji yüzeyi hissi verir.

Başlangıç implementasyon token'ları referansa görsel olarak kalibre edilmek üzere yaklaşık:

```css
--metrix-bg-0: #050914;
--metrix-bg-1: #081020;
--metrix-bg-2: #0B1428;

--metrix-cyan: #45D9FF;
--metrix-blue: #3478FF;
--metrix-violet: #7657FF;
--metrix-magenta: #D44BD8;

--text-primary: rgba(255,255,255,.94);
--text-secondary: rgba(220,230,255,.68);
--text-muted: rgba(190,205,235,.42);
```

**Not:** Bunlar canonical renk örneği değil, başlangıç token'larıdır. Final değerler screenshot/reference calibration sırasında referans görsele göre ayarlanacaktır.

## 4.2 Atmosfer katmanları

Arka plan tek gradient ile oluşturulmamalıdır.

Minimum katman:

1. base dark field;
2. central radial illumination;
3. subtle blue atmospheric haze;
4. violet/magenta lower glow;
5. edge vignette;
6. düşük yoğunluklu network particles / micro UI marks.

Noise kullanılırsa fark edilir grain oluşturmamalıdır.

---

# 5. Üst Kontroller

## 5.1 Geçmiş sohbetler

Sol üstte yalnız geçmiş sohbetler ikonu bulunur.

```text
position: top-left
visual weight: low
default: muted
hover/focus: subtle cyan/violet illumination
```

METRIX logosu veya `METRIX` yazısı bunun yanında bulunmaz.

## 5.2 Ayarlar

Sağ üstte yalnız ayarlar ikonu bulunur.

Geçmiş sohbetler ikonu ile aynı görsel ağırlık ailesini kullanır.

Üst kontroller ecosystem hub ile görsel rekabete girmemelidir.

---

# 6. METRIX Central Hub

Central Hub ana ekranın görsel ve semantik merkezidir.

## 6.1 Ölçek

Referans görseldeki hub karakteri korunur ancak fiziksel boyutu normal desktop viewport için küçültülür.

Hub ekranı domine etmemelidir.

Önerilen responsive çap:

```css
--hub-size: clamp(150px, 13vw, 220px);
```

Bu değer screenshot calibration ile kesinleştirilecektir.

## 6.2 Yapı

Hub en az aşağıdaki görsel katmanlardan oluşur:

```text
outer atmospheric glow
outer energy ring(s)
thin luminous rim
glass / translucent shell
inner dark-blue volume
lower violet/magenta light
METRIX mark
METRIX AI label
```

Hub düz bir gradient circle değildir.

Derinlik:

- çoklu radial gradients;
- inset highlights;
- outer glow;
- low-opacity rings;
- controlled blur

ile oluşturulur.

## 6.3 Kimlik

Hub içinde:

```text
[M mark]
METRIX AI
```

bulunabilir.

Ana yüzeyde ayrıca büyük METRIX wordmark kullanılmaz.

---

# 7. Domain Sistemi

Domainler METRIX'in işletme kabiliyetlerinin yaşayan uç noktalarıdır.

Domain adları repository'deki canonical capability/domain modelinden gelmelidir; görsel implementasyon yeni domain uydurmamalıdır.

Referans görselde görülen örnekler yalnız görsel konumlandırma örnekleridir.

## 7.1 Domain node anatomy

Her node:

```text
icon / luminous object
soft circular aura
domain label
optional state indication
connection termination
```

içerir.

Node'lar klasik button/card görünümünde olmamalıdır.

## 7.2 Default / neutral state

Konuşma ilgili domaini ilgilendirmiyorsa domain bilinçli olarak arka plana çekilir.

Neutral state hedefi:

```css
opacity: 0.30 - 0.48;
filter: blur(1.5px - 3px);
```

Label okunabilirliği düşük olmalıdır ancak node tamamen kaybolmamalıdır.

Bu blur görsel hata değil, interaction semantics'tir.

## 7.3 Relevant / active state

Konuşma belirli domainle ilişkili olduğunda:

- blur azalır;
- opacity yükselir;
- label netleşir;
- ikon glow'u artar;
- ilgili connection route görünür şekilde aktive olur;
- merkezden domaine doğru enerji akışı başlar.

Örnek:

```text
User: "ABC müşterisinin cari bakiyesine bak."

Müşteriler:
neutral → relevant → active

Diğer domainler:
neutral olarak kalır.
```

---

# 8. Connection Network — HARD VISUAL INVARIANT

Bu bölüm görsel implementasyonun en kritik sözleşmelerinden biridir.

Referans görseldeki bağlantılar **organik ahtapot kolları değildir**.

## 8.1 Teknoloji

Ana network tercihen SVG ile uygulanmalıdır.

```html
<svg>
  <defs>...</defs>
  <g id="secondary-traces">...</g>
  <g id="primary-routes">...</g>
  <g id="energy-particles">...</g>
</svg>
```

Freehand CSS curves veya rastgele canvas spline üretimi kullanılmamalıdır.

## 8.2 Primary horizontal trunks

Merkez hub'ın tam sağ ve sol orta ekseninden iki ana hat çıkar.

Bunlar network'ün görsel omurgasıdır.

Hard rules:

- hub'dan yatay tangent ile çıkar;
- başlangıç segmenti düzdür;
- ağırlıklı olarak düz yatay ilerler;
- diğer connection'lardan daha kalındır;
- gereksiz dalga içermez;
- sağ ve sol kompozisyonu stabilize eder.

Concept:

```text
DOMAIN ======== [ METRIX ] ======== DOMAIN
```

Gerçek render çok katmanlıdır; yukarıdaki yalnız geometriyi ifade eder.

## 8.3 Secondary domain routes

Diğer domain yolları:

1. hub'dan düz segmentle çıkar;
2. gerekiyorsa tek ana yön değişimi yapar;
3. dönüş kontrollü, geniş radius hissine sahip cubic Bézier ile yapılır;
4. dönüşten sonra yeniden düzleşir;
5. domain node'a kontrollü trajectory ile ulaşır.

Concept:

```text
              ───────── DOMAIN
             /
[ METRIX ]───
```

Dönüş keskin köşe değildir; ancak sürekli dalgalanan spline da değildir.

## 8.4 Yasak geometri

Kesinlikle yasaktır:

- tentacle geometry;
- sürekli S-curve;
- sinusoidal yollar;
- bir path üzerinde tekrarlayan sağ-sol dalgalar;
- rastgele bezier;
- spider-web simetrisi;
- tüm yolların aynı stroke kalınlığında olması;
- hub çevresinden gevşek organik kollar çıkması.

## 8.5 Secondary micro-traces

Her ana bağlantının çevresinde daha ince ikincil yollar bulunur.

Bunlar referans görseldeki canlılığın temel bileşenidir.

Micro-trace kuralları:

- primary route'u birebir duplicate etmez;
- ana hattın üstünde ve altında dağılım gösterir;
- bazıları optik olarak ana hattın arkasından geçer;
- bazıları daha erken ayrılır veya daha geç birleşir;
- stroke weight ana hattan belirgin biçimde küçüktür;
- opacity düşüktür;
- bazı trace'ler domain node'a kadar gitmeyebilir;
- küçük veri noktaları / glyph / particle noktaları taşıyabilir.

Amaç:

**kablo değil, yaşayan data/energy bus.**

## 8.6 Stroke hierarchy

Yaklaşık başlangıç hiyerarşisi:

```text
primary trunk        3.0–5.0 px
primary glow         8–18 px optical spread
secondary route      1.5–2.5 px
micro trace          0.5–1.2 px
particle             1.5–4 px
```

Final değerler viewport ve screenshot acceptance sırasında ayarlanır.

---

# 9. Energy Flow Animation

Bağlantılar dekoratif statik çizgiler değildir.

METRIX'in düşünmesi/işlem yapması ile domain ilişkisini gösterir.

## 9.1 Idle

Idle durumda:

- ana network düşük luminance;
- micro-traces çok düşük hareket taşıyabilir;
- sistem tamamen donmuş görünmemelidir;
- hareket dikkat dağıtmamalıdır.

## 9.2 Domain activation

Domain aktive edildiğinde enerji yönü:

```text
METRIX HUB → TARGET DOMAIN
```

olmalıdır.

Akış domain'den merkeze rastgele gidip gelmemelidir.

## 9.3 Uygulama mekanizması

Tercih edilen yöntemler:

- SVG `stroke-dasharray`;
- animated `stroke-dashoffset`;
- path-following particles;
- moving luminance mask;
- controlled glow pulse.

Animasyon mümkün olduğunca:

```css
transform
opacity
filter (sınırlı)
```

üzerinden yürütülmelidir.

Layout reflow oluşturan animasyon kullanılmaz.

## 9.4 Timing

Başlangıç hedefi:

```text
domain relevance transition: 180–320 ms
route illumination:          250–450 ms
energy travel:               900–1600 ms
workspace emergence:         ayrı workspace kontratında kesinleşecek
```

Loop eden enerji akışı mekanik ve tekrar eden GIF hissi vermemelidir.

---

# 10. Conversation Stream

Conversation, ecosystem'in altında fakat aynı yüzey içinde yaşar.

## 10.1 Yerleşim

Mesajlar textbox'ın üzerinde bulunur.

Yeni mesajlar geldikçe conversation yukarı doğru akar.

Textbox yer değiştirmez.

## 10.2 Message visual style

Referans görseldeki yaklaşım korunur:

- koyu translucent surface;
- düşük kontrast border;
- yumuşak radius;
- beyaz/off-white primary text;
- düşük opacity secondary metadata;
- neon yoğunluğu ecosystem'den daha düşüktür.

Chat bubble'lar ana görsel odağı ele geçirmemelidir.

## 10.3 Scroll

Conversation yüksekliği workspace kapalıyken kullanılabilir alana göre büyüyebilir.

Mesaj sayısı sınırı aşınca:

```css
overflow-y: auto;
```

yalnız conversation bölgesinde uygulanır.

Global page scroll oluşmaz.

---

# 11. Universal Input / Textbox — IMMUTABLE UX BOUNDARY

Textbox METRIX'in ana kontrol yüzeyidir.

Hiçbir presentation state textbox'ı ortadan kaldıramaz.

## 11.1 Konum

Textbox:

- ekranın alt bölümünde;
- yatay merkezli;
- desktop'ta kontrollü max-width ile;
- conversation'ın altında;
- safe-area ve viewport bottom spacing korunarak

yerleşir.

Örnek başlangıç:

```css
.input-shell {
  position: absolute;
  left: 50%;
  bottom: max(20px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(760px, calc(100vw - 48px));
}
```

Kesin genişlik screenshot calibration ile belirlenir.

## 11.2 Hard invariants

Workspace dahil hiçbir state:

- textbox'ı kapatamaz;
- textbox'ın üzerine gelemez;
- textbox'ı viewport dışına itemez;
- textbox'ı küçülterek kullanılamaz hale getiremez;
- conversation ile overlap ettiremez.

Input her zaman kullanılabilir olmalıdır.

## 11.3 Visual language

Referans:

- translucent dark glass;
- subtle grey/blue surface;
- thin luminous rim;
- focused durumda violet/cyan glow;
- microphone control;
- text entry;
- gerekli production kontrolleri.

Yeni dekoratif kontrol uydurulmamalıdır.

---

# 12. Workspace Emergence Contract

**Bu bölüm workspace'in iç tasarımını tanımlamaz.**

Yalnız ana yüzeyle olan ilişkisini tanımlar.

## 12.1 Origin

Workspace generic modal gibi ekranın ortasında belirmemelidir.

Workspace, aktif domain node ile görsel nedensellik kurarak açılır.

Sequence:

```text
conversation context
      ↓
domain relevant
      ↓
domain active
      ↓
energy reaches domain
      ↓
domain becomes workspace origin
      ↓
workspace emerges
```

Kullanıcı hangi business context'in açıldığını görsel olarak anlamalıdır.

## 12.2 Fullscreen yasağı

Desktop'ta workspace:

**ASLA TAM EKRAN OLMAZ.**

Ana METRIX conversation/input deneyimi görünür ve erişilebilir kalır.

## 12.3 Input protection

Workspace'in maksimum yüksekliği/yeri belirlenirken önce input safe-zone ayrılır.

Concept:

```text
viewport
 ├─ workspace permitted region
 ├─ conversation continuity region
 └─ immutable input safe-zone
```

Workspace hiçbir koşulda input safe-zone'a sahip olamaz.

## 12.4 Workspace internal design

Aşağıdakiler bu kontratın kapsamı dışındadır:

- KPI layout;
- domain list;
- entity row;
- customer list;
- customer detail;
- cari hareketler;
- faturalar;
- tahsilatlar;
- teklifler;
- skor/segment;
- workspace tabs;
- workspace toolbar;
- entity detail layout.

Bunlar sonraki canonical workspace referans görsellerinden ayrı teknik kontrata dönüştürülecektir.

---

# 13. State Model

Ana visual experience minimum aşağıdaki state modelini desteklemelidir:

```ts
type DomainVisualState =
  | "neutral"
  | "relevant"
  | "active"
  | "workspace-opening"
  | "workspace-open";

type MetrixVisualState =
  | "idle"
  | "listening"
  | "thinking"
  | "acting"
  | "responding";
```

Visual state business truth üretmez.

Business/runtime state canonical backend/application state'inden gelir.

Presentation layer yalnız verilen state'i görselleştirir.

---

# 14. Interaction State Transitions

Örnek customer flow:

```text
USER
"Global Corp'un bakiyesine bak."

        ↓

METRIX runtime resolves customer context

        ↓

Müşteriler domain
neutral → relevant

        ↓

hub → customers energy flow

        ↓

Müşteriler
relevant → active

        ↓

workspace-opening

        ↓

workspace-open

        ↓

METRIX workspace üzerinde işlemi gerçekleştirir

        ↓

conversation narration + visible workspace truth
```

Görsel animasyon business işlemin başarılı olduğunu kendi başına iddia edemez.

Workspace açılması veya glow değişmesi **execution success kanıtı değildir**.

---

# 15. Layer / Z-Index Contract

Önerilen semantik katman sırası:

```text
0   base background
10  atmospheric gradients
20  secondary network traces
30  primary routes
40  energy particles
50  domain nodes
60  METRIX hub
70  conversation
80  persistent input
90  workspace
100 global controls / critical overlays
```

Workspace z-index olarak input'tan yüksek görünmek zorunda kalırsa geometrik olarak input safe-zone dışında kalmalıdır.

Z-index ile input'ın üstünü örtmek yasaktır.

---

# 16. Blur ve Depth Hierarchy

Blur yalnız dekorasyon değildir.

Semantik odak mekanizmasıdır.

Önerilen hierarchy:

```text
METRIX hub          sharp
active domain       sharp
active route        sharp / luminous
conversation        sharp
input               sharp
relevant domain     near-sharp
neutral domains     intentionally soft
background traces   soft
atmospheric field   very soft
```

Tüm ecosystem'e global blur uygulanmamalıdır.

---

# 17. Typography

Referans görsel modern, dar olmayan, temiz sans-serif karakter taşır.

Production'daki mevcut METRIX font ailesi uygunsa korunmalıdır; yalnız referansa benzemek için yeni font dependency eklenmemelidir.

Hiyerarşi:

```text
Hub label             strong / high contrast
Active domain label   medium / high contrast
Neutral domain label  medium / low contrast + blur
Conversation text     normal / readable
Input text            normal
Metadata              small / muted
```

Font glow kullanılmamalı veya çok düşük tutulmalıdır.

Glow esas olarak enerji/network/icon katmanında yaşar.

---

# 18. Iconography

Domain ikonları:

- görsel olarak volumetric / luminous hissedebilir;
- aynı icon family karakterini taşımalıdır;
- rastgele emoji kullanılmaz;
- flat monochrome dashboard ikonlarına indirgenmemelidir;
- her domain kendi semantik sembolüne sahip olabilir.

Neutral state ikonları blur/opacity ile geri çekilir.

Active state için ayrı tamamen farklı ikon kullanılmaz; aynı ikon illuminate edilir.

---

# 19. Responsive Behavior

Bu kontratın önceliği desktop'tır.

## 19.1 Desktop ≥ 1280px

Tam ecosystem composition korunur.

Domainler hub çevresinde yayılır.

Conversation + input merkez alt bölgede kalır.

Workspace açıldığında ecosystem yeniden düzenlenebilir ancak input korunur.

## 19.2 Compact desktop / tablet

Hub küçülür.

Domain radius daralır.

Network path coordinates responsive viewBox üzerinden yeniden ölçeklenir.

Domain node'lar birbirinin üzerine bindirilmez.

## 19.3 Mobile

Mobile davranış bu sürümde desktop kompozisyonunun küçültülmüş hali olarak uygulanmamalıdır.

Mobile için ayrı composition gerekebilir.

Bu kontrat mobile redesign yetkisi vermez.

---

# 20. Implementation Architecture Recommendation

Bu bölüm yeni product architecture kurma yetkisi vermez.

Mevcut METRIX frontend sınırları içinde önerilen presentation teknolojileri:

### DOM / React

Şunlar DOM component olarak kalmalıdır:

- history control;
- settings control;
- conversation;
- input;
- domain labels;
- accessibility hit targets;
- workspace host.

### SVG

Şunlar SVG için uygundur:

- primary connection routes;
- secondary routes;
- micro-traces;
- energy flow;
- particles;
- network glyphs.

### CSS

Şunlar CSS ile:

- background gradients;
- hub shell;
- glass surfaces;
- glow;
- blur;
- state transitions;
- responsive sizing.

### WebGL / Three.js

İlk implementasyonda **gerekli değildir**.

Yalnız SVG/CSS ile referansın kabul edilebilir görsel kalitesine ulaşılamadığı ölçülerek kanıtlanırsa değerlendirilir.

Görsel etki uğruna yeni ağır runtime eklenmez.

---

# 21. SVG Coordinate Strategy

Network geometrisinin viewport değişimlerinde bozulmaması için network layer normalized `viewBox` kullanmalıdır.

Örnek:

```html
<svg
  viewBox="0 0 1600 900"
  preserveAspectRatio="xMidYMid meet"
>
```

Hub ve domain anchor noktaları aynı coordinate system içinde tanımlanmalıdır.

Örnek model:

```ts
type VisualAnchor = {
  id: string;
  x: number;
  y: number;
};

type DomainRoute = {
  domainId: string;
  start: VisualAnchor;
  bends: VisualAnchor[];
  end: VisualAnchor;
};
```

Random path generation kullanılmaz.

Path'ler deterministic olmalıdır.

Aynı viewport'ta her render'da aynı geometry oluşmalıdır.

---

# 22. Performance Contract

Ana visual experience sürekli animasyon içerdiği için performans zorunlu acceptance kriteridir.

Hedef:

```text
desktop animation: 60fps target
no recurring layout thrashing
no per-frame React state updates
no unbounded particle creation
no DOM node explosion
```

Tercihler:

- SVG path reuse;
- CSS transforms;
- opacity;
- requestAnimationFrame yalnız gerektiğinde;
- reduced motion desteği;
- inactive animation throttling.

`prefers-reduced-motion` desteklenmelidir.

Reduced-motion durumunda semantics kaybolmamalı; hareket yerine illumination/state change kullanılmalıdır.

---

# 23. Accessibility Contract

Görsel ekosistem erişilebilir interaction'ı ortadan kaldırmamalıdır.

- History ve settings controls keyboard accessible.
- Input keyboard accessible.
- Domain node interactive ise semantic button/appropriate role taşımalı.
- Blur edilmiş domain text erişilebilir isimden kaldırılmamalıdır.
- Color tek state göstergesi olmamalıdır.
- Focus state neon tasarım içinde görünür olmalıdır.
- Decorative SVG traces screen reader tree'den çıkarılmalıdır.

---

# 24. Runtime / Product Boundary — HARD INVARIANT

Bu çalışma **presentation replacement / visual implementation** işidir.

Aşağıdakiler sırf bu görsel kontratı uygulamak için yeniden yazılamaz:

- METRIX personality;
- business capabilities;
- business rules;
- action runtime;
- approval policy;
- entity resolution;
- conversation reasoning;
- persistence;
- domain authority;
- canonical data model;
- backend execution semantics.

Visual layer business truth üzerinde yeni authority oluşturamaz.

Örnek:

```text
YANLIŞ:
UI "Müşteriler" kelimesini gördü → workspace açtı.

DOĞRU:
Canonical runtime customer domain context üretti
→ presentation state customer domain'i aktive etti
→ visual layer animation oynattı
→ canonical navigation/workspace command workspace'i açtı.
```

---

# 25. No-Redesign Rules

Implementasyon ajanı aşağıdakileri yapamaz:

- sidebar eklemek;
- navigation menu eklemek;
- dashboard grid'e dönüştürmek;
- hub'ı dev hero graphic yapmak;
- domainleri kartlara dönüştürmek;
- network'ü organik tentacle biçimine çevirmek;
- connection'ları rastgele üretmek;
- referans renklerini keyfi değiştirmek;
- workspace'i fullscreen modal yapmak;
- textbox'ı workspace açıldığında taşımak;
- chat'i workspace uğruna kaldırmak;
- referansın neon/data-network karakterini generic SaaS dark mode'a indirgemek;
- "daha modern" gerekçesiyle görsel hiyerarşiyi değiştirmek.

---

# 26. Screenshot Calibration Protocol

İlk kodlama final acceptance değildir.

Implementasyon aşağıdaki döngüyle kalibre edilir:

```text
1. canonical reference
2. implementation
3. fixed viewport screenshot
4. side-by-side comparison
5. geometry correction
6. color/luminance correction
7. blur/glow correction
8. animation inspection
9. regression screenshot
```

Her iterasyonda yalnız ölçülen fark düzeltilir.

Yeni tasarım kararı eklenmez.

---

# 27. Visual Acceptance Criteria

Ana ekran ancak aşağıdaki koşullar birlikte sağlanırsa kabul edilir.

## A. Composition

- [ ] Sidebar yok.
- [ ] Sol üstte yalnız geçmiş sohbetler kontrolü var.
- [ ] Sağ üstte yalnız ayarlar kontrolü var.
- [ ] Üstte METRIX wordmark yok.
- [ ] Hub normal desktop'a orantılı ve ekranı domine etmiyor.
- [ ] Domainler hub çevresinde referans kompozisyonuna uygun dağılıyor.
- [ ] Conversation textbox üzerinde.
- [ ] Textbox ekranın altında sabit ve erişilebilir.

## B. Visual fidelity

- [ ] Background referanstaki koyu lacivert/siyah atmosferi taşıyor.
- [ ] Cyan/blue/violet/magenta ışık dili korunuyor.
- [ ] Hub çok katmanlı ve volumetric.
- [ ] Neutral domainler flu.
- [ ] Active domain net ve luminous.
- [ ] Micro-trace yoğunluğu referansın data-network hissini veriyor.
- [ ] Genel görüntü generic dark dashboard gibi görünmüyor.

## C. Connection geometry

- [ ] Sağ ana trunk hub'dan düz çıkıyor.
- [ ] Sol ana trunk hub'dan düz çıkıyor.
- [ ] Ana trunk'lar secondary route'lardan kalın.
- [ ] Diğer yollar düz segment ile başlıyor.
- [ ] Maksimum kontrollü ana dönüş kullanılıyor.
- [ ] Dönüşten sonra yol yeniden düzleşiyor.
- [ ] Tentacle / repeated-wave görünümü yok.
- [ ] Ana hatların çevresinde ince, dağınık micro-traces var.

## D. Motion

- [ ] Relevant domain konuşma bağlamıyla netleşiyor.
- [ ] Enerji merkezden hedef domaine akıyor.
- [ ] Animasyon layout shift yaratmıyor.
- [ ] Idle hareket dikkat dağıtmıyor.
- [ ] Reduced motion çalışıyor.

## E. Workspace boundary

- [ ] Workspace domain ile görsel nedensellik kurarak açılıyor.
- [ ] Desktop'ta fullscreen olmuyor.
- [ ] Input hiçbir zaman kapanmıyor.
- [ ] Conversation continuity tamamen yok edilmiyor.
- [ ] Workspace iç tasarımı bu kontratta uydurulmuyor.

## F. Runtime safety

- [ ] Görsel çalışma business logic'i değiştirmedi.
- [ ] Yeni parallel navigation authority oluşmadı.
- [ ] UI string matching ile domain truth üretmiyor.
- [ ] Existing canonical runtime state presentation'ın kaynağı.

---

# 28. Codex Implementation Directive

Aşağıdaki direktif bu kontratla birlikte implementasyon ajanına verilmelidir:

```text
METRIX_VISUAL_EXPERIENCE_CONTRACT.md is the canonical implementation
contract for the main METRIX visual experience.

The supplied original reference image is the canonical visual reference.

Do not redesign.
Do not reinterpret.
Do not beautify beyond the reference.
Do not introduce navigation UI.
Do not introduce a sidebar.
Do not invent workspace internals.
Do not replace deterministic connection geometry with organic curves.
Do not modify canonical business/runtime behavior to simplify presentation.

Implement the visual layer against the existing METRIX architecture.

Where the reference image conflicts with an explicit rule in this contract,
the contract wins.

Where this contract intentionally leaves a value approximate, calibrate it
against the canonical reference screenshot rather than inventing a new
visual treatment.

Completion requires fixed-viewport screenshot evidence and visual
comparison. Passing tests/build alone is not visual acceptance.
```

---

# 29. Explicitly Deferred Contracts

Bu belge aşağıdaki tasarımları **bilinçli olarak kilitlemez**:

### A. Domain Workspace Contract

Tanımlanacak alanlar:

```text
Workspace shell
KPI strip
toolbar
search/filter
entity list
row density
workspace dimensions
workspace transition
domain-specific data presentation
```

### B. Entity / Detail Workspace Contract

Tanımlanacak alanlar:

```text
detail header
entity identity
KPI/detail metrics
tabs
business information
financial movements
invoices
collections
offers
scores
segments
documents
actions
activity timeline
```

Bu iki kontrat kullanıcı tarafından sağlanacak ayrı canonical referans görseller üzerinden hazırlanacaktır.

Bu aşamaya kadar herhangi bir implementasyon ajanı bu alanları kendi tasarlamamalıdır.

---

# 30. Final Canonical Statement

METRIX ana ekranı bir menü, dashboard veya statik network diyagramı değildir.

Ana ekran:

**METRIX'in merkezde yaşadığı, işletme domainlerinin onun çevresinde düşük odakta beklediği, konuşma bağlamına göre ilgili domainin canlandığı, merkezden domaine kontrollü bir enerji/veri akışının ilerlediği ve gerektiğinde çalışma yüzeyinin o domain üzerinden doğduğu yaşayan bir dijital işletme ekosistemidir.**

Bu deneyimin değişmez sınırları:

```text
METRIX merkezdir.
Conversation süreklidir.
Input dokunulmazdır.
Domain context ile aktive olur.
Network kontrollü geometridir.
Workspace domain'den doğar.
Workspace desktop'ta fullscreen değildir.
Business truth presentation tarafından üretilmez.
Reference visual language yeniden tasarlanmaz.
```

---

**END OF CONTRACT**
