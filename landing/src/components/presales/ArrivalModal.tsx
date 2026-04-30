import { useState, useEffect } from "react";
import { X, Loader2, Check, Package, Calendar, MapPin } from "lucide-react";
import { motion as Motion } from "motion/react";
import { toast } from "sonner";
import { assignPreSaleInventory, getStores } from "@tadaima/api";
import type { PreSale as ApiPreSale, Store } from "@tadaima/api";

interface Props {
  preSale: ApiPreSale;
  onClose: () => void;
  onSuccess: (updated: ApiPreSale) => void;
}

export function ArrivalModal({ preSale, onClose, onSuccess }: Props) {
  const [stores, setStores] = useState<Store[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [pickupDeadline, setPickupDeadline] = useState("");
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [loadingStores, setLoadingStores] = useState(true);

  useEffect(() => {
    getStores()
      .then(raw => {
        const list = Array.isArray(raw) ? raw : (raw as any).data ?? [];
        setStores(list.filter((s: Store) => s.active));
      })
      .catch(() => toast.error("No se pudieron cargar las tiendas"))
      .finally(() => setLoadingStores(false));
  }, []);

  const setQty = (storeId: number, val: number) =>
    setQuantities(prev => ({ ...prev, [storeId]: Math.max(0, val) }));

  const totalAssigned = Object.values(quantities).reduce((s, v) => s + v, 0);

  const handleSave = async () => {
    const assigned = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([store_id, quantity]) => ({ store_id: Number(store_id), quantity }));

    if (assigned.length === 0) {
      toast.error("Asigna al menos una tienda con cantidad mayor a 0");
      return;
    }
    if (!pickupDeadline) {
      toast.error("Define la fecha límite de recoger");
      return;
    }

    setSaving(true);
    try {
      const updated = await assignPreSaleInventory(preSale.id, {
        quantities: assigned,
        pickup_deadline: pickupDeadline,
        arrival_date: arrivalDate || undefined,
      });
      toast.success(`Inventario asignado. Los cajeros recibirán una notificación.`);
      onSuccess(updated);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Error al asignar inventario");
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
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
              <Package size={18} className="text-green-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-tight">Llegó el producto</h2>
              <p className="text-[10px] font-bold text-white/50 mt-0.5">{preSale.product_name} — #{String(preSale.id).padStart(6, "0")}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-7 py-5 space-y-5">

          {/* Fechas */}
          <section className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[9px] font-black text-white/50 uppercase tracking-widest">
                <Calendar size={10} />Fecha de llegada
              </label>
              <input
                type="date"
                value={arrivalDate}
                onChange={e => setArrivalDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-2xl outline-none border border-white/8 bg-white/5 text-sm font-bold text-white focus:border-green-500/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[9px] font-black text-white/50 uppercase tracking-widest">
                <Calendar size={10} />Fecha límite recoger *
              </label>
              <input
                type="date"
                value={pickupDeadline}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => setPickupDeadline(e.target.value)}
                className="w-full px-3 py-2.5 rounded-2xl outline-none border border-white/8 bg-white/5 text-sm font-bold text-white focus:border-green-500/40"
              />
            </div>
          </section>

          {/* Cantidades por tienda */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/50">
                <MapPin size={10} className="text-green-400" />Cantidad por tienda
              </h3>
              {totalAssigned > 0 && (
                <span className="text-[10px] font-black text-green-400">{totalAssigned} total asignados</span>
              )}
            </div>

            {loadingStores ? (
              <div className="flex items-center gap-3 py-6 justify-center">
                <Loader2 size={16} className="animate-spin text-white/50" />
                <span className="text-[10px] font-bold text-white/45 uppercase tracking-widest">Cargando tiendas...</span>
              </div>
            ) : (
              <div className="space-y-2">
                {stores.map(store => (
                  <div key={store.id} className="flex items-center gap-4 px-4 py-3 rounded-2xl border border-white/5" style={{ background: "var(--td-card-bg)" }}>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white/90">{store.name}</p>
                      {store.address && <p className="text-[9px] font-bold text-white/50 truncate mt-0.5">{store.address}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setQty(store.id, (quantities[store.id] ?? 0) - 1)}
                        className="w-7 h-7 rounded-full bg-white/7 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={quantities[store.id] ?? 0}
                        onChange={e => setQty(store.id, parseInt(e.target.value) || 0)}
                        className="w-14 text-center bg-white/5 border border-white/8 rounded-xl py-1.5 text-sm font-black text-white outline-none focus:border-green-500/40"
                      />
                      <button
                        onClick={() => setQty(store.id, (quantities[store.id] ?? 0) + 1)}
                        className="w-7 h-7 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400 hover:bg-green-500/20 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
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
            disabled={saving || totalAssigned === 0 || !pickupDeadline}
            className="flex-[2] py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-30"
            style={{ background: "linear-gradient(135deg,#059669,#34d399)", color: "#fff", border: "1px solid rgba(52,211,153,0.3)" }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? "Notificando..." : "Confirmar Llegada"}
          </button>
        </div>
      </Motion.div>
    </div>
  );
}
