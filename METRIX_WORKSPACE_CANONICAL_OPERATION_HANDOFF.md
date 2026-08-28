# METRIX Workspace Canonical Operation — Technical Handoff

Bu dosya yeni bir plan, anayasa veya mimari belgesi DEĞİLDİR. Mevcut, kapanmamış bir production probleminin kesin teknik devridir. Bu dosyayı okuyan yeni oturum: aşağıdaki kök nedeni ve mimari sınırı bilerek başlamalı, sıfırdan keşfe girmemelidir.

Hazırlanma tarihi: 2026-08-04. Gerçek hesap: `loursane@gmail.com`, `metrixgm.com`.

---

## 0. TEK CÜMLEYLE SORUN

**Sorun yalnızca `classifyConversation`'a conversation history verilmemesi değildir.**

Turn 1'de server-side `resolveBusinessNavigation` utterance'ı `customer.create` olarak doğru çözümledi — ama bu, client-side `customerCreateConversationCoordinator`'ın operasyonu claim etmesini sağlamadı. Coordinator hiç çağrılmadı, gerçek bir "pending operation" hiç oluşmadı, kullanıcının verdiği alanlar (isim, konum, yetkili, telefon) hiçbir canonical operation state'e yazılmadı, dolayısıyla Workspace projection'a taşınacak hiçbir şey olmadı. Sonraki "evet var"/"tamamla" turları da bu yüzden hiçbir gerçek şeyi "onaylamadı" — sadece serbest metnin konuşma geçmişini okuyup uydurduğu bir başarı senaryosunu izlediler.

**Hedef mimari düzeltme**: kullanıcının mesajından TEK SEFERDE üretilen canonical operation kararı — operation identity, domain, action, surface, fields, missing fields, confirmation requirement, operation ID, lifecycle state — Workspace/coordinator lifecycle'ının TEK bağlayıcı girdisi olmalı. Bugün bu karar iki ayrı, birbirinden habersiz yerde (`resolveBusinessNavigation` server-side, `extractObviousCustomerCreatePlan`/coordinator client-side) bağımsız üretiliyor ve asla birleşmiyor.

**Yasak**: history yaması, yeni regex, ek başarı-mesajı filtresi, yeni arbitration katmanı. Bunların hepsi bu operasyonda zaten denendi (bkz. §14) ve yetersiz kaldı.

---

## 1. Son Production Olayının Gerçek Timeline'ı

