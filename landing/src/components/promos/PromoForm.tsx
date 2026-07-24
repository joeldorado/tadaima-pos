import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { getStores, type ProductPromotionInput, type Promotion, type Store } from "@tadaima/api";
import { useAuth } from "@tadaima/auth";
import { getTodayLocal } from "@/lib/date";
import { isAdmin as isAdminRole } from "@/lib/permisos";
import { promoDetailLabel } from "@/lib/promoLabel";
import { toDateInput } from "@/lib/promoInput";
import { SingleDatePicker } from "@/components/ui/SingleDatePicker";

const THI = "var(--td-text-hi)";
const TMD = "var(--td-text-md)";
const TLO = "var(--td-text-lo)";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 12,
  border: "1px solid var(--td-input-border)", background: "var(--td-input-bg)",
  color: THI, fontSize: 13, fontWeight: 700, outline: "none", boxSizing: "border-box",
};

interface PromoFormProps {
  /** Promo con la que prellenar (editar o clonar). Omitido = alta en blanco. */
  initial?: Promotion;
  saving?: boolean;
  submitLabel?: string;
  onSubmit: (input: ProductPromotionInput) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Formulario de crear/editar promo (Descuentos v2) — extraído del tab de
 * promos del editor de producto para reusarlo en PromosPage (gestión) y en el
 * propio tab. Controlado: valida y arma el ProductPromotionInput COMPLETO
 * (incluye fechas null — el PUT reenvía la promo entera) y lo entrega en
 * onSubmit; el caller decide si es create o update.
 */
export function PromoForm({ initial, saving = false, submitLabel, onSubmit, onCancel }: PromoFormProps) {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.roles);

  // Tipo de promo: 'nxm' (2x1) | 'qty_discount' = MAYOREO ("desde 5 pzas, −$100 c/u").
  const [promoType, setPromoType] = useState<"nxm" | "qty_discount">(
    initial?.type === "qty_discount" ? "qty_discount" : "nxm");
  const [name, setName] = useState(initial?.name ?? "");
  const [buyN, setBuyN] = useState(String(initial?.buy_n ?? 2));
  const [payM, setPayM] = useState(String(initial?.pay_m ?? 1));
  // Mayoreo (strings para inputs controlados).
  const [minQty, setMinQty] = useState(String(initial?.min_qty ?? 5));
  const [perUnit, setPerUnit] = useState(
    initial?.discount_per_unit != null ? String(initial.discount_per_unit) : "");
  // Restricción de método de pago de la promo (2026-07-24). Si el método no le
  // sirve, BLOQUEA el cobro igual que la restricción del producto.
  const [allowCash, setAllowCash] = useState(initial ? initial.allow_cash !== false : true);
  const [allowCard, setAllowCard] = useState(initial ? initial.allow_card !== false : true);
  const [startsAt, setStartsAt] = useState(initial ? toDateInput(initial.starts_at) : "");
  const [endsAt, setEndsAt] = useState(initial ? toDateInput(initial.ends_at) : "");
  const [priority, setPriority] = useState(String(initial?.priority ?? 0));
  // Tienda de la promo: "" = todas (solo admin). El gerente queda forzado a la
  // suya (el backend lo fuerza igual — esto es solo UI).
  const [storeSel, setStoreSel] = useState<string>(
    initial?.store_id != null ? String(initial.store_id) : "");
  const [stores, setStores] = useState<Store[]>([]);
  useEffect(() => {
    if (isAdmin) { void getStores().then(setStores).catch(() => {}); }
  }, [isAdmin]);

  /** Ejemplo en vivo bajo los inputs del mayoreo — que se vea la cuenta hecha. */
  const mayoreoHint = ((): string => {
    const q = parseInt(minQty, 10) || 0;
    const d = parseFloat(perUnit) || 0;
    if (q < 2 || d <= 0) {
      return "Desde N piezas, CADA pieza baja $X. Abajo de N no aplica nada.";
    }
    const ejemplo = q + 2;
    return `Llevar ${q} pzas descuenta $${(q * d).toLocaleString("es-MX")}; ${ejemplo} pzas descuenta $${(ejemplo * d).toLocaleString("es-MX")}. Con ${q - 1} o menos no aplica.`;
  })();

