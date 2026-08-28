# METRIX — Kodlama Uygulama Planı (Codex ⇄ Claude Code)

> **Murat için özet (Türkçe, teknik olmayan):** Bu dosya, projeyi kodlayan yapay zeka araçlarının (Codex, Claude Code) her oturuma başlarken okuyacağı bir el kitabı. Amaç: hangi araç kullanılırsa kullanılsın, kaldığı yerden doğru şekilde devam etsin, gereksiz iş tekrarlamasın, ve pahalı adımları (bu sohbet gibi) değil ucuz terminal adımlarını öncelesin. Aşağısı teknik dille yazıldı çünkü bu dosyayı okuyacak olan sizden çok araçlar. Sizin bilmeniz gereken tek şey: sıradaki 5 iş aşağıda §5'te sıralı, ve her biri bitmeden onayınız istenecek.

Prepared: 2026-08-05. Supersedes nothing — this sits **alongside** `METRIX_OPERATION_HANDOFF.md` and `METRIX_ARCHITECTURE_MATRIX.md` as the entry point for *which tool does what, when, and how cheaply*. Those two files remain the domain-status source of truth; this file is the process/protocol layer around them.

---

## 1. Amaç

Murat, kalan işi Codex ve Claude Code arasında geçiş yaparak (kullanım limiti dolduğunda diğerine geçerek) tamamlamak istiyor, ve analiz adımlarının mümkün olduğunca doğrudan terminalde (ucuz) yapılmasını tercih ediyor. Bu doküman üç şeyi sabitliyor:

1. Herhangi bir aracın soğuk başlayıp doğru bağlamı 5 dakikada toplayabileceği bir okuma sırası (§3).
2. Hangi işin terminalde/CLI'da (ucuz), hangisinin agent-chat'te (Cowork/Claude Code oturumu, pahalı) yapılması gerektiğinin net ayrımı (§4).
3. Sıradaki somut, onay kapılı iş sırası (§5) — mevcut `METRIX_ARCHITECTURE_MATRIX.md` §4'ün üzerine, son commit geçmişiyle güncellenmiş hâli.

Bu plan yeni bir mimari, yeni bir metodoloji icat etmiyor — zaten bu repo'da 20+ operasyon boyunca kanıtlanmış çalışan yöntemi (`METRIX_OPERATION_HANDOFF.md`'nin manifesto-tabanlı operasyon döngüsü) iki farklı araç arasında güvenle taşınabilir hâle getiriyor.

## 2. Şu anki gerçek durum — dürüst tespit

**Bu bölüm önemli: iki takip dosyası şu anda geride.**

- `git log` HEAD'i `0c986bf` ("feat: add customer product experience runtime slice"). `METRIX_OPERATION_HANDOFF.md` ve `METRIX_ARCHITECTURE_MATRIX.md` (repo kökünde, ikisi de commit edilmemiş/stale) en son `cf907a5`'e kadar olan durumu anlatıyor — **aralarında 15 commit var**, hiçbiri bu iki dosyaya işlenmemiş.
- O 15 commit'in `git log --stat` özeti okundu (bu oturumda). Yeni bir iş alanı (domain) eklemiyorlar — hepsi mevcut Runtime/Living Workspace/Action Runtime katmanında gerçek düzeltmeler: free-text müşteri bilgisi sorgusunun gerçek veriye bağlanması (`c35962c` — matrix'in §16.6'da açık bıraktığı tam o boşluk), Customer Edit'te oku/yaz niyet ayrımı, idempotency store'un artık kalıcı olması (`058a19f` — `METRIX_SESSION_HANDOFF.md` §15'te teknik borç olarak işaretlenmiş sorunun kendisi), "Dosya Açılımı" (centered file-opening) deneyiminin implementasyonu (`5fc4489`), ve canonical exception/hata yollarının tekilleştirilmesi.
- **Sonuç**: iki takip dosyası muhtemelen gerçek ilerlemeyi *eksik* rapor ediyor, fazla değil. Yanlış yönde bir risk değil ama yine de güvenilir değil — bir sonraki oturum bu dosyalara körü körüne güvenip zaten kapanmış bir bulguyu yeniden teşhis etmeye çalışabilir.
- Ayrıca `METRIX_ARCHITECTURE_MATRIX.md` working tree'de `M` (değiştirilmiş, commit edilmemiş) durumda — bu oturumun okuduğu içerik zaten en son elle güncellenmiş hâli, ama HEAD'in gerisinde.

