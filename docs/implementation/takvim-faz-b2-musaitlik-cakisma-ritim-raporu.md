# Takvim Faz B2 — Müsaitlik, Çakışma ve Ritim Raporu

## Uygulanan gerçekler

- Etkinlik oluşturma formu aktif organizasyon üyelerini çoklu katılımcı olarak kaydeder.
- `CalendarEvent.blockType` nullable bir kullanıcı sınıflandırmasıdır. Mevcut ve sınıflandırılmamış olaylar `null` kalır; sistem tür uydurmaz.
- Çakışma, aynı üye veya müşteri katılımcının `CANCELLED` olmayan ve açık aralıkta kesişen gerçek olaylarından hesaplanır. Bitişik sınırlar çakışma değildir.
- Oluşturma ve sürükleyerek yeniden planlama çakışmalarında kullanıcıya açık uyarı ve bilinçli devam onayı sunulur.
- Müsaitlik, sorgu anını kapsayan gerçek olayın blok türünden; tür yoksa “Meşgul”, olay yoksa “Müsait” olarak hesaplanır.
- Günlük kapasite, güne taşan olayları gün sınırında kırparak gerçek süreleri toplar. Yüzde, UI'da açıkça belirtilen **480 dakikalık varsayılan çalışma kapasitesine göre** hesaplanır.
- Yönetici ritmi son sekiz haftadaki gerçek olaylarda aynı hafta günü, saat, normalize başlık ve blok türünün en az üç tekrarına dayanır. Üçün altında UI sessiz kalır.
- `[X] şu an müsait mi?` komutu kanonik sohbet girişinden organizasyon üyesini çözüp gerçek müsaitlik API sonucunu okur; mutasyon yapmaz.

## Bu fazda bilerek yok

- Toplantı–Belge zinciri yoktur; Document domain'i henüz kanonik değildir.
- Kişiye özel çalışma saati veya kapasite ayarı yoktur; yalnızca açıkça etiketlenen 480 dakika varsayımı vardır.
- Seyahat ve hazırlık süresi otomatik hesaplanmaz; gerekli konum ve mesafe verisi yoktur.

## Kanıt ve doğrulama

- Birim testleri çakışma katılımcısı/iptal/sınır kurallarını, üç müsaitlik sonucunu, kapasite toplamını ve ritim örneklem kapısını kapsar.
- İzole Playwright kabul testi iki gerçek çakışan olayı uyarı ve onay üzerinden kaydeder, DB'de ikisini doğrular, doğal dil sorgusunu gerçek sohbet girişinden çalıştırır ve uyarı ile müsaitlik rozetini aynı ekran görüntüsünde kanıtlar.
- Kanıt: `qa-screenshots/takvim-faz-b2-cakisma-musaitlik.png`.
