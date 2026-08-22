# Executive Cognitive Stack v2 — Yönetici Motoru Birleşmesi

**Durum:** Mimari doküman — v1'i geçersiz kılmaz, genişletir. v1'in Faz 1-9 planı ve katman tanımları aynen kalır; bu belge dört ayrı "Yönetici Motoru Alan Anayasası"nı (23-26) aynı çatı altına, açık sınırlarla bağlar.
**Kapsam:** Executive Mind Runtime → Eylem Zinciri → Speech Runtime (v1, değişmedi) + Executive Decision Engine, Executive Action Engine, Yönetici Orkestrasyon Motoru, Yönetici İletişim Motoru'nun Stack ile ilişkisi.
**Constitution referansı:** executive-cognitive-stack-v1.md, Domain_Sözleşme/23 (Yönetici Karar Motoru), /24 (Yönetici Eylem Motoru), /25 (Yönetici İletişim Motoru), /26 (Yönetici Orkestrasyon Motoru)
**İmplementasyon referansı (mevcut kod, kavramsal doğrulama için):** `src/lib/action-runtime/**`, `src/lib/executive-decision-engine/**`, `src/lib/business-reality-candidates/**`, `src/lib/core/notifications/**`

---

## Amaç

Murat'ın kararı: dört "Yönetici Motoru" domain anayasası (Karar/Eylem/İletişim/Orkestrasyon) ile Cognitive Stack, iki paralel sistem değil, tek tutarlı sistem olarak birleşmelidir.

Bu belge o birleşmeyi **gerçek kapsam farklarına göre** yapar. Dört domain aynı kelimeleri kullanır ama iki farklı ekseni temsil eder:

- Cognitive Stack ekseni: **tek canlı konuşmanın bir turn'ü içinde ne oluyor** — hangi odak, hangi niyet, hangi somut söz fiili, hangi tempo.
- Yönetici Motoru ekseni: **işletmenin kendisi ne yapıyor** — hangi stratejik karar, hangi iş mutasyonu, hangi çoklu domain sırası, hangi canlı-konuşma-dışı iletişim.

"Birleşme", dört domainin isminin silinip yedi katmana eritilmesi anlamına gelmiyor. Araştırma sonucu net: **ikisi zaten çalışan koda karşılık geliyor ve resmi olarak çapraz-referanslanmalı; ikisi hâlâ yok ve kendi adlarını koruyarak Stack'ten net sınırla ayrılmalı.** Zorla tek modele sıkıştırmak, projenin kendi ilkesine ("gereksiz soyutlama ekleme") aykırı olurdu.

---

## 0. Özet Karar

| Domain (23-26) | v2'deki karşılığı | Durum |
|---|---|---|
| 23 — Executive Decision Engine (Karar Motoru) | Stack'e yeni, ayrı, yavaş-rejim bir kalibrasyon kaynağı olarak bağlanır (Strategic Identity/Executive DNA ile aynı desen) | **Kısmen zaten implemente** (`executive-decision-engine` + destek modülleri) — resmi çapraz-referans, yeniden inşa yok |
| 24 — Executive Action Engine (Eylem Motoru) | Stack'in "karar konuşma değilse ne olur" sorusuna cevap olan yürütme katmanı | **Zaten implemente ve çalışıyor** (`action-runtime`) — yalnızca isimlendirme/çapraz-referans eksik |
| 25 — Yönetici İletişim Motoru | Speech Runtime'ın DIŞINDA, ayrı, kendi adını koruyan bir sistem | **İmplemente değil** — ayrı gelecek faz gerektirir |
| 26 — Yönetici Orkestrasyon Motoru | ECO'nun DIŞINDA, ayrı, kendi adını koruyan bir sistem | **İmplemente değil** (yalnızca tekil-aday→tekil-aksiyon köprüsü var) — ayrı gelecek faz gerektirir |

---

## 1. Genişletilmiş Katman Şeması

