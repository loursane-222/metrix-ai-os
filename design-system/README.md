# METRIX Design System

Bu klasör METRIX'in resmi tasarım sistemidir.

Buradaki SVG, PNG ve referans ekranlar ürünün tek görsel doğruluk kaynağıdır (Single Source of Truth).

Kurallar:

- Kod tasarıma uyar.
- Tasarım koda göre değiştirilmez.
- Onaylı SVG yeniden çizilmez.
- Yaklaşık CSS üretimi yapılmaz.
- Önce mevcut asset kullanılır, yoksa yeni asset üretilir.

## Klasör Yapısı

foundation/
Tasarım tokenları, renkler, tipografi, spacing ve materyal tanımları.

global/
Ürünün tüm ekranlarında ortak kullanılan resmi asset'ler.

customers/
Müşteriler modülüne ait onaylı ekran referansları.

components/
Reusable UI component referansları.

notes/
Tarihsel notlar ve orijinal referans dosyaları.

## Executive Dock — Asset Kararı

- Executive Dock için runtime'da kullanılacak resmi asset:
  `global/executive-dock-transparent.png` (repo'da ayrıca `public/design/executive-dock-transparent.png` olarak servis edilir, iki dosya birebir aynıdır — SHA-256 checksum ile doğrulanmıştır).
- Bu dosya **gerçek RGBA alpha kanalı** içerir (color type 6). Dört köşe pikseli alpha=0 (tam şeffaf); pill gövdesi, glow, orb, M logosu ve ikonlar alpha=255 (tam opak) olarak korunmuştur.
- `global/executive-dock.svg`, içine opak (alpha kanalsız/alpha=255 sabit) bir PNG gömülü olan **tarihsel kaynak/referans** dosyasıdır. Şeffaf PNG bu dosyadan türetilmiştir; kendisi runtime'da doğrudan kullanılmaz.
- Runtime component'lerinde eski `executive-dock.svg` **kullanılmamalıdır**.
- Dock render edilirken `clip-path`, crop, `mix-blend-mode` veya başka bir mask hack'i **kullanılmamalıdır** — asset'in kendi alpha kanalı yeterlidir, doğal ölçeğinde (`width` sabit, `height: auto`) render edilir.
