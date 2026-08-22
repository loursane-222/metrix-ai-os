# METRIX Görev Notu — Büyük Resim Operasyonu: Açık Kalemler

**Tarih:** 2026-08-23
**Kapsam:** `METRIX_TASK_BRIEF_buyuk-resim-mimari-operasyonu.md`'nin 5 fazı (Faz 0-4) tamamlandıktan sonra, o fazlar boyunca **bulunan ama düzeltilmeyen** hatalar ve **bilinçli olarak dışarıda bırakılan** kapsam boşlukları. Bu belge unutulmamaları için tek bir yerde toplar — hiçbiri şu an acil değil, hiçbiri kendiliğinden bir sonraki faza otomatik girmiyor; her biri ayrı bir karar/görev olarak ele alınmalı.

---

## A. Bulunan, Düzeltilmeyen Hatalar

### A1. `generalImportConversationExtension` muhtemelen hiç çalışmıyor

**Dosya:** `src/lib/conversation-extensions/general-import-conversation-extension.ts:22`

`getActiveScopeKey()` koşulsuz `null` döndürüyor. `active-conversation-extension.ts`'teki `executeActiveConversationExtension` fonksiyonu şu filtreyi uyguluyor:

```ts
const active = extensions.filter((extension) => extension.getActiveScopeKey() !== null);
```

Yani `getActiveScopeKey()` `null` dönen bir uzantı **hiçbir zaman** `active` listesine girmiyor — asla çalıştırılmıyor. Projedeki diğer tüm "surface-scoped olmayan" (her sayfadan tetiklenebilen) uzantılar bunun yerine `typeof window === "undefined" ? null : "<sabit-anahtar>"` deseni kullanıyor (örn. `customer-management-conversation-extension.ts`, `production-management-conversation-extension.ts`).

**Etkisi:** Kullanıcı domain belirtmeden "excel'den aktar" dediğinde, bu uzantının üretmesi gereken netleştirme sorusu ("Hangi alan: Müşteri, Ürün, ... ?") muhtemelen hiç tetiklenmiyor; turn free-form üretime düşüyor.

**Bulunuş şekli:** Faz 4'te kendi yeni uzantılarım (`payment-reminder-conversation-extension.ts`, `orchestration-conversation-extension.ts`) için aynı yanlış deseni kopyaladığımda fark ettim, kendi dosyalarımı düzelttim ama bu pre-existing dosyaya dokunmadım (kapsam dışı).

**Önerilen düzeltme (küçük, düşük riskli):**
```ts
getActiveScopeKey() { return typeof window === "undefined" ? null : "general-import"; },
```

---

### A2. `UnavailableBusinessSurface.tsx` içinde ölü COPY anahtarları

**Dosya:** `src/components/living-workspace/UnavailableBusinessSurface.tsx`

Faz 1 ve Faz 3 denetimleri boyunca defalarca gözlemlendi: `suppliers`, `goals`, `reports`, `accounting`, `documents`, `tasks`, `team`, `finance` gibi COPY anahtarları hâlâ dosyada duruyor, ama artık hiçbir `page.tsx` bu bileşeni bu prop değerleriyle çağırmıyor — ilgili domainler kendi `*CanonicalScreen` bileşenlerine taşınmış durumda. İşlevsel etkisi yok (kullanıcı hiç görmüyor), yalnızca temizlik/okunabilirlik konusu.

**Önerilen aksiyon:** Kullanılmayan anahtarları silmek — küçük, izole, test kapsamı düşük risk.

---

### A3. Sohbet tetikleyici önceliği: konuşma geçmişi biriktikçe yeni uzantılar bazen "ele geçiriliyor"

**Bağlam:** Faz 4'te canlı doğrulama sırasında gözlemlendi. "Atlas Insaat'a tahsilat hatırlatması gönder" komutu **temiz bir oturumda** (yeni konuşma) doğru çalıştı — `paymentReminderConversationExtension` tetiklendi, doğru sonucu ("bakiye yok, hatırlatma gönderilmedi") doğru anlattı. Ama birkaç turluk bir konuşmanın **ortasında**, aynı komut yerine müşteri kaydını açan farklı bir davranış üretti (muhtemelen `customerManagementConversationExtension` veya business-navigation'ın kendi bağımsız sınıflandırması turu önce ele geçirdi).

