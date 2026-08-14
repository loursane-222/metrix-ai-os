# METRIX Büyük Resim — Ürün Vizyonu v1

**Durum:** Canonical. Murat'ın kendi tanımı, birebir bu belgeye işlendi (2026-08-07).
**İlişkili anayasalar:** `metrix-proje-anayasasi.md`, `metrix-sohbet-anayasasi.md`, `metrix-liderlik-dnasi.md`, `executive-cognitive-stack-v1.md`, `METRIX FOUNDATION/` altındaki domain anayasaları, görsel dil ve etkileşim anayasaları (`METRIX_Etkileşim.docx` ve ilgili Foundation belgeleri).

**Bu belgenin görevi:** Her faz/görev metni bu vizyona göre değerlendirilir — bir çözüm bu büyük resme hizmet etmiyorsa, ne kadar iyi çalışırsa çalışsın, kurucu mimarinin kalıcı parçası sayılmaz (bkz. proje anayasası "Kurucu Mimari Uygunluk İlkesi").

---

## Özet (tek cümle)

Tüm yönleriyle yaşayan bir Metrix: kullanıcının klavye veya mouse kullanmasına gerek kalmadan, yalnızca Metrix'le konuşarak — sesli, yazılı veya görsel/dosya yükleyerek — şirketiyle ilgili her şeyi halledebildiği bir sistem.

---

## 1. Karakter

Metrix, kendini sürekli eğiten, gelişen, öğrenen; tüm sektörleri bilen ve her sektörde 25 yıl ve üzeri tecrübeye sahip; şirketle ve kullanıcıyla birlikte yaşayan bir genel müdürdür. Karakterin tam tarifi `metrix-liderlik-dnasi.md`'de (Leadership DNA v1.2, CANONICAL) kilitlidir — bu belge o tarifi tekrar etmez, yalnızca referans verir.

## 2. İletişim Kanalları

Kullanıcı Metrix'le üç eşdeğer yoldan iletişim kurar:

- **Sesli sohbet**
- **Yazılı sohbet**
- **Görsel ve dosya yükleme**

### 2.1 Sesli Sohbet — Hedef Tanım

Yüz yüze veya telefonla konuşur gibi, **gerçek zamanlı, kesintiye açık (barge-in), karşılıklı, canlı** bir konuşma. Referans deneyim: Gemini Live — konuşma tonlaması, duygu vermesi ve hız açısından. Bu, sıradaki en yüksek öncelikli sesli deneyim hedefidir; mevcut turn-tabanlı (soru→cevap→TTS) sesli akış bu hedefin bir ön aşaması, nihai hali değil.

### 2.2 Görsel ve Dosya Yükleme — Öncelikli Kullanım Senaryoları

Hepsi eşit öncelikli, dördü de hedefte:

1. Fatura/fiş fotoğrafı okutup otomatik kayıt oluşturma.
2. Vergi levhası yükleyip "yeni müşteri kaydı oluştur" deme.
3. Genel doküman/görsel paylaşımı (yukarıdaki iki dar senaryoyla sınırlı değil).
4. Bitmiş bir işin fotoğrafını çekip bildirim olarak yöneticiye gönderme.

Bu üç kanal birbirinin yerini tutabilir; hiçbiri diğerine göre ikincil değildir. Bu, proje anayasasının "tüm giriş yöntemleri aynı kurumsal veri modelini besler" ilkesiyle (§ Yönetim Sorgu İlkesi) doğrudan uyumludur — form/klavye yalnızca bir giriş yolu, tek yol değildir.

**İlke:** Kullanıcının bir işi yapmak için klavye veya mouse'a ihtiyaç duyması, o işin Metrix'te eksik tasarlandığının işaretidir.

## 3. Kapsam

CRM, ERP ve muhasebe programlarında yapılabilen her şeyin tek çatı altında toplandığı bir sistem. Bu, proje anayasasının "Ortak Veri Modeli İlkesi"nde zaten kilitli — METRIX hiçbir üçüncü taraf yazılımın veri modeline göre şekillenmez, kendi ortak modelini korur.

## 4. Yetki

Metrix bu sistemin her hücresini yönetme, izleme, okuma ve kanaat üretme tam yetkisiyle yaşar. Bu yetkinin sınırı zaten `metrix-liderlik-dnasi.md` §1.3'te çözülmüştür: Metrix yön verir, gerektiğinde zorlar — ama son karar her zaman şirket sahibinde kalır. Bu vizyon belgesi o dengeyi değiştirmez, üstüne inşa eder.

Bu tam yetkinin motor tarafı (sürekli, konuşmadan bağımsız zihin durumu — dikkat, kanaat, momentum) `executive-cognitive-stack-v1.md`'de fazlara bölünmüş olarak inşa ediliyor.

---

## 5. Alt Katman — Genel Bakış Workspace Deseni (liste tipi domainler)

Tüm liste tipi domainler (müşteriler, stoklar, teklifler, tahsilatlar, vb.) **aynı yapıyı** paylaşır:

- **Üst bölüm:** dinamik KPI'lar (o domain'e özel özet göstergeler)
- **Alt bölüm:** kendi içinde scroll olan, kompakt satırlar (kart yığını değil)

Bu desen tek bir domain'e özel değildir — genel bir kalıptır. Her yeni domain bu deseni miras alır, kendi başına yeniden icat etmez. (Bu ilke, `METRIX_TASK_BRIEF_canli-arayuz-ve-karakter.md`'deki müşteri listesi satır tasarımı işini genelleştiriyor — o görev artık yalnızca müşteri listesi değil, bu genel desenin ilk uygulaması olarak ele alınmalı.)

## 6. Alt Katman — Rapor Surface Deseni

Raporlar benzer dinamik yapıyı paylaşır, ama rapor tadında: gerekirse grafik görseller, KPI'lar, hedef-gerçekleşen karşılaştırmaları.

## 7. Kapsam Dışı (bu belgeden)

Estetik-işlevsel detaylar (renk, tipografi, geçiş animasyonları, mikro-etkileşimler, kart çerçeve ölçüleri vb.) bu belgede tanımlanmaz. Bunlar domain anayasalarında, görsel dil anayasasında ve etkileşim anayasasında (`METRIX_Etkileşim.docx` ve `METRIX FOUNDATION/` altındaki ilgili belgeler) tanımlıdır. Bu belge yalnızca büyük resmi kilitler; detay seviyesinde çelişki varsa domain/görsel/etkileşim anayasaları esas alınır, bu belge yalnızca yön kontrolü için kullanılır.

---

## Kurucu Mimari Kontrolü

1. METRIX Anayasalarına uygun mu? **Evet** — mevcut proje/sohbet/liderlik/cognitive-stack anayasalarının hiçbirini değiştirmiyor, onları tek bir üst-özet altında birleştiriyor.
2. Gelecekte tüm sisteme yayılabilir mi? **Evet** — genel bakış workspace deseni ve rapor surface deseni, tanım gereği tüm domainlere yayılacak şekilde yazıldı.
3. Kurucu mimarinin kalıcı parçası mı? **Evet** — geçici bir yama değil, tüm gelecek fazların ölçüleceği referans noktası.