```
       [ Executive Decision Engine — yavaş/stratejik rejim, sürekli ]
         Business sinyalleri (cash/collection/sales/execution/market/
         strategy/people/customer) → canonical Executive Decision
         (mevcut: executive-decision-engine + executive-alerts/
          forecasting/focus/rhythm/scorecard/awareness)
                              │
                              │  (salt-okunur kalibrasyon sinyali —
                              │   bir yargı değil, girdi)
                              ▼
[ Zihin Kümesi — sürekli, eşzamanlı ]                (v1 ile birebir aynı)
  Executive Mind Runtime
    └─ Executive Mind State
    └─ Executive Attention
    └─ Executive Momentum
    └─ Executive Cognitive Lifecycle
            │
            │  (olgun Belief + Momentum — tek çıkış noktası)
            ▼
[ Eylem Zinciri — doğrusal, kapılı ]                  (v1 ile birebir aynı)
  Executive Intent System
            ▼
  Executive Decision Runtime
            ▼
  Executive Conversation Orchestrator (ECO) ──────┐
            ▼                                     │  (fiil "Söyle" değil,
      Speech Runtime                              │   business mutasyonu
            ▼                                     │   gerektiriyorsa)
      Kullanıcıya ulaşan konuşma                   ▼
                                     Executive Action Engine
                                     (mevcut: action-runtime —
                                      registry → policy → approval →
                                      idempotency → handler → outbox)
                                            │
                                            ▼
                              Business Domain state değişikliği
                              (Customer/Invoice/Quote/Task/Company/...)


[ Yönetici Orkestrasyon Motoru — AYRI sistem, ECO değil ]
  Tek bir iş komutu (örn. "Atlas'a teklif hazırla, yarın gönder, iki gün
  sonra aramam için görev aç") birden fazla domain/motoru gerektirdiğinde
  bunların sırasını/bağımlılığını/paralelliğini yönetir. Turn'e değil,
  İŞ KOMUTUNA bağlıdır; dakikalar/günler sürebilir, tek konuşma turn'ünün
  ömrüyle sınırlı değildir.

[ Yönetici İletişim Motoru — AYRI sistem, Speech Runtime değil ]
  Canlı, birincil kullanıcı konuşmasının DIŞINDAKİ iletişim: müşteriye,
  tedarikçiye, ekibe, yönetim kuruluna giden mesaj/e-posta/hatırlatma.
  Henüz implemente edilmemiştir (bkz. §5).
```

---

## 2. Zihin Kümesi ve Eylem Zinciri

v1 §2 ve §3'te tanımlanan beş+dört katman **değişmeden** kalır. Tanımları, sorumluluk sınırları, lifecycle'ları burada tekrar edilmez — v1 tek kaynaktır. v2 yalnızca bu kümenin etrafına, aşağıdaki dört bölümde tarif edilen dört sistemi ekler.

---

## 3. Executive Decision Engine (Karar Motoru) — Stack'e Bağlanışı

**Domain 23'ün gerçek kapsamı:** işletme-stratejik kararlar (depo açmalı mıyız, fiyat artırmalı mıyız, vade uzatmalı mıyız) — alternatif, risk, fırsat, kanıt, güven seviyesi ile değerlendirilen, kendi lifecycle'ı olan (Karar Talebi → Bağlam Analizi → Kanıt → Alternatifler → Risk → Assessment → Öneri → Sonuç İzleme) canonical bir nesne.

**Cognitive Stack'in Decision Runtime'ından farkı (v1 giriş bölümünde zaten belirtilmişti, burada teyit edilir):** Decision Runtime saniyeler içinde "şu an ne söylenecek" sorusuna cevap verir (Söyle/Bekle/Sor/...). Karar Motoru günler/haftalar içinde "işletme ne yapmalı" sorusuna cevap verir. İkisi aynı kelimeyi ("karar") taşıyor ama aynı zaman ölçeğinde çalışmıyor.

