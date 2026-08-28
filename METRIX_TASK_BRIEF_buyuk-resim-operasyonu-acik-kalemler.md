# METRIX Görev Notu — Büyük Resim Operasyonu: Açık Kalemler

**Tarih:** 2026-08-23
**Kapsam:** `METRIX_TASK_BRIEF_buyuk-resim-mimari-operasyonu.md`'nin 5 fazı (Faz 0-4) tamamlandıktan sonra, o fazlar boyunca **bulunan ama düzeltilmeyen** hatalar ve **bilinçli olarak dışarıda bırakılan** kapsam boşlukları. Bu belge unutulmamaları için tek bir yerde toplar — hiçbiri şu an acil değil, hiçbiri kendiliğinden bir sonraki faza otomatik girmiyor; her biri ayrı bir karar/görev olarak ele alınmalı.

---

## A. Bulunan, Düzeltilmeyen Hatalar

### A1. `generalImportConversationExtension` muhtemelen hiç çalışmıyor (DÜZELTİLDİ)

**Dosya:** `src/lib/conversation-extensions/general-import-conversation-extension.ts:22`

`getActiveScopeKey()` koşulsuz `null` döndürüyor. `active-conversation-extension.ts`'teki `executeActiveConversationExtension` fonksiyonu şu filtreyi uyguluyor:

```ts
const active = extensions.filter((extension) => extension.getActiveScopeKey() !== null);
```

Yani `getActiveScopeKey()` `null` dönen bir uzantı **hiçbir zaman** `active` listesine girmiyor — asla çalıştırılmıyor. Projedeki diğer tüm "surface-scoped olmayan" (her sayfadan tetiklenebilen) uzantılar bunun yerine `typeof window === "undefined" ? null : "<sabit-anahtar>"` deseni kullanıyor (örn. `customer-management-conversation-extension.ts`, `production-management-conversation-extension.ts`).

**Etkisi:** Kullanıcı domain belirtmeden "excel'den aktar" dediğinde, bu uzantının üretmesi gereken netleştirme sorusu ("Hangi alan: Müşteri, Ürün, ... ?") muhtemelen hiç tetiklenmiyor; turn free-form üretime düşüyor.

**Bulunuş şekli:** Faz 4'te kendi yeni uzantılarım (`payment-reminder-conversation-extension.ts`, `orchestration-conversation-extension.ts`) için aynı yanlış deseni kopyaladığımda fark ettim, kendi dosyalarımı düzelttim ama bu pre-existing dosyaya dokunmadım (kapsam dışı).

**Düzeltme (c51ee61):** `getActiveScopeKey()` artık `typeof window === "undefined" ? null : "general-import"` deseniyle diğer surface-scoped-olmayan uzantılarla aynı örüntüyü kullanıyor.

---

### A2. `UnavailableBusinessSurface.tsx` içinde ölü COPY anahtarları (DÜZELTİLDİ)

**Dosya:** `src/components/living-workspace/UnavailableBusinessSurface.tsx`

Faz 1 ve Faz 3 denetimleri boyunca defalarca gözlemlendi: `suppliers`, `goals`, `reports`, `accounting`, `documents`, `tasks`, `team`, `finance` gibi COPY anahtarları hâlâ dosyada duruyor, ama artık hiçbir `page.tsx` bu bileşeni bu prop değerleriyle çağırmıyor — ilgili domainler kendi `*CanonicalScreen` bileşenlerine taşınmış durumda. İşlevsel etkisi yok (kullanıcı hiç görmüyor), yalnızca temizlik/okunabilirlik konusu.

**Düzeltme (c51ee61):** 9 ölü anahtar (`accounting`, `collections`, `documents`, `finance`, `goals`, `reports`, `suppliers`, `tasks`, `team`) silindi; yalnızca hâlâ gerçekten çağrılan 6 anahtar (`company-dna`, `daily-rhythm`, `opinion`, `sales`, `templates`, `work-plan`) kaldı.

---

### A3. Sohbet tetikleyici önceliği: konuşma geçmişi biriktikçe yeni uzantılar bazen "ele geçiriliyor" (DÜZELTİLDİ)

**Bağlam:** Faz 4'te canlı doğrulama sırasında gözlemlendi. "Atlas Insaat'a tahsilat hatırlatması gönder" komutu **temiz bir oturumda** (yeni konuşma) doğru çalıştı — `paymentReminderConversationExtension` tetiklendi, doğru sonucu ("bakiye yok, hatırlatma gönderilmedi") doğru anlattı. Ama birkaç turluk bir konuşmanın **ortasında**, aynı komut yerine müşteri kaydını açan farklı bir davranış üretti (muhtemelen `customerManagementConversationExtension` veya business-navigation'ın kendi bağımsız sınıflandırması turu önce ele geçirdi).