**Kök neden izole edilmedi** — muhtemelen `extensions` dizisindeki sıralama (yeni uzantılar dizinin sonunda) ile business-navigation'ın turn-bağımsız NLU sınıflandırması arasında bir yarış durumu, ama bu doğrulanmadı, yalnızca gözlemlendi.

**Etkisi:** `paymentReminderConversationExtension` ve `orchestrationConversationExtension`'ın (Domain 25/26 v1) güvenilirliği, konuşmanın o ana kadarki geçmişine bağlı olarak değişebilir — her zaman tetiklenmeyebilirler.

**Önerilen aksiyon:** Ayrı bir teşhis fazı — hangi mekanizmanın (extensions sıra önceliği mi, business-navigation mı) hangi durumda kazandığını gerçek transkriptlerle izole etmek, gerekirse yeni uzantıları dizide daha öne almak veya business-navigation'ın bu iki yeni yeteneği tanıyıp devre dışı bırakması gerekiyor.

---

### A4. `deliveries.write` izni hiçbir role tanımlı değildi (DÜZELTİLDİ)

**Dosya:** `src/lib/action-runtime/gateway/execution-context.ts`

Genel orkestrasyon planlayıcısını "sipariş oluştur, irsaliyesini kes" ile canlı test ederken bulundu: `delivery.create` aksiyonunun manifestteki `requiredPermissionSet: ["deliveries.write"]` şartı, `ROLE_PERMISSIONS` haritasında **hiçbir role** (OWNER dahil) tanımlı değildi — bu yüzden Faz 3'te kurulan İrsaliye action-runtime handler'ı hiç kimse tarafından çalıştırılamıyordu (`PERMISSION_DENIED`). OWNER/EXECUTIVE/MANAGER rollerine `deliveries.write` eklenerek düzeltildi ve canlı doğrulandı (sipariş→irsaliye zinciri artık uçtan uca tamamlanıyor). Bu, Faz 3'ün kendi eksiğiydi, Faz 4/5'te bulundu ve düzeltildi.

---

## B. Kalan Bilinçli Kapsam Boşlukları (Senin Kararını Gerektirir)

### B1. Domain 01 — İşletme (supra-domain, hâlâ KISMEN)

Ayrı bir İşletme Prisma modeli/runtime yüzeyi gerekip gerekmediği saf bir mimari karar — mevcut kod bunu bilinçli olarak `WORKSPACE_DOMAINS` listesine dahil etmiyor, diğer tüm domainlerin "üst anayasası" olarak kalıyor. Tek fazlık bir CRUD işi değil.

**Karar gereken soru:** İşletme'nin kendi canonical varlığı olmalı mı, yoksa mevcut haliyle (yalnızca kavramsal üst çerçeve) mi kalmalı?

---

### B2. Domain 28 — Entegrasyon (hâlâ KISMEN)

9 domain için dosya bazlı Excel/CSV import var (bu oturumda genişledi), ama canlı webhook/API senkronizasyonu, vendor connector lifecycle (Bizim Hesap, Logo, Mikro, Paraşüt gibi programlarla **canlı, sürekli** bağlantı) yok — yalnızca tek seferlik dosya yüklemesi.

**Karar gereken soru:** Hangi dış sistem önce hedeflenecek? Bu, dış sistemin kendi API/webhook desteğine bağlı bir iş kararı, kod-only bir görev değil.

---

### B3. Domain 25 — Yönetici İletişim Motoru: v1'in ötesi

Faz 4'te kurulan `ExecutiveCommunication` modeli/servisi şu an yalnızca:
- Tek tip: tahsilat hatırlatması (`PAYMENT_REMINDER`)
- Tek hedef kitle: müşteri
- Tek kanal: e-posta
- Tek ton: FRIENDLY (sabit)

**Anayasanın istediği ama v1'de olmayanlar:** çoklu kanal (SMS/WhatsApp), tedarikçi/ekip/yönetim kurulu hedef kitlesi, ton/müzakere zekası (aynı bilginin farklı hedef kitlelere farklı anlatılması), zamanlanmış/ertelenmiş gönderim.

**Ayrıca önemli bir tutarlılık notu:** Mevcut Teklif e-posta gönderim akışı (`dispatchQuoteToCustomerEmail`, `src/lib/core/quotes/quote.service.ts:408`) yeni `ExecutiveCommunication` canonical modeline **taşınmadı/konsolide edilmedi** — bilinçli bir kapsam sınırı (riskten kaçınmak için, çalışan bir akışa dokunmamak amacıyla), ama şu an iki ayrı iletişim implementasyonu paralel duruyor. Kök Neden 2'nin öğrettiği "iki paralel sistem" deseniyle örtüşme riski var — gelecekte bu ikisinin gerçekten aynı işi mi yaptığı yoksa kasıtlı olarak mı ayrı kaldığı (Faz 2'de karar motorları için yapılan analizin aynısı) resmi olarak doğrulanmalı.