**Mevcut implementasyon bulgusu:** `src/lib/executive-decision-engine/` (ve beslediği `executive-alerts`, `executive-forecasting`, `executive-focus`, `executive-rhythm`, `executive-scorecard`, `executive-awareness`, `executive-decision-loop`, `executive-decision-follow-up`, `executive-accountability`, `executive-outcome` modülleri) bu domainin **pratik, çalışan karşılığıdır**. `ExecutiveDecision` tipi zaten category (CASH/COLLECTION/SALES/EXECUTION/MARKET/STRATEGY/PEOPLE/CUSTOMER/DATA_QUALITY), priority, confidence, risks, opportunities, evidenceRefs, sourceSignals, rationale taşıyor — doküman 23'ün "Canonical Decision" modeliyle örtüşüyor. Ayrıca `executive-decision-engine.service.ts` zaten `ConversationTurnMindState`'i (Cognitive Stack Faz 1 çıktısı) bir girdi olarak kabul ediyor — yani bağlantı noktası fiilen mevcut, sadece anayasal olarak adlandırılmamış.

**v2 kararı — genişletme değil, cross-reference:** Karar Motoru'nun kendi modeli (kategori/öncelik/güven/kanıt) korunur; doküman 23'ün "alternatives/trade-off" çerçevesine göre yeniden inşa edilmez (bu, "en küçük değişiklik" ilkesine aykırı olurdu — mevcut model işliyor). Tek eklenen şey: bu modül resmen "Executive Decision Engine domain anayasasının (23) canonical implementasyonu" olarak işaretlenir ve Cognitive Stack'e **Strategic Identity ile aynı desende** bağlanır — Intent System ve Decision Runtime'da salt-okunur, iki kalibrasyon noktası olarak tüketilir (bkz. §7 tablo, yeni satır). Kendi deposunu, kendi lifecycle'ını, kendi rejimini korur; Mind State/Attention/Momentum ile aynı depoyu paylaşmaz.

---

## 4. Executive Action Engine (Eylem Motoru) — Stack'e Bağlanışı

**Domain 24'ün gerçek kapsamı:** kararı (hangi kararın — Karar Motoru'nun stratejik kararı ya da Executive Decision Runtime'ın konuşma-anı kararı fark etmez) güvenli, yetkilendirilmiş, izlenebilir, geri alınabilir şekilde işletme gerçekliğine dönüştürmek. Authorization, Approval, Rollback, Outcome Verification, Execution Monitoring bu domainin çekirdeği.

**Cognitive Stack'teki boşluk:** v1'in Eylem Zinciri'nde Decision Runtime → ECO → Speech Runtime doğrudan bağlıdır; hiçbir aşama "somut bir business mutasyonunu nasıl güvenli şekilde yürütürüz" sorusuna cevap vermez. v1 bunu kasıtlı olarak dışarıda bırakmıştı çünkü kapsamı yalnızca konuşma davranışıydı (Decision Runtime'ın 10 fiili — Söyle/Bekle/Sor/İtiraz Et/Sakinleştir/Yön Değiştir/Sus/Geri Dön/Derinleştir/Kapat — hiçbiri "müşteri kaydını güncelle" değildir).

**Mevcut implementasyon bulgusu:** `src/lib/action-runtime/execution/execution-runtime.ts` zaten tam olarak doküman 24'ün lifecycle'ını uyguluyor: Registry lookup → Input validation → Policy evaluation (+audit) → Approval verification (+audit) → Idempotency check → Handler invocation → Outbox enqueue → Completion — bu, doküman 24 §17'deki "Aksiyon Talebi → Doğrulandı → Yürütme Planı → Onay Bekliyor → Yürütülüyor → Doğrulandı → Tamamlandı" zinciriyle birebir örtüşüyor. `policy/` altındaki risk-evaluator/approval-service, doküman 24'ün Authorization/Approval Intelligence'ına karşılık geliyor. `isReversible`/`compensationRef` alanları Rollback Intelligence'a karşılık geliyor. `src/lib/business-reality-candidates/business-candidate-action-runtime.executor.ts` da bir "aday → onaylı değişiklik → canonical action" köprüsü olarak zaten çalışıyor (customer.update, company.profile.update, product.create, executive_action.create gibi action'lara promote ediyor).

**v2 kararı — formal absorbe:** Bu, dört domain içinde **gerçekten "absorbe edilmiş" sayılabilecek tek domaindir** çünkü hem kapsamı hem implementasyonu zaten Stack'in eksik parçasını dolduruyor. v2, `action-runtime`'ı resmen "Cognitive Stack'in Eylem Katmanı / Executive Action Engine domain anayasasının (24) canonical implementasyonu" olarak adlandırır. Bağlantı noktası: **Decision Runtime'ın fiili "Söyle" ailesinden değilse** (yani konuşmaya değil, business state'e dönüşecekse), somut yürütme bu katmana devredilir — ECO/Speech Runtime'a değil. Bu yeni bir katman eklemek değil, var olan iki sistemi resmi olarak isimlendirmektir.

