import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni | Metrix",
  description: "Metrix KVKK Aydınlatma Metni taslağı.",
};

const sections = [
  {
    title: "Amaç",
    body: "Bu taslak metin, Metrix AI OS kapsamında kişisel verilerin hangi amaçlarla işlenebileceğini sade bir dille açıklamak için hazırlanmıştır.",
  },
  {
    title: "İşlenen veri kategorileri",
    body: "Telefon numarası, oturum bilgileri, hesap ve şirket profili bilgileri, kullanıcı tarafından girilen iş verileri ve hizmet kullanımı sırasında oluşan işlem kayıtları işlenebilir.",
  },
  {
    title: "İşleme amaçları",
    body: "Kimlik doğrulama, hesabın güvenli şekilde işletilmesi, şirket çalışma alanının oluşturulması, hizmet kalitesinin iyileştirilmesi ve yasal yükümlülüklerin yerine getirilmesi amaçlanır.",
  },
  {
    title: "Saklama ve güvenlik",
    body: "Veriler, hizmetin gerektirdiği süre boyunca saklanır. Yetkisiz erişimi azaltmak için teknik ve idari güvenlik önlemleri uygulanması hedeflenir.",
  },
  {
    title: "Kullanıcının hakları",
    body: "Kullanıcılar, ilgili mevzuat kapsamında verilerine erişme, düzeltme, silme, işleme itiraz etme ve bilgi talep etme haklarına sahip olabilir.",
  },
  {
    title: "İletişim",
    body: "KVKK ve veri işleme süreçleriyle ilgili talepler için yayın öncesinde resmi iletişim kanalı tanımlanmalıdır.",
  },
  {
    title: "Hukuki onay notu",
    body: "Bu sayfa taslak metindir; yayın öncesi hukuk danışmanı tarafından incelenmeli ve onaylanmalıdır.",
  },
];

export default function KvkkPage() {
  return <LegalPage title="KVKK Aydınlatma Metni" sections={sections} />;
}

function LegalPage({
  sections,
  title,
}: {
  sections: Array<{ title: string; body: string }>;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-[#f6efe3] px-5 py-8 text-[#14213d]">
      <article className="mx-auto max-w-3xl rounded-[28px] border border-white/80 bg-[#fffaf2]/95 p-6 shadow-[0_24px_70px_rgba(74,52,32,0.12)] sm:p-8">
        <Link
          className="text-sm font-bold text-[#6f4a28] underline decoration-[#c8a47b] underline-offset-4"
          href="/"
        >
          Metrix girişine dön
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-normal">
          {title}
        </h1>
        <p className="mt-3 rounded-2xl border border-[#ead8c0] bg-[#fffdf9] p-4 text-sm font-semibold leading-6 text-[#665f55]">
          Taslak metindir, yayın öncesi hukuk danışmanı tarafından
          onaylanmalıdır.
        </p>
        <div className="mt-8 space-y-6">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-extrabold tracking-normal">
                {section.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#665f55]">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
