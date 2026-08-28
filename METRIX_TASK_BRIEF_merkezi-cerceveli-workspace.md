# GÖREV METNİ — Workspace'i Tam Ekran Kaplayan Bloktan, Ortalanmış Çerçeveli Karta Çevir

**Kime:** Codex
**Fazın türü:** ACİL, kök düzeltme. Önceki fazlar (`tek-yuzey-kesin-kilit`, `uc-uncu-yuzey-ve-gorsel-tutarlilik`) URL/navigasyon seviyesinde "tek sayfa" ilkesini doğru kurdu (artık gerçekten sayfa değişmiyor) — ama bu yeterli değilmiş. Murat'ın asıl kastettiği, **görsel olarak da** workspace'in ayrı bir sayfa gibi hissettirmemesi. Şu anki hâliyle workspace, sohbetin bulunduğu içerik alanının tamamını (input çubuğunun hemen altından ekranın sonuna kadar, kenar boşluğu neredeyse yok) kaplıyor — bu görsel olarak "başka bir sayfaya geçmiş gibi" hissettiriyor, teknik olarak URL değişmese bile.

**Murat'ın elle çizdiği referans görseli** (bu görev metniyle birlikte repo köküne kopyalandı: `docs/reference/murat-workspace-cerceve-ornegi.png`) şunu gösteriyor: sohbet ekranının içerik alanının ortasında, **belirgin kenar boşluğu olan, sınırları net bir çerçeve/kart** — ekranı uçtan uca kaplamayan, ortalanmış, "yüzen" bir yapı. Bu, `METRIX_Etkileşim.docx`'ün "Dosya Açılımı" tanımıyla da birebir örtüşüyor: "çalışma yüzeyi merkezde açılır", "workspace ekranın yanından kaymaz" — ama şu anki implementasyon bunu "ortada yüzen kart" olarak değil "içerik alanının tamamını dolduran blok" olarak yorumlamış. Bu, ince ama kritik bir fark ve şu ana kadarki tüm ekran görüntülerinde (qa-screenshots/*) bu hatayı gösteriyor.

---

## 1. Yapılacak Değişiklik — Ortak Katmanda, Tek Seferde

Bu değişiklik `LivingWorkspaceHost.tsx` (ya da workspace'i saran en üst kapsayıcı neresiyse) seviyesinde, **tek bir yerde** yapılmalı — her domain ayrı ayrı değil, çünkü tüm domain'ler (`WorkspaceSurface`, `ReportSurface`, `CanonicalDomainSurface`, `CalendarWorkspace`, bespoke ekranlar) zaten ortak `WorkspaceSurface` bileşenine dayanıyor ya da onu saran ortak host'a giriyor.

**Hedef görsel yapı:**
- Workspace, sohbetin içerik alanının **ortasında**, belirgin kenar boşluğuyla (üstte, altta, solda, sağda — ekran görüntüsündeki gibi arka planın göründüğü net bir boşluk) görünecek.
- Genişlik sınırlı olacak (şu an zaten `max-w-5xl` var ama görsel olarak hâlâ "dolu" hissettiriyor — büyük ihtimalle yükseklik/dikey boşluk sorunu asıl mesele: workspace, içerik alanının tüm yüksekliğini dolduruyor, oysa yalnız kendi içeriği kadar yer kaplayıp etrafında boşluk bırakmalı).
- Arka planda/etrafında sohbetin bağlamı (en azından karartılmış/blur'lanmış ya da hafif görünür şekilde) sezilmeli — docx'ün "sohbet ile workspace aynı yüzeyin iki hali gibi görünür" ilkesi.
- Açılış animasyonu (`workspace-arrive`: scale 0.94→1, opacity 0→1) zaten doğru yönde — bunu koru, yalnız kapsayıcının boyut/konumlandırmasını düzelt.

**Teknik yaklaşım (öneri, sana bırakıyorum ama bu doğrultuda):** Workspace kapsayıcısını `position: fixed` veya `absolute` ile ekranın ortasına, sınırlı bir max-width VE max-height ile (örn. `max-width: 720px`, `max-height: 80vh` gibi, ekrana göre orantılı) yerleştir; arkasında sohbet içeriği görünür kalsın (hafif karartma/backdrop-blur eklenebilir, tam opak karartma olmasın — docx'ün "modal değil" ilkesine uygun, kullanıcı arka planı sezmeli). Mobilde docx'in kendi kuralı geçerli kalsın (tam ekran, üstte ince sohbet şeridi).

## 2. Bu Değişiklik Otomatik Olarak Her Yere Yayılmalı

Değişikliği tek, ortak kapsayıcı seviyesinde yap ki `WorkspaceSurface` kullanan HER şey (müşteri, görev, teklif, fatura, tahsilat, takvim, rapor, brifing — hepsi) otomatik olarak düzelsin. Domain domain gezip tekrar tekrar yama yapma; bu tam olarak bu fazın "ne kadar büyük diff gerekiyorsa" dediği yer — kapsayıcıyı doğru kur, geri kalan her şey ona miras kalsın.

## 3. Ekran Görüntüleriyle Kanıtla — Aynı Set, Güncellenmiş

`qa-screenshots/` altındaki mevcut 7 dosyayı (aynı Playwright testiyle, `e2e/qa-visual-consistency.e2e.ts`) yeniden üret. Bu kez her birinde: (a) workspace kartının etrafında belirgin, gerçek kenar boşluğu görünmeli, (b) kart ekranın merkezine yakın konumlanmalı, tam ekranı doldurmamalı. Kendi gözünle de kontrol et — kartın kenarlarıyla ekranın kenarları arasında gerçek, görünür boşluk var mı?

## 4. Rapor Formatı

Değişiklik kanıtı (dosya:satır) + güncellenmiş `qa-screenshots/` (aynı 7 dosya, üzerine yazılmış) + commit/push/deploy SHA doğrulaması. Ben bu 7 dosyayı yine bizzat açıp kontrol edeceğim.