---

## 5. Yönetici İletişim Motoru — Stack'ten Ayrı Kalışı

**Domain 25'in gerçek kapsamı:** METRIX'in birincil kullanıcı dışındaki taraflara (müşteri, tedarikçi, ekip, yönetim kurulu) giden iletişim — hangi ton, hangi hedef kitle, hangi zamanlama, hangi kanal, hangi müzakere/ilişki stratejisiyle. Kendi lifecycle'ı var (İletişim Talebi → Bağlam → Hedef Kitle → Mesaj → Gözden Geçirme → Gönderim → Sonuç İzleme).

**Speech Runtime'dan farkı:** v1'in Speech Runtime'ı yalnızca **canlı, birincil kullanıcıyla süren konuşmanın** kelime/ses üretimini yapar — ECO'nun turn talimatını uygular. Domain 25 ise **başka kanallara, başka taraflara** giden, turn kavramı olmayan, asenkron içerik üretir (bir e-posta yarın sabah gönderilebilir; bir turn yarın sabaha ertelenemez).

**Mevcut implementasyon bulgusu:** `src/lib/core/notifications/` sadece **uygulama-içi bildirim** (Notification modeli — recipientUserId, severity, type, isRead) sağlıyor; bu METRIX kullanıcılarına dahili uyarı, müşteri/tedarikçiye giden dışsal iletişim değil. `quote-send-handler.ts`'in kendi yorumu bunu doğruluyor: *"Müşteriye giden bir e-posta/SMS kanalı henüz bağlanmadı — yalnızca METRIX içi durumu ve bildirimi ilerletiyor."* Yani domain 25'in tarif ettiği (audience/tone/timing/negotiation intelligence ile outbound müşteri/tedarikçi/ekip iletişimi) **kodda karşılığı yok.**

**v2 kararı — ayrı sistem, kendi adını korur:** Yönetici İletişim Motoru, Stack'e absorbe edilmez, ECO ya da Speech Runtime'ın bir parçası olarak yeniden adlandırılmaz. Kendi domain anayasasını (25) korur; Stack'e yalnızca sınır tablosunda (§7) bir satırla bağlanır: *Speech Runtime bunun sahibi değildir.* Tetiklenme noktası muhtemelen Karar Motoru veya Eylem Motoru'nun bir sonucu olacaktır (örn. "tahsilat hatırlatması gönder" kararı → İletişim Motoru mesajı üretir → gelecekte tanımlanacak bir outbound kanal üzerinden gönderir), ama bu implementasyon henüz mevcut değil ve bu belgenin kapsamı dışındadır — ayrı bir tasarım fazı gerektirir (bkz. §9 Faz 13).

---

## 6. Yönetici Orkestrasyon Motoru — Stack'ten Ayrı Kalışı

**Domain 26'nın gerçek kapsamı:** tek bir iş komutunun arkasında kaç domain/motorun, hangi sırayla, hangi bağımlılıkla, paralel mi sıralı mı çalışacağını yönetmek. Kendi lifecycle'ı var (Tetiklendi → Runtime Analizi → Domain Planı → Bağımlılık Çözümü → Yürütme → Koordinasyon → Doğrulama → Tamamlandı), exception/recovery/state intelligence içeriyor.

