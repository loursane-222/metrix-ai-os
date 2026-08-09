"use client";
import { useState } from "react";

export function StockCreateScreen() {
  const [warehouseId, setWarehouseId] = useState("");
  const [productServiceId, setProductServiceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/stock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ warehouseId, productServiceId, quantity: Number(quantity) }),
    });
    setSaved(r.ok);
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Stok Girişi</h1>
      <label className="block text-sm">
        Ürün ID
        <input required value={productServiceId} onChange={(e) => setProductServiceId(e.target.value)} className="mt-1 w-full rounded border p-2" />
      </label>
      <label className="block text-sm">
        Depo ID
        <input required value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="mt-1 w-full rounded border p-2" />
      </label>
      <label className="block text-sm">
        Miktar
        <input required type="number" min="0.001" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1 w-full rounded border p-2" />
      </label>
      <button className="rounded bg-primary px-4 py-2 text-white" type="submit">Kaydet</button>
      {saved && <p role="status">Stok kaydedildi.</p>}
    </form>
  );
}