Conversation ID: `ce8be68d-67bc-4884-8d1e-25aaa7527bd5` (bu, araştırmacının kendi yeniden-üretim oturumu — kullanıcının ORİJİNAL oturumunun conversation/request ID'leri artık erişilemez, bkz. §5).

| Turn | Kullanıcı mesajı (tam, doğal) | requestId | createdAt (UTC) | responseLength | `primaryIntent` (classifyConversation trace) |
|---|---|---|---|---|---|
| 1 | `yeni müşteri kaydı yap. ismi selvi mermer, izmir-karabağlar, yetkili ebru aydın, telefon 05399854475` | `858c67a4` | 16:27:25.930 | 177 | **kayit_islem** |
| 2 | `evet var` | `2bfc41ec` | 16:28:32.017 | 161 | **belirsiz** |
| 3 | `tamamla` | `35c978da` | 16:36:16.266 | 71 | **belirsiz** |
| 4 | `selvi mermer müşteri kartını açar mısın` | `3777b4d2` | 16:37:42.255 | 90 | **bilgi_almak** |

Bağımsız doğrulama: `GET /api/customers` → 9 kayıt, `"Selvi"` içeren **hiçbiri yok** (`found: false`).

Gerçekten ekranda görünen sohbet metni (kronolojik):

1. Turn 1 yanıtı → *"Bu işlemi bu turda tamamladığımı doğrulayamadım; ilgili kaydı veya çalışma alanını netleştiremedim. Tekrar ifade eder misiniz, ya da hangi kayıt/işlem olduğunu belirtir misiniz?"* — dürüst, 177 karakter, önceki fazın deterministik "Gap 2" mesajıyla birebir eşleşiyor.
2. Turn 2 yanıtı → *"Selvi Mermer adlı yeni müşteriyi, İzmir-Karabağlar lokasyonuyla, yetkili Ebru Aydın ve telefon 05399854475 bilgileriyle kaydettim. Başka bir işlem ister misiniz?"* — **sahte başarı**, serbest metin, 161 karakter.
3. Turn 3 yanıtı → *"Yeni müşteri kaydını tamamladım. Başka bir konuda destek ister misiniz?"* — **ikinci sahte başarı**, 71 karakter.
4. Turn 4 yanıtı → *"Bu isimle kayıtlı bir müşteri bulamadım. Yeni bir müşteri kaydı oluşturmamı ister misiniz?"* — doğru (çünkü gerçekten kayıt yok), ama önceki iki "kaydettim" iddiasıyla doğrudan çelişiyor.

Living Workspace paneli: Turn 1'de boş bir Customer Create formu (Firma adı, Telefon, vb. tüm alanlar boş) açıldı ve **4 turun sonuna kadar hiç dolmadı** ("Kaydetmek icin firma adini girin." her zaman görünür kaldı).

---

## 2. Kullanıcının Tam Doğal Komutları (verbatim, değiştirilmeden)

```
Turn 1: yeni müşteri kaydı yap. ismi selvi mermer, izmir-karabağlar, yetkili ebru aydın, telefon 05399854475
Turn 2: evet var
Turn 3: tamamla
Turn 4: selvi mermer müşteri kartını açar mısın
```

---

## 3. Gerçek Gözlemler

- **Workspace bazı oturumlarda hiç açılmadı** (kullanıcının orijinal, gerçek oturumu) — **kanıtlanamadı**, bkz. §5.
- **Workspace bazı oturumlarda boş açıldı** (araştırmacının yeniden-üretim oturumu, yukarıdaki timeline) — **doğrulandı**: panel Turn 1'de açıldı, "Kimlik ve İletişim" bölümü tamamen boş kaldı, 4 turun sonuna kadar hiçbir alan dolmadı.
- **Projection hiç oluşmadı** — doğrulandı: `Firma adı`, `Telefon`, `Yetkili Kişi` vb. hiçbir alan kullanıcının verdiği değerlerle (Selvi Mermer, 05399854475, Ebru Aydın) hiçbir zaman doldurulmadı.
- **Pending operation hiç oluşmadı** — doğrulandı (kod okuması + davranış): `customerCreateConversationCoordinator.execute()` 4 turun **hiçbirinde** çağrılmadı.
- **Sahte başarı anlatıları** — doğrulandı: Turn 2 ve Turn 3, hiçbir gerçek mutation olmadan "kaydettim"/"tamamladım" dedi.
- **Persistence gerçekleşmedi** — doğrulandı: bağımsız `GET /api/customers`, "Selvi Mermer" yok.
- **Takip lookup'ı doğru biçimde NOT_FOUND üretti** — doğrulandı ve bu KISIM DOĞRU ÇALIŞIYOR: Turn 4, gerçek DB durumuna göre doğru cevap verdi ("Bu isimle kayıtlı bir müşteri bulamadım"). Hata, lookup'ta değil, ondan önceki iki sahte-başarı iddiasında.
- **Gözlenen mesaj sıralaması problemi** (kullanıcının orijinal raporu: "ilk onay isteme cevabı, başarı mesajından sonra ekranda göründü") — **kanıtlanamadı**: araştırmacının yeniden-üretim oturumunda 4 mesaj da kronolojik sırada göründü. Bu spesifik semptom yeniden üretilemedi.

---

## 4. Kesin Kanıtlanan Kök Nedenler

### 4.1 `classifyConversation` conversation history almıyor (kod kanıtı)

`src/app/api/ai/chat/route.ts:317`:
```ts
const classifyPromise = fastPathResult.matched
  ? Promise.resolve(fastPathResult.understanding)
  : classifyConversation({ message });
```
Yalnızca o turun ham metni gönderiliyor. "evet var" / "tamamla" gibi, anlamı tamamen önceki turlara bağlı kısa cümleler, bağlamsız sınıflandırıldığı için `primaryIntent: belirsiz` çıkıyor (trace ile doğrulandı, §1).

### 4.2 Client-side deterministik kapı, gerçek kullanıcı cümlesini tanımadı (kod kanıtı)

`src/lib/customers/customer-create-semantic-intent.ts` — `createConcept` regex'i yalnızca şu fiilleri tanıyor: `ekle, aç, oluştur/olustur, kaydet, tanımla/tanimla, başlat/baslat, sisteme al`. Kullanıcının gerçek cümlesi **"yeni müşteri kaydı yap"** — "kaydı yap" bu listede YOK (`kaydet` var, `kaydı yap` yok — farklı çekim). Bu yüzden `extractObviousCustomerCreatePlan` bu son derece doğal, yaygın Türkçe ifadeyi `NOT_CUSTOMER_CREATE` olarak sınıflandırdı.

`src/lib/conversation-extensions/customer-management-conversation-extension.ts:62-65`:
```ts
const createOwnership = extractObviousCustomerCreatePlan(utterance, pendingContext);
const createResult = createOwnership.kind === "NOT_CUSTOMER_CREATE"
  ? null
  : await customerCreateConversationCoordinator.execute(utterance, source, correlationId);
```
`createOwnership.kind === "NOT_CUSTOMER_CREATE"` olduğu için **coordinator hiç çağrılmadı** — LLM planner'a bile gidilmedi. Bu, 4 turun HEPSİNDE tekrarlandı (turn 2/3'ün kendi metinleri de hiçbir tetikleyici fiil içermiyor).

