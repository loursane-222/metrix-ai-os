# GÖREV METNİ — Production Veri Temizliği + Sohbet Tutarlılık Hataları

**Kime:** Codex
**Fazın türü:** Yeni, bağımsız bir faz — `METRIX_TASK_BRIEF_tek-yuzey-kesin-kilit.md` fazından ayrı, paralel çalışılabilir. Bu görev tek yüzey işini beklemeden başlatılabilir.

**Neden:** Murat gerçek hesabında ("kaç müşterimiz var?" sorusuyla) dört ayrı, ciddi sorunla karşılaştı: (1) müşteri listesinde gerçek olmayan test kayıtları var, (2) takip sorusunda sohbet tutarsız/bozuk cevap verdi, (3) bu kadar iş yapılmış olmasına rağmen müşteri listesi hâlâ workspace açmadan düz metinle geldi, (4) günlük brifingde bozuk Türkçe karakterler görüldü. Kanıt ve kök neden aşağıda, dosya:satır ile.

---

## 1. Production'daki gerçek müşteri tablosunda test kayıtları var — ARŞİVLE (silme)

**Kanıt:** `METRIX_OPERATION_HANDOFF.md` ve `METRIX_ARCHITECTURE_MATRIX.md`'nin kendi geçmiş bölümleri (§15, §16), geçmiş "production kabul testi" turlarında gerçek hesapta gerçek müşteri kayıtları oluşturulduğunu açıkça belgeliyor — testten sonra hiç temizlenmemiş. Murat'ın gördüğü 13 müşteriden en az şunları test kaydı olarak tanıyoruz (isim deseni + handoff log eşleşmesi):

- Runtime Consistency Kabul Testi
- Kabul Testi Firma Bir
- Kabul Testi Firma İki
- Kabul Testi Firmasi
- Stale Surface Kabul C
- Kanit Zinciri Bir Ticaret
- ACCEPTANCE Atlas 9d8fbf4 / Atlas 9d8fbf4 (rastgele hash son eki olan, otomatik üretilmiş görünüyor)

