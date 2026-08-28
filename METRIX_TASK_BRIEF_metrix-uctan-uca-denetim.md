# Görev Metni: Metrix Uçtan Uca Denetim + Karakter/Otorite Düzeltmeleri

**Durum:** Murat'ın doğrudan direktifi — arayüz/domain/orkestrasyon işine geçmeden önce Metrix'in kendisinin (temel muhakeme + karakter + bağlı sistemler) sorunsuz çalıştığından emin olmak. Bu belge şu üç görev metnini **yerini alarak birleştiriyor** — onlar artık ikincil/tarihsel, bu belgeye bakılsın: `METRIX_TASK_BRIEF_cognitive-stack-faz1-kesif.md`, `METRIX_TASK_BRIEF_sesli-sohbet-ve-belge-yukleme-kesif.md`, ve `METRIX_TASK_BRIEF_canli-arayuz-ve-karakter.md`'nin Madde 3'ü (karakter).

**Önemli not — mobil girdi kutusu hatası hâlâ ayrı, hızlı bir düzeltme:** `canli-arayuz-ve-karakter.md` Madde 1 (mobilde workspace kartının sohbet giriş kutusunu ezmesi) ve Madde 2 (müşteri satır tasarımı) bu belgenin kapsamı DIŞINDA — o dosya kendi başına geçerliliğini koruyor, ayrıca/paralel yürütülebilir.

---

## Arka Plan — İki Büyük Kanıt Bulundu

**1) Stale ama son derece değerli bir önceki denetim var: `docs/constitution/reports/METRIX_Constitution_Audit_2026-07-25.md`.** Bu, commit `94046f9`'da (25 Temmuz 2026) yapılmış, tam bir statik kod denetimi — `route.ts`/`ai-gateway.ts` üzerinden METRIX'in tek otorite olup olmadığını, hangi bileşenlerin METRIX'in yerine geçip kullanıcıya "METRIX'in cevabı" gibi içerik sunduğunu satır satır kanıtlıyor. **3 P0 bulgusu var** (Bölüm 4): (a) `detectExecutiveGap`/`getGapSafeFallback` — bazı durumlarda LLM hiç çağrılmadan 5 sabit Türkçe cümleden biri `provider:"mock"` etiketiyle METRIX cevabı gibi döner (`route.ts:492-565`); (b) `resolveProviderName` — `AI_PROVIDER` env değişkeni tam olarak `"openai"` değilse sessizce mock sağlayıcıya düşer, TÜM cevaplar şablon olur (`ai-gateway.ts:405-417`); (c) `completeExecutiveAction`/`applyCollectionActionLifecycle`/`applyQuoteWorkflowLifecycle` — anahtar-kelime güven skoruna dayanarak, METRIX'in ürettiği cevaptan bağımsız, onay olmadan iş durumu değiştiriyor (aksiyon kapatma, teklif WON/LOST). **Bu üç bypass, "Metrix karaktersiz/chatbot gibi konuşuyor" şikayetinin en olası kök nedenlerinden biri** — bazı cevaplar hiç LLM'den gelmiyor olabilir.

**Kritik uyarı:** Bu denetim şu an **138 commit gerisinde**. Ground truth değil, doğrulanması gereken bir hipotez listesi olarak kullan. Rapor kendi içinde çok değerli bir metodoloji ve hedef mimari (Bölüm 12) de sunuyor.

**2) Murat'ın verdiği `Metrix_Foundation_2.zip` içinde, canlı karakter sorununu doğrudan çözecek, hiç koda bağlanmamış bir belge bulundu: `docs/constitution/METRIX FOUNDATION/Domain_Sözleşme/Foundation/METRIX Executive Personality Engine — Runtime Blueprint 1.0.docx`.** Bu, karakter tarifi değil, gerçek bir **çalışma zamanı mimarisi**: mesajın izleyeceği tam katman zinciri, her katman için veri sözleşmeleri, bir "Behavior Plan" içinde STANCE (CALM/DIRECT/FIRM/CURIOUS...) mekanizması, ve — en somut kısım — **yasaklı jenerik açılış cümleleri listesi** ("Tabii, hemen yardımcı olayım", "Elbette, buna birlikte bakalım", "Harika bir soru" gibi ifadeler açıkça yasaklı) + bunun yerine gerçek yönetim muhakemesiyle başlayan örnek cümleler. Bu belge kendi sonunda "henüz production koduna eşlenmedi" diyor — yani **doğrudan uygulanabilir ama hiç uygulanmamış**.

