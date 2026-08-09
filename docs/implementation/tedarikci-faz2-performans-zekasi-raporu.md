# Tedarikçi Faz 2 — Performans Zekası Uygulama Raporu

## Kapsam

Tedarikçi performansı artık ayrı ve tahmini bir veri kaynağından değil, tedarikçiye bağlanmış gerçek `StockMovement/RECEIPT` olaylarından türetilir. Stok girişi; tedarikçi, beklenen tarih, birim maliyet ve kalite sinyali kabul eder. Tedarikçi verilmemiş eski girişler `MANUAL` olarak çalışmaya devam eder.

Hesaplanan ve `Supplier` üzerinde saklanan projection'lar:

- teslimat: toplam/ölçülebilir giriş, erken-zamanında-geç adetleri, zamanında oranı ve ortalama gün sapması;
- kalite: `OK`, `DAMAGED`, `PARTIAL` adetleri, kalite oranı ve ürün kırılımı;
- fiyat: ürün bazında ilk/son birim maliyet, oran ve artış yüzdesi;
- bağımlılık: gerçek giriş miktarlarında bir tedarikçinin payı `%70` üzerindeyse ürün bazında risk;
- alternatif: aynı `SupplierProduct.productServiceId` bağlantısını taşıyan aktif tedarikçiler.

Politik, döviz, savaş, afet veya regülasyon riski otomatik hesaplanmaz. Bunlar yalnızca kullanıcının `Supplier.riskNotes` alanından gelir.

## Skor formülü

Kompozit skor 0–100 aralığındadır:

`skor = (teslimat × 40 + kalite × 35 + fiyat × 25) / kullanılabilir ağırlık toplamı`

- Teslimat bileşeni: zamanında teslim oranı.
- Kalite bileşeni: `OK / ölçülmüş kalite kaydı` oranı.
- Fiyat bileşeni: fiyat artış yüzdesinin 100'den düşülmesi; düşüş cezalandırılmaz, sonuç 0–100 aralığına sıkıştırılır.
- Ölçülemeyen bileşen formülden çıkarılır ve kalan ağırlıklar normalize edilir. Böylece eksik veri sıfır performans gibi yorumlanmaz.

Hiç tedarikçi bağlantılı `RECEIPT` yoksa skor üretilmez; `Supplier.score = null` kalır ve `executiveSummary.status/message = "INSUFFICIENT_CANONICAL_DATA"` yazılır. Bir giriş var fakat hiçbir skor bileşeni ölçülemiyorsa skor yine `null` olur.

## Executive Intelligence bağlantısı

`Supplier.riskNotes` ve mevcut `Customer.metrixNote`, branded `KnowledgeProjection` elle oluşturulmadan, yalnızca `evaluateKnowledgeSignal(...)` üzerinden `USER_STATEMENT / SIGNAL / unverified / durable` olarak Company Model'e eklenir. Kaynak referansları sırasıyla `Supplier:{id}` ve `Customer:{id}` biçimindedir.

## Arayüz ve konuşma

Living Workspace ham JSON render etmez. API serializer şu düz alanları üretir: `score`, `onTimeDeliveryRate`, `avgLeadTimeDays`, `dependencyRiskFlag`. Tedarikçi performans/güvenilirlik komutu ilgili kaydı yenileyip detay rotasını açar. Ürün için alternatif tedarikçi komutu aktif konuşma extension girişinden ürün çözümleyip alternatif API'sini çağırır.

## Doğrulama kapsamı

İzole entegrasyon testi üç gerçek mal girişi, skor/teslimat hesapları, alternatif tedarikçi sonucu, tedarikçi risk projection'ı, müşteri not projection'ı ve organizasyon temizliğini assertion ile kapsar. Test, güvenli ve açık bir veritabanı hedefi verilmesi için `SUPPLIER_INTELLIGENCE_INTEGRATION_DATABASE_URL` ile etkinleşir.
