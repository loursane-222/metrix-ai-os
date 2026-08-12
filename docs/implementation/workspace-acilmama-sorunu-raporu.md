# Workspace Açılmama Sorunu — Uygulama Raporu

## 1. Teklif oluşturma (offer.create) — düzeltildi

### Kök neden

`business-navigation.ts` `offer.create`'i `/metrix/offers/create/{customerId}` rotasına
projekte ediyordu (`expectedSurfaceAuthorityKey: "offers.create.page"`), ama
`createOfferWorkspaceDirective` (planner.ts) bu rotayı tanımıyordu (yalnızca liste ve
`/edit` regex'i vardı) → `null` dönüyordu → `ExecutiveNavigationCommandHost`'un
zincirinde hiçbir yönlendirici eşleşmiyordu → komut `FAILED` oluyordu → kullanıcı
"Bu capability henüz bağlı değil..." hatasını görüyordu. Brief'teki teşhis birebir
doğrulandı.

### Değişiklik

- [planner.ts](../../src/lib/living-workspace/planner.ts) — `createOfferWorkspaceDirective`'e
  üçüncü dal: `/metrix/offers/create/{customerId}` → `businessSurface: "offer-create"`,
  `entityId` = customerId.
- [contracts.ts](../../src/lib/living-workspace/contracts.ts) — `businessSurface` union'a
  ve runtime doğrulama listesine `"offer-create"` eklendi; `offer` domaininin rota
  regex'i `create/{id}` şeklini de kabul edecek şekilde genişletildi (yoksa
  `validateWorkspaceDirective` directive'i reddederdi).
- [BusinessSurfaceResolver.tsx](../../src/components/living-workspace/BusinessSurfaceResolver.tsx) —
  `offer-create` dalı eklendi (`OfferCreateScreen` render eder), authority key
  `"offers.create.page"` döndürüldü, `businessSurfaceOwnsReadiness`'e eklendi (offer-edit
  ile aynı desen — okuma/yazma hazırlığını ekran kendi bildirir).
