# METRIX Görev Notu — METRIX Karakterinin ve Canlı Varlığın Birleştirilmesi

**Tarih:** 2026-08-26
**Karar veren:** Murat
**Bu notun türü:** Yalnızca DENETİM + YOL HARİTASI. Bu oturumda karakter/davranış mimarisine dair **hiçbir kod yazılmadı** — Murat'ın açık talimatı: "kod yazmaya hemen geçmeyeceğiz, önce briefi okumam lazım."

**İstisna (bu notun konusu değil, ayrı ve zaten kapanmış iki iş):** Aynı oturumda KPI `calculationMethod` hesaplama motoru (commit `e10b1d6`) ve Orkestrasyon Motoru'nun 10 eksik handler'ı (commit `2fa1719`) tamamlandı, push edildi — bunlar `METRIX_TASK_BRIEF_buyuk-resim-mimari-operasyonu.md`'nin devamıydı, bu brief'le ilgisiz. Bu oturumda ayrıca sesli kanaldaki bir liste-okuma hatası (§3.2'nin somut kanıtı) küçük, izole bir düzeltmeyle kapatıldı (commit `c44f8c3`, push edildi) — bu istisna, çünkü Murat açıkça "bu sorunu bir kural koyarak düzeltir misin" dedi; aşağıdaki büyük mimari işin parçası değil, önden gelen acil bir semptom düzeltmesiydi.

---

## Zorunlu okuma sırası (yeni oturum başında)

1. Bu belge.
2. `docs/constitution/source/metrix-liderlik-dnasi.md` — kimin olduğun (Leadership DNA v1.2, onaylı).
3. `docs/constitution/METRIX FOUNDATION/06 - Executive Conversation 1.0.docx` — nasıl konuştuğun (samimiyet/profesyonellik dengesi, duygusal varlık, "gerektiği kadar konuşmak").
4. `docs/constitution/METRIX FOUNDATION/05 - Executive Behavior OS 1.0.docx` — davranışın nasıl üretildiği (Behavior Pattern'lar, uyarlanabilirlik, davranış akışı).
5. Okunmadı ama muhtemelen doğrudan ilgili, Behavior OS'un üstündeki katmanlar: `02 - Executive Core 1.0.docx`, `03 - Executive Values 1.0.docx`, `04 - Executive Orchestrator 1.0.docx` (bu üçü Behavior OS'un "davranış kararların yerine geçmez, onları görünür kılar" dediği üst otoriteler — bir sonraki oturumun ilk işi bunları okumak olmalı).
6. `METRIX_TASK_BRIEF_metrix-karakter-ve-canli-sohbet-akisi.md` (21 Ağustos, **hâlâ açık, bu notu geçersiz kılmıyor** — bkz. §5, ayrı bulgular).
7. `docs/constitution/reports/METRIX_Karakter_ve_Mimari_Buyuk_Resim_Denetimi_2026-08-22.md` (bağlam için — orada bulunan "Kök Neden 2", metin kanalında derin muhakemenin cevaba dönmemesiydi, o ayrı bir sorundu ve zaten kapatıldı; bu notla karıştırılmamalı).

---

## 0. Tetikleyici — bugünkü iki canlı kanıt

1. Murat sesli sohbette "selam metrix bugün nasılsın?" dedi. METRIX: **"Şirketinin AI Genel Müdürüyüm. Bugün ne yapmak istersin?"** — soğuk, kimlik ilan eden, hâl hatır sorusunu tamamen atlayan bir cevap.
2. Murat sesli sohbette "müşterilerimi göster" dedi. METRIX domaini açtı, genel bilgi verdi, sonra **100 müşteriyi tek tek saymaya başladı** — Murat sesli sohbeti durdurmak zorunda kaldı. (Bu, oturum içinde düzeltildi — bkz. §3.2 ve commit `c44f8c3`. Murat'ın kendi sorusu — "yarın stoklarda da olur mu" — haklıydı: kök neden domain-spesifik değil, genel bir desendi.)

Murat'ın üçüncü, en geniş sorusu: *"Metrix her an kullanıcıyla ve şirketle bir olsun, onlarla yaşasın — bunu kurallarla mı, yoksa her olası sohbet için yazılmış metinlerle mi sağlayacağız, yoksa ne yapmalıyız?"*

---

## 1. Bulgular (kod okunarak doğrulandı, dosya:satır ile)

### 1.1 Sesli kanal, yazılı kanalın karakter/sıcaklık talimatlarının çoğunu hiç almıyor

Yazılı sohbet (`src/lib/ai/prompts/prompt-format.ts:126-186`) her turda şu blokla başlıyor — özellikle şu satır kritik: *"Kimligini yalnizca kullanici dogrudan sorarsa acikla; sormadikca anlatma."* Bu blok yalnızca bu dosyada var.

Sesli oturum (`src/app/api/ai/chat/voice/session/route.ts:98-106`), OpenAI Realtime API'ye gönderdiği `instructions`'ı yalnızca şunlardan kuruyor:
- `buildExecutiveIdentityPrompt()` (`src/lib/ai/identity/executive-identity-prompt.ts`) — yalnızca sınır/yasak kuralları. Kimlik-cevabı satırı var (*"kullanıcı doğrudan sorarsa şöyle cevap ver"*) ama "sormadıkça anlatma" karşılığı **yok**.
- Tek satırlık ses-yüzeyi politikası (kısa cümle, markdown yok).
- `projectLivingBehaviorPrompt(...)` — bkz. §1.2.
- "Sakin, ağırlıklı, kısa Türkçeyle konuş."

Yazılı kanaldaki zengin "önce insan gibi konuş, dogal sohbet edebil, kullaniciyla gercek bir insan genel mudur gibi konus: sakin, olgun, babacan, karizmatik" talimat bloğunun tamamı sesli kanalda **yok**. §0.1'deki hata, bunun doğrudan sonucu.

### 1.2 Sesli kanalın davranış profili oturum başında, boş mesajla bir kere hesaplanıyor, sonra hiç güncellenmiyor

`voice/session/route.ts:101-104`: `resolveLivingExecutiveBehavior({ userMessage: "", surface: "realtime_voice" })` — kullanıcı henüz hiçbir şey söylemeden, oturum kurulurken çağrılıyor. `detectLivingConversationMode` (`src/lib/ai/living-executive-presence/runtime.ts:22-39`) boş metinle hiçbir kategoriye uymadığı için varsayılan `"casual"`a düşüyor.

Yazılı kanalda aynı fonksiyon her turda **gerçek mesajla** çağrılıyor (`route.ts:1006`, `:1244`). OpenAI Realtime API `session.update` ile talimatları oturum ortasında güncellemeyi destekliyor ama bu proje bunu **hiç kullanmıyor** — kod tabanında `session.update` göndermek için hiçbir client/server kodu yok. Sonuç: sesli oturumun davranış profili, konuşma ne kadar uzarsa uzasın, hep session-başındaki donmuş "casual" varsayımıyla kalıyor.

### 1.3 "Kim olduğun + nasıl davranman gerektiği" bilgisi üç ayrı, birbirinden habersiz yerde parçalanmış

- `executive-identity-prompt.ts` — sınır/yasak kuralları (~20 satır).
- `prompt-format.ts` — asıl karakter/sıcaklık talimatları (~60 satır), yalnızca yazılı kanalda.
- `living-executive-presence/runtime.ts` — STANCE/mod tespiti (anahtar-kelime tabanlı).

Bu, projenin kendi Tek Gerçeklik İlkesi'nin ihlali: aynı "METRIX nasıl konuşur" bilgisi birden fazla yerde, biri (en insani kısım) yalnızca bir kanala gidiyor.

### 1.4 Onaylı, kapsamlı bir "Executive Behavior OS" + "Executive Conversation" mimarisi var — kodda sıfır karşılığı yok

`grep -rln "Behavior Pattern\|Executive Values\|Executive Core" src` → **0 sonuç.** Bu terimler yalnızca `docs/constitution/METRIX FOUNDATION/`daki 02-06 numaralı belgelerde yaşıyor. Bu belgeler zaten Murat'ın üçüncü sorusunu (kural mı, senaryo metni mi) cevaplamış: *"Behavior Pattern, önceden yazılmış cevap şablonları değildir... aynı davranış kalıbı farklı konuşmalarda tamamen farklı ifadelerle ortaya çıkar."* Kalıplar: Dinleme, Keşfetme, Açıklama, Yönlendirme, Uyarı, Destek, Kutlama — sabit metin değil, seçilen bir *duruş*.

Bugün kodda gerçekte olan (`STANCE`: CALM/DIRECT/FIRM/CURIOUS + `living-executive-presence` modları) bu 7 kalıbın çok daha ilkel, bağımsız icat edilmiş bir versiyonu — Foundation'daki isimlendirmeyle hiç örtüşmüyor, üç katmanlı otorite zincirine (Values→Core→Orchestrator→BehaviorOS) hiç bağlı değil.

### 1.5 (destekleyici gözlem) Mevcut sistem prompt'u kural-listesi biçiminde

`executive-identity-prompt.ts` + `prompt-format.ts` birlikte 60'tan fazla "şunu söyleme / bunu söyle" satırı içeriyor (yasaklı kalıp listeleri dahil). Bu, Behavior OS'un `3.1`'de açıkça reddettiği yaklaşım. Bunun "kaç tanesi gerçekten gerekli sınır, kaçı aslında bir davranış-kalıbı seçimiyle gereksizleşir" — bu notta netleştirilmedi, önerilen fazın (§2, Faz C) parçası.

---

## 2. Önerilen faz sırası (bağlayıcı değil — §4'te Murat'ın kararı bekleniyor)

**Faz A — Sesli/yazılı asimetriyi kapat. (TAMAMLANDI, 2026-08-26, commit `8d9de79`, push edildi)** "Temel davranis onceligi" bloğu `prompt-format.ts`'in kendi dizisinden çıkarılıp `executive-identity-prompt.ts`'teki `EXECUTIVE_PRESENCE_POLICY.instructions`'a taşındı — artık `buildExecutiveIdentityPrompt()`'u çağıran her yüzey (chat, voice, realtime_voice) otomatik olarak alıyor. Ayrıca "bir selamlama veya hâl hatır sorusu kimlik sorusu değildir" carve-out'u eklendi. Regresyon testi: `executive-identity-prompt.test.ts`. Tip kontrolü, 2708 test, build temiz. §0.1'in kök nedenini kapatıyor.

**Faz B — Davranış profilini turn-aware yap. (KAPANDI — gereksiz olduğu anlaşıldı, 2026-08-26)** İlk taslakta bu notun kendisi yanlış bir mimari varsayıma dayanıyordu: "sesli cevaplar Realtime WebRTC oturumundan (`voice/session/route.ts`) geliyor" varsayımı. Bu **yanlış**. Doğrulandı (`voice-native-realtime-flag.ts:1-2`, açık kod yorumu): *"Realtime is transport/transcription only. It is never allowed to become a response producer; /api/ai/chat owns every written and spoken METRIX turn."* `isVoiceNativeRealtimeEnabled()` sabit `false`. Gerçekte `MetrixChatTab.tsx:573` — sesli VE yazılı sohbet ikisi de aynı `fetch("/api/ai/chat", ...)` çağrısını yapıyor; ses yalnızca `channel: "voice"` parametresiyle ayrışıyor, transkript metni aynı HTTP pipeline'dan (`route.ts` → `prompt-format.ts`) geçiyor. Yani:
- Realtime oturumunun `instructions`'ı (Faz A'da "düzeltildiğini" düşündüğüm yer) **hiç cevap üretmediği için** aslında etkisizdi — zararsız ama gereksiz bir düzeltmeydi.
- Faz A'nın **gerçek** etkisi, `prompt-format.ts`'e (gerçek, aktif pipeline) yeni eklenen "bir selamlama veya hâl hatır sorusu kimlik sorusu değildir" cümlesinden geliyor — bu, taşınan eski metin değil, önceden hiçbir yerde olmayan yeni bir talimat.
- Gerçek pipeline zaten her sesli turda gerçek transkript metniyle `resolveLivingExecutiveBehavior`'ı çağırıyor (`route.ts:1006`, metinle birebir aynı) — yani "donmuş davranış profili" endişesi hiç geçerli değildi, sesli kanal zaten turn-aware.

**Sonuç:** Faz A tek başına yeterli ve doğru hedefe (gerçek sesli+yazılı cevap yolu) ulaştı. Ek bir Faz B çalışması gerekmiyor.

**Faz C — Kural-listesinden kimlik+bağlam+davranış-kalıbı modeline geçiş. (TAMAMLANDI — ama beklenenden farklı bir yerde, 2026-08-26, commit `3e29640`, push edildi)**

Faz C'ye başlarken kritik bir mimari gerçek ortaya çıktı: `prompt-format.ts`'teki "60 satırlık yasak-kalıp listesi" (Faz A'da düzenlediğim `promptSections` dizisi) **production'da pratikte hiç çalışmıyor.** `route.ts:888-891`'in kendi yorumu kesin: `serializeCanonicalExecutivePrompt`'un erken dönüşü (canonical yol) *"taken whenever the four versioned Executive artefacts are present — i.e. every real turn"* — yani gerçek çekirdek prompt zaten kural listesi değil, **kimlik + `ExecutiveBehaviorPlanV1`'den gelen davranış rehberi + kanıtlanmış iş gerçekleri.** `ExecutiveBehaviorPlanV1.primaryBehavior` (LISTEN/EXPLORE/EXPLAIN/GUIDE/CHALLENGE/PROTECT/SUPPORT/ACT_WITH_USER/CONFIRM/WAIT/OBSERVE/FOLLOW_UP/RECOVER/CLOSE, `adaptExecutiveDirectiveToExecutiveBehaviorPlan`'da üretiliyor) zaten Behavior OS'un 7 davranış kalıbına çok yakın, canlı, gerçek bir sistem — yeniden icat etmeye gerek yoktu.

Bulunan iki gerçek eksik, kapatıldı:
1. `projectExecutiveConversationGuidance` yalnızca ham enum token'ını ("Davranış: LISTEN; duruş: SUPPORTIVE") yazıyordu — hangi kalıbın seçildiğini söylüyordu ama o kalıbın modelden ne istediğini hiç anlatmıyordu. Her `primaryBehavior`/`interactionPosture` değeri için doğal dil talimatı eklendi (STANCE'ın zaten yaptığı gibi).
2. `ExecutiveBehaviorPlanV1`'in `LivingBehaviorProfile.businessRedirection: "never_force"`'a karşılığı yoktu — yani gerçek, her turda çalışan prompt'ta "gündelik mesajı zorla işe çevirme" koruması hiç yoktu. `LISTEN` davranışı için eklendi.