**Kök neden izole edilmedi** — muhtemelen `extensions` dizisindeki sıralama (yeni uzantılar dizinin sonunda) ile business-navigation'ın turn-bağımsız NLU sınıflandırması arasında bir yarış durumu, ama bu doğrulanmadı, yalnızca gözlemlendi.

**Etkisi:** `paymentReminderConversationExtension` ve `orchestrationConversationExtension`'ın (Domain 25/26 v1) güvenilirliği, konuşmanın o ana kadarki geçmişine bağlı olarak değişebilir — her zaman tetiklenmeyebilirler.

**Kök neden bulundu ve düzeltildi (c51ee61):** `route.ts`, business-navigation'ın kendi bağımsız navigasyon dispatch'ini yalnızca handoff CREATE+tamamlanmış-navigasyon olduğunda bastırıyordu — başka herhangi bir uzantının handoff'u (yönetim aksiyonu, gönderim, orkestrasyon çalıştırma, ...) aynı turda business-navigation'ın ayrıca bir varlık tanıyıp başka yere yönlendirmesiyle sessizce ezilebiliyordu. Bu, yeni iki uzantıya özgü değil, ~27 uzantının yarısını etkileyen sistemik bir sorundu. "Herhangi bir handoff mevcutsa business-navigation'ın rakip navigasyonunu bastır" olarak genelleştirildi (narrasyon için zaten uygulanan "tek otorite" ilkesiyle aynı). Canlı doğrulandı: önceden başarısız olan tam senaryo (3 turluk konuşmanın ortasında tahsilat hatırlatması) artık doğru cevap veriyor, yanlış yere navigasyon yapmıyor.

---

### A4. `deliveries.write` izni hiçbir role tanımlı değildi (DÜZELTİLDİ)

**Dosya:** `src/lib/action-runtime/gateway/execution-context.ts`

Genel orkestrasyon planlayıcısını "sipariş oluştur, irsaliyesini kes" ile canlı test ederken bulundu: `delivery.create` aksiyonunun manifestteki `requiredPermissionSet: ["deliveries.write"]` şartı, `ROLE_PERMISSIONS` haritasında **hiçbir role** (OWNER dahil) tanımlı değildi — bu yüzden Faz 3'te kurulan İrsaliye action-runtime handler'ı hiç kimse tarafından çalıştırılamıyordu (`PERMISSION_DENIED`). OWNER/EXECUTIVE/MANAGER rollerine `deliveries.write` eklenerek düzeltildi ve canlı doğrulandı (sipariş→irsaliye zinciri artık uçtan uca tamamlanıyor). Bu, Faz 3'ün kendi eksiğiydi, Faz 4/5'te bulundu ve düzeltildi.

---

## B. Kalan Bilinçli Kapsam Boşlukları (Senin Kararını Gerektirir)

### B1. Domain 01 — İşletme (supra-domain) — 2026-08-24: İşletme Genel Görünümü teslim edildi

**Karar:** İşletme'nin kendi Prisma modeli açılmadı — kurucu anayasanın Tek Gerçeklik İlkesi'ne göre (`docs/constitution/METRIX FOUNDATION/Domain_Sözleşme/01 - İşletme Domain Anayasası.docx`, §3: "Aynı bilgi iki farklı Domain tarafından yönetilemez") gelir-gider/hedef/üretim verisinin zaten kanonik sahipleri var (Finans/Muhasebe, Hedef, Üretim). Bunun yerine Company domain'in zaten tanımlı ama hiç doldurulmayan `activeRisks`/`activeOpportunities` alanları (`company-model-projection.service.ts`) gerçek bir sentezle dolduruldu.

**Ne yapıldı:** Yeni `src/lib/company/business-overview-synthesis.service.ts` — mevcut finance/accounting hesaplamasını (`/api/finance/summary` ile aynı kompozisyon) olduğu gibi kullanıyor; aktif `SalesGoal`'lar için hedefe karşı ilerlemeyi (stored `actualValue`'ya güvenmeden) gerçek Invoice/Payment verisinden canlı hesaplıyor; `ProductionOrder`'dan basit bir kapasite kullanım oranı ve gecikme sinyali çıkarıyor. Bu sentez iki yerden erişilebilir: `/metrix/company` sayfasının Genel Bakış sekmesinde (yeni bir kart) ve sohbette her an "işletmemin genel durumu ne" / "genel bir değerlendirme yap" gibi ifadelerle (yeni `business-overview-conversation-extension.ts`). Canlı doğrulandı: gerçek finansal veriye göre "Finansal sağlık durumunuz kritik seviyede... tahsilat riski kritik" gibi doğru, uydurulmamış bir değerlendirme üretti.

