import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2, Pause, Pencil, Play, Plus, PackagePlus, Store as StoreIcon, Trash2,
} from "lucide-react";
import {
  createPromotion, deletePromotion, updatePromotion, getPromotions,
  type ProductPromotionInput, type Promotion, type Store,
} from "@tadaima/api";
import { useAuth } from "@tadaima/auth";
import { queryKeys } from "@/lib/queryKeys";
import { useStoresQuery } from "@/hooks/queries/useStores";
import { isAdmin as isAdminRole, isManager as isManagerRole } from "@/lib/permisos";
import { isPromoSinConfigurar, promoDetailLabel, promoShortLabel } from "@/lib/promoLabel";
import { promoToInput, toDateInput } from "@/lib/promoInput";
import { PromoFormModal } from "./PromoForm";
import { AssignProductsModal } from "./AssignProductsModal";

const PANEL  = "var(--td-panel-bg)";
const BORDER = "1px solid var(--td-panel-border)";
const THI = "var(--td-text-hi)";
const TMD = "var(--td-text-md)";
const TLO = "var(--td-text-lo)";

const STATUS_META: Record<Promotion["status"], { label: string; color: string }> = {
  active:  { label: "Activa",  color: "#34d399" },
  paused:  { label: "Pausada", color: "#F59E0B" },
  expired: { label: "Vencida", color: "#9CA3AF" },
};

type FormState = { mode: "create" } | { mode: "edit"; promo: Promotion };

/**
 * Gestión de promociones GENERALES (2026-07-25): las promos ya no cuelgan de
 * un producto — se crean aquí y se asignan a 1..N productos. Visible solo para
 * admin/gerente con permiso "Gestionar Promociones"; el gerente solo muta las
 * de SU tienda (las globales las gestiona el admin — el server devuelve 403).
 */
