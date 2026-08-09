# Stok Faz 2 — Operasyonel Zeka Uygulama Raporu

## Sonuç

Stok domain'ine §25 envanter doğruluğu, §26 stok sağlığı ve §27 yönetsel sinyaller eklendi. Hesaplamalar yalnızca kanonik `Stock`, `StockMovement`, `ProductService`, `Warehouse` ve `StockCountRecord` verisini kullanır. Eşik, tarih veya hareket kanıtı bulunmadığında varsayılan değer üretilmez.

## Veri modeli ve migration

- `ProductService.minStockLevel` ve `maxStockLevel`, varsayılansız nullable `Decimal(14,3)` alanlarıdır.
- `Stock.expiresAt`, varsayılansız nullable tarihtir.
- `StockCountRecord`, sayım anındaki sistem miktarını, sayılan miktarı ve değişmez `countedQuantity - systemQuantityAtCount` farkını saklar.
- `StockCountStatus`: `NO_VARIANCE`, `PENDING_INVESTIGATION`, `CORRECTED`, `DISMISSED`.
- `20260809170000_add_stock_operational_intelligence` additive SQL migration'ıdır; `db push` kullanılmadı.
- `prisma migrate dev --create-only` yerel PostgreSQL `localhost:5432` kapalı olduğu için P1001 ile sonuçlandı. Migration SQL'i şemayla uyumlu ve additive olarak kaydedildi; veri tabanı erişilebildiğinde `migrate deploy` ile uygulanır.

## Envanter doğruluğu (§25)

`recordPhysicalCount`, organizasyon kapsamındaki stok satırını okur ve anlık sistem miktarını kayda sabitler. Fark yoksa `NO_VARIANCE`, fark varsa `PENDING_INVESTIGATION` oluşturur; bu aşamada stok miktarı değiştirilmez.

`resolveInventoryVariance` yalnızca açık sapmayı çözebilir:

- `CONFIRM`, çözüm anındaki gerçek miktarla sayılan miktar arasındaki deltayı mevcut `stock.repository.ts` içindeki `updateStockQuantity` ile uygular ve yine mevcut `recordMovement` ile `MovementType.ADJUSTMENT` + `MovementSourceType.ADJUSTMENT` hareketi yazar. Paralel stok güncelleme yolu yoktur. Kayıt `CORRECTED` olur ve `correctionMovementId` saklanır.
- `DISMISS`, stoğa dokunmadan kaydı `DISMISSED` yapar ve inceleme notunu saklar.
- Her iki çözüm `resolvedAt` yazar; çözülmüş kayıt ikinci kez çözülemez.

## Stok sağlığı sinyalleri (§26)

- Hiç hareket etmeyen stok: hareketi olmayan aktif stok satırı.
- Hareketsizlik: son hareketin yaşı açık `windowDays` parametresini aşıyorsa gerçek gün sayısıyla üretilir.
- Uzun rezervasyon/atama/karantina: mevcut durum `RESERVED`, `ALLOCATED` veya `QUARANTINE` iken aynı `toStatus` değerine geçen son hareket kanıtı varsa ve yaşı pencereyi aşıyorsa üretilir. Geçiş kanıtı yoksa sayı uydurulmaz.
- Kritik stok: yalnızca `minStockLevel` varsa `quantity - reservedQuantity` bu değerin altındaysa üretilir.
- Aşırı stok: yalnızca `maxStockLevel` varsa kullanılabilir miktar bu değerin üstündeyse üretilir.
- SKT riski: yalnızca `expiresAt` varsa; geçmiş tarih “süresi geçmiş”, 14 gün veya daha yakın tarih “SKT yaklaşıyor” kapsamındadır ve gerçek gün farkı döner.
- Kalite problemi: `DAMAGED` satır veya pencere içinde `qualityFlag` değeri dolu ve `OK` dışında olan hareket.

Her kategori etkilenen satır sayısını, örnek stok kimliklerini ve kanonik ayrıntıları döndürür. Hiç sinyal üretilemiyorsa durum `INSUFFICIENT_CANONICAL_DATA` olur.

