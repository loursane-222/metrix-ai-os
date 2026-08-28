# GÖREV METNİ — Erişim Sorununu Yeni Sır İstemeden Çöz (Son Kontrol)

**Kime:** Codex
**Fazın türü:** `METRIX_TASK_BRIEF_erisim-onarimi-ve-kalan-isler.md`'nin devamı.

**Önce bunu kontrol et — muhtemelen aynı, daha önce yaşanmış sorun:** Bu repoda daha önce (CI güvenlik ağı kurulurken) aynı sınıf bir sorun yaşanmıştı: GitHub'a yanlışlıkla `.env`'in eski `DATABASE_URL`/`DIRECT_URL`'i girilmişti, doğrusu daha güncel `.env.local`'daydı — Next.js `.env.local`'ı `.env`'in önüne alıyor. Yani sorun yeni bir sır/şifre gerektirmiyordu, yalnız hangi dosyanın "gerçek" olduğunu doğru tespit etmek gerekiyordu.

**Yapılacak (Murat'tan bir şey istemeden önce):**
1. Yerel `.env` ve `.env.local` dosyalarındaki `DATABASE_URL`/`DIRECT_URL` değerlerini karşılaştır. Hangisi daha güncel/doğru, hangisi Vercel production ortamında tanımlı olanla eşleşiyor kontrol et (`vercel env ls production`, ya da erişimin varsa Vercel dashboard).
2. Vercel production ortamındaki `DATABASE_URL`/`DIRECT_URL` değerlerinin yerel doğru değerle (adım 1) eşleşip eşleşmediğini doğrula. Eşleşmiyorsa, hangisinin doğru olduğunu (production DB'nin gerçekten çalıştığını gösteren bir kanıtla — örn. site şu an çalışıyor, demek ki Vercel'in kullandığı DB doğru; senin yerel ortamınki güncel olmayabilir) tespit edip yerel ortamını ona göre düzelt. **Bu senaryoda Murat'tan yeni bir sır istemene gerek kalmaz** — yalnız hangi değerin doğru olduğunu doğru tespit etmen yeterli.
3. Oturum (`metrix_session`/OTP) sorunu için: bu muhtemelen gerçekten süresi dolmuş bir login — yeni bir sır değil, yalnız yeniden giriş gerektiriyor. Eğer elindeki test/acceptance hesabıyla normal login akışını (OTP dahil) tekrar deneyip yeni bir geçerli oturum alabiliyorsan (otomatik OTP alma mekanizman zaten önceki "kabul testi" turlarında çalışmıştı, `METRIX_OPERATION_HANDOFF.md`'de kayıtlı), bunu dene — Murat'tan bir şey istemeden.

**Yalnız yukarıdakilerin hiçbiri işe yaramazsa (gerçekten dışarıdan bir şey değişmişse — örn. veritabanı sağlayıcısı şifreyi kendiliğinden döndürmüşse):** O zaman Murat'a tam olarak şunu söyle, başka bir şey değil: "Vercel projesinin Settings → Environment Variables bölümünde DATABASE_URL ve DIRECT_URL değerlerini [veritabanı sağlayıcısının adı]'ndan yeniden kopyalayıp Production ortamına yapıştırman gerekiyor." Sağlayıcının adını (Supabase/Neon/Railway/başka) kendin tespit et, Murat'ın bunu bilmesini bekleme.

**Login/oturum için tek gerçekten Murat'a düşebilecek iş:** Eğer otomatik OTP alma mekanizman artık çalışmıyorsa (örn. e-posta/SMS erişimin yoksa), Murat'tan yalnız şunu iste: "metrixgm.com'a kendi tarayıcında bir kez normal şekilde giriş yap" — başka hiçbir teknik bilgi istemeden.

## Erişim onarılırsa hemen ardından tamamla

`METRIX_TASK_BRIEF_beyin-stabilite-kapanis.md` Bölüm 1 ve 4: test kayıtlarını arşivle, deploy SHA doğrula, gerçek "kaç müşterimiz var → kim bu müşteriler → tamam ver" akışını dene ve üç gerçek cevabı raporla.

## Rapor Formatı

En üstte tek cümle: erişim kendi başına onarıldı mı (nasıl), yoksa Murat'tan gerçekten tek bir şey mi gerekiyor (tam olarak ne). Sonra Bölüm son'daki üç madde tamamlandıysa kanıtlarıyla.