---

## Stage A — Temmuz 25 Denetimini Yeniden Doğrula (hızlı, checklist-driven)

Amaç: kod değişikliği yapmadan önce, yukarıdaki 3 P0 + Bölüm 4'teki P1 bulgularının **bugünkü HEAD'de hâlâ doğru olup olmadığını** doğrula. Rapor sana tam dosya:satır veriyor — sıfırdan taramak yerine bu satırların bugün hâlâ aynı şekilde davranıp davranmadığını kontrol et (dosya taşınmış/yeniden adlandırılmış olabilir, `git log -p` ile takip et).

Her P0/P1 için üç olası sonuç: **(i) hâlâ aynen doğru**, **(ii) kısmen düzelmiş/değişmiş** (nasıl değiştiğini açıkla), **(iii) artık geçersiz** (neden, hangi commit kaldırmış).

Ayrıca aşağıdaki üç ek konuyu da bu aşamada doğrula (önceki 3 keşif görev metninin yerini alan kısım):
- **ExecutiveMindState isim çakışması:** `src/lib/ai/executive-conversation.types.ts`'teki `ExecutiveMindState` (konuşmaya özel, kalıcılığı yok) ile `executive-cognitive-stack-v1.md`'nin tarif ettiği Mind State (konuşmadan bağımsız, sürekli) arasındaki çakışma hâlâ duruyor mu? Duruyorsa, rename/genişletme kararını **kod yazmadan** öner (bu, Murat'ın vereceği bir karar).
- **Native realtime sesli sohbet:** `src/lib/voice/voice-native-realtime-flag.ts`'teki `isVoiceNativeRealtimeEnabled()` hâlâ koşulsuz `false` mü? Bu kararın gerekçesini `git log -p` ile doğrula, gerçek mimari gerilimi (realtime model cevap üretirse kanonik muhakeme hattını atlar) teyit et, en az iki çözüm yolu öner (transport-only realtime vs. sınırlı-kapsamlı içerik-üretici realtime).
- **Belge→müşteri akışı:** `customer-document-attachment.service.ts` + `customer-ingestion-preview-runtime.ts` + ilgili extraction/commit servisleri gerçekten uçtan uca çalışıyor mu (yerelde/seed ortamda dene), sohbet arayüzünde keşfedilebilir mi?

## Stage B — Yasaklı Jenerik Cümleler + Behavior Plan (Personality Engine'den, en yüksek öncelik)

Amaç: canlıdaki "chatbot gibi" hissi en doğrudan şekilde azaltmak.

1. Personality Engine belgesindeki **yasaklı jenerik açılış/kapanış cümleleri listesini** çıkar (belgeyi oku — docx skill ile), sistem promptuna açık bir kısıt olarak ekle: bu ifadeler ve eşdeğerleri ("Başka nasıl yardımcı olabilirim?", "başka isteğin var mı?" dahil, önceki denetimde bulunmuştu) üretilmemeli.
2. Belgedeki STANCE (CALM/DIRECT/FIRM/CURIOUS vb.) mekanizmasının basitleştirilmiş bir ilk versiyonunu değerlendir — tam pipeline'ı bu turda kurmak zorunda değilsin, ama en azından "METRIX'in konuşma pozisyonu duruma göre değişir, tek düze nötr ton değil" ilkesini sistem promptuna kısıt olarak ekle.
3. Bu maddeyi Stage A'nın P0 bulgularından **bağımsız** commit'le — biri diğerini beklemesin.

## Stage C — Leadership DNA'yı Bağla (kim olduğu, Stage B'nin tamamlayıcısı)

`docs/constitution/source/metrix-liderlik-dnasi.md` (Leadership DNA v1.2, CANONICAL — karakter/kimlik tarifi: 60 yaş üstü, karizmatik/olgun/bilge/babacan-anaç) sistem promptuna hâlâ bağlı değilse bağla. Stage B "nasıl konuşur" (mekanizma), Stage C "kim konuşuyor" (kimlik) — ikisi tamamlayıcı, aynı commit'te olabilir ama raporda ayrı ayrı doğrulanmalı (gerçek konuşma transkriptiyle, kod diff'i yetmez).