**Bilinçli olarak bu fazda YOK:** KPI domain'in `calculationMethod` motoru inşa edilmedi (performans sinyali olarak zaten canlı finansal-sağlık + hedef ilerlemesi kullanıldı); Goal domain'in kendi CRUD/stored-value modeli değiştirilmedi (yalnızca yeni sentez servisi içinde canlı hesaplama yapılıyor).

---

### B2. Domain 28 — Entegrasyon — 2026-08-24: Bizim Hesap bağlantısı teslim edildi

**Karar:** Bizim Hesap seçildi (bulut/API-key tipi — Logo/Netsis on-premise/per-müşteri-ajan mimarisi gerektirdiği için ayrı, çok daha büyük bir girişim olarak kapsam dışı bırakıldı; Paraşüt aynı kategoride "doğal bir sonraki aday" olarak notlandı, inşa edilmedi).

**Ne yapıldı:** Vendor-agnostic temel — `IntegrationConnection` modeli (org-scoped, `provider` açık string, yeni bir vendor migration gerektirmiyor) + paylaşılan AES-256-GCM secret şifreleme (`integration-secret-crypto.ts`, Gmail entegrasyonunun kanıtlanmış tarifinin kendi kopyası — mevcut Gmail entegrasyonuna dokunmadan). Bizim Hesap'ın gerçek public API dokümantasyonuna göre (`apidocs.bizimhesap.com`) inşa edilen adaptör: bağlan/durum/bağlantıyı kes uçları (`/api/integrations/bizimhesap/*`), bağlanırken token gerçek API'ye karşı doğrulanıyor (asla doğrulanmamış bir credential saklanmıyor). Katalog senkronu (ürün/depo) yalnızca salt-okunur bir görüntüleme — METRIX'in kendi Ürün/Stok domain'ine hiç yazılmıyor (Tek Gerçeklik İlkesi). Fatura gönderimi yeni bir action-runtime aksiyonu (`integration.bizimhesap.push_invoice`) — onay gerektirir (EXPLICIT), genel orkestrasyon planlayıcısı üzerinden zincire eklenebilir. Canlı doğrulandı: gerçek bizimhesap.com API'sine karşı bağlan/durum uçları doğru çalıştı, sahte bir token temiz bir 422 ile reddedildi ve hiçbir şey kaydedilmedi.

**Bilinçli olarak bu fazda YOK:** Paraşüt/Logo/Netsis adaptörleri; faturaların otomatik olarak (fatura oluşturulduğunda) Bizim Hesap'a push edilmesi — bu, gerçek bir hesapla uçtan uca doğrulanana kadar bilinçli olarak yalnızca açık, onay gerektiren bir aksiyon olarak kaldı.

**Not:** Gerçek bir Bizim Hesap hesabı/API Key henüz yok — kod ve testler tam kapsamlı ama gerçek bir fatura push'u canlı doğrulanmadı. Gerçek bir hesap elde edildiğinde `BIZIMHESAP_PARTNER_KEY` env değişkeni + kullanıcının kendi Token'ı ile uçtan uca test edilmeli.

---

### B3. Domain 25 — Yönetici İletişim Motoru: v1'in ötesi — 2026-08-24: genişletildi

