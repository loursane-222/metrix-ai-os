> **BAYATLIK UYARISI (2026-08-07 ekleyen: Cowork):** Bu denetim `94046f9` commit'inde (25 Temmuz 2026) yapıldı. Bu belgenin repo'ya eklendiği tarihte (`d81eefb6`, 7 Ağustos 2026) aradan **138 commit** geçmiş durumda. Bu rapor bir GERÇEK DURUM DEĞİL, bir DOĞRULANMASI GEREKEN HİPOTEZ LİSTESİ olarak kullanılmalı — her bulgu, harekete geçmeden önce güncel koda karşı yeniden kontrol edilmeli. Metodoloji ve kök-neden analizi (Bölüm 11-12) hâlâ çok değerli bir referans çerçevesi; ama satır numaraları ve "hâlâ doğru mu" sorusu güncel HEAD'e göre yeniden doğrulanmalı. Bkz. `METRIX_TASK_BRIEF_metrix-uctan-uca-denetim.md` (repo kökü) — bu raporu yeniden doğrulama görevi oradan veriliyor.

---

# METRIX AI OS — Ürün Anayasası Mimari Denetimi

**Repository:** `/Users/mac/Projects/metrix-ai-os`
**Denetim türü:** Salt-okunur statik kod incelemesi. Hiçbir dosya değiştirilmedi, hiçbir migration/commit/branch/push/deploy yapılmadı.
**Başlangıç branch:** `main` — **Başlangıç HEAD:** `94046f949c973b46979b501432510d703f979a11`
**Bitiş branch:** `main` — **Bitiş HEAD:** `94046f949c973b46979b501432510d703f979a11` (değişmedi)
**`git status --short` (başlangıç = bitiş, birebir aynı):**
```
?? .claude/launch.json
?? design-system/README.md
?? design-system/customers/
?? design-system/global/
?? public/design/executive-dock.svg
```
Bu beş satır denetim başlamadan önce zaten untracked haldeydi; denetim boyunca hiçbir dosya eklenmedi, silinmedi veya değiştirilmedi (`git diff --stat` boş).

---

## 1. Yönetici Özeti

1. **Genel uyum: Kısmen uyumlu.** Kimlik/prompt katmanı (Bölüm 3–4) mimari olarak doğru kurulmuş — tek `EXECUTIVE_PRESENCE_POLICY` (`src/lib/ai/identity/executive-identity-prompt.ts:40-61`), ama üretim akışında METRIX'in LLM'i devre dışı bırakan en az iki gerçek bypass yolu var.
2. **En güçlü uyum noktası:** `renderPromptTemplate` / `prompt-format.ts` katmanı — tüm executive-* alt sistemlerinin çıktısı (recommendation package, executiveManagerContext, memory, quote/payment context) LLM'e **talimat/bağlam** olarak veriliyor, kullanıcıya doğrudan yazılmıyor (bkz. Bölüm 5, Q4).
3. **En kritik anayasa ihlali (P0):** `detectExecutiveGap` gap-intercept yolu, METRIX'in LLM'ini hiç çağırmadan, 5 sabit Türkçe cümleden birini `provider: "mock", model: "gap_intercept"` etiketiyle doğrudan kullanıcıya "AI Genel Müdür cevabı" olarak yazıyor (`src/app/api/ai/chat/route.ts:492-565`; şablon kaynağı `src/lib/manager-advice/executive-gap-detector.service.ts:33-34,76-89`).
4. **İkinci P0 ihlal:** `resolveProviderName` (`src/lib/ai/gateway/ai-gateway.ts:405-417`), `AI_PROVIDER` ortam değişkeni tam olarak `"openai"` değilse **sessizce** `"mock"` sağlayıcısına düşüyor; bu durumda tüm cevaplar `mock-provider.ts`'in anahtar-kelime şablonlu metinlerinden geliyor — kullanıcıya hiçbir işaret verilmeden.
5. **Üçüncü P0 ihlal:** Executive Operating System katmanındaki üç servis — `completeExecutiveAction`, `applyCollectionActionLifecycle`, `applyQuoteWorkflowLifecycle` — kullanıcı mesajındaki anahtar kelime güven skoruna (confidence ≥ 0.60) dayanarak, METRIX'in ürettiği yanıt akışa gönderildikten (`visibleDoneSent = true`, `route.ts:821`) **sonra**, hiçbir onay adımı olmadan durum değiştiriyor (aksiyon kapatma, teklif WON/LOST). Anayasanın "servisler yönetim kararı veremez" ilkesini doğrudan ihlal ediyor (bkz. Bölüm 4, Bölüm 7C).
6. **İlk cevabı geciktiren ana mimari neden:** `contextProfile` ikili (binary) bir seçim — `full_context` seçildiğinde (executive_analysis/action_execution kategorileri) ilk token'dan önce 9 adımlı `buildExecutiveOperatingContext` + 6 executive-* builder + `buildExecutivePromptBridge` + `retrieveGmailContext` **senkron** olarak çalışıyor (`ai-gateway.ts:576-812`). "Conversation First" (94046f9) sadece pipeline A/C'yi (executive-brain, executive-intelligence) text için stream sonrasına erteledi; pipeline B (ai-gateway.ts içindeki 6 builder) hâlâ tamamen kritik yolda.
7. **Yazılı ve sesli mimari birleşik değil.** Aynı `buildExecutiveIdentityPrompt`/`buildExecutivePresenceSurfacePolicy` kimlik katmanını paylaşıyorlar (doğru), ama üretim mekanizmaları farklı: voice fast-path OpenAI SDK'yi doğrudan çağırıyor (`voice-fast-response.service.ts`), text/blocking-pipeline `streamWithAiGateway`'i kullanıyor. Ayrıca yalnızca voice, pipeline A'nın (`executiveBrainShadow.mode === "shadow"`) ürettiği "Yönetim kanaati:" bloğunu canlı prompt'a alıyor; text bu bloğu hiç almıyor (bkz. Bölüm 9).
8. **METRIX dışında fiilî karar otoritesi var mı — Evet, üç yerde:** (a) gap-intercept şablon seçici, (b) mock-provider fallback, (c) outcome-signal → otomatik kayıt kapama/durum değiştirme servisleri.
9. **Sınıflandırma/fast-path katmanı temiz.** `tryFastPathClassification`, `resolveTextResponseReadiness`, `resolveConversationRuntime` tamamen deterministik regex/whitelist kodu; hiçbiri kullanıcıya metin üretmiyor, yalnızca yönlendirme bayrağı (`contextProfile`, `shouldInvokeExecutiveBrain`) üretiyor — anayasal olarak doğru konumda (Bölüm 7B).
10. **Shadow resolver gerçekten gölge.** `createShadowExecutiveRequestResolver` çıktısı `void` ile atılıyor, hiçbir zaman canlı yanıtı etkilemiyor (`route.ts:361-367`).
11. **Onay (approval) altyapısı üretimde kırılgan.** `/api/executive/approvals/*` bellek-içi (`Map`) bir store kullanıyor — Prisma modeli yok (`grep "model Approval" prisma/schema.prisma` sonuçsuz). Sadece `customer.archive` ve `custom_field.*` için `EXPLICIT` onay politikası var; `customer.create`/`customer.update` için onay politikası `"NONE"`.
12. **Telemetri yalnızca console log.** Sentry/Datadog/PostHog/OpenTelemetry entegrasyonu yok; tüm "telemetri" `console.info`/`console.table`.
13. **Karar mantığı çok dağınık.** `src/lib` altında 44 farklı `executive-*` üst modül var; en az iki modül aynı isimli fonksiyonu (`buildExecutiveDecisionPackage` vs `buildExecutiveDecisionResult`) farklı anlamlarla ihraç ediyor — bu isim benzerliği gelecekteki geliştiricilerin yanlış modülü çağırma riskini artırıyor.
14. **Sesli akışta ek bir "ikinci ses" riski:** `voice/ack/route.ts`, `gpt-4o-mini` ile üretilen kısa bir sözlü dolgu cümlesini gerçek cevapla yarıştırıyor; kazanırsa kullanıcının duyduğu "0. cümle" METRIX'in ana muhakeme zincirinden değil, ayrı ve daha hafif bir LLM çağrısından geliyor.
15. **Hedef mimariye ulaşmadaki en büyük risk:** Mevcut sistemde "hız" ve "derinlik" birbirini dışlayan iki ayrı yol (`contextProfile` ikili seçimi) olarak kodlanmış; anayasanın istediği "aynı zamanda hem hızlı hem derin" mimari şu anda yapısal olarak yok — sadece "hızlı-sığ" veya "yavaş-derin" var.

---

## 2. Mevcut Production Mimarisi

### 2.1 Yazılı Sohbet Akışı

Tek giriş noktası: `POST /api/ai/chat` (`src/app/api/ai/chat/route.ts`, `POST()` fonksiyonu, satır 155-1080).

