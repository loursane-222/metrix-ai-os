# İrsaliye Faz 2 — Operasyonel Zeka Uygulama Raporu

## Sonuç

İrsaliye domain'ine sevkiyat bütünlüğü, taşıyıcı performansı, teslim performansı, metin tabanlı teslim kanıtı ve durumdan bağımsız istisna kaydı eklendi. Hesaplamalar yalnızca mevcut `Delivery`, `DeliveryItem`, `DeliveryStatusHistory` ve bağlı `Order` verilerini kullanır; kanonik veri yoksa oran üretilmez.

## Veri modeli ve migration

- `DeliveryItem.conditionFlag`, varsayılansız ve nullable `DeliveryItemCondition` enum'u olarak eklendi: `OK`, `SHORT`, `DAMAGED`, `WRONG_ITEM`, `MIXED`.
- `DeliveryException`, organizasyon ve teslimat kapsamlı, yalnızca ekleme yapan bir operasyon kaydı olarak eklendi. İstisna yazılması teslimat durumunu değiştirmez.
- `20260809160000_add_delivery_intelligence` migration'ı additive SQL içerir; `db push` kullanılmadı.
- `prisma migrate dev --create-only`, geliştirme veritabanındaki bu fazdan önce mevcut olan migration drift'i nedeniyle reset istedi. Veri sıfırlanmadı. Hazır additive migration `prisma migrate deploy` ile başarıyla uygulandı.

## Hesaplamalar

### Sevkiyat bütünlüğü (§21)

Her teslimat kalemi, `conditionFlag` değerine göre “eksiksiz”, “eksik”, “hasarlı”, “yanlış”, “karışık” veya “durum bildirilmedi” olarak açıklanır. Teslimattaki kalem miktarları, bağlı siparişin silinmemiş kalem miktarlarıyla ürün/hizmet bazında karşılaştırılır.

Kapsama oranı:

`teslimattaki toplam miktar / bağlı siparişteki toplam aktif miktar × 100`

Bu oran yalnızca bilgi amaçlıdır; Faz 1'deki fazla sevkiyat korumasına yeni bir doğrulama veya lifecycle kuralı eklemez.

### Taşıyıcı performansı (§23)

Varsayılan pencere son 90 gündür. Yalnızca adı dolu olan taşıyıcılar ve sevk edilmiş veya sonraki duruma ulaşmış teslimatlar gruba alınır. Boş taşıyıcılar için “bilinmeyen” grup uydurulmaz.

- Zamanında teslim oranı: `commitmentAt` bulunan ölçülebilir teslimatlar içinde `deliveredAt`, yoksa `dispatchedAt`, taahhüt zamanını aşmayanların oranı.
- Ortalama teslim süresi: hem `dispatchedAt` hem `deliveredAt` bulunan teslimatlarda iki tarih arasındaki ortalama saat; ayrıca okunabilir gün karşılığı.
- Hasar/eksik oranı: condition bilgisi bulunan teslimatlar içinde en az bir `SHORT`, `DAMAGED`, `WRONG_ITEM` veya `MIXED` kalemi olan teslimatların oranı.

### Teslim performansı (§26)

Taşıyıcı ayrımı olmadan aynı pencere ve aynı zamanında teslim, süre ve hasar/eksik formülleri kullanılır.

İlk seferde başarı oranı:

`DELIVERED/COMPLETED durumuna ulaşan ve geçmişinde FAILED_DELIVERY bulunmayan teslimatlar / DELIVERED/COMPLETED teslimatlar × 100`

`RESCHEDULED` tek başına başarısızlık sayılmaz; kanıt `DeliveryStatusHistory` içindeki gerçek `FAILED_DELIVERY` geçişidir.

## Yetersiz kanonik veri davranışı

Payda oluşturacak gerçek kayıt bulunmadığında oran `null`, açıklama ise `INSUFFICIENT_CANONICAL_DATA` olur. Örnekler:

