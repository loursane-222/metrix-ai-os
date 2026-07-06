# METRIX Project Constitution v0.1

## Amaç

Bu belge projenin değişmeyecek ürün kararlarını içerir. Kod ve mimari bu ilkelere hizmet eder.

## Kilit Kararlar

- Metrix bir chatbot değildir.
- Önce çalışan ürün, sonra yeni özellik.
- Yeni katman ve büyük refactor ancak zorunluysa yapılır.
- Kullanıcıya görünen değer önceliklidir.
- Metrix cevap ezberlemez; muhakeme üretir.
- Promptlara kural yığmak yerine karakter güçlendirilir.
- Her faz sonunda: kullanıcı değeri, production etkisi ve sonraki en küçük adım değerlendirilir.

### Ürün Veri Modeli İlkeleri

#### Veri Modeli ile Kullanıcı Deneyimi Ayrıdır

METRIX'te bir bilginin sistemde bulunması, o bilginin her zaman kullanıcıya gösterileceği anlamına gelmez.
Ürün; kullanıcı deneyimini sade, hızlı ve yönetim odaklı tutarken, AI Genel Müdür sistem içerisinde bulunan tüm yetkili verilere erişmeye devam eder.
Her sayfa;
günlük yönetim için gerekli bilgileri önceliklendirir,
resmi süreçler için gerekli sistem alanlarını korur,
entegrasyonlardan gelen ek alanları destekler.
Ancak kullanıcıya yalnızca o anda ihtiyaç duyduğu bilgiler gösterilir.
AI Genel Müdür ise görünürlükten bağımsız olarak sistemde bulunan tüm yetkili verileri yönetim muhakemesinde kullanabilir.

#### Ortak Veri Modeli İlkesi

METRIX'in ortak veri modeli ürünün kurucu yapısının bir parçasıdır.
Bu model hiçbir ERP, muhasebe, CRM veya üçüncü taraf yazılımın veri modeline göre şekillendirilmez.
METRIX farklı sistemlerle entegre olduğunda, ilgili sistemlerde bulunan ek alanları tanıyabilir, saklayabilir, görüntüleyebilir ve yönetim muhakemesinde kullanabilir.
Bu entegrasyon alanları ürünün ortak veri modelini değiştirmez.
İlke:
METRIX, entegre olduğu sistemlerin veri modeline uyum sağlar; kendi yönetim modelini ise hiçbir entegrasyona göre değiştirmez.
Bu ilke ürünün tüm sayfaları için geçerlidir ve gelecekte geliştirilecek tüm özellikler bu yaklaşımı korumak zorundadır.

## Kurucu Mimari Uygunluk İlkesi

METRIX’te hiçbir teknik çözüm yalnızca çalıştığı için kabul edilmez.
Bir çözümün ürünün kalıcı parçası olabilmesi için aşağıdaki üç sorunun tamamına “Evet” cevabı vermesi zorunludur.
1. Bu çözüm METRIX Anayasaları ile tamamen uyumlu mu?
2. Bu çözüm gelecekte ürünün tamamına yayılabilecek ortak mimarinin bir parçası mı?
3. Bu çözüm sonradan sökülüp atılacak geçici bir yama değil, kurucu mimarinin kalıcı bir parçası mı?
Bu üç sorudan herhangi birine “Hayır” cevabı veriliyorsa çözüm tamamlanmış sayılmaz.
Bu durumda geliştirmenin amacı mevcut problemi geçici olarak çözmek değil, kurucu mimariye uygun doğru çözümü bulmaktır.
Bu ilke performans, hız veya geliştirme kolaylığı gerekçesiyle ihlal edilemez.
Her geliştirme fazının sonunda standart rapora aşağıdaki bölüm zorunlu olarak eklenecektir:

### Kurucu Mimari Kontrolü

1. METRIX Anayasalarına uygun mu?
2. Gelecekte tüm sisteme yayılabilir mi?
3. Kurucu mimarinin kalıcı parçası mı?
Üç sorunun tamamına “Evet” cevabı verilemiyorsa faz tamamlanmış kabul edilmeyecek ve Production’a alınmayacaktır.

## Çalışma Prensibi

