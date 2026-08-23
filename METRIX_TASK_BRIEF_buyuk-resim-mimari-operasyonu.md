# METRIX Görev Notu — Büyük Resim Mimari Operasyonu

**Tarih:** 2026-08-22
**Karar veren:** Murat
**Bu notun amacı:** Bir önceki oturumda (2026-08-22) yapılan büyük resim denetiminin sonucunda alınan kararları, yeni bir oturumun sıfırdan bağlam kurmadan doğrudan operasyona başlayabilmesi için tek bir yerde toplamak.

**Zorunlu ilk adım (yeni oturum başında):** Bu notu okumadan önce/sonra mutlaka şu sırayla oku:
1. `docs/constitution/reports/METRIX_Karakter_ve_Mimari_Buyuk_Resim_Denetimi_2026-08-22.md` — bu notun dayandığı tam denetim, kanıtlar, alıntılar.
2. `docs/constitution/source/metrix-buyuk-resim-vizyon-v1.md`, `metrix-liderlik-dnasi.md`, `metrix-sohbet-anayasasi.md`, `executive-cognitive-stack-v2.md` — canonical vizyon/mimari.
3. `docs/constitution/reports/METRIX_Constitution_Audit_2026-07-25.md`, `METRIX_End_to_End_Audit_2026-08-07.md`, `METRIX_Domain_Tamamlama_Denetimi_2026-08-08.md` — önceki denetim zinciri.

CLAUDE.md §15 zaten bu üç katmanın (Foundation/Source/Standards) her faz başında sırayla okunmasını şart koşuyor — bu operasyon için bu şart özellikle kritik, çünkü bütün program bu belgelerin sentezine dayanıyor.

---

## Murat'ın Kararı: Genel Çalışma Biçimi

> "büyük büyük ilerleyelim incik boncukla uğraşmayalım. daha büyük düşün ve büyük resimden gözünü ayırma."

Bu, önceki oturumların (tek tek hata düzeltme) açıkça reddedildiği anlamına geliyor. Yeni oturum:
- Küçük, izole bug raporlarına (biri gelirse) bu 5 fazın **dışında** tek tek dalmamalı — eğer bulgu, aşağıdaki fazlardan birinin kapsamına giriyorsa oraya not edilmeli, kendi başına acil yama olarak ele alınmamalı.
- Her fazın sonunda "bu değişiklik büyük resme (vizyon v1 + cognitive stack v2) gerçekten hizmet ediyor mu?" sorusunu açıkça cevaplamalı (bu, projenin kendi "Kurucu Mimari Kontrolü" formatı — her canonical belgenin sonunda var, aynı disiplin burada da uygulanmalı).
- Faz'lar sırayla, ama bir faz bitmeden sonrakine geçilmemeli — kısmi/paralel ilerleme büyük resmi yeniden parçalara böler.

---

## Faz 0 — Eski Task Brief Temizliği

**Karar:** "Öncelikle 60+ eski task briefi temizlemek en mantıklısı. Eğer belirtilen işler bittiyse silelim. Eksik kalan işler varsa bekletelim."

**Kapsam:** Repo kökündeki tüm `METRIX_TASK_BRIEF_*.md` dosyaları (bu yazıldığı sırada 60'tan fazla, hepsi git'te untracked). Her biri için:
1. Dosyayı oku, hangi işi tarif ettiğini çıkar.
2. O işin gerçekten tamamlanıp tamamlanmadığını **koda ve git log'a bakarak** doğrula (dosyadaki kendi iddiasına güvenme — bu tür belgeler bazen "yapıldı" der ama kod başka bir şey gösterebilir; bu tam olarak projenin kendi denetim disiplini, bkz. Domain Tamamlama Denetimi'nin 25/26 numaralı satırlardaki kendi düzeltmesi).
3. Tamamlanmışsa: dosyayı sil.
4. Eksikse/belirsizse: **dokunma, bırak** — bu faz iş bitirmek için değil, sadece envanter temizliği için var. Eksik işler otomatik olarak Faz 1-4'ün kapsamına girmiyor; ayrı, sonraki bir karara kalır.
5. Sonunda: kısa bir özet tablo (silinen/bırakılan sayısı, bırakılanların bir cümlelik gerekçesi).