---

## Bu Turun KAPSAMI DIŞINDA Bırakılanlar (bilinçli, Murat'ın kararı bekleniyor)

Aşağıdakiler bu görev metninde **çözülmeyecek** — yalnızca Stage A'da doğrulanıp raporda not düşülecek, karar Murat'a bırakılacak:

- Stage A'nın P0 bulgusu (c) — onaysız otomatik durum değişikliği servisleri — **yalnızca doğrula, henüz düzeltme**. Bunu kaldırmak/Confirmation Gate'e bağlamak iş akışını değiştirir, ayrı bir onay gerektirir.
- **Yönetici Motoru Anayasaları (Karar/Eylem/İletişim/Orkestrasyon Motoru, `Domain_Sözleşme/23-26`) ile `executive-cognitive-stack-v1.md`'nin katman modeli arasındaki isim çakışması** — dört kavram ("Karar", "Orkestrasyon", "Eylem", "İletişim") iki ayrı belge ailesinde iki farklı anlamda kullanılıyor, birbirine hiç atıf yok. Bu bir kod değişikliği değil, mimari netleştirme kararı — Murat'a ayrıca sorulacak.
- **METRIX_Etkileşim.docx hâlâ hiçbir yerde bulunamadı** — Kurucu Anayasa ondan spesifik alıntılar yapıyor ama fiziksel dosya repoda yok, yeni teslim edilen zip'te de yok. Kod değişikliği gerektirmiyor, yalnızca not düşülüyor.
- Dock/çok-sayfa varsayan, henüz "reddedilmiş" diye etiketlenmemiş belgeler (`METRIX Experience & Design Vision.docx`, `02 - Şirketim Domain Kurucu Mimarisi 1.0.docx`, `İşletme Sistemi Kurucu Mimarisi 1.0.docx`) — dokümantasyon hijyeni, kod etkisi yok, kod tarafında zaten tek-yüzey kilitli (`tek-yuzey-kesin-kilit` fazı).

---

## Kısıtlar

- Stage A kod değişikliği içermez (yalnızca doğrulama + Personality Engine'den madde çıkarma).
- Stage B/C: yeni Prisma modeli yok, var olan prompt-format.ts/identity katmanını genişlet, yeni paralel bir kimlik sistemi kurma.
- Onaysız otomatik durum değişikliği servislerine (P0-c) bu turda dokunma — yalnızca doğrula ve raporla.
- Native realtime flag'i bu turda açma — yalnızca analiz et, öner.

## Kabul Kriterleri

- Stage A: her P0/P1 bulgusu için güncel durum (i/ii/iii) + dosya:satır kanıtı.
- Stage B/C: en az 4-5 gerçek konuşma turu transkripti — yasaklı cümlelerin gerçekten çıkmadığı, tonun karakterle örtüştüğü gösterilmeli.
- Kapsam dışı bırakılan maddeler raporda ayrı bir bölümde, Murat'a sorulacak sorular olarak listelenmeli.

## Rapor Beklentisi

Kısa, yapılandırılmış: Stage A bulgu tablosu (hâlâ doğru / değişmiş / geçersiz), Stage B/C değişen dosyalar + transkript kanıtı + commit hash, kapsam dışı bırakılan kararlar listesi. Anlatı yok.