export function PromoAdminSection() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.roles);
  const isGerente = isManagerRole(user?.roles);
  // Permiso "Gestionar Promociones": default TRUE; el admin lo revoca por
  // usuario en Permisos. `!== false` porque undefined = true. (Mismo gate que
  // el tab de promos del editor de producto.)
  const canManagePromos = isAdmin || user?.can_manage_promos !== false;
  const visible = (isAdmin || isGerente) && canManagePromos;

  const promosQuery = useQuery({
    queryKey: queryKeys.promotions.admin(),
    queryFn: getPromotions,
    enabled: visible,
  });
  const storesQuery = useStoresQuery({ enabled: visible && isAdmin });
  const storeName = (id: number | null | undefined): string => {
    if (id == null) return "Global (todas las tiendas)";
    if (!isAdmin) return id === (user?.store_id ?? null) ? "Tu tienda" : "Otra tienda";
    return (storesQuery.data as Store[] | undefined)?.find(s => s.id === id)?.name ?? `Tienda #${id}`;
  };

  const [formState, setFormState] = useState<FormState | null>(null);
  const [assignPromo, setAssignPromo] = useState<Promotion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);
  const [saving, setSaving] = useState(false);

  // Las promos viajan embebidas en los productos (active_promotions): al mutar
  // se invalida también el namespace de products para que Caja se entere.
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.promotions.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
  };

  if (!visible) return null;

  // Gerente solo muta promos de SU tienda; globales/otra tienda = solo lectura.
  const canMutate = (promo: Promotion): boolean =>
    isAdmin || (promo.store_id != null && promo.store_id === (user?.store_id ?? null));

  const handleSubmit = async (input: ProductPromotionInput) => {
    if (!formState) return;
    setSaving(true);
    try {
      if (formState.mode === "create") {
        await createPromotion(input);
        toast.success("Promoción creada — ahora asígnale productos.");
      } else {
        await updatePromotion(formState.promo.id, input);
        toast.success("Promoción actualizada");
      }
      setFormState(null);
      invalidate();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo guardar la promoción");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (promo: Promotion) => {
    const next = promo.status === "active" ? "paused" : "active";
    try {
      // El PUT reenvía la promo COMPLETA: pausar no debe reconfigurar nada.
      await updatePromotion(promo.id, { ...promoToInput(promo), status: next });
      toast.success(next === "paused" ? "Promoción pausada" : "Promoción reanudada");
      invalidate();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo actualizar");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deletePromotion(deleteTarget.id);
      toast.success("Promoción eliminada (los tickets pasados no cambian)");
      setDeleteTarget(null);
      invalidate();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo eliminar");
    } finally {
      setSaving(false);
    }
  };

  const promos = promosQuery.data ?? [];

  return (
    <section className="rounded-3xl p-5 mt-5" style={{ background: PANEL, border: BORDER }} data-testid="promo-admin-section">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[13px] font-black uppercase tracking-widest" style={{ color: THI }}>
            Gestión de promociones
          </h2>
          <p className="text-[10px] font-bold mt-0.5" style={{ color: TMD }}>
            La promo es independiente: créala aquí y asígnala a uno o varios productos.
            {!isAdmin && " Solo puedes modificar promos de tu tienda; las globales las gestiona el admin."}
          </p>
        </div>
        <button
          onClick={() => setFormState({ mode: "create" })}
          data-testid="new-promo-btn"
          className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-widest"
          style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)", color: "#34d399", cursor: "pointer" }}
        >
          <Plus size={13} /> Nueva promoción
        </button>
      </div>

      {promosQuery.isLoading ? (
        <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin" style={{ color: TLO }} /></div>
      ) : promos.length === 0 ? (
        <p className="py-5 text-center text-[11px] font-bold" style={{ color: TLO }}>
          Sin promociones — crea la primera con "Nueva promoción".
        </p>
      ) : (
        <div className="space-y-2">
          {promos.map(promo => {
            // "Activa" con inicio FUTURO aún no aplica en Caja → "Programada".
            const isScheduled = promo.status === "active" && !!promo.starts_at && new Date(promo.starts_at) > new Date();
            const sinConfigurar = isPromoSinConfigurar(promo);
            const meta = sinConfigurar
              ? { label: "Sin configurar · edítala o bórrala", color: "#FF8A80" }
              : isScheduled
                ? { label: `Programada · inicia ${toDateInput(promo.starts_at)}`, color: "#60A5FA" }
                : STATUS_META[promo.status];
            const nProductos = promo.products_count ?? promo.products?.length ?? 0;
            const mutable = canMutate(promo);
            return (
              <div key={promo.id} className="flex items-center gap-3 rounded-2xl px-4 py-3 flex-wrap"
                style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", opacity: promo.status === "expired" ? 0.55 : 1 }}
                data-testid={`promo-row-${promo.id}`}>
                <span
                  className="rounded-xl px-2.5 py-1.5 text-[13px] font-black whitespace-nowrap"
                  style={sinConfigurar
                    ? { background: "rgba(224,34,26,0.12)", color: "#FF8A80" }
                    : { background: "rgba(16,185,129,0.12)", color: "#34d399" }}
                  title={promoDetailLabel(promo)}
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
                    <StoreIcon size={9} /> {storeName(promo.store_id)}
                  </p>
                </div>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
                  style={{ color: meta.color, border: `1px solid ${meta.color}66`, background: `${meta.color}18` }}>
                  {meta.label}
                </span>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
                  title={(promo.products ?? []).map(p => p.name).join(", ") || "Sin productos asignados"}
                  style={{ color: nProductos > 0 ? "#60A5FA" : TLO, border: `1px solid ${nProductos > 0 ? "#60A5FA66" : "var(--td-card-border)"}`, background: nProductos > 0 ? "#60A5FA18" : "transparent" }}>
                  {nProductos} producto{nProductos === 1 ? "" : "s"}
                </span>
                {mutable && (
                  <>
                    <button onClick={() => setAssignPromo(promo)} className="rounded-lg p-1.5 hover:bg-white/10"
                      title="Asignar / quitar productos" data-testid={`assign-promo-${promo.id}`}>
                      <PackagePlus size={14} style={{ color: "#60A5FA" }} />
                    </button>
                    <button onClick={() => setFormState({ mode: "edit", promo })} className="rounded-lg p-1.5 hover:bg-white/10"
                      title="Editar promoción" data-testid={`edit-promo-${promo.id}`}>
                      <Pencil size={14} style={{ color: TMD }} />
                    </button>
                    {promo.status !== "expired" && (
                      <button onClick={() => void toggleStatus(promo)} className="rounded-lg p-1.5 hover:bg-white/10 disabled:opacity-30"
                        disabled={sinConfigurar}
                        title={sinConfigurar
                          ? "Le faltan los datos del mayoreo: edítala primero"
                          : promo.status === "active" ? "Pausar" : "Reanudar"}>
                        {promo.status === "active" ? <Pause size={14} style={{ color: "#F59E0B" }} /> : <Play size={14} style={{ color: "#34d399" }} />}
                      </button>
                    )}
                    <button onClick={() => setDeleteTarget(promo)} className="rounded-lg p-1.5 hover:bg-white/10"
                      title="Eliminar promoción" data-testid={`delete-promo-${promo.id}`}>
                      <Trash2 size={14} style={{ color: "var(--td-red)" }} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal crear/editar */}
      {formState && (
        <PromoFormModal
          title={formState.mode === "create" ? "Nueva promoción" : "Editar promoción"}
          subtitle={formState.mode === "create"
            ? "Se crea sin productos — asígnalos después con el botón azul."
            : `${promoShortLabel(formState.promo)} · ${formState.promo.name}`}
          {...(formState.mode === "edit" ? { initial: formState.promo } : {})}
          saving={saving}
          submitLabel={formState.mode === "create" ? "Crear promo" : "Guardar cambios"}
          onSubmit={handleSubmit}
          onCancel={() => setFormState(null)}
        />
      )}

      {/* Modal asignar productos */}
      {assignPromo && (
        <AssignProductsModal
          promo={assignPromo}
          onClose={() => setAssignPromo(null)}
          onChanged={() => invalidate()}
        />
      )}

      {/* Confirmación de borrado — dice a cuántos productos está asignada */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }} onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm rounded-3xl p-5" style={{ background: PANEL, border: BORDER }} data-testid="delete-promo-modal">
            <h3 className="text-[14px] font-black" style={{ color: THI }}>¿Eliminar esta promoción?</h3>
            <p className="text-[11px] font-bold mt-2" style={{ color: TMD }}>
              <b>{promoShortLabel(deleteTarget)} · {deleteTarget.name}</b> está asignada a{" "}
              <b>{deleteTarget.products_count ?? deleteTarget.products?.length ?? 0} producto(s)</b> — se quitará de todos.
              Los tickets ya cobrados no cambian.
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl px-4 py-2 text-[11px] font-black uppercase"
                style={{ border: "1px solid var(--td-input-border)", color: TMD, background: "transparent" }}>
                Cancelar
              </button>
              <button onClick={() => void confirmDelete()} disabled={saving}
                className="flex-1 rounded-xl px-4 py-2 text-[11px] font-black uppercase disabled:opacity-40"
                style={{ background: "var(--td-red, #E0221A)", color: "#fff", border: "none" }}
                data-testid="confirm-delete-promo">
                {saving ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
