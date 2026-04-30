import { useState, useEffect } from "react";
import { X, Loader2, Check, Package, Warehouse } from "lucide-react";
import { motion as Motion } from "motion/react";
import { toast } from "sonner";
import { createProductFromPreSale, getWarehouses } from "@tadaima/api";
import type { PreSale as ApiPreSale, Warehouse as ApiWarehouse } from "@tadaima/api";

interface Props {
  preSale: ApiPreSale;
  onClose: () => void;
  onSuccess: (productId: number) => void;
}

interface WarehouseQty {
  warehouse_id: number;
  quantity: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export function CreateProductFromPreSaleModal({ preSale, onClose, onSuccess }: Props) {
  const [warehouses, setWarehouses] = useState<ApiWarehouse[]>([]);
  const [sku, setSku] = useState("");
  const [price1, setPrice1] = useState<number | "">(
    preSale.price_1 ?? (preSale.cost && preSale.margin_percent
      ? parseFloat((preSale.cost * (1 + preSale.margin_percent / 100)).toFixed(2))
      : "")
  );
  const [price2, setPrice2] = useState<number | "">(preSale.price_2 ?? "");
  const [price3, setPrice3] = useState<number | "">(preSale.price_3 ?? "");
  const [price4, setPrice4] = useState<number | "">(preSale.price_4 ?? "");
  const [price5, setPrice5] = useState<number | "">(preSale.price_5 ?? "");
  const [warehouseQtys, setWarehouseQtys] = useState<WarehouseQty[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingWh, setLoadingWh] = useState(true);

  useEffect(() => {
    getWarehouses()
      .then(raw => {
        const list: ApiWarehouse[] = Array.isArray(raw) ? raw : (raw as any).data ?? [];
        const active = list.filter(w => w.active);
        setWarehouses(active);
        setWarehouseQtys(active.map(w => ({ warehouse_id: w.id, quantity: 0 })));
      })
      .catch(() => toast.error("No se pudieron cargar los almacenes"))
      .finally(() => setLoadingWh(false));
  }, []);

  const setQty = (warehouseId: number, val: number) =>
    setWarehouseQtys(prev =>
      prev.map(wq => wq.warehouse_id === warehouseId ? { ...wq, quantity: Math.max(0, val) } : wq)
    );

  const totalStock = warehouseQtys.reduce((s, wq) => s + wq.quantity, 0);

  const handleSave = async () => {
    if (!sku.trim()) { toast.error("El SKU es obligatorio"); return; }
    if (!price1 || Number(price1) <= 0) { toast.error("Define un precio válido"); return; }
    if (totalStock === 0) { toast.error("Asigna stock en al menos un almacén"); return; }

    const filledQtys = warehouseQtys.filter(wq => wq.quantity > 0);

    setSaving(true);
    try {
      const result = await createProductFromPreSale(preSale.id, {
        sku: sku.trim(),
        price_1: Number(price1),
        price_2: price2 !== "" ? Number(price2) : undefined,
        price_3: price3 !== "" ? Number(price3) : undefined,
        price_4: price4 !== "" ? Number(price4) : undefined,
        price_5: price5 !== "" ? Number(price5) : undefined,
        warehouse_quantities: filledQtys,
      });
      toast.success(`Producto dado de alta y stock registrado (#${result.product_id})`);
      onSuccess(result.product_id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Error al crear el producto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/85 backdrop-blur-xl"
        onClick={onClose}
      />

      <Motion.div
        initial={{ scale: 0.93, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 300 }}
        className="relative w-full max-w-lg rounded-[36px] border overflow-hidden flex flex-col shadow-2xl"
        style={{ background: "var(--td-popup-bg)", backdropFilter: "blur(40px)", borderColor: "var(--td-panel-border)", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="px-7 py-5 border-b border-white/5 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)" }}>
              <Package size={18} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-tight">Dar de alta producto</h2>
              <p className="text-[10px] font-bold text-white/50 mt-0.5">{preSale.product_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-7 py-5 space-y-5">

          {/* Datos de la preventa (referencia) */}
          <div className="px-4 py-3 rounded-2xl border border-white/5 flex gap-4 text-center" style={{ background: "var(--td-card-bg)" }}>
            {preSale.cost && (
              <div className="flex-1">
                <p className="text-[9px] font-black text-white/50 uppercase tracking-widest">Costo</p>
                <p className="text-sm font-black text-white">{fmt(preSale.cost)}</p>
              </div>
            )}
            {preSale.margin_percent && (
              <div className="flex-1">
                <p className="text-[9px] font-black text-white/50 uppercase tracking-widest">Margen</p>
                <p className="text-sm font-black text-white">{preSale.margin_percent}%</p>
              </div>
            )}
            <div className="flex-1">
              <p className="text-[9px] font-black text-white/50 uppercase tracking-widest">Reservados</p>
              <p className="text-sm font-black text-white">{preSale.reserved_quantity}</p>
            </div>
          </div>

          {/* SKU */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-white/50 uppercase tracking-widest">SKU *</label>
            <input
              type="text"
              value={sku}
              onChange={e => setSku(e.target.value)}
              placeholder="Ej. ABC-001"
              className="w-full px-3 py-2.5 rounded-2xl outline-none border border-white/8 bg-white/5 text-sm font-bold text-white placeholder-white/20 focus:border-indigo-500/40"
            />
          </div>

          {/* Precios A–E */}
          <div className="grid grid-cols-2 gap-3">
            {([
              { label: "Precio A (Principal) *", val: price1, set: setPrice1, hi: true },
              { label: "Precio B",  val: price2, set: setPrice2, hi: false },
              { label: "Precio C",  val: price3, set: setPrice3, hi: false },
              { label: "Precio D",  val: price4, set: setPrice4, hi: false },
              { label: "Precio E",  val: price5, set: setPrice5, hi: false },
            ] as const).map(({ label, val, set, hi }) => (
              <div key={label} className="space-y-1.5">
                <label className={`text-[9px] font-black uppercase tracking-widest ${hi ? "text-indigo-400" : "text-white/50"}`}>{label}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-white/50">$</span>
                  <input
                    type="number" min={0} step={0.01}
                    value={val}
                    onChange={e => (set as any)(e.target.value === "" ? "" : parseFloat(e.target.value))}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2.5 rounded-2xl outline-none border border-white/8 bg-white/5 text-sm font-bold text-white placeholder-white/20 focus:border-indigo-500/40"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Stock por almacén */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/50">
                <Warehouse size={10} className="text-indigo-400" />Stock por almacén
              </h3>
              {totalStock > 0 && (
                <span className="text-[10px] font-black text-indigo-400">{totalStock} uds. total</span>
              )}
            </div>

            {loadingWh ? (
              <div className="flex items-center gap-3 py-6 justify-center">
                <Loader2 size={16} className="animate-spin text-white/50" />
              </div>
            ) : (
              <div className="space-y-2">
                {warehouses.map(wh => {
                  const wq = warehouseQtys.find(q => q.warehouse_id === wh.id);
                  return (
                    <div key={wh.id} className="flex items-center gap-4 px-4 py-3 rounded-2xl border border-white/5" style={{ background: "var(--td-card-bg)" }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white/90 truncate">{wh.name}</p>
                        {wh.store && <p className="text-[9px] font-bold text-white/50">{wh.store.name}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setQty(wh.id, (wq?.quantity ?? 0) - 1)}
                          className="w-7 h-7 rounded-full bg-white/7 text-white/50 hover:text-white flex items-center justify-center transition-colors"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={wq?.quantity ?? 0}
                          onChange={e => setQty(wh.id, parseInt(e.target.value) || 0)}
                          className="w-14 text-center bg-white/5 border border-white/8 rounded-xl py-1.5 text-sm font-black text-white outline-none focus:border-indigo-500/40"
                        />
                        <button
                          onClick={() => setQty(wh.id, (wq?.quantity ?? 0) + 1)}
                          className="w-7 h-7 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 flex items-center justify-center transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-white/5 flex gap-3 shrink-0" style={{ background: "var(--td-panel-bg)" }}>
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/8 text-white/50 hover:text-white/50 transition-all">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !sku.trim() || price1 === "" || Number(price1) <= 0 || totalStock === 0}
            className="flex-[2] py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-30"
            style={{ background: "linear-gradient(135deg,#4f46e5,#818cf8)", color: "#fff", border: "1px solid rgba(129,140,248,0.3)" }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? "Creando..." : "Crear Producto"}
          </button>
        </div>
      </Motion.div>
    </div>
  );
}