- taahhüt tarihi olmayan teslimatlardan zamanında teslim oranı çıkarılmaz;
- dispatch ve delivery zamanlarının ikisi birden yoksa ortalama süre çıkarılmaz;
- hiçbir kalemde `conditionFlag` yoksa hasar/eksik oranı çıkarılmaz;
- tamamlanmış teslimat yoksa ilk sefer başarı oranı çıkarılmaz.

UI sözleşmesine yalnızca düz alanlar verilir: `integritySummary`, `onTimeDeliveryRate`, `firstAttemptSuccessRate`, `damageRate`. İç içe JSON nesneleri alan listesine aktarılmaz.

## Teslim kanıtı ve istisna

Teslim kanıtı `confirmationCode`, `receiverName`, `signatureCaptured` ve `note` ile sınırlıdır. Mevcut `receiverName` kolonu güncellenir; diğer alanlar `deliveryProof` JSON alanına yazılır. Fotoğraf, GPS, QR veya doğrulanmamış Document Domain entegrasyonu eklenmedi.

İstisna kaydı append-only `DeliveryException` satırı üretir; teslimat durumunu değiştirmez. Her iki yazım da çağıranın transaction'ına katılabilmek için `outerTx?: Prisma.TransactionClient` desenini kullanır.

## Orkestrasyon ve doğal dil

`refreshDeliveryIntelligence`, tekil bütünlük ile organizasyon geneli performans özetini hesaplayıp `Delivery.executiveSummary` alanına yazar. Oluşturma, durum geçişi, iptal ve detay okuma akışlarına bağlandı.

Mevcut İrsaliye conversation extension genişletildi. Sevkiyat bütünlüğü, taşıyıcı performansı, genel teslim performansı, teslim kanıtı ve istisna komutları diakritik toleranslı olarak gerçek `executeActiveConversationExtension` giriş noktasından doğrulandı. Taşıyıcı performansı ayrı sayfa açmadan konuşma yanıtında sunulur.

## Bilinçli kapsam dışı alanlar

- §19 Dispatch Planning: Delivery domain anayasa gereği rota optimizasyonu sahibi değildir; mevcut dispatch alanları kanonik temsil olarak bırakıldı.
- §20 Loading Intelligence: WMS, barkod, palet/koli ve araç kapasitesi verisi bulunmadığından uygulanmadı.
- §22 Multi-Delivery Intelligence: Order → çoklu Delivery özeti Sipariş Faz 2'de vardır; Faz 1'in tekil `sourceOrderId` kararı bu fazda değiştirilmedi.
- §27 Executive Recommendation Engine: Delivery domain karar üretmez; hesaplanan gerçekler Executive Intelligence'a girdi sağlar. Ayrı öneri motoru eklenmedi.
- Fotoğraf/GPS/QR kanıtı, dispatch/loading optimizasyonu ve Faz 3+ başlıkları uygulanmadı.

## Doğrulama ve ekran kanıtı

- `npx prisma validate`: başarılı
- `npx prisma generate`: başarılı
- `npx tsc --noEmit`: başarılı
- `npx vitest run --reporter=dot`: 281 dosya geçti, 7 dosya atlandı; 2160 test geçti, 16 test atlandı
- `npm run check:text-quality`: başarılı, 293 dosya
- `npm run check:organization-scoping`: başarılı, 69 scoped model ve 237 guarded call
- Dokunulan TypeScript/TSX dosyalarında `npx eslint`: hata yok
- `npm run build`: başarılı
- Playwright kabul testi: 1/1 geçti; gerçek teslim kanıtı ve istisna assertion'ları geçti; `ACCEPTANCE_CLEANUP_DONE` doğrulandı
- İzole organizasyon test sonunda silindi.

Ekran kanıtları:

- `qa-screenshots/irsaliye-faz2-butunluk.png`
- `qa-screenshots/irsaliye-faz2-tasiyici.png`

Her iki görsel de açılarak incelendi. Bütünlük ekranı tekil teslimatın düz özetlerini, taşıyıcı ekranı iki farklı taşıyıcının kanonik metriklerle karşılaştırmasını gösterir.
