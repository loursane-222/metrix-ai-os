import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Gizlilik Politikası | Metrix",
  description: "Metrix hizmetinde gizlilik ve veri güvenliği hakkında genel bilgilendirme.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#061018] px-5 py-8 text-[#f4f7f8]">
      <article className="mx-auto max-w-3xl rounded-[28px] border border-white/10 bg-white/[.045] p-6 shadow-2xl sm:p-8">
        <Link className="text-sm font-bold text-[#34e6cf] underline underline-offset-4" href="/">Metrix girişine dön</Link>
        <h1 className="mt-6 text-3xl font-extrabold">Gizlilik Politikası</h1>
        <p className="mt-4 text-sm leading-7 text-[#cfd7dc]">Bu sayfa, Metrix hizmetinde hesap, şirket çalışma alanı, kullanıcı tarafından paylaşılan iş verileri ve güvenlik kayıtlarının hizmeti sunmak, oturumu korumak ve sistemi iyileştirmek amacıyla işlenebileceğine ilişkin genel bilgilendirmedir.</p>
        <p className="mt-4 text-sm leading-7 text-[#cfd7dc]">Verilere erişim kuruluş ve kullanıcı yetkileriyle sınırlandırılır. Kullanıcılar kişisel verileri hakkında bilgi, düzeltme veya silme talebini hizmetin resmi iletişim kanalı üzerinden iletebilir.</p>
        <p className="mt-6 rounded-2xl border border-[#34e6cf]/15 bg-[#34e6cf]/[.04] p-4 text-sm leading-6 text-[#93a0ad]">Bu metin genel ürün bilgilendirmesidir; hukuki garanti veya özel bir hukuki görüş niteliği taşımaz.</p>
      </article>
    </main>
  );
}
