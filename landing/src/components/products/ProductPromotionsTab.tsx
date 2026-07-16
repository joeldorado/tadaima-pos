import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Pause, Play, Trash2, TicketPercent, Store as StoreIcon } from "lucide-react";
import {
  getProductPromotions, createProductPromotion, updateProductPromotion, deleteProductPromotion,
  getStores,
  type ProductPromotion, type ProductPromotionInput, type Store,
} from "@tadaima/api";
import { useAuth } from "@tadaima/auth";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { BUSINESS_TZ, getTodayLocal } from "@/lib/date";
import { isAdmin as isAdminRole } from "@/lib/permisos";
import { SingleDatePicker } from "@/components/ui/SingleDatePicker";

interface Props {
  /** null = producto nuevo sin guardar (las promos requieren id). */
  productId: number | null;
}

const THI = "var(--td-text-hi)";
const TMD = "var(--td-text-md)";
const TLO = "var(--td-text-lo)";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 12,
  border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)",
  color: THI, fontSize: 13, fontWeight: 700, outline: "none", boxSizing: "border-box",
};

const STATUS_META: Record<ProductPromotion["status"], { label: string; color: string }> = {
  active:  { label: "Activa",  color: "#34d399" },
  paused:  { label: "Pausada", color: "#F59E0B" },
  expired: { label: "Vencida", color: "#9CA3AF" },
};

/** Fecha ISO (UTC) → día en la ZONA DEL NEGOCIO (Tijuana). Slicear el ISO
 *  mostraría el día UTC (ej. vence 20 · 23:59 Tijuana = 21 · 06:59Z → "21"). */
const toDateInput = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: BUSINESS_TZ }) : "";

/**
 * 4ª pestaña del editor de producto (Fase 3): promociones NxM (2x1, 3x2…).
 * Alta con nombre/N/M/vigencia/prioridad + pausar/reanudar + eliminar.
 * Los tickets históricos no se afectan al editar/borrar (snapshot en la venta).
 */