**Not:** `prompt-format.ts`'teki ölü kod bloğu (legacy `promptSections`, ~200 satır) bu fazda dokunulmadan bırakıldı — silinip silinmeyeceği ayrı, kendi başına bir karar (aşağıda §4'e eklendi).

**Faz D — Foundation'ın tam inşası mı, mevcut sistemin güçlendirilmesi mi? (KARAR VERİLDİ, 2026-08-26): mevcut sistemi güçlendir, Foundation'ı harfiyen inşa etme.**

Gerekçe: Faz C'nin bulgusu zaten kanıtladı — canonical prompt yolu (her turda çalışan gerçek yol) kimlik + `ExecutiveBehaviorPlanV1` davranış-planı + kanıt modeline dayanıyor, Foundation'ın istediği şeye yapısal olarak zaten yakın. `primaryBehavior` (LISTEN/EXPLORE/EXPLAIN/GUIDE/CHALLENGE/PROTECT/SUPPORT/...) Behavior OS'un 7 davranış kalıbının büyük kısmını zaten karşılıyor. Bugün çözülen üç gerçek hata (soğuk "nasılsın", sesli liste okuma, iş-analizine zorlama) hiçbiri yeni bir mimari katman gerektirmedi. Foundation'ı sıfırdan, kendi isimlendirmesiyle inşa etmek iki riski taşır: (1) zaten var olan özü yeniden yazmak — yeni değer değil, yeniden adlandırma; (2) 22 Ağustos denetiminin şikayet ettiği deseni tekrarlamak (44+ executive-* modül, hangisi gerçek belli değil). **Foundation belgeleri bundan sonra bir denetim rubriği olarak kullanılacak** (7 davranış kalıbı, kimlik-taşıma, uyarlanabilirlik ilkeleriyle mevcut sistemi sınayıp somut boşlukları kapatmak) — Faz A/C'nin yaptığı gibi, yeni bir katman inşa etmek değil.