**ECO'dan farkı — bu, tam olarak orijinal karışıklığın kaynağıydı, bu yüzden burada açıkça ayrılıyor:**

| Eksen | ECO | Yönetici Orkestrasyon Motoru |
|---|---|---|
| Neyi yönetir | Zaten karara bağlanmış TEK bir konuşma fiilinin ZAMANLAMASI | Bir iş komutunun ürettiği ÇOKLU domain/motor işleminin SIRASI |
| Zaman ölçeği | Bir turn (saniyeler) | Bir iş süreci (dakikalar/günler) |
| Karar verir mi | Hayır — v1 §3.3'te zaten "karar vermez" diye tanımlı | Hayır — doküman 26 §2'de zaten "iş yapmaz, işlerin nasıl birlikte çalışacağını yönetir" diye tanımlı |
| Kapsamı | Yalnızca canlı konuşmanın içi | Karar/Eylem/İletişim motorları + tüm business domainler |

İkisi de "karar vermiyor, koordine ediyor" ilkesini paylaşıyor — bu yüzden isim benzerliği kafa karıştırıcıydı. Ama eksenleri (turn-içi zamanlama vs. iş-komutu-çapında domain sırası) kesişmiyor. Biri diğerinin genişletilmiş hali değil.

**Mevcut implementasyon bulgusu:** Doküman 26'nın tarif ettiği çok-domainli, bağımlılık-grafikli, paralel/sıralı, recovery-destekli orkestrasyon **kodda yok**. `business-reality-candidates`'ın promotion executor'ı tek bir adayı tek bir action-runtime çağrısına çeviriyor (1:1), doküman 26'nın tarif ettiği çoklu-domain zincirleme değil.

**v2 kararı — ayrı sistem, kendi adını korur:** Yönetici Orkestrasyon Motoru, ECO'nun bir üst kümesi ya da genişletilmiş hali olarak modellenmez. Kendi domain anayasasını (26) korur, kendi implementasyonu ayrı bir gelecek faz olarak ele alınır (bkz. §9 Faz 12). Stack'e yalnızca sınır tablosunda bağlanır: *ECO, çoklu-domain sıralamasından sorumlu değildir; Orkestrasyon Motoru, turn-içi tempo/zamanlamadan sorumlu değildir.*

---

## 7. Mevcut Anayasa Sistemleriyle Sınırlar (v1 §6'nın genişletilmiş hâli)

v1'in tablosu aynen korunur; aşağıdaki dört satır eklenir.

| Sistem | İlişki | Dokunulmazlık |
|---|---|---|
| **Executive Decision Engine** (Karar Motoru, mevcut: `executive-decision-engine`) | Intent System ve Decision Runtime'da, Strategic Identity ile aynı desende, iki kalibrasyon noktasında salt-okunur tüketilir | Kendi kategorik/kanıt tabanlı karar modelinin tek sahibi kalır; Mind State/Attention/Momentum ile aynı depoyu paylaşmaz; yavaş/stratejik rejim hızlı/konuşmasal rejimle karışmaz |
| **Executive Action Engine** (Eylem Motoru, mevcut: `action-runtime`) | Decision Runtime'ın fiili business mutasyonu gerektirdiğinde (Söyle ailesi dışı) yürütmeyi devralır | Kendi policy/approval/idempotency/rollback pipeline'ının tek sahibi kalır; ECO/Speech Runtime bu pipeline'ı bypass edemez, Action Engine de turn zamanlamasına karışamaz |
| **Yönetici İletişim Motoru** (implemente değil) | Karar/Eylem Motoru'nun sonucu olarak tetiklenebilir; Stack'e yalnızca bu tetikleme noktasından bağlanır | Speech Runtime, bu domainin sahibi değildir ve olamaz — canlı birincil konuşma dışı hiçbir kanaldan sorumlu değildir |
| **Yönetici Orkestrasyon Motoru** (implemente değil) | Karar/Eylem/İletişim motorlarının çoklu-domain sıralamasını yönetir | ECO, bu domainin sahibi değildir ve olamaz — yalnızca tek bir turn'ün zamanlamasından sorumludur, çoklu-domain iş sırasına karışamaz |

