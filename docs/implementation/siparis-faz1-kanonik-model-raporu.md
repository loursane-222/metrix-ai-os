# Sipariş Domain Faz 1 — Kanonik Model Uygulama Raporu

**Tarih:** 2026-08-08 (ekran kanıtları 2026-08-09 yenilendi)  
**Faz:** 1 / N (Kanonik model + yaşam döngüsü + temel ilişkiler)

---

## Kök gereksinim

Sipariş (Order) domain'i §9-§17 (kanonik model + lifecycle) kapsamında inşa edildi. §19-60 (Execution/Priority/Fulfillment/Capacity/Reservation/Delivery Commitment/vb.) Faz 2+'ya bırakıldı — bunlar Production/Stock/İrsaliye domain'leri canonical olmadan hesaplama üretemez.

---

## Değiştirilen / Oluşturulan Dosyalar

### Prisma Schema
- `prisma/schema.prisma` — `OrderStatus` enum (11 durum), `Order`, `OrderItem`, `OrderStatusHistory`, `OrderCustomFieldValue` modelleri eklendi. Back-reference'lar: `Organization`, `Customer`, `Quote`, `ProductService`, `CustomFieldDefinition` modellerine back-relation alanları eklendi. Additive-only — mevcut hiçbir alana dokunulmadı.
- Migration: `prisma/migrations/20260808220000_add_order_domain/` — gerçek migration dosyası olarak uygulandı (`db push` değil). `npx prisma generate` ile istemci güncellendi.

### Servis Katmanı
- `src/lib/core/orders/order.types.ts` — tip tanımları
- `src/lib/core/orders/order.repository.ts` — DB erişim katmanı (organizationId filtresi her sorguda)
- `src/lib/core/orders/order.service.ts` — `createNewOrder`, `createOrderFromQuote`, `listOrders`, `getOrderByIdForOrganization`, `transitionOrderStatus`, `cancelOrder`. `ALLOWED_TRANSITIONS` §17'nin izin grafiğini kodlar; her geçiş `OrderStatusHistory` kaydı oluşturur (transaction içinde).
- `src/lib/core/orders/order.serializer.ts` — BigInt alanları (`unitPriceCents`, `lineTotalCents`, `balanceCents`, `costCents`, `priceCents`) JSON serileştirmeden önce `toString()` ile string'e dönüştürülür. `JSON.stringify(BigInt)` hatası bu katmanla engellendi.

### Action Runtime
- `src/lib/action-runtime/registry/manifests/orders.actions.ts` — `order.create`, `order.transitionStatus`, `order.cancel`
- `src/lib/action-runtime/registry/index.ts` — `orderActionDefinitions` kaydedildi

### Living Workspace
- `src/lib/living-workspace/contracts.ts` — `WORKSPACE_DOMAINS` ve `businessSurface` tipine `order`/`order-list`/`order-create` eklendi; `DOMAIN_RULES` ve doğrulama fonksiyonları güncellendi
- `src/lib/living-workspace/domain-adapters.ts` — `order` adapter'ı eklendi
- `src/lib/living-workspace/planner.ts` — `order` config ve `createOrderWorkspaceDirective` eklendi

### UI
- `src/components/living-workspace/OrderCanonicalScreen.tsx` — SupplierCanonicalScreen deseni
- `src/components/living-workspace/OrderCreateScreen.tsx` — form bileşeni
- `src/components/living-workspace/BusinessSurfaceResolver.tsx` — `order-list` CANONICAL_SURFACES'a, `order-create` branchi eklendi
- `src/app/metrix/orders/page.tsx`
- `src/app/metrix/orders/new/page.tsx`

### API
- `src/app/api/orders/route.ts` — GET (list), POST (create)
- `src/app/api/orders/[orderId]/route.ts` — GET (detail), PATCH (transition/cancel)
- `src/app/api/orders/from-quote/route.ts` — POST (quote→order dönüşümü)

### Client + Resolution
- `src/lib/orders/orders-client.ts`
- `src/lib/orders/order-resolution.ts`

### Conversation Extension
- `src/lib/conversation-extensions/order-management-conversation-extension.ts` — "siparişlerimizi göster", "sipariş oluştur", "X teklifini siparişe çevir/dönüştür", "X siparişini aç". Tüm regex'lerde diakritik toleransı baştan eklendi.
- `src/lib/conversation-extensions/active-conversation-extension.ts` — `orderManagementConversationExtension` diziye eklendi
- `src/lib/conversation-extensions/conversation-extension-handoff.ts` — `CONVERSATION_EXTENSION_DOMAINS`'e `"orders"`, `orderHandoff` fonksiyonu eklendi

### Testler
- `src/lib/conversation-extensions/__tests__/all-domains-active-entry.test.ts` — `["order", "orders", "siparişlerimizi göster"]` satırı eklendi (mevcut dosya genişletildi)
- `src/lib/core/orders/__tests__/order.contract.test.ts` — schema bütünlüğü, lifecycle, workspace directive testleri

---

## Doğrulama

```
npx tsc --noEmit           → 0 hata
npx vitest run             → 277 dosya, 2138 test, 0 başarısız
npm run build              → başarılı
check-organization-scoping → 58 scoped model, 220 guarded çağrı, 0 ihlal
check-user-facing-text     → 293 dosya, 0 ihlal
```

### npm run build son satırları
```
├ ○ /metrix/orders                                     568 B         309 kB
├ ○ /metrix/orders/new                                 568 B         309 kB
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

---

## Ekran Kanıtları (2026-08-09 yenilendi)

Playwright acceptance testi (`e2e/siparis-faz1-kanit.acceptance.e2e.ts`) izole `SIPARIS ACCEPTANCE {suffix}` organizasyonu ile çalıştırıldı. Test süresi: ~14 sn, 1/1 geçti.

**Kök neden (önceki geçersiz ekranlar):** Production build, `ExecutiveNavigationCommandHost.tsx` ve `active-conversation-extension.ts`'deki order domain eklemelerini içermiyordu. Rebuild sonrası düzeldi.

| Dosya | İçerik |
|---|---|
| `qa-screenshots/siparis-faz1-liste.png` | "siparişlerimizi göster" komutu → workspace paneli "Siparişler", SIP-0001 listede görünür |
| `qa-screenshots/siparis-faz1-detay.png` | SIP-0001 satırına tıklanınca açılan detay görünümü — tüm alanlar (orderNumber, status, priority, currency, createdAt) |
| `qa-screenshots/siparis-faz1-yeni.png` | "Atlas teklifini siparişe çevir" komutu sonrası → SIP-0001 + SIP-0002, Toplam kayıt: 2 |

---

## Faz 2+'ya Bırakılanlar (alan iskeleti var, hesaplama yok)

- `reservedInventory` — Stock domain canonical olmadığından hesaplama yok
- `productionRequirement` — Production domain (#07) canonical olmadığından hesaplama yok
- `deliverySchedule` — İrsaliye domain (#11) canonical olmadığından entegrasyon yok
- `executiveAssessment`, `riskSignals`, `executiveSummary` — Faz 2+'da doldurulacak
- §19-60 tüm motorlar (Execution/Priority/Fulfillment/Capacity/Reservation/Delivery Commitment/Revision/Exception/Scheduling/vb.)

---

## Commit/Push Durumu

Commit/push bu raporda yapılmayacak — Cowork bağımsız doğruladıktan sonra ayrıca haber verecek.