## Yönetsel sinyaller (§27)

- Risk: kritik stok + kalite problemi + SKT riski + açık `PENDING_INVESTIGATION` sayımı.
- Opportunity: aşırı stok.
- Operational: hareketsizlik + uzun rezervasyon/atama/karantina.

Konum hiyerarşisi ve depo kapasitesi verisi olmadığı için yoğun toplama alanı, darboğaz, kapasite doluluğu, transfer ihtiyacı ve depo optimizasyonu üretilmez; API sonucunda atlama nedeni açıkça bulunur. Servis öneri/karar üretmez; `recommendationOwner = EXECUTIVE_INTELLIGENCE` ile gerçek sinyalleri üst katmana bırakır.

## Living Workspace ve doğal dil

Living Workspace sözleşmesine yalnızca düz `healthSummary`, `openVarianceCount`, `riskSignalCount`, `opportunitySignalCount` alanları eklendi. Stok listesinde organizasyon geneli sağlık/sinyal kartı ve açık sayım farkları için inceleme kartı gösterilir; iç içe nesne metne çevrilmediği için `[object Object]` riski oluşturulmaz.

Mevcut `stock-management-conversation-extension.ts` genişletildi. Açık sayım, sapma listeleme/çözme, stok sağlığı ve yönetsel sinyal komutları diakritik toleranslıdır ve gerçek `executeActiveConversationExtension` testiyle doğrulanır. Belirsiz cümleden aday çıkarımı yapılmaz.

## Kapsam dışı

- §28 Conversation Integration: belirsiz/dolaylı cümleden sayım önerisi çıkaran stok-özel aday/kanıt boru hattı ayrı fazdır; bu faz yalnızca açık komutları işler.
- §29 External Integration Contract: gerçek ERP/WMS/RFID/barkod veri üreticisi bulunmadığı için uydurma entegrasyon eklenmedi.
- Kapasite ve konum tabanlı operasyon optimizasyonları, kanonik veri modeli bulunana kadar üretilmez.

## Kabul kanıtı

`e2e/stok-faz2-kanit.acceptance.e2e.ts`, izole `STOK FAZ2 ACCEPTANCE {suffix}` organizasyonunda iki gerçek sapma oluşturur; birini onaylayıp ADJUSTMENT hareketini, diğerini reddedip stok değişmezliğini doğrular. Eşikli ürünün kritik sinyal verdiğini, eşiksiz ürünün vermediğini kanıtlar. Test `waitFor({ state: "visible" })` ve `waitForLoadState("networkidle")` kullanır; sabit bekleme yoktur. Son blok organizasyonu siler ve `ACCEPTANCE_CLEANUP_DONE` üretir.

Ekran hedefleri:

- `qa-screenshots/stok-faz2-envanter-dogrulugu.png`
- `qa-screenshots/stok-faz2-saglik-sinyalleri.png`

Doğrulama sonuçları:

- `npx prisma validate`: başarılı.
- `npx prisma generate`: başarılı.
- `npx prisma migrate deploy`: `20260809170000_add_stock_operational_intelligence` başarıyla uygulandı.
- `npx tsc --noEmit`: başarılı.
- `npx vitest run --reporter=dot --silent`: 281 dosya geçti, 7 dosya atlandı; 2164 test geçti, 16 test atlandı.
- `npm run check:text-quality`: başarılı, 293 dosya.
- `npm run check:organization-scoping`: başarılı, 70 scoped model ve 237 guarded Prisma çağrısı.
- Dokunulan dosyalarda `npx eslint`: hata yok.
- `npm run build`: başarılı. Mevcut, bu faz dışındaki lint uyarıları build'i engellemedi.
- `npx playwright test --config=playwright.stok-faz2.config.ts`: 1/1 geçti; onay, red, eşikli/eşiksiz ürün ve `ACCEPTANCE_CLEANUP_DONE` doğrulandı.
- İki ekran kanıtı da görsel olarak açılıp incelendi.