export function ProductPromotionsTab({ productId }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.roles);
  const [promotions, setPromotions] = useState<ProductPromotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form de alta
  const [name, setName] = useState("");
  const [buyN, setBuyN] = useState("2");
  const [payM, setPayM] = useState("1");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [priority, setPriority] = useState("0");
  // Tienda de la promo: "" = todas (solo admin). El gerente queda forzado a la
  // suya (el backend lo fuerza igual — esto es solo UI).
  const [storeSel, setStoreSel] = useState<string>("");
  const [stores, setStores] = useState<Store[]>([]);
  useEffect(() => {
    if (isAdmin) { void getStores().then(setStores).catch(() => {}); }
  }, [isAdmin]);
  const storeName = (id: number | null | undefined): string =>
    id == null ? "Todas las tiendas" : (stores.find(s => s.id === id)?.name ?? `Tienda #${id}`);

  const reload = async (id: number) => {
    setLoading(true);
    try {
      setPromotions(await getProductPromotions(id));
    } catch {
      toast.error("No se pudieron cargar las promociones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (productId != null) void reload(productId);
  }, [productId]);

  const invalidateProducts = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });

  const submit = async () => {
    if (productId == null) return;
    const n = parseInt(buyN, 10) || 0;
    const m = parseInt(payM, 10) || 0;
    if (!name.trim()) { toast.error("Ponle nombre a la promo (ej. Buen Fin)."); return; }
    if (n < 2) { toast.error("Una promo NxM necesita al menos 2 piezas (ej. 2x1)."); return; }
    if (m < 1 || m >= n) { toast.error("Lo que paga debe ser MENOR que lo que se lleva (ej. 2x1)."); return; }
    setSaving(true);
    try {
      const input: ProductPromotionInput = {
        name: name.trim(), buy_n: n, pay_m: m,
        // Fechas PLANAS (YYYY-MM-DD): el backend las ancla al día completo en
        // la zona del negocio (inicio/fin de día Tijuana) — nunca mandar hora.
        ...(startsAt ? { starts_at: startsAt } : {}),
        ...(endsAt ? { ends_at: endsAt } : {}),
        priority: parseInt(priority, 10) || 0,
        // Admin elige tienda ("" = todas); gerente: el backend fuerza la suya.
        store_id: isAdmin ? (storeSel ? parseInt(storeSel, 10) : null) : (user?.store_id ?? null),
      };
      await createProductPromotion(productId, input);
      toast.success(`Promo ${n}x${m} creada`);
      setName(""); setBuyN("2"); setPayM("1"); setStartsAt(""); setEndsAt(""); setPriority("0");
      setShowForm(false);
      await reload(productId);
      invalidateProducts();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo crear la promoción");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (promo: ProductPromotion) => {
    if (productId == null) return;
    const next = promo.status === "active" ? "paused" : "active";
    try {
      await updateProductPromotion(productId, promo.id, {
        name: promo.name, buy_n: promo.buy_n, pay_m: promo.pay_m,
        starts_at: promo.starts_at, ends_at: promo.ends_at,
        priority: promo.priority, status: next,
        store_id: promo.store_id ?? null, // preservar la tienda al pausar/reanudar
      });
      toast.success(next === "paused" ? "Promoción pausada" : "Promoción reanudada");
      await reload(productId);
      invalidateProducts();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo actualizar");
    }
  };

  const remove = async (promo: ProductPromotion) => {
    if (productId == null) return;
    try {
      await deleteProductPromotion(productId, promo.id);
      toast.success("Promoción eliminada (los tickets pasados no cambian)");
      await reload(productId);
      invalidateProducts();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo eliminar");
    }
  };

  if (productId == null) {
    return (
      <div className="rounded-2xl p-6 text-center" style={{ background: "var(--td-surface-soft)", border: "1px solid var(--td-card-border)" }}>
        <TicketPercent size={22} className="mx-auto mb-2" style={{ color: TLO }} />
        <p className="text-[12px] font-bold" style={{ color: TMD }}>
          Guarda el producto primero — después podrás agregarle promociones 2x1, 3x2, etc.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold" style={{ color: TMD }}>
          En caja aplica sola la <b>mejor</b> promo vigente. Un descuento manual en la línea se <b>acumula</b>: primero la promo y el descuento se calcula sobre el resultado.
        </p>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-widest"
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)", color: "#34d399" }}
          >
            <Plus size={13} /> Nueva promo
          </button>
        )}
      </div>

      {showForm && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--td-surface-soft)", border: "1px solid var(--td-card-border)" }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Nombre</label>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Buen Fin 2x1" style={{ ...inputStyle, marginTop: 4 }} autoFocus />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Se lleva (N)</label>
              <input type="number" min={2} step={1} value={buyN} onChange={e => setBuyN(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Paga (M)</label>
              <input type="number" min={1} step={1} value={payM} onChange={e => setPayM(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Inicia (opcional)</label>
              <div className="mt-1">
                <SingleDatePicker
                  value={startsAt}
                  onChange={(d) => {
                    setStartsAt(d);
                    // Si Inicia rebasa el Vence ya elegido, limpiar Vence
                    // (el backend valida ends_at >= starts_at y daría 422).
                    if (endsAt && d > endsAt) setEndsAt("");
                  }}
                  onClear={() => setStartsAt("")}
                  minValue={getTodayLocal()}
                  placeholder="Sin fecha de inicio"
                  ariaLabel="Fecha en que inicia la promoción"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Vence (opcional)</label>
              <div className="mt-1">
                <SingleDatePicker
                  value={endsAt}
                  onChange={setEndsAt}
                  onClear={() => setEndsAt("")}
                  {...(startsAt ? { minValue: startsAt } : {})}
                  placeholder="Sin vencimiento"
                  ariaLabel="Fecha en que vence la promoción"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Prioridad (desempate)</label>
              <input type="number" min={0} step={1} value={priority} onChange={e => setPriority(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
              <p className="text-[9px] font-bold mt-1" style={{ color: TLO }}>
                Solo importa si el producto tiene VARIAS promos a la vez: en caja gana la que más ahorra y, en empate, la de prioridad más alta. Con una sola promo déjala en 0.
              </p>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Tienda</label>
              {isAdmin ? (
                <select value={storeSel} onChange={e => setStoreSel(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} data-testid="promo-store-select">
                  <option value="">Todas las tiendas</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <p className="text-[11px] font-black mt-2.5" style={{ color: TMD }}>Tu tienda (fijo para gerente)</p>
              )}
            </div>
          </div>
          <p className="text-[10px] font-bold" style={{ color: TLO }}>
            Vista rápida: el cliente se lleva <b>{buyN || "N"}</b> y paga <b>{payM || "M"}</b>
            {parseInt(buyN, 10) > parseInt(payM, 10) && parseInt(payM, 10) > 0
              ? ` → ${parseInt(buyN, 10) - parseInt(payM, 10)} gratis por cada ${buyN}.` : "."}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 rounded-xl px-4 py-2 text-[11px] font-black uppercase"
              style={{ border: "1px solid var(--td-input-border)", color: TMD, background: "transparent" }}>
              Cancelar
            </button>
            <button onClick={() => void submit()} disabled={saving}
              className="flex-1 rounded-xl px-4 py-2 text-[11px] font-black uppercase disabled:opacity-40"
              style={{ background: "#10b981", color: "#04120c", border: "none" }}>
              {saving ? "Guardando…" : "Crear promo"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin" style={{ color: TLO }} /></div>
      ) : promotions.length === 0 ? (
        <p className="py-6 text-center text-[11px] font-bold" style={{ color: TLO }}>
          Sin promociones — crea la primera con "Nueva promo".
        </p>
      ) : (
        <div className="space-y-2">
          {promotions.map(promo => {
            // "Activa" con fecha de inicio FUTURA aún no aplica en Caja ni sale
            // en Promos → mostrar "Programada" para no confundir (QA 2026-07-16).
            const isScheduled = promo.status === "active" && !!promo.starts_at && new Date(promo.starts_at) > new Date();
            const meta = isScheduled
              ? { label: `Programada · inicia ${toDateInput(promo.starts_at)}`, color: "#60A5FA" }
              : STATUS_META[promo.status];
            return (
              <div key={promo.id} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", opacity: promo.status === "expired" ? 0.55 : 1 }}>
                <span className="rounded-xl px-2.5 py-1.5 text-[13px] font-black" style={{ background: "rgba(16,185,129,0.12)", color: "#34d399" }}>
                  {promo.buy_n}x{promo.pay_m}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-black" style={{ color: THI }}>{promo.name}</p>
                  <p className="text-[10px] font-bold" style={{ color: TLO }}>
                    {promo.starts_at || promo.ends_at
                      ? `${toDateInput(promo.starts_at) || "sin inicio"} → ${toDateInput(promo.ends_at) || "sin fin"}`
                      : "Sin vigencia (siempre)"}
                    {promo.priority > 0 ? ` · prioridad ${promo.priority}` : ""}
                  </p>
                  <p className="text-[9px] font-bold mt-0.5 flex items-center gap-1" style={{ color: TLO }}>
                    <StoreIcon size={9} />
                    {isAdmin
                      ? storeName(promo.store_id)
                      : promo.store_id == null
                        ? "Todas las tiendas"
                        : promo.store_id === (user?.store_id ?? null)
                          ? "Tu tienda"
                          : "Otra tienda (visible para no duplicar)"}
                  </p>
                </div>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
                  style={{ color: meta.color, border: `1px solid ${meta.color}66`, background: `${meta.color}18` }}>
                  {meta.label}
                </span>
                {/* Gerente solo muta promos de SU tienda; las globales o de otra
                    tienda son solo-lectura (se ven para no duplicarlas). */}
                {(isAdmin || promo.store_id === (user?.store_id ?? null)) && (
                  <>
                    {promo.status !== "expired" && (
                      <button onClick={() => void toggleStatus(promo)} className="rounded-lg p-1.5 hover:bg-white/10"
                        title={promo.status === "active" ? "Pausar" : "Reanudar"}>
                        {promo.status === "active" ? <Pause size={14} style={{ color: "#F59E0B" }} /> : <Play size={14} style={{ color: "#34d399" }} />}
                      </button>
                    )}
                    <button onClick={() => void remove(promo)} className="rounded-lg p-1.5 hover:bg-white/10" title="Eliminar">
                      <Trash2 size={14} style={{ color: "var(--td-red)" }} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