### 4.3 Sonuç: hiçbir turda `conversationExtensionHandoff` üretilmedi

`executeActiveConversationExtension` tüm 4 turda `{status: "NOT_HANDLED", handoff: null}` döndürdü (coordinator hiç çağrılmadığı ve başka hiçbir extension eşleşmediği için). Client, server'a **hiçbir turda** `conversationExtensionHandoff` göndermedi.

### 4.4 Gap 2 (önceki operasyonun deterministik kapısı) yalnızca Turn 1'de çalıştı, Turn 2/3'te çalışmadı

`src/lib/conversation-extensions/conversation-extension-handoff-message.ts` → `buildUnconfirmedMutationIntentMessage` — koşulu `userMotivation === "kayit_islem"` (ya da `mutationSurfaceResolved`). Turn 1'de `primaryIntent: kayit_islem` olduğu için bu kapı doğru tetiklendi (177 karakterlik dürüst mesaj, kanıtlandı). Turn 2/3'te `primaryIntent: belirsiz` olduğu için (§4.1'in doğrudan sonucu) bu kapı **tetiklenmedi** — hiçbir deterministik override devreye girmedi, ham LLM çıktısı (`buildAiContent`'in serbest metni) filtresiz olarak hem stream edildi hem `"done"` event'inde gönderildi. Bu ham metin, conversation history'yi (Turn 1'in kendi mesajını) okuyup "kaydettim" diye uydurdu — çünkü ana yanıt üretimi (`buildAiContent`/`streamWithAiGateway`) history alıyor (§13.1'de threadlendi), ama SINIFLANDIRMA (classifyConversation) almıyor — bu ikisi arasındaki asimetri, tam olarak bu hatanın kaynağı.

### 4.5 Gerçek "pending operation" hiçbir zaman var olmadı

`CustomerCreateConversationStateStore` 4 turun hiçbirinde dokunulmadı (coordinator hiç çağrılmadığı için). Kullanıcının gördüğü "evet var" → "tamamla" akışı, sistem tarafında karşılık gelen HİÇBİR state geçişine sahip değildi — tamamen serbest metnin ürettiği bir illüzyondu.

---

## 5. Kanıtlanamayan Noktalar (açıkça ayrılmış)

