"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  createWarehouseApi,
  listStockFormOptions,
  receiveStockApi,
  transferStockApi,
  type ProductOption,
  type SupplierOption,
  type WarehouseRecord,
} from "@/lib/stock/stocks-client";
import type { StockOperationSurfaceRuntimeAdapter } from "@/lib/stock/stock-operation-command-apply";
import type { StockOperationField, StockOperationTab } from "@/lib/stock/stock-operation-command-contract";
import { registerStockOperationSurfaceTarget, unregisterStockOperationSurfaceTarget } from "@/lib/stock/stock-operation-surface-command-channel";

type Tab = "receipt" | "transfer" | "warehouses";
type ReceiptDraft = { productServiceId: string; warehouseId: string; quantity: string; lot: string; batch: string; serialNumber: string; location: string; reason: string; supplierId: string; expectedAt: string; unitCost: string; qualityFlag: string };
type TransferDraft = { productServiceId: string; fromWarehouseId: string; toWarehouseId: string; quantity: string; lot: string; batch: string; serialNumber: string; reason: string };
type WarehouseDraft = { name: string; code: string; type: string; address: string; notes: string };

const EMPTY_RECEIPT: ReceiptDraft = { productServiceId: "", warehouseId: "", quantity: "1", lot: "", batch: "", serialNumber: "", location: "", reason: "", supplierId: "", expectedAt: "", unitCost: "", qualityFlag: "" };
const EMPTY_TRANSFER: TransferDraft = { productServiceId: "", fromWarehouseId: "", toWarehouseId: "", quantity: "1", lot: "", batch: "", serialNumber: "", reason: "" };
const EMPTY_WAREHOUSE: WarehouseDraft = { name: "", code: "", type: "", address: "", notes: "" };
const inputClass = "w-full rounded-xl border border-white/[.1] bg-white/[.04] px-3 py-2.5 text-sm text-[#EDE7D9] outline-none focus:border-[#34e6cf]/45 disabled:cursor-not-allowed disabled:opacity-45";
const primaryButtonClass = "rounded-xl bg-[#34e6cf] px-4 py-2.5 text-sm font-bold text-[#14120F] disabled:cursor-not-allowed disabled:opacity-40";

function optional(value: string): string | undefined { return value.trim() || undefined; }