Hiçbir kritik ürün kararı yalnızca sohbetlerde kalmaz; kurucu belgelere işlenir.

### Kurumsal Hafıza İlkesi

METRIX'te sistem içerisinde bulunan hiçbir kayıt; bir kullanıcıya, bir entegrasyona veya AI Genel Müdür'e ait değildir.
Tüm kayıtlar METRIX'in kurumsal hafızasının parçalarıdır.
Kullanıcılar, entegrasyonlar ve AI Genel Müdür aynı kurumsal kayıt üzerinde, kendi yetkileri doğrultusunda çalışırlar.
Bu nedenle;
manuel oluşturulan veriler,
entegrasyonlardan gelen veriler,
sistem tarafından oluşturulan veriler,
AI Genel Müdür tarafından üretilen veriler
aynı kurumsal kaydın farklı veri kaynaklarıdır.
METRIX bu kaynakları tek bir kurumsal hafızada birleştirir, veri bütünlüğünü korur ve yönetim muhakemesini bu ortak hafıza üzerinden oluşturur.
Hiçbir veri kaynağı ürünün tek sahibi değildir.
İlke:
Verinin sahibi kullanıcı, entegrasyon veya AI değildir. Verinin sahibi METRIX'in kurumsal hafızasıdır.
Bu ilke ürünün tüm sayfaları ve tüm iş akışları için geçerlidir.
Müşteriler, Ürünler, Teklifler, Tahsilatlar, Tedarikçiler, Belgeler, Muhasebe, Ekip ve gelecekte eklenecek tüm modüller aynı kurumsal hafızanın parçaları olarak çalışır.

### Bu yaklaşım sayesinde ürünün tamamında tek bir doğruluk kaynağı korunur, veri tekrarının önüne geçilir, entegrasyonlar sadeleşir ve AI Genel Müdür tüm kurumsal hafızayı tek bir bütün olarak değerlendirebilir.

Yönetim Sorgu İlkesi

METRIX'te bilgiye erişim yalnızca klasik filtreleme mantığına dayanmaz.
Ürün, iki farklı sorgulama yaklaşımını birlikte destekler.

#### Sistem Sorguları

Sistem sorguları; yapılandırılmış veriler üzerinde çalışan klasik filtreleme mekanizmasıdır.
Bu sorgular ürünün ortak veri modeli üzerinden çalışır ve tüm kullanıcılar için aynı davranışı gösterir.
Örneğin;
tarih,
bakiye,
şehir,
teklif sayısı,
tahsilat durumu,
ürün,
müşteri
gibi doğrudan sistemde bulunan alanlar bu kapsamda değerlendirilir.

#### AI Yönetim Sorguları

AI Yönetim Sorguları, kullanıcıların doğal dil ile ifade ettiği yönetim ihtiyaçlarını karşılamak için kullanılır.
Bu sorgular;
önceden tanımlanmış filtrelere,
sabit etiketlere,
hazır sınıflandırmalara
bağlı değildir.
AI Genel Müdür;
kurumsal hafızayı, sistem verilerini, entegrasyonlardan gelen bilgileri ve kendi yönetim muhakemesini birlikte değerlendirerek ilgili kayıtları belirler.
Bu nedenle aynı soru, şirketin mevcut durumu değiştikçe farklı sonuçlar üretebilir.
Bu davranış sistemin doğal çalışma biçimidir.
İlke:
METRIX, verileri değil yönetim ihtiyacını sorgular.
Kullanıcı filtre oluşturmak zorunda değildir.
İhtiyacını doğal dille ifade etmesi yeterlidir.
AI Genel Müdür, bu ihtiyacın hangi verilerle karşılanacağını kendi muhakemesiyle belirler.
Bu ilke ürünün tüm sayfaları ve gelecekte geliştirilecek tüm modüller için geçerlidir.
METRIX'te veri alanları öncelikle kullanıcı veri girişi için değil, kurumsal hafızanın doğru yapılandırılması için vardır. Kullanıcı bu alanları ister klasik formlarla, ister doğal dilde konuşarak, ister sesli komutlarla, ister belge, görsel veya entegrasyonlar aracılığıyla doldurabilir. Tüm giriş yöntemleri aynı kurumsal veri modelini besler.
