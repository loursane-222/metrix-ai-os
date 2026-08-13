# Workspace Yerleşimi B — Geniş Panel, İnce Sohbet Raporu

## Sonuç

Seçenek B uygulandı. Workspace açıkken çalışma alanı kalan dikey alanın büyük
çoğunluğunu `min-h-0 flex-1` ile alıyor; sohbet masaüstünde 190 px, mobilde 210
px yüksekliğinde sabit ve scroll edilebilir bir şerit olarak altta kalıyor.
Workspace kapalıyken sohbet yeniden `flex-1` ile tam yüksekliğe dönüyor.

## Scroll düzeltmesi

Çakışan iki `max-h-[55vh]` sınırı kaldırıldı. Yükseklik artık dış workspace
section tarafından flex paylaşımıyla belirleniyor. İç atmosfer frame'i
`h-full min-h-0` kullanıyor; directive içeriğini saran mevcut
`min-h-0 flex-1 overflow-y-auto` elemanı bu nedenle gerçekten sıkışıp scroll
üretebiliyor.

Gerçek müşteri workspace'i kısa viewport'ta ölçüldü:

- Scroll öncesi: `clientHeight=169`, `scrollHeight=299`, `scrollTop=0`,
  `window.scrollY=0`.
- Scroll sonrası: `clientHeight=169`, `scrollHeight=299`, `scrollTop=130.5`,
  `window.scrollY=0`.

Bu ölçüm yalnız panel taşıyıcısının kaydığını, dış sayfanın yerinde kaldığını
doğruluyor. Önce/sonra görselleri ayrıca kaydedildi.

Mevcut organizasyondaki gerçek canonical kayıt sayıları denetlendi: müşteriler
1, teklifler 2, tahsilatlar 2, faturalar 1; diğer erişilebilir domain listeleri
0 kayıttı. Bildirim API'sinde 5 gerçek kayıt vardı, ancak sohbet sınıflandırıcısı
bildirim workspace directive'ini üretmedi. Veri mutasyonu veya sahte satır
eklenmedi. Bu nedenle scroll mekanizması gerçek müşteri içeriği ve kısa viewport
taşmasıyla kanıtlandı; briefte istenen 5–6 satırlık aynı-panel görseli mevcut
canonical veri/navigasyon sınırı nedeniyle üretilemedi.

## Görsel kanıtlar

- `qa-screenshots/workspace-layout-b-desktop-closed.png`
- `qa-screenshots/workspace-layout-b-desktop-open.png`
- `qa-screenshots/workspace-layout-b-mobile-open.png`
- `qa-screenshots/workspace-layout-b-scroll-before.png`
- `qa-screenshots/workspace-layout-b-scroll-after.png`

Masaüstü açık görüntüde workspace ana alanı dolduruyor; sohbet son mesaj ve
composer görünür olacak şekilde 190 px şerit. Mobilde sohbet şeridi 210 px;
header, workspace ve composer aynı anda görünür.

## Regresyon sözleşmesi ve doğrulama

Shell contract testi yeni oranı ve scroll zincirini kilitleyecek şekilde
güncellendi: workspace açıkken `flex-1`, sohbet açıkken 210/190 px, iç frame
`h-full min-h-0`; eski `max-h-[55vh]` değeri yasak.

- `npx tsc --noEmit` → geçti.
- Değişen kaynak ve contract testinde ESLint → geçti.
- Organization scoping guard → geçti (`74/256/3`).
- `npx vitest run` → 293 dosya geçti, 8 atlandı; 2231 test geçti, 17 atlandı.
- `git diff --check` → geçti.

Brief gereği commit ve push yapılmadı.