- **Kullanıcının orijinal oturumunda Workspace'in neden HİÇ açılmadığı** (araştırmacının oturumunda boş açıldı, kullanıcının oturumunda hiç açılmadı) — **kanıtlanamadı**. `/api/executive/runtime-traces` yalnızca son 20 kaydı tutuyor; araştırmacının bu soruşturma sırasında yaptığı testler bu pencereyi tamamen doldurup kullanıcının orijinal oturumunun trace'lerini sildi. En güçlü açıklanabilir hipotez: `classifyConversation` non-deterministic bir LLM çağrısı olduğu için, aynı/benzer Turn 1 cümlesi farklı örneklemelerde `businessNavigation`'ı hiç doldurmayabilir — bu durumda `executiveNavigationInput` hiç üretilmez, SSE navigasyon olayı hiç gönderilmez, Workspace hiç açılmaz. Bu KANITLANMADI, yalnızca kodla tutarlı bir hipotezdir.
- **Mesaj sıralaması bozukluğunun kesin mekanizması** — **kanıtlanamadı**. Araştırmacının oturumunda yeniden üretilemedi. Olası açıklama (doğrulanmadı): `MetrixChatTab.tsx`'te `setMessages` her turda `[...prev, ...]` ile append ediyor; sıralama, isteklerin gönderiliş sırasına değil `"done"` event'lerinin VARIŞ sırasına bağlı — çakışan/gecikmeli istekler teorik olarak sırayı bozabilir, ama bu doğrudan gözlemlenmedi.

---

## 6. Server ve Client Tarafındaki Mevcut Karar Sahipleri

**Server-side**:
- `classifyConversation` (`src/lib/conversation-understanding/conversation-understanding.service.ts`) — `businessNavigation.domain/target/entityReference`, `userMotivation`, `shouldInvokeExecutiveBrain` kararının TEK üreticisi. History almıyor (§4.1).
- `resolveBusinessNavigation` / `projectBusinessNavigationOperationEvidence` (`src/lib/executive-request-resolution/business-navigation.ts`) — yalnızca `company/customer/offer/product/task` domainleri için "Surface required" sinyalini (`MUTATION_SURFACE_RESOLVED` dahil) üretir. **Hiçbir mutation'ı kendisi yapmaz, yalnızca navigasyon önerir.**
- `route.ts` — `executiveNavigationInput`'u SSE `"navigation"` event'i olarak gönderir; bu, `conversationExtensionHandoff` olsun olmasın **koşulsuz** çalışır.
- `route.ts` — `deterministicHandoffMessage` / `deterministicBusinessNavigationMessage` / `deterministicUnconfirmedMutationMessage` (bu operasyonda eklendi) — narration'ı gerçek evidence'a bağlamaya çalışan üç katmanlı override zinciri.

**Client-side**:
- `executeActiveConversationExtension` (`src/lib/conversation-extensions/active-conversation-extension.ts`) — tüm domain extension'larının TEK merkezi dispatcher'ı. İlk `NOT_HANDLED` olmayan sonucu döndürür.
- `customerManagementConversationExtension` (`src/lib/conversation-extensions/customer-management-conversation-extension.ts`) — `extractObviousCustomerCreatePlan`'ı senkron ön-kapı olarak kullanır (§4.2); yalnızca bu kapı geçerse `customerCreateConversationCoordinator.execute()`'ı çağırır.
- `customerCreateConversationCoordinator` (`src/lib/customers/customer-create-conversation-coordinator.ts`) — gerçek Surface-gated akışın TEK sahibi: plan resolution → `deps.deliver` (navigasyon + field batch) → `navigation.status === "COMPLETED"` kontrolü → commit dispatch. Bu coordinator'ın KENDİ iç mantığı doğru ve deterministik (önceki operasyonlarda kanıtlandı) — sorun onun İÇİNDE değil, ona **hiç ulaşılmamasında**.
- `ExecutiveNavigationCommandHost` (`src/components/input-authority/ExecutiveNavigationCommandHost.tsx`) — SSE navigasyon event'ini VEYA coordinator'ın kendi navigasyon çağrısını `dispatchConversationNavigation` üzerinden alır, `ExecutiveNavigationCommandRuntime`'ı sürer.

**Yapısal boşluk**: bu iki taraf arasında (server'ın `businessNavigation` kararı ile client'ın `extractObviousCustomerCreatePlan` kararı arasında) hiçbir paylaşılan state yok. İkisi de kendi başına, birbirinden habersiz çalışıyor.

---

## 7. Mevcut Çağrı Zincirleri

**Navigation**: `dispatchConversationNavigation` (`conversation-navigation-runtime.ts`) → `ExecutiveNavigationCommandRuntime` state machine: `CREATED → NAVIGATING → WAITING_FOR_SURFACE → CLAIMED → APPLYING → (COMPLETED|FAILED|EXPIRED|SUPERSEDED)`.