---

## 8. Ne Değişti: v1 → v2

| Konu | v1 | v2 |
|---|---|---|
| Kapsam | Yalnızca Mind Runtime → ECO → Speech Runtime | Aynı çekirdek + dört Yönetici Motoru domaininin Stack'e bağlanma noktaları |
| Katman sayısı | 7 (Mind Runtime, Mind State, Attention, Momentum, Cognitive Lifecycle, Intent, Decision Runtime, ECO, Speech Runtime — v1 metninde 9 alt-bileşen) | Aynı 7-9 katman DEĞİŞMEDİ; yanına 2 yeni cross-reference edilen sistem (Decision Engine, Action Engine) + 2 ayrı-tutulan komşu sistem (İletişim, Orkestrasyon) eklendi |
| "Karar" kelimesinin kapsamı | Yalnızca Decision Runtime'ın konuşma-anı fiil seçimi | Artık açıkça iki ayrı "karar" var: Decision Runtime (konuşma fiili) ve Executive Decision Engine (iş stratejisi) — ikisi asla karıştırılmamalı |
| Eylem/execution boşluğu | Decision Runtime → ECO → Speech Runtime arasında business-mutasyon aşaması yoktu | Artık açık: business mutasyonu gerektiren fiiller Executive Action Engine'e (mevcut `action-runtime`) gider, ECO/Speech Runtime'a değil |
| Orkestrasyon terimi | Yalnızca ECO ("Conversation Orchestrator") vardı | Artık ECO ile Yönetici Orkestrasyon Motoru arasında açık, tablo halinde eksen ayrımı var (§6) |
| İletişim terimi | Yalnızca Speech Runtime vardı | Artık Speech Runtime (canlı, birincil kullanıcı) ile Yönetici İletişim Motoru (canlı-dışı, diğer taraflar) arasında açık sınır var (§5) |
| §6 tablosu | 7 satır | 11 satır (4 yeni) |
| Faz planı | Faz 1-9 | Faz 1-9 aynen korunur + Faz 10-13 eklenir (§9) |

---

## 9. Production İmplementasyon Fazları (Faz 10-13, v1'in Faz 1-9'una ek)

| Faz | Kapsam | Doğrulanan şey | Geri alınabilirlik |
|---|---|---|---|
| **Faz 10** — Executive Action Engine resmi cross-reference | Kod değişikliği yok; `action-runtime`'ı doküman 24'ün canonical implementasyonu olarak işaretleyen doküman/yorum güncellemesi + Decision Runtime'ın "business mutasyonu" fiillerinin bu katmana devredildiği tek bir entegrasyon noktasının netleştirilmesi | Mevcut pipeline bozulmadan doğru isimle anılıyor mu? | Yalnızca doküman değişikliği — riski yok |
| **Faz 11** — Executive Decision Engine kalibrasyon bağlantısı | `executive-decision-engine`'in çıktısının (ExecutiveDecisionResult), Strategic Identity ile aynı desende, Intent System/Decision Runtime'a salt-okunur bir kalibrasyon girdisi olarak tanımlanması | Karar Motoru'nun sinyali, Stack'in yargı yetkisini ele geçirmeden yalnızca bağlam sağlıyor mu? | Kaldırılırsa Stack bugünkü (kalibrasyonsuz) haline döner |
| **Faz 12** — Yönetici Orkestrasyon Motoru tasarımı | Bu belgenin kapsamı DIŞINDA — ayrı bir domain anayasası/mimari doküman gerektirir; ECO ile karışmaması için önce bu belgedeki §6 sınırının kilitlenmesi ön koşuldur | Çoklu-domain koordinasyonu, ECO'nun turn-zamanlama modeline sızmadan mı tasarlanıyor? | Henüz başlamadı — ön koşul: bu belge onaylanmalı |
| **Faz 13** — Yönetici İletişim Motoru tasarımı | Bu belgenin kapsamı DIŞINDA — outbound kanal altyapısı (e-posta/SMS/vb.) henüz yok; ayrı bir domain anayasası/mimari doküman gerektirir | Outbound iletişim, Speech Runtime'ın turn modeline sızmadan mı tasarlanıyor? | Henüz başlamadı — ön koşul: bu belge onaylanmalı |