export function StockCreateScreen({ onReady, onFailure }: { onReady?: () => void; onFailure?: () => void } = {}) {
  const [tab, setTab] = useState<Tab>("receipt");
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [receipt, setReceipt] = useState<ReceiptDraft>(EMPTY_RECEIPT);
  const [transfer, setTransfer] = useState<TransferDraft>(EMPTY_TRANSFER);
  const [warehouse, setWarehouse] = useState<WarehouseDraft>(EMPTY_WAREHOUSE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const stateRef = useRef({ tab, receipt, transfer, warehouse, products, warehouses, suppliers });
  stateRef.current = { tab, receipt, transfer, warehouse, products, warehouses, suppliers };
  const submitRef = useRef<() => Promise<{ ok: boolean; error?: string }>>(async () => ({ ok: false, error: "Stok ekranı hazır değil." }));

  const loadOptions = useCallback(async () => {
    setLoading(true);
    const result = await listStockFormOptions();
    if (result.ok) {
      setProducts(result.data.products);
      setSuppliers(result.data.suppliers);
      setWarehouses(result.data.warehouses);
      setError(null);
      onReady?.();
    } else { setError(result.error); onFailure?.(); }
    setLoading(false);
  }, [onFailure, onReady]);

  useEffect(() => { void loadOptions(); }, [loadOptions]);

  function changeTab(next: Tab) { setTab(next); setError(null); setNotice(null); }

  async function submitReceiptCore(): Promise<{ ok: boolean; error?: string }> {
    const quantity = Number(receipt.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) { const message = "Miktar sıfırdan büyük olmalıdır."; setError(message); return { ok: false, error: message }; }
    const unitCostCents = receipt.unitCost ? Math.round(Number(receipt.unitCost.replace(",", ".")) * 100) : undefined;
    if (unitCostCents !== undefined && (!Number.isSafeInteger(unitCostCents) || unitCostCents < 0)) { const message = "Birim maliyet geçerli bir tutar olmalıdır."; setError(message); return { ok: false, error: message }; }
    setBusy(true); setError(null); setNotice(null);
    const result = await receiveStockApi({
      productServiceId: receipt.productServiceId,
      warehouseId: receipt.warehouseId,
      quantity,
      lot: optional(receipt.lot), batch: optional(receipt.batch), serialNumber: optional(receipt.serialNumber), location: optional(receipt.location),
      reason: optional(receipt.reason), supplierId: optional(receipt.supplierId), expectedAt: optional(receipt.expectedAt), unitCostCents, qualityFlag: optional(receipt.qualityFlag),
    });
    if (result.ok) { setNotice("Mal kabul kaydedildi."); setReceipt((current) => ({ ...EMPTY_RECEIPT, productServiceId: current.productServiceId, warehouseId: current.warehouseId })); }
    else setError(result.error);
    setBusy(false);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  async function submitTransferCore(): Promise<{ ok: boolean; error?: string }> {
    if (transfer.fromWarehouseId === transfer.toWarehouseId) { const message = "Kaynak ve hedef depo farklı olmalıdır."; setError(message); return { ok: false, error: message }; }
    const quantity = Number(transfer.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) { const message = "Miktar sıfırdan büyük olmalıdır."; setError(message); return { ok: false, error: message }; }
    setBusy(true); setError(null); setNotice(null);
    const result = await transferStockApi({
      productServiceId: transfer.productServiceId, fromWarehouseId: transfer.fromWarehouseId, toWarehouseId: transfer.toWarehouseId, quantity,
      lot: optional(transfer.lot), batch: optional(transfer.batch), serialNumber: optional(transfer.serialNumber), reason: optional(transfer.reason),
    });
    if (result.ok) { setNotice("Depo transferi tamamlandı."); setTransfer((current) => ({ ...EMPTY_TRANSFER, productServiceId: current.productServiceId, fromWarehouseId: current.fromWarehouseId, toWarehouseId: current.toWarehouseId })); }
    else setError(result.error);
    setBusy(false);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  async function submitWarehouseCore(): Promise<{ ok: boolean; error?: string }> {
    setBusy(true); setError(null); setNotice(null);
    const result = await createWarehouseApi({ name: warehouse.name.trim(), code: warehouse.code.trim(), type: optional(warehouse.type), address: optional(warehouse.address), notes: optional(warehouse.notes) });
    if (result.ok) {
      setWarehouses((current) => [...current, result.data.warehouse].sort((a, b) => a.name.localeCompare(b.name, "tr")));
      setWarehouse(EMPTY_WAREHOUSE);
      setNotice("Depo oluşturuldu.");
    } else setError(result.error);
    setBusy(false);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  }

  submitRef.current = () => tab === "receipt" ? submitReceiptCore() : tab === "transfer" ? submitTransferCore() : submitWarehouseCore();

  useEffect(() => {
    const runtime: StockOperationSurfaceRuntimeAdapter = {
      getState: () => ({ activeTab: stateRef.current.tab, ...stateRef.current }),
      selectTab: changeTab,
      setField(tabId: StockOperationTab, field: StockOperationField, value: string) {
        if (tabId === "receipt") setReceipt((current) => ({ ...current, [field]: value }));
        else if (tabId === "transfer") setTransfer((current) => ({ ...current, [field]: value }));
        else setWarehouse((current) => ({ ...current, [field]: value }));
      },
      submit: () => submitRef.current(),
      discard() { const active = stateRef.current.tab; if (active === "receipt") setReceipt(EMPTY_RECEIPT); else if (active === "transfer") setTransfer(EMPTY_TRANSFER); else setWarehouse(EMPTY_WAREHOUSE); setError(null); setNotice(null); },
    };
    const token = registerStockOperationSurfaceTarget(runtime);
    return () => unregisterStockOperationSurfaceTarget(token);
  }, []);

  const submitReceipt = (event: FormEvent) => { event.preventDefault(); void submitReceiptCore(); };
  const submitTransfer = (event: FormEvent) => { event.preventDefault(); void submitTransferCore(); };
  const submitWarehouse = (event: FormEvent) => { event.preventDefault(); void submitWarehouseCore(); };

  return <div className="mx-auto max-w-5xl space-y-4 pb-8" data-stock-operation-surface>
    <header><p className="text-xs uppercase tracking-[.18em] text-[#7C7466]">Stok çalışma alanı</p><h2 className="mt-1 text-xl font-semibold text-[#EDE7D9]">Gerçek stok işlemleri</h2><p className="mt-1 text-sm text-[#A79F91]">Depoları yönetin, mal kabul edin ve stokları depolar arasında aktarın.</p></header>
    <nav aria-label="Stok işlemleri" className="flex flex-wrap gap-2 rounded-2xl border border-white/[.08] bg-white/[.025] p-2">
      <TabButton active={tab === "receipt"} onClick={() => changeTab("receipt")}>Mal Kabul</TabButton>
      <TabButton active={tab === "transfer"} onClick={() => changeTab("transfer")}>Depo Transferi</TabButton>
      <TabButton active={tab === "warehouses"} onClick={() => changeTab("warehouses")}>Depolar <span className="opacity-60">({warehouses.length})</span></TabButton>
    </nav>
    {error ? <Message error>{error}</Message> : null}{notice ? <Message>{notice}</Message> : null}
    {loading ? <p className="py-12 text-center text-sm text-[#7C7466]">Stok seçenekleri yükleniyor…</p> : null}
    {!loading && tab === "receipt" ? <ReceiptForm busy={busy} draft={receipt} products={products} suppliers={suppliers} warehouses={warehouses} onChange={setReceipt} onSubmit={submitReceipt} /> : null}
    {!loading && tab === "transfer" ? <TransferForm busy={busy} draft={transfer} products={products} warehouses={warehouses} onChange={setTransfer} onSubmit={submitTransfer} /> : null}
    {!loading && tab === "warehouses" ? <WarehousePanel busy={busy} draft={warehouse} warehouses={warehouses} onChange={setWarehouse} onSubmit={submitWarehouse} /> : null}
  </div>;
}

function ReceiptForm({ busy, draft, products, suppliers, warehouses, onChange, onSubmit }: { busy: boolean; draft: ReceiptDraft; products: ProductOption[]; suppliers: SupplierOption[]; warehouses: WarehouseRecord[]; onChange: (draft: ReceiptDraft) => void; onSubmit: (event: FormEvent) => void }) {
  return <form className="space-y-4" onSubmit={onSubmit} data-stock-receipt-form>
    <Card title="Mal kabul"><div className="grid gap-3 md:grid-cols-2">
      <Select label="Ürün" required value={draft.productServiceId} onChange={(value) => onChange({ ...draft, productServiceId: value })}><option value="">Ürün seçin</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.unit ? ` · ${product.unit}` : ""}</option>)}</Select>
      <Select label="Depo" required value={draft.warehouseId} onChange={(value) => onChange({ ...draft, warehouseId: value })}><option value="">Depo seçin</option>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</Select>
      <Input label="Miktar" min="0.001" required step="0.001" type="number" value={draft.quantity} onChange={(value) => onChange({ ...draft, quantity: value })} />
      <Input label="Birim maliyet (₺)" min="0" step="0.01" type="number" value={draft.unitCost} onChange={(value) => onChange({ ...draft, unitCost: value })} />
      <Input label="Lot" value={draft.lot} onChange={(value) => onChange({ ...draft, lot: value })} />
      <Input label="Parti" value={draft.batch} onChange={(value) => onChange({ ...draft, batch: value })} />
      <Input label="Seri no" value={draft.serialNumber} onChange={(value) => onChange({ ...draft, serialNumber: value })} />
      <Input label="Konum" value={draft.location} onChange={(value) => onChange({ ...draft, location: value })} />
      <Select label="Tedarikçi" value={draft.supplierId} onChange={(value) => onChange({ ...draft, supplierId: value })}><option value="">Tedarikçi yok</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>)}</Select>
      <Input label="Beklenen tarih" type="date" value={draft.expectedAt} onChange={(value) => onChange({ ...draft, expectedAt: value })} />
      <Select label="Kalite" value={draft.qualityFlag} onChange={(value) => onChange({ ...draft, qualityFlag: value })}><option value="">Belirtilmedi</option><option value="OK">Uygun</option><option value="PARTIAL">Kısmi uygun</option><option value="DAMAGED">Hasarlı</option></Select>
      <Input label="Sebep / açıklama" value={draft.reason} onChange={(value) => onChange({ ...draft, reason: value })} />
    </div></Card>
    {!warehouses.length ? <EmptyHint>Mal kabul için önce Depolar sekmesinden bir depo oluşturun.</EmptyHint> : null}
    {!products.length ? <EmptyHint>Mal kabul için aktif bir ürün gereklidir.</EmptyHint> : null}
    <div className="flex justify-end"><button className={primaryButtonClass} disabled={busy || !draft.productServiceId || !draft.warehouseId || !products.length || !warehouses.length} type="submit">Mal kabulü kaydet</button></div>
  </form>;
}

