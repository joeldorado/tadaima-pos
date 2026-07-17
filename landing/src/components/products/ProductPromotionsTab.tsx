import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Pause, Play, Trash2, TicketPercent, Store as StoreIcon, CopyPlus } from "lucide-react";
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
import { promoShortLabel, promoTiersLabel } from "@/lib/promoLabel";
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
  // Permiso "Gestionar Promociones" (2026-07-18): default TRUE; el admin lo
  // revoca por usuario en Permisos. `!== false` porque undefined = true.
  const canManagePromos = isAdmin || user?.can_manage_promos !== false;
  const [promotions, setPromotions] = useState<ProductPromotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form de alta
  const [name, setName] = useState("");
  // Tipo de promo (2026-07-20): 'nxm' (2x1) | 'qty_discount' ("2 pzas → −$100").
  const [promoType, setPromoType] = useState<"nxm" | "qty_discount">("nxm");
  const [buyN, setBuyN] = useState("2");
  const [payM, setPayM] = useState("1");
  // Escalones del tipo qty_discount (strings para inputs controlados).
  const [tiers, setTiers] = useState<Array<{ qty: string; amount: string }>>([{ qty: "2", amount: "" }]);
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

  // Override local (2026-07-20): una promo LOCAL viva apaga a la GLOBAL en su
  // tienda (el motor de Caja ya lo aplica) — aquí solo se señaliza.
  const isLive = (p: ProductPromotion): boolean =>
    p.status === "active" && (!p.ends_at || new Date(p.ends_at) >= new Date());
  const liveLocals = promotions.filter(p => isLive(p) && p.store_id != null);
  const hasLiveGlobal = promotions.some(p => isLive(p) && p.store_id == null);

  /** Prellena el form con los datos de una promo GLOBAL para crear la
   *  variante LOCAL de la tienda del usuario ("Personalizar para mi tienda"). */
  const personalize = (promo: ProductPromotion) => {
    setPromoType(promo.type === "qty_discount" ? "qty_discount" : "nxm");
    setName(`${promo.name} · local`.slice(0, 100));
    setBuyN(String(promo.buy_n ?? 2));
    setPayM(String(promo.pay_m ?? 1));
    setTiers(promo.tiers?.length
      ? promo.tiers.map(t => ({ qty: String(t.qty), amount: String(t.amount) }))
      : [{ qty: "2", amount: "" }]);
    // Inicio en el pasado no se puede re-elegir en el picker (minValue hoy):
    // vacío = empieza ya. El vencimiento sí se conserva.
    const today = getTodayLocal();
    const startsInput = toDateInput(promo.starts_at);
    setStartsAt(startsInput > today ? startsInput : "");
    setEndsAt(toDateInput(promo.ends_at));
    setPriority(String(promo.priority));
    setStoreSel(user?.store_id ? String(user.store_id) : "");
    setShowForm(true);
  };

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

  const parsedTiers = (): Array<{ qty: number; amount: number }> =>
    tiers
      .map(t => ({ qty: parseInt(t.qty, 10) || 0, amount: parseFloat(t.amount) || 0 }))
      .filter(t => t.qty > 0 || t.amount > 0);

  const submit = async () => {
    if (productId == null) return;
    if (!name.trim()) { toast.error("Ponle nombre a la promo (ej. Buen Fin)."); return; }

    let typedFields: Partial<ProductPromotionInput> = {};
    let successLabel = "";
    if (promoType === "nxm") {
      const n = parseInt(buyN, 10) || 0;
      const m = parseInt(payM, 10) || 0;
      if (n < 2) { toast.error("Una promo NxM necesita al menos 2 piezas (ej. 2x1)."); return; }
      if (m < 1 || m >= n) { toast.error("Lo que paga debe ser MENOR que lo que se lleva (ej. 2x1)."); return; }
      typedFields = { type: "nxm", buy_n: n, pay_m: m };
      successLabel = `Promo ${n}x${m} creada`;
    } else {
      const clean = parsedTiers();
      if (clean.length === 0) { toast.error("Agrega al menos un escalón (ej. 2 piezas → $100)."); return; }
      if (clean.some(t => t.qty < 2)) { toast.error("Cada escalón necesita al menos 2 piezas."); return; }
      if (clean.some(t => t.amount <= 0)) { toast.error("El descuento de cada escalón debe ser mayor a $0."); return; }
      if (new Set(clean.map(t => t.qty)).size !== clean.length) { toast.error("Hay dos escalones con la misma cantidad de piezas."); return; }
      typedFields = { type: "qty_discount", tiers: clean };
      successLabel = "Promo por cantidad creada";
    }

    setSaving(true);
    try {
      const input: ProductPromotionInput = {
        name: name.trim(),
        ...typedFields,
        // Fechas PLANAS (YYYY-MM-DD): el backend las ancla al día completo en
        // la zona del negocio (inicio/fin de día Tijuana) — nunca mandar hora.
        ...(startsAt ? { starts_at: startsAt } : {}),
        ...(endsAt ? { ends_at: endsAt } : {}),
        priority: parseInt(priority, 10) || 0,
        // Admin elige tienda ("" = todas); gerente: el backend fuerza la suya.
        store_id: isAdmin ? (storeSel ? parseInt(storeSel, 10) : null) : (user?.store_id ?? null),
      };
      await createProductPromotion(productId, input);
      toast.success(successLabel);
      setName(""); setBuyN("2"); setPayM("1"); setTiers([{ qty: "2", amount: "" }]);
      setStartsAt(""); setEndsAt(""); setPriority("0");
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
        name: promo.name,
        // Mandar los campos de SU tipo (el backend prohíbe los del otro).
        ...(promo.type === "qty_discount"
          ? { type: "qty_discount" as const, tiers: (promo.tiers ?? []).map(t => ({ qty: t.qty, amount: t.amount })) }
          : { type: "nxm" as const, buy_n: promo.buy_n ?? 2, pay_m: promo.pay_m ?? 1 }),
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
        {!showForm && canManagePromos && (
          <button
            onClick={() => setShowForm(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-widest"
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)", color: "#34d399" }}
          >
            <Plus size={13} /> Nueva promo
          </button>
        )}
      </div>

      {!canManagePromos && (
        <p className="rounded-xl px-3 py-2 text-[10px] font-bold" style={{ background: "var(--td-surface-soft)", border: "1px solid var(--td-card-border)", color: TLO }}>
          Solo lectura — pide al admin el permiso "Gestionar Promociones" en Permisos.
        </p>
      )}

      {showForm && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--td-surface-soft)", border: "1px solid var(--td-card-border)" }}>
          {/* Tipo de promo (2026-07-20): NxM o descuento por cantidad — un
              producto NO puede tener ambas vigentes a la vez (valida el server). */}
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: "nxm" as const, title: "NxM (2x1, 3x2…)", desc: "Se lleva N y paga M" },
              { key: "qty_discount" as const, title: "Descuento por cantidad", desc: "Ej. 2 pzas → −$100" },
            ]).map(t => {
              const active = promoType === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setPromoType(t.key)}
                  className="rounded-xl px-3 py-2 text-left"
                  style={active
                    ? { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.5)" }
                    : { background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)" }}
                >
                  <p className="text-[11px] font-black" style={{ color: active ? "#34d399" : THI }}>{t.title}</p>
                  <p className="text-[9px] font-bold" style={{ color: TLO }}>{t.desc}</p>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Nombre</label>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder={promoType === "nxm" ? "Buen Fin 2x1" : "Descuento por volumen"} style={{ ...inputStyle, marginTop: 4 }} autoFocus />
            </div>
            {promoType === "nxm" ? (
              <>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Se lleva (N)</label>
                  <input type="number" min={2} step={1} value={buyN} onChange={e => setBuyN(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Paga (M)</label>
                  <input type="number" min={1} step={1} value={payM} onChange={e => setPayM(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
                </div>
              </>
            ) : (
              <div className="col-span-2 space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Escalones</label>
                {tiers.map((tier, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="number" min={2} step={1} value={tier.qty}
                      onChange={e => setTiers(prev => prev.map((t, i) => i === idx ? { ...t, qty: e.target.value } : t))}
                      placeholder="Pzas" style={{ ...inputStyle, width: 90 }} aria-label={`Piezas del escalón ${idx + 1}`}
                    />
                    <span className="text-[11px] font-black shrink-0" style={{ color: TMD }}>pzas → −$</span>
                    <input
                      type="number" min={1} step={1} value={tier.amount}
                      onChange={e => setTiers(prev => prev.map((t, i) => i === idx ? { ...t, amount: e.target.value } : t))}
                      placeholder="100" style={{ ...inputStyle }} aria-label={`Descuento del escalón ${idx + 1}`}
                    />
                    {tiers.length > 1 && (
                      <button type="button" onClick={() => setTiers(prev => prev.filter((_, i) => i !== idx))}
                        className="rounded-lg p-1.5 hover:bg-white/10 shrink-0" title="Quitar escalón">
                        <Trash2 size={13} style={{ color: "var(--td-red)" }} />
                      </button>
                    )}
                  </div>
                ))}
                {tiers.length < 5 && (
                  <button type="button" onClick={() => setTiers(prev => [...prev, { qty: "", amount: "" }])}
                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest"
                    style={{ color: "#34d399" }}>
                    <Plus size={12} /> Agregar escalón
                  </button>
                )}
                <p className="text-[9px] font-bold" style={{ color: TLO }}>
                  El descuento se repite por grupos y gana el escalón mayor: con 2→$100 y 3→$400, llevar 5 pzas descuenta $500 (400 + 100).
                </p>
              </div>
            )}
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
          {promoType === "nxm" ? (
            <p className="text-[10px] font-bold" style={{ color: TLO }}>
              Vista rápida: el cliente se lleva <b>{buyN || "N"}</b> y paga <b>{payM || "M"}</b>
              {parseInt(buyN, 10) > parseInt(payM, 10) && parseInt(payM, 10) > 0
                ? ` → ${parseInt(buyN, 10) - parseInt(payM, 10)} gratis por cada ${buyN}.` : "."}
            </p>
          ) : (
            <p className="text-[10px] font-bold" style={{ color: TLO }}>
              Vista rápida: {parsedTiers().filter(t => t.qty >= 2 && t.amount > 0).length > 0
                ? parsedTiers().filter(t => t.qty >= 2 && t.amount > 0).sort((a, b) => a.qty - b.qty)
                    .map(t => `${t.qty} pzas → −$${t.amount}`).join(" · ")
                : "agrega escalones (ej. 2 pzas → −$100)."}
            </p>
          )}
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
                <span
                  className="rounded-xl px-2.5 py-1.5 text-[13px] font-black whitespace-nowrap"
                  style={{ background: "rgba(16,185,129,0.12)", color: "#34d399" }}
                  title={promoTiersLabel(promo)}
                >
                  {promoShortLabel(promo)}
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
                {/* Override local: la LOCAL apaga a la GLOBAL en su tienda */}
                {promo.store_id == null && isLive(promo) && liveLocals.length > 0 && (
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
                    title="En esas tiendas aplica su promo local, no esta global"
                    style={{ color: "#F59E0B", border: "1px solid #F59E0B66", background: "#F59E0B18" }}>
                    {liveLocals.some(l => l.store_id === (user?.store_id ?? null)) && !isAdmin
                      ? "Opacada en tu tienda"
                      : `Opacada en ${new Set(liveLocals.map(l => l.store_id)).size} tienda(s)`}
                  </span>
                )}
                {promo.store_id != null && isLive(promo) && hasLiveGlobal && (
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
                    title="En esta tienda aplica esta promo local en lugar de la global"
                    style={{ color: "#60A5FA", border: "1px solid #60A5FA66", background: "#60A5FA18" }}>
                    Reemplaza a la global
                  </span>
                )}
                {/* "Personalizar para mi tienda" (override local 2026-07-20):
                    crea una variante LOCAL prellenada que REEMPLAZA a la
                    global en la tienda del usuario. */}
                {canManagePromos && promo.store_id == null && !!user?.store_id && promo.status !== "expired" && (
                  <button onClick={() => personalize(promo)} className="rounded-lg p-1.5 hover:bg-white/10"
                    title="Personalizar para mi tienda (crea una promo local que reemplaza a esta en tu sucursal)">
                    <CopyPlus size={14} style={{ color: "#60A5FA" }} />
                  </button>
                )}
                {/* Gerente solo muta promos de SU tienda; las globales o de otra
                    tienda son solo-lectura (se ven para no duplicarlas). */}
                {canManagePromos && (isAdmin || promo.store_id === (user?.store_id ?? null)) && (
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
