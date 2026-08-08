# Ertelenen Üç İmza — Uygulama Raporu

Tarih: 2026-08-08

## Stage 0 gerçek sinyal denetimi

- Yerel bağlı veritabanında 179 AI mesajının 30'unda `executiveBrain.decisionPackage.primaryDecision` dolu, 149'unda null bulundu. Dolu dağılım: `EXECUTION/HIGH` 25, `SALES/HIGH` 5. Bu nedenle kalibrasyon yokluğu gerçek ve yaygın bir durumdur; null turda gecikme üretilmez.
- `ResolutionConfidence.level` doğrudan canonical Conversation Understanding güveninden üretiliyor (`executive-request-resolution.shadow.ts:213`). Chat hattında günlük yüksek güven örnekleri gerçek navigasyon resolution'larıdır; yalnız `confidence === "high" && status === "RESOLVED"` kombinasyonu hazırlık sinyali üretir.
- Yerel bağlı veritabanında `SalesGoal` satırı yoktur. Bu nedenle bu ortamda hiçbir sayısal alan için gerçek eşik tetiklenmemiş, test/screenshot amacıyla hedef yaratılmamıştır.

## 03 — Executive Pause

Gerçek kaynak: `src/app/api/ai/chat/route.ts:587-588` önceki tamamlanmış AI mesajından Decision Engine paketini okur. Kural `src/lib/executive-signatures/executive-pause.ts:26-40`:

- null, LOW veya WATCH: 0 ms (`immediate`)
- MEDIUM/HIGH: 450 ms (`management`)
- CRITICAL veya HIGH + CASH/STRATEGY/risk kategorisi: 900 ms (`strategic`)

İstemci NDJSON signature olayını ilk metinden önce işler (`MetrixChatTab.tsx:606-617`) ve spinner/nefes animasyonu yerine tek ince ışık izi gösterir (`MetrixChatTab.tsx:1223-1225`). Reduced Motion canonical sınıfı vardır. Sinyal null ise iz ve gecikme yoktur.

Kanıt: `qa-screenshots/executive-pause-transcript.png` gerçek yerel stratejik transkripttir. Anlık 450/900 ms izin tek kare kanıtı otomasyon sırasında güvenilir biçimde yakalanamadı; test kanıtı `src/lib/executive-signatures/__tests__/executive-pause.test.ts` içindedir.

## 05 — Sessiz Hazırlık

Gerçek kaynak: `src/app/api/ai/chat/route.ts:475-477`. Yalnız high confidence + resolved business navigation domain'i sinyal üretir. `silent-preparation-runtime.ts:9-24` canonical `DOMAIN_SURFACE_ADAPTERS` endpoint'ini salt-okunur fetch ile ısıtır; yeni konu başladığında abort eder. `CanonicalDomainSurface.tsx:13` aynı payload'ı tüketir, paralel veri modeli/yolu oluşturmaz. Mutation ve navigation çağrısı yoktur. Hata sessizce yutulur; kullanıcıya yalnız hazırlık sürerken tek piksellik iz gösterilir (`LivingWorkspaceHost.tsx:63`).

High confidence resolved sinyali yoksa hiçbir fetch/iz oluşmaz. Yerel görsel kanıt sırasında bu geçici iz güvenilir biçimde yakalanamadı; sahte resolution enjekte edilmedi.

## 09 — Verinin Ağırlığı

Stage 0 eşleşmesi yalnız tahsilat çalışma yüzeyindeki “Tahsil edilen tutar” alanıdır. Kaynak `/api/goals?status=ACTIVE` içindeki gerçek `targetCollectionCents` (`LivingWorkspaceHost.tsx:268-279`). Teklif/fatura ve diğer sayısal girişlere kanıtsız eşik bağlanmadı.

`data-weight.ts:4-9` %90 yaklaşma, %99 eşik ve aşım durumlarını hesaplar. Input, pointer/touch/klavye için aynı native change/blur yolunu kullanır; sınır aşımı engellenmez. İlk eşik girişinde tek 18 ms haptic, mikro ışık, kısa bağlamsal uyarı ve %1 yakınlıkta blur kenetlenmesi vardır (`LivingWorkspaceHost.tsx:219-226,259-263`). Hedef yoksa bütünüyle inactive kalır.

Yerel veritabanında SalesGoal olmadığı için görsel kanıt üretilemedi. Bu non-activation görev disiplininin beklenen sonucudur; ekran görüntüsü uğruna sahte hedef yaratılmadı.

## Doğrulama