Faz 10 ve 11 düşük riskli, çoğunlukla dokümantasyon işidir (mevcut kodu doğru isimle anmak). Faz 12 ve 13, bu belgenin ürettiği SINIR üzerine inşa edilecek, ama kendi kapsamlı tasarım çalışmasını gerektiren, henüz başlamamış işlerdir — bu belge onları başlatmaz, yalnızca nereye ait olduklarını (ve nereye ait OLMADIKLARINI) kilitler.

---

## Kurucu Mimari Kontrolü

1. **METRIX Anayasalarına uygun mu?** Evet — dört Yönetici Motoru domain anayasası (23-26) geçersiz kılınmadı; her biri kendi canonical model/lifecycle/anti-pattern setini korudu. v1'in yedi katmanı da değişmedi. v2 yalnızca sınırları netleştirdi ve iki noktada (Eylem, Karar) mevcut koda doğru isim verdi.
2. **Gelecekte tüm sisteme yayılabilir mi?** Evet — Faz 10-11 düşük riskli, izole, geri alınabilir dokümantasyon adımlarıdır. Faz 12-13 kasıtlı olarak bu belgenin kapsamı dışında bırakıldı; genişleme zorla değil, ayrı onaylı fazlarla olacak.
3. **Kurucu mimarinin kalıcı parçası mı?** Evet — geçici bir yama değil; dört domainin gerçek kapsam farkını kayıt altına alan, gelecekteki "Karar Motoru mu Decision Runtime mı" / "Orkestrasyon Motoru mu ECO mu" karışıklığını önleyecek kalıcı bir sınır dokümanıdır.

---

## Düzeltme (2026-08-07, Faz 10/11 görev metni hazırlanırken bulundu)

§3'teki "mevcut implementasyon bulgusu" eksik çıktı — kodda `ExecutiveDecision`/`ExecutiveDecisionResult` şeklinde **iki ayrı, örtüşen modül** var, tek değil:

1. `src/lib/executive-brain/executive-decision-engine.service.ts` (`buildExecutiveDecisionPackage`) — **canlı sohbet yolunda gerçekten çalışıyor** (`route.ts:2188`, her turda `executive_decision_package` aşaması olarak).
2. `src/lib/executive-decision-engine/executive-decision-engine.service.ts` (`buildExecutiveDecisionResult`) — yalnızca `GET /api/reports/board` (aylık yönetim raporu) tarafından çağrılıyor, sohbet yoluna hiç bağlı değil. `mindState` alanını (`ConversationTurnMindState`) kabul edecek şekilde tiplenmiş ama production'da hiçbir çağrı bu alanı doldurmuyor — yalnız testler dolduruyor.

Bu, projenin daha önce defalarca bulduğu "aynı işi yapan iki paralel sistem" deseniyle örtüşüyor olabilir — ama henüz doğrulanmadı, bu belgenin kapsamı dışında bırakıldı. Faz 11 görev metni (`METRIX_TASK_BRIEF_cognitive-stack-faz10-11.md`), gerçek kalibrasyon bağlantısını kurmadan önce Codex'ten bu iki modülün gerçekten aynı şeyi mi yaptığını yoksa kasıtlı olarak ayrı amaçlara mı hizmet ettiğini (turn-anı sohbet özeti vs. aylık stratejik rapor) doğrulamasını istiyor.

### Çözüm (2026-08-23, "Büyük Resim Mimari Operasyonu" Faz 2)

Yukarıdaki soru kod okunarak kapatıldı: **iki modül aynı işi yapmıyor, kasıtlı olarak ayrı amaçlara hizmet ediyor.** Kanıt:

