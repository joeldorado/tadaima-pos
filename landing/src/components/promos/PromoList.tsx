import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Search, TicketPercent } from "lucide-react";
import {
  deletePromotion, updatePromotion,
  type ProductLight, type ProductPromotionInput, type Promotion,
} from "@tadaima/api";
import type { PickableCategory } from "@/lib/categoryPicker";
import { usePromoCache } from "@/hooks/queries/usePromotions";
import { getTodayLocal } from "@/lib/date";
import { withReactivation } from "@/lib/promoDraft";
import { promoToInput } from "@/lib/promoInput";
import { promoShortLabel } from "@/lib/promoLabel";
import {
  countByChip, filterPromos, sortPromosForList, type PromoChip, type PromoViewer,
} from "@/lib/promoList";
import type { LightPromo } from "@/lib/promoVigentes";
import { AddProductsDialog } from "./AddProductsDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { PromoButton } from "./PromoButton";
import { PromoCard } from "./PromoCard";
import { PromoEditDialog } from "./PromoEditDialog";
import {
  CARD_BG, CARD_BORDER, GREEN, PANEL_BG, PANEL_BORDER, TEXT_HI, TEXT_LO, TEXT_MD, inputStyle, tint,
} from "./promoTokens";

interface PromoListProps {
  /** Las promos que este usuario puede ver (ya filtradas por rol y tienda). */
  promos: readonly Promotion[];
  loading: boolean;
  /** "Ahora" de la lista: lo da la página y se renueva con cada recarga. */
  now: Date;
  viewer: PromoViewer;
  storeNames: ReadonlyMap<number, string>;
  productsById: ReadonlyMap<number, ProductLight>;
  /** Productos activos, para "Agregar productos". */
  pickableProducts: readonly ProductLight[];
  loadingProducts: boolean;
  categories: readonly PickableCategory[];
  onNew: () => void;
  onShare: (product: ProductLight, promo: LightPromo) => void;
}

const CHIPS: ReadonlyArray<{ key: PromoChip; label: string }> = [
  { key: "todas", label: "Todas" },
  { key: "activas", label: "Activas" },
  { key: "pausadas", label: "Pausadas" },
  { key: "vencidas", label: "Terminadas" },
];

const errorMessage = (err: unknown, fallback: string): string =>
  (err as { message?: string }).message ?? fallback;

/**
 * La lista de promos: una tarjeta por promo, con buscador y filtro por estado.
 * Reemplaza las dos pestañas de antes (Gestión / Asignadas a productos).
 */