---

### B4. Domain 26 — Yönetici Orkestrasyon Motoru: v1'in ötesi (GÜNCELLENDİ — genel planlayıcıya geçildi)

**2026-08-23, aynı gün ikinci güncelleme:** Kullanıcının açık isteğiyle ("orkestrasyon METRIX'in içindeki her şey için çalışabilir olmalı, kullanıcının dili/şivesi performansı düşürmesin") sabit tek-örüntülü planlayıcı **tamamen kaldırıldı**, yerine action-runtime'ın kayıtlı ~25 aksiyonunu (`actionRegistry.listActionsByClass("DOMAIN")`, `approvalPolicy === "NONE"`, dolu şema) canlı okuyan, keyfi kullanıcı ifadesinden keyfi çok-adımlı plan çıkaran genel bir planlayıcı kuruldu (`general-plan-resolver.ts`, `entity-resolvers.ts`, `action-catalog.ts`). Canlı doğrulama: hem farklı domain kombinasyonlarında (teklif+görev, tedarikçi+ürün, sipariş+irsaliye) hem argo/şive Türkçe ifadelerde ("yeni bi tedarikçi ekle bize", "hemen peşinden") doğru çalıştı; adımlar arası referans ("$step1" — bir önceki adımda oluşan kaydı sonraki adımda kullanma) da doğrulandı.

**Hâlâ kasıtlı olarak v1 dışı:**
- **Onay gerektiren aksiyonlar** (`quote.dispatch`, `customer.archive`, `payment.apply` gibi HIGH risk/EXPLICIT approval olanlar) plana hiç dahil edilmiyor — orkestrasyon runtime'ı henüz "duraklat/onay bekle/devam et" bilmiyor (Domain 26'nın kendi "Onay Bekliyor" durumu, §21 State Intelligence). Bu, kasıtlı bir güvenlik sınırı: onay gerektiren bir işlemi otonom bir zincire sokmak riskli olurdu.
- **Boş şemalı aksiyonlar** (`order.transitionStatus`, `production.update`, `stock.transfer`, `warehouse.create` gibi ~10+ aksiyon) manifestlerinde gerçek input şeması hiç tanımlanmamış olduğu için planlayıcının kataloğunda görünmüyor — planlanamıyorlar. `delivery.create` için bu oturumda düzeltildi (gerçek şema eklendi), gerisi düzeltilmedi.
- **Paralel yürütme, bağımlılık grafiği, rollback/recovery, exception/learning intelligence** hâlâ yok — motor sıralı, tek-yönlü çalışıyor.
- **Dış dünya** (internet arama, üçüncü taraf rezervasyon/API entegrasyonu) kullanıcının kendi kararıyla bu turda kapsam dışı bırakıldı — ayrı, çok daha büyük bir girişim (bkz. B2 Entegrasyon).

**Karar gereken soru (yeni):** Onay gerektiren aksiyonları da zincire dahil edebilmek için orkestrasyon runtime'ına "duraklat/onay iste/devam et" akışı eklenmeli mi — bu, Domain 26'nın kendi state machine'inin bir sonraki doğal parçası, ama gerçek bir mühendislik yatırımı (UI'da bekleyen onayları gösterme, kullanıcı onayladıktan sonra kaldığı yerden devam etme).

---

## Kapanış Notu

B1-B3, `buyuk-resim-mimari-operasyonu.md`'nin Faz 3/4 triyajında zaten "senin kararını gerektirir" diye işaretlenmişti. B4, Faz 4'te v1 olarak kurulup aynı gün (kullanıcı isteğiyle) genel amaçlı hale getirildi — kalan sınırları yukarıda güncellendi. A1-A4, Faz 4/5 sırasında **yeni bulunan**, önceki hiçbir belgede kayıtlı olmayan bulgular (A4 düzeltildi, A1-A3 hâlâ açık).

Hiçbiri şu an bir sonraki oturumun otomatik gündemi değil — her biri ayrı, kapsamı netleştirilmiş bir karar/görev olarak ele alınmalı.