**Not:** Bu faz düşük riskli ve hızlı olmalı — büyük resme hizmet eden asıl iş Faz 1-4'te.

---

## Faz 1 — Kök Neden 2'yi Kapat (En Yüksek Öncelik)

**Murat'ın kararı:** "Kök neden 2 neydi hatırlamıyorum ama eğer task brief hazırlaman gerekiyorsa hazırla ve sorunsuz şekilde çöz."

### Kök Neden 2 Nedir (özet, çünkü Murat hatırlamıyor)

Üç ayrı denetimde bağımsız olarak bulunmuş, hâlâ açık bir mimari boşluk:

- **İlk tespit (2026-07-25, Anayasa Denetimi):** Metin sohbet kanalında derin muhakeme (executive-brain "pipeline A" + chat-executive-intelligence "pipeline C") yalnızca ana cevabın stream'i BİTTİKTEN SONRA çalışıyor (`startPostStreamIntelligence`, `route.ts`) ve o turun kullanıcıya giden cevabına **hiçbir zaman geri dönmüyor** — yalnızca mesaj metadata'sına yazılıp bir sonraki turda dolaylı etki yapıyor.
- **Yeniden doğrulama (2026-08-07, Uçtan Uca Denetim):** Aynı satır tekrar kontrol edildi, "(i) Hâlâ doğru" — değişmemiş.
- **Canlı kanıt (2026-08-22, bugünkü oturum):** Kullanıcı "kaç müşterimiz var?" diye sordu. Ana cevap doğru sayıyı verdi (386). Hemen ardından, **ayrı bir model çağrısının** ("progressive enrichment", `src/app/api/ai/chat/route.ts:1290-1328`) ürettiği, farklı ve daha zayıf bir veri kaynağına (executive management picture / executive-intelligence) dayanan bir cümle geldi ve doğru cevapla çelişti ("kesin değil, en az 3 müşteri biliniyor" gibi). Kullanıcı bunu "iki farklı cevap motorumuz var, biri sistemi biliyor diğeri bilmiyor" diye tarif etti — teşhis doğru.

### Neden Önemli

Bu, yalnızca "müşteri sayısı" sorusuna özel değil — **aynı kökten, gelecekte her analitik/sayım sorusunda** ("kaç siparişimiz var", "toplam ciromuz ne kadar" vb.) tekrar çıkacak bir desen. Noktasal yama (örn. "bu tip soruları enrichment'tan muaf tut") kök nedeni kapatmaz, yalnızca semptomu erteler.

### Beklenen Çözüm Yönü (bağlayıcı değil, başlangıç noktası)

