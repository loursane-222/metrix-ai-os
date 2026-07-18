# METRIX Design System Authority

`design-system/` repository'nin resmi görsel otoritesidir; buradaki SVG, PNG ve referans ekranlar ürünün tek görsel doğruluk kaynağıdır (Single Source of Truth).

`design-system/` yalnızca görsel dili bağlar: renk, geometri, materyal, component görünümü.

İş kuralları, veri modeli, ekran akışı ve form alanları gerçek ürün/API ihtiyaçlarına göre değişebilir.

Onaylı ekran mockup'ları alan veya akış yapısını zorunlu kılmaz.

Kod tasarıma (görsel dile) uyar; tasarım koda göre değiştirilmez. Ancak bu üstünlük yalnızca görsel katmanla sınırlıdır — mockup'ın ima ettiği veri modeli veya akış bağlayıcı değildir.

Onaylı SVG yeniden çizilmez, yaklaşık CSS ile üretilmez. Önce mevcut asset kullanılır, yoksa yeni asset üretilir.

# METRIX UI Component Reuse Authority

Design System yalnızca görsel dili tanımlar.

Reusable UI component'ler ise bu görsel dilin production implementasyonudur.

Bir component production seviyesinde oluşturulduktan sonra
aynı component başka bir ekranda yeniden yazılmaz.

Önce mevcut reusable component araştırılır.

Eğer ihtiyaç karşılanıyorsa mevcut component kullanılır.

Yetersizse component genişletilir.

Aynı görevi yapan ikinci bir component oluşturulmaz.

## Yeni ekran geliştirirken zorunlu sıra

1. Design System kontrol edilir.
2. Mevcut reusable component kontrol edilir.
3. Mevcut component kullanılabiliyorsa yeniden yazılmaz.
4. Yeni component yalnızca gerçekten yeni bir UI davranışı gerekiyorsa oluşturulur.

## Reusable component örnekleri

- ExecutiveDock
- ExecutiveOrb
- GlassCard
- MetricCard
- ExecutiveButton
- ExecutiveInput
- ExecutiveTextarea
- ExecutiveSelect
- ExecutiveSearch
- ExecutiveTabs
- ExecutiveChip
- ExecutiveAvatar
- ExecutiveSection
- SectionHeader
- EmptyState
- LoadingState
- ErrorState

## Kurallar

METRIX production sayfalarında hero kullanılmaz.

Hiçbir component isim değiştirilerek aynı işi yapan ikinci versiyona dönüştürülmez.

Örneğin CustomerInput, ModernInput, GlassInput, ExecutiveInputV2 gibi tekrarlar oluşturulmaz.

Tek production component korunur.

Bir component geliştirilecekse önce mevcut component genişletilmeye çalışılır.

Yeni component oluşturmak son seçenektir.

## İş bölümü

Design System görsel dili yönetir.

Reusable Component Library production kodunu yönetir.

İkisi birlikte METRIX'in resmi UI altyapısını oluşturur.
