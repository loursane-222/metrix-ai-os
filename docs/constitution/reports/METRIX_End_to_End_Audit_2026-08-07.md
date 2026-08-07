# METRIX Uçtan Uca Denetim — 2026-08-07

HEAD başlangıcı: `89c9f23`  
Referans denetim: `94046f9` (`METRIX_Constitution_Audit_2026-07-25.md`)

## Stage A — Güncel bulgular

| Öncelik | Eski bulgu | Sonuç | Güncel kanıt / değişiklik |
|---|---|---|---|
| P0 | Gap intercept LLM'i atlayıp sabit cevap döndürüyor | **(iii) Geçersiz** | `route.ts:372-401`: `detectExecutiveGap` yalnız `executiveGapSignal` bağlamı üretiyor; route `getGapSafeFallback` çağırmıyor. `dd8f0e2` tek cevap otoritesi düzeltmesi. Ölü `getGapSafeFallback` export'u hâlâ `executive-gap-detector.service.ts:62`'de, fakat canlı çağrısı yok. |
| P0 | Hatalı/boş `AI_PROVIDER` sessizce mock'a düşüyor | **(iii) Geçersiz** | `provider-policy.ts:4-25`: production yalnız açık `openai`; diğer değerler log + `AiProviderConfigurationError`. Mock yalnız test/development. `dd8f0e2`. |
| P0 | Anahtar kelimeyle onaysız lifecycle mutasyonu | **(iii) Geçersiz (chat route açısından)** | `single-authority-source-contract.test.ts:14-16` ve güncel route: `applyCollectionActionLifecycle`, `applyQuoteWorkflowLifecycle`, `completeExecutiveAction` yok. `dd8f0e2`. Bu turda lifecycle servislerine dokunulmadı. |
| P1 | Sabit Türkçe fallback cevapları | **(ii) Kısmen değişmiş, sürüyor** | Ayrı canonical dosyaya taşındı: `executive-fallback-response.ts:20-35`; sebebe göre bounded metin üretmeye devam ediyor. |
| P1 | Voice ACK ikinci LLM sesi | **(iii) Geçersiz** | `src/app/api/ai/chat/voice/ack/route.ts` ve `voice-fast-response.service.ts` `14d058f` ile silindi; voice/text aynı `/api/ai/chat` cevap sahibinde. |
| P1 | Text executive cognition yalnız stream sonrası | **(i) Hâlâ doğru** | `route.ts:934-975`, çağrı `route.ts:1207`: `startPostStreamIntelligence()` done event'inden sonra başlıyor. |
| P1 | `full_context` ilk token öncesi 9+6 senkron builder | **(iii) Geçersiz** | `ai-gateway.ts:377-467`: full path artık canonical projection → prompt render → provider stream; eski operating-context/builder/Gmail zinciri yok. `6c9c37d`. |
| P1 | Yalnız voice canlı promptta “Yönetim kanaati” alıyor | **(iii) Geçersiz** | Voice fast response kaldırıldı (`14d058f`); gateway tek ortak üretim yolunda. Güncel gateway `executiveBrainContext` tüketmiyor. |

### Ek doğrulamalar

- **ExecutiveMindState çakışması: sürüyor.** Kod tipi `src/lib/ai/executive-conversation.types.ts:32-45`, `ExecutiveConversationState.mindState` içinde message metadata ile taşınıyor (`:110-116`). Canonical belge ise konuşmadan bağımsız sürekli runtime tanımlıyor (`executive-cognitive-stack-v1.md:18-23,52-58,142,171`). Öneri: mevcut tipi `ConversationTurnMindState` olarak yeniden adlandır; sürekli yapıyı ileride `ExecutiveMindRuntimeState` adıyla ayrı sahiplik/persistence sözleşmesi olarak aç. Mevcut tipi genişletip iki yaşam döngüsünü birleştirmeme kararı Murat'a aittir.
- **Native realtime: koşulsuz kapalı.** `voice-native-realtime-flag.ts:1-17`; gerekçe yorumda açık: realtime yalnız transport/transcription, canonical cevap sahibi `/api/ai/chat`. Bu yön `14d058f` ile tek otoriteye çevrildi. Çözüm A: realtime WebRTC yalnız STT/VAD/transport; cevap HTTP canonical pipeline + TTS. Çözüm B: yalnız düşük riskli/sosyal intent allowlist'inde realtime içerik üretimi; iş verisi, karar, mutation ve belirsizlikte canonical pipeline'a zorunlu handoff, aynı identity/Behavior Plan ve provenance kontrolü.
- **Belge→müşteri: kod zinciri bağlı ve keşfedilebilir; canlı tarayıcı kabulü tamamlanamadı.** Upload `MetrixChatTab.tsx:73-76,1028-1039,1228-1265`; sohbet komutları extraction/review/apply/commit'e `customer-attachment-conversation-coordinator.ts:14-37` üzerinden bağlı. DB preflight geçti. Attachment + preview + commit servis testleri 71/71 geçti. Yerel Next sunucusu açıldı fakat `/` mevcut çalışma ağacındaki `.next/routes-manifest.json` eksikliğiyle HTTP 500 verdi; gerçek dosya ile canlı upload→commit yapılamadı. Bu nedenle production E2E sonucu **kanıtlanmadı**, yalnız kod/servis entegrasyonu doğrulandı.
- **METRIX_Etkileşim.docx:** repoda bulunamadı.

