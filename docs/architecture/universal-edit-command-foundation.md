# Evrensel Alan Düzenleme Temeli

Müşteri ve teklif düzenleme yüzeyleri artık aynı altyapıyı kullanır. `DomainFieldRegistry` düzenlenebilir alanların yetki ve veri sözleşmesini, `resolveEditCommand` model çıktısının ortak ayrıştırma akışını, `createEditSurfaceCommandChannel` ise monte edilmiş bir yüzeye güvenli komut aktarımını tek yerde tanımlar. Domain dosyaları kendi komut şeması ve prompt farklarını koruyan ince uyarlayıcılardır; mevcut API yolları değişmemiştir.

## Yeni domain kontrol listesi

- Alanları `ModuleFieldDefinition` olarak; anahtar, etiket, değer tipi, hassasiyet, yazılabilirlik, doğrulama, normalizasyon ve alias bilgileriyle tanımla.
- Alan listesini `createDomainFieldRegistry({ domain, entityType, fields })` ile doğrulanmış bir registry'ye dönüştür.
- Domain komut sözleşmesini allowlist yaklaşımıyla tanımla ve güvenilmeyen model çıktısı için katı bir validator yaz.
- Domain prompt kurucusunu registry'deki yazılabilir alanlardan üret; domain'e özgü eylemleri yalnızca bu katmanda tut.
- Sunucu uyarlayıcısında `resolveEditCommand` çağır; domain, registry, aktif sekme, prompt kurucu ve validator'ı geçir.
- Mevcut domain API route'unu koru ve onu ince resolver uyarlayıcısına bağla.
- İstemci kanalını `createEditSurfaceCommandChannel` ile oluştur; domain runtime'ının `getState().activeTab` ve komut uygulayıcısını geçir.
- Düzenleme yüzeyi monte olurken kanala kaydol, ayrılırken aynı token ile kaydı kaldır; stale token sonucunu domain sözleşmesine eşle.
- Resolver/validator, channel yaşam döngüsü ve gerçek düzenleme yüzeyindeki en az bir alan komutu için regresyon testi ekle.
