# Teklif Faz 4 — Teklif Sıcaklığı ve Müşteri Karar Karnesi Raporu

## Sonuç

Teklif düzenleme ekranına request-time hesaplanan “Sinyal” sekmesi eklendi. Yeni kalıcı skor alanı veya migration oluşturulmadı; bütün sonuçlar mevcut kanonik teklif, görüntülenme, karşı teklif ve ödeme kayıtlarından hesaplanıyor.

## Gerçek veriden hesaplanan boyutlar

- **Müşteri İlgisi:** `QUOTE_VIEWED` event sayısı ve son event zamanı. Skor, her görüntülenme için 25 puan ve 100 üst sınırıyla şeffaf biçimde hesaplanıyor.
- **Pazarlık Zorluğu:** `QuoteCounterProposal` satır sayısı gerçek pazarlık turu olarak kullanılıyor. Executive birleşiminde kolaylık karşılığı `100 - tur × 20`, alt sınır 0.
- **Kazanma Olasılığı:** İncelenen teklif hariç müşterinin `WON/LOST` geçmişindeki kazanma oranı. En az iki kararlı teklif yoksa sayı dönmüyor; “Yetersiz veri” gösteriliyor.
- **Finansal Risk:** Müşterinin gerçek `OVERDUE` ödeme sayısı ve toplam tutarı. Birleşim skoru `100 - gecikmiş ödeme sayısı × 25`, alt sınır 0.
- **Stratejik Önem:** Müşterinin kazanılmış teklif toplamı, organizasyondaki müşteri bazlı kazanılmış teklif toplamlarının medyanıyla karşılaştırılıyor. Keyfi parasal eşik kullanılmıyor.
- **Teklif Sıcaklığı:** Mevcut Müşteri İlgisi, Pazarlık Kolaylığı, Kazanma Olasılığı ve Finansal Risk bileşenlerinin 0–100 skorları eşit ağırlıkla ortalanıyor. Eksik bileşen gizlenmiyor ve ortalamaya katılmıyor. Sonuç 67+ “Sıcak”, 34–66 “Ilık”, altı “Soğuk”. Kullanılan bileşen ve kanıtlar UI'da listeleniyor.

## Bilerek hesaplanmayan boyutlar

- **Kârlılık:** `QuoteItem` üzerinde maliyet/COGS alanı yok.
- **Fiyat Rekabetçiliği:** Pazar veya rakip fiyat verisi yok.
- **Teslimat Yapılabilirliği:** Kanonik üretim kapasitesi verisi yok.

Bu boyutlar UI'da “Hesaplanamıyor” başlığı ve gerçek sebebiyle açıkça gösteriliyor; varsayılan değer üretilmiyor.

## Müşteri Karar Karnesi

Karne yalnızca en az iki kararlı teklif olduğunda açılıyor. Aksi durumda hiçbir alt davranış genellenmeden tek bir “Yetersiz veri — henüz yeterli teklif geçmişi yok” sonucu dönüyor.

Yeterli örneklemde:

- Kazanma oranı `WON / (WON + LOST)` olarak hesaplanıyor.
- Ortalama karar süresi, geçerli `sentAt → wonAt/lostAt` aralıklarının gün ortalaması.
- Ortalama pazarlık turu, kararlı teklif başına karşı teklif sayısı.
- Baskın itiraz alanı, gerçek karşı teklif alan doluluklarının sayımıyla Fiyat/Ödeme Koşulu/Teslim Süresi odağı olarak belirleniyor.
- Yönetim onayı davranışı için sistem sinyali bulunmadığı; sezon/bütçe dönemi davranışı için güvenilir çok yıllı veri birikmesi gerektiği açıkça belirtiliyor.

## API ve organizasyon izolasyonu

`GET /api/quotes/[quoteId]/intelligence` cookie auth guard kullanıyor. Route ve servis sorgularının tamamı authenticated `organizationId` ile kapsamlanıyor. Public token/API yüzeylerine istihbarat veya dahili müşteri geçmişi eklenmedi.

## Doğrulama

- Birim testleri gerçek event sayısının taşınmasını, gecikmiş ödeme sinyalini, iki altı örneklem kapısını ve gerçek karşı teklif alanlarından “Fiyat Odaklı” sonucunu doğruluyor.
- İzole Playwright kabul testi public sayfayı üç kez yükleyerek üç gerçek `QUOTE_VIEWED` event'i oluşturuyor; Sinyal sekmesinde 3 görüntülenme, %50 kazanma oranı, bir gecikmiş ödeme ve “Fiyat Odaklı” sonucunu doğruluyor.
- İkinci müşteriyle tek kararlı teklif örnekleminde karne ve API'nin sayı uydurmadan yetersiz veri döndürdüğü doğrulanıyor.
- TypeScript, ESLint, organization-scoping, user-facing-text, production build ve tam Vitest doğrulamaları çalıştırıldı.
- Ekran kanıtı: `qa-screenshots/teklif-faz4-sinyal.png`.