function TransferForm({ busy, draft, products, warehouses, onChange, onSubmit }: { busy: boolean; draft: TransferDraft; products: ProductOption[]; warehouses: WarehouseRecord[]; onChange: (draft: TransferDraft) => void; onSubmit: (event: FormEvent) => void }) {
  const sameWarehouse = Boolean(draft.fromWarehouseId && draft.fromWarehouseId === draft.toWarehouseId);
  return <form className="space-y-4" onSubmit={onSubmit} data-stock-transfer-form>
    <Card title="Depo transferi"><div className="grid gap-3 md:grid-cols-2">
      <Select label="Ürün" required value={draft.productServiceId} onChange={(value) => onChange({ ...draft, productServiceId: value })}><option value="">Ürün seçin</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.unit ? ` · ${product.unit}` : ""}</option>)}</Select>
      <Input label="Miktar" min="0.001" required step="0.001" type="number" value={draft.quantity} onChange={(value) => onChange({ ...draft, quantity: value })} />
      <Select label="Kaynak depo" required value={draft.fromWarehouseId} onChange={(value) => onChange({ ...draft, fromWarehouseId: value })}><option value="">Kaynak depo seçin</option>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</Select>
      <Select label="Hedef depo" required value={draft.toWarehouseId} onChange={(value) => onChange({ ...draft, toWarehouseId: value })}><option value="">Hedef depo seçin</option>{warehouses.map((item) => <option disabled={item.id === draft.fromWarehouseId} key={item.id} value={item.id}>{item.name} · {item.code}</option>)}</Select>
      <Input label="Lot" value={draft.lot} onChange={(value) => onChange({ ...draft, lot: value })} />
      <Input label="Parti" value={draft.batch} onChange={(value) => onChange({ ...draft, batch: value })} />
      <Input label="Seri no" value={draft.serialNumber} onChange={(value) => onChange({ ...draft, serialNumber: value })} />
      <Input label="Sebep / açıklama" value={draft.reason} onChange={(value) => onChange({ ...draft, reason: value })} />
    </div></Card>
    {warehouses.length < 2 ? <EmptyHint>Transfer için en az iki depo gereklidir.</EmptyHint> : null}{sameWarehouse ? <Message error>Kaynak ve hedef depo farklı olmalıdır.</Message> : null}
    <div className="flex justify-end"><button className={primaryButtonClass} disabled={busy || warehouses.length < 2 || !draft.productServiceId || !draft.fromWarehouseId || !draft.toWarehouseId || sameWarehouse} type="submit">Transferi tamamla</button></div>
  </form>;
}

