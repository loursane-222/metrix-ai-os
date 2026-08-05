# METRIX — Living Product Completion: Operation Handoff

Prepared: 2026-08-02. Single-piece handoff per the "METRIX Living Product Completion Operasyon Manifestosu 1.0" (`/Users/mac/Downloads/METRIX Living Product Completion Operasyon Manifestosu 1.0.docx ⭐.docx`) and the Foundation ZIP (`/Users/mac/Desktop/METRIX FOUNDATION/Metrix_Foundation.zip`).

**Supersedes**: `METRIX_SESSION_HANDOFF.md`, `METRIX_OFFER_SESSION_HANDOFF.md` (already marked superseded), `METRIX_OFFER_OPERATION_HANDOFF.md`. Those three files are left in place, unmodified, for history only — do not re-read them for next-step guidance, this file is the current source of truth. This file's §7 replaces `METRIX_ARCHITECTURE_MATRIX.md`'s role going forward — that file has been rewritten in place with the manifesto's status vocabulary and today's findings.

---

## 1. Operasyonun amacı

Foundation'da (kurucu anayasalar) tanımlanmış ama production'da henüz yaşamayan davranışları, mevcut mimariyi (Living Workspace, Executive Personality, Canonical Operational Chain / Action Runtime) genişleterek production'da gerçekten yaşayan davranışlara dönüştürmek. Yeni mimari, yeni anayasa, yeni capability icadı yok — yalnızca Foundation'ın production'da yaşatılması.

## 2. Bu operasyonda hayata geçen anayasal davranışlar

**Görev (Task) Domain Anayasası — ACCEPTED.**
**Bildirim (Notification) Domain Anayasası — ACCEPTED.**

İkisi de daha önceki bir oturumda kod olarak tamamlanmış, deploy edilmişti (`IMPLEMENTED_PENDING_ACCEPTANCE`), ama hiç authenticated production acceptance görmemişti. Bu operasyon bu boşluğu kapattı — hem gerçek bir üretim hatası buldu/düzeltti hem de tam kabul turunu tamamladı.

### 2.1 Bulunan ve düzeltilen gerçek production hatası

Görev oluşturma, konuşmadan yalnızca başlık değil (çok normal kullanım — "yarına kadar", "öncelik yüksek" gibi) ek alan da çıkarıldığında **her zaman** sessizce başarısız oluyordu ("Bu işlemi gerçekleştiremedim. Tekrar dener misiniz?").

- **Kök neden 1**: `src/components/living-workspace/TaskCreateScreen.tsx` yalnızca `title` alanı için bir Universal Input hedefi kayıtlıydı. Konuşma planı `description`/`dueDate`/`priority` de içerdiğinde, alan batch'i bu kayıtsız hedefler için `MISSING` outcome üretiyordu (`src/lib/input-authority/batch.ts:32`), bu da `ExecutiveNavigationCommandHost.tsx:87`'de tüm navigation komutunu `FAILED` yapıyordu, ve `TaskCreateConversationCoordinator` (`task-create-conversation-coordinator.ts:88-91`) bunu `CREATE_NAVIGATION_FAILED` olarak raporlayıp tüm oluşturmayı iptal ediyordu.
- **Kök neden 2**: LLM tabanlı görev planlayıcısının (`task-create-conversation-planner.ts`) sistem promptunda bugünün tarihi yoktu; "yarın"/"bugün" gibi göreli ifadeler production'da yanlış (ör. 2024) bir yıla çözülüyordu.
- **Düzeltme (commit `3e4ab80`, pushed, deployed, production-verified)**: `TaskCreateScreen.tsx`'e `description`/`dueDate`/`priority` için title ile aynı desende Universal Input kaydı + `data-executive-target` eklendi. Planlayıcı sistem promptuna gerçek `new Date()` ISO tarihi eklendi. **Tek deploy** — iki bulgu da aynı acceptance turunda bulundu, tek pakette düzeltildi.

### 2.2 Production acceptance kanıtı (gerçek hesap: loursane@gmail.com, `https://metrixgm.com/metrix`)

- "Yeni görev oluştur: Ofis kirasini yarina kadar ode, öncelik yüksek olsun" → gerçek `Task` kaydı oluştu (`id cmsbpn0cq000004jfreyhgkro`), `POST /api/tasks/actions/create` → 200, `stagesCompleted` tüm Action Runtime aşamalarını (REGISTRY_LOOKUP → ... → RESULT_BUILDING) geçti.
- `dueDate` doğru hesaplandı: `2026-08-03` (bugün 2026-08-02, "yarın") — tarih-çapa düzeltmesi doğrulandı.
- `GET /api/tasks` → kayıt sunucu tarafında kalıcı, doğru alanlarla (`title`, `dueDate`, `priority: HIGH`, `status: OPEN`).
- `notificationDelivered: true`, `memoryRecorded: true` — yan etkiler gerçek.
- `GET /api/notifications` → gerçek `task.created` bildirimi, doğru `recipientUserId`, doğru `entityId`.
- Sayfa tamamen yenilendi (`navigate force`) → konuşma geçmişi sunucudan doğru okunuyor; **ayrı, tamamen bağımsız** canonical `/metrix/tasks` ekranı aynı kaydı aynen gösteriyor (client-side conversation state değil, gerçek sunucu kalıcılığı).
- `/metrix/notifications` ekranında bildirim göründü; "Okundu işaretle" tıklandı → `GET /api/notifications` sonrasında `isRead: true`, `readAt` set edilmiş — gerçek mutasyon, kalıcı.
- Living Workspace davranışı korunuyor: her adımda URL `metrixgm.com` (`/metrix`) sabit kaldı, sohbet paneli hiç unmount olmadı, kayıt sağ panelde inline açıldı.

### 2.3 Self Review (manifesto formatı)

| Soru | Sonuç |
|---|---|
| Kurucu anayasa korundu mu? | PASS |
| Living Workspace korundu mu? | PASS — URL sabit, sohbet paneli mount kaldı, inline açılış |
| Single Authority korundu mu? | PASS — tek Action Runtime yolu (`task.create`), ikinci runtime/planner yok |
| Executive Personality korundu mu? | PASS — kimlik/prompt katmanına dokunulmadı |
| Executive Presence etkilendi mi? | NOT APPLICABLE (olumsuz etki yok; tarih-çapa düzeltmesi doğruluğu artırdı) |
| Executive Awareness korundu mu? | PASS |
| İkinci authority oluştu mu? | PASS (hayır, oluşmadı) |
| Kullanıcı gerçekten yeni bir yaşayan davranış kazandı mı? | PASS — konuşarak görev oluşturma artık production'da gerçekten çalışıyor |

**FAIL yok → operasyon ACCEPTED.**

## 3. Henüz yaşamayan davranışlar (bu operasyonda bilinçli olarak dokunulmadı)

- **Var olan görevi isimle yeniden açma** ("X görevini aç") — Müşteri/Teklif'te var, Görev'de yok. Görev'in Foundation kapsamı bu operasyonda yalnızca konuşarak **oluşturma** idi; "aç/bul" ayrı bir Foundation-tanımlı davranış olarak ele alınmalı, bugün icat edilmedi.
- **Göreve kişi atama** (`assigneeUserId`) — arayüzü hiç yok, kişi çözümleme mantığı yok. LLM planlayıcı şemada bu alanı üretebilir ama karşılığı yok; ileride ayrı bir operasyon konusu.

## 4. Dondurulmuş (frozen) — bu operasyonda yeniden analiz edilmedi

Aşağıdakiler önceki oturumlarda `ACCEPTED` olarak kapatıldı ve bu operasyonda **kasıtlı olarak yeniden doğrulanmadı** (kullanıcı talimatıyla donduruldu):

