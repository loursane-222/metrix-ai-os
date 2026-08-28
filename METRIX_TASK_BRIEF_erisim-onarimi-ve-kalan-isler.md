# GÖREV METNİ — Kendi Production Erişimini Onar + Erişim Gerektirmeyen Kalan İşi Bitir

**Kime:** Codex
**Fazın türü:** `METRIX_TASK_BRIEF_beyin-stabilite-kapanis.md`'nin devamı. Aynı faz, kapanamayan kısım.

**Bağlam:** Son raporunda üç ayrı erişim hatası verdin: `metrixgm.com` API'sine `401 Session is invalid or expired`, Chrome penceresi açılamadı (`-1719`), doğrudan DB bağlantısı `P1000 password authentication failed`. Murat'a sordum, bu erişimin nasıl kurulduğunu bilmiyor — bu yüzden bunu **kendi başına** teşhis edip onarman gerekiyor, ondan bir şey istemeden. Yalnız gerçekten hiçbir şekilde kendi başına çözemeyeceğin bir nokta varsa (örn. hesap şifresi gibi yalnız Murat'ın bilebileceği bir sır), o zaman tek, çok net, tek satırlık bir talimat olarak söyle — "erişim sorunu var" gibi belirsiz bir şey değil, "X yapman/vermen gerekiyor" gibi kesin.

---

## 1. Kendi erişimini teşhis et ve onar

- Daha önceki oturumlarda (`METRIX_OPERATION_HANDOFF.md`'deki onlarca "production kabul testi" kaydı) bu erişim çalışıyordu — o zaman nasıl bir mekanizma kullanılmıştı (ortam değişkeni, saklanmış oturum token'ı, `.env` dosyasındaki bir test hesabı bilgisi, Chrome profili) bul. Muhtemelen bir süredir yenilenmediği için token/oturum süresi dolmuş.
- Eğer bir API oturum token'ı env değişkeninde/ayarlarda saklıysa ve süresi dolmuşsa, aynı mekanizmayla (varsa bir login/seed script'iyle) yenile.
- Eğer Chrome otomasyonu için bir profil/pencere sorunuysa (macOS AppleScript `-1719` hatası genelde hedef uygulamanın çalışmıyor/bulunamıyor olmasından kaynaklanır), Chrome'un doğru şekilde başlatıldığından emin ol, gerekirse farklı bir otomasyon yolunu dene.
- DB için: `P1000` şifre hatası, muhtemelen yanlış/eski bir `DATABASE_URL` kullanıldığını gösteriyor — bu repoda daha önce de tam bu sınıf bir sorun yaşanmıştı (`.env` vs `.env.local` farkı, bkz. proje geçmişi) — hangi env dosyasının güncel/doğru olduğunu kontrol et.
- Kendi başına çözemediğin, gerçekten yalnız Murat'ın verebileceği bir bilgiye ihtiyacın varsa (örn. bir şifre), bunu raporunda en üstte, tek cümlede, kesin olarak söyle.

## 2. Erişim beklenirken şimdi yapılabilecek işi bitir (kod işi, erişim gerektirmiyor)

Son taramanda ~123 kalan ASCII-Türkçe kullanıcı metni bulundu (`executive-reporting`, `executive-constitution`, `executive-narrative`, `executive-forecasting`, karar takip dosyaları). Bunun için production erişimi gerekmiyor — şimdi bitir:

- Bulduğun ~123 ihlalin tamamını düzelt.
- `scripts/check-user-facing-text.mjs`'deki `forbiddenTurkish` kontrolünü yalnız `TurkishCopyFiles` (6 dosya) listesine değil, `placeholder` kontrolü gibi **tüm** `allExecutiveFiles`'a uygula — böylece bu sınıf hata bir daha hiçbir dosyada fark edilmeden geçemez.
- `npx tsc`, `npm test`, `npm run build` (text guard dahil) geçmeli. Commit + push (git-tetiklemeli deploy).

## 3. Erişim düzelince tamamlanacaklar (sıraya koy, erişim onarılır onarılmaz yap)

1. Test müşteri/görev kayıtlarını `customer.archive` (ve ilgili diğer domain'ler) ile arşivle (`METRIX_TASK_BRIEF_veri-temizligi-ve-konusma-hatalari.md` Bölüm 1).
2. Deploy'un READY olduğunu ve doğru commit SHA'dan geldiğini doğrula.
3. Gerçek hesapla "kaç müşterimiz var?" → "kim bu müşteriler?" → "tamam ver" üçlüsünü dene, üç gerçek cevabı raporuna yapıştır.

## 4. Rapor Formatı

En üstte: erişim onarıldı mı, onarılmadıysa Murat'tan tam olarak ne gerekiyor (tek net cümle). Sonra Bölüm 2'nin tam kanıtı (kaç ihlal düzeltildi, guard artık kaç dosyayı Türkçe için de tarıyor). Erişim onarıldıysa Bölüm 3'ün de tam kanıtı.
