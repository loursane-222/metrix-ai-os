"use client";

type Movement = {
  id: string;
  sourceType: "INVOICE" | "PAYMENT";
  date: string;
  title: string;
  status: string;
  amountCents: string;
  balanceDeltaCents: string;
  runningBalanceCents: string;
  currency: string;
};
type Statement = {
  organizationName: string;
  customerName: string;
  generatedAt: string;
  statement: {
    movements: readonly Movement[];
    balances: readonly { currency: string; balanceCents: string }[];
    dataQualityNote: string | null;
  };
};

const money = (cents: string, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(Number(cents) / 100);
const MOVEMENT_LABEL: Record<Movement["sourceType"], string> = { INVOICE: "Fatura", PAYMENT: "Tahsilat" };

export function PublicStatementView({ statement }: { statement: Statement }) {
  const { organizationName, customerName, generatedAt, statement: data } = statement;
  return (
    <main className="min-h-screen bg-[#0d0c0a] px-5 py-10 text-[#ede7d9]">
      <article className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-[#342e25] bg-[#171410] shadow-2xl">
        <header className="border-b border-[#342e25] px-8 py-9 sm:px-12">
          <p className="text-xs font-semibold tracking-[.32em] text-[#c89b54]">{organizationName}</p>
          <h1 className="mt-5 text-3xl font-semibold sm:text-4xl">Hesap Ekstresi / Mutabakat</h1>
          <p className="mt-3 text-[#a69d8d]">{customerName} için hazırlanmıştır — {new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short" }).format(new Date(generatedAt))} itibarıyla güncel.</p>
        </header>
        <section className="px-8 py-8 sm:px-12">
          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            {data.balances.length > 0 ? data.balances.map((balance) => (
              <div key={balance.currency} className="rounded-2xl border border-[#493d2d] bg-[#1c1813] p-5">
                <p className="text-xs uppercase tracking-wider text-[#887f71]">Güncel Bakiye ({balance.currency})</p>
                <p className="mt-2 text-2xl font-semibold text-[#ddb56f]">{money(balance.balanceCents, balance.currency)}</p>
              </div>
            )) : <p className="text-sm text-[#928979]">Açık bakiye bulunmuyor.</p>}
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#342e25]">
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 bg-[#211c16] px-5 py-3 text-xs uppercase tracking-wider text-[#988c79]">
              <span>Tarih</span><span>Açıklama</span><span>Tutar</span><span>Bakiye</span>
            </div>
            {data.movements.length > 0 ? data.movements.map((movement) => (
              <div key={movement.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-4 border-t border-[#342e25] px-5 py-4 text-sm first:border-t-0">
                <span className="text-[#928979]">{new Intl.DateTimeFormat("tr-TR", { dateStyle: "short" }).format(new Date(movement.date))}</span>
                <span><strong>{MOVEMENT_LABEL[movement.sourceType]}</strong> — {movement.title} <span className="text-[#847a68]">({movement.status})</span></span>
                <span>{money(movement.amountCents, movement.currency)}</span>
                <strong>{money(movement.runningBalanceCents, movement.currency)}</strong>
              </div>
            )) : <p className="px-5 py-6 text-sm text-[#928979]">Hesap hareketi bulunmuyor.</p>}
          </div>
          {data.dataQualityNote ? <p className="mt-6 text-xs text-[#847a68]">{data.dataQualityNote}</p> : null}
        </section>
      </article>
    </main>
  );
}