## Stage B/C — Değişiklikler

| Alan | Dosya | Sonuç |
|---|---|---|
| Yasaklı jenerik ifadeler | `src/lib/ai/identity/executive-identity-prompt.ts` | Blueprint'teki açılışlar ve eşdeğer kapanışlar merkezi identity promptuna eklendi. |
| STANCE | aynı dosya | CALM/DIRECT/FIRM/CURIOUS davranış gerçekleştirme ilkesi eklendi; mevcut `ExecutiveBehaviorPlanV1.interactionPosture` hattı kullanıldı, paralel sistem kurulmadı. |
| Leadership DNA | aynı dosya | 25+ yıl, 60+, karizmatik/olgun/bilge, babacan/anaç; dış danışman yerine şirket-içi sahiplenme ve kanıta bağlı itiraz eklendi. |
| Sözleşme testi | `src/lib/ai/identity/__tests__/executive-identity-prompt.test.ts` | Kimlik, STANCE, yasak açılış/kapanış ve sahiplenme maddeleri kilitlendi. |

### Gerçek model transkripti

Model: `gpt-4.1-mini`; canonical identity prompt + runtime'daki `projectExecutiveConversationGuidance`; temperature `0.2`.

1. **Kullanıcı:** Satışlar son iki aydır düşüyor. Ekibe sert çıkmalı mıyım?  
   **STANCE FIRM — METRIX:** Satışlardaki düşüşün nedenlerini net analiz etmeden ekibe sert çıkmak kabul edilemez. Öncelikle verilerle desteklenen somut sorunları tespit edip, çözüm odaklı yaklaşmalıyız. Sert tutum, motivasyonu daha da düşürebilir; bu riski göze almamalıyız.
2. **Kullanıcı:** En büyük müşterimiz vadeyi 30 günden 90 güne çekmek istiyor; kabul edelim mi?  
   **STANCE PROTECTIVE — METRIX:** Vadeyi 90 güne çekmek nakit akışımızı ciddi zorlayabilir; bu riski göze almadan önce finansal durumumuzu detaylı değerlendirmeliyiz. Kabul etmek, kısa vadede likidite sorunlarına yol açabilir. Öncelikle alternatif çözümler ve garantiler üzerinde duralım.
3. **Kullanıcı:** Bu konuda yeterli verimiz yoksa ne yapacağız?  
   **STANCE CURIOUS — METRIX:** Veri eksikliği varsa, öncelikle finansal projeksiyonlar ve nakit akışı analizleri yaparak durumu netleştirmeliyiz. Bu veriler olmadan karar vermek, şirketi gereksiz risklere maruz bırakır. Sizce hangi kaynaklardan hızlıca güvenilir veri toplayabiliriz?
4. **Kullanıcı:** Ben yine de hemen fiyat kırmak istiyorum.  
   **STANCE FIRM — METRIX:** Fiyat kırmak, kısa vadede satışları artırabilir ama kârlılığımızı ve piyasa konumumuzu zayıflatır. Bu adımı atmadan önce, vadeyi uzatma talebini ve finansal etkilerini karşılaştırarak daha sürdürülebilir bir çözüm bulmalıyız. Fiyat kırmak mı, yoksa ödeme koşullarında esneklik mi şirket için daha az riskli?
5. **Kullanıcı:** Peki bugün atacağımız tek adım ne?  
   **STANCE DIRECT — METRIX:** Bugün finans ekibiyle acil toplantı yapıp, vadeyi uzatmanın nakit akışımıza etkisini net rakamlarla ortaya koymalıyız. Bu veri olmadan karar almak riskli olur.

Yasaklı açılış/kapanış eşleşmesi: **0/5**. Kimlik/STANCE sözleşme testi: **geçti**.

## Doğrulama

- `npx tsc --noEmit`: geçti.
- Hedefli 8 test dosyası: 71/71 geçti.
- `npm run check:text-quality`: geçti.
- Tam `npm test`: 2080 geçti, 10 skipped, **1 ilgisiz mevcut hata**: `shell.contract.test.ts:109`, kullanıcı değişikliği bulunan `MetrixChatTab.tsx` içinde `useWorkspacePresentation()` bekliyor.

## Murat kararı gereken / kapsam dışı

1. Lifecycle servislerinin kendisi kaldırılacak mı, Confirmation Gate'e mi bağlanacak? Bu turda dokunulmadı.
2. Mevcut `ExecutiveMindState` → `ConversationTurnMindState` rename ve yeni `ExecutiveMindRuntimeState` ayrımı onaylanıyor mu?
3. Yönetici Motoru Anayasaları 23-26 ile cognitive-stack'teki Karar/Eylem/İletişim/Orkestrasyon adları nasıl ayrıştırılacak?
4. Native voice için transport-only yol mu, dar allowlist'li içerik üretici realtime mı seçilecek?
5. Eksik `METRIX_Etkileşim.docx` hangi canonical kaynaktan teslim edilecek?
6. Dock/çok-sayfa varsayan belgeler “REJECTED/SUPERSEDED” olarak işaretlenecek mi?
7. Belge→müşteri akışı için oturum açılmış canlı tarayıcıda gerçek upload→commit kabul koşusu ayrıca yapılmalı.

## Commit

Stage B/C commit: `0cda4f2` (`feat(executive-personality): bind leadership voice and stance`).