**Bu yüzden §5'teki iş listesinin 0. maddesi, yeni bir domain'e başlamak değil, bu iki dosyayı gerçek HEAD'e karşı yeniden doğrulamak.**

Diğer sabit gözlemler (değişmedi):
- `origin/main` ile `main` arasında fark yok (`git log origin/main..HEAD` boş) — her şey push edilmiş.
- **Güncelleme (2026-08-05): CI artık gerçekten devrede.** `ci.yml` commit edildi (`b2d265b`), GitHub secrets eklendi, ilk çalıştırmada iki gerçek sorun bulunup düzeltildi: (1) GitHub'a yanlışlıkla `.env`'in eski/stale DATABASE_URL/DIRECT_URL değerleri girilmişti — doğrusu `.env.local`'daydı (Next.js `.env.local`'ı `.env`'in üzerine öncelikli okur; iki dosya arasında sessizce fark olabileceği unutulmamalı). (2) `executive-intelligence.test.ts` gerçek canonical company projection servisini mock'lamadan çağırıyordu — yerelde `DATABASE_URL` test ortamına hiç yüklenmediği için bu hiç fark edilmemişti, CI'de gerçek secret enjekte edilince ortaya çıktı. Codex bunu izole edip düzeltti (commit `1e8463d`). Artık her push'ta typecheck/lint/test/build otomatik ve yeşil çalışıyor.
- Sahiplenilmemiş, eski oturumlardan kalma değişiklikler hâlâ çalışma alanında duruyor (`globals.css`, `ExecutiveAppShell.tsx`, `MetrixChatTab.tsx` — `M` olarak işaretli; `design-system/`, `public/design/executive-dock.svg` — untracked). Bunlara CLAUDE.md'nin "gereksiz temizlik yapma" kuralı gereği dokunulmadı; bir sonraki oturum bunları ya sahiplenmeli ya da Murat'a sorup silmeli/commit'lemeli.

## 3. Her oturumun ilk 5 dakikası — okuma sırası

Hangi araç (Codex veya Claude Code) olursa olsun, yeni bir oturum şu sırayla başlamalı — hepsi terminalde/dosya okuma ile yapılır, LLM'e sorulacak bir şey değil:

1. `CLAUDE.md` / `AGENTS.md` (repo kökü) — değişmeyen kurallar.
2. `git log --oneline -20` ve `git status --short` — gerçek HEAD ve çalışma alanı durumu.
3. `METRIX_OPERATION_HANDOFF.md`'nin **son bölümü** (dosyanın sonu, en yeni operasyon) — "şu an ne bitti, sırada ne var" için tek kaynak.
4. `METRIX_ARCHITECTURE_MATRIX.md` §3 (domain-by-domain tablo) ve §4 (sıradaki öneri) — hangi domain'in durumu ne.
5. Eğer §2 ile §3/§4 arasında commit farkı varsa (yukarıdaki gibi) — yeni oturumun ilk gerçek işi bu farkı kapatmak (bkz. §5, madde 0), varsayımla ilerlememek.
6. Sadece dokunulacak domain'e özel dosyalar (`METRIX_OPERATION_HANDOFF.md`'nin "Dosyalar" bölümündeki referans-zincir listesi) — kopyalanacak deseni bulmak için.

Bu sıra ~10 dosya okur, hiç insan-aracılı gidiş-geliş gerektirmez.

