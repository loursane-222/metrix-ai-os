"use client";
import { useState } from "react";

export function OrderCreateScreen() {
  const [customerName, setCustomerName] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customerName }) });
    setSaved(r.ok);
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Yeni Sipariş</h1>
      <label className="block text-sm">
        Müşteri adı
        <input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1 w-full rounded border p-2" />
      </label>
      <button className="rounded bg-primary px-4 py-2 text-white" type="submit">Kaydet</button>
      {saved && <p role="status">Sipariş oluşturuldu.</p>}
    </form>
  );
}
