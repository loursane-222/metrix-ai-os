# METRIX Executive Face

Bu belge, METRIX Executive Face için kanonik ürün ve hareket sınırıdır. Yanındaki `metrix-executive-face-reference.png` yalnız görsel referanstır; production runtime asset'i değildir.

## Form

- Yalnız yüz ve kafa formu kullanılır.
- Boyun yoktur.
- Omuz yoktur.
- Göğüs yoktur.
- Form ilk bakışta insan yüzü olarak okunur.
- Belirli bir kişi, yaş veya cinsiyet taşımaz.
- Göz, ağız ve mimik belirgin değildir.

## Görsel dil

- Beyaz ve kontrollü turkuaz parçacıklar kullanılır.
- Duygu mimikle değil, parçacık davranışıyla gösterilir.
- Tasarım mobile-first uygulanır.
- Cyberpunk, oyun estetiği ve aşırı neon görünümü yasaktır.
- Yüz hiçbir durumda tamamen kaybolmaz.

## Canonical durumlar

- `Idle`: sakin, dengeli ve düşük genlikli hareket.
- `Listening`: parçacıkların merkeze odaklandığı kontrollü nefes/pulse.
- `Thinking`: bağlantı kurma hissi veren asimetrik, ölçülü hareket.
- `Speaking`: akıcı ve ritmik parçacık dalgası.
- `Working`: yönlü fakat yüz formunu koruyan hareket.
- Mevcut canonical runtime hata veya dikkat durumu ürettiğinde aynı yüz formu kontrollü uyarı rengiyle korunur.

## Runtime ilkeleri

- Statik raster görüntüyü büyütüp küçültmek nihai runtime kabul edilmez.
- Gerçek zamanlı parçacık animasyonu hedeflenir.
- Runtime, mevcut Executive Presence Runtime durumlarını tüketir; paralel presence state'i oluşturmaz.
- `prefers-reduced-motion` için animasyonsuz, erişilebilir statik fallback sunulur.
- Ana runtime çözümü ayrı video veya beş büyük WebP dosyasına dayanmaz.
