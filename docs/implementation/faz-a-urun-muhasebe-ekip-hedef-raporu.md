# Faz A — Ürün, Muhasebe, Ekip ve Hedef Sohbet Erişimi

## Sonuç

Bu faz, mevcut kanonik backend'lere yeni domain mantığı eklemeden dört alanı gerçek sohbet giriş noktasına bağladı. Prisma şeması ve migration'lar değiştirilmedi.

## Sohbet bağlantıları

- Ürün: “ürünleri göster” ve “ürün listesi” komutları `/metrix/products` yüzeyini açar.
- Muhasebe: “muhasebe özetini göster”, “nakit durumumuz ne” ve “finansal özetimizi göster” komutları `/metrix/accounting` yüzeyini açar.
- Ekip: listeleme, e-posta ile davet, ad/e-posta çözümlemesiyle rol değiştirme ve üyeyi devre dışı bırakma/etkinleştirme desteklenir. Türkçe ve İngilizce rol adları sabit bir sözlükle kanonik rollere çevrilir. Mutasyonlar mevcut `POST /api/organization-members` ve `PATCH /api/organization-members/[memberId]` uçlarını kullanır.
- Hedef: “hedeflerimizi göster” ve “hedef listesini göster” komutları `/metrix/goals` yüzeyini açar.

Tüm komutlar diakritikli ve sade Türkçe varyantlarıyla `executeActiveConversationExtension` üzerinden test edildi. Yeni domain'ler ortak conversation handoff sözleşmesine eklendi; e-posta ile çözümlenen ekip üyeleri de sunucu tarafındaki güvenli handoff doğrulamasından geçer.

## Hedef Living Workspace bağlantısı

`goal` domain sözleşmesi ve adaptörü eklendi. Adaptör gerçek `/api/goals` cevabındaki `goals` anahtarını kullanır; alan kaydı sözleşmedeki hedef alanlarıyla sınırlıdır ve API'nin kullandığı `goals.write` iznine bağlıdır. Mevcut BigInt-güvenli API serileştirmesi korunmuştur. `/metrix/goals`, kullanılamıyor yüzeyi yerine kanonik hedef listesini gösterir.

Ürün ve hedef listeleri merkezi navigasyon komut host'una açık projector'larla bağlandı; böylece sohbet navigasyonu yalnızca URL değiştirmekle kalmaz, doğru Living Workspace directive'ini de üretir.

## Bilinçli kapsam dışı bırakılanlar

- Ürün oluşturma komutu eklenmedi. Mevcut `product.create`, doğrudan sohbet oluşturması değil, bir Business Reality Candidate kaydını kanonik ürüne yükselten action'dır. Bu akışı atlayan paralel bir oluşturma yolu icat edilmedi.
- Hedef oluşturma komutu eklenmedi. Hedef oluşturma başlık, dönem, tutarlar ve tarihler gibi çok sayıda zorunlu alan gerektirir; mevcut bir form ya da çok adımlı toplama akışı yoktur. Bu nedenle güvenilmez tek cümlelik bir oluşturma yolu eklenmedi.

## Ekran ve veri kanıtı

Playwright senaryosu izole `FAZ-A ACCEPTANCE {suffix}` organizasyonunda çalıştı. Ürün, muhasebe, ekip ve hedef yüzeyleri sohbet komutlarıyla açıldı. Ekip daveti gerçek kaydı listede gösterdi; rol değiştirme komutu veritabanı assertion'ıyla `TEAM_LEAD` olarak doğrulandı. Senaryo sonunda organizasyon ve test kullanıcıları silindi ve `ACCEPTANCE_CLEANUP_DONE` doğrulandı.

- `qa-screenshots/faz-a-urun-listesi.png`
- `qa-screenshots/faz-a-muhasebe-ozeti.png`
- `qa-screenshots/faz-a-ekip-davet.png`
- `qa-screenshots/faz-a-hedef-listesi.png`

## Doğrulama

- `npx tsc --noEmit`
- `npx vitest run`
- `npm run check:organization-scoping`
- `npm run check:text-quality`
- Dokunulan dosyalarda `npx eslint`
- `npm run build`
- `npx playwright test -c playwright.faz-a.config.ts`

Ekran kanıtları ayrıca açılarak ürün, finansal özet, davet edilmiş ekip üyesi ve hedef verisinin görünür olduğu doğrulandı.