`executive-cognitive-stack-v2.md`'nin kendi çerçevesi zaten bunu öngörüyor: pipeline A/C'nin ürettiği muhakeme, cevap ÜRETİLDİKTEN SONRA sessizce eklenen bir ek değil, cevap üretilmeden ÖNCE bilinen, tek bir sesle söylenen bir girdi olmalı. Yeni oturum, bu sıralama değişikliğini (streaming zamanlaması, hangi verinin ne zaman prompt'a gireceği) somut bir task brief'e dökmeli — gerekiyorsa önce kendi `METRIX_TASK_BRIEF_kok-neden-2-tek-otorite.md` (veya benzeri) dosyasını yazıp sonra çözmeli. Çözüm, mevcut deterministik yolları (customer list, import commit vb. — zaten doğru çalışan yollar) BOZMAMALI; yalnızca "executive reasoning" katmanının canlı cevaba giriş noktasını düzeltmeli.

**Bitiş kriteri:** Aynı turda, aynı soruya (örn. "kaç müşterimiz var") ana cevap ve derin muhakeme arasında çelişki üretilmesi fiziksel olarak mümkün olmamalı — iki ayrı model çağrısının aynı kullanıcıya çelişen gerçek iddia etmesi mimari olarak kapanmalı.

### Ek Çözüm (2026-08-24) — bitiş kriterinin tam karşılanması

Bu fazın ilk turunda (bu oturumun daha erken bir noktasında) yapılan düzeltme enrichment modelinin kanıtını (`canonicalOperationEvidence`) düzeltti ve bir "çelişirse söyleme" talimatı ekledi — bu, spesifik semptomu (müşteri sayısı çelişkisi) kapattı ama bir **model talimatına** dayanıyordu, mimari bir garanti değildi. Bitiş kriteri ("fiziksel olarak mümkün olmamalı") tam karşılanmadı.

Ek olarak eklendi: `src/lib/canonical-business-facts/canonical-contradiction-guard.ts` — enrichment metni, `canonicalBusinessFacts`'ın (kullanıcının mesajında geçen varlık tipleri için gerçek, organizasyon kapsamlı sayılar) karşısında **kod düzeyinde, modele güvenmeden** kontrol ediliyor; çelişen bir cümle varsa koddan siliniyor. Bunun gerçekten "fiziksel olarak imkansız" olabilmesi için `route.ts`'teki enrichment akışı da değişti: metin artık üretildikçe anlık (chunk-by-chunk) kullanıcıya gösterilmiyor, önce tamamen sunucuda toplanıyor, kontrolden geçiyor, ancak öyle kullanıcıya gönderiliyor — aksi halde kullanıcı çelişen cümleyi kontrol tamamlanmadan zaten görmüş olurdu.

**Bilinçli olarak yapılmayan (daha büyük, daha riskli bir iş, ayrı bir karar gerektirir):** Pipeline C'nin (`resolveChatExecutiveCognition`/`buildExecutiveIntelligence`) kendi iç muhakemesini de aynı kanonik kanıta bağlamak — bu, `executive-context-builder`/`executive-operating-system` gibi birden fazla, geniş çaplı kullanılan modülü değiştirmeyi gerektirir. Yapılmadı çünkü bitiş kriteri (kullanıcıya çelişen bir gerçek asla ulaşmamalı) zaten deterministik korumayla karşılanıyor — pipeline C'nin kendi iç hesaplaması hâlâ ara sıra yanlış bir sayı üretebilir, ama o sayı hiçbir zaman kullanıcıya kadar ulaşamaz.

Doğrulama: `src/lib/canonical-business-facts/__tests__/canonical-contradiction-guard.test.ts` (orijinal hatanın birebir metnini — "en az 3 müşteri biliniyor" — 386 gerçek sayısına karşı test eden dahil, 8 test), tam test paketi (2627 test) ve production build temiz geçti. Canlı doğrulama: "kaç müşterimiz var" sorusu ana cevap ve enrichment'ın tutarlı olduğu bir turda test edildi, yeni kod yolunun hatasız çalıştığı ve `enrichmentChars`/`rawEnrichmentChars` log'unun (kontrolün gerçekten çalıştığının kanıtı) doğru üretildiği doğrulandı.

---

## Faz 2 — İki Paralel Karar Motorunu Kayıpsız Birleştir

**Murat'ın kararı:** "İki paralel karar motorunu öyle bir çöz ki hiçbir kaybı olmadan, tam aksine cevap kalitesi, hızı, konuşma tonu vs gibi dinamikler eskisinden çok daha iyi olsun."

### Durum

- `src/lib/executive-brain/executive-decision-engine.service.ts` (`buildExecutiveDecisionPackage`) — **canlı sohbet yolunda gerçekten çalışıyor**, her turda.
- `src/lib/executive-decision-engine/executive-decision-engine.service.ts` (`buildExecutiveDecisionResult`) — yalnızca aylık board raporunda (`GET /api/reports/board`) çalışıyor, sohbete hiç bağlı değil. `mindState` alanını kabul edecek şekilde tiplenmiş ama hiçbir production çağrısı doldurmuyor (yalnız testler dolduruyor).
- 2026-08-07'de bu ikisinin "kasıtlı olarak ayrı amaçlara mı (turn-anı sohbet özeti vs. aylık stratejik rapor) yoksa yanlışlıkla paralel mi" olduğu **doğrulanmadı** — bu, bu fazın ilk adımı olmalı.

### Kesin Şart (Murat'ın açık talebi — pazarlık konusu değil)

Bu birleştirme **regresyon içermemeli**. Somut ölçüt: birleştirmeden önce ve sonra aynı senaryo setiyle (7 Ağustos'un yaptığı gibi — gerçek model transkripti, STANCE/yasaklı kalıp testi) karşılaştırma yapılmalı; sonuç en az eskisi kadar iyi, ideal olarak daha iyi olmalı: daha hızlı ilk cevap, daha tutarlı ton, daha isabetli muhakeme. "Aynı kaldı" yeterli değil — Murat açıkça "eskisinden çok daha iyi" diyor.

### Yaklaşım

1. Önce doğrulama: iki modülün gerçekten aynı işi mi yaptığını, yoksa (adından da anlaşılacağı gibi) biri "bu turun özeti" biri "aylık strateji" gibi gerçekten farklı zaman ölçeklerine mi hizmet ettiğini kesin olarak çıkar (kod okuyarak, varsayımla değil).
2. Gerçekten aynı işi yapıyorlarsa: tek bir modülde birleştir, ismi netleştir (hangi domain anayasasının — 23, Yönetici Karar Motoru — canonical implementasyonu olduğunu işaretle, `executive-cognitive-stack-v2.md` §3'ün önerdiği gibi).
3. Gerçekten farklı amaçlara hizmet ediyorlarsa: birleştirme değil, **isimlendirme** yap — ikisinin de var olma hakkı olduğunu ama net sınırlarla ayrıldığını dokümante et (v2'nin 23-26 için yaptığı gibi).
4. Her iki durumda da Faz 1'in ürettiği "tek otorite, canlı cevaba geri dönen muhakeme" prensibiyle uyumlu olmalı — bu iki faz birbirini beslemeli, çakışmamalı.

---

## Faz 3 — Domain Tamamlama Tablosunu Güncelle ve Eksikleri Bitir

**Murat'ın kararı:** "Domain tamamlama tablosunu güncelle ve eksik domainleri bitir. Ama bitirirken bütüne hizmet ettiğinden emin ol."

### Durum (2026-08-08 denetimi, muhtemelen bayat)

29 domainden 15 "YAŞIYOR", 8 "KISMEN", 6 "YAŞAMIYOR" (İşletme-supra, Stok, Üretim, Tedarikçi, Sipariş, İrsaliye + düzeltmeyle Yönetici İletişim/Orkestrasyon Motorları).

**Önemli:** Bu oturumun kendisinde (21-22 Ağustos) Sipariş, Stok, Üretim, Tedarikçi için Excel/CSV import + action-runtime bağlantıları (`order.create`, `stock.receive`, `production.create`, `supplier.create`) eklendi. Bu dört domainin durumu artık muhtemelen değişmiş — **resmi olarak yeniden doğrulanmadı.** Yeni oturumun ilk işi: `METRIX_Domain_Tamamlama_Denetimi_2026-08-08.md`'nin metodolojisini (Prisma modeli + servis/API + gerçek kullanıcı yüzeyi + living-workspace adapter + test kanıtı) aynen uygulayarak tabloyu 2026-08-22 tarihiyle yeniden üret.

### "Bütüne Hizmet" Şartı

Eksik domainleri bitirirken, her biri şu ikisine uymalı (Murat'ın açık isteği, vizyon v1'in kendi ilkesi):
1. **Genel Bakış Workspace Deseni** (vizyon v1 §5): liste tipi her domain aynı yapıyı paylaşmalı — üst kısımda dinamik KPI'lar, alt kısımda kompakt, kendi içinde scroll olan satırlar. Yeni domain kendi başına yeniden icat etmemeli, mevcut deseni miras almalı.
2. **Sesli + yazılı + görsel eşit erişim** (vizyon v1 §2): Yeni domain yalnızca ekrandan değil, konuşarak da yönetilebilmeli — action-runtime'a bağlı, conversation-extension'ı olan, sesli komutla erişilebilir olmalı. Yalnızca CRUD + sayfa eklemek yeterli değil.

Hangi domain(ler)in önce ele alınacağı (Stok/Üretim/Tedarikçi/Sipariş'in şu anki gerçek durumuna göre) bu fazın ilk yeniden-denetim adımından sonra netleşmeli.

---

## Faz 4 — Orkestrasyon ve İletişim Motorlarını Tamamla

**Murat'ın kararı:** "Orkestrasyon/İletişim motorlarını tamamla."

### Durum

İkisi de kodda **yok** (2026-08-08 denetiminin kendi düzeltmesiyle doğrulandı — ilk "YAŞIYOR" etiketi yanlıştı, aynı gün "YAŞAMIYOR" olarak düzeltildi):

- **Yönetici Orkestrasyon Motoru (Domain 26):** Tek bir iş komutunun (örn. "Atlas'a teklif hazırla, yarın gönder, iki gün sonra aramam için görev aç") birden fazla domain/motoru hangi sırayla/bağımlılıkla çalıştıracağını yönetir. Şu an yalnızca `business-reality-candidates`'ın tekil-aday→tekil-aksiyon (1:1) köprüsü var — çoklu-domain zincirleme yok.
- **Yönetici İletişim Motoru (Domain 25):** Birincil kullanıcı DIŞINDAKİ taraflara (müşteri, tedarikçi, ekip) giden iletişim (ton, hedef kitle, zamanlama, müzakere). `gmail.service.ts` yalnızca OKUMA yapıyor (`send`/`reply`/`compose` yok); gerçek outbound kanal yok.

### Sıralama Notu

`executive-cognitive-stack-v2.md` §9 (Faz 12-13) bu ikisini **kasıtlı olarak** Faz 10-11'den (Kök Neden 2 + karar motoru birleşmesi) sonraya koymuştu — "ECO ile karışmaması için önce §6 sınırının kilitlenmesi ön koşuldur" diyor. Yani bu fazın Faz 1-2'den sonra gelmesi hem Murat'ın önceliklendirmesiyle hem de mevcut mimari dokümanın kendi ön koşuluyla örtüşüyor — bu tesadüf değil, aynı mantığa iki farklı yerden ulaşılmış.

### Kapsam

Bu iki motor, mevcut kodda hiç karşılığı olmayan, gerçek tasarım gerektiren en büyük parçalar. Yeni oturum muhtemelen bunları tek fazda bitiremez — ama en azından: (a) her ikisi için ayrı domain anayasasına (23-26 Domain_Sözleşme belgeleri) sadık kalan bir ilk mimari tasarım/iskelet, (b) ECO (Executive Conversation Orchestrator, turn-içi zamanlama) ile bu ikisinin asla karışmayacağı net sınır (v2 §6-7'deki tablo formatında) ile başlamalı.

---

## Kapanış Notu

Bu beş faz, Murat'ın verdiği sırayla, birbirini besleyecek şekilde tasarlandı: Faz 0 alanı temizler, Faz 1 tek-otorite/tutarlılık temelini kurar, Faz 2 o temel üzerine karar motorunu sağlamlaştırır, Faz 3 bu sağlam temel üzerine eksik domainleri (doğru desenle) tamamlar, Faz 4 en büyük, en iddialı parçayı (çoklu-domain orkestrasyon + dış iletişim) en son, en sağlam zeminde inşa eder.

Her fazın sonunda: kısa, yapısal bir rapor (bu projenin kendi "Kurucu Mimari Kontrolü" formatında — anayasaya uygun mu, yayılabilir mi, kalıcı mı) ve **Murat'ın onayı** olmadan bir sonraki faza geçilmemeli.