function WarehousePanel({ busy, draft, warehouses, onChange, onSubmit }: { busy: boolean; draft: WarehouseDraft; warehouses: WarehouseRecord[]; onChange: (draft: WarehouseDraft) => void; onSubmit: (event: FormEvent) => void }) {
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
    <form onSubmit={onSubmit}><Card title="Yeni depo"><div className="space-y-3"><Input label="Depo adı" required value={draft.name} onChange={(value) => onChange({ ...draft, name: value })} /><Input label="Depo kodu" required value={draft.code} onChange={(value) => onChange({ ...draft, code: value })} /><Input label="Depo türü" value={draft.type} onChange={(value) => onChange({ ...draft, type: value })} /><Input label="Adres" value={draft.address} onChange={(value) => onChange({ ...draft, address: value })} /><Field label="Notlar"><textarea aria-label="Notlar" className={`${inputClass} min-h-24`} value={draft.notes} onChange={(event) => onChange({ ...draft, notes: event.target.value })} /></Field><div className="flex justify-end"><button className={primaryButtonClass} disabled={busy || !draft.name.trim() || !draft.code.trim()} type="submit">Depo oluştur</button></div></div></Card></form>
    <Card title={`Mevcut depolar (${warehouses.length})`}>{warehouses.length ? <div className="space-y-2" role="list">{warehouses.map((item) => <article className="rounded-xl border border-white/[.08] bg-black/10 p-3" key={item.id} role="listitem"><div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-semibold text-[#EDE7D9]">{item.name}</h4><p className="mt-0.5 text-xs text-[#A79F91]">{item.code}{item.type ? ` · ${item.type}` : ""}</p></div><span className="rounded-full bg-[#34e6cf]/10 px-2 py-1 text-[11px] text-[#34e6cf]">Aktif</span></div>{item.address ? <p className="mt-2 text-xs text-[#7C7466]">{item.address}</p> : null}{item.notes ? <p className="mt-1 text-xs text-[#7C7466]">{item.notes}</p> : null}</article>)}</div> : <p className="py-8 text-center text-sm text-[#7C7466]">Henüz depo yok.</p>}</Card>
  </div>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button aria-selected={active} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${active ? "bg-[#C9BFA8] text-[#15130f]" : "text-[#A79F91] hover:bg-white/[.05] hover:text-[#EDE7D9]"}`} onClick={onClick} role="tab" type="button">{children}</button>; }
function Card({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-[20px] border border-white/[.08] bg-white/[.035] p-4"><h3 className="mb-3 text-sm font-semibold text-[#EDE7D9]">{title}</h3>{children}</section>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-xs font-medium text-[#A79F91]"><span className="mb-1.5 block">{label}</span>{children}</label>; }
function Input({ label, value, onChange, required, type = "text", min, step }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; min?: string; step?: string }) { return <Field label={label}><input aria-label={label} className={inputClass} min={min} required={required} step={step} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></Field>; }
function Select({ label, value, onChange, required, children }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; children: ReactNode }) { return <Field label={label}><select aria-label={label} className={inputClass} required={required} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></Field>; }
function Message({ children, error = false }: { children: ReactNode; error?: boolean }) { return <p className={`rounded-xl border p-3 text-sm ${error ? "border-[#f16a7a]/20 bg-[#f16a7a]/10 text-[#f16a7a]" : "border-[#34e6cf]/20 bg-[#34e6cf]/10 text-[#34e6cf]"}`} role={error ? "alert" : "status"}>{children}</p>; }
function EmptyHint({ children }: { children: ReactNode }) { return <p className="rounded-xl border border-amber-200/15 bg-amber-200/[.035] p-3 text-sm text-amber-100/70">{children}</p>; }