- [OfferCreateScreen.tsx](../../src/components/offers/OfferCreateScreen.tsx) — yeni
  bileşen. Müşteriyi çekip gerçek bir DRAFT teklif oluşturur (yazılı "[X] için teklif
  oluştur" kalıbının zaten yaptığı `createOffer()` çağrısıyla aynı), sonra
  `OfferEditScreen`'i (mevcut, değiştirilmeyen) render eder — kalem/şart/not alanları
  hiç yeniden yazılmadı.

### Beklenmedik bulgu: `OfferCreateRedirect.tsx` zaten vardı

Kod tabanında `/metrix/offers/create/[customerId]/page.tsx` gerçek bir Next.js
sayfasıydı ve `OfferCreateRedirect.tsx` adında, `OfferCreateScreen` ile neredeyse
birebir aynı mantığı (müşteri çek → `createOffer()` → `/edit`'e yönlendir) zaten
içeriyordu — brief bu dosyanın varlığından habersizdi, ben de ilk taramada
kaçırdım. İki bağımsız kopya bırakmak yerine ortak mantığı
[create-offer-for-customer.ts](../../src/lib/offers/create-offer-for-customer.ts)'a
çıkardım; hem `OfferCreateRedirect` hem `OfferCreateScreen` artık bunu çağırıyor.
`OfferCreateRedirect` tam sayfa (`route`) sunumu için `router.replace` ile düzenleme
ekranına geçiyor; `OfferCreateScreen` Living Workspace içi (`living`) sunumu için
sayfa değiştirmeden `OfferEditScreen`'e yerinde geçiyor — ikisi gerçekten farklı
kullanım senaryoları, kasıtlı olarak ayrı bileşenler kaldı.

### Yeni testler

- [canonical-workspace-delivery.integration.test.ts](../../src/lib/living-workspace/__tests__/canonical-workspace-delivery.integration.test.ts) —
  mevcut "edit" case'inin yanına `offer.create`'in gerçek projected rotasını
  (`resolveBusinessNavigation` → `projectBusinessNavigation` → `createOfferWorkspaceDirective`
  → `livingWorkspaceRuntime.publish`) uçtan uca doğrulayan yeni bir case eklendi.
- [business-navigation-directive-cross-check.test.ts](../../src/lib/living-workspace/__tests__/business-navigation-directive-cross-check.test.ts) —
  brief'in 2. maddesindeki kalıcı çapraz test: `projectBusinessNavigation`'ın
  üretebileceği 12 `BusinessNavigationDescriptor` kind'inden 11'i (`company.root`
  hariç) için gerçek örnek descriptor → gerçek rota → ilgili `create*WorkspaceDirective`
  → `null` DÖNMEDİĞİ assert ediliyor. Bu test hem offer.create düzeltmesini hem
  gelecekte aynı sınıftan bir bug'ı (yeni bir domain eklenip yönlendiricisi
  unutulursa) yakalar.

## 2. `company.root` — KESİN OLMAYAN İKİNCİ BUG (raporlandı, düzeltilmedi)

Doğrulandı: `company.root` → `/metrix/company` + `"company.operating.page"` projekte
ediliyor, ama `createCompanyWorkspaceDirective` diye bir fonksiyon kod tabanında HİÇ
yok, `ExecutiveNavigationCommandHost.tsx`'in yönlendirici zincirinde `company` için
hiç dal yok, `BusinessSurfaceResolver.tsx`'de `"company"` hiç geçmiyor.
`/metrix/company` gerçek bir Next.js sayfası ve `CompanyOperatingScreen.tsx` mount
olduğunda `"company.operating.page"` authority key'ini kendi register ediyor — yani
sayfa çalışır durumda, ama executive-navigation zinciri kullanıcıyı oraya hiçbir
zaman GÖTÜRMÜYOR (ne bir Living Workspace directive yayınlanıyor ne de gerçek bir
`router.push` var). Sonuç: "şirketimi göster" gibi bir komut, `offer.create`'in
düzeltme öncesi haliyle birebir aynı şekilde, sessizce `FAILED` olur — meğer kullanıcı
zaten `/metrix/company` sayfasında olsun.

Bu KASITLI DEĞİL gibi görünüyor (brief'in şüphesi doğrulandı) — ama scope dışı
bırakıldı, düzeltilmedi. [business-navigation-directive-cross-check.test.ts](../../src/lib/living-workspace/__tests__/business-navigation-directive-cross-check.test.ts)
içinde bu boşluğu sabitleyen ayrı bir "KNOWN GAP" testi var (planner.ts/host/resolver
kaynağında `createCompanyWorkspaceDirective`'in YOKLUĞUNU` doğruluyor) — biri bunu
farkında olmadan "düzeltirse" bu test kırılır ve gözden kaçmaz.

## 3. Müşteri oluşturma (customer.create) araştırması — DÜZELTME YAPILMADI

Brief'in istediği gibi düzeltmeye geçmeden önce yerel dev ortamında gerçekten denedim.

### Ortam kısıtı (kritik, ayrıca not düşülmeli)

Bu sandbox'ın dev sunucusu OpenAI'ye ulaşamıyor: `.env`'de geçerli görünen bir
`OPENAI_API_KEY` var (164 karakter, `sk-proj-` önekli), ama her `/api/ai/chat`
isteği ~6-28 saniye beklendikten sonra `AiProviderRequestError: "OpenAI provider
request failed."` ile başarısız oluyor (hem "yeni müşteri kaydı oluştur" hem sade
"merhaba" mesajında, tutarlı şekilde). Bu, bu sandbox'a özgü bir ağ erişimi kısıtı —
Murat'ın production'da (metrixgm.com) yaşadığı sorunla AYNI OLDUĞUNU VARSAYMIYORUM,
ayrı bir olgu olarak raporluyorum. Bu yüzden `understanding_observed → resolution_completed
→ projection_completed` zincirini ve `ExecutiveNavigationCommandHost`'un state
geçişlerini GERÇEK bir başarılı sınıflandırmayla uçtan uca gözlemleyemedim.

### Yine de gözlemlenen, doğrudan kanıtlı bulgular

1. **`conversation_classify` adımı tek başına ~20.8 saniye sürdü** (ilk denemede,
   başarısız olmadan önce) — bu, `EXECUTIVE_NAVIGATION_COMMAND_EXPIRY_MS = 10_000`
   (10 saniye) eşiğinin 2 katından fazla. Mimari gereği bu süre navigation komutunun
   kendi 10s sayacını doğrudan tehdit etmiyor (komut sayacı ancak sınıflandırma
   bittikten SONRA, stream event istemciye ulaştığında başlıyor) — ama kullanıcı
   deneyiminde "hiçbir şey olmuyor" hissi yaratan gecikme tam burada: OpenAI çağrısı
   yavaşsa/başarısızsa kullanıcı 20-28 saniye "Yetki ve işlem koşullarını kontrol
   ediyorum" görüyor, sonra genel "Şu anda bağlantıda bir sorun oluştu" mesajı
   alıyor — workspace hiç açılmıyor.
2. **`businessNavigation` sınıflandırması TAMAMEN OpenAI'nin başarılı yanıtına
   bağımlı, senkron/deterministik bir yedek yolu YOK.** `classification_fast_path_miss`
   log'u `"blockedReason":"business_keyword_present"` gösteriyor — yani "müşteri"
   gibi iş anahtar kelimesi içeren HER mesaj kasıtlı olarak deterministik hızlı yolu
   atlayıp LLM'e gidiyor (bu doğru bir tasarım — anlam belirsizliği LLM gerektirir).
   Ama sonucu: OpenAI çağrısı başarısız/yavaş olduğunda `conversationUnderstanding`
   güvenli varsayılana (`businessNavigation: null`, `confidence: "low"`) düşüyor ve
   navigation SESSİZCE hiç projekte edilmiyor — kullanıcıya yalnızca genel bağlantı
   hatası gösteriliyor, "müşteri" veya "teklif" ayrımı bile yapılamıyor.
3. **Bu ikisi birlikte güçlü bir hipotez oluşturuyor:** Murat'ın raporunda hem
   müşteri oluşturma HEM teklif oluşturma "hangi komutla denerse denesin" başarısız
   olmuş — iki AYRI özellik-spesifik bug yerine, TEK bir paylaşılan üst bağımlılığın
   (OpenAI sınıflandırma çağrısı — hata, yavaşlık, rate-limit, geçersiz/süresi
   dolmuş production API key, ağ/proxy sorunu) başarısızlığı bu deseni açıklar.
   **Öneri:** Production loglarında Murat'ın başarısız denemelerinin zaman
   damgalarında `[AIProvider] AI_PROVIDER_REQUEST_FAILED` veya
   `conversation_classify` segment süresi anormal (>10-15s) olay var mı kontrol
   edilmeli — offer.create'in yapısal düzeltmesi doğrulandıktan sonra bile, eğer bu
   üst bağımlılık production'da kırıksa hiçbir workspace komutu (bu düzeltme dahil)
   açılmayacaktır.
4. `CustomerCreateScreen.tsx`'in `universalInputRegistry`'ye gerçekten register
   olup olmadığını çalışma zamanında DOĞRULAYAMADIM (chat OpenAI'ye takıldığı için
   `WAITING_FOR_SURFACE` state'ine hiç ulaşılamadı) — statik kodda register mantığı
   doğru görünüyor (brief'in 1.4 maddesindeki gibi), ama çalışma zamanı kanıtı
   sağlanamadı.
5. **Yan bulgu (ayrı, küçük):** `/metrix/customers/new` sayfası (`page.tsx`)
   kod tabanında zaten koşulsuz `redirect("/")` — yani doğrudan URL ile hiç
   render edilmiyor, yalnızca chat üzerinden Living Workspace ile açılabiliyor
   (kasıtlı "tek yüzey" tasarımı gibi görünüyor, brief'in "Offer + authority-split"
   notlarıyla tutarlı). `/metrix/offers/create/[customerId]` de doğrudan sert
   navigasyonda `/`'e 307 yönleniyor ama kaynağını (redirect() çağrısı hiçbir
   page/layout dosyasında yok) bulamadım — kapsam dışı, zaman kutusu nedeniyle
   daha fazla kazılmadı, yalnızca not düşülüyor.

**Sonuç:** Kör düzeltme yapılmadı, brief'in istediği gibi. Yukarıdaki bulgular
sizin onayınıza sunuluyor.

## 4. Kabul kanıtı — KISMİ (ortam kısıtı nedeniyle)

Brief'in istediği yazılı+sesli, canlı chat üzerinden ekran görüntüsü kanıtı bu
ortamda ALINAMADI — yukarıdaki OpenAI erişim kısıtı yüzünden chat hiçbir komutu
(offer.create dahil) sınıflandıramadı. Bunun yerine sağlanan kanıt:

- Deterministik test kanıtı (yukarıdaki yeni testler) `offer.create`'in tüm
  projeksiyon/yönlendirme zincirinin (gerçek `resolveBusinessNavigation` →
  `projectBusinessNavigation` → `createOfferWorkspaceDirective` →
  `validateWorkspaceDirective` → `livingWorkspaceRuntime.publish`) artık `null`
  DEĞİL, gerçek bir directive ürettiğini ve yayınlanabildiğini kanıtlıyor — bu,
  workspace'in artık gerçekten açılacağının kod-seviyesinde kesin kanıtı.
- Canlı tarayıcı ekran görüntüsü (yazılı/sesli, her ikisi) OpenAI erişimi olan bir
  ortamda ayrıca doğrulanmalı — production'a deploy sonrası veya OpenAI erişimi
  olan bir ortamda tarafınızca/başka bir oturumda tekrar denenmesini öneririm.

## 5. Doğrulama

- `npx tsc --noEmit` → geçti.
- `npx eslint <dokunulan 8 dosya>` → geçti.
- `node scripts/check-organization-scoping.mjs` → geçti (74 model, 256 çağrı, 3
  gerekçeli istisna — bu fazda yeni Prisma çağrısı yok).
- `npx vitest run` (tam paket, filtresiz, tek sefer) → **293 dosya geçti, 8
  atlandı (DB-integration gate); 2231 test geçti, 17 atlandı.**
- `npx next build` → başarılı, `/metrix/offers/create/[customerId]` dinamik rota
  olarak derlendi.

## Değişen dosyalar (8)

- `src/lib/living-workspace/planner.ts`
- `src/lib/living-workspace/contracts.ts`
- `src/components/living-workspace/BusinessSurfaceResolver.tsx`
- `src/components/offers/OfferCreateScreen.tsx` (yeni)
- `src/components/offers/OfferCreateRedirect.tsx` (paylaşılan yardımcıyı kullanacak
  şekilde yeniden düzenlendi)
- `src/lib/offers/create-offer-for-customer.ts` (yeni, paylaşılan mantık)
- `src/lib/living-workspace/__tests__/canonical-workspace-delivery.integration.test.ts`
- `src/lib/living-workspace/__tests__/business-navigation-directive-cross-check.test.ts` (yeni)

## Commit/Push

Yapılmadı — brief talimatı gereği rapor teslim edildi.