**Ne yapıldı:**
- **WhatsApp kanalı (kullanıcının kendi isteğiyle önceliklendirildi):** Gerçek bir WhatsApp Business API hesabı gerekmiyor — zaten teklif gönderiminde kullanılan `wa.me` deseni (numarayı kendi kayıtlarından bul, mesajı/dökümanı hazırla, aç, kullanıcı kendi gönder butonuna basar) genelleştirildi. Yeni: müşteriye canlı hesap ekstresi/mutabakat linki gönderme (`/mutabakat/[token]`, her ziyarette canlı hesaplanır, asla statik değil). Ayrıca bu akışın (ve mevcut teklif-WhatsApp akışının) `window.open`'ı bir `fetch` sonrası çağırdığı, bazı tarayıcılarda popup engelleyicisine takılabilecek bir kusur bulundu ve düzeltildi — pencere artık senkron olarak erken açılıyor, sonuç geldiğinde yönlendiriliyor.
- **Tedarikçi hedef kitlesi:** Yeni `SUPPLIER_MESSAGE` iletişim türü — "Vega Metal'e mesaj gönder: '...'" ile kullanıcı kendi dikte ettiği mesajı bir tedarikçiye e-posta ile gönderebiliyor. Tahsilat hatırlatmasından farklı olarak içerik METRIX tarafından üretilmiyor (kanıtlanacak bir iddia yok), kullanıcının kendi kelimeleri olduğu için Evidence Policy bu türde farklı işliyor — bu bilinçli bir tasarım kararı, anayasa kaynağına not düşüldü.
- **Gerçek ton seçimi:** `toneStrategy` artık sabit FRIENDLY değil — müşterinin gerçek ekstresindeki vadesi geçmiş kalem sayısına göre canlı hesaplanıyor (0 → FRIENDLY, 1 → FORMAL, 2+ → DIRECT), ve her ton gerçekten farklı bir e-posta metni üretiyor.
- **Paralel sistem sorusu kapatıldı:** `dispatchQuoteToCustomerEmail` (Teklif domain'inin kendi yaşam döngüsü sınırı) ile `ExecutiveCommunication` (yönetici-başlatan proaktif dış iletişim) kod okunarak karşılaştırıldı — kasıtlı olarak ayrı katmanlar, birleştirilmedi. Çözüm `docs/constitution/source/executive-cognitive-stack-v2.md`'ye ("Çözüm 2026-08-24") yazıldı.

**Hâlâ kasıtlı olarak v1 dışı:** SMS (ayrı bir sağlayıcı hesabı gerektirir), ekip/yönetim kurulu hedef kitlesi, zamanlanmış/ertelenmiş gönderim (bu codebase'de hiç job/cron altyapısı yok — ayrı, büyük bir girişim).

---

### B4. Domain 26 — Yönetici Orkestrasyon Motoru: v1'in ötesi (GÜNCELLENDİ — genel planlayıcıya geçildi)

**2026-08-23, aynı gün ikinci güncelleme:** Kullanıcının açık isteğiyle ("orkestrasyon METRIX'in içindeki her şey için çalışabilir olmalı, kullanıcının dili/şivesi performansı düşürmesin") sabit tek-örüntülü planlayıcı **tamamen kaldırıldı**, yerine action-runtime'ın kayıtlı ~25 aksiyonunu (`actionRegistry.listActionsByClass("DOMAIN")`, `approvalPolicy === "NONE"`, dolu şema) canlı okuyan, keyfi kullanıcı ifadesinden keyfi çok-adımlı plan çıkaran genel bir planlayıcı kuruldu (`general-plan-resolver.ts`, `entity-resolvers.ts`, `action-catalog.ts`). Canlı doğrulama: hem farklı domain kombinasyonlarında (teklif+görev, tedarikçi+ürün, sipariş+irsaliye) hem argo/şive Türkçe ifadelerde ("yeni bi tedarikçi ekle bize", "hemen peşinden") doğru çalıştı; adımlar arası referans ("$step1" — bir önceki adımda oluşan kaydı sonraki adımda kullanma) da doğrulandı.

**2026-08-23, aynı gün üçüncü güncelleme — onay-gerektiren aksiyonlar zincire eklendi:** "Onay gerektiren aksiyonlar planlanamıyor" sınırı kaldırıldı. `OrchestrationStatus`/`OrchestrationStepStatus`'a `AWAITING_APPROVAL` eklendi (migration `20260824090000_add_orchestration_approval_flow`); `runOrchestration` bir adım `ApprovalRequiredError` fırlattığında production `policyEngine`'den gerçek bir onay isteği açıp orkestrasyonu `AWAITING_APPROVAL` durumunda **duraklatıyor**, sonraki adımlar dokunulmadan `PENDING` kalıyor. Kullanıcı bir onay ifadesi ("evet", "onaylıyorum", ...) yazdığında yeni `orchestration-approval-conversation-extension.ts` en son bekleyen onayı bulup `resumeOrchestration`'ı çağırıyor — bu, `policyEngine.grantApproval` ile gerçek onayı veriyor ve kaldığı adımdan devam ediyor. `action-catalog.ts` artık `approvalPolicy === "EXPLICIT"` aksiyonları da (örn. `quote.dispatch`, `quote.set_lifecycle`, `customer.archive`) `requiresApproval: true` etiketiyle kataloğa dahil ediyor; `payment.apply` gibi entity-reference çözümleyicisi olmayanlar (`executive_action.complete`, `collection.set_lifecycle`, `custom_field.*`) hâlâ dışarıda. Canlı doğrulandı: "Atlas Insaat için bir görev oluştur, sonra Teklif başlıklı teklifi iptal olarak işaretle" → görev adımı çalıştı, `quote.set_lifecycle` adımında duraklayıp "Bu işlem onay gerektiriyor; devam etmeden önce onayınızı bekliyorum" dedi → "evet onaylıyorum" → "İşlemi tamamladım" ve teklifin gerçek DB durumu `CANCELLED`'a döndü (idempotency key `orchestration:...:step:1` ile orkestrasyon zincirinden geldiği doğrulandı).

**Hâlâ kasıtlı olarak v1 dışı:**
- ~~**Boş şemalı aksiyonlar**...~~ **KAPANDI (2026-08-26/28).** Büyük Resim Faz 2 ve sonraki oturumlarda `order.transitionStatus`, `order.cancel`, `production.update/archive`, `workCenter.create`, `machine.create`, `stock.transfer/adjustment`, `warehouse.create`, `supplier.archive`, `delivery.transitionStatus`, `collection.start` — hepsi gerçek şema+handler+resolver aldı.
- ~~**Entity-reference çözümleyicisi olmayan onay-gerektiren aksiyonlar**...~~ **KAPANDI (2026-08-28).** `executive_action.complete/cancel`, `collection.set_lifecycle`, `machine.archive`, `payment.void`, `task.cancel`, `company.unit.archive`, `company.field_definition.deprecate` — hepsine resolver eklendi, artık planlanabiliyor. Kataloğun tek kalan istisnası `custom_field.*` — farklı bir gerekçeyle (şema/admin aksiyonu, iş ifadesinin doğal olarak zincirlediği bir şey değil).
- ~~**rollback/recovery... hâlâ yok**~~ **KAPANDI.** Tam bir telafi (compensation) motoru var: `COMPENSATING`/`COMPENSATED`/`COMPENSATION_FAILED` durumları, `runCompensationPass`, her CREATE-class aksiyon için gerçek bir compensator, self-compensating UPDATE aksiyonları. Onay reddi artık `FAILED`+`SKIPPED` ile bitmiyor — tamamlanmış adımlar gerçekten geri alınıyor.
- ~~**Paralel yürütme, bağımlılık grafiği**...~~ **KAPANDI (2026-08-28).** `orchestration-waves.ts` — her adımın $stepRef referanslarından (zaten planda var olan tek bağımlılık sinyali) bir bağımlılık derinliği çıkarıyor; birbirine bağımlı olmayan adımlar aynı "dalga"da toplanıp `Promise.all` ile eşzamanlı çalışıyor, bir adım yalnızca gerçekten bağımlı olduğu dalga(lar)ı bekliyor. Hem ileri yürütme hem telafi (compensation) artık dalga dalga işliyor. Canlıda doğrulandı: "yeni bir tedarikçi ekle VE yeni bir görev oluştur" (birbirinden bağımsız iki aksiyon) gerçek plan-and-run rotasından tek seferde, iki gerçek kayıt oluşturarak tamamlandı. Commit `2d8e4e2`. **Hâlâ açık:** exception/learning intelligence.
- **Dış dünya** (internet arama, üçüncü taraf rezervasyon/API entegrasyonu) kullanıcının kendi kararıyla bu turda kapsam dışı bırakıldı — ayrı, çok daha büyük bir girişim (bkz. B2 Entegrasyon).

---

## Kapanış Notu

B1-B3, `buyuk-resim-mimari-operasyonu.md`'nin Faz 3/4 triyajında zaten "senin kararını gerektirir" diye işaretlenmişti. B4, Faz 4'te v1 olarak kurulup aynı gün (kullanıcı isteğiyle) genel amaçlı hale getirildi, ardından onay-gerektiren aksiyonları da kapsayacak şekilde genişletildi — kalan sınırları yukarıda güncellendi. A1-A4, Faz 4/5 sırasında **yeni bulunan**, önceki hiçbir belgede kayıtlı olmayan bulgular — dördü de düzeltildi ve doğrulandı.

B1, B2 ve B3 bu oturumda tamamlandı. Kalan, bilinçli olarak dışarıda bırakılmış kapsam genişletmeleri yukarıdaki her bölümün kendi "hâlâ kasıtlı olarak v1 dışı" notlarında kayıtlı (Paraşüt/Logo/Netsis, SMS, ekip/yönetim kurulu hedef kitlesi, zamanlanmış gönderim, KPI hesaplama motoru vb.) — hiçbiri bir sonraki oturumun otomatik gündemi değil, her biri ayrı, kapsamı netleştirilmiş bir karar/görev olarak ele alınmalı.