export function PromoList({
  promos, loading, now, viewer, storeNames, productsById, pickableProducts, loadingProducts, categories, onNew, onShare,
}: PromoListProps) {
  const { applyFresh, invalidate } = usePromoCache();
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<PromoChip>("todas");
  const [editId, setEditId] = useState<number | null>(null);
  const [addId, setAddId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const counts = useMemo(() => countByChip(promos, now), [promos, now]);
  const shown = useMemo(
    () => sortPromosForList(filterPromos(promos, { query, chip, now }), now),
    [promos, query, chip, now],
  );
  // Por id y no por objeto: así el modal siempre ve la versión fresca de la promo.
  const byId = (id: number | null) => promos.find(promo => promo.id === id) ?? null;
  const editing = byId(editId);
  const adding = byId(addId);
  const deleting = byId(deleteId);
  const deletingCount = deleting?.products_count ?? deleting?.products?.length ?? 0;

  const toggleStatus = async (promo: Promotion) => {
    const nextStatus = promo.status === "active" ? "paused" : "active";
    setTogglingId(promo.id);
    try {
      // El PUT reenvía la promo COMPLETA: pausar no debe reconfigurar nada.
      applyFresh(await updatePromotion(promo.id, { ...promoToInput(promo), status: nextStatus }));
      invalidate();
      toast.success(nextStatus === "paused" ? "Promoción pausada" : "Promoción reanudada");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "No se pudo cambiar la promoción"));
    } finally {
      setTogglingId(null);
    }
  };

  const saveEdit = async (input: ProductPromotionInput) => {
    if (!editing) return;
    setSaving(true);
    try {
      applyFresh(await updatePromotion(editing.id, withReactivation(editing, input, getTodayLocal())));
      invalidate();
      toast.success("Cambios guardados");
      setEditId(null);
    } catch (err: unknown) {
      toast.error(errorMessage(err, "No se pudo guardar la promoción"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await deletePromotion(deleting.id);
      invalidate();
      toast.success("Promoción borrada (los tickets ya cobrados no cambian)");
      setDeleteId(null);
    } catch (err: unknown) {
      toast.error(errorMessage(err, "No se pudo borrar la promoción"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-[16px] font-semibold" style={{ color: TEXT_MD }}>
        <Loader2 size={22} className="animate-spin" aria-hidden /> Cargando promociones…
      </div>
    );
  }

  if (promos.length === 0) {
    return (
      <div className="rounded-3xl p-10 text-center" style={{ background: PANEL_BG, border: PANEL_BORDER }}>
        <TicketPercent size={40} className="mx-auto mb-3" style={{ color: TEXT_LO }} aria-hidden />
        <p className="text-[20px] font-black" style={{ color: TEXT_HI }}>
          {viewer.canManage ? "Todavía no hay promociones" : "Hoy no hay promociones en tu tienda"}
        </p>
        {viewer.canManage && (
          <>
            <p className="mx-auto mt-2 max-w-md text-[15px] font-semibold" style={{ color: TEXT_MD }}>
              Crea la primera en tres pasos: qué promo es, qué productos entran y cuándo aplica.
            </p>
            <PromoButton variant="primary" className="mt-5" icon={<Plus size={18} aria-hidden />} onClick={onNew}>
              Crear la primera promoción
            </PromoButton>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="promo-list">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={18} aria-hidden style={{ position: "absolute", left: 14, top: 15, color: TEXT_LO }} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Buscar promo o producto"
            aria-label="Buscar una promo por su nombre o por un producto"
            style={{ ...inputStyle, paddingLeft: 42 }}
            data-testid="promo-search-input"
          />
        </div>
        {viewer.canManage && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
            {CHIPS.map(({ key, label }) => {
              const active = chip === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setChip(key)}
                  className="min-h-11 rounded-xl px-4 text-[14px] font-extrabold"
                  style={active ? { ...tint(GREEN), cursor: "pointer" } : { background: CARD_BG, border: CARD_BORDER, color: TEXT_MD, cursor: "pointer" }}
                  data-testid={`promo-chip-${key}`}
                >
                  {label} ({counts[key]})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-3xl p-8 text-center" style={{ background: PANEL_BG, border: PANEL_BORDER }}>
          <p className="text-[17px] font-extrabold" style={{ color: TEXT_HI }}>Ninguna promo coincide con lo que buscas.</p>
          <PromoButton className="mt-4" onClick={() => { setQuery(""); setChip("todas"); }}>Ver todas las promos</PromoButton>
        </div>
      ) : (
        shown.map(promo => (
          <PromoCard
            key={promo.id}
            promo={promo}
            viewer={viewer}
            now={now}
            storeNames={storeNames}
            productsById={productsById}
            categories={categories}
            toggling={togglingId === promo.id}
            onAddProducts={target => setAddId(target.id)}
            onEdit={target => setEditId(target.id)}
            onToggleStatus={target => void toggleStatus(target)}
            onDelete={target => setDeleteId(target.id)}
            onShare={onShare}
          />
        ))
      )}

      {editing && (
        <PromoEditDialog
          title="Editar promoción"
          subtitle={`${promoShortLabel(editing)} · ${editing.name}`}
          initial={editing}
          saving={saving}
          onSubmit={saveEdit}
          onCancel={() => setEditId(null)}
        />
      )}

      {adding && (
        <AddProductsDialog
          promo={adding}
          products={pickableProducts}
          categories={categories}
          loadingProducts={loadingProducts}
          onClose={() => setAddId(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="¿Borrar esta promoción?"
          confirmLabel="Sí, borrar"
          busyLabel="Borrando…"
          busy={saving}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteId(null)}
          testId="delete-promo-modal"
          confirmTestId="confirm-delete-promo"
        >
          <b>{deleting.name}</b>{" "}
          {deletingCount === 0
            ? "no tiene productos, así que no cambia ningún precio en Caja."
            : <>se va a quitar de <b>{deletingCount.toLocaleString("es-MX")} producto{deletingCount === 1 ? "" : "s"}</b>.</>}{" "}
          Los tickets ya cobrados no cambian. Si solo quieres detenerla un tiempo, mejor usa <b>Pausar</b>.
        </ConfirmDialog>
      )}
    </div>
  );
}
