# Stok Domain Faz 1 — Kanonik Model Uygulama Raporu

## Kök Neden / Görev Gereksinimi

Stock Domain Faz 1: Kanonik model, Warehouse/Stock/StockMovement varlıkları, rezervasyon/tüketim entegrasyonları (Order + Delivery), Action Runtime, Living Workspace, doğal dil girişi ve Playwright kanıtı.

## Tasarım Kararı: availableQuantity

`availableQuantity` ayrı bir DB sütunu olarak SAKLANMADI. `quantity - reservedQuantity` olarak servis katmanında hesaplanıp `availableQuantity: string` olarak serializer'dan döndürülüyor. Gerekçe: iki kaynaklı senkronizasyon hatası sınıfı (dual-source write divergence) önleme. DB'de ayrı sütun tutulursa `quantity` ile `reservedQuantity` güncellenirken `availableQuantity`'nin de güncellenmesi gerekir; herhangi bir işlemde atlanan güncelleme kalıcı tutarsızlık üretir.

## Değiştirilen / Oluşturulan Dosyalar

### Prisma
- `prisma/schema.prisma` — Warehouse, Stock, StockMovement, StockCustomFieldValue modelleri; StockStatus, MovementType, MovementSourceType enum'ları
- `prisma/migrations/20260809010000_add_stock_domain/migration.sql` — additive only, `db push` kullanılmadı

### Servis Katmanı
- `src/lib/core/stock/stock.types.ts`
- `src/lib/core/stock/stock.repository.ts`
- `src/lib/core/stock/stock.service.ts` — `receiveStock`, `transferStock`, `listStock`, `getStockByIdForOrganization`, `createNewWarehouse`, `listWarehousesForOrganization`, `reserveStockForOrder`, `consumeStockForDelivery`
- `src/lib/core/stock/stock.serializer.ts` — BigInt (costCents/priceCents) → string dönüşümü

### Order / Delivery Entegrasyonu
- `src/lib/core/orders/order.service.ts` — `transitionOrderStatus` içinde `toStatus === "APPROVED"` dalına `reserveStockForOrder` çağrısı (aynı tx)
- `src/lib/core/deliveries/delivery.service.ts` — `DISPATCHED` geçişine `consumeStockForDelivery` çağrısı (aynı tx, autoDispatch akışı dahil)

### API Rotaları
- `src/app/api/stock/route.ts` — GET (liste), POST (receiveStock)
- `src/app/api/stock/[stockId]/route.ts` — GET (detay)
- `src/app/api/stock/transfer/route.ts` — POST (transferStock)
- `src/app/api/stock/warehouse/route.ts` — GET (liste), POST (oluştur)

### Action Runtime + Living Workspace
- `src/lib/action-runtime/registry/manifests/stock.actions.ts`
- `src/lib/action-runtime/registry/index.ts` — stockActionDefinitions kaydı
- `src/lib/living-workspace/contracts.ts` — WORKSPACE_DOMAINS, businessSurface
- `src/lib/living-workspace/domain-adapters.ts` — stock adapter
- `src/lib/living-workspace/planner.ts` — createStockWorkspaceDirective
- `src/components/living-workspace/BusinessSurfaceResolver.tsx` — stock-list, stock-create
- `src/components/living-workspace/StockCanonicalScreen.tsx`
- `src/components/living-workspace/StockCreateScreen.tsx`
- `src/app/metrix/stock/page.tsx`
- `src/app/metrix/stock/new/page.tsx`

### Kritik Düzeltme (Bu Fazda Keşfedilen Mimari Boşluk)
- `src/components/input-authority/ExecutiveNavigationCommandHost.tsx` — `createStockWorkspaceDirective` handler zincirine eklendi. Bu olmadan "/metrix/stock" rotasına gelen navigasyon komutları "TARGET_NOT_READY" ile başarısız oluyordu ve workspace directive hiç yayınlanmıyordu.

### Doğal Dil + İstemci
- `src/lib/conversation-extensions/stock-management-conversation-extension.ts`
- `src/lib/conversation-extensions/conversation-extension-handoff.ts` — stockHandoff
- `src/lib/conversation-extensions/active-conversation-extension.ts` — stockManagementConversationExtension kaydı
- `src/lib/stock/stocks-client.ts`
- `src/lib/stock/stock-resolution.ts`