| Adım | Dosya/Fonksiyon | Not |
|---|---|---|
| 1. Auth context | `requireAuthContextFromCookies` — `src/lib/auth/guards/api-auth-guard.ts` | `route.ts:165-168` |
| 2. Rate limit | `isChatRateLimited` — `route.ts:138-153` | `prisma.event.count` (Event tablosu, 20 mesaj/5dk) |
| 3. Body doğrulama | `readJsonObject`, `assertNoForbiddenClientFields`, `readChatMessage` — `route.ts:187-192,1082-1100` | |
| 4. Response readiness | `resolveTextResponseReadiness` — `src/lib/conversation-understanding/text-response-readiness.ts:36-45` | Deterministik regex, LLM yok |
| 5. Fast-path classification | `tryFastPathClassification` — `src/lib/conversation-understanding/conversation-fast-path.ts:112-163` | Deterministik whitelist/regex, LLM yok |
| 6. Runtime profile | `resolveConversationRuntime` — `src/lib/conversation-understanding/conversation-runtime-profile.ts:29-70` | `contextProfile` seçimi (deterministik lookup) |
| 7. Conversation resolve + memory fetch | `resolveChatConversation` + `listActiveMemoryItemsByOrganization` — `route.ts:258-266` | `Promise.all` ile paralel |
| 8. Manager advice analiz | `analyzeManagerAdvice` — `route.ts:302-305` | Deterministik (§3'te doğrulandı, LLM'e talimat olarak gider) |
| 9. Gap intercept kontrolü | `detectExecutiveGap` / `getGapSafeFallback` — `route.ts:492-565` | **BYPASS**: eşleşirse LLM hiç çağrılmadan sabit metinle döner |
| 10. Learning decision | `buildExecutiveLearningDecision` — `route.ts:402-426` | Deterministik, CPU-only |
| 11. Kullanıcı mesajı yazımı | `sendUserMessage` — `route.ts:430-441` | Async başlatılır, hemen await edilmez |
| 12. AI Gateway çağrısı | `streamWithAiGateway` — `src/lib/ai/gateway/ai-gateway.ts:422-876` | `contextProfile`'a göre "hızlı" veya "tam" zincir (bkz. Bölüm 6) |
| 13. Stream | `ReadableStream` — `route.ts:715-1036` | NDJSON chunk'lar, `type:"chunk"` sonra `type:"done"` |
| 14. Sanitization/repair | `sanitizeExecutiveManagerResponse`, gerekirse `repairAiContent` — `route.ts:1102-1213` | Regex tabanlı denetim + gerekirse ikinci LLM çağrısı |
| 15. Post-stream intelligence | `startPostStreamIntelligence` — `route.ts:652-714` | `done` event'inden SONRA: executive-brain (pipeline A) + chat-executive-intelligence (pipeline C) + learning-loop |
| 16. Deferred capture/memory | `startDeferredInputEffects` — `route.ts:448-487`, `824-836` | `capturePromise`/`memoryCandidatesPromise`, ilk chunk sonrası başlar, `done` sonrası awaited |
| 17. AI mesajı yazımı | `sendAiMessage` — `route.ts:907-928` | |
| 18. Lifecycle side-effects | `applyCollectionActionLifecycle`, `applyQuoteWorkflowLifecycle`, `completeExecutiveAction` — `route.ts:850-905` | `done` event'inden SONRA, onaysız (bkz. Bölüm 4) |

### 2.2 Sesli Sohbet Akışı

Frontend: `src/components/metrix-tab/useVoiceChatConnection.ts` (WebRTC/mic) + `useVoiceExperienceOrchestrator.ts` (turn state machine), `MetrixChatTab.tsx`'ten tetiklenir.