- **Müşteri (Customer)** — ACCEPTED, production-verified.
- **Teklif (Offer/Quote)** — ACCEPTED, production-verified (commit `0cde6ad` + `99f4af5`), Living Workspace entegrasyonu dahil.
- **Conversation–Workspace tek otorite düzeltmesi** (`buildUniversalHandoffMessage`, commit `fbeb6af`) — tüm domainler için geçerli, production-verified.
- **Executive Core P0 bulguları** (2026-07-25 tarihli `METRIX_Constitution_Audit.md`'deki gap-intercept bypass, sessiz mock-fallback, onaysız otomatik durum değişikliği) — bu operasyonda yeniden doğrulandı ve **üçü de halihazırda düzeltilmiş** bulundu (bkz. §7.1). Yeniden araştırılmasına gerek yok.

Bu maddelerin hiçbiri bu operasyonda değiştirilmedi, test edilmedi ya da sorgulanmadı — sadece mevcut ACCEPTED durumları teyit edilip referans olarak kullanıldı.

## 5. Commit / Deployment / Acceptance durumu

- **Commit**: `3e4ab80` — `fix(tasks): complete the conversational field-set contract for Task create` — main'e push edildi.
- **origin/main**: `3e4ab80` ile senkron (0 ahead / 0 behind).
- **Deploy**: Vercel GitHub entegrasyonu ile otomatik deploy edildi (push sonrası); bundle içeriği (`tasks.create.task.dueDate` string'i) doğrudan üretim JS bundle'ından grep ile doğrulandı — `vercel inspect` polling yapılmadı (standart talimat).
- **Acceptance**: Yukarıdaki §2.2 — tam, authenticated, production, gerçek kullanıcı hesabıyla.
- **Production'da bu operasyonda değişen gerçek veri**: `Task` `cmsbpn0cq000004jfreyhgkro` ("Ofis kirasini ode", OPEN, HIGH, vade 2026-08-03) ve buna bağlı `Notification` `cmsbpn0eu000104jf74rl871i` (okundu işaretlendi) — organizasyon `e52d30e1-1af1-425e-9c6e-3c3cb736c9b1` içinde, kalıcı, silinmedi.

## 6. Açık kalan işler

- Yok — bu operasyonun kapsamındaki her şey (§2) tamamlandı, doğrulandı, ACCEPTED.
- §3'teki iki madde açık ama **bu operasyonun kapsamı dışında**, bilinçli olarak bırakıldı.

## 7. İkinci operasyon (aynı oturum) — Tahsilat (Collection & Payment): ACCEPTED

Kullanıcı talimatıyla Şirket/Ürün acceptance turu atlandı; bunun yerine Foundation'da tanımlı ama hiç yaşamayan bir sonraki davranış seçildi ve **tamamlandı**: **Tahsilat (Collection & Payment)**, domain #13. Seçim gerekçesi ve tam kanıt `METRIX_ARCHITECTURE_MATRIX.md` §6'da.

- **Commit**: `b7f3a2e` — main'e push edildi, deploy edildi, production bundle'da doğrulandı.
- **Kapsam**: konuşarak tahsilat/alacak kaydı oluşturma ("Atlas Insaat için 7500 TL tahsilat kaydet") + canonical `/metrix/collections` liste yüzeyi. Mevcut `Payment` Prisma modeli, mevcut `POST /api/payments` (yeni execution authority yok), mevcut `resolveCustomerReference` müşteri çözümleyici yeniden kullanıldı.
- **Bulunan ve düzeltilen gerçek hata**: `LivingWorkspaceHost.tsx`'in generic liste yükleyicisi yalnızca `customers`/`products`/`tasks` response anahtarlarını tanıyordu — `payments` eklenmeden liste hep "Kayıt bulunamadı" gösteriyordu. Tek pakette düzeltildi.
- **Production acceptance**: gerçek hesap, gerçek "Atlas Insaat" müşterisi — `Payment` `cmsbqzjfo000004ju0oxbazsk` oluşturuldu, `GET /api/payments` ile kalıcılık doğrulandı, tamamen ayrı bir sayfa yüklemesinde (`/metrix/collections`) aynı kayıt göründü. Negatif yol (bilinmeyen müşteri → CLARIFICATION_REQUIRED) yalnızca local dev'de doğrulandı (aynı kod, ortamdan bağımsız).
- **Self Review**: 8 maddenin hepsi PASS, FAIL yok.
- **Bilinçli olarak yapılmadı**: ödemeyi PAID olarak işaretleme, `CollectionAction` dunning/hatırlatma akışı, isimle mevcut tahsilatı yeniden açma — üçü de ayrı bir operasyon konusu, altyapıları (`payment.apply`, `collection.start`, `collection.set_lifecycle` Action Registry kayıtları) dokunulmadan hazır bekliyor.

## 8. Üçüncü operasyon (aynı oturum) — Fatura (Invoice): ACCEPTED

Kullanıcı talimatıyla ("Tahsilat capability ACCEPTED durumundadır... yeni capability seç") sıradaki hedef, Financial/Stock/Invoice/Accounting/Supplier/Calendar arasından **kanıta dayalı** seçildi: 6 aday domain anayasası tam okunup karşılaştırıldı (özet: `METRIX_ARCHITECTURE_MATRIX.md` §7). **Fatura (Invoice)**, domain #12, seçildi çünkü (a) en yüksek günlük kullanıcı değerine sahip ("fatura kesmek" bir SME sahibinin en sık yaptığı gerçek işlerden biri), (b) hiçbir inşa edilmemiş domain'e bağımlı değil (anayasası açıkça Order/Delivery gerektirmediğini belirtiyor), (c) zaten inşa edilmiş Teklif→Tahsilat zincirini doğal olarak tamamlıyor. Muhasebe elendi çünkü kendi anayasası değerini "Invoice/Payment event'lerini otomatik işleme" olarak tanımlıyor ve bunlar bu operasyondan önce olgun değildi.

- **Commit**: `ae6efb0` — main'e push edildi, deploy edildi, production bundle'da doğrulandı (cache-bust sonrası — aşağıdaki metodoloji notuna bak).
- **Kapsam**: konuşarak DRAFT fatura oluşturma ("Atlas Insaat için 20000 TL fatura kes") + %20 KDV hesaplaması + otomatik fatura numarası (`FTR-{yıl}-{sıra}`) + canonical `/metrix/invoices` liste yüzeyi (yeni route, hiçbir şeyin yerine geçmedi).
- **Mimari fark**: Tahsilat'ın aksine Fatura'nın hiç altyapısı yoktu — Task'ın tam modern Action Runtime deseni (Prisma model+migration, domain service, Action Registry manifest, handler, gateway, composition-root kaydı) sıfırdan, birebir aynı şekilde uygulandı. Yeni authority/runtime/planner YOK — yalnızca mevcut desenin bir domain daha için tekrarı.
- **Bulunan ve düzeltilen gerçek hata**: `execution-context.ts`'teki rol→izin haritasında hiçbir rol için `"invoices.write"` yoktu — `invoice.create` her aktör için (OWNER dahil) politika değerlendirmesinde 403 ile reddediliyordu, handler'a hiç ulaşmadan. OWNER/EXECUTIVE/MANAGER'a eklendi (payments.write/collections.write ile aynı yere).
- **Metodoloji notu (ürün hatası DEĞİL)**: İlk production testinde istek serbest metin AI cevabına düştü (extension eşleşmedi gibi göründü) — kök neden: tarayıcı sekmesi deploy tam yayılmadan önceki JS bundle'ını yüklemişti. Cache-bust sonrası aynı ifade doğru çalıştı. Gelecekte benzer bir durum görülürse önce gerçekten yüklü bundle'ı doğrula (`performance.getEntriesByType('resource')` + fetch+grep), hemen ikinci bir "düzeltme" deploy'u yapma.
- **Production acceptance**: gerçek hesap, gerçek "Atlas Insaat" müşterisi — `Invoice` `cmsbwkcnu000004jreekfg26s` (`FTR-2026-0001`, amount 20000, taxAmount 4000, totalAmount 24000 — vergi matematiği doğru) oluşturuldu, `GET /api/invoices` ile kalıcılık doğrulandı, tamamen ayrı bir sayfa yüklemesinde (`/metrix/invoices`) aynı kayıt aynı toplamlarla göründü.
- **Self Review**: 7 maddenin hepsi PASS, FAIL yok.
- **Bilinçli olarak yapılmadı**: çok satırlı kalem detayı, SENT/PAID/CANCELLED durum geçişleri, gerçek e-Fatura gönderimi, faturayı kaynak Teklif'e otomatik bağlama, isimle mevcut faturayı yeniden açma. Hepsi ayrı bir operasyon konusu.

## 9. Dördüncü operasyon (aynı oturum, devam) — Tahsilat mark-as-paid (`payment.apply`): ACCEPTED

Bu oturum `Metrix_Foundation_2.zip` (Desktop, Foundation'ın önceki `Metrix_Foundation.zip`'ten daha güncel kopyası) ile senkronize edildi: 2 yeni anayasa bulundu (Executive Onboarding, Executive Subscription & Licensing — ikisi de tam okundu, kodla karşılaştırıldı, **inşa edilmedi**, `METRIX_ARCHITECTURE_MATRIX.md` §8'e loglandı). Kullanıcı bu ikisini inşa etmek yerine mevcut §4 sıralamasındaki 1. maddeyi (Tahsilat'ın ikinci yarısı) seçti.

- **Commit**: `0dc83ce` — main'e push edildi, deploy edildi, production'da doğrulandı (gerçek hesap, gerçek "Atlas Insaat" `Payment` `cmsbqzjfo000004ju0oxbazsk`).
- **Kapsam**: `payment.apply`'ı gerçek bir Action Runtime capability'sine dönüştürmek — var olan Action Registry kaydının `inputSchema`'sı (`customerId`/`quoteId`/`amount`, hiç `paymentId` yok) düzeltildi (artık `paymentId`+`amount`), handler+gateway+composition-root kaydı `invoice.create`/`customer.archive` desenleriyle birebir aynı şekilde eklendi. `/metrix/collections` listesine satır bazlı "Ödendi olarak işaretle" + inline Onayla/Vazgeç eklendi — **kullanıcının açık talimatıyla** bu, sayfaya özel bir özellik değil, tek bir canonical gateway (`payment-apply-gateway.ts` + `src/lib/payments/payments-client.ts`), herhangi bir Living Workspace yüzeyinden çağrılabilir; ikinci bir mutation authority oluşturulmadı.
- **Gerçek mimari bulgu**: `payment.apply` `riskLevelBase: HIGH` + `approvalPolicy: CONDITIONAL` — policy engine bunu gerçekten zorluyor (`REQUIRES_APPROVAL`, salt açıklayıcı metadata değil). Konuşma tabanlı (serbest metin) bir tetikleyici bilinçli olarak yapılmadı: kod tabanında hiçbir yerde HIGH-risk/CONDITIONAL onayın konuşma içi (çok turlu) bir akışla yapıldığına dair emsal yok — yalnızca UI buton request/confirm deseni (customer.archive, quote.dispatch) kanıtlanmış durumda; konuşma tabanlı bir onay akışı icat etmek yeni mimari olurdu.
- **Production acceptance kanıtı**: "Ödendi olarak işaretle" → `POST /api/payments/{id}/actions/apply` (`request`) → 200 → Onayla → aynı route (`confirm`) → 200 → `DURUM: PAID`. Bağımsız, tamamen yeni bir sayfa yüklemesinde (`/metrix/collections`) aynı `PAID` durumu görüldü — sunucu tarafı kalıcı. `/metrix/notifications`'da gerçek "Tahsilat tamamlandı" bildirimi göründü.
- **Metodoloji notu**: deploy sonrası ilk kontrolde yüklü JS bundle henüz yeni kodu içermiyordu (Vercel yayılma gecikmesi, regresyon değil) — `performance.getEntriesByType('resource')` + fetch-grep ile doğrulandı, zorla yeniden yükleme sonrası düzeldi. Yayılmayı beklerken kullanılan sıkı bir curl polling döngüsü, production domain'inde Vercel bot-koruma checkpoint'ini bir kez tetikledi (geçici, bir sonraki gerçek navigasyonda kendiliğinden temizlendi) — gelecekte tek bir bekleme + tek bir yeniden kontrol tercih edilmeli, sıkı poll döngüsü değil.
- **Self Review**: 8 maddenin hepsi PASS, FAIL yok.
- **Bilinçli olarak yapılmadı**: serbest metin/konuşma tetikleyici (yukarıda gerekçelendirildi), kısmi ödeme UI'ı (servis katmanı `applyPaymentAmount` PARTIAL/PAID ayrımını doğru hesaplıyor, ancak buton her zaman kalan bakiyenin tamamını uyguluyor), negatif yol'un (zaten PAID / bakiyeyi aşan tutar) production browser'da ayrıca doğrulanması (test suite'te kapsanıyor, local'de değil canlıda tekrar doğrulanmadı — Tahsilat'ın orijinal negatif yolu da yalnızca local dev'de doğrulanmıştı, aynı emsal).

## 10. Beşinci operasyon (yeni oturum) — Tahsilat CollectionAction AI dunning/follow-up review: IMPLEMENTED_PENDING_ACCEPTANCE (o zaman ACCEPTED denmişti, kullanıcı düzeltti — bkz. §11)

**Kullanıcı düzeltmesi**: Bu bölüm ilk yazıldığında ACCEPTED olarak kapatılmıştı. Kullanıcı doğru şekilde reddetti: production acceptance için gerçek bir PARTIAL veya OVERDUE Payment olayının production'da gerçekleşmesi gerekir, yalnızca review/Action-Runtime yarısının çalışması yetmez. Hiçbir kod yolu gerçek bir OVERDUE üretemediği ve hiçbir UI gerçek bir PARTIAL üretemediği için, öneri→inceleme zinciri gerçek veriyle hiç çalıştırılmamıştı — yalnızca geçici bir local-dev kod değişikliğiyle. §11 bu boşluğu kapatıp ACCEPTED'i gerçek production kanıtıyla yeniden kuruyor.

`METRIX_ARCHITECTURE_MATRIX.md` §4'ün o zamanki 1. maddesi (en küçük sıradaki artım) doğrudan seçildi, yeniden keşif yapılmadı. Tam kanıt ve mimari detay `METRIX_ARCHITECTURE_MATRIX.md` §10'da.

- **Commit**: `bae5d64` — main'e push edildi, deploy edildi, production'da doğrulandı (`GET /api/collection-actions` gerçek hesapla 200 döndü, `metrixgm.com`).
- **Kapsam**: `CollectionAction` veri modeli, `syncAiCollectionActions` (AI öneri üretici) ve `collection.set_lifecycle` (Action Runtime handler'ı zaten registered ama hiç çağrılmıyordu) — üçü de önceden vardı, ilk kez gerçek bir çağırana bağlandı. Yeni `GET /api/collection-actions` route'u sync+list yapıyor; `/metrix/collections`'a yeni "Tahsilat Aksiyonları" paneli eklendi (Tamamlandı/Reddet, `customer-archive-gateway.ts` ile birebir aynı request→confirm→execute deseni). `collection.start` bilinçli olarak dokunulmadı — şeması (`paymentId`+`customerId`, `collectionActionId` yok) var olan bir öneriyi hedefleyemez; icat edilecek yeni semantik yerine `collection.set_lifecycle`'ın zaten kapsadığı IN_PROGRESS/DONE/DISMISSED yeterli görüldü.
- **Gerçek mimari bulgu (bu operasyonun kapsamı dışında, düzeltilmedi)**: production'da hiçbir Payment hiçbir canlı UI üzerinden OVERDUE veya PARTIAL'a ulaşamıyor (OVERDUE'yu hiçbir kod yolu set etmiyor; kısmi ödeme UI'ı hiç yok, yalnızca `payment.apply`'ın tam-bakiye butonu var). Bu yüzden panel gerçek ve doğru ama production'da bugün doğal olarak gösterecek veri yok.
- **Doğrulama**: Tam uçtan uca akış (gerçek PARTIAL payment'tan öneri üretimi, panel render, hem Tamamlandı/DONE hem Reddet/DISMISSED — ikisi de Action Runtime'da SUCCESS, 9 aşamanın tamamı tamamlandı) local dev'de doğrulandı — var olan "ödendi işaretle" butonu geçici olarak kısmi tutara yönlendirilerek (test sonrası hemen geri alındı, committed koda göre diff yok). Production'da yalnızca endpoint canlılığı ve regresyon yokluğu doğrulandı (gerçek veri yokluğu nedeniyle) — Tahsilat'ın ve payment.apply'ın orijinal negatif yollarıyla aynı emsal.
- **Self Review**: 5 maddenin hepsi PASS, FAIL yok.
- **Bilinçli olarak yapılmadı**: `collection.start`, çok kanallı tahsilat iletişimi (WhatsApp/e-posta hazırlama), cari hesap ekstresi/mutabakat, OVERDUE/kısmi-ödeme-UI altyapı boşluğunun düzeltilmesi (ayrı bir operasyon konusu, Payment lifecycle'a dokunan bir sonraki operasyon için loglandı).

## 11. Altıncı operasyon (aynı oturum) — Payment Lifecycle düzeltmesi (gerçek OVERDUE + gerçek kısmi tahsilat): ACCEPTED

- **Commit**: `40e4ad4` — main'e push edildi, deploy edildi, **uydurma olmayan, organik production verisiyle** doğrulandı (gerçek hesap, gerçek "Atlas Insaat" müşterisi). Tam kanıt ve mimari detay `METRIX_ARCHITECTURE_MATRIX.md` §11'de.
- **Kök neden**: `Payment.status` hiçbir kod yolundan OVERDUE'ya ulaşamıyordu; hiçbir UI'dan gerçek PARTIAL'a ulaşamıyordu (yalnızca tam-bakiye "ödendi işaretle" butonu vardı) — §10'un AI dunning review'ı gerçek altyapıya sahipti ama production'da hiç gerçek veri göremiyordu.
- **Kapsam**: `reconcileOverdueStatuses` (deterministik, Tahsilatlar Anayasası'nın "Otomatik Alanlar: Durum" maddesi — yeni authority değil, `listPayments()` ve `syncAiCollectionActions`'tan çağrılıyor), konuşma uzantısına gerçek vade tarihi ifadesi ayrıştırma (`"vadesi N gün önce geçti"` / `"N gün vadeli"`), ve `PaymentRow`'da gerçek düzenlenebilir kısmi tutar girişi (aynı `payment.apply` gateway'i, ikinci authority yok).
- **Production kanıtı**: gerçek konuşma ifadesi → gerçek Payment (vadesi geçmişte) → gerçek `OVERDUE` durumu (hesaplanmış) → gerçek AI önerisi (`REMINDER`, doğru gecikme/tutar metniyle) → panelde göründü → gerçek kısmi tutar (₺700/₺2200) girişi ile "Tahsil edildi" → gerçek `PARTIAL`→(hala OVERDUE, doğru) → "Tamamlandı" → gerçek Action Runtime `SUCCESS`, 9 aşama tamam.
- **Metodoloji notu**: ilk production testi başarısız görünmüştü (Fatura'nın belgelenmiş yanlış alarmıyla aynı belirtiler) ama kök neden farklıydı — bu sefer bundle bayat değildi, hiç deploy edilmemişti (kod yalnızca local'de doğrulanmış, henüz commit/push edilmemişti). Bundle'da "vadesi" string araması yanlış pozitif verdi (alakasız, önceden var olan bir Customer alan-etiketi sözlüğüyle eşleşti). Gelecekte: production'da "neden çalışmadı" diye kod hatası aramadan önce `git status` ile gerçekten deploy edilip edilmediğini kontrol et.
- **Self Review**: Tüm maddeler PASS, FAIL yok.
- **Bilinçli olarak yapılmadı**: `collection.start`, "Gecikmiş Alacaklar" KPI kartı (veri artık var, UI toplama yok), yeni regex'in tüm edge-case'lerinin ayrıca negatif-yol doğrulaması.

## 12. Sıradaki öncelik — kullanıcı talimatı (2026-08-02)

Yeni bir domain'e geçmeden önce kullanıcı **Executive Presence / Executive Conversation** davranışının production'da düzeltilmesini istiyor: bu oturumdaki kabul testi sırasında METRIX kendi bağlamını kaybetti ve kendi önceki mesajına ("bugünün öncelikleri" ekranı) atıfta bulunan bir takip sorusuna, o referansı tanımadan, genel amaçlı bağlamsız bir LLM gibi cevap verdi (hangi ekrandan bahsettiğini sordu). Kullanıcı bunu bir Executive Trust ihlali olarak tanımladı. Bu **bir sonraki operasyon** olarak planlandı (henüz başlanmadı, kapsamı belirlenmedi) — §4'teki diğer yeni-domain işlerinden (Fatura SENT, Muhasebe, Raporlama vb.) daha yüksek öncelikli.

**Yeni oturumun ilk görevi**: Executive Presence/Conversation context-loss düzeltmesini ele al (yukarıda §12). Bu tamamlandıktan sonra `METRIX_ARCHITECTURE_MATRIX.md` §4'teki sıralı önerilerden birine (Fatura'nın SENT geçişi, Muhasebe artık unblocked, Raporlama, veya Hedef) dön. Executive Onboarding / Subscription & Licensing (§8) yalnızca kullanıcı açıkça bu büyük operasyona geçmeyi seçerse ele alınmalı.

---

## 13. Yedinci operasyon (yeni oturum) — Executive Presence context-loss + capability honesty: KISMEN TAMAMLANDI, dispatcher (Business Navigation) sorunu AÇIK

§12'de planlanan Executive Presence/Conversation düzeltmesi bu oturumda ele alındı. Beş kök neden bulundu, dördü düzeltildi ve production'da doğrulandı; beşincisi (müşteri listesi isimlerinin cevaba yansımaması) **hâlâ açık** — bu bölüm onun handoff'udur.

### 13.1 Bu oturumda kapatılan, production-doğrulanmış kök nedenler (dokunmaya gerek yok)

1. **Conversation history LLM'e hiç gitmiyordu** — `src/lib/ai/providers/openai-provider.ts`'deki `client.responses.create/stream` çağrıları yalnızca `instructions` + tek `input: userMessage` gönderiyordu (`store: false`, `previous_response_id` yok). Düzeltme: `GenerateResponseInput.history` (son 12 mesaj, route.ts'de `listRecentMessagesByConversation` ile çekiliyor) → hem streaming hem non-streaming çağrıya thread edildi. **Production'da doğrulandı**: METRIX kendi önceki mesajına ("Bugünün öncelikleri") atıf yapan takip sorusuna artık doğru cevap veriyor.
2. **Capability self-description'ı bastıran rakip talimat** — `src/lib/ai/prompts/prompt-format.ts`'nin "Temel davranis onceligi" bölümünde "'Ne yapabilirsin?' gibi sorulara yetenek listesi verme" satırı vardı; bu, `executive-identity-prompt.ts`'e yapılan üç ayrı düzeltme turunu tamamen etkisiz kılıyordu (konum olarak daha önce/daha yüksek öncelikli). Düzeltme: yalnızca istenmeyen (unsolicited) listelemeyi bastıracak şekilde daraltıldı + açıkça sorulduğunda dogrudan/olumlu/kendini-yalanlamayan cevap zorunlu kılındı. `executive-identity-prompt.ts`'deki yetenek listesi de güncellendi (eski hali yalnızca belge-yükleme akışını anlatıyordu, Task/Offer/Invoice/Payment ACCEPTED olmadan önceki hali). **Production'da doğrulandı**: "Şu anda gerçekten neler yapabiliyorsun?" artık doğru, kendini-yalanlamayan, gerçek capability listesi veriyor.
3. **`organizationSummary` `business_light` context profile'da hiç kullanılmıyordu** — `src/lib/ai/gateway/ai-gateway.ts`'nin üç `renderPromptTemplate(...)` çağrı noktasından hiçbiri `organizationSummary` alanını iletmiyordu; bu alan `route.ts`'de inşa ediliyor ama asla LLM'e ulaşmıyordu. Gerçek, önceden var olan bir kod hatası (varsayım değil — mevcut bir contract test'in `.not.toContain("input.organizationSummary")` assertion'ıyla kanıtlandı). Düzeltme: yalnızca `business_light` profiline eklendi (diğer iki minimal profil — `conversational_minimal`, `immediate_minimal` — kasıtlı olarak hâlâ almıyor, gecikme için). Test güncellendi.
4. **`customers.list` için hiç evidence üretilmiyordu** — `projectBusinessNavigationOperationEvidence` yalnızca tekil müşteri lookup'ları (`customer.detail`/`customer.edit`) için evidence kuruyordu, `customers.list` hiç kapsanmıyordu. Düzeltme: `resolveBusinessNavigation`'ın `target === "list"` dalı artık gerçekten `listCustomers()` çağırıp isimleri `listSnapshot`'a koyuyor; yeni `CUSTOMER_LIST` evidence variant'ı `organizationSummary`'ye hem JSON hem düz Türkçe cümle olarak enjekte ediliyor (`route.ts`).

Commit'ler (main'e push edildi, deploy edildi, `vercel ls` ile deploy başarıları doğrulandı): conversation-history threading, capability-description + customer-list evidence, capability-suppression narrowing (2 tur), `organizationSummary`/`business_light` fix. Tam commit mesajları `git log` içinde.

### 13.2 AÇIK KALAN SORUN — Dispatcher (Business Navigation) müşteri isimlerini hâlâ cevaba yansıtmıyor

**Belirti**: "Hangi müşteriler var?" (ve varyasyonları) her seferinde `Müşteriler` canonical yüzeyini gerçek kayıtlarla (Atlas Insaat, Atlas, Atlas 9d8fbf4, ACCEPTANCE Atlas 9d8fbf4, Arda Yapı) açıyor, ama METRIX'in konuşma cevabı ısrarla "isimler hafızamda yok / paylaşamam" diyor — 13.1/4'teki düzeltmeden ve 13.1/3'teki gerçek bug fix'inden **sonra bile**, çok sayıda yeniden deneme, temiz (brand-new) conversation, ve `vercel ls` ile doğrulanmış taze deploy'lara rağmen değişmedi.

**İncelenecek zincir** (yukarıdan aşağı, her adımda kanıt topla, varsayımla ilerleme):

1. `src/app/api/ai/chat/route.ts` → `classifyConversation({ message })` (`@/lib/conversation-understanding`, LLM tabanlı) — bu çağrı `conversationUnderstanding.businessNavigation` alanını (`domain`/`target`/`entityReference`) gerçekten `{ domain: "customer", target: "list" }` olarak dolduruyor mu, bu spesifik ifade kalıpları için ("hangi müşteriler var", "müşteri isimlerini söyle" vb.)? **Bu, henüz doğrudan doğrulanmadı** — yalnızca dolaylı kanıt var (bkz. aşağı).
2. `src/lib/executive-request-resolution/business-navigation.ts` → `resolveBusinessNavigation` — `request.target === "list"` dalına gerçekten giriyor mu, yoksa `understanding.confidence === "low"` ya da `shouldAskClarification` nedeniyle daha yukarıda `CLARIFICATION_REQUIRED`'a mı düşüyor?
3. `route.ts` → `projectBusinessNavigationOperationEvidence(businessNavigationResolution)` → `businessNavigationOperationEvidence` gerçekten `CUSTOMER_LIST` + dolu `recordNames` üretiyor mu?
4. `route.ts` → `organizationSummary` string'i (13.1/4'teki yeni satırlar dahil) gerçekten bu içeriği taşıyor mu?
5. `src/lib/conversation-understanding/text-response-readiness.ts` + `conversation-runtime-profile.ts` → bu turun `contextProfile`'ı gerçekten `"business_light"` mi çözümleniyor (statik kod okumasıyla öyle olması gerektiği çıkarıldı ama **canlı bir istek için asla doğrudan doğrulanmadı**)?
6. `src/lib/ai/gateway/ai-gateway.ts` → `streamWithAiGateway`'in minimal-profile dalı → `organizationSummary` gerçekten `renderPromptTemplate`'e ulaşıyor mu (13.1/3 ile düzeltildi ama bu spesifik istek için doğrulanmadı)?
7. `src/lib/ai/prompts/prompt-format.ts` → final sistem promptunda "Sirket ozeti:" bölümü gerçekten bu içeriği taşıyor mu — ve modelin bunu "uydurma yapma" talimatına rağmen kullanıp kullanmadığı.

**Elenen olası nedenler** (kanıtla, artık zaman harcama):
- **Deploy propagation lag** — ELENDİ. `vercel ls` ile son 6 push'un tamamı "Ready/Production", her biri push'tan 1-2 dk sonra; birden fazla push arası 4-5 dk beklenip yeniden test edildi, değişiklik yok.
- **Stale/cache'lenmiş `Müşteriler` paneli yanlış pozitif kanıt olabilir mi** — KISMEN İNCELENDİ, sonuçsuz. Panel "Yeni Sohbet" sonrası bile (tamamen yeni conversation, ilk mesaj) aynı davranışı gösterdi — bu, panelin ilgili turda gerçekten yeniden navigate edildiğini KANITLAMIYOR (workspace paneli conversation'dan bağımsız, kalıcı client-side state olabilir — `LivingWorkspaceHost.tsx`/ilgili state yönetimi incelenmedi). **Panel açık olması = bu turda customers.list navigasyonu gerçekleşti, varsayımı doğrulanmadı.**
- **Kodun kendisi yanlış yazılmış olması** — ELENDİ (yüksek güvenle). `business-navigation.ts` ve `ai-gateway.ts`'deki değişiklikler `tsc --noEmit` + tam test suite (1924 test) + `npm run build` ile 5 kez doğrulandı, mantık üç kez elle statik olarak izlendi (regex zincirleri, `resolved()` helper, evidence projection sırası) — sözdizimsel/mantıksal bir hata bulunamadı.
- **`src/app/api/executive/runtime-traces` endpoint'i bir ipucu verdi ama kesin kanıt değil**: başarısız bir turun (`requestId: de33587b`) trace'inde `conversationUnderstandingSummary.suggestedHandling: "executive_reasoning"` (navigasyon-spesifik bir handling değil) ve `canonicalArtifactChain`'de `business_navigation` diye bir stage hiç yok. Ama bu trace yalnızca Executive Runtime (picture/assessment/directive) aşamalarını kapsıyor — `businessNavigation` ayrı bir mekanizma olduğu için onun trace'te görünmemesi onun çalışmadığının kanıtı DEĞİL, yalnızca dolaylı bir sinyal.

**En olası kalan kök neden (doğrulanmadı, sıradaki oturumun ilk hipotezi)**: `classifyConversation`'ın LLM tabanlı navigasyon sınıflandırması, bu ifade kalıpları için `businessNavigation.domain/target`'ı güvenilir biçimde `{customer, list}` olarak doldurmuyor olabilir — yani sorun benim bu oturumda dokunduğum hiçbir dosyada değil, daha yukarıda, `classifyConversation`'ın kendi prompt/logic'inde (dokunulmadı, incelenmedi).

**Sıradaki oturum için somut ilk adımlar** (spekülasyonla değil, kanıtla ilerlemek için):
1. `classifyConversation({ message: "Hangi müşteriler var?" })`'ı izole biçimde (gerçek LLM çağrısıyla, production kodundan) çalıştırıp dönen `businessNavigation` alanını doğrudan gözle — canlı production trafiğinden bağımsız, deterministik bir kanıt.
2. Eğer `businessNavigation` doğru geliyorsa, `route.ts`'e SADECE bu diagnostic için geçici bir `console.info` ekleyip (`businessNavigationResolution.status`, `descriptorKind`, `businessNavigationOperationEvidence?.operation`) gerçek bir production isteğinde Vercel function log'larından oku, sonra kaldır — token ekonomisi için körü körüne kod değiştirmek yerine tek bir gerçek isteğin tam zincirini gözlemle.
3. `LivingWorkspaceHost.tsx` / workspace panel state yönetimini oku: panel, o turda gerçek bir navigasyon event'i gelmezse önceki state'i koruyor mu, yoksa temizleniyor mu? Bu, "panel açık = bu turda navigasyon oldu" varsayımını kanıtlar ya da çürütür.
4. Kök neden zincir içinde nerede kırılıyorsa (classifier, resolver, evidence projection, prompt render, ya da model'in kendisi) yalnızca oradaki en küçük düzeltmeyi yap — bu operasyonun 5 turluk deneyiminden ders: aynı katmanı (prompt wording) tekrar tekrar cilalamak yerine önce zincirin neresinde koptuğunu KANITLA.

## 14. Sekizinci operasyon (yeni oturum) — §13.2'nin gerçek kök nedeni: canonical prompt yolu bu turun kanıtını sessizce düşürüyordu (ACCEPTED, çapraz-domain production-doğrulandı)

§12/§13.2'de planlanan Executive Presence context-loss düzeltmesi bu oturumda tamamlandı — ama semptomun altında §13.1'in dört düzeltmesinden çok daha derin, tek bir yapısal kök neden bulundu.

### 14.1 Kök neden

`buildBaseMetrixPrompt` (`src/lib/ai/prompts/prompt-format.ts`), dört versiyonlu Executive artefact'ı (`executiveManagementPicture`, `executiveAssessment`, `executiveDirective`, `executiveBehaviorPlan`) mevcut olduğunda `serializeCanonicalExecutivePrompt`'a erken dönen bir dal içeriyordu. `route.ts` bu dördünü **her gerçek turda koşulsuz** inşa ediyor — yani bu dal, her contextProfile'da, her konuşmada her zaman tetikleniyordu. Bu kasıtlıydı: önceki bir "single Executive prompt authority" operasyonu, legacy `organizationSummary`/hafıza-bağlamı kanalını bilinçli olarak dışlamıştı (`executive-authority-consolidation.test.ts` ile korunuyor). Sorun: bu turun **gerçek** kanıtı (business-navigation lookup sonuçları — ör. `businessNavigationOperationEvidence`'daki gerçek müşteri isimleri — ve conversation-extension handoff'ları) tam olarak bu dışlanan `organizationSummary` string'ine kaçak yollanıyordu; dolayısıyla doğru şekilde dışlanan legacy metinle birlikte sessizce düşüyordu. §13.1'in dört düzeltmesi (conversation-history threading, capability-description, `organizationSummary`/`business_light` threading, `CUSTOMER_LIST` evidence) tek tek doğruydu ama hiçbiri modele ulaşmıyordu çünkü hepsi canonical yolun hiç okumadığı bir kanalı besliyordu. `buildBusinessNavigationMessage` adlı ayrı bir deterministik override, tekil müşteri lookup'larını (`CUSTOMER_LOOKUP`) kurtarıyordu — bu yüzden yalnızca liste durumu (`CUSTOMER_LIST`, böyle bir override'ı yok) görünür şekilde bozuktu.

### 14.2 Düzeltme

**Commit**: `dbc8871` — main'e push edildi. Bu turun gerçek Action/Evidence Runtime kanıtını (asla legacy heuristic özeti değil) taşıyan yeni bir `canonicalOperationEvidence` alanı; `route.ts` → `ai-gateway.ts` (üç `renderPromptTemplate` çağrı noktası + repair yolu) → `prompt-format.ts` boyunca bağımsız olarak thread edildi; `serializeCanonicalExecutivePrompt` artık bunun için kendi etiketli bölümüne sahip. Legacy-dışlama garantisi dokunulmadan korundu (aynı test hâlâ geçiyor + 2 yeni regresyon testi).

**Doğrulama**: `tsc --noEmit` temiz, `vitest run` 1926/1926 (2 yenisi dahil), `next build` başarılı.

### 14.3 Çapraz-domain production acceptance (gerçek hesap, `metrixgm.com`, 2026-08-02)

Kullanıcı talimatıyla bu operasyon yalnızca "müşteri isimleri görünüyor" ile kapatılmadı — 7 farklı zincir gerçek production'da test edildi:

**Doğrulanan (gerçek kanıt, generic/kendini-yalanlayan cevap yok, bağlam tüm turlarda korundu):**
- **Müşteri listesi**: "Hangi müşteriler var?" → 5 gerçek isim, panelle birebir eşleşiyor.
- **Tahsilat durumu**: "Atlas Insaat icin tahsilat durumu nedir?" → gerçek Payment kayıtları (₺2200 gecikmiş, ₺700 kısmi, ₺1200 bekleyen) — §11'in kendi kanıtıyla eşleşiyor.
- **Görev sorgusu**: "Acik gorevlerim neler?" → gerçek Task (§2.2'deki `cmsbpn0cq...`, HIGH, vade 2026-08-03).
- **Uzun konuşma**: 5 ardışık tur, bağlam kaybı yok, tekrar soru yok, Executive karakter tüm turlarda korundu.

**Kısmen doğrulanan, yeni bir boşluk bulundu (bu düzeltmenin sebep olmadığı, ayrı bir operasyona loglandı):**
- **Teklif geçmişi**: Sohbet doğru cevap verdi (taslak teklif + 4500 TRY gönderilmiş teklif — gerçek veri), ama aynı anda açılan `Teklifler` Living Workspace paneli "Kayıt bulunamadı" gösterdi — anlatım ve panel çelişiyor. Bu operasyonda kök nedeni araştırılmadı (offers.list navigasyon projeksiyonu ile Executive Management Picture'ın satış-sinyali kanıtı iki ayrı kaynak, hiç çapraz kontrol edilmemiş).

**Başarısız — önceden var olan, bu düzeltmeden bağımsız bir boşluk:**
- **Mutation akışı**: "Yeni müşteri oluştur: Production Acceptance Test XYZ, telefon 5551234567" → Customer Create Surface açıldı (Living Workspace yönlendirmesi çalışıyor) ama tüm alanlar boş kaldı ve sohbet "...bu turda kayıt mutasyonu yetkim veya işlem başlatma yetkim doğrulanmadı..." dedi — tam olarak `d25fa0c`'nin önlemeye çalıştığı kendini-yalanlayan kapasite-reddi kalıbı. **Local dev'de aynı düzeltmeyle birebir aynı şekilde tekrarlandı** — bu, `canonicalOperationEvidence`'dan veya deploy gecikmesinden kaynaklanmadığını kanıtlıyor; müşteri-oluşturma conversation-extension coordinator'ında önceden var olan bir regresyon (§4'teki orijinal kabulden beri yeniden doğrulanmamış, "dondurulmuş" bir capability). Hiçbir ortamda gerçek kayıt oluşmadı (mutation hiç çalışmadı, temizlenecek bir şey yok). **Bu operasyonda kök nedeni teşhis edilmedi** — kapsam dışı (Action/Mutation Runtime, bu operasyonun düzelttiği Evidence Runtime kanalı değil). Ayrı bir operasyon gerekiyor: müşteri-oluşturma client-side conversation extension'ı bu ifade kalıbı için hiç tetikleniyor mu, tetikleniyorsa ortaya çıkan `conversationExtensionHandoff` (veya yokluğu) neden gerçek bir netleştirme sorusu yerine yetki-reddi üretiyor?

### 14.4 Self Review

Kurucu anayasa korundu (PASS). Living Workspace korundu (okuma/navigasyon akışları için PASS; müşteri-oluşturma mutation'ı için FAIL, §14.3'te loglandı). Single Authority korundu (PASS — ikinci bir evidence-delivery yolu oluşmadı, legacy dışlama dokunulmadan kaldı). Kullanıcı gerçekten yeni bir yaşayan davranış kazandı mı? Okuma-yolu kanıt teslimi (müşteri listesi, tahsilat, görev, kısmen teklif) için PASS — Foundation'ın tam Living Workspace mutation kontratı için uçtan uca **ACCEPTED değil**, §14.3'teki iki yeni boşluk hâlâ açık.

**Verdict**: `canonicalOperationEvidence` kanalının kendisi — **ACCEPTED**, çapraz-domain production-doğrulandı. §12'nin geniş Executive Presence context-loss endişesi — **KISMEN ACCEPTED**: sebep olan kök neden (kanıtın canonical yolda düşmesi) düzeltildi ve 4 bağımsız domainde kanıtlandı; aynı test turunda bulunan iki yeni, ayrı, gerçek boşluk bu operasyonla düzeltilmedi (§14.3 madde 5 ve 6).

### 14.5 Sıradaki oturum için öncelik sırası (kapandı — bkz. §15)

1. ~~Mutation akışı boşluğu (§14.3 madde 6)~~ — §15'te kapatıldı.
2. ~~Teklif geçmişi panel/anlatım çelişkisi (§14.3 madde 5)~~ — §15'te kapatıldı.
3. Bunlardan sonra §4/§ARCHITECTURE_MATRIX §4'teki sıralı yeni-domain önerilerine dönülebilir.

## 15. METRIX Living Runtime Consistency Operation (aynı oturum) — §14 madde 5 ve 6, tek mimari sınıf kanıtıyla kapatıldı: ACCEPTED

Kullanıcı bu iki bulguyu **ayrı bug olarak kabul etmeden önce** kanıt istedi: "Bu iki davranış gerçekten iki ayrı bug mı, yoksa tek bir mimari kopuştan mı kaynaklanıyor? Bunu kod üzerinden kanıtla, varsayım üretme." Hiçbir kod yazılmadan önce her iki bulgu da uçtan uca izlendi.

### 15.1 Cevap: aynı mimari sınıf, aynı kod hatası değil

İki bulgu tek satır kod paylaşmıyor — madde 6'nın kök nedeni `customer-create-semantic-intent.ts`'de (Türkçe niyet ayrıştırıcı), madde 5'inki `LivingWorkspaceHost.tsx`/`domain-adapters.ts`'de (jenerik liste okuyucu). Ama ikisi de **birebir aynı hata şekli**: elle bakımlı, eksik bir numaralandırmanın yüksek sesle başarısız olmak yerine sessizce, makul görünen ama yanlış bir sonuca düşmesi — ve bunu çapraz kontrol eden tek bir canonical kaynak yok. Bu, kullanıcının "Entity Consistency Runtime" tanımına birebir uyan, kanıtlanmış gerçek mimari boşluk — iki bağımsız rastlantısal yazım hatası değil.

### 15.2 Madde 6 (boş müşteri-oluşturma alanları) — kanıtlandı, düzeltildi

Konsol telemetrisi → `customerCreateConversationCoordinator` hiç çalışmıyor (`NOT_HANDLED`) → senkron, LLM'siz kapı fonksiyonu `extractObviousCustomerCreatePlan`'a kadar izlendi → izole vitest scratch testiyle **kanıtlandı**: "Yeni müşteri oluştur: İsim, telefon ..." (doğal bir Türkçe ifade) `NOT_CUSTOMER_CREATE` döndürüyor → kök neden: `resolveCustomerCreateSemanticIntent`'in create-fiil regex'lerinin sondaki sınırı hem `[.,!?]` sınıfını (iki nokta üst üste hariç) hem de (düzeltme denemesi sırasında) `\b`'yi (JS'in ASCII-only `\w`'si Türkçe harflerden — ç/ş/ğ/ı/ö/ü — sonra hiç eşleşmiyor, 32 testlik regresyon takımıyla kanıtlandı) yanlış kullanıyordu. Düzeltme: Unicode-uyumlu `(?!\p{L})` negatif lookahead.

**Commit**: `cf907a5`, main'e push edildi, deploy edildi (deploy canlılığı bundle fetch+grep ile doğrulandı — yeni `RegExp(...,"iu")` deploy edilen chunk'ta bulundu).

**Production kanıtı** (gerçek hesap, `metrixgm.com/metrix`): "Yeni musteri olustur: Runtime Consistency Kabul Testi, telefon 5557778899" → Customer Create Surface açıldı, **Firma adı ve Telefon alanları konuşmadan canlı doldu** → "Kaydet" → "Müşteri kaydını oluşturdum." → `GET /api/customers` bağımsız doğrulama: 6 gerçek müşteri, aralarında "Runtime Consistency Kabul Testi" — gerçek sunucu kalıcılığı. Foundation'ın tam mutation kontratı (konuşma → Surface açılır → alanlar canlı dolar → kullanıcı izler → onaylar → mutation çalışır → persisted kayıt görünür) artık uçtan uca çalışıyor.

**Not**: local dev'de ayrıca `TARGET_NOT_READY`/`hostAvailable:false` görünen ikinci bir görünür hata, uzun bir araştırmadan sonra **gerçek olmadığı** kanıtlandı — dev'in kök `/` rotası, `/metrix`'in kullandığı `ExecutiveNavigationCommandHost`'u hiç mount etmeyen ayrı bir `MetrixOnboardingApp` kabuğu render ediyor. Production'da (aynı kod, doğru rota) `hostAvailable:true`/`COMPLETED` doğrudan doğrulandı. Bu bir local-dev test ortamı artefaktıydı, düzeltilmedi (düzeltilmesine gerek yok).

### 15.3 Madde 5 (Teklif paneli/anlatım çelişkisi) — kanıtlandı, düzeltildi

`LivingWorkspaceHost.tsx`'in jenerik liste okuyucusu `record.customers ?? record.products ?? record.tasks ?? record.payments ?? record.invoices ?? []` — elle yazılmış, yalnızca hatırlanan domain'leri kapsayan bir zincirdi. `/api/quotes` (offer domain'inin endpoint'i) `{ quotes: [...] }` döndürüyor (Prisma modeli `Quote` olduğu için) — `quotes` hiç zincirde yoktu, bu yüzden Teklifler paneli gerçek veri olsa bile **koşulsuz** "Kayıt bulunamadı" gösteriyordu; sohbetin cevabıysa tamamen ayrı, doğru-kapsamlı bir kanıt kaynağından (Executive Management Picture) geliyordu — §9'da zaten bir kez düzeltilmiş "payments" emsaliyle birebir aynı hata şekli, bu kez "offer" için hiç eklenmemiş.

**Düzeltme**: `DOMAIN_SURFACE_ADAPTERS`'a (var olan tek per-domain registry) her domain için canonical bir `responseKey` eklendi; `LivingWorkspaceHost.tsx` artık elle yazılmış zincir yerine bunu okuyor — gelecekte bir domain unutulamaz. `living-workspace.test.ts`'e regresyon testleri eklendi.

**Production kanıtı**: "Atlas Insaat icin teklif gecmisini goster" → Teklifler paneli artık **2 gerçek Quote kaydı** gösteriyor (DRAFT; SENT/4500 TRY) → sohbet: "...4.500 TRY tutarında, gönderilmiş ancak henüz görüntülenmemiş ve kazanılmamış durumda." — anlatım ve panel artık birebir aynı gerçek kayda dayanıyor, çelişki yok.

### 15.4 Self Review

Kurucu anayasa korundu (PASS). Living Workspace korundu (PASS — okuma VE mutation akışları artık Foundation'ın canlı-doldurma kontratıyla eşleşiyor). Single Authority korundu (PASS — yeni authority yok, mevcut tek authority artık canonical bir registry üzerinden okuyor). Yeni mimari/paralel sistem/workaround yok (PASS — ikisi de minimal, kök-neden seviyesinde, yeniden kullanılabilir düzeltmeler; capability'ye özel yama değil). **FAIL yok → ACCEPTED.**

**Verdict**: §14'ün iki açık maddesi de kapandı. Kullanıcının sorduğu asıl soru cevaplandı ve kanıtlandı: tek mimari sınıf (elle bakımlı, eksik numaralandırmalar + yüksek sesle başarısızlık yerine sessiz, makul-görünen düşüş), iki bağımsız örnek, ikisi de capability yaması değil canonical, tekrar-kullanılabilir düzeltmeyle kapatıldı.

## Dosyalar

- `METRIX_OPERATION_HANDOFF.md` — bu dosya (repo kökü, commit edilmedi — el kitabı/handoff materyali, ürünün parçası değil).
- `METRIX_ARCHITECTURE_MATRIX.md` — güncel Living Constitution Audit (bu oturumda üç kez güncellendi, commit edilmedi — bkz. not aşağıda).
- `CLAUDE.md`, `AGENTS.md` — repo kökü, değişmedi.
- `src/components/living-workspace/TaskCreateScreen.tsx`, `src/lib/tasks/task-create-conversation-planner.ts` — Task operasyonunun düzelttiği dosyalar.
- `src/lib/conversation-extensions/payment-management-conversation-extension.ts`, `src/components/living-workspace/LivingWorkspaceHost.tsx` — Tahsilat operasyonunun referans dosyaları.
- `src/lib/action-runtime/domains/invoices/`, `src/lib/core/invoices/`, `src/lib/conversation-extensions/invoice-management-conversation-extension.ts` — Fatura operasyonunun tam referans zinciri; **bir sonraki sıfırdan-domain (Muhasebe, Sipariş, vb.) için en güncel ve en eksiksiz kopyalanacak desen budur**, Tahsilat'tan bile daha iyi (tam modern Action Runtime deseni kullanıyor).
- `src/lib/action-runtime/gateway/execution-context.ts` — yeni bir `X.write` izni her eklendiğinde burada da role haritasına eklenmesi gerektiğini unutma (Fatura'da unutulup 403'e sebep oldu).
- `src/lib/action-runtime/domains/payments/`, `src/lib/action-runtime/gateway/payment-apply-gateway.ts`, `src/app/api/payments/[paymentId]/actions/apply/route.ts`, `src/lib/payments/payments-client.ts`, `src/components/living-workspace/LivingWorkspaceHost.tsx` (`PaymentListSurface`/`PaymentRow`) — payment.apply (mark-as-paid) operasyonunun tam referans zinciri; **bir sonraki HIGH-risk/CONDITIONAL onay gerektiren capability (örn. Fatura CANCELLED, Sipariş iptali) için kopyalanacak desen budur** — `customer-archive-gateway.ts`/`quote-dispatch-gateway.ts` ile birebir aynı request→confirm→execute approval deseni.
- `src/app/api/collection-actions/route.ts`, `src/app/api/collection-actions/[collectionActionId]/actions/set-lifecycle/route.ts`, `src/lib/action-runtime/gateway/collection-lifecycle-gateway.ts`, `src/lib/collection-actions/collection-actions-client.ts`, `src/components/living-workspace/CollectionActionsPanel.tsx` — CollectionAction AI dunning/follow-up review operasyonunun tam referans zinciri (§10).

**Not**: `METRIX_ARCHITECTURE_MATRIX.md` repoda daha önce commit edilmiş (izlenen) bir dosyaydı; bu oturumda içeriği yeniden yazıldı ama CLAUDE.md'nin "yalnızca açıkça istendiğinde commit et" kuralı gereği bu değişiklik commit edilmedi — working tree'de `M` olarak duruyor. Yeni oturum bunu ya commit etmeli ya da kullanıcıya sormalı.

## 16. METRIX Living Runtime Consistency Operation (aynı oturum, devam) — Planner failure → silent fallback → false success sınıfı: ACCEPTED, 4/4 kabul kriteri production'da kanıtlandı

Kullanıcı §15'in "mutation çalıştı" kanıtını yetersiz buldu: gerçek kabul kriteri yalnızca mutation değil, (1) Workspace doğru anda açılıp kullanıcı işi canlı izlemesi, (2) ilk cevabın 1sn altında başlaması, (3) sohbette yalnızca METRIX'in konuşması, (4) sohbet anlatımı ile Workspace'in hiçbir zaman çelişmemesiydi.

### 16.1 Hedeflenen mimari sınıf (kör tarama değil)

Yalnızca Conversation → Plan → Workspace zincirindeki coordinator'lar incelendi (`src/lib/conversation-extensions/*.ts` + domain coordinator'ları). Aynı çıplak `try { await planner() } catch { plan = fallback() }` deseni yalnızca iki yerde bulundu: `customer-create-conversation-coordinator.ts`, `task-create-conversation-coordinator.ts`. Offer/payment/invoice/customer-edit/offer-edit extension'ları bu deseni hiç kullanmıyor (grep ile doğrulandı) — mimari olarak bu hataya açık değiller.

### 16.2 Bu testteki planner başarısızlığının gerçek nedeni — varsayım değil, kanıt

Kullanıcı 401 ihtimalinin varsayım olarak kalmamasını istedi. Gerçek Vercel fonksiyon logları (`vercel logs`) çekildi: `POST /api/customers/actions/create-command → 401` (iki başarısız test zaman damgasında birebir eşleşti), ayrıca `GET /api/auth/session` bağımsız olarak `"Session is invalid or expired."` döndürdü. Bu oturumun test tarayıcı oturumu, uzun süren araştırma sırasında gerçekten sona ermişti — kanıtlanmış, varsayılmamış gerçek neden.

### 16.3 Ortak sözleşme (commit `66a682f`)

`src/lib/conversation-extensions/create-plan-resolution.ts` — her iki coordinator'ın da kullandığı tek, paylaşılan `resolveCreatePlan()` fonksiyonu. Planner başarısız olup deterministic fallback **sıfır** güvenilir alan üretirse (`FALLBACK_EMPTY`): asla EXECUTED/COMPLETED üretilmez, navigasyon hiç tetiklenmez (surface boş-başarı görünümüyle açılmaz), telemetride `source`/`plannerFailureReason` açıkça ayrı loglanır, ve mevcut `buildUniversalHandoffMessage`'ın CLARIFICATION_REQUIRED dalı üzerinden doğal, dürüst bir devam mesajı üretilir — yeni authority, yeni planner, yeni mesaj-üretim kodu, ek gecikme yok. Fallback güvenilir alan bulduysa (`FALLBACK_USABLE`) akış öncekiyle aynı şekilde devam eder, yalnızca ayrıca loglanır.

### 16.4 Kabul testleri sırasında bulunan ve düzeltilen İKİNCİ, ayrı bir gerçek hata (commit `7280477`)

Chain 2 (görev oluşturma) testinde: Task Create Surface başlık/vade/öncelik ile tam doğru doldu, ama sohbet "Devam edebilmem için biraz daha bilgi verir misiniz?" dedi — **gerçek bir çelişki**, kullanıcının 4. kriterini doğrudan ihlal ediyordu. Kök neden Customer'ın doğru yazılmış eşdeğer koduyla karşılaştırılarak kanıtlandı: `task-create-conversation-coordinator.ts`, alanlardan doğru hesaplanan `lifecycle: "READY"` durumunu, bu tur yeni bir navigasyon gerektirdiğinde (yani bir konuşmadaki İLK görev-oluşturma mesajında, en yaygın durum) koşulsuz olarak `"OPENING"`'e geri yazıyordu ve navigasyon tamamlandıktan sonra asla düzeltmiyordu — final EXECUTED/CLARIFICATION kontrolü bu bayat değeri okuyordu. Düzeltme: Customer'ın yaptığı gibi, kontrolden hemen önce lifecycle'ı gerçek alan durumundan yeniden hesapla. Regresyon testi: eski kodda başarısız, düzeltmede geçti (elle doğrulandı).

### 16.5 Production acceptance — 4/4 kriter, gerçek hesap

1. **Workspace doğru anda açılır, kullanıcı canlı izler**: Chain 1 ve 2'de doğrulandı — "Yeni musteri olustur: Kabul Testi Firmasi, telefon 5556667788, eposta info@kabultesti.com" → Firma adı/Telefon/E-posta üçü de canlı doldu; "Yeni gorev olustur: Ucuncu kabul testi gorevi, ..." → Başlık/Vade/Öncelik üçü de canlı doldu.
2. **İlk görünür cevap 1sn altında, doğal ara cümle**: Precise `MutationObserver` ölçümü (mesaj listesi container'ına scoped, gönderilen metnin kendi echo'sunu hariç tutacak şekilde) — **6.8ms**, içerik: *"İlgili müşteri ve işlem bağlamını kontrol ediyorum."* — statik "Değerlendiriyor..." değil, `resolveTextResponseReadiness`'in bağlama duyarlı, METRIX-sesli metni.
3. **Sohbette yalnızca METRIX konuşur, generic davranış yok**: Tüm turlarda Türkçe, karakter-tutarlı, teknik terim sızıntısı yok.
4. **Sohbet ile Workspace hiç çelişmez**: Chain 1/2 sonrası bağımsız `GET /api/customers` (7 kayıt, Kabul Testi Firmasi telefon+eposta doğru) ve `GET /api/tasks` (2 kayıt, Ucuncu kabul testi gorevi dueDate+priority doğru) ile kalıcılık doğrulandı — sohbetin iddia ettiği her şey gerçek kayıtla eşleşiyor.

**Kontrollü planner-failure simülasyonu**: gerçek `fetch`'i tarayıcıda `/api/customers/actions/create-command` isteklerini reddedecek şekilde patch'leyip (gerçek production kodu üzerinde, mock değil) "Yeni musteri olustur: Simule Hata Testi, telefon 5551110022" gönderildi → METRIX: *"Devam edebilmem için biraz daha bilgi verir misiniz?"* — sahte "oluşturuyorum/tamamlandı" yok, boş taslak başarı gibi gösterilmedi (yeni navigasyon hiç tetiklenmedi), dürüst ve doğal devam yolu sunuldu. Bağımsız `GET /api/customers` ile "Simule Hata Testi" kaydının HİÇ oluşmadığı doğrulandı.

**Self Review**: Tüm 4 kriter PASS. Yeni authority/planner/paralel runtime yok. Customer ve Task için ayrı çözüm yazılmadı — ortak `create-plan-resolution.ts` sözleşmesi düzeltildi (madde 9/10 karşılandı). **FAIL yok → ACCEPTED.**

### 16.6 Bilinçli olarak dokunulmadı, açık bırakıldı (yeni, ayrı bulgu)

Kabul testleri sırasında fark edildi, bu operasyonun kapsamı dışı: "Atlas Insaat musterisi hakkinda kisa bilgi ver" → METRIX *"Atlas Insaat müşterisi hakkında elimde doğrudan bilgi bulunmamaktadır"* dedi — ama Atlas Insaat bu organizasyonun en çok kullanılan, en çok gerçek kaydı (Payment/Quote/Task) olan test müşterisi. Bu, serbest-metin "müşteri hakkında bilgi ver" tarzı sorguların customer-detail evidence'a (Executive Management Picture'ın customerSignals'ı mı, yoksa business-navigation CUSTOMER_LOOKUP mı) güvenilir şekilde bağlanmadığını gösteriyor — kök nedeni bu operasyonda araştırılmadı, sonraki oturum için loglandı.

## 17. Tracking sync + Invoice SENT/Quote linkage — ACCEPTED (2026-08-05)

### Parça A

- `cf907a5..0c986bf` arasındaki 15 commit'in tamamı `git show` diff'iyle doğrulandı ve Matrix §17'ye işlendi: `c35962c`, `81d51c9`, `831063d`, `1d3f7c1`, `12537bc`, `63d95e9`, `042fd08`, `8bb3fae`, `058a19f`, `8c92ba0`, `1a47c13`, `5fc4489`, `e4a225f`, `33b51bf`, `0c986bf`.
- §16.6 exact-query authenticated production re-test: METRIX gerçek `Atlas Insaat` kaydını buldu, Customer Detail Surface'i açtı ve kayıtta bulunmayan alanları dürüstçe boş bildirdi. Eski flat denial yok. **ACCEPTED.**

### Parça B

- **Commit/deploy:** `6635fb5`, pushed to `main`; Vercel production `dpl_8NYmvw52HDnE6ktgFs6QriQK1ydD`, `metrixgm.com` alias Ready.
- **Change:** Existing `Invoice.quoteId` relation reused. Quote-origin conversation carries the single eligible Quote to existing `invoice.create`; ambiguity is clarification, never guessing. New `invoice.send` uses the existing Action Runtime chain; Living Workspace exposes the same canonical action.
- **Risk:** `MEDIUM / NONE`, matching internal-only `quote.send`. No external e-Fatura/e-mail and no money movement; therefore not `payment.apply` (`HIGH/CONDITIONAL`) or `quote.set_lifecycle` (`HIGH/EXPLICIT`).
- **Production proof:** Quote `66526792-d3e2-4d1c-a542-5b710a0020a0` → Invoice `cmsggt3sn000g04l7qdk7i8bx`, `FTR-2026-0004`, 4500 + tax = 5400, correct `quoteId`, initially DRAFT; UI action then independent API read = SENT.
- **Verification:** `tsc --noEmit` clean; `npm test` 2034/2034 passing (1 skipped); `npm run build` successful. Only pre-existing lint warnings were reported.

### Bilinçli olarak yapılmadı

- Real e-Fatura/e-mail dispatch, Invoice PAID/CANCELLED, multi-line items, and a chooser UI for multiple eligible Quotes.
- No new Prisma model/migration, authority, runtime or planner.
- Unowned `design-system/`, `public/design/executive-dock.svg`, `globals.css`, `ExecutiveAppShell.tsx`, `MetrixChatTab.tsx` changes were not touched or staged.

### Self Review

Kurucu anayasa korundu (PASS). Living Workspace korundu (PASS). Single Authority korundu (PASS). Kullanıcı gerçekten yeni yaşayan davranış kazandı mı? PASS. **FAIL yok → ACCEPTED.**
