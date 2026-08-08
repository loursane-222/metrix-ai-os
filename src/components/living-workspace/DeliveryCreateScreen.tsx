"use client";
import { useState } from "react";

export function DeliveryCreateScreen() {
  const [orderId, setOrderId] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/deliveries/from-order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId }) });
    setSaved(r.ok);
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Yeni İrsaliye</h1>
      <label className="block text-sm">
        Sipariş ID
        <input required value={orderId} onChange={(e) => setOrderId(e.target.value)} className="mt-1 w-full rounded border p-2" />
      </label>
      <button className="rounded bg-primary px-4 py-2 text-white" type="submit">Kaydet</button>
      {saved && <p role="status">İrsaliye oluşturuldu.</p>}
    </form>
  );
}
