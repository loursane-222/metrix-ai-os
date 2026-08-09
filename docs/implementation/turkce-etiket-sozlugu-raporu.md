# Türkçe Etiket Sözlüğü Tamamlama Raporu

## Sonuç

Living Workspace yüzeylerinde sözlükte bulunmadığı için ham İngilizce/camelCase olarak görünen kanonik alan etiketleri tamamlandı. Prisma şeması ve migration'lar değiştirilmedi.

## Kapsam

- Company, Customer, Supplier, Product, Notification, Order, Delivery, Accounting, Team, Goal ve Stock alanları için 57 istenen Türkçe etiket eklendi.
- Mevcut Notification adapter'ındaki `unreadCount`, derived-metric istisnaları arasında olmadığı ve brifing listesinden eksik kaldığı için “Okunmamış” etiketiyle kapsama alındı.
- Toplam yeni etiket sayısı: **58**.
- `displayName` ve `name` gibi jenerik anahtarların ileride başka anlamla kullanılması halinde çakışma kontrolü gerektiği kodda açıkça belgelendi.
- Mevcut domain ve adapter alanları tarandığında aynı anahtarın farklı domainlerde farklı Türkçe anlam gerektirdiği bir çakışma bulunmadı.

Etiket fonksiyonu test edilebilir küçük bir TypeScript modülüne ayrıldı ve `CanonicalDomainSurface.tsx` üzerinden export edilmeye devam ediyor. Yüzey, aynı `humanLabel()` fonksiyonunu kullanıyor; fallback davranışı değiştirilmedi.

## Kalıcı regresyon koruması

`human-label-coverage.test.ts`, aşağıdaki kaynaklardan anahtarları otomatik toplar:

- `DOMAIN_RULES[*].fields`
- `DOMAIN_SURFACE_ADAPTERS[*].fieldRegistry`
- `DOMAIN_SURFACE_ADAPTERS[*].summaryMetrics`

`count`, `activeCount`, `openCount`, `overdueCount` ve `depletedStockCount` özel işlenen derived metric'ler olduğu için kapsam dışında tutulur. Kalan **88 benzersiz anahtarın** fallback çıktısına düşmediği doğrulanır. İstenen açık çevirisi fallback ile aynı olan `lot: "Lot"`, testte belgelenmiş tekil istisna olarak doğrudan “Lot” değeriyle doğrulanır.

## Doğrulama

- `npx tsc --noEmit` — geçti.
- `npx vitest run src/components/living-workspace/__tests__/human-label-coverage.test.ts` — geçti.
- `npx eslint src/components/living-workspace/CanonicalDomainSurface.tsx src/components/living-workspace/human-label.ts src/components/living-workspace/__tests__/human-label-coverage.test.ts` — geçti.
- Tam `npx vitest run` — sonuç aşağıdaki tam doğrulama çalıştırmasıyla kaydedildi.

Ekran kanıtı görev kapsamında zorunlu olmadığı için üretilmedi; regresyon koruması doğrudan kanonik sözleşme ve adapter kayıtlarını kapsıyor.
