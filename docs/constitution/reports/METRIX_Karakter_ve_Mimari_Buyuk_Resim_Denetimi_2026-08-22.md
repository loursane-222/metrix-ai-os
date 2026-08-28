# METRIX — Karakter ve Mimari Büyük Resim Denetimi

Tarih: 2026-08-22
Talep eden: Murat
Tetikleyen: "kaç müşterimiz var" sorusuna METRIX'in art arda iki çelişen cevap vermesi — ve bunun tek seferlik bir hata değil, tekrarlayan bir mimari desenin semptomu olduğu gözlemi.

**Yöntem:** Bu, yeni bir denetim değil, mevcut canonical kaynakların (aşağıda listeli) senteziyle bir "şu an neredeyiz" tespiti. Aynı soruyu daha önce iki kez (2026-07-25, 2026-08-07) sormuş ve kısmen cevaplamış bir denetim zinciri zaten var; bu belge onu tekrar etmiyor, güncel koddaki canlı bir hatayla (bugünkü sohbet) doğruluyor ve tek bir sentez noktasında topluyor.

**Okunan canonical kaynaklar:**
- `docs/constitution/source/metrix-buyuk-resim-vizyon-v1.md` (ürün vizyonu)
- `docs/constitution/source/metrix-liderlik-dnasi.md` (Leadership DNA v1.2)
- `docs/constitution/source/metrix-sohbet-anayasasi.md` (sohbet/toplantı felsefesi)
- `docs/constitution/source/executive-cognitive-stack-v1.md` (referans, bu turda tam okunmadı — v2 üzerinden)
- `docs/constitution/source/executive-cognitive-stack-v2.md` (Karar/Eylem/İletişim/Orkestrasyon motorlarının Stack'e bağlanışı)
- `docs/constitution/reports/METRIX_Constitution_Audit_2026-07-25.md` (ilk mimari denetim)
- `docs/constitution/reports/METRIX_End_to_End_Audit_2026-08-07.md` (re-doğrulama)
- `docs/constitution/reports/METRIX_Executive_Cognitive_Stack_Phase1_2026-08-07.md` (Faz 1 inşa raporu)
- `docs/constitution/reports/METRIX_Domain_Tamamlama_Denetimi_2026-08-08.md` (29 domain durumu)
- Bugünkü canlı sohbet ekran görüntüleri ("kaç müşterimiz var" — iki çelişen cevap)

---

## 1. Yönetici Özeti

Sorulan soru "METRIX şu an vizyonun neresinde?" için tek cümlelik cevap:

**Kimlik/söz katmanı büyük ölçüde doğru inşa edilmiş; muhakeme/tutarlılık katmanı hâlâ vizyonun gerisinde — ve bu iki durum arasındaki fark, bugün canlıda gördüğün çelişkinin doğrudan nedeni.**

Daha açık: METRIX'in *ne söylediği* (kimlik, ton, STANCE, yasaklı kalıp cümle listesi) üzerinde ciddi ve doğrulanmış ilerleme var. METRIX'in *aynı anda tek bir zihinle mi konuştuğu* (tek otorite, tutarlılık, derin muhakemenin canlı cevaba geri dönmesi) üzerinde ise **27 Temmuz'dan beri bilinen ve hâlâ kapanmamış bir mimari boşluk var** — bugünkü "kaç müşterimiz var" çelişkisi bu boşluğun yeni bir görünümü, yeni bir hata değil.

Ayrıca: **bu büyük resmi zaten üç kere yazdık.** İlk anayasa denetimi (25 Temmuz), uçtan uca re-doğrulama (7 Ağustos), cognitive stack v2 birleşme kararı (7 Ağustos), 29 domain tamamlanma denetimi (8 Ağustos) — hepsi zaten bu soruyu soruyor ve büyük ölçüde cevaplıyor. Sorun "büyük resmi bilmiyoruz" değil; **büyük resmin ürettiği öncelikli yol haritası (Faz 10-13) durdu, yerine tek tek görev-parçası (task brief) üretimi devam etti.** Bugün 60'tan fazla `METRIX_TASK_BRIEF_*.md` dosyası repo kökünde untracked duruyor — bu, senin şikâyet ettiğin "at gözlüğü" çalışma biçiminin somut kanıtı.

---

## 2. Sorularının Doğrudan Cevabı

### Karakter doğru inşa edilmiş mi, ana fikre uygun mu?

**Kısmen evet, ölçülebilir kanıtla.** 7 Ağustos'ta Leadership DNA'nın (25+ yıl, 60+, karizmatik/olgun/bilge, babacan/anaç, kanıta bağlı itiraz) tek bir `EXECUTIVE_PRESENCE_POLICY`'ye bağlandığı doğrulandı (`src/lib/ai/identity/executive-identity-prompt.ts`), STANCE (CALM/DIRECT/FIRM/CURIOUS) davranışı eklendi, yasaklı jenerik açılış/kapanış cümleleri kilitlendi ve gerçek model transkriptinde **0/5 yasaklı kalıp** ölçüldü. Bu gerçek, test edilmiş ilerleme.

Eksik kalan: Leadership DNA'nın "her gün biraz daha öğrenir" ve "veriyi kendi başına takip eder, ne zaman konuşması gerektiğine kendi karar verir" maddeleri — bunlar karakter tarifinde var ama derin muhakemenin (executive-brain/executive-intelligence) aynı turun cevabına hiç girmemesi yüzünden (bkz. §3) **karakterin kendisi doğru yazılmış olsa da, o karakterin "derin tarafı" kullanıcıya hiç ulaşmıyor.** Kimlik doğru; o kimliğin en değerli parçası (muhakeme) sahneye çıkmıyor.

### Mimari açıdan karmaşadan uzak mı?

**Hayır, ve bu belgelenmiş, tek seferlik bir izlenim değil.** Kanıtlar:
- `src/lib` altında 44+ farklı `executive-*` üst modül (25 Temmuz denetimi).
- Aynı işi yapıyor gibi görünen iki fonksiyon: `buildExecutiveDecisionPackage` (`executive-brain/`, canlı sohbette gerçekten çalışıyor) ve `buildExecutiveDecisionResult` (`executive-decision-engine/`, yalnızca aylık board raporunda çalışıyor, sohbete hiç bağlı değil) — 7 Ağustos'ta bu ikisinin "kasıtlı mı yoksa yanlışlıkla paralel mi" olduğu **hâlâ doğrulanmadı**, ayrı bir görev metnine (`METRIX_TASK_BRIEF_cognitive-stack-faz10-11.md`) bırakıldı.
- Yönetici Orkestrasyon Motoru ve Yönetici İletişim Motoru — vizyonun kilit parçaları (çoklu domain komut zinciri, müşteri/tedarikçiye giden dış iletişim) — **kodda yok**. 8 Ağustos'un kendi bağımsız doğrulaması bunu iki kere teyit etti (ilk "YAŞIYOR" etiketi yanlış çıktı, aynı gün düzeltildi: gerçek "YAŞAMIYOR").

### Hızlı mı?

**Kısmen.** Sesli ilk-ses gecikmesi ölçülmüş ve iyileştirilmiş (Faz 1: ~2.18sn ortalama ilk ses, önceki bazdan %4.5-%34.8 iyileşme). Ama 25 Temmuz denetiminin en büyük mimari tespiti hâlâ geçerli: sistemde yalnızca iki uç var — "hızlı-sığ" (fast-path, executive muhakemesi yok) veya "yavaş-derin" (full_context, ağır zincir) — anayasanın istediği **"aynı anda hem hızlı hem derin"** üçüncü bir yol yapısal olarak yok.

### Tutarlı mı?

**Hayır — bugünkü canlı hata bunun doğrudan kanıtı.** "Kaç müşterimiz var" sorusuna önce doğru bir sayı (386), hemen ardından ayrı bir model çağrısının ürettiği çelişen bir cümle ("kesin değil, en az 3 müşteri biliniyor") geldi. Bu, 25 Temmuz'da "Kök Neden 2" olarak adlandırılan ve 7 Ağustos'ta **"hâlâ doğru" diye yeniden doğrulanan** boşluğun birebir örneği: metin kanalında derin muhakeme (pipeline A/C) yalnızca stream bittikten SONRA çalışıyor ve o turun cevabına hiçbir zaman geri dönmüyor — yalnızca sessizce ekleniyor (bkz. bu oturumdaki önceki bulgum, `route.ts:1290-1328`'deki "progressive enrichment").

### Doğru mu?

**Yola bağlı.** Deterministik yollar (müşteri listesi, aksiyon sonucu, import commit) doğru ve kanıta dayalı. Ama bir turun cevabı "executive reasoning" katmanına düştüğü an, o katmanın kendi veri kümesi (management picture / executive-intelligence) ana cevaptan **farklı ve daha zayıf bir kaynağa** dayanıyor — bugünkü sayı çelişkisi tam olarak bu yüzden oldu.

### Sürdürülebilir mi?

**Hayır, kendi denetim raporlarının kendi sözleriyle:** onay (approval) deposu bellek-içi `Map`, kalıcı değil, instance yeniden başlarsa kayboluyor. Harici gözlemlenebilirlik yok (Sentry/Datadog/OpenTelemetry yok, yalnızca `console.log`). Arka plan işleri merkezi bir kuyruk yerine ad-hoc `Promise` zincirleri. 44+ modüllük dağınık karar mantığı, yeni geliştiricinin "hangi modül gerçek" sorusunu cevaplayamaması riski.

### İstenilen özelliklere sahip mi (her buton/input/domain/veriye sesli-yazılı erişim)?

**Kısmen, ve bu oturumun kendi işiyle hızla değişiyor.** 8 Ağustos'ta 29 domainden 15'i "YAŞIYOR", 8'i "KISMEN", 6'sı "YAŞAMIYOR" (Stok, Üretim, Tedarikçi, Sipariş, İrsaliye, +İletişim/Orkestrasyon motorları) bulundu. **Ama bu rapor artık 2 haftalık ve kısmen bayat:** bu oturumun kendisinde (21-22 Ağustos commit'leri) Sipariş, Stok, Üretim, Tedarikçi için Excel/CSV import + `order.create`/`stock.receive`/`production.create`/`supplier.create` action-runtime bağlantıları eklendi — yani bu dört domainin durumu muhtemelen artık "YAŞAMIYOR" değil, en azından "KISMEN". **Bu, resmi olarak yeniden doğrulanmadı** — aşağıdaki önerilerden biri bu.

Buna karşın **çoklu-domain sesli komut** ("Atlas'a teklif hazırla, yarın gönder, iki gün sonra aramam için görev aç" — vizyonun kendi örneği) hâlâ çalışmıyor, çünkü onu yürütecek Orkestrasyon Motoru hiç yok.

### Her gün gelişiyor mu?

**Kısmen, ve şaşırtıcı şekilde bu, en sağlam parçalardan biri.** `src/lib/research-director/` gerçek dış kaynaklardan (URL citation'lı) günlük araştırma yapıyor ve `daily-briefing` motoruna besliyor — Leadership DNA'nın §1.9'unda tarif edilen "her sabah 07:00 global/ulusal gelişmeleri inceler" maddesinin gerçek bir karşılığı var. Ama bu öğrenme, **konuşma esnasındaki muhakemeye geri dönmüyor** — yine aynı "Kök Neden 2" —, yalnızca ayrı bir brifing yüzeyinde kalıyor.

---

## 3. Tek Kök Neden, Üç Farklı Yerde Doğrulanmış

| Ne zaman | Nerede bulundu | Durum |
|---|---|---|
| 2026-07-25 | Anayasa Denetimi, "Kök Neden 2" | İlk tespit: pipeline A/C metin kanalında yalnızca stream sonrası, o turun cevabına hiç dönmüyor |
| 2026-08-07 | Uçtan Uca Denetim, aynı satır | "(i) Hâlâ doğru" — 13 gün sonra yeniden kontrol edildi, değişmemiş |
| 2026-08-22 (bugün) | Canlı sohbet, "kaç müşterimiz var" | Aynı boşluğun kullanıcıya görünen, somut, çelişkili sonucu — ilk kez gerçek bir kullanıcı etkisiyle yakalandı |

Bu üçü aynı satırı işaret ediyor: `route.ts` içindeki "progressive enrichment" (§1290-1328) ve `startPostStreamIntelligence` (`done` event'inden sonra çalışan pipeline A/C). **Bu, yeni bulunması gereken bir şey değil — zaten bilinen, zaten önceliklendirilmiş (P1), zaten bir çözüm taslağı olan (Cognitive Stack v2, Faz 11) bir kalemdir.**

---

## 4. Neden "Tek Tek Çözmek" Sürdürülemez — Kanıtla

Bu oturumun kendisi buna kanıt: bugün üç ayrı "tek tek" düzeltme yapıldı (excel import trigger regex, transaction/concurrency, duplicate detection + file fingerprint) — hepsi doğru ve gerekliydi, ama hiçbiri "neden METRIX'in iki farklı motoru var" sorusuna dokunmadı. Şimdi dördüncü bir "tek tek" konu (customer count contradiction) geldi ve bu, **aynı kökten** çıkıyor. Eğer bu da noktasal yamalanırsa (örn. "kaç X var" sorularını enrichment'tan muaf tut), beşinci bir "farklı motor" semptomu başka bir soru tipinde (kaç siparişimiz var, toplam ciromuz ne kadar, ...) tekrar çıkacak — çünkü kök neden (pipeline A/C'nin canlı cevaba hiç dönmemesi) hâlâ orada duruyor.

---

## 5. Öneri — Nereden Başlamalı

Yeni bir mimari icat etmeye gerek yok; **var olan, onaylı, fazlara bölünmüş yol haritası zaten bunu çözüyor** (`executive-cognitive-stack-v2.md`, Faz 10-13). Öncelik sırası, kanıta göre:

1. **Kök Neden 2'yi kapat (en yüksek kaldıraç, üç ayrı denetimde doğrulanmış).** Somut seçenek Cognitive Stack v2'nin kendi çerçevesinde: pipeline A/C'nin `cognitionObservation`'ı, o turun cevabı üretilmeden ÖNCE (ya da streaming'in çok erken bir noktasında, ana prompt'un bir parçası olarak) tüketilecek şekilde yeniden sıralanmalı — "sonradan ekle" değil, "önce bil, tek sesle söyle." Bu, bugünkü çelişkiyi kökten kapatır; yalnız "kaç müşteri var" sorusunu değil, aynı kökten çıkacak her gelecek soruyu da.
2. **`buildExecutiveDecisionPackage` vs `buildExecutiveDecisionResult` çakışmasını çöz** (zaten Faz 11 görev metninde bekliyor) — iki paralel karar motorunun kasıtlı mı yanlışlıkla mı ayrıştığı netleşmeden Kök Neden 2'nin çözümü yarım kalır.
3. **29 domain tamamlanma tablosunu yeniden doğrula** — bu oturumun kendi işi (sipariş/stok/üretim/tedarikçi import'ları) tabloyu değiştirdi; güncel ground truth olmadan "özellik tamlığı" sorusuna güvenilir cevap veremeyiz.
4. **Orkestrasyon ve İletişim motorları (Faz 12-13)** — vizyonun en iddialı parçası ("her şeyi Metrix'le hallet") bunlar olmadan tam kurulamaz, ama bunlar en büyük, en çok tasarım gerektiren parçalar; 1-3 kapanmadan başlamamalı.

**Neden bu sırayla:** 1 ve 2, zaten üç ayrı belgede kanıtlanmış, dar kapsamlı, geri alınabilir işler — "en küçük değişiklik" ilkesine uyar. 3, bir sonraki her kararın (özellikle 4'ün) doğru bilgiyle alınmasını sağlar. 4, en büyük yatırım; temel sağlam olmadan başlarsa üstüne inşa edilen her şey aynı çelişkiyi miras alır.

---

## 6. Senin Kararını Gerektiren Noktalar

1. **Kapsam onayı:** Yukarıdaki 4 maddelik sırayı mı istiyorsun, yoksa öncelik farklı mı olmalı (örn. önce domain tamamlama, sonra kök neden)?
2. **Faz 1'in tanımı:** Kök Neden 2'yi kapatmak, gerçek bir mimari değişiklik (prompt sıralaması, streaming zamanlaması) — bu, ayrı bir fazlı görev metni (`METRIX_TASK_BRIEF_*.md`) olarak mı ele alınsın, yoksa doğrudan mı başlayayım?
3. **Task brief birikintisi:** Repo kökünde 60+ untracked `METRIX_TASK_BRIEF_*.md` var — bunların hangileri hâlâ geçerli, hangileri bu büyük resim çalışmasıyla artık gereksiz? Bu liste temizlenmeden yeni fazlara başlamak, aynı "at gözlüğü" kalıbını sürdürür.

Bu belge kod değişikliği içermiyor — yalnızca mevcut kanıtın sentezi ve önerisidir. `docs/constitution/reports/` klasörüne, aynı yerdeki diğer denetimlerle aynı formatta kaydedildi.