---

## 3. Sesli liste-okuma hatası — bu oturumda zaten kapatıldı (referans için)

`resolveBusinessNavigation`'ın `CUSTOMER_LIST` kanıtı (`business-navigation.ts:198-204`), tüm müşteri isimlerini (`recordNames`) hiçbir sınır olmadan hem model prompt'una hem sesli kanalın kullandığı deterministik cevaba (`route.ts`'teki `buildBusinessNavigationMessage`) enjekte ediyordu — üstelik modele "hepsini say" talimatı vardı. `sampleRecordNamesForNarration()` (`business-navigation.ts`) eklendi: artık her yerde ilk 8 isim + gerçek kalan sayı kullanılıyor. Genelleştirilmiş bir yardımcı fonksiyon olduğu için, gelecekte benzer bir "listeyi aç + isimleri say" deseni ekleyen herhangi bir domain (stok, sipariş, tedarikçi...) bunu yeniden keşfetmek zorunda kalmadan kullanabilir — Murat'ın "yarın stoklarda da olur mu" endişesi bu şekilde adreslendi.

Commit: `c44f8c3` (push edildi). Tip kontrolü, tam test paketi (2707 test), production build temiz.

---

## 4. Kararlar (hepsi 2026-08-26'da verildi)

1. ~~**Faz D**~~ → KARARLAŞTI: mevcut sistemi güçlendir, Foundation'ı harfiyen inşa etme (§2, Faz D notu).
2. ~~**Faz sırası**~~ → A→B(gereksiz)→C→D sırasıyla uygulandı, hepsi kapandı.
3. **Eski görev metniyle ilişki** → KARARLAŞTI: aynı büyük işin parçası, ayrı fazlar değil. 2.1/2.2 zaten çözülmüş bulundu (§5). Kalan tek gerçek açık madde — **2.3, ezber cümle sızıntısı** — sistematik bir tarama gerektiriyor, bu notun **sıradaki fazı** (§6).
4. **Kapsam (3 yeni Foundation belgesi):** Henüz okunmadı — bir sonraki oturumun ilk işi (§6).
5. **Ölü kod:** KARARLAŞTI — kalsın. `prompt-format.ts`'teki legacy `promptSections` dizisi production'da hiç çalışmıyor ama üretim riski sıfır (yalnızca `NODE_ENV !== "production"` ise erişilebilen `/api/ai/gateway-test` ve `/api/ai/mock-response` dev-test endpoint'leri için opsiyonel bir API sözleşmesi) — silmek büyük, riskli bir refactor'e dönüşürdü (birçok formatter fonksiyonu `export` edilmiş, başka yerlerde de kullanılıyor olabilir), gerçek bir değeri yok.

---

## 6. Sıradaki faz — Ezber Cümle Sızıntısı (2.3), henüz başlanmadı

`METRIX_TASK_BRIEF_metrix-karakter-ve-canli-sohbet-akisi.md`'nin 2.3 maddesi doğrulandı, hâlâ açık: `src/lib/executive-brain/ai-general-manager-brief.service.ts`'teki `translateDecisionTitle`/`buildOpeningMessage` (kategoriye göre sabit cümle döndüren fonksiyonlar) `route.ts:2473`'te "shadow" modunda (pipeline A) çalışıyor, mesaj metadata'sına yazılıyor, bir sonraki turda dolaylı etki yapabiliyor — konuyla alakasız bir yerde ("tahsilat ve nakit riski...") ortaya çıkabiliyor. Spesifik tetikleyici kapalı, mekanizma hâlâ açık.

**Kapsam (brief'in kendi sözüyle):** Yalnızca bu dosya değil — `manager-advice-guidance.service.ts`, `executive-performance-signal/` ve genel olarak "executive brain" ailesindeki tüm sabit/şablon cümle üreten fonksiyonların sistematik taranması gerekiyor. Ayrıca eski brief'in 1.1 (navigasyonun neden COMPLETED'a ulaşamadığı, derinleştirme) ve 1.2 (istemci tarafında iki paralel yazma yolu, `MetrixChatTab.tsx`) maddeleri de bugün yeniden doğrulanmadı — bir sonraki oturumun ilk işi bunları güncel kodla yeniden teyit etmek olmalı, sonra 2.3'e geçilmeli.

**Bu, bugünkü oturumdan daha büyük, ayrı bir keşif+tarama işi — henüz hiç başlanmadı.**

---

## 5. Eski, hâlâ açık görev metniyle ilişki

`METRIX_TASK_BRIEF_metrix-karakter-ve-canli-sohbet-akisi.md` (21 Ağustos) bu notla **aynı büyük konuyu** (METRIX'in karakteri/iletişimi) ele alıyor ama **farklı, örtüşmeyen bulgulara** dayanıyor:
- Metin/ses arasında söylenenle yazılan tutarsızlığı (client-side, `MetrixChatTab.tsx`'teki iki paralel yazma yolu) — bu not hiç dokunmadı.
- METRIX'in kendi adını ("Metriks" yazım hatasını) tanımaması — bu not hiç dokunmadı.
- Kullanıcı düzeltmesine insan gibi karşılık verememe — bu not hiç dokunmadı.
- Executive-brain ailesinden sızan ezber cümleler — bu not hiç dokunmadı, ama §1.5'teki "kural-listesi" gözlemiyle aynı ailede bir sorun.

Bu iki not **birbirini geçersiz kılmıyor, tamamlıyor.** İkisi de "METRIX her an kullanıcıyla yaşasın" hedefine hizmet ediyor ama farklı katmanlardan (biri client-side senkronizasyon + sınıflandırma boşlukları, diğeri sesli/yazılı prompt asimetrisi + mimari-uygulama boşluğu). Bir sonraki oturum ikisini birlikte okuyup, tek bir birleşik faz planına (muhtemelen §2'deki A-D'nin içine, ilgili maddeleri doğru fazlara yerleştirerek) karar vermeli — bu karar da Murat'a ait (§4.3).

---

## 7. §6'nın sonucu — Foundation okuması + 1.1/1.2 yeniden doğrulama + 2.3 taraması (2026-08-26, tamamlandı)

Dört paralel araştırma yapıldı (kod değişikliği yok, salt keşif). Sonuçlar:

### 7.1 Foundation 02-04 okundu

`02 - Executive Core`, `03 - Executive Values`, `04 - Executive Orchestrator` (bu sonuncusu aslında iki belge: "Executive Intent Engine" + "Executive Orchestrator"). Üçü de kalıp/şablon davranışa karşı açık, tekrarlanan bir duruş içeriyor:
- 03 §7.1/7.8: *"METRIX için tutarlılık, aynı cümleleri tekrar etmek değildir... Tutarlılık tekrar değildir."*
- 02 §9.10: Executive Core *"davranış listesi değildir."*
- 04 §2.1: Niyet *"hazır senaryolar veya sabit akışlardan"* seçilmez.
- 04 §9.3: Strateji *"önceden tanımlanmış senaryolardan"* seçilmez.

Karar sırası (03 §10.3): Values → Core → yönetim muhakemesi → davranış. Akış sırası (04 §5.2): Durum anlaşılır → Executive Brain değerlendirmesi → Intent → Behavior OS → Conversation → Voice. Bu dört belge birlikte, §1.5'te bulunan "kural-listesi" ve 2.3'teki "ezber cümle" bulgularını **anayasal olarak zaten yasaklıyor** — yeni bir ilke eklemeye gerek yok, mevcut Foundation zaten net.

### 7.2 Eski brief §1.1 yeniden doğrulandı — GERÇEK, YENİ KÖK NEDEN BULUNDU

`resolveNavigationAssistantContent` (`executive-navigation-command.ts:20-23`) hâlâ aynı: `COMPLETED` değilse gerçek içerik atılıp sabit fallback cümle kullanılıyor.

Yeni bulgu: `ExecutiveNavigationCommandHost.tsx:19-38` (`presentWorkspaceDirective`, commit `263e34e`), hedef yüzey zaten açıksa (`sameTarget`) `livingWorkspaceRuntime.publish(directive)`'i **atlıyor**. Ama `LivingWorkspaceHost.tsx:97`'deki `completePresented` tetikleyicisi `navigationCommand.correlationId === directive.correlationId` şartına bağlı — republish atlandığı için bu correlationId hiç güncellenmiyor, yeni turun (turn-bazlı) correlationId'siyle asla eşleşmiyor, komut APPLYING'de asılı kalıp 10 saniye sonra `EXPIRED`'a düşüyor → fallback metin.

Bu düzeltme yalnızca **takvim alt-senaryosuna** uygulanmış (`calendarRefinementChanged` kontrolü, `ExecutiveNavigationCommandHost.tsx:33-35`). Takvim dışındaki **tüm domainler** (müşteri, teklif, sipariş, stok, tedarikçi...) "zaten açık yüzeye yeniden navigasyon" durumunda hâlâ kronik olarak `EXPIRED`'a düşüyor. Projenin kendi testi (`ExecutiveNavigationCommandHost.test.ts:23-34`) mekanizmayı kelimesi kelimesine tarif ediyor — yani bilinen ama yalnızca tek domain için kapatılmış bir açık.

**Bu, §0.1'deki "soğuk cevap" kadar somut, muhtemelen daha sık tetiklenen bir hata kaynağı** — herhangi bir domainde kullanıcı zaten açık bir kayıt hakkında takip sorusu sorduğunda (çok yaygın bir senaryo) tetiklenebilir.

**DÜZELTİLDİ, 2026-08-26.** `LivingWorkspaceRuntime`'a `retarget(correlationId)` eklendi (`src/lib/living-workspace/runtime.ts`) — `publish()`'in aksine `directiveId`'yi korur, `history`'e itmez, `surfaceOpen`'ı sıfırlamaz; yalnızca mevcut direktifin `correlationId`'sini yeni turun correlationId'siyle güncelleyip yayınlıyor. `presentWorkspaceDirective` (`ExecutiveNavigationCommandHost.tsx`) artık `alreadyPresented` durumunda komple atlamak yerine `retarget()` çağırıyor — böylece `LivingWorkspaceHost.tsx:96-97`'deki `completePresented` şartı (`navigationCommand.correlationId === directive.correlationId`) her domainde eşleşebiliyor, yalnızca takvimde değil. Regresyon testleri: `living-workspace.test.ts` (`retarget()` davranışı) ve `ExecutiveNavigationCommandHost.test.ts` (yeni kod yolunun varlığı). Tip kontrolü temiz, tam test paketi (2713 test) geçti, production build temiz. Commit/push yapılmadı (talep edilmedi).

### 7.3 Eski brief §1.2 yeniden doğrulandı — ARTIK GEÇERSİZ, ZARARSIZ

İki path (`activeTextGenerationRef`/`streamingContent` ve `activeVoiceRevealGenerationRef`/`orchestrator.revealedText`) hâlâ kodda var ama artık yalnızca görünüm/scroll'u yönetiyor, mesaj İÇERİĞİNİ değil (`conversationViewport.ts:51-91`). Kalıcı mesaj tek yazarlı bir devirle geliyor: ses modunda `done` event'inde `setMessages` çağrılmıyor, `pendingVoiceCanonicalRef` yazılıyor, gerçek yazma TTS kuyruğu tamamen bitince `onComplete` callback'inde oluyor (`MetrixChatTab.tsx:174-182`). Bu, `MetrixChatTab.voice-reveal-ownership.contract.test.ts` ile kilitli, kasıtlı bir tasarım.

Kalıcı içerik her zaman `finalContent = resolveNavigationAssistantContent(ai.content || streamed, navigationCompletion)` (`MetrixChatTab.tsx:722-723`) — yani **§1.2'nin "iki path" tespiti artık geçersiz**, gerçek risk tamamen §7.2'deki `resolveNavigationAssistantContent`/correlationId hatasında yoğunlaşıyor. 2026-08-21 notundaki tespit süresi içinde başka bir çalışmayla (ownership-contract testi) zaten kapatılmış.

### 7.4 §2.3 taraması tamamlandı — öncelik sırası belirlendi

Taranan: `executive-brain/` (tüm dizin), `manager-advice/manager-advice-guidance.service.ts`, `executive-performance-signal/`, ve geniş bir `src/lib`+`src/app/api/ai` taraması.

**Öncelik 1 — hâlâ canlı risk:** `manager-advice-advisory-prompt.service.ts:108` (`buildCategoryGuidance`) + `manager-advice-guidance.service.ts:42` (`CATEGORY_RISKS`). Bunlar gerçekten prompt'a giriyor (`prompt-format.ts:117` üzerinden). Kategori/readiness her turda o anki mesajdan yeniden hesaplanıyor (iyi bir koruma) ama tek gerçek kapı sınıflandırıcının `confidence === "HIGH"` eşiği — yanlış sınıflandırma (kodun kendi yorumu bunu zaten kabul ediyor, satır 19-27: jenerik kelimeler yanlış eşleşebilir) durumunda kalıp risk cümleleri alakasız bir turda çıkabilir. **Bu, eski brief'in bulduğu orijinal hatayla (ai-general-manager-brief.service.ts) yapısal olarak aynı desen, henüz kapatılmamış.**

**DÜZELTİLDİ (kısmen), 2026-08-26.** `manager-advice-classifier.service.ts`'te iki somut jenerik-kelime yanlış-pozitif kaynağı bulundu ve `high`'dan `medium`'a indirildi:
1. **PRICING**: çıplak `\bfiyat[a-zçğıöşüı]*\b` — "fiyatı güncelle", "fiyat listesini göster" gibi tamamen rutin sorguları bile HIGH'a düşürüp PRICING risk bloğunu enjekte ediyordu. Zaten dosyanın kendi yorumunun (advisory-prompt.service.ts:19-27) "teklif"/"stok"/"hedef" için tanımladığı tam olarak aynı istisna sınıfı — unutulmuş bir örnek.
2. **SALES**: `\byeni\s+müşteri\b` — ürünün kendi "Yeni Müşteri" oluşturma rotasıyla (`/metrix/customers/new`) birebir çakışıyor; rutin bir "yeni müşteri ekle" isteği bile SALES risk bloğunu tetikliyordu.

Regresyon testi: `manager-advice-classifier.test.ts` (yeni dosya) — hem demote edilen çıplak kelimelerin artık MEDIUM'a düştüğünü hem gerçek karar-sinyallerinin (pahalı/yüksek bul/indirim, potansiyel müşteri) hâlâ HIGH kaldığını hem de MEDIUM'da risk bloğunun bastırıldığını doğruluyor.

**DÜZELTİLDİ, 2026-08-26.** Ayrı bulunan sistemik hata da aynı oturumda kapatıldı: JS'in `\b` (word boundary) davranışı Türkçe'ye özgü karakterleri (ı, ş, ğ, ü, ö, ç) `\w` saymıyor, bu yüzden `\b...ı\b` gibi Türkçe karakterle BAŞLAYAN veya BİTEN bir kalıpla anchor'lanmış herhangi bir regex **hiçbir zaman eşleşmiyordu** (örnek: `/\bpahalı\b/u` "pahalı" kelimesinin kendisine bile eşleşmiyordu; `/\bönceliğim\b/u`, `/\bödeme\s+alam/u` de aynı şekilde bozuktu). Dosyadaki bazı kategoriler bunun için elle ASCII-normalize edilmiş bir yedek kalıp tanımlamıştı (`pahali` yanında `pahalı`), ama bu yalnızca kullanıcı ASCII karakterle yazarsa işe yarıyordu — düzgün Türkçe klavyeyle yazan kullanıcılarda sessizce eksik eşleşmeye yol açıyordu (bu oturumun asıl konusu olan "fazla eşleşme"nin tam tersi bir hata, ama aynı kök mekanizma).

`~90 pattern'i tek tek elle düzeltmek yerine, `manager-advice-classifier.service.ts`'e `turkishAwareBoundary()`/`turkishAwareRule()` eklendi — her regex'in `.source`'undaki `\b` token'ları, Türkçe harfleri de kelime karakteri sayan Unicode-property tabanlı bir lookaround eşdeğeriyle (`\p{L}`/`\p{N}` kullanarak) mekanik olarak değiştiriliyor. Yalnızca sınır semantiği değişti, eşleşen kelime içeriği/niyeti aynı kaldı — hiçbir pattern'in metni elle düzenlenmedi, bu yüzden ~90 pattern'i tek tek yeniden doğrulama riski taşımıyor.

Regresyon testi: `manager-advice-classifier.test.ts`'e yeni bir `describe` bloğu eklendi — hem Türkçe harfle biten/başlayan kelimelerin artık doğru eşleştiğini ("pahalı", "önceliğim", "ödeme alamıyorum") hem de bunun aşırı-genişlemeye yol açmadığını (örn. "tahsilatçı" hâlâ "tahsilat"a yanlışlıkla eşleşmiyor, "vadesi" hâlâ "vade"ye yanlışlıkla eşleşmiyor) doğruluyor. Tip kontrolü temiz, tam test paketi (2721 test) geçti, production build temiz.

**Öncelik 2 — artık kapalı ama kanca duruyordu → DÜZELTİLDİ, 2026-08-26.** `ai-general-manager-brief.service.ts`'in tüm kalıp-cümle fonksiyonları hâlâ var ve hâlâ kategoriye göre sabit metin üretiyor — ama `route.ts`'teki `buildProgressiveEnrichmentEvidence` artık bunları **bilinçli olarak** LLM evidence'ından dışlıyor (kod yorumu bunu tam olarak açıklıyordu). Sorun: `ProgressiveEnrichmentInput` tipi `executiveBrain`/`executiveAssessment` alanlarını hâlâ taşıyordu — fonksiyon gövdesi onları hiç okumuyordu ama alan zaten scope'ta, ithal edilmeye gerek kalmadan hazır duruyordu. Gelecekte birinin bu kısıtlamayı fark etmeden `input.executiveBrain.brief...`'e uzanması çok kolaydı.

Kapatıldı: `ProgressiveEnrichmentInput` tipinden `executiveBrain`/`executiveAssessment` alanları tamamen çıkarıldı (yalnızca fonksiyon gövdesinde kullanılmıyor değil, tipin kendisinde de artık yok), çağrı noktası da tüm `progressiveIntelligence` nesnesini değil yalnızca `{ cognitionObservation }`'ı geçirecek şekilde daraltıldı. Artık bu veriyi geri getirmek, tipi bilinçli olarak genişletmeyi gerektiriyor — sessizce, fark edilmeden olmuyor. Regresyon testi: `progressive-enrichment.contract.test.ts`'e yeni bir test eklendi (tipin `executiveBrain` içermediğini ve çağrı noktasının daraltılmış olduğunu doğruluyor). Tip kontrolü temiz, tam test paketi (2722 test) geçti, production build temiz.

**Öncelik 3 — bağlı değil:** `executive-performance-signal-engine.service.ts` kalıp cümle üretiyor ama tek tüketicisi `src/app/api/reports/board/route.ts` (board raporu) — chat LLM pipeline'ına hiç bağlı değil, şu an risk yok.

---

## Kapanış notu

Bu not, projenin kendi disiplinine uygun: kod yazmadan önce kanıt topladık, kanıtı kaynak göstererek yazdık, ve büyük kararı (Faz D, ve şimdi §7'deki üç bulgudan hangisinin/hangilerinin öncelikli düzeltileceği) Murat'a bıraktık. Murat bu notu okuduktan ve §4'teki (ve şimdi §7'nin sonundaki) soruları cevapladıktan sonra, uygun faz doğrudan başlayabilir — yeniden keşfe gerek yok.