### Test + Kanıt
- `src/lib/conversation-extensions/__tests__/all-domains-active-entry.test.ts` — stock satırı
- `e2e/stok-faz1-kanit.acceptance.e2e.ts`
- `playwright.stok-faz1.config.ts`
- `qa-screenshots/stok-faz1-liste.png`
- `qa-screenshots/stok-faz1-detay.png`
- `qa-screenshots/stok-faz1-transfer.png`

## Düzeltme Faz (2026-08-09) — Commit Öncesi 2 Bulgu

### Bulgu 1 — "[object Object]" render hatası
**Kök neden:** `contracts.ts`, `domain-adapters.ts` ve `planner.ts`'deki stock `fields`/`columns` listeleri `"productService"` ve `"warehouse"` alanlarını içeriyordu. API'den dönen bu alanlar `{id, name, ...}` şeklinde nesne olduğundan genel render motoru `String(value)` → `"[object Object]"` üretiyordu. `planner.ts` düzeltmesi Playwright turu sırasında tespit edildi — farkında olmadan atlanmıştı.

**Düzeltme:**
- `src/lib/core/stock/stock.serializer.ts` — `productServiceName: string` (← `stock.productService.name`) ve `warehouseName: string` (← `stock.warehouse.name`) düz alanları eklendi; mevcut iç içe nesneler korundu.
- `src/lib/living-workspace/contracts.ts` — `stock.fields` listesinde `"productService"` → `"productServiceName"`, `"warehouse"` → `"warehouseName"` olarak güncellendi.
- `src/lib/living-workspace/domain-adapters.ts` — stock adapter `fieldRegistry` ve `allowedListColumns`'da aynı değişiklik.
- `src/lib/living-workspace/planner.ts` — `stock` config `columns` listesinde aynı isim değişikliği (atlanmıştı; `validateWorkspaceDirective` yeni isimlerle tutarsız olduğundan direktif reddediliyordu).

### Bulgu 2 — Kullanılmayan ve bozuk `upsertStockBucket`
**Kök neden:** `upsertStockBucket`, `where: { id: "new" }` sabit literal'i nedeniyle `update` dalı asla çalışmazdı; kod tabanında hiçbir yerde çağrılmıyordu.

**Düzeltme:** `src/lib/core/stock/stock.repository.ts`'den fonksiyon tamamen silindi.

## Ekran Kanıtı Tur Teşhisi (2026-08-09)

### `Object.groupBy` TypeError (executive intelligence zinciri)

Playwright turu `[ChatExecutiveIntelligence] build failed; returning null fallback { errorName: 'TypeError' }` logladı.

**Kök neden:** `src/lib/company/company-model-projection.service.ts:57`'deki `Object.groupBy(assets, ...)` çağrısı, Node.js v20.20.2'de `TypeError: Object.groupBy is not a function` fırlatıyor (`Object.groupBy` ES2024 / Node.js v21+ gerektirir). `buildChatExecutiveIntelligence` catch bloğunda yakalanıyor; `generation_failed_fallback_null` durumu navigation'ı bloke etmiyor — sohbet uzantısı bağımsız çalışıyor.

### `stok-faz1-transfer.png` hatalı içerik (stale UI data)

**Kök neden 1 — `SilentPreparationRuntime` race condition:**
`prepare("stock")` async fetch'i (F1) `consume("stock")` çağrısından SONRA tamamlanıp stale veriyi cache'e yazabilir. İkinci "stoku göster" çağrısında `prepare()`, `this.cache.has("stock")` TRUE olduğundan erken çıkıyor ve yeni fetch başlatmıyor. `consume()` stale (transfer öncesi) veriyi döndürüyor.

**Düzeltme:** `src/lib/executive-signatures/silent-preparation-runtime.ts` — `consume()` içinde, aynı key için devam eden `prepare()` fetch'i iptal edildi (`if (this.active?.key === key) this.cancel()`). Bu production bug'ı: consume çağrıldığında arka planda süren hazırlık fetch'i artık kesilmez durumdan kurtuldu.