  const submit = async () => {
    if (!name.trim()) { toast.error("Ponle nombre a la promo (ej. Buen Fin)."); return; }

    let typedFields: Partial<ProductPromotionInput> = {};
    if (promoType === "nxm") {
      const n = parseInt(buyN, 10) || 0;
      const m = parseInt(payM, 10) || 0;
      if (n < 2) { toast.error("Una promo NxM necesita al menos 2 piezas (ej. 2x1)."); return; }
      if (m < 1 || m >= n) { toast.error("Lo que paga debe ser MENOR que lo que se lleva (ej. 2x1)."); return; }
      typedFields = { type: "nxm", buy_n: n, pay_m: m };
    } else {
      const q = parseInt(minQty, 10) || 0;
      const d = parseFloat(perUnit) || 0;
      if (q < 2) { toast.error("El mayoreo arranca desde 2 piezas en adelante."); return; }
      if (d <= 0) { toast.error("Pon cuánto se le descuenta a cada pieza (ej. $100)."); return; }
      typedFields = { type: "qty_discount", min_qty: q, discount_per_unit: d };
    }

    if (!allowCash && !allowCard) {
      toast.error("Marca al menos un método de pago para la promoción.");
      return;
    }

    const input: ProductPromotionInput = {
      name: name.trim(),
      ...typedFields,
      allow_cash: allowCash,
      allow_card: allowCard,
      // Fechas PLANAS (YYYY-MM-DD): el backend las ancla al día completo en la
      // zona del negocio. SIEMPRE van (null = sin fecha): el PUT reenvía la
      // promo completa y omitirlas borraría la vigencia sin querer.
      starts_at: startsAt || null,
      ends_at: endsAt || null,
      priority: parseInt(priority, 10) || 0,
      // Admin elige tienda ("" = todas); gerente: el backend fuerza la suya.
      store_id: isAdmin ? (storeSel ? parseInt(storeSel, 10) : null) : (user?.store_id ?? null),
    };
    await onSubmit(input);
  };

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--td-surface-soft)", border: "1px solid var(--td-card-border)" }}>
      {/* Tipo de promo: NxM o mayoreo — un producto NO puede tener ambas
          vigentes a la vez (lo valida el server al asignar). */}
      <div className="grid grid-cols-2 gap-2">
        {([
          { key: "nxm" as const, title: "NxM (2x1, 3x2…)", desc: "Se lleva N y paga M" },
          { key: "qty_discount" as const, title: "Mayoreo", desc: "Desde N pzas, −$X a cada una" },
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
          <>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>A partir de (pzas)</label>
              <input
                type="number" min={2} step={1} value={minQty}
                onChange={e => setMinQty(e.target.value)}
                placeholder="5" style={{ ...inputStyle, marginTop: 4 }}
                aria-label="A partir de cuántas piezas aplica el mayoreo"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>Descuento c/pieza</label>
              <input
                type="number" min={1} step={1} value={perUnit}
                onChange={e => setPerUnit(e.target.value)}
                placeholder="100" style={{ ...inputStyle, marginTop: 4 }}
                aria-label="Cuánto se le descuenta a cada pieza"
              />
            </div>
            <p className="col-span-2 text-[9px] font-bold" style={{ color: TLO }}>
              {mayoreoHint}
            </p>
          </>
        )}

        {/* Restricción de pago de la promo. Si el método de cobro no le sirve,
            BLOQUEA la venta (igual que la restricción del producto) — por eso
            el aviso de abajo es explícito. */}
        <div className="col-span-2">
          <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: TLO }}>
            Se puede pagar con
          </label>
          <div className="mt-1.5 flex flex-wrap gap-4">
            {([
              { key: "cash" as const, label: "Efectivo", val: allowCash, set: setAllowCash },
              { key: "card" as const, label: "Tarjeta", val: allowCard, set: setAllowCard },
            ]).map(o => (
              <label key={o.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={o.val}
                  onChange={e => o.set(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: "#34d399", cursor: "pointer" }}
                />
                <span className="text-[11px] font-black" style={{ color: o.val ? THI : TLO }}>{o.label}</span>
              </label>
            ))}
          </div>
          {(!allowCash || !allowCard) && (
            <p className="mt-1 text-[9px] font-bold" style={{ color: "#fbbf24" }}>
              Ojo: con esta promo aplicada, la venta <b>no se podrá cobrar</b> con{" "}
              {!allowCash ? "efectivo" : "tarjeta"}. El cajero verá el aviso y podrá cobrar sin la promo.
            </p>
          )}
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
      {promoType === "nxm" ? (
        <p className="text-[10px] font-bold" style={{ color: TLO }}>
          Vista rápida: el cliente se lleva <b>{buyN || "N"}</b> y paga <b>{payM || "M"}</b>
          {parseInt(buyN, 10) > parseInt(payM, 10) && parseInt(payM, 10) > 0
            ? ` → ${parseInt(buyN, 10) - parseInt(payM, 10)} gratis por cada ${buyN}.` : "."}
        </p>
      ) : (
        <p className="text-[10px] font-bold" style={{ color: TLO }}>
          Vista rápida: {promoDetailLabel({
            type: "qty_discount",
            min_qty: parseInt(minQty, 10) || null,
            discount_per_unit: parseFloat(perUnit) || null,
          })}
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-xl px-4 py-2 text-[11px] font-black uppercase"
          style={{ border: "1px solid var(--td-input-border)", color: TMD, background: "transparent" }}>
          Cancelar
        </button>
        <button onClick={() => void submit()} disabled={saving}
          className="flex-1 rounded-xl px-4 py-2 text-[11px] font-black uppercase disabled:opacity-40"
          style={{ background: "#10b981", color: "#04120c", border: "none" }}>
          {saving ? "Guardando…" : (submitLabel ?? "Guardar promo")}
        </button>
      </div>
    </div>
  );
}

interface PromoFormModalProps extends PromoFormProps {
  title: string;
  subtitle?: string;
}

/** Envoltura modal del PromoForm — misma capa glass que el resto de modales. */
export function PromoFormModal({ title, subtitle, onCancel, ...formProps }: PromoFormModalProps) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }} onClick={onCancel} />
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl p-5"
        style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}
        data-testid="promo-form-modal">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-[15px] font-black" style={{ color: THI }}>{title}</h3>
            {subtitle && (
              <p className="text-[10px] font-bold mt-0.5" style={{ color: TLO }}>{subtitle}</p>
            )}
          </div>
          <button onClick={onCancel} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Cerrar">
            <X size={16} style={{ color: TLO }} />
          </button>
        </div>
        <PromoForm {...formProps} onCancel={onCancel} />
      </div>
    </div>
  );
}