- `npx tsc --noEmit`: geçti.
- `npm test`: 272 dosya geçti, 5 skipped; 2119 test geçti, 14 skipped.
- `npm run build`: metin kalite ve organization scoping guard'ları dahil geçti; Next.js 15.5.19 production build tamamlandı.
- Önceki sıfır grep sonucu artık gerçek kaynaklarda `executive.pause`, `sessiz.hazirlik`, `verinin.agirligi` referansları döndürüyor.

Sonuç: Kod ve otomatik kabul testleri tamamlandı. Zorunlu üç durumlu görsel kanıt, gerçek yerel veri eksikliği ve geçici durum yakalama sınırlaması nedeniyle yalnız stratejik transkript için üretildi; bu rapor o kısmı tamamlandı diye göstermemektedir.

## Ek — Eksik Kanıt Tamamlandı

2026-08-08 tarihinde `NODE_ENV=test ACCEPTANCE_MODE=isolated` ile üretim derlemesi üzerinde izole kabul koşusu yapıldı. `ACCEPTANCE Evidence ...` organizasyonu, OWNER kullanıcı/oturum, `Atlas Acceptance ...` müşterisi, `targetCollectionCents=10.000.000` olan SalesGoal ve 100.000 TL PENDING Payment aynı koşuda oluşturuldu.

- Sessiz hazırlık sohbet ve gerçek müşteri çözümlemesi: [sessiz hazırlık izi](../../qa-screenshots/sessiz-hazirlik-prep-trace.png), [network timing](../../qa-screenshots/sessiz-hazirlik-network-timing.png). Playwright resource timing kaydı `/api/customers` 137,8 ms ve surface açılışından sonra yeni müşteri fetch'i olmadığını doğruladı.
- Verinin ağırlığı yaklaşma (%95.000): [yaklaşma](../../qa-screenshots/verinin-agirligi-yaklasma.png).
- Verinin ağırlığı aşım (%110.000): [aşım](../../qa-screenshots/verinin-agirligi-asim.png); uyarı devam edilebilir olduğunu gösteriyor.
- Klavye eşdeğer davranış: [klavye](../../qa-screenshots/verinin-agirligi-klavye.png).

İlk gerçek yüzey denetiminde canonical Payment listesinde “Tahsil edilen tutar” alanının eksik olduğu bulundu; kapsamı dar bir düzeltmeyle alan ve `verinin.agirligi` durumu canonical yüzeye bağlandı (`CanonicalDomainSurface.tsx`). İzole koşu iki testi de geçti. `afterAll` organizasyonu ve bağlı kayıtları sildi; `prisma.organization.findUnique` sonucu `null` oldu. Kabul ön ekiyle kalan organizasyon bulunmadı. Murat'ın üretim organizasyonuna dokunulmadı. Kanıt koşusundaki geçici test kancaları kaldırıldı; kalıcı değişiklik yalnız gerçek yüzeydeki bu eksik alan düzeltmesidir.

## Ek — Çift İmplementasyon Tekilleştirildi

Stage 0 incelemesinde `/metrix/collections` sayfasının `ExecutiveAppShell` içindeki `pathname !== "/"` client redirect’i nedeniyle gerçek ana kullanıcı yüzeyi olmadığı; ayrıca `PaymentCanonicalScreen`in generic `createWorkspaceDirective` kullandığı için olası fallback yolunu açık bıraktığı doğrulandı. Chat/navigasyon yolu zaten `businessSurface: "payment-list"` ile `CanonicalDomainSurface`e gidiyordu.

Tekilleştirme kapsamında:

- `PaymentCanonicalScreen.tsx:3-7`, `createPaymentWorkspaceDirective` kullanacak şekilde düzeltildi ve `businessSurface: "payment-list"` açıkça garanti edildi.
- `planner.ts:64`, bu canonical kurucunun `system` kaynağını da kabul etmesi için genişletildi.
- `LivingWorkspaceHost.tsx:208-256` içindeki eski `PaymentRow` yolundan `resolveDataWeight`, hedef eşik fetch’i, haptic ve `verinin.agirligi` uyarı/ışık mantığı kaldırıldı. Mutation/onay akışı kapsam dışı olduğu için korunmuştur.
- `verinin.agirligi` ve “Tahsil edilen tutar”ın tek implementasyonu artık `CanonicalDomainSurface.tsx:32-45` içindedir.

Doğrulama: `npx tsc --noEmit`, text-quality guard, organization-scoping guard ve ilgili 5 test dosyasındaki 23 test geçti. `rg` sonucu ağırlık mantığının yalnız canonical yüzeyde kaldığını doğruladı. Önceki `qa-screenshots/verinin-agirligi-*.png` kanıtları geçerlidir; bu değişiklik canonical davranışı değiştirmedi.