**Kök neden 2 — React useEffect/screenshot zamanlama:**
`waitForLoadState("networkidle")`, React'in `useEffect` içinde başlattığı yeni fetch başlamadan önce resolve edebilir. Eski `rows` state DOM'da görünür (`.workspace-record-item` var), `waitForStockListPanel` ilk wait'i geçer, networkidle hemen resolve eder, screenshot eski veriyle alınır.

**Düzeltme:** `e2e/stok-faz1-kanit.acceptance.e2e.ts` — transfer screenshot'ından önce ikinci `.workspace-record-item` (Depo B) görünene kadar bekleniyor. Bu, post-transfer verinin gerçekten DOM'a yansıdığını garantiler.

### `planner.ts` tutarsızlık (direktif doğrulama hatası)

`contracts.ts` yeni alan adlarına güncellenirken `planner.ts` kaçırıldı. `createStockWorkspaceDirective` eski adlarla direktif oluştururken `validateWorkspaceDirective` yeni adları bekliyordu → direktif reddediliyordu. Düzeltildi, `npm run build` sonrası Playwright geçti.

## Doğrulama Sonuçları

- `npx tsc --noEmit`: PASS (0 hata)
- `npx vitest run`: PASS (2140 test, 15 skip)
- `npm run build`: PASS
- `npx playwright test --config=playwright.stok-faz1.config.ts`: PASS (1/1, 14.2 sn)

### Playwright Kanıtları (son başarılı çalıştırma)
```
ACCEPTANCE_STOCK_SEEDED { stockId: 'cmsln2944...', quantity: 100 }
ACCEPTANCE_SCREENSHOT_LISTE
ACCEPTANCE_SCREENSHOT_DETAY
ACCEPTANCE_TRANSFER_DONE { sourceQty: '70', destQty: '30' }
ACCEPTANCE_SCREENSHOT_TRANSFER
ACCEPTANCE_ORDER_CREATED { orderId: 'cmsln2ix8...', orderNumber: 'SIP-0001' }
ACCEPTANCE_RESERVATION_DONE { reservedInventory: [{ stockId: '...', reserved: 10, ... }] }
ACCEPTANCE_RESERVED_QTY { reservedQuantity: '10' }
ACCEPTANCE_DELIVERY_DISPATCHED { deliveryId: 'cmsln2iza...' }
ACCEPTANCE_CONSUME_DONE { before: 70, after: 60, consumed: 10 }
ACCEPTANCE_CLEANUP_DONE
```

### Görsel Doğrulama (tüm ekran görüntüleri gözle kontrol edildi)
- `stok-faz1-liste.png`: "Test Urunu Stok" / "Depo A" / 100 — "[object Object]" yok
- `stok-faz1-detay.png`: Başlık "Test Urunu Stok", Warehouse Name "Depo A" — "[object Object]" yok
- `stok-faz1-transfer.png`: **2 satır** — Depo B: 30, Depo A: 70 — transfer yansıtıldı

### Görsel Doğrulama (ekran görüntüsü içeriği gözle kontrol edildi)
- `stok-faz1-liste.png`: PRODUCT SERVICE NAME → "Test Urunu Stok", WAREHOUSE NAME → "Depo A". "[object Object]" yok.
- `stok-faz1-detay.png`: Başlık "Test Urunu Stok", Product Service Name → "Test Urunu Stok", Warehouse Name → "Depo A". "[object Object]" yok.
- `stok-faz1-transfer.png`: PRODUCT SERVICE NAME → "Test Urunu Stok", WAREHOUSE NAME → "Depo A". "[object Object]" yok.

## Commit / Push Durumu

Commit yapılmadı. Push yapılmadı. Bağımsız doğrulama sonrası ayrı görev metniyle bildirilecek.

## Faz 2+'ya Bırakılanlar (Değiştirilmedi)

- Tam Warehouse lokasyon hiyerarşisi (Zone/Aisle/Shelf/Bin)
- §26 Stock Health, §27 Executive Signals — gerçek skorlama
- §25 Inventory Accuracy — ERP vs. sayım farkı
- §28 Conversation Integration — tahmin → sayım adayı → doğrulama
- §29 External Integration — ERP/WMS/RFID
- Production Domain üzerinden stok girişi
- Tedarikçi satın alma → mal kabul akışı