**Düzeltme (2026-08-05): Murat yazılımcı değil, terminal komutu çalıştırmıyor ve komut/çıktı aktarımı yapmıyor.** Aşağıdaki ayrım "Murat mı yapar, agent mi yapar" değil — **"iş toptan tek bir Codex/Claude Code oturumuna mı devredilir, yoksa Cowork sohbeti üzerinden mi ilerler"** ayrımıdır. Kural: çok adımlı, birbirine bağımlı analiz/tanı zincirleri (bu repo'nun kendi geçmişinde defalarca görüldüğü gibi, 5-7 adımlık kök-neden takibi) **hiçbir zaman** komut-yapıştır-komut şeklinde Cowork sohbeti üzerinden yürütülmez — bu hem yavaştır hem Murat'a hatalı kopyala-yapıştır riski yükler hem de gereksiz yere iki ayrı sohbetin (Cowork + terminal) tokenini tüketir. Bunun yerine iş bütünüyle bir CLI aracına (şu an: Codex, limiti dolarsa: Claude Code) tek bir görev metni (brief) olarak verilir; o araç kendi içinde gerekli kadar adımı kendi başına atar, sonunda tek bir rapor/handoff üretir; Murat yalnızca o raporu Cowork'e geri getirir.

## 4. Terminal-first analiz kuralı — ne toptan devredilir, ne Cowork'te kalır

**Toptan bir CLI aracına (Codex/Claude Code) devredilir — Cowork sohbetine hiç girmez:**
- `git log`, `git diff`, `git status`, `git show <commit>` ile geçmiş/durum okuma.
- `grep`/`rg` ile kod tabanında desen arama.
- `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run lint` ile yerel doğrulama.
- Çok adımlı kök-neden takibi (dosyadan dosyaya iz sürme, izole test yazıp çalıştırma).
- Prisma migration oluşturma/uygulama, kod yazma, commit/push.
- Production'da authenticated acceptance testi.

**Cowork'te (bu sohbette) kalır:**
- Görev metni/brief hazırlamak (aşağıdaki gibi) ve önceliklendirme.
- Codex/Claude Code'un getirdiği bitmiş raporu okuyup değerlendirmek, bir sonraki operasyona karar vermek.
- Foundation anayasa çelişkisi gibi karar gerektiren, kod olmayan sorular.

**Agent oturumu gerektiren (kod yazma, karar verme, production'a dokunma):**
- Yeni kod yazmak/düzenlemek, migration oluşturup uygulamak.
- Production'da authenticated acceptance testi (gerçek hesapla `metrixgm.com` üzerinde) — bir tarayıcı/agent gerektirir.
- Foundation anayasa dosyalarını yorumlayıp bir çelişkiyi çözmek (bu, kod değil karar işi — bkz. `feedback_foundation_doc_conflicts` hafıza kuralı: çelişki varsa Murat'a sorulur).
- Self Review / Kabul Kriterleri değerlendirmesi (manifesto formatı) — bu bir muhakeme adımı, mekanik değil.

Pratik sonuç: bir oturum başlamadan önce §3'teki okuma turu (terminalde, ücretsiz/ucuz) tamamlanmalı; agent oturumu yalnızca gerçek kod yazımı/karar/production-doğrulama için açılmalı.

## 5. Sıradaki iş sırası — onay kapılı

Her madde bağımsız, geri alınabilir, tek bir operasyon (`METRIX_OPERATION_HANDOFF.md`'deki gibi commit + Self Review + kanıt ile kapanır). **Bir sonraki maddeye geçmeden önce Murat'ın onayı istenir** — büyük resmi aşama aşama onaylamak istediği için (bkz. proje hafızası).

**0. ~~Takip dosyalarını gerçek HEAD'e senkronize et~~ — TAMAMLANDI** (commit `e3b1fa7`, `METRIX_OPERATION_HANDOFF.md`/`METRIX_ARCHITECTURE_MATRIX.md` güncel).

**0b. ~~CI güvenlik ağını devreye al~~ — TAMAMLANDI** (commit `b2d265b` + `1e8463d`, GitHub Actions yeşil, her push'ta otomatik typecheck/lint/test/build).

**1. ~~Fatura'nın SENT geçişi + Teklif'e otomatik bağlama~~ — TAMAMLANDI** (commit `6635fb5`, production-doğrulandı: gerçek Quote→Invoice zinciri, vergi matematiği doğru, SENT geçişi bağımsız API okumasıyla teyit edildi).

**2. Muhasebe (Accounting, domain #15) — SIRADAKİ.** Artık unblocked — Invoice ve Payment'ın PAID geçişi gerçek. Kapsam: invoice-create ve payment-apply olaylarında otomatik muhasebe kaydı (journal entry) — yeni bir bağımsız defter aracı değil.

**3. Raporlama (Reporting, domain #21).** En iyi backend/UI oranı — `ReportTemplate/Assignment/Submission/Answer/MetricSnapshot` modelleri zaten gerçek, hiç arayüz yok.

**4. Hedef (Goals/KPI, domain #20).** Raporlama'dan daha küçük bir iş ama günlük değeri daha düşük.

**5. Executive Onboarding / Subscription & Licensing (domain #30/#31).** Çok daha büyük, iş modelini tanımlayan bir operasyon — yukarıdakilerin hepsi bittikten sonra, Murat açıkça bu büyük operasyona geçmeyi seçerse ele alınmalı.

**Ayrı, düşük öncelikli, birikmiş temizlik maddesi (kod değil, karar gerektiriyor):** `design-system/`, `public/design/executive-dock.svg`, `globals.css`/`ExecutiveAppShell.tsx`/`MetrixChatTab.tsx`'teki eski `M` değişiklikleri — hangi oturumdan kaldıklarını kimse teyit etmedi. Bir sonraki oturum bunları commit'leyip sahiplenmeli ya da Murat'a sorup silmeli; süresiz "dokunulmadı" durumda bırakılmamalı.

## 6. Codex ⇄ Claude Code el değiştirme protokolü

1. **Devam etmeden önce commit et.** Bir oturum, kullanım limiti bitmeden önce yarım kalan işi asla açık bırakmamalı — ya tamamlanmış küçük bir commit olarak bırakır, ya da hiç commit etmeden en baştaki temiz duruma geri döner (`git checkout -- <dosya>`). Yarı-yazılmış, commit edilmemiş kod bir sonraki aracın (farklı bir model, farklı bir bağlam) doğru yorumlayacağı garanti değildir.
2. **Devam eden operasyonun durumunu `METRIX_OPERATION_HANDOFF.md`'ye ekle** (append, üzerine yazma) — yeni araç bunu §3 adım 3'te okuyacak.
3. **Bir aracın "ACCEPTED" dediği bir şeyi diğer araç körü körüne kabul etmez** — ama yeniden test de etmez, tersine kanıtı okur (commit hash, production acceptance kanıtı) ve kanıt tutarlıysa güvenir. Sadece kanıt eksik/belirsizse yeniden doğrular.
4. **İki aracın aynı anda aynı dosyaya yazmasını önle** — bir oturum bitmeden diğerini başlatma; `git status` her zaman temiz bir başlangıç noktası göstermeli (madde 1 bunu garanti eder).
5. **Model/araç farkı fark ettirmemeli** — her iki araç da aynı `CLAUDE.md`/`AGENTS.md` kurallarına, aynı manifesto formatına (Self Review, ACCEPTED/PARTIAL/BLOCKED sözlüğü) uyar. Bu dosya ve `METRIX_OPERATION_HANDOFF.md` §19 ("Rules to preserve") ikisi için de geçerli, araca özel bir varyant yok.

## 7. Duraklama kuralları (değişmedi, tekrar sabitlendi)

Otonom ilerleme yalnızca şu durumlarda durur, onay ister:
- Gerçek e-posta/SMS gönderimi.
- Geri alınamaz silme (`prisma migrate reset`, veri kaybı riski taşıyan herhangi bir komut).
- Güvenlik/yetkilendirme doğrulaması gerektiren adımlar.
- Foundation anayasa çelişkisi veya çekirdek ürün kararı (bkz. `feedback_foundation_doc_conflicts`).
- Production URL/veritabanına doğrudan dokunan script'ler.

Bunların dışında iş, madde madde onay istemeden devam eder — yalnızca §5'teki **operasyon sınırlarında** (bir sonraki maddeye geçerken) durup Murat'a rapor verir.

## 8. Bitmiş sayılma kriterleri

Her operasyon, mevcut manifesto formatıyla kapanır (değişiklik yok, sadece hatırlatma):

- Kurucu anayasa korundu mu?
- Living Workspace korundu mu? (URL sabit, sohbet paneli unmount olmadı, kayıt inline açıldı)
- Single Authority korundu mu? (ikinci bir runtime/planner/authority oluşmadı)
- Kullanıcı gerçekten yeni bir yaşayan davranış kazandı mı? (narrated değil, gerçek hesapla production'da kanıtlanmış)
- `tsc --noEmit`, `npm test`, `npm run build` üçü de temiz.
- Commit push edildi, deploy doğrulandı (bundle fetch+grep, `vercel ls` polling değil — bu repo'nun kendi öğrendiği ders).

FAIL varsa operasyon ACCEPTED değildir — PARTIAL/BLOCKED olarak işaretlenir ve bir sonraki oturuma açıkça devredilir.

---

*Bu dosya, `METRIX_OPERATION_HANDOFF.md` ve `METRIX_ARCHITECTURE_MATRIX.md`'nin yerini almaz — onları nasıl okuyacağını ve ne zaman güncelleyeceğini tarif eder. §5'teki liste ilerledikçe bu dosya da güncellenmeli.*

## 9. Production kabul testi veri hijyeni

Production kabul testi sırasında oluşturulan müşteri, görev, teklif, fatura ve tahsilat kayıtları test tamamlanmadan önce kanonik arşivleme akışıyla pasife alınmalıdır. Bu arşivleme kanıtı (kayıt kimliği, test senaryosu ve sonuç) operasyon handoff'una eklenmedikçe faz ACCEPTED sayılmaz; production verisi silinmez.