**Yapılacak:**
1. Yukarıdaki isimleri ve organizasyondaki tüm `Customer` kayıtlarını `GET /api/customers` (ya da doğrudan Prisma) ile karşılaştır, hangi kayıtların gerçekten test kaynaklı olduğunu kesinleştir (isim + oluşturulma tarihi + handoff log'daki test senaryosu eşleşmesiyle). Gerçek bir müşteriyle karışıklık riski varsa (örn. "Atlas", "Atlas Insaat" gerçek görünüyor, "Atlas 9d8fbf4" değil) listeyi bana/Murat'a onaylat, tahmin etme.
2. Kesinleşen test kayıtlarını **tamamen silme** — bu projenin "silinmez" ilkesi (Anayasa §10) gereği, var olan `customer.archive` action'ını (`src/lib/action-runtime/domains/customers/customer-archive-handler.ts`, `archiveCustomerById`) kullanarak arşivle/pasife al. Bu zaten HIGH-risk/EXPLICIT onay akışına bağlı — Murat'ın bu görev metnindeki onayını yeterli say, tek tek soru sormana gerek yok.
3. Aynı taramayı `Task`, `Quote`, `Invoice`, `Payment` gibi diğer tablolarda da hızlıca yap — aynı testlerin yan ürünü olarak orada da test kaydı kalmış olabilir (örn. "Ucuncu kabul testi gorevi" gibi, handoff log'da adı geçen görevler). Bulursan aynı arşivleme mantığıyla temizle.
4. **Gelecek için:** `METRIX_CODING_EXECUTION_PLAN.md` ya da `METRIX_OPERATION_HANDOFF.md`'ye kısa bir kural ekle — "production kabul testi bundan sonra oluşturduğu her kaydı test bitiminde arşivlemek zorunda, aksi halde faz ACCEPTED sayılmaz." Bu, bu sorunun tekrarını önler.

## 2. Sohbet takip sorusunda tutarsız/bozuk cevap — gerçek hata, araştır ve düzelt

**Kanıt (Murat'ın gerçek diyaloğu):** "kim bu müşteriler" sorusuna isimlerle doğru cevap verildi. Hemen ardından "tamam ver" (daha fazla detay iste) sorusuna: ham veritabanı ID'leri (`cmsf41flk001d04l13fonpsg5` gibi) gösterildi, anlamsız parantez notları ("Satış Müdürü iletişim kaydı var", "bayi olarak tanımlı") eklendi, ve son cümlede "Bu müşterilerin detaylı isim... bilgisi hafızamda yok" denildi — az önce verdiği isimleri inkar etti.

**Yapılacak:** `src/app/api/ai/chat/route.ts` ve ilgili executive-brain/conversation context katmanlarında, bir önceki turda listelenen müşteri verisinin bir sonraki turda ("tamam ver" gibi belirsiz/takip niteliğindeki bir mesajda) nasıl kaybolduğunu ya da yanlış bir fallback'e düştüğünü bul. Zaman kutusu: CLAUDE.md §5 gereği makul bir süre araştır (kök nedeni bulamazsan bulduğun kadarını raporla, sonsuza kadar kazma). Kök nedeni bulunca en küçük, güvenli düzeltmeyi yap — bu turda başka bir refactor'a girme.

## 3. Müşteri listesi/sayısı soruları hâlâ workspace açmıyor — iki sistemi birbirine bağla

**Kanıt:** `src/lib/canonical-business-facts/canonical-business-facts.service.ts` (doğru sayı/liste cevabını üretir, `route.ts:781` civarında kullanılıyor) ve `src/lib/living-workspace` + `createCustomerWorkspaceDirective` (workspace'i açan sistem) hiç birbirine bağlı değil — customer zaten `DOMAIN_SURFACE_ADAPTERS`'ta tam kapsamlı bir domain, ama "kaç müşterimiz var / kim bu müşteriler" gibi bir soru geldiğinde workspace directive hiç tetiklenmiyor, yalnız düz metin cevap üretiliyor.

**Yapılacak:** Sohbetin niyet/karar katmanında, `canonicalBusinessFacts` bir domain listesi/detayı içeriyorsa (yalnız tek bir sayı değil — "kim bu müşteriler" gibi liste isteyen sorularda), aynı turda ilgili domain'in workspace directive'ini de yayınla (`createCustomerWorkspaceDirective` vb.), böylece cevap hem sohbette kısaca söylenir hem de workspace'te görsel olarak açılır. Yalnız "kaç tane var" gibi tek sayı isteyen sorularda workspace açmak zorunlu değil (docx'ün "sırf gösteriş için hareket yok" ilkesi) — ama isim/liste/detay istendiğinde workspace açılmalı. Bu ayrımı kendin makul şekilde uygula.

## 4. Hard-coded Türkçe metinlerde eksik karakter — sistemli tarama

**Kanıt:** Şu dosyalarda ı/ş/ğ/ç gibi Türkçe karakterler eksik yazılmış, hard-coded metin bulundu: `src/lib/executive-focus/executive-focus-engine.service.ts:171` ("netlesmeden", "basliklar", "kararinin", "dagilabilir"), `src/lib/executive-decision-engine/executive-decision-engine.service.ts:231` ("netlesmeden", "kaynaklari", "yonetim"), `src/lib/executive-delegation/executive-delegation-engine.service.ts`, `src/lib/executive-brain/executive-decision-engine.service.ts`. Bu, Murat'ın gördüğü brifing kartındaki bozuk metnin kaynağı.

**Yapılacak:** Bu dört dosyada ve olası benzer `src/lib/executive-*` dosyalarında, Türkçe harflerin (ı, ş, ğ, ç, ö, ü, İ) eksik/ASCII yazıldığı tüm hard-coded string'leri grep ile tara (yaygın kalıplar: "i" olması gereken yerde "i" kalmış "ı" yerine, "s" yerine "ş" gibi) ve düzelt. Bu bir refactor değil, salt metin düzeltmesi — mantığa dokunma.

## 5. Rapor Formatı

Her madde için: bulunan gerçek sayı/liste (test kayıtları, düzeltilen dosyalar) + değişiklik kanıtı (dosya:satır) + local doğrulama (tsc/test/build) + commit + push (git-tetiklemeli deploy, önceki disiplin korunur). Madde 2 (sohbet bug'ı) için kök neden bulunamazsa dürüstçe "bulunamadı, şu ipuçları var" de.