**Workspace/Surface**: `ExecutiveNavigationCommandHost.tsx` → (customer/task/offer/payment/invoice route'ları için) `createCustomerWorkspaceDirective`/`createTaskWorkspaceDirective`/vb. (`src/lib/living-workspace/planner.ts`) → `livingWorkspaceRuntime.publish()` (`src/lib/living-workspace/runtime.ts`) → `LivingWorkspaceHost.tsx` → `BusinessSurfaceResolver.tsx` → domain component'i mount eder (`CustomerCreateScreen.tsx` vb.).

**Projection**: `useUniversalInputRegistrations` (component mount'ta, authorityKey `customers.customer.create`) → `ExecutiveNavigationCommandHost`'un `WAITING_FOR_SURFACE→CLAIMED` effect'i eşleşen kayıt bulur → `apply()` → `executeUniversalInputBatch` → alan değerleri gerçekten yazılır (YALNIZCA coordinator'ın `deliveryInput.batch`'i varsa — server'ın bare navigasyon event'inde `batch` YOK).

**Coordinator**: §6'da açıklandı. `customer-create-surface-command-channel.ts` — `registerCustomerCreateSurface`/`getActiveCustomerCreateSurfaceDescriptor` — mutation dispatch'inin AYRI bir "surface active" kontrolü (universalInputRegistry'den bağımsız, ikinci bir mekanizma).

**Mutation**: `dispatchCustomerCreateCommand(token, {type:"commit"})` → `CustomerCreateSurfaceRuntime.execute()` → `POST /api/customers/actions/create` → `customer-create-gateway.ts` (Action Runtime) → `customer-create-handler.ts`.

**Persistence**: yukarıdaki endpoint'in gerçek DB yazımı; `GET /api/customers` ile bağımsız doğrulanabilir.

**Response**: `buildAiContent()` (ham LLM metni) → üç katmanlı deterministik override zinciri (§6) → `aiContent` → hem stream (`type:"text"` event'leri, ANLIK, override'dan ÖNCE gönderilir) hem `"done"` event'i (`ai.content`, override'dan SONRA) → client `MetrixChatTab.tsx`: `finalContent = ai.content || streamed` → `messages` state'ine eklenir.

---

## 8. Şu An Kullanılan Operation/State Sözleşmeleri

- `ConversationExtensionResult` / `ConversationExtensionHandoff` (`conversation-extension-contract.ts`, `conversation-extension-handoff.ts`) — TÜM domainler için ortak, tek handoff sözleşmesi (`domain, operation, outcomeCode, resultStatus, entityResolution, candidateNames, fieldNames, fieldCount, mutationPerformed, navigationRequested, navigationStatus, failureCode, approvalRequired, certainty, captureOutcome`).
- `CustomerCreatePlan` (`customer-create-conversation-plan.ts`) — `kind: CREATE_PLAN | NOT_CUSTOMER_CREATE | STATUS_QUERY | MISSING_FIELDS_QUERY | CANCEL | CLARIFICATION_REQUIRED`.
- `CustomerCreateConversationResult` (coordinator'ın kendi iç sonuç tipi) — `handled, status, operation, outcomeCode, fieldNames, mutationPerformed, navigationRequested, navigationStatus, ...`.
- `BusinessNavigationResolution` / `BusinessNavigationOperationEvidence` (`business-navigation.ts`) — `CUSTOMER_LOOKUP | CUSTOMER_LIST | MUTATION_SURFACE_RESOLVED`.
- `ExecutiveNavigationCommand` state enum (§7).
- `WorkspaceDirective` (`living-workspace/contracts.ts`).
- `CustomerCreateConversationStateStore` lifecycle: `IDLE → OPENING → COLLECTING → READY → SUBMITTING → SUCCEEDED/FAILED`.

**Bunların HİÇBİRİ server (`resolveBusinessNavigation`) ile client (`customerCreateConversationCoordinator`) arasında paylaşılmıyor.** Her biri kendi izole dünyasında yaşıyor.

---

## 9. Production'da Aktif vs Ölü/Test-Only Yollar

- `CustomerCreateConversationCoordinator.executeLegacyDelivery` — **ÖLÜ** production'da. Production singleton (`customerCreateConversationCoordinator`, dosya sonunda export edilir) her zaman `deps.deliver` dolu kurulur; bu metod yalnızca testlerde, `deliver` verilmeden kurulan instance'larda erişilebilir.
- Server-driven bare navigation (business-navigation → SSE `"navigation"` event, `batch` YOK) — **AKTİF**, `resolveBusinessNavigation` `customer.create`/`offer.create`/`task.create`'i çözümlediği her turda koşulsuz çalışır.
- Client coordinator-driven navigation (`dispatchCustomerNavigationCommand`, gerçek `batch` İLE) — **AKTİF**, ama YALNIZCA `extractObviousCustomerCreatePlan` `NOT_CUSTOMER_CREATE` DÖNMEZSE devreye girer (§4.2'nin gösterdiği gibi, bu çoğu doğal cümle için başarısız olabilir).
- Üç katmanlı deterministik override zinciri (`deterministicHandoffMessage`/`deterministicBusinessNavigationMessage`/`deterministicUnconfirmedMutationMessage`) — **AKTİF**, ama yalnızca "done" event'ini etkiler, canlı stream'i etkilemez (§4.4, §7).

---

## 10. Son İki Operasyonda Yapılan Commit'ler ve Production Durumları

**Operasyon N-1 — Customer Edit read/write intent ayrımı**: commit `81d51c9`. Push edildi, deploy edildi, production'da doğrulandı (Atlas'ın telefonu nedir / telefonunu değiştir testleri geçti). **ACCEPTED, geçerli, geri alınmadı.**

**Operasyon N — Living Workspace Determinism (Gap 1 + Gap 2)**: commit'ler `831063d`, `1d3f7c1`. Push edildi, deploy edildi. **İlk ACCEPTED ilanı, tek-turlu/adversarial testlere dayandığı için GERİ ÇEKİLDİ.** Gerçek çok-turlu kullanıcı akışı (bu dosyanın konusu) başarısız oldu. Kök neden bu dosyada tam olarak belgelendi (§4) ama **düzeltme henüz kodlanmadı, commit edilmedi.**

---

## 11. Pre-existing Uncommitted Dosyalar (bu operasyon boyunca hiç dokunulmadı, dokunulmamalı)

```
 M METRIX_ARCHITECTURE_MATRIX.md
 M src/app/globals.css
 M src/components/living-workspace/ExecutiveAppShell.tsx
 M src/components/metrix-tab/MetrixChatTab.tsx
?? .claude/launch.json
?? METRIX_OFFER_OPERATION_HANDOFF.md
?? METRIX_OFFER_SESSION_HANDOFF.md
?? METRIX_OPERATION_HANDOFF.md
?? METRIX_SESSION_HANDOFF.md
?? design-system/README.md
?? design-system/customers/
?? design-system/global/
?? public/design/executive-dock.svg
?? test-results/
```

Bunlar önceki, ilgisiz bir görsel tasarım çalışmasından kalma — bu operasyonun kapsamı dışında, commit edilmemeli, silinmemeli, üzerine yazılmamalı.

---

## 12. Değiştirilmesi Muhtemel Kesin Dosyalar (yeni oturum için, henüz dokunulmadı)

- `src/app/api/ai/chat/route.ts` — canonical operation kararının üretildiği/tüketildiği nokta.
- `src/lib/conversation-understanding/conversation-understanding.service.ts` / `.types.ts` — mevcut `history` parametresinin (zaten `GenerateResponseInput` için var olan aynı tip) `classifyConversation`'a da geçirilmesi (bu TEK BAŞINA yeterli değildir, bkz. §0 ve §13).
- `src/lib/conversation-extensions/customer-management-conversation-extension.ts` — coordinator'ı claim etme kapısı.
- `src/lib/customers/customer-create-conversation-coordinator.ts` — pending operation state'in gerçek sahibi.
- `src/lib/executive-request-resolution/business-navigation.ts` — server-side "Surface required" kararının üretildiği yer (bu operasyonda zaten `MUTATION_SURFACE_RESOLVED` için genişletildi).
- Muhtemelen: server'ın `businessNavigation` kararı ile client coordinator'ın pending operation'ı arasında paylaşılacak, ZATEN VAR OLAN bir sözleşmeyi (§8) genişletecek bir bağlayıcı — YENİ bir authority/runtime DEĞİL.

---

## 13. Yeni Sohbette Korunması Zorunlu Mimari Sınırlar

- Yeni classifier kurma.
- Yeni authority, runtime, coordinator, event bus veya paralel protokol kurma.
- Yalnızca prompt yaması (history ekleme dahil, TEK BAŞINA) ile "çözüldü" ilan etme — §0'da açıklanan gerçek boşluk (pending operation'ın hiç oluşmaması) prompt/history değişikliğiyle kapanmaz.
- Yeni başarı-mesajı filtresi (content/regex tabanlı) ekleme.
- Customer'a özel regex yazma.
- Önceki fixleri savunmaya çalışma — bu operasyonun (N) ACCEPTED ilanı geçersizdir, düzeltme tamamlanana kadar tekrar ACCEPTED denmemeli.
- Repository'yi baştan tarama — bu dosyadaki zincirler zaten hedefli şekilde çıkarılmıştır.
- Tek-turlu/sentetik/adversarial cümlelerle kabul testi yapma — yalnızca gerçek, çok-turlu kullanıcı akışlarıyla.

---

## 14. Şimdiye Kadar Denenen ve TEKRARLANMAMASI Gereken Dar/Yetersiz Çözümler

1. **`classifyConversation`'ın businessNavigation prompt örneklerini genişletmek** (customer.create, offer.create, task.create için örnek eklendi) — server-side navigasyon sinyalini iyileştirdi ama pending operation/field state üretmiyor; coordinator'a hiç bağlı değil.
2. **`buildUnconfirmedMutationIntentMessage` (Gap 2 evidence gate)** — yalnızca O TURUN KENDİ metni yeterince açık olduğunda çalışıyor (`userMotivation === "kayit_islem"` per-turn); kısa, bağlama bağımlı devam turlarında (`evet var`, `tamamla`) sistematik olarak başarısız oluyor çünkü `classifyConversation` history almıyor.
3. **`MUTATION_SURFACE_RESOLVED` evidence'ı narration'a eklemek** — "Surface required" kararını görünür kıldı ama bu kararın CLIENT tarafında gerçek bir pending operation'a dönüşmesini sağlamıyor; server hâlâ yalnızca boş bir form açabiliyor (batch yok).
4. **Tek-turlu adversarial cümlelerle kabul testi** — mimarinin en kırılgan noktasını (çok-turlu, kısa, bağlama bağımlı gerçek kullanıcı akışı) hiç test etmedi, yanlış güvenle ACCEPTED ilanına yol açtı.

Bunların hepsi ayrı ayrı doğru yönde küçük adımlardı ama **hiçbiri kök nedeni (server ve client'ın aynı operasyon kararını iki ayrı yerde, birbirinden habersiz üretmesi) kapatmadı.**

---

## 15. Nihai Gerçek Kullanıcı Kabul Senaryosu

Düzeltme sonrası, `metrixgm.com` üzerinde gerçek hesapla, **benzersiz bir müşteri adıyla aynı 4-turlu senaryo (ya da eşdeğeri) üç ayrı temiz konuşmada** çalıştırılmalı. Her üçünde de:

- İlk komuttan hemen sonra Customer Create Workspace görünür şekilde açılacak.
- Firma adı, konum/adres, yetkili ve telefon alanları kullanıcı gözü önünde canlı dolacak (server'ın bare navigasyon'u değil, coordinator'ın gerçek field batch'i).
- Mesajlar kronolojik sırada görünecek.
- "evet var" / "tamamla" gibi kısa onay turları, AYNI pending operation ID üzerinde çalışacak — yeni, bağımsız bir turn olarak işlenmeyecek.
- Mutation yalnızca görünür projection sonrasında gerçekleşecek.
- Gerçek customer ID üretilecek.
- Bağımsız `GET /api/customers` kaydı doğrulayacak.
- Aynı konuşmada "müşteri kartını aç" komutu kaydı gerçekten bulacak.
- Yeni bir konuşmada aynı müşteri bulunacak.
- Sohbet, Workspace ve DB her zaman aynı değerleri gösterecek — hiçbir "kaydettim" iddiası, karşılığında gerçek bir mutation olmadan üretilemeyecek.

Bu senaryo üç kez, gerçek hesapla, temiz konuşmalarda geçmeden hiçbir ACCEPTED ilanı yapılmamalı.
