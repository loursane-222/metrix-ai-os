# Tedarikçi Faz 1 — Kanonik Model

## Tamamlananlar

- Organization kapsamlı `Supplier` modeli ve `ACTIVE/PASSIVE/ARCHIVED` yaşam döngüsü eklendi.
- Kimlik, iletişim, vergi, adres ve not alanları; birincil iletişim, ürün/hizmet eşleşmesi, temel sözleşme ve custom-field ilişkileri eklendi.
- Performans, kalite, fiyatlama, teslimat ve risk alanları nullable JSON iskeleti olarak bırakıldı; faz 1'de hesaplanmış skor veya sahte varsayılan üretilmiyor.
- `supplier.service.ts` create/list/update/archive işlemlerini organization filtresiyle ve arşivleyerek silmeme kuralıyla sağlar.
- `/api/suppliers` ve kayıt detayı/archive uçları eklendi.
- Supplier action manifesti registry'ye eklendi.
- Living Workspace domain adapter, `supplier-list` ve `supplier-create` planner yüzeyleri ile `/metrix/suppliers` ekranı bağlandı.
- Supplier custom field değerleri mevcut field-authority tanım ve doğrulama mekanizmasını kullanır; yeni paralel field sistemi kurulmadı.

## Ertelenenler

Performans/risk analitiği, satın alma geçmişi hesaplama, sözleşme yaşam döngüsü ekranları ve doğal dil yürütme handler'ları sonraki faza bırakıldı. Bu faz yalnızca kanonik veri modelini ve güvenli temel çalışma alanı yüzeyini teslim eder.

Migration: `20260808210000_add_supplier_domain`.

## Faz 1 Tamamlama

- `shell.contract.test.ts` artık `suppliers` rotasını legacy unavailable listesinde tutmuyor ve `SupplierCanonicalScreen` bağını doğruluyor.
- Supplier client/resolution yardımcıları ve `tedarikçilerimizi göster`, `yeni tedarikçi ekle`, `X tedarikçisini aç` doğal dil yönlendirmeleri eklendi; extension registry’ye bağlandı.
- Doğrulama: `npx tsc --noEmit`, tam Vitest (`274 passed, 6 skipped; 2124 passed, 15 skipped`), text-quality guard ve organization-scoping guard başarılıdır.

İzole kabul ekranı kanıtları:

- [Tedarikçi listesi](../../qa-screenshots/tedarikci-faz1-liste.png)
- [Tedarikçi detayı](../../qa-screenshots/tedarikci-faz1-detay.png)
- [Yeni tedarikçi formu](../../qa-screenshots/tedarikci-faz1-yeni.png)

Ekran görüntüsü kanıtı yeniden denemesi başarılıdır: izole `ACCEPTANCE Supplier` organizasyonu ve kullanıcı/oturum/tedarikçi verisiyle root shell üzerinden Playwright kullanılarak üç gerçek PNG üretildi. İş sonunda organizasyon silindi ve `organization.findMany` kontrolü `remaining: 0` döndürdü.

## “Yeni Tedarikçi Ekle” Komutu Tanı Düzeltmesi

Tanı sırasında `customerManagementConversationExtension` ve `taskManagementConversationExtension` komutu sahiplenmedi; ikisi de `NOT_HANDLED` döndürdü. Supplier extension’ı aktif giriş noktası üzerinden doğru `SUPPLIER_CREATE_OPENED` handoff’unu üretiyordu. Sorun, konuşma/voice transkripsiyonlarında Türkçe diakritiklerin düşebilmesine rağmen create gate’inin yalnızca `tedarikçi` biçimini kabul etmesiydi.

`supplier-management-conversation-extension.ts` içindeki `CREATE_SUPPLIER_PATTERN` artık `tedarikçi` ve `tedarikci` biçimlerini, ayrıca “yeni bir” varyantını kabul ediyor. Yeni `supplier-active-entry.test.ts` gerçek `executeActiveConversationExtension` girişini doğruluyor; supplier yönetim testine diakritiksiz transkripsiyon senaryosu da eklendi.

`qa-screenshots/tedarikci-faz1-yeni.png` izole kabul oturumunda `yeni tedarikci ekle` komutuyla yeniden üretildi ve `Yeni Tedarikçi` çalışma alanı formunu gösteriyor. Kabul organizasyonu silindi; temizlik doğrulaması `remaining: 0`.