| Adım | Dosya/Fonksiyon | Not |
|---|---|---|
| 1. Mic + WebRTC | `getUserMedia`, `RTCPeerConnection` — `useVoiceChatConnection.ts:597,633` | |
| 2. Session oluşturma | `POST /api/ai/chat/voice/session` — `src/app/api/ai/chat/voice/session/route.ts:19,67-110` | OpenAI Realtime API `client_secrets` endpoint'i çağrılır |
| 3. Realtime bağlantı | `POST https://api.openai.com/v1/realtime/calls` — `useVoiceChatConnection.ts:83,713-729` | WebRTC SDP offer/answer, doğrudan OpenAI'a |
| 4. STT | OpenAI Realtime, model `gpt-4o-transcribe`, `language:"tr"` — `voice/session/route.ts:90-93` | Uygulama kendi STT'sini yapmıyor |
| 5. VAD/turn detection | `semantic_vad`, `create_response:false` — `voice/session/route.ts:95-101`; istemci tarafı kabul mantığı `useVoiceChatConnection.ts:283-333` | Sunucu VAD + istemci "final transcript" kararı |
| 6. Ack (dolgu cümle) | `POST /api/ai/chat/voice/ack` — `src/app/api/ai/chat/voice/ack/route.ts` | `gpt-4o-mini` ile üretilir, gerçek cevapla yarışır |
| 7. Ana cevap isteği | `POST /api/ai/chat` (`channel:"voice"`) — `MetrixChatTab.tsx:527,531` | Aynı route, `voice-v4-orchestrator.ts`'e düşer |
| 8. Voice fast-path | `tryVoiceFastPath` — `src/app/api/ai/chat/voice-v4-orchestrator.ts` | `streamWithAiGateway`'i ATLAYIP OpenAI SDK'yi doğrudan çağırır (`voice-fast-response.service.ts`) |
| 9. Fallback (blocking pipeline) | `streamWithAiGateway({contextProfile:"full_context", promptTemplateId:"voice_conversation"})` — `route.ts:602-627` | Fast-path `null` dönerse metinle aynı ağır zincir |
| 10. TTS | `POST /api/ai/chat/voice/tts` — `src/app/api/ai/chat/voice/tts/route.ts:42-62` | `gpt-4o-mini-tts`, cümle bazında, akan (`stream_format:"audio"`) |
| 11. Persistence | `sendUserMessage`/`sendAiMessage` — voice fast-path `voice-v4-orchestrator.ts:134-139,362-439`; blocking pipeline `route.ts` (metinle aynı fonksiyonlar) | Aynı tablo, ama capture/memory-candidate senkron (`done`'dan önce await) |
| 12. Background | Capture + memory candidates voice'ta `done` öncesi await ediliyor (metinde `done` sonrası) | Asimetri doğrulandı |

### 2.3 İşlem ve Kayıt Akışı

- **Okuma:** `buildExecutiveOperatingContext` (`src/lib/executive-operating-context/executive-operating-context-builder.service.ts:65-472`) — memory/person/quote/payment/collection-action/signal context'lerini paralel `Promise.all` ile okur; salt veri, kullanıcıya metin üretmez.
- **Draft/öneri oluşturma:** `captureLiveCustomerConversation` → `UniversalCaptureOrchestrator.process()` (`src/lib/universal-capture/orchestrator.ts:12-20`) — LLM planlayıcı (`customer-create-conversation-ai-adapter.ts`) ile alan çıkarımı yapar, **veritabanına yazmaz**, yalnızca `draftOperations`/`approvalRequirements`/`userInteraction` döner; sonuç `captureActivationMetadata` olarak mesaj metadata'sına eklenir (`route.ts:533,925`), kullanıcının konuşma yanıtı değildir.
- **Kayıt oluşturma/güncelleme:** `src/lib/action-runtime/execution/execution-runtime.ts` — tek giriş noktası `executeAction()`: registry lookup → policy evaluation → approval verification → idempotency → handler → outbox/audit. `customer.create`/`customer.update` → `approvalPolicy:"NONE"` (`registry/manifests/customers.actions.ts:41,57`); `customer.archive` ve `custom_field.*` → `approvalPolicy:"EXPLICIT"` (`:22,71`).
- **Onay isteme:** `/api/executive/approvals/route.ts` (`listApprovalEnvelopes`) ve `[approvalId]/decision/route.ts` (`decideApproval`) → `src/lib/executive-lifecycle/approval-decision-service.ts` → `action-runtime/policy/approval-service.ts` (in-memory `Map`, kalıcı değil).
- **Onaysız otomatik durum değişikliği:** `detectExecutiveActionOutcomeSignals` (güven ≥ 0.60) → `completeExecutiveAction` (`src/lib/core/executive-actions/executive-action-engine.service.ts:68-84`, doğrudan `prisma.executiveAction.update`); `detectCollectionActionSignals` → `applyCollectionActionLifecycle`; `detectQuoteWorkflowSignals` → `applyQuoteWorkflowLifecycle` — hepsi `route.ts:850-905`'te, `done` event'inden sonra, onaysız.
- **Kullanıcıya sonuç bildirme:** Yalnızca ana LLM akışı (`sanitizeExecutiveManagerResponse` sonrası `aiContent`) kullanıcıya "konuşulan" metin olarak gider; yukarıdaki kayıt işlemlerinin sonucu kullanıcıya ayrı bir cümleyle bildirilmiyor — sadece metadata'da (`executiveDelegationResult` vb.) taşınıyor.

---

## 3. Anayasayla Uyumlu Noktalar

| Anayasa ilkesi | Mevcut uygulama | Kanıt | Uyum seviyesi |
|---|---|---|---|
| Madde 2 — Tek kimlik tanımı | Tüm surface'ler (chat/voice/repair) tek `EXECUTIVE_PRESENCE_POLICY.instructions`'dan türüyor, sadece format farkları var | `src/lib/ai/identity/executive-identity-prompt.ts:40-82` | Tam uyumlu |
| Madde 3 — Servisler bağımsız dil üretemez (prompt render) | `renderPromptTemplate`/`prompt-format.ts` tüm executive-* çıktısını LLM talimatı/bağlamı olarak render eder, literal kullanıcı cevabı üretmez | `src/lib/ai/prompts/prompt-renderer.ts:13-23`, `prompt-format.ts` (formatExecutiveManagerContext, formatExecutiveRecommendation) | Tam uyumlu |
| Madde 3 — manager-advice bağımsız konuşamaz | `composeManagerAdviceResponse` çıktısı yalnızca metadata + boolean prompt sinyali; `manager-advice-advisory-prompt.service.ts:36` LLM'e "bu bölümü aynen gösterme" talimatı veriyor | `manager-advice-composer.service.ts:30-46`, `route.ts:806` | Tam uyumlu |
| Madde 9 (dolaylı) — sınıflandırma katmanı karar/kanaat üretmiyor | `tryFastPathClassification`/`resolveTextResponseReadiness`/`resolveConversationRuntime` yalnızca enum/flag döner, metin üretmez | `conversation-fast-path.ts:112-163`, `text-response-readiness.ts:36-45`, `conversation-runtime-profile.ts:29-70` | Tam uyumlu |
| Madde 6 — Yetki dağınık servis kişilikleri yaratmamalı | `action-runtime/` içinde hiçbir LLM/metin üretim çağrısı yok (grep doğrulandı); yalnızca structured `ExecutionResult`/audit üretir | `src/lib/action-runtime/**` | Tam uyumlu |
| Madde 6 — riskli işlemde onay (dar kapsamda) | `customer.archive` ve `custom_field.*` için `approvalPolicy:"EXPLICIT"`, gerçek gateway çağrı zinciri var | `registry/manifests/customers.actions.ts:22,71`, `gateway/customer-archive-gateway.ts:14-36` | Kısmen uyumlu (yalnız 2 aksiyon; store kalıcı değil) |
| Madde 5 — hızlı yol için gerçek muhakeme | `conversational_minimal`/`business_light`/`immediate_minimal` profillerinde ağır executive zinciri atlanıp doğrudan LLM'e gidiliyor — ilk cümle gerçek model çıktısı | `ai-gateway.ts:444-574` | Kısmen uyumlu (yalnız düşük-karmaşıklık mesajlarda) |
| Madde 5 — memory approval insan denetimi | Kullanıcı tarafından onaylanan hafıza adayları `assertCanReviewMemoryCandidates` (OWNER/EXECUTIVE) ile korunuyor | `src/app/api/memory-candidates/[candidateId]/approve/route.ts:20-21`, `memory-candidate-permissions.ts:7-13` | Kısmen uyumlu (onboarding/system-inferred adaylar otomatik aktifleşiyor) |

---

## 4. Anayasadan Sapmalar

| Sapma | Dosya/akış kanıtı | Kullanıcıya etkisi | Anayasal etkisi | Ciddiyet |
|---|---|---|---|---|
| Gap-intercept: LLM'siz sabit cevap, `provider:"mock"` etiketiyle METRIX yanıtı gibi sunuluyor | `route.ts:492-565`; şablonlar `executive-gap-detector.service.ts:33-34,76-89` | Kullanıcı METRIX'le konuştuğunu sanır, aslında 5 sabit cümleden biri seçilmiştir | Madde 2 (Tek Otorite) + Madde 4 (Ezbersiz konuşma) ihlali | **P0** |
| `AI_PROVIDER` yanlış/boş ise sessizce `mock` sağlayıcıya düşme | `ai-gateway.ts:405-417`, `830-845`, `mock-provider.ts:44-190` | Yanlış konfigürasyonda TÜM cevaplar şablon metin olur, kullanıcıya bildirim yok | Madde 1 (METRIX = LLM muhakemesi) + Madde 4 ihlali | **P0** |
| Onaysız otomatik kayıt kapama/durum değiştirme | `route.ts:850-905` → `completeExecutiveAction` (`executive-action-engine.service.ts:68-84`), `applyCollectionActionLifecycle`, `applyQuoteWorkflowLifecycle` | Teklif WON/LOST, aksiyon DONE gibi büyük ölçüde geri döndürülemez durumlar METRIX'in ürettiği cevaptan bağımsız, anahtar-kelime güveniyle değişir | Madde 3 ("servisler yönetim kararı veremez") + Madde 6 (riskli işlemde onay) ihlali | **P0** |
| `buildExecutiveFallbackResponse` — sabit Türkçe hata cümleleri | `executive-identity-prompt.ts:145-160` | Provider hatası/tekrar onarım başarısızlığında kullanıcı sabit şablon cümle görür | Madde 4 (ezbersiz konuşma) ihlali | **P1** |
| Voice `ack` route ayrı, daha hafif bir LLM'in (gpt-4o-mini) ürettiği dolgu cümlesi; gerçek cevapla yarışıp "0. cümle" olabiliyor | `voice/ack/route.ts:1,28,39-42,94-102`; yarış mantığı `useVoiceExperienceOrchestrator.ts:391-396,844-877` | Kullanıcının duyduğu ilk kelimeler METRIX'in asıl muhakeme zincirinden gelmeyebilir | Madde 2 (Tek Otorite) + Madde 5 (ilk cümle gerçek muhakeme olmalı) riski | **P1** |
| Text kanalında executive-brain (pipeline A) ve executive-intelligence (pipeline C) yalnızca stream bittikten SONRA çalışıyor, canlı prompt'a hiç girmiyor | `route.ts:566-591` (voiceCognition text için hep `null`), `652-714` (`startPostStreamIntelligence`, `done` sonrası) | Metin sohbette derin "Genel Müdür" değerlendirmesi (council, strategic profile, brief) hiçbir zaman o turdaki cevaba yansımıyor — yalnızca sonraki turlarda metadata olarak saklanıyor | Madde 5 ("derin veriler METRIX'e geri döner ve ifadesini geliştirir") — bu geri dönüş text'te fiilen yok | **P1** |
| `full_context` profili seçildiğinde (executive_analysis/action_execution) ilk token öncesi 9+6 adımlık senkron zincir | `ai-gateway.ts:576-812` | Tam da derin muhakeme gerektiren mesajlarda ilk token en çok gecikiyor — anayasanın "hız feda edilmez" ilkesiyle ters yönde | Madde 5 ihlali | **P1** |
| Yalnızca voice, pipeline A'nın `decisionPackage`'ından türeyen "Yönetim kanaati:" bloğunu canlı prompt'a alıyor; text hiç almıyor | `ai-gateway.ts:169-179` (`executiveBrainContext?.mode==="shadow"` sadece voice pre-stream'de `"shadow"` olabiliyor), `prompt-format.ts:1340-1360` | Aynı iş bağlamı için voice ve text farklı "kanaat" derinliğiyle cevap verebilir | Madde 2 (surface'ler arası tutarlı tek zihin) riski | **P1** |
| Onay (approval) store'u bellek-içi, kalıcı değil | `action-runtime/policy/approval-store.ts:17-36` (in-memory `Map`); Prisma'da `Approval` modeli yok | Süreç yeniden başlarsa/instance değişirse bekleyen onaylar kaybolabilir | Madde 6 (yetki bütünlüğü) riski | **P2** |
| Hafıza adayları (`ONBOARDING`/`SYSTEM_INFERRED`, `promotionPolicy:"AUTOMATIC"`) insan onayı olmadan aktifleşiyor | `src/lib/memory/candidate-engine.service.ts:200-322` (özellikle 245-312) | METRIX'in gelecekteki cevapları, kullanıcının hiç onaylamadığı "öğrenilmiş" bir bilgiye dayanabilir | Madde 5/6 (öğrenme/hafıza bütünlüğü) riski | **P2** |
| İki farklı "decision engine" modülü aynı fonksiyon adını taşıyor | `src/lib/executive-brain/executive-decision-engine.service.ts:32` (`buildExecutiveDecisionPackage`) vs `src/lib/executive-decision-engine/executive-decision-engine.service.ts:132` (`buildExecutiveDecisionResult`) | Kullanıcıya doğrudan etkisi yok, ama geliştirici hatası riski yüksek | Madde 2 (ölçeklenebilirlik/berraklık) riski | **P2** |
| Harici gözlemlenebilirlik aracı yok, telemetri yalnızca `console.*` | `src/lib/ai/performance/request-profiler.ts:40-56`, grep sonuçsuz (sentry/datadog/posthog/opentelemetry) | Üretimde performans/hata regresyonları geç fark edilir | Ölçeklenebilirlik riski | **P2** |
| Cron tetikleyicisi GitHub Actions + bearer secret, `NODE_ENV !== production` iken varsayılan olarak açık | `.github/workflows/daily-briefing.yml`, `src/app/api/briefing/generate/route.ts:27-36` | Yanlış ortam değişkeni ile endpoint korumasız kalabilir | İkincil güvenlik/config riski | **P3** |

---

## 5. Otorite ve Karar Üretimi Denetimi

| Bileşen | Girdi | Çıktı | Veri mi / karar mı / kanaat mi | Kullanıcıya doğrudan ulaşıyor mu | METRIX tarafından yeniden değerlendiriliyor mu | Anayasal doğru katman |
|---|---|---|---|---|---|---|
| `tryFastPathClassification` / `resolveTextResponseReadiness` / `resolveConversationRuntime` | Kullanıcı mesajı (metin) | `contextProfile`, `mode`, `shouldInvokeExecutiveBrain` (enum/bool) | Veri (yönlendirme bayrağı) | Hayır | N/A — zaten METRIX'e gitmeden önce yönlendirme | EOS (doğru) |
| `classifyConversation` (voice, gpt-4.1-mini) | Kullanıcı mesajı | `ConversationUnderstanding` JSON | Veri | Hayır | Evet — sadece prompt derinliğini belirler | EOS (doğru) |
| `detectExecutiveGap` / `getGapSafeFallback` | Mesaj + manager-advice analiz | `criticalQuestion` (5 sabit cümleden biri) | **Kanaat/karar** (soru sorma kararı METRIX yerine servis tarafından veriliyor) | **Evet, doğrudan** | **Hayır** | **Yanlış katman — bu METRIX'in kararı olmalı** |
| `composeManagerAdviceResponse` | manager-advice analiz | `message` (şablon metin) | Kanaat taslağı ama... | Hayır (yalnız metadata + bool sinyal) | Evet — LLM bunu "gösterme" talimatıyla alır | EOS (doğru, sınırda) |
| `buildExecutiveOperatingContext` + pipeline B (`executive-decision-engine`, `-delegation`, `-responsibility-matrix`, `-performance-signal`, `-management-review`) | Org verisi | Yapılandırılmış context + `executiveManagerContext` metni ("Yönetim durumu:") | Veri + önceden yazılmış yönlendirici cümleler | Hayır (prompt'a girer) | Evet — LLM bunu okuyup kendi cümlesini üretir | EOS (doğru, ama önceden yazılmış "İlk adım:" gibi ifadeler LLM'in söz seçimini güçlü şekilde yönlendiriyor) |
| Pipeline A (`executive-brain`: assessment/council/strategic-profile/decision-package/brief) — TEXT | Org verisi | `ExecutiveBrainShadowMetadata` | Veri/analiz | Hayır | **Hayır (text'te sadece stream sonrası, o turun cevabına hiç girmiyor)** | Kısmen yanlış konumlanmış — "shadow" modu kalıcı hale gelmiş, asla METRIX'e geri dönmüyor |
| `resolveChatExecutiveCognition` (pipeline C) — TEXT | Org verisi | `ExecutiveOperatingSystem` | Veri | Hayır | Hayır (aynı, sadece voice'ta pre-stream) | Aynı sorun |
| `completeExecutiveAction` / `applyCollectionActionLifecycle` / `applyQuoteWorkflowLifecycle` | Kullanıcı mesajı → keyword confidence | DB yazımı (status değişikliği) | **Karar** (iş durumu kararı) | Dolaylı (sonraki turda görünür) | **Hayır** | **Yanlış katman — management karar EOS'ta veriliyor** |
| `sanitizeExecutiveManagerResponse` + `repairAiContent` | LLM çıktısı | `needsRepair`, gerekirse ikinci LLM çağrısı | Denetim (kanaat değil) | Dolaylı (onarılmış metin kullanıcıya gider) | Evet (repair da LLM'den geçiyor) | EOS/METRIX arası doğru işbirliği |
| `voice/ack/route.ts` | Kullanıcı transkripti | Kısa sözlü dolgu cümlesi (gpt-4o-mini) | Kanaat değil ama **konuşma** | **Evet, doğrudan (yarışı kazanırsa)** | Hayır | Sınırda — ayrı bir LLM'in kullanıcıya doğrudan konuşması |
| `resolveProviderName` mock fallback | Env config | mock-provider şablon metni | **Kanaat/cevap** | **Evet, doğrudan** | Hayır | Yanlış — config hatası METRIX'in yerine geçiyor |

---

## 6. Critical Path Analizi

Aşağıdaki tablo, `channel:"text"`, `requiresExecutiveReasoning:true` (contextProfile = `full_context`) senaryosu için ilk token'a kadar zorunlu adımları sıralar — bu, anayasanın en çok önem verdiği "gerçek Genel Müdür muhakemesi" senaryosudur.

| Sıra | Bileşen | Dosya/fonksiyon | Senkron mu? | İlk token öncesi bekleniyor mu? | Zorunlu mu? | Risk |
|---|---|---|---|---|---|---|
| 1 | Auth context | `requireAuthContextFromCookies` | Senkron await | Evet | Evet | Düşük |
| 2 | Rate limit DB sorgusu | `prisma.event.count` | Senkron await | Evet | Evet | Düşük |
| 3 | Readiness + fast-path + runtime profile | Deterministik, CPU-only | Senkron | Evet | Evet | Yok (I/O değil) |
| 4 | Conversation resolve + active memory | `Promise.all` | Paralel await | Evet | Evet | Orta (2 DB sorgusu paralel, iyi optimize edilmiş) |
| 5 | Gap detection | `detectExecutiveGap` | Senkron | Evet | Evet | Düşük (CPU-only, ama eşleşirse tüm zinciri kısa devre yapar) |
| 6 | Learning decision | `buildExecutiveLearningDecision` | Senkron | Evet | Evet | Düşük |
| 7 | Son AI mesajı | `findLastAiMessageByConversation` | Senkron await | Evet | Evet | Orta — 4. adımla paralelleştirilebilirdi ama `conversation.id`'ye bağımlı, sıralı zorunlu |
| 8 | `buildExecutiveOperatingContext` (9 alt adım: memory/person/quote/payment/quoteConversion/todayAnchor/recentSignal/syncCollectionActions/collectionAction) | `ai-gateway.ts:577-657` | Senkron await (kendi içinde kısmen paralel) | **Evet** | Yalnızca `full_context` profilinde | **Yüksek — statik incelemeyle kesin süre çıkarılamaz, ama 9 alt adımlı bir zincir olması gecikme riskini artırır** |
| 9 | `resolveRuntimeAugmentation` callback (objection/conversation/outcome signal + conversationState/mindState) | `ai-gateway.ts:599-656` | Senkron, adım 8 içinde | Evet | Evet (full_context'te) | Düşük-orta (CPU-only) |
| 10 | `buildExecutiveDecisionResult` → `Delegation` → `ResponsibilityMatrix` → `PerformanceSignal` → `ManagementReview` (6 builder) | `ai-gateway.ts:669-720` | Senkron, sıralı | Evet | Evet (full_context'te) | **Yüksek — 6 fonksiyon sıralı çalışıyor, statik incelemeyle süre kanıtlanamaz ama sıralı-senkron tasarım riski açık** |
| 11 | `buildExecutivePromptBridge` (`executiveManagerContext`) | `ai-gateway.ts:731-767` | Senkron | Evet | Evet | Orta |
| 12 | `retrieveGmailContext` | `ai-gateway.ts:771-774` | Senkron await | Evet | Evet | **Yüksek — harici entegrasyon (Gmail API) ilk token'ı bloke ediyor; ağ gecikmesine tamamen açık** |
| 13 | `renderPromptTemplate` | `ai-gateway.ts:776-812` | Senkron, CPU-only (string assembly) | Evet | Evet | Düşük |
| 14 | `createOpenAiStream` başlatma | `ai-gateway.ts:826-828` | Senkron çağrı başlatma | Evet | Evet | Düşük (bundan sonrası akış) |
| — | Pipeline A (`executive-brain`) + pipeline C (`chat-executive-intelligence`) | `route.ts:652-714` | Async | **Hayır — `done` event'inden sonra** | Hayır | Doğru yerde (background) |
| — | Capture + memory candidates (text) | `route.ts:448-487` | Async | **Hayır — ilk chunk sonrası başlar, `done` sonrası awaited** | Hayır | Doğru yerde (background) |
| — | Deferred operating-context writes (`syncCollectionActions`, signal snapshot, decision records) | `aiResponse.runDeferredOperatingContextWrites()` — `route.ts:842-848` | Async | Hayır | Hayır | Doğru yerde (background) |
| — | Capture + memory candidates (**voice**) | `route.ts:752-755` | **Await edilmiş, `done`'dan ÖNCE** | **Evet (yalnız voice'ta)** | Hayır (background olmalı) | **Orta — voice'ta gereksiz senkronizasyon** |

**Statik inceleme sınırı:** Kaynak kod, 8-12 numaralı adımların gerçek milisaniye maliyetini kanıtlamaz — bunun için üretim telemetrisi (APM) gerekir, ve Bölüm 14'te belirtildiği gibi böyle bir araç repo'da yok. Kanıtlanabilen tek şey **mimari sıra**dır: bu 5 adım (8-12), full_context profilinde first-token'dan önce zorunlu olarak sıralı/senkron çalışacak şekilde kodlanmıştır.

**Gereksiz seri çalışan işlemler:** Adım 10'daki 6 builder fonksiyonu birbirine veri bağımlılığıyla zincirlenmiş (`executiveDecisionResult` → `executiveDelegationResult` → ...) — paralelleştirilemez, tasarım gereği seri.

**Aynı veriyi tekrar yükleme:** `activeMemoryItems` route.ts'te bir kez yüklenip (`listActiveMemoryItemsByOrganization`, adım 4) hem `requestMemoryContext`'e hem `buildExecutiveOperatingContext`'e (`preloadedMemoryContext` parametresi) geçiriliyor — bu **doğru** bir optimizasyon, tekrar sorgu yok (`ai-gateway.ts:586`).

---

## 7. METRIX ve Executive Operating System Sınırı

### A. METRIX katmanında olması gerekenler (mevcut durumda gerçekten bu katmanda olanlar)
- Kimlik: `src/lib/ai/identity/executive-identity-prompt.ts` — tek tanım, doğru.
- Muhakeme/son cevap: `createOpenAiStream` üzerinden OpenAI modeli — doğru, tek nokta (text + voice blocking pipeline).
- Kullanıcıya söylenecek dil: `sanitizeExecutiveManagerResponse` sonrası `aiContent` — doğru.

### B. Executive Operating System katmanında olması gerekenler (mevcut durumda gerçekten bu katmanda olanlar)
- Veri erişimi: `buildExecutiveOperatingContext`, `listActiveMemoryItemsByOrganization` — doğru.
- Kayıt işlemleri: `src/lib/action-runtime/` (execution-runtime, policy-engine, handlers) — doğru, hiç metin üretmiyor.
- Sınıflandırma/yönlendirme: `conversation-understanding/*` — doğru, EOS'ta ve sadece flag üretiyor.
- Entegrasyon: `retrieveGmailContext` — doğru katmanda ama kritik yolda (Bölüm 6).
- Hafıza depolama: `src/lib/memory/*` — çoğunlukla doğru, otomatik-onay istisnası var (Bölüm 4).

### C. Yanlış veya belirsiz katmandaki mevcut servisler
1. **`detectExecutiveGap`/`getGapSafeFallback`** — EOS katmanında konumlanmış ama fiilen METRIX'in yerine "hangi soruyu soracağım" kararını veriyor ve kullanıcıya doğrudan konuşuyor (`route.ts:502-544`). Bu, Madde 3'ün yasakladığı "servis METRIX adına bağımsız dil oluşturamaz" durumunun tam örneği.
2. **`completeExecutiveAction` / `applyCollectionActionLifecycle` / `applyQuoteWorkflowLifecycle`** — EOS'ta konumlanmış "execution" servisleri olarak tasarlanmış görünüyor, ama girdileri (`detectExecutiveActionOutcomeSignals` vb.) ham kullanıcı mesajını yorumlayıp bir **iş kararı** (aksiyon tamamlandı mı, teklif kazanıldı mı) veriyor — bu yorumlama işi METRIX'in muhakemesinden geçmeli, EOS'un anahtar-kelime kararı olmamalı.
3. **`resolveProviderName`'in sessiz mock fallback'i** — bu bir config/routing fonksiyonu olarak EOS'ta, ama etkisi METRIX'in tüm kimliğinin yerine geçmek (config hatasında).
4. **`voice/ack/route.ts`** — EOS'ta bir "gecikme azaltma" yardımcı servisi olarak tasarlanmış, ama fiilen kullanıcıya konuşan (LLM üretimli) bir bileşen; METRIX'in "ilk cümlesi" ile yarışıyor.
5. **Pipeline A (`executive-brain`) text'te "shadow" modda donmuş** — EOS'ta konumlanmış doğru, ama tasarım amacı (Genel Müdür'ün derin değerlendirmesi) hiçbir zaman METRIX'e geri dönmediği için EOS'ta "ölü ağırlık" haline gelmiş; ne EOS'un ne METRIX'in işlevini tam görüyor.

---

## 8. Conversation First Denetimi

- **İlk hızlı cevap gerçekten METRIX tarafından mı üretiliyor?** Text'te evet — `immediate`/`conversational_minimal`/`business_light` profillerinde ilk token doğrudan `createOpenAiStream`'den gelir, ara sabit cümle yok (`ai-gateway.ts:548-552`). Voice'ta ise `ack` route'u (gpt-4o-mini, ayrı model) ile yarışıyor; kazanırsa ilk duyulan cümle METRIX'in ana modelinden değildir.
- **Sabit acknowledgement mi?** Text'te hayır. Voice'ta `ack` içeriği LLM üretimli ama METRIX'in ana kimlik/bağlam derinliğini taşımıyor (ayrı, minimal sistem promptu — `voice/ack/route.ts:39-42`).
- **İlk cevap ile son değerlendirme arasında aynı kimlik/muhakeme sürekliliği var mı?** Kısmen. Aynı `EXECUTIVE_PRESENCE_POLICY` kullanılıyor (kimlik sürekli), ama **muhakeme** sürekli değil: text'te pipeline A/C ("derin" executive-brain/intelligence) o turun cevabına hiç girmiyor, sadece loglanıyor — yani "ilk cümle" ile "derin değerlendirme" arasında gerçek bir devamlılık yok, çünkü derin değerlendirme o turun cevabını hiç etkilemiyor.
- **İlk cümle mevcut bağlamı gerçekten biliyor mu?** `business_light`/`full_context` profillerinde evet (memory context, org summary yükleniyor); `immediate_minimal`/`conversational_minimal`'da hafıza boş obje ile başlıyor (`ai-gateway.ts:449-463`) — bu profillerde ilk cümle bağlamı bilmiyor, ama bu profiller zaten trivial/genel-sohbet mesajları için seçiliyor (fast-path whitelist), o yüzden pratik risk düşük.
- **Boş/kandırıcı zaman kazanma riski?** Text'te hayır (gerçek LLM). Voice'ta `ack` cümlesi tanım gereği "karar verme, analiz yapma, cevaplama" yasaklı bir dolgu — bu iyi tasarlanmış ama METRIX'in kendisi değil.
- **Derin bağlam geldiğinde METRIX ifadesini geliştirebiliyor mu?** Text'te **hayır** — pipeline A/C sonucu (`cognitionObservation`) yalnızca mesaj metadata'sına yazılıyor (`route.ts:913-922`), akan cevabı asla güncellemiyor veya sonraki cümleye eklenmiyor içinde aynı turda. Bir sonraki KULLANICI mesajında `previousConversationState`/`activeMemoryItems` üzerinden dolaylı olarak etkili olabilir, ama bu "aynı turda geliştirme" değil, "bir sonraki turda örtük etki."
- **Aynı mesaj için birden fazla bağımsız otorite cevap üretiyor mu?** Evet, potansiyel olarak: gap-intercept (deterministik şablon) VEYA mock-fallback (deterministik şablon) VEYA gerçek LLM — hangisinin devreye gireceği koşullara bağlı, ama üçü de aynı "AI mesajı" alanına yazılıyor, kullanıcı ayrımı göremiyor.

**Sonuç sınıfı: Teknik fast-path var fakat anayasal olarak uyumsuz.** Text kanalındaki hız mekanizması (readiness/fast-path/contextProfile) doğru tasarlanmış ve gerçekten METRIX'in kendisini kullanıyor; ama (a) gap-intercept ve mock-fallback gibi gerçek bypass'lar hâlâ var, (b) "derin verinin METRIX'e geri dönüp ifadeyi geliştirmesi" ilkesi text'te fiilen uygulanmıyor (yalnızca loglanıyor).

---

## 9. Yazılı ve Sesli Mimari Karşılaştırması

| Alan | Yazılı sohbet | Sesli sohbet | Ortak mı? | Anayasal risk |
|---|---|---|---|---|
| Kimlik | `EXECUTIVE_PRESENCE_POLICY` + `buildExecutivePresenceSurfacePolicy({surface:"chat"})` | Aynı fonksiyonlar, `surface:"realtime_voice"`/`"voice"` | **Evet** (doğrulandı, aynı dosya/fonksiyon çağrıları) | Düşük |
| System prompt üretimi | `renderPromptTemplate` → `streamWithAiGateway` | Fast-path: `voice-fast-response.service.ts` (ayrı, `buildExecutiveIdentityPrompt` doğrudan çağırıyor); Fallback: aynı `streamWithAiGateway` | **Kısmen** — iki farklı kod yolu, aynı kimlik fonksiyonlarını çağırıyor ama farklı context derinliğiyle | Orta |
| Context assembly | Tam (`full_context`) veya hafif (`business_light` vb.) | Fast-path: hafif (org summary + 8 memory satırı); Fallback: `full_context` (text ile aynı) | Kısmen | Orta |
| Memory | `listActiveMemoryItemsByOrganization` + `buildMemoryContextFromItems` | Aynı fonksiyonlar (fast-path'te sınırlı sayıda satır) | Evet (fonksiyon düzeyinde) | Düşük |
| Executive cognition (pipeline A/C) | **Yalnızca stream sonrası (shadow)** | **Pre-stream, canlı prompt'a giriyor** (`route.ts:569-591`) | **Hayır** | **Yüksek — Bölüm 4'te P1 olarak işaretlendi** |
| Tool authority | `action-runtime` üzerinden, kanal farkı yok | Aynı | Evet | Düşük |
| Action execution | `route.ts:850-905` (post-`done`) | Aynı kod yolu (`channel` ayrımı yok bu blokta) | Evet | (P0, Bölüm 4'te ayrıca ele alındı) |
| Confirmation | Yok (Bölüm 4) | Yok | Evet (ikisi de eksik) | P0 (paylaşılan) |
| Persistence | `sendUserMessage`/`sendAiMessage`, aynı tablo | Aynı | Evet | Düşük |
| Learning | Post-stream (deferred) | Fast-path'te de öncesinde prefetch edilebiliyor (`route.ts:292-294`) ama voice blocking pipeline'da pre-stream await ediliyor (`route.ts:580`) | Kısmen | Düşük-orta |
| Response generation | `createOpenAiStream` (OpenAI Responses/Chat API üzerinden `openai-provider.ts`) | Fast-path: `voice-fast-response.service.ts` (ayrı OpenAI çağrısı) VEYA fallback'te aynı `createOpenAiStream` | Kısmen | Orta — iki farklı üretim yolu var |
| Safety/approval | Yok | Yok | Evet (ikisi de eksik) | P0 (paylaşılan) |
| Retry/fallback | `repairAiContent` (ikinci LLM çağrısı), mock-provider fallback | Aynı `sanitizeExecutiveManagerResponse` kullanılıyor (voice-v4-orchestrator.ts:362-439) | Kısmen (aynı sanitizasyon fonksiyonu, farklı çağrı yeri) | Düşük |
| Session continuity | `conversationId` ile | Aynı + `detectConversationContinuity` (voice-özel, barge-in senaryoları için) | Kısmen | Düşük |

**Not:** "Ortak helper kullanıyor" tek başına yeterli kanıt sayılmadı — yukarıdaki her satır gerçek çağrı zinciriyle (dosya:satır) doğrulandı; "executive cognition" ve "response generation" satırlarında gerçek ayrışma tespit edildi, sadece isim benzerliği değil.

---

## 10. Ölçeklenebilirlik Değerlendirmesi

| Boyut | Mevcut durum | Kanıt | Uzun vadeli risk | Anayasal etki |
|---|---|---|---|---|
| Tek otorite bütünlüğü | Kimlik tek, ama 3 gerçek bypass yolu var (Bölüm 4) | `route.ts:492-565`, `ai-gateway.ts:405-417`, `route.ts:850-905` | Yeni özellik eklendikçe bypass sayısı artabilir (her yeni "hızlı yol" potansiyel yeni bypass) | Madde 2/3 riski büyür |
| Yeni modül ekleme | 44 farklı `executive-*` üst modül zaten var | `ls src/lib \| grep -c "^executive-"` = 44 | Modül sayısı arttıkça hangi modülün "canlı prompt'a giren" hangisinin "shadow" olduğu takip edilemez hale gelebilir (bkz. pipeline A/B/C karışıklığı) | Madde 3 (yetki dağınıklığı) riski |
| Yeni tool ekleme | `action-runtime/registry/manifests/*.actions.ts` merkezi ve policy-driven | `registry/manifests/customers.actions.ts` | Mimari olarak ölçeklenebilir (doğru desen) | Düşük risk |
| Yeni veri kaynağı ekleme | `buildExecutiveOperatingContext` her yeni context'i senkron `Promise.all`'a ekliyor gibi görünüyor | `executive-operating-context-builder.service.ts:88-131` | Her yeni context kaynağı `full_context` profilinin ilk-token gecikmesini büyütebilir (Bölüm 6) | Madde 5 riski büyür |
| Çoklu şirket/organization | Spot-check'te tüm sorgular `organizationId` ile scope'lanmış (4/44 modül örneklendi) | `executive-decision-record.repository.ts:76`, `goal-achievement-analyzer.service.ts:38` | Dar örnekleme — kapsamlı değil | Doğrulanamadı (tam kapsam) |
| Çoklu kullanıcı | Rate limit kullanıcı bazlı (`actorUserId`) | `route.ts:138-153` | Orta | Düşük risk |
| Uzun dönem hafıza | Aday→onay akışı var ama otomatik-onay istisnası mevcut | `candidate-engine.service.ts:200-322` | Otomatik onaylanan yanlış "öğrenilmiş" bilgi zamanla birikebilir | Madde 5/6 riski |
| Yüksek eşzamanlı kullanım | Bellek-içi approval store + bellek-içi audit store, süreç yeniden başlarsa/instance değişirse veri kaybı riski | `action-runtime/policy/approval-store.ts:17-36`, `audit/audit-store.ts` | Serverless/çoklu-instance dağıtımda ciddi güvenilirlik riski | Madde 6 riski |
| Voice ve text tutarlılığı | Bölüm 9'da detaylı — kısmen ayrışık | — | Kimlik aynı kalsa da muhakeme derinliği farklılaşabilir | Madde 2 riski |
| Güvenli işlem onayı | Yalnızca 2 aksiyon için EXPLICIT onay, geri kalanı NONE | `customers.actions.ts:22,41,57,71` | Yeni riskli aksiyonlar eklenirken varsayılan "NONE" unutulabilir | Madde 6 riski |
| Gözlemlenebilirlik | Yalnızca console log, harici APM yok | `request-profiler.ts:40-56` | Üretim regresyonları geç fark edilir; bu denetimin "kanıtlanamadı" bölümünün çoğu buradan kaynaklanıyor | Doğrudan anayasal değil ama operasyonel risk |
| Hata izolasyonu | Çoğu deferred/background iş `.catch()` ile yutuluyor (`route.ts:300,442,481-485` vb.) | `route.ts` genelinde | İyi (kritik yolu korur) ama sessiz hata birikimi riski (loglanıyor, alarm yok) | Düşük-orta |
| Background işlerin yönetimi | Ad-hoc `Promise` zincirleri (queue/worker altyapısı yok) | `route.ts:448-487,652-714` | Yük arttıkça her request kendi background promise'lerini taşıyor, merkezi kuyruk yok | Ölçeklenebilirlik riski |
| Model sağlayıcısı bağımlılığı | Tek sağlayıcı soyutlaması var (`getAiProvider`) ama mock fallback riskli (Bölüm 4) | `provider-registry.ts` (dolaylı), `ai-gateway.ts:405-417` | Sağlayıcı değişimi mimari olarak mümkün, ama config hatası toleransı düşük | Madde 1 riski |
| Prompt büyümesi | `full_context` profili çok sayıda bölüm ekliyor (memory, quote, payment, executiveManagerContext, gmail, vb.) | `prompt-format.ts` genelinde | Token maliyeti ve gecikme büyüyebilir; test edilmedi | Doğrulanamadı |
| Karar mantığının dağılması | 44 modül, en az 2 isim çakışması | Bölüm 4/7 | Yüksek — yeni geliştirici hangi modülün "gerçek" karar motoru olduğunu ayırt edemeyebilir | Madde 2/3 riski |

---

## 11. Kök Nedenler

### Kök Neden 1 — "Hızlı yol / derin yol" ikili tasarımı, ara katman yok
1. **Tanım:** `contextProfile` seçimi yalnızca iki uç sunuyor: minimal (fast) veya full_context (tüm executive zinciri senkron). Kademeli/artımlı bir "başla, sonra derinleş" modeli yok.
2. **Kanıt zinciri:** `conversation-runtime-profile.ts:17-27` (kategori→profil eşlemesi) → `ai-gateway.ts:444-574` (fast dal) vs `ai-gateway.ts:576-812` (full dal, 9+6 adım).
3. **Etkilediği akışlar:** Text'te executive_analysis/action_execution kategorisine düşen her mesaj; voice'ta fast-path başarısız olduğunda blocking pipeline.
4. **İhlal ettiği ilke:** Madde 5 ("hız ve derinlik birlikte sağlanmalı").
5. **İlişkili semptomlar:** Bölüm 6'daki adım 8-12 gecikme riski, bu kök nedenin doğrudan sonucu.

### Kök Neden 2 — "Shadow" modun kalıcı hale gelmesi (pipeline A/C text'te asla METRIX'e dönmüyor)
1. **Tanım:** "Conversation First" (94046f9) yalnızca pipeline A/C'yi stream sonrasına erteledi, ama onları o turun cevabına geri besleyecek bir mekanizma eklemedi — sonuç, "derin muhakeme" kalıcı olarak yalnızca log/metadata.
2. **Kanıt zinciri:** `route.ts:566-591` (text'te `voiceCognition=null`) → `route.ts:652-714` (`startPostStreamIntelligence`, `done` sonrası) → `route.ts:913-922` (`cognitionObservation` yalnız metadata'ya yazılıyor).
3. **Etkilediği akışlar:** Tüm text sohbetleri, `requiresExecutiveReasoning=true` olduğunda.
4. **İhlal ettiği ilke:** Madde 5 ("Derin bağlam geldiğinde METRIX önceki ifadesini doğal biçimde geliştirebilmeli").
5. **İlişkili semptomlar:** Bölüm 8'deki "Conversation First yapısal olarak eksik" bulgusu.

### Kök Neden 3 — Executive Operating System'e "yorumlama" yetkisi sızmış
1. **Tanım:** Bazı EOS servisleri (gap-detector, outcome-signal detektörleri) yalnızca veri işlemekle kalmayıp, ham kullanıcı mesajını yorumlayıp karar/dil üretiyor — bu METRIX'in görevi.
2. **Kanıt zinciri:** `executive-gap-detector.service.ts:76-89` (soru seçimi) → `route.ts:502-544` (doğrudan kullanıcıya); `executive-action-outcome-capture.service.ts` (güven skoru) → `route.ts:889` → `executive-action-engine.service.ts:76-84` (DB yazımı).
3. **Etkilediği akışlar:** Goal/decision soruları (gap) ve açık aksiyon/teklif/tahsilat içeren tüm sohbetler.
4. **İhlal ettiği ilke:** Madde 3 ("servisler METRIX adına bağımsız dil oluşturamaz, karar veremez").
5. **İlişkili semptomlar:** Bölüm 4'teki üç P0 bulgusunun ikisi bu kök nedenden geliyor.

### Kök Neden 4 — Konfigürasyon hataları için "sessiz METRIX-yerine-geçme" güvenlik ağı yok
1. **Tanım:** `AI_PROVIDER` yanlış ayarlandığında sistem hatayı yükseltmek yerine sessizce mock'a düşüyor — "fail loud" değil "fail silent as METRIX."
2. **Kanıt zinciri:** `resolveProviderName` (`ai-gateway.ts:405-417`) → `mock-provider.ts` şablonları.
3. **Etkilediği akışlar:** Potansiyel olarak TÜM üretim trafiği (env yanlış ayarlanırsa).
4. **İhlal ettiği ilke:** Madde 1 (METRIX = gerçek muhakeme, form doldurma değil).
5. **İlişkili semptomlar:** Bu, Bölüm 14'te "kanıtlanamadı" olarak işaretlenen bir üretim ortam değişkeni sorusuyla doğrudan bağlantılı — repo'dan `AI_PROVIDER`'ın üretimde ne olduğu doğrulanamaz.

---

## 12. Nihai Hedef Mimari

### 12.1 Hedef bileşenler

| Bileşen | Tek sorumluluk | Girdi | Çıktı | Katman | Kullanıcıyla konuşabilir mi |
|---|---|---|---|---|---|
| METRIX Core Reasoner | Muhakeme, kanaat, son cevap | Kullanıcı mesajı + EOS bağlamı | Akan doğal dil | METRIX | Evet — tek konuşan |
| Conversation Router | Mesaj karmaşıklığını sınıflandır | Mesaj | `contextProfile`/derinlik seviyesi | EOS | Hayır |
| Context Assembler | Tüm executive-* veri kaynaklarını tek çağrıda topla | org/conversation id | Yapılandırılmış context paketi | EOS | Hayır |
| Progressive Enrichment Feed | İlk token sonrası derin analiz sonuçlarını METRIX'e (aynı turda) geri besle | Pipeline A/C çıktısı | METRIX'in cümlesini genişletme/düzeltme fırsatı | EOS→METRIX köprüsü | Hayır (yalnız METRIX'e veri verir) |
| Action Execution Runtime | Kayıt oku/yaz, policy/approval uygula | METRIX'in onayladığı komut | `ExecutionResult` | EOS | Hayır |
| Confirmation Gate | Riskli/geri döndürülemez her yazımdan önce METRIX'in ürettiği onay cümlesini bekle | Aksiyon isteği + risk seviyesi | Onay/red | EOS (METRIX'in ürettiği dille) | Hayır (dili METRIX üretir, gate yalnızca uygular) |
| Identity/Prompt Renderer | Tek kimlik tanımını her surface'e uygula | Surface + context | System prompt | EOS→METRIX köprüsü | Hayır |
| Voice Transport | STT/VAD/TTS mekaniği | Ses | Metin/ses | EOS | Hayır (ack dahil — dolgu bile METRIX'in üreteceği kısa bir cümle olmalı, ayrı model değil) |

### 12.2 Hedef yazılı sohbet akışı
1. Mesaj gelir, EOS Router deterministik olarak karmaşıklık seviyesini belirler (mevcut fast-path/readiness mantığı korunur — bu kısım zaten doğru).
2. Context Assembler, seviyeye göre gerekli minimum context'i toplar (hafıza + son tur) — ağır executive-* hesaplamaları BAŞLATILIR ama beklenmez.
3. METRIX, elindeki context ile hemen akmaya başlar (<1sn).
4. Ağır hesaplamalar (pipeline A/B/C) arka planda biter; sonuçları **aynı turun** ikinci/üçüncü cümlesine (stream hâlâ açıkken) enjekte edilecek şekilde METRIX'e geri döner — bugünkü gibi yalnızca "sonraki tur metadata"sı olarak kalmaz.
5. METRIX'in ürettiği nihai metin sanitize edilir (mevcut `sanitizeExecutiveManagerResponse` deseni korunur).
6. Riskli bir aksiyon METRIX'in cümlesinde geçiyorsa, Confirmation Gate devreye girer — METRIX kullanıcıdan açıkça onay ister, EOS onay gelmeden yazmaz.
7. Persistence + capture + memory-candidate + lifecycle side-effect'leri arka planda çalışır (mevcut deferred desen korunur, ama "gap-intercept" ve "mock fallback" gibi METRIX'i atlayan yollar kaldırılır).

### 12.3 Hedef sesli sohbet akışı
1. Mikrofon → aynı Router/Context Assembler (text ile ortak).
2. İlk sözlü tepki, ayrı bir "ack" modeli değil, METRIX'in kendisinin ürettiği ilk cümledir (düşük context ile hızlı başlatılmış METRIX akışı) — text'teki `immediate`/`conversational_minimal` deseniyle birebir aynı mekanizma.
3. STT/VAD/turn-detection mekanik katmanda kalır (mevcut OpenAI Realtime kullanımı korunabilir).
4. TTS, METRIX'in akan metnini cümle cümle sesle — mevcut mimari zaten bunu yapıyor, korunur.
5. Derin executive bağlam (pipeline A/B/C), text'teki gibi progressive enrichment ile aynı turda METRIX'e geri döner — voice'a özel "yalnız voice pre-stream alır" istisnası kaldırılır, iki kanal aynı zenginleştirme sözleşmesini paylaşır.

### 12.4 Hedef işlem uygulama akışı
1. METRIX, konuşma sırasında bir aksiyon ihtiyacı tespit eder (kendi muhakemesiyle, keyword-confidence servisleriyle değil).
2. METRIX kullanıcıya ne yapacağını doğal dille söyler; riskliyse açıkça onay ister.
3. Onay alındıktan sonra (veya düşük riskli aksiyonlarda METRIX'in kararıyla) Action Execution Runtime çağrılır.
4. Runtime, policy/approval/idempotency kontrolünden geçirir (mevcut `action-runtime` deseni zaten doğru — korunur).
5. Sonuç METRIX'e döner, METRIX sonucu kullanıcıya kendi cümleleriyle bildirir.
6. Outcome-signal detektörleri (bugünkü gibi) veriyi TOPLAYABİLİR ama otomatik DB yazımı yapmaz — bunun yerine "METRIX'e öneri" olarak sunulur, METRIX bir sonraki cevabında bunu teyit eder veya sorar.

### 12.5 Mevcut mimariden hedef mimariye geçiş prensipleri
- Gap-intercept ve mock-fallback bypass yollarının **her ikisi de** METRIX'in LLM çağrısını atlamayı bırakmalı; gap-intercept'in ürettiği "kritik soru" bir servis kararı değil, METRIX'e bir **talimat/ipucu** olarak verilmeli (mevcut `manager-advice` deseninin zaten doğru yaptığı gibi — Bölüm 3).
- Mock-provider fallback yalnızca **açık geliştirme/test modunda** ve kullanıcıya görünür bir işaretle kalmalı; üretimde config hatası sessiz mock'a düşmek yerine hata fırlatmalı.
- Outcome-signal → otomatik DB yazımı yapan üç servis, "otomatik uygula" yetkisini kaybetmeli; çıktıları METRIX'in bir sonraki cevabını bilgilendiren **öneri** haline gelmeli, doğrudan yazım yetkisi Confirmation Gate'e taşınmalı.
- Pipeline A (`executive-brain`) ve pipeline C (`chat-executive-intelligence`) için text kanalında bir **geri besleme sözleşmesi** tanımlanmalı — bugünkü "yalnız log" rolünden çıkıp, ya aynı turda (streaming ortasında ek context enjeksiyonu) ya da en azından "az sonra devam ediyorum" tarzı METRIX'in kendi diliyle ifade ettiği bir devam mekanizmasına taşınmalı.
- Voice `ack` route'u, ayrı bir model olmaktan çıkıp METRIX'in kendi "hızlı başlangıç" moduna (text'teki `immediate` profili gibi) taşınmalı — iki ayrı model kimliği tek konuşana indirgenmeli.
- İki "decision engine" modülü (`executive-brain/` ve `executive-decision-engine/`) isim çakışması netleştirilmeli — hangisinin canlı prompt'a girdiği, hangisinin gölge olduğu modül isminden anlaşılır olmalı (yeniden adlandırma bir sonraki fazın konusu, bu denetimde yalnızca tespit edilmiştir).
- Approval store kalıcı bir veri katmanına taşınmalı ve kapsamı yalnızca 2 aksiyonla sınırlı kalmamalı — risk seviyesi taşıyan her aksiyon (özellikle quote/collection/executive-action durum değişiklikleri) bu gate'ten geçmeli.
- Harici bir gözlemlenebilirlik/APM aracı entegre edilmeli ki Bölüm 6/14'teki "statik incelemeyle kanıtlanamadı" boşlukları üretim verisiyle doldurulabilsin.

---

## 13. Kanıt Dizini

| Dosya | İncelenen sorumluluk | Aktif call-site kanıtı | Anayasal önemi |
|---|---|---|---|
| `src/app/api/ai/chat/route.ts` | Ana yazılı+sesli sohbet giriş noktası, orkestrasyon | `POST()`, doğrudan üretim route'u | Kritik |
| `src/lib/ai/gateway/ai-gateway.ts` | Prompt/context/stream orkestrasyonu | `streamWithAiGateway`, `route.ts:602`den çağrılıyor | Kritik |
| `src/lib/conversation-understanding/text-response-readiness.ts` | Deterministik readiness sınıflandırması | `route.ts:197` | Yüksek |
| `src/lib/conversation-understanding/conversation-fast-path.ts` | Deterministik fast-path whitelist | `route.ts:217` | Yüksek |
| `src/lib/conversation-understanding/conversation-runtime-profile.ts` | `contextProfile` seçimi | `route.ts:229` | Yüksek |
| `src/lib/conversation-understanding/conversation-understanding.service.ts` | Voice LLM sınıflandırıcı (gpt-4.1-mini) | `route.ts:241` (`classifyConversation`) | Orta |
| `src/lib/manager-advice/executive-gap-detector.service.ts` | Gap-intercept şablon seçimi (P0 bypass) | `route.ts:492-565` | **Kritik (ihlal)** |
| `src/lib/manager-advice/manager-advice-composer.service.ts` | Manager advice şablon üretimi (uyumlu) | `route.ts:339,806` | Orta |
| `src/lib/ai/executive-presence-layer.ts` | Response sanitization | `route.ts:1114,1163` | Yüksek |
| `src/lib/ai/identity/executive-identity-prompt.ts` | Tek kimlik + fallback şablonları | `route.ts:72,1189`, `voice/session/route.ts` | Kritik |
| `src/lib/ai/living-executive-presence/` | Yaşayan davranış prompt katmanı | `route.ts:74-80` | Yüksek |
| `src/lib/ai/prompts/prompt-renderer.ts` / `prompt-format.ts` | Sistem promptu render | `ai-gateway.ts:325,502,776` | Kritik |
| `src/lib/ai/providers/mock-provider.ts` | Sessiz mock fallback şablonları (P0 bypass) | `ai-gateway.ts:405-417,830-845` | **Kritik (ihlal)** |
| `src/lib/executive-brain/*.ts` (context-builder, assessment, council, strategic-profile, decision-engine, brief) | Pipeline A — text'te shadow-only | `route.ts:1286-1348` (`buildExecutiveBrainShadowMetadata`) | Yüksek |
| `src/lib/executive-decision-engine/executive-decision-engine.service.ts` | Pipeline B decision result (canlı prompt) | `ai-gateway.ts:233,682` | Kritik |
| `src/lib/executive-delegation`, `executive-responsibility-matrix`, `executive-performance-signal`, `executive-management-review` | Pipeline B — canlı prompt zinciri | `ai-gateway.ts:238-271` | Kritik |
| `src/lib/executive-prompt-bridge` | `executiveManagerContext` üretimi | `ai-gateway.ts:281,731` | Kritik |
| `src/lib/ai/chat-executive-intelligence.adapter.ts` | Pipeline C — text'te shadow-only | `route.ts:96-98,573,670` | Yüksek |
| `src/lib/executive-operating-context/executive-operating-context-builder.service.ts` | Ana context assembly (9 adım) | `ai-gateway.ts:139,577` | Kritik |
| `src/lib/executive-request-resolution/` | Shadow resolver (gerçekten gölge) | `route.ts:126,323,361-367` | Düşük |
| `src/lib/action-runtime/**` | Kayıt yazma/policy/approval mekanik katmanı | `execution-runtime.ts`, `registry/manifests/*` | Kritik |
| `src/lib/universal-capture/orchestrator.ts` | LLM planlı alan çıkarımı, yazmıyor | `route.ts:452` | Yüksek |
| `src/lib/core/executive-actions/executive-action-engine.service.ts` | Onaysız otomatik aksiyon kapama (P0) | `route.ts:889` | **Kritik (ihlal)** |
| `src/lib/core/collection-actions/collection-action-lifecycle-applier.ts` | Onaysız otomatik durum yazımı (P0) | `route.ts:855` | **Kritik (ihlal)** |
| `src/lib/core/quotes/quote-workflow-lifecycle-applier.ts` | Onaysız otomatik durum yazımı (P0) | `route.ts:865` | **Kritik (ihlal)** |
| `src/app/api/executive/approvals/route.ts` + `[approvalId]/decision/route.ts` | Onay envelope API (dar kapsam, kalıcı değil) | `approval-decision-service.ts` | Orta |
| `src/app/api/ai/chat/voice/session/route.ts` | OpenAI Realtime session + kimlik enjeksiyonu | Gerçek üretim route'u | Kritik |
| `src/app/api/ai/chat/voice/ack/route.ts` | Ayrı LLM dolgu cümlesi (P1 risk) | `useVoiceExperienceOrchestrator.ts:391-396` | Yüksek |
| `src/app/api/ai/chat/voice/tts/route.ts` | TTS, cümle bazlı streaming | `useVoiceTtsQueue.ts:260` | Orta |
| `src/app/api/ai/chat/voice-v4-orchestrator.ts` | Voice fast-path, ayrı üretim yolu | `route.ts:115,309` | Kritik |
| `src/lib/ai/voice-fast-response.service.ts` | Voice fast-path'in doğrudan OpenAI çağrısı | `voice-v4-orchestrator.ts` | Yüksek |
| `src/lib/memory/candidate-engine.service.ts` | Hafıza aday/onay/otomatik-aktivasyon | `route.ts:458,469`; `activateOnboardingMemoryCandidates` | Orta |
| `src/app/api/memory-candidates/[candidateId]/approve/route.ts` | İnsan onay gate'i (kısmi) | Gerçek üretim route'u | Orta |
| `src/lib/ai/performance/request-profiler.ts` | Tek telemetri mekanizması (console-only) | `route.ts:160`, `ai-gateway.ts` genelinde | Düşük-orta |
| `.github/workflows/daily-briefing.yml` + `src/app/api/briefing/generate/route.ts` | Cron tetikleyici (GitHub Actions) | Workflow dosyası + route auth kontrolü | Düşük |
| `src/lib/executive-runtime-adapters/` | Kasıtlı adapter-registry deseni | `contracts.ts`, `executive-runtime-adapter-registry.ts` | Orta |

---

## 14. Açık Sorular ve Kanıtlanamayan Noktalar

- **`AI_PROVIDER` ortam değişkeninin üretimde gerçek değeri** — repo'da yalnızca kod mantığı görülebilir (`ai-gateway.ts:405-417`); Vercel/production env değerleri bu denetimde erişilemedi. Kök Neden 4'ün gerçek üretim riski taşıyıp taşımadığı bu bilgiye bağlı.
- **8-12 numaralı Critical Path adımlarının (Bölüm 6) gerçek milisaniye maliyeti** — statik kod incelemesiyle kanıtlanamaz; üretim APM/telemetri verisi gerekir, repo'da böyle bir araç bulunamadı (Bölüm 10).
- **Onay (approval) store'unun üretim dağıtım modeli** — Next.js uygulamasının serverless (Vercel Functions, her istekte state kaybı) mi yoksa uzun-ömürlü process (persistent memory) olarak mı çalıştığı bu denetimde doğrulanamadı; bu, bellek-içi `Map` tabanlı approval/audit store'un (Bölüm 4, 10) gerçek üretim etkisini belirler.
- **`BRIEFING_CRON_SECRET`/`CRON_SECRET` üretimde tanımlı mı** — `route.ts:27-36`'daki `isAuthorized` mantığı `NODE_ENV !== "production"` iken açık davranıyor; üretim `NODE_ENV` değeri ve secret'ın gerçekten set edilip edilmediği bu denetimde doğrulanamadı.
- **Multi-organization izolasyonunun tam kapsamı** — yalnızca 4/44 executive-* modülü örneklendi (Bölüm 10); kalan 40 modülün tamamı taranmadı, bu nedenle "hiçbir unscoped sorgu yok" iddiası kapsamlı değil, yalnızca örneklenen dosyalar için doğrulanmıştır.
- **Prompt büyüklüğü/token maliyeti** — `full_context` profilinin gerçek token sayısı ölçülmedi (yalnızca hangi bölümlerin eklendiği kanıtlandı, Bölüm 10).
- **Voice native-realtime flag'in (`isVoiceNativeRealtimeEnabled`) üretimde açık olup olmadığı** — kod varsayılanı kapalı (`voice-native-realtime-flag.ts:8`), ama üretim ortam değişkeni değeri bu denetimde doğrulanamadı; açıksa HTTP text pipeline'ı (bu raporun 2.2 bölümünde anlatılan akış) tamamen atlanıp tam ses-ses model konuşması devreye girer — bu, raporun voice bulgularının bir kısmını geçersiz kılabilir.
- **`executive-daily-briefing-v2` modülünün tam çağrı zinciri** — `daily-briefing-orchestrator.service.ts` içinde tüketildiği öngörülüyor ama tam olarak doğrulanmadı (Bölüm 10, agent notu).

---

## Sonuç Kuralı

1. **Bugünkü production sistemi gerçekten tek bir METRIX mi çalıştırıyor?** Kısmen. Ana muhakeme ve kimlik tek (`EXECUTIVE_PRESENCE_POLICY` + tek LLM akışı), ama en az üç kanıtlanmış yol (gap-intercept, mock-provider sessiz fallback, onaysız otomatik kayıt-durumu değiştirme servisleri) METRIX'i atlayarak kullanıcıya "METRIX'in cevabı" gibi sunulan içerik/etki üretiyor.
2. **Kullanıcı mesajından sonra ilk cevap başlamadan önce hangi işlemler zorunlu olarak bekleniyor?** Auth, rate-limit, readiness/fast-path/runtime-profile sınıflandırması (deterministik), conversation resolve + memory fetch (paralel), gap detection, son mesaj okuma; `full_context` profilinde ek olarak 9 adımlı operating-context build + 6 executive-* builder + prompt-bridge + Gmail context çağrısı (Bölüm 6).
3. **METRIX dışında fiilî karar veya kanaat üreten bileşenler hangileri?** `detectExecutiveGap`/`getGapSafeFallback` (soru seçimi), `resolveProviderName`'in mock fallback'i (tüm cevap), `completeExecutiveAction`/`applyCollectionActionLifecycle`/`applyQuoteWorkflowLifecycle` (iş durumu kararları) — Bölüm 5.
4. **Yazılı ve sesli sohbet aynı Genel Müdür zihnini mi kullanıyor?** Kimlik katmanında evet; muhakeme derinliği ve üretim yolunda hayır — voice fast-path ayrı bir kod yolu (`voice-fast-response.service.ts`) kullanıyor ve yalnızca voice, pipeline A'nın "Yönetim kanaati" bloğunu canlı prompt'a alıyor (Bölüm 9).
5. **Conversation First mevcut haliyle anayasaya uygun mu?** Teknik fast-path var fakat anayasal olarak uyumsuz — hız mekanizması gerçek METRIX çıktısını kullanıyor (doğru), ama "derin veri METRIX'e geri dönüp ifadeyi geliştirir" ilkesi text kanalında fiilen çalışmıyor; derin muhakeme kalıcı olarak yalnızca log/metadata (Bölüm 8).
6. **En kritik üç mimari kök neden nedir?** (1) Hızlı/derin ikili tasarım, ara kademe yok (Kök Neden 1); (2) "Shadow" modun kalıcı hale gelmesi — pipeline A/C text'te asla METRIX'e geri dönmüyor (Kök Neden 2); (3) EOS'a yorumlama/karar yetkisinin sızması — gap-detector ve outcome-signal servisleri (Kök Neden 3).
7. **Hedef mimariye geçmeden yeni ürün modülleri geliştirmek doğru mu?** Hayır önerilir — 44 executive-* modülün zaten dağınık olduğu (Bölüm 10) ve iki modülün isim çakıştığı (Bölüm 4/13) bir tabana yeni modül eklemek dağınıklığı büyütür; önce Bölüm 12'deki sınır netleştirmeleri (özellikle Confirmation Gate ve progressive-enrichment sözleşmesi) yapılmalı.
8. **İlk olarak ele alınması gereken mimari sınır hangisidir?** Executive Operating System'in "yorumlama/karar" yetkisini geri METRIX'e devretmesi — somut olarak gap-intercept'in ve üç otomatik-yazım servisinin (executive-action/collection-action/quote-workflow) doğrudan kullanıcıya/veritabanına konuşma/yazma yetkisinin kaldırılıp METRIX'in onayından geçirilmesi (Kök Neden 3, Bölüm 4'teki üç P0 bulgusu).

Kesin kanıt bulunamayan her nokta Bölüm 14'te ayrıca listelenmiştir; bu rapor boyunca "kanıtlanamadı" olarak işaretlenmeyen her bulgu, belirtilen dosya:satır referanslarıyla doğrudan doğrulanmıştır.

**Bu görev sonunda hiçbir dosya değişmemiştir** (bkz. rapor başındaki git doğrulaması: HEAD `94046f9`, `git diff --stat` boş, untracked dosya listesi başlangıçla birebir aynı).
