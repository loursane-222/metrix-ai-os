# İrsaliye Faz 1 — Kanonik Model Uygulama Raporu

**Faz:** İrsaliye Faz 1 — Kanonik Model ve Yaşam Döngüsü  
**Tarih:** 2026-08-09  
**Revizyon:** Faz 1 düzeltme turu — 3 bulgu kapatıldı

---

## Kök Neden / Görev Tanımı

İrsaliye (Delivery) domaininin kanonik modeli, §17 yaşam döngüsü durum makinesi, Sipariş↔İrsaliye senkronizasyonu ve Living Workspace entegrasyonu eksikti.

Faz 1 uygulamasının ardından bağımsız denetimde 3 bulgu tespit edildi ve bu turda kapatıldı:

1. **Bulgu 1** — `irsaliye-faz1-liste.png` geçersizdi: workspace paneli render olmadan önce ekran görüntüsü alınıyordu. Düzeltme: `locator.waitFor({ state: 'visible' })` + `waitForLoadState('networkidle')` kullanıldı.

2. **Bulgu 2** — Konuşma uzantısının `CREATE_FROM_ORDER_PATTERN` handler'ı irsaliyeyi DRAFT'ta bırakıyordu; `syncOrderShipmentStatus` hiç tetiklenmiyordu. Düzeltme: `CreateDeliveryFromOrderInput`'a `autoDispatch?: boolean` eklendi; `true` verildiğinde `createDeliveryFromOrder` aynı transaction içinde DRAFT→DISPATCHED geçişini ve Sipariş senkronizasyonunu gerçekleştirir. Konuşma uzantısı `createDeliveryFromOrder(orderId, true)` çağırır.

3. **Bulgu 3** — `syncOrderShipmentStatus`, `transitionOrderStatus`'u ayrı bir `prisma.$transaction` açarak çağırıyordu; atomicity ihlali. Düzeltme: `transitionOrderStatus`'a opsiyonel `outerTx?: Prisma.TransactionClient` parametresi eklendi; verilirse kendi transaction'ını açmak yerine onu kullanır. `syncOrderShipmentStatus` elindeki `tx`'i geçirir.

---

## Değiştirilen / Oluşturulan Dosyalar

### Veritabanı
- `prisma/schema.prisma` — DeliveryStatus enum, Delivery, DeliveryItem, DeliveryStatusHistory, DeliveryCustomFieldValue modelleri ve geri referanslar
- `prisma/migrations/20260809000000_add_delivery_domain/migration.sql` — Gerçek migration SQL dosyası

### Çekirdek Servis Katmanı
- `src/lib/core/deliveries/delivery.types.ts` — `autoDispatch?: boolean` CreateDeliveryFromOrderInput'a eklendi
- `src/lib/core/deliveries/delivery.repository.ts` — Repository fonksiyonları (IRS- prefix)
- `src/lib/core/deliveries/delivery.service.ts` — §17 durum makinesi; `createDeliveryFromOrder` autoDispatch desteği; `syncOrderShipmentStatus` artık `tx` geçiriyor
- `src/lib/core/deliveries/delivery.serializer.ts` — BigInt alanları string'e dönüştürür (balanceCents, unitPriceCents, lineTotalCents, costCents, priceCents)
- `src/lib/core/orders/order.service.ts` — `transitionOrderStatus`'a opsiyonel `outerTx?: Prisma.TransactionClient` parametresi eklendi (geriye dönük uyumlu)

### API Katmanı
- `src/app/api/deliveries/route.ts` — GET, POST
- `src/app/api/deliveries/[deliveryId]/route.ts` — GET, PATCH
- `src/app/api/deliveries/from-order/route.ts` — POST, `autoDispatch` body parametresini okur

### Living Workspace Entegrasyonu
- `src/lib/living-workspace/contracts.ts` — "delivery" domaini, DOMAIN_RULES, `businessSurface` tipi ve runtime validasyonu (delivery-list, delivery-create dahil)
- `src/lib/living-workspace/domain-adapters.ts` — delivery adaptörü
- `src/lib/living-workspace/planner.ts` — CONFIG'e delivery, createDeliveryWorkspaceDirective
- `src/components/living-workspace/BusinessSurfaceResolver.tsx` — CANONICAL_SURFACES'e "delivery-list", delivery-create dalı
- `src/components/living-workspace/DeliveryCanonicalScreen.tsx`
- `src/components/living-workspace/DeliveryCreateScreen.tsx`

### Uygulama Sayfaları
- `src/app/metrix/deliveries/page.tsx`
- `src/app/metrix/deliveries/new/page.tsx`

### Konuşma Uzantısı
- `src/lib/conversation-extensions/delivery-management-conversation-extension.ts` — `createDeliveryFromOrder(orderId, true)` (autoDispatch)
- `src/lib/conversation-extensions/active-conversation-extension.ts`
- `src/lib/conversation-extensions/conversation-extension-handoff.ts` — "deliveries" domaini, deliveryHandoff

### Aksiyon Kaydı
- `src/lib/action-runtime/registry/manifests/deliveries.actions.ts`
- `src/lib/action-runtime/registry/index.ts`

### İstemci / Çözümleme
- `src/lib/deliveries/deliveries-client.ts` — `createDeliveryFromOrder(orderId, autoDispatch?)`
- `src/lib/deliveries/delivery-resolution.ts`

### Input Authority
- `src/components/input-authority/ExecutiveNavigationCommandHost.tsx`

### Test
- `src/lib/conversation-extensions/__tests__/all-domains-active-entry.test.ts`
- `e2e/irsaliye-faz1-kanit.acceptance.e2e.ts` — robust waitFor, DISPATCHED + order sync doğrulaması
- `playwright.irsaliye-faz1.config.ts`

---

## Doğrulama Sonuçları

| Kontrol | Sonuç |
|---|---|
| `npx tsc --noEmit` | Geçti — hata yok |
| `npx vitest run` | 2139 geçti, 15 atlandı (283 dosya) |
| `npm run build` | Başarılı |
| Playwright kabul testi | 1 geçti (13.7s) |

### Kabul testinde gözlemlenen doğrulama çıktıları

```
ACCEPTANCE_DISPATCHED_COUNT { dispatched: 1, total: 2 }
ACCEPTANCE_ORDER2_SYNCED_STATUS SHIPPED
```

- IRS-0001: DRAFT (liste ekran görüntüsünde görünür)
- IRS-0002: DISPATCHED (konuşma komutu aracılığıyla, autoDispatch=true)
- SIP-0002: SHIPPED (tüm irsaliye kalemleri gönderildi — atomik transaction içinde senkronize edildi)

---

## Ekran Kanıtları

| Dosya | İçerik |
|---|---|
| `qa-screenshots/irsaliye-faz1-liste.png` | "irsaliyeleri göster" → workspace paneli "İrsaliyeler", IRS-0001 (DRAFT) listede görünür; panel tam render olduktan sonra alındı |
| `qa-screenshots/irsaliye-faz1-detay.png` | IRS-0001 satırına tıklanınca açılan detay görünümü |
| `qa-screenshots/irsaliye-faz1-yeni.png` | "SIP-0002 siparişini irsaliyeye dönüştür" → IRS-0001 + IRS-0002, en az bir DISPATCHED kayıt görünür |

---

## Commit / Push Durumu

Commit ve push talep edilmedi.
