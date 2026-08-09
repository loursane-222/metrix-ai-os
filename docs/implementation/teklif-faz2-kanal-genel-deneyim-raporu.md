# Teklif Faz 2 — Kanal ve Genel Deneyim Uygulama Raporu

## Sonuç

Teklifler artık her paylaşımda yenilenen güvenli bir bağlantıyla WhatsApp'a hazırlanabiliyor. Müşteri bağlantıyı oturum açmadan açabiliyor; görüntüleme teklif zaman çizelgesine yazılıyor, `SENT` teklif `VIEWED` durumuna geçiyor ve şirket içi bildirim oluşuyor.

## Uygulanan kapsam

- `Quote` modeline nullable ve geriye uyumlu `publicTokenHash` / `publicTokenCreatedAt` alanları ile unique indeks eklendi.
- Her paylaşımda 32 baytlık kriptografik token üretiliyor, eski token geçersiz kılınıyor ve veritabanına yalnızca SHA-256 özeti yazılıyor.
- `/teklif/[token]` ve salt-okunur `/api/public/offers/[token]` oturumsuz çalışıyor. Public seçim listesi yalnızca müşteriyle paylaşılabilir alanları içeriyor; iç `notes` ve `metadata` seçilmiyor.
- Geçersiz token, teklif varlığı veya sebep ayrımı sızdırmadan bütün durumlarda aynı genel 404 cevabını alıyor.
- İstemci `useEffect` ile `/api/public/offers/[token]/view` adresine POST ediyor. Her yükleme `QUOTE_VIEWED` olayı ekliyor, `viewedAt` zamanını yeniliyor ve yalnızca `SENT → VIEWED` geçişini yapıyor.
- Bildirim alıcısı için yeni bir dağıtım varsayımı üretilmedi. Teklif iş akışının kullandığı mevcut `notifyWithOwnerFanout` deseni kopyalandı; aktif `OWNER` / `EXECUTIVE` alıcılarına `quote.viewed` bildirimi fan-out ediliyor.
- Teklif konuşma eklentisi `“[müşteri] teklifini whatsapp'tan gönder”` ve `“[müşteri] teklifini gönder”` komutlarını mevcut müşteri/teklif çözümleme akışıyla ele alıyor. Türkiye cep telefonlarını uluslararası (`90…`), başında sıfır bulunan yerel (`05…`) ve sıfırsız yerel (`5…`) biçimlerden aynı `905…` WhatsApp numarasına dönüştürüyor. Tanınmayan veya eksik formatta link üretmeyip mevcut telefon netleştirme akışına düşüyor. Geçerli numarada kuruluş, teklif, tutar ve public bağlantıyı içeren kodlanmış `wa.me` adresini `_blank` sekmesinde açıyor; son gönderme eylemi kullanıcıya ait.

## Güvenlik kararları

- Ham token kalıcı hiçbir alana, loga veya metadata'ya yazılmıyor.
- Yeniden paylaşım önceki bağlantıyı geçersiz kılıyor; hash'ten ham token geri üretme girişimi yok.
- Public sorgunun organizasyon oturumu bulunmaması kasıtlıdır. Benzersiz ve tahmin edilemez token hash'i capability sınırıdır; bu tek doğrudan sorgu organization-scoping guard'a gerekçeli, dar bir istisna olarak kaydedildi.
- Public API ve sayfa auth helper kullanmıyor; güvenlik token eşleşmesi ve açık izinli alan seçimiyle sağlanıyor.
- Rate limiting / bot koruması görev kapsamına uygun olarak bu fazda yapılmadı.

## Faz 2 düzeltmesi

- Acceptance testine özel build dizini yaklaşımı kaldırıldı. `next.config.ts` ve `tsconfig.json` proje öncesi yapılandırmasına döndürüldü; Playwright yapılandırması diğer acceptance testleri gibi mevcut `.next` üretim derlemesini yalnızca `npm run start` ile kullanıyor.
- WhatsApp telefon normalizasyonu üç yaygın Türkiye cep telefonu giriş biçimini destekleyecek ve diğer biçimlerde güvenli biçimde netleştirme isteyecek şekilde sıkılaştırıldı.

## Doğrulama ve kanıt

- TypeScript, dokunulan dosya lint'i, metin kalitesi ve organization-scoping guard'ları geçti.
- Birim testleri `+90 532-111-22-33`, `0532 111 22 33` ve `532 111 22 33` girdilerinin tamamının `905321112233` sonucuna ulaştığını; tanınmayan biçimin ise link açmadığını doğruluyor.
- İzole Playwright kabul testi şunları doğruluyor: cookiesiz public erişim, doğru teklif içeriği, görüntülenme durumu/olayı/bildirimi, geçersiz token için 404, gerçek popup üzerinden telefon ve mesaj içeren `wa.me` URL'i ve test organizasyonunun temizlenmesi.
- Ekran kanıtları: `qa-screenshots/teklif-faz2-genel-sayfa.png` ve `qa-screenshots/teklif-faz2-goruntulenme-bildirimi.png`.

Faz 3 onay/karşı teklif/ret aksiyonları, Faz 4 teklif zekâsı ve gerçek WhatsApp Business API entegrasyonu eklenmedi.
