# Sipariş Faz 2 — Operasyonel Zeka Uygulama Raporu

## Kapsam ve sonuç

Sipariş Anayasası §19-22 ve §24-27 gerçek Order, Stock ve Delivery kayıtları üzerinden uygulandı. §23 Capacity Intelligence'a dokunulmadı; Production domain bulunmadan kapasite veya üretim yükü tahmini üretilmiyor.

Yeni `OrderRevision` ve `OrderException` modelleri organization-scoped olarak eklendi. Revizyon; önceki snapshot, mutation, sonraki snapshot ve audit satırını tek transaction içinde yazar. Kalem kaldırma fiziksel silme yerine additive `OrderItem.removedAt` ile yapılır. İstisna kaydı sipariş durumunu değiştirmez.

Migration: `prisma/migrations/20260809150000_add_order_intelligence/migration.sql`. `db push` kullanılmadı. `prisma migrate dev --create-only`, geliştirme veritabanında bu görevden önce var olan migration drift'i nedeniyle reset istediği için veri kaybı yaratacak reset uygulanmadı. Aynı gerçek SQL migration güvenli `prisma migrate deploy` ile başarıyla uygulandı.

## Kanonik hesaplamalar

- Execution stage yalnızca `Order.status` ve son status history zamanını insan diline çevirir; yeni state machine yoktur.
- Fulfillment ve reservation, `reservedInventory`, aktif `OrderItem.quantity` ve `riskSignals.stockShortfall` kayıtlarını karşılaştırır.
- Delivery progress yalnızca sevk edilmiş durumdaki `Delivery`/`DeliveryItem.quantity` kayıtlarını toplar.
- Teslim taahhüdü oranı son 90 günde `commitmentAt` bulunan SHIPPED/COMPLETED siparişlerin son `deliveredAt`, yoksa `dispatchedAt` zamanını ölçer. Ölçülebilir sipariş yoksa oran `null`, durum `INSUFFICIENT_CANONICAL_DATA` olur.
- Living Workspace'e yalnızca düz `string | number | boolean | null` özetleri açılır. İç içe hesap detayları API cevabındaki kanonik `executiveSummary` içinde kalır; `[object Object]` yüzeye taşınmaz.

## Öncelik formülü

Mevcut ölçülebilir bileşenler toplam kendi azami ağırlıklarına göre 0-100 aralığına normalize edilir:

- Teslim tarihi: azami 40 puan. Geçmiş 40; 0-2 gün 35; 3-7 gün 25; 8-14 gün 15; daha uzak 5.
- Sipariş tutarı: azami 20 puan. En az 1.000.000 TRY 20; en az 250.000 TRY 14; en az 50.000 TRY 8; altı 3.
- Stok durumu: azami 20 puan. Kanonik stock shortfall varsa 20, yoksa 0.
- Gecikme riski: azami 20 puan. Bu fazda kanonik gecikme sinyali olan stock shortfall varsa 20, yoksa 0.

Etiketler: 80+ Kritik, 65-79 Acil, 45-64 Yüksek, 20-44 Normal, 0-19 Düşük. Hiç ölçülebilir faktör yoksa skor `null`, etiket `Belirsiz` olur. Eksik faktörler kalan ağırlıklar normalize edilerek hesap dışı bırakılır ve güven seviyesi düşürülür.

Hesaplanmayan anayasal faktörler açıkça `omittedFactors` içinde raporlanır:

- Üretim yükü: Production domain yok.
- Sözleşmesel yükümlülük: kanonik sözleşme/SLA kaynağı yok.
- Müşteri önemi: `Customer.tier` serbest metin; kanonik puanlama sözleşmesi olmadığı için skor icat edilmedi.
- `deadlineAt` veya rezervasyon/risk kanıtı yoksa ilgili teslim tarihi, stok ve gecikme bileşenleri de atlanır.

## Doğal dil ve UI

Mevcut `order-management-conversation-extension.ts` genişletildi. Karşılama, stoktan karşılama, öncelik, kritik/acil liste, rezervasyon, zamanında teslim oranı, miktar/tarih revizyonu ve kategori eşleşmeli istisna ifadeleri diakritik toleranslıdır. Girişler gerçek `executeActiveConversationExtension` üzerinden test edildi.

Sipariş detayında karşılama, rezervasyon, öncelik etiketi ve faktörleri, teslimat ilerlemesi ile önce/sonra değerlerini içeren revizyon geçmişi gösterilir. Mutation sonrası detay prefetch'i `cache: "no-store"` kullanır ve yüzey yayınlanmadan önce tamamlanır.

## Doğrulama ve kanıt

- `npx tsc --noEmit`: geçti.
- `npx vitest run --reporter=dot`: 280 test dosyası geçti, 7 skip; 2152 test geçti, 16 skip.
- `npm run check:text-quality`: geçti.
- `npm run check:organization-scoping`: geçti; 68 scoped model, 236 guarded Prisma çağrısı.
- `npm run build`: geçti; Next.js 15.5.19 production build tamamlandı. Yalnız önceden mevcut warning'ler raporlandı.
- `npx playwright test --config=playwright.siparis-faz2.config.ts`: geçti. Gerçek APPROVED rezervasyonu, 4/12 kısmi sevkiyat, `%100` taahhüt assertion'ı ve `ACCEPTANCE_CLEANUP_DONE` doğrulandı.

Ekran kanıtları:

- `qa-screenshots/siparis-faz2-karsilama.png`
- `qa-screenshots/siparis-faz2-oncelik.png`
- `qa-screenshots/siparis-faz2-revizyon.png`

İzole organizasyon adı `SIPARIS FAZ2 ACCEPTANCE {suffix}` desenindeydi ve test sonunda silindiği veritabanı sorgusuyla doğrulandı.
