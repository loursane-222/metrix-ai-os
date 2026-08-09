# Teklif Faz 3 — Müşteri Aksiyonları Uygulama Raporu

## Sonuç

Genel teklif sayfasına Onayla, Karşı Teklif Ver ve Reddet aksiyonları eklendi. Aksiyonlar Faz 2'nin hash-only token sınırı içinde oturumsuz çalışıyor; teklif sonucu, kanonik `QuoteEvent` kaydı ve gerçek dahili bildirim birlikte oluşturuluyor.

## Veri modeli

- Onay için mevcut `QuoteStatus.WON` ve `wonAt`, ret için `QuoteStatus.LOST` ve `lostAt` kullanıldı.
- Ret nedenini saklamak için nullable `Quote.lostReason` eklendi.
- Karşı teklif tutarı, ödeme/teslim koşulları ve mesajı additive `QuoteCounterProposal` modelinde yapılandırılmış olarak saklanıyor.
- Yeni status veya event enum değeri eklenmedi. `QUOTE_WON`, `QUOTE_LOST` ve `QUOTE_NEGOTIATION_STARTED` yeniden kullanıldı.
- Migration: `20260809200000_add_offer_customer_actions`.

## Güvenlik ve tutarlılık

- Public token veritabanında yalnızca SHA-256 hash olarak kalmaya devam ediyor; aksiyon servisinin doğrudan token sorgusu organization-scoping guard'da dar ve gerekçeli capability istisnasıdır.
- Public serileştirmeye yalnızca müşterinin kendi teklif durumu eklendi. İç `notes` ve `metadata` hâlâ seçilmiyor veya dönmüyor.
- Yalnızca `SENT`, `VIEWED` ve `NEGOTIATION` durumlarında aksiyon kabul ediliyor. Terminal bir teklife ikinci karar `409` ve “Bu teklif için karar zaten alınmış.” mesajıyla reddediliyor.
- Durum güncellemesi koşullu `updateMany` ile transaction içinde yapılıyor; iki sekmeden eşzamanlı terminal kararın birbirini ezmesi engelleniyor.
- Onay otomatik sipariş oluşturmuyor. Kabul testi `WON` sonrasında `Quote.orders` ilişkisinin boş kaldığını doğruluyor; siparişe dönüştürme mevcut dahili komuta bırakıldı.
- Bildirimler Faz 2 ile aynı `notifyWithOwnerFanout` desenini kullanıyor ve canonical durum/event kayıtlarından sonra best-effort gönderiliyor.

## Kullanıcı deneyimi

- Onay yanlış tıklamayı önleyen ikinci bir doğrulama adımına sahip.
- Ret nedeni opsiyonel olarak alınarak `lostReason`, event notu ve bildirim gövdesine taşınıyor.
- Karşı teklif formunda dört alan opsiyonel; ancak en az biri hem istemci hem sunucu tarafından zorunlu tutuluyor.
- Başarıdan sonra açık sonuç mesajı gösteriliyor. API'nin karar alınmış veya validasyon hataları kullanıcıya sessizce yutulmadan gösteriliyor.
- `WON`, `LOST` ve `CANCELLED` tekliflerde aksiyonlar gizlenip sabit durum mesajı gösteriliyor.

## Doğrulama ve kanıt

- Prisma schema doğrulaması ve additive migration uygulaması başarılı.
- TypeScript, ESLint, organization-scoping ve user-facing-text kontrolleri geçti.
- Üretim derlemesi yeni public aksiyon route'larıyla tamamlandı.
- İzole Playwright kabul testi onay, sipariş oluşmaması, ikinci kararın reddi, nedenli ret, gerçek karşı teklif içeriği, event/bildirimler ve veri temizliğini doğruluyor.
- Ekran kanıtları:
  - `qa-screenshots/teklif-faz3-onayla.png`
  - `qa-screenshots/teklif-faz3-onay-bildirimi.png`
  - `qa-screenshots/teklif-faz3-karsi-teklif.png`

Offer Intelligence Score ve müşteri karar karnesi Faz 4 kapsamında bırakıldı.