1. **Tek production çağıran her biri için:** `buildExecutiveDecisionPackage` yalnızca `src/app/api/ai/chat/route.ts`'ten (canlı sohbet, her turda), `buildExecutiveDecisionResult` yalnızca `src/app/api/reports/board/route.ts`'ten (aylık board raporu) çağrılıyor. İki fonksiyon hiçbir üretim yolunda kesişmiyor.
2. **Girdi kapsamı kökten farklı:** `buildExecutiveDecisionPackage` yalnızca o turun bellek-içi, hafif sinyallerinden (`ExecutiveBrainContext`/`ExecutiveCouncil`/`StrategicProfile`) çalışır — I/O yok, senkron. `buildExecutiveDecisionResult` ise `executiveAlerts`/`executiveForecast`/`executiveScorecard`/`executiveRhythm`/`executiveAwareness`/`executiveDecisionContext`/`goalIntelligence` gibi 7 ayrı, kendi başına var olan alt-sistemin gerçek çıktısını toplayan bir `operatingContext`'e ihtiyaç duyar — her sohbet turunda yeniden hesaplanacak kadar ucuz değildir.
3. **Kalibrasyon bağlantısı zaten kurulu — doğru modülle:** Faz 11'in istediği "Karar Motoru çıktısının Intent System/Decision Runtime'a salt-okunur kalibrasyon girdisi olması" mekanizması zaten üretimde çalışıyor (`route.ts:extractExecutiveDecisionCalibration` → `executive-directive`'in "Decision calibration (read-only)" prompt alanı, bkz. `prompt-format.ts:360-362`) — ama kaynağı `buildExecutiveDecisionPackage`'ın bir önceki turda ürettiği `decisionPackage`'dır, çünkü bu, tur hızında çalışabilen tek modüldür. `buildExecutiveDecisionResult`'ı bu slota bağlamak, board-raporu ölçeğinde bir hesaplamayı her sohbet turuna eklemek anlamına gelirdi — hıza ve "ilk yanıt gecikmesi" için ayrıca yapılmış işe zarar verirdi.
4. **`mindState` alanı eksik kablo değil:** `BuildExecutiveDecisionResultInput.mindState` opsiyoneldir; board raporunun tek bir konuşma turuna bağlı olmaması nedeniyle kasıtlı olarak boş bırakılır.

**Karar:** Birleştirme yapılmadı (yapılmaması doğru karardı — kod zaten doğru ayrışmış haldeydi). Her iki dosyanın başına, bu sınırı ve karşılıklı referansı sabitleyen bir dokümantasyon notu eklendi (`executive-brain/executive-decision-package.service.ts`, `executive-decision-engine/executive-decision-engine.service.ts`). Davranış değişmedi; regresyon riski yok.

## Notlar (bu taslağın dışında kalan, ama görülen bulgular)

- `src/lib/executive-decision-engine` etrafında çok daha geniş bir "executive-*" modül kümesi var (`executive-alerts`, `executive-forecasting`, `executive-focus`, `executive-rhythm`, `executive-scorecard`, `executive-awareness`, `executive-accountability`, `executive-outcome`, `executive-decision-loop`, `executive-decision-follow-up`, `executive-learning-resolver`, `executive-operating-context`). Bu belge yalnızca `executive-decision-engine`'i doküman 23'ün karşılığı olarak inceledi; diğerlerinin doküman 23 (ya da başka domain anayasaları) ile tam örtüşüp örtüşmediği ayrı bir inceleme gerektirir — bu taslağın kapsamına dahil edilmedi.
- `business-reality-candidates` modülü, "aday → onay → canonical action" akışını zaten action-runtime üzerinden yürütüyor; bu, Faz 12'nin (Orkestrasyon Motoru) tasarımı için doğal bir başlangıç referansı olabilir, ama şu an yalnızca tekil-aday→tekil-aksiyon (1:1) yapıyor, çoklu-domain zincirleme yapmıyor.
