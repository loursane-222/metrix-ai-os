# METRIX Constitution Repository

Bu klasör METRIX AI OS kurucu belgelerinin resmi depo alanıdır.

## Klasörler

- `METRIX FOUNDATION/`: Orijinal kurucu belgeler, Word/Pages dosyaları, marka varlıkları ve arşiv materyalleri burada saklanır. Bu klasör arşiv kabul edilir ve doğrudan düzenlenmez.
- `source/`: Yaşayan anayasa kaynakları burada tutulur. Geliştirme fazlarında esas alınacak belgeler bu klasördedir.
- `exports/`: `source/` içeriğinden üretilecek PDF, DOCX veya paylaşım çıktıları burada tutulur.

## Kaynak İlkesi

Bu klasör, METRIX AI OS'in kurucu mimarisinin bir parçasıdır.

Burada bulunan belgeler yalnızca dokümantasyon değildir; METRIX'in davranışını, mimarisini, geliştirme felsefesini ve ürün yönünü belirleyen resmi kurucu kaynaklardır.

Kod, mimari ve tüm geliştirme kararları bu belgelere uygun olmak zorundadır.

METRIX'te kurucu belgeler kod tabanının parçasıdır.

Geliştirme başlamadan önce ilgili anayasa kaynakları okunmadan kod yazılamaz.

Bir teknik çözüm yalnızca çalıştığı için kabul edilemez. Her faz sonunda Kurucu Mimari Kontrolü yapılır:

1. METRIX Anayasalarına uygun mu?
2. Gelecekte tüm sisteme yayılabilir mi?
3. Kurucu mimarinin kalıcı parçası mı?

Bu üç soruya net "Evet" cevabı verilemiyorsa faz tamamlanmış kabul edilmez.

## Değişiklik Disiplini

Anayasa değişiklikleri kod değişikliklerinden ayrı commitlenir.

METRIX FOUNDATION klasörü arşiv niteliğindedir.

Bu klasörde bulunan Word, Pages, PDF ve diğer orijinal belgeler doğrudan düzenlenmez.

Yeni veya güncellenen anayasa içerikleri yalnızca source klasöründe geliştirilir.

exports klasörü source içeriğinden üretilecek paylaşım çıktıları içindir ve kaynak kabul edilmez.
