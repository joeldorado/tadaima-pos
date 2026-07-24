import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown, CopyPlus, Loader2, Plus, Store as StoreIcon, TicketPercent, Unlink,
} from "lucide-react";
import {
  attachPromotionProducts, createPromotion, detachPromotionProduct,
  getProductPromotions, getPromotions, getStores,
  type ProductPromotion, type ProductPromotionInput, type Promotion, type Store,
} from "@tadaima/api";
import { useAuth } from "@tadaima/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getTodayLocal } from "@/lib/date";
import { isAdmin as isAdminRole } from "@/lib/permisos";
import { isPromoSinConfigurar, promoDetailLabel, promoShortLabel } from "@/lib/promoLabel";
import { toDateInput } from "@/lib/promoInput";
import { PromoFormModal } from "@/components/promos/PromoForm";

interface Props {
  /** null = producto nuevo sin guardar → el tab BUFFEREA las selecciones. */
  productId: number | null;
  /** Promos elegidas con el producto AÚN sin guardar (se asignan al crear). */
  pendingPromoIds?: number[];
  onPendingPromosChange?: (ids: number[]) => void;
}

const THI = "var(--td-text-hi)";
const TMD = "var(--td-text-md)";
const TLO = "var(--td-text-lo)";

const STATUS_META: Record<ProductPromotion["status"], { label: string; color: string }> = {
  active:  { label: "Activa",  color: "#34d399" },
  paused:  { label: "Pausada", color: "#F59E0B" },
  expired: { label: "Vencida", color: "#9CA3AF" },
};

type FormState = { title: string; subtitle?: string; initial?: Promotion } | null;

/**
 * 4ª pestaña del editor de producto — desde 2026-07-25 es un PICKER: las promos
 * son entidades GENERALES (se crean/editan/pausan en el menú Promos) y aquí
 * solo se ASIGNAN o QUITAN de este producto. Con el producto aún sin guardar
 * (productId == null) las selecciones se bufferean y ProductsPage las asigna
 * después del create.
 */
export function ProductPromotionsTab({ productId, pendingPromoIds = [], onPendingPromosChange }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.roles);
  // Permiso "Gestionar Promociones" (2026-07-18): default TRUE; el admin lo
  // revoca por usuario en Permisos. `!== false` porque undefined = true.
  const canManagePromos = isAdmin || user?.can_manage_promos !== false;

  const [promotions, setPromotions] = useState<ProductPromotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [formState, setFormState] = useState<FormState>(null);

  const [stores, setStores] = useState<Store[]>([]);
  useEffect(() => {
    if (isAdmin) { void getStores().then(setStores).catch(() => {}); }
  }, [isAdmin]);
  const storeName = (id: number | null | undefined): string =>
    id == null ? "Todas las tiendas" : (stores.find(s => s.id === id)?.name ?? `Tienda #${id}`);

  // Catálogo COMPLETO de promos generales — para el picker y el buffer.
  // Misma key que la sección de gestión de PromosPage: comparten cache.
  const allPromosQuery = useQuery({
    queryKey: queryKeys.promotions.admin(),
    queryFn: getPromotions,
  });
  const allPromos = useMemo(() => allPromosQuery.data ?? [], [allPromosQuery.data]);

  // Override local (2026-07-20): una promo LOCAL viva apaga a la GLOBAL en su
  // tienda (el motor de Caja ya lo aplica) — aquí solo se señaliza.
  const isLive = (p: ProductPromotion): boolean =>
    p.status === "active" && (!p.ends_at || new Date(p.ends_at) >= new Date());
  const liveLocals = promotions.filter(p => isLive(p) && p.store_id != null);
  const hasLiveGlobal = promotions.some(p => isLive(p) && p.store_id == null);

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

  // Las promos viajan embebidas en los productos: invalidar ambos namespaces
  // para que Caja y la gestión de PromosPage se enteren.
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.promotions.all });
  };

  // Gerente solo muta promos de SU tienda (el server 403ea las demás).
  const canMutate = (promo: { store_id?: number | null }): boolean =>
    isAdmin || (promo.store_id != null && promo.store_id === (user?.store_id ?? null));

  const assignedIds = useMemo(
    () => new Set(promotions.map(p => p.id)),
    [promotions],
  );

  /** Promos asignables desde el picker: ni asignadas ni ya buffereadas; el
   *  gerente solo ve las de su tienda (las globales las asigna el admin). */
  const assignable = useMemo(
    () => allPromos.filter(p =>
      !assignedIds.has(p.id)
      && !pendingPromoIds.includes(p.id)
      && p.status !== "expired"
      && canMutate(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPromos, assignedIds, pendingPromoIds, isAdmin, user?.store_id],
  );

  /** Buffer (producto sin guardar): las promos elegidas, resueltas del catálogo. */
  const pendingPromos = useMemo(
    () => pendingPromoIds
      .map(id => allPromos.find(p => p.id === id))
      .filter((p): p is Promotion => p != null),
    [pendingPromoIds, allPromos],
  );

  const attachExisting = async (promo: Promotion) => {
    if (productId == null) {
      onPendingPromosChange?.([...pendingPromoIds, promo.id]);
      setShowPicker(false);
      toast.success(`"${promo.name}" se asignará al guardar el producto`);
      return;
    }
    setSaving(true);
    try {
      await attachPromotionProducts(promo.id, [productId]);
      toast.success(`Promoción "${promo.name}" asignada`);
      setShowPicker(false);
      await reload(productId);
      invalidate();
    } catch (err: unknown) {
      const e = err as { message?: string; errors?: Record<string, string[]> };
      const detail = e.errors ? Object.values(e.errors).flat().join(" · ") : "";
      toast.error(detail || e.message || "No se pudo asignar la promoción");
    } finally {
      setSaving(false);
    }
  };

  const detach = async (promo: ProductPromotion) => {
    if (productId == null) return;
    try {
      await detachPromotionProduct(promo.id, productId);
      toast.success("Promoción quitada del producto (la promo sigue existiendo)");
      await reload(productId);
      invalidate();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo quitar la promoción");
    }
  };

  /** Crea la promo GENERAL y la asigna a este producto (o la bufferea). */
  const handleCreate = async (input: ProductPromotionInput) => {
    setSaving(true);
    try {
      const created = await createPromotion(input);
      if (productId == null) {
        onPendingPromosChange?.([...pendingPromoIds, created.id]);
        toast.success("Promo creada — se asignará al guardar el producto");
        setFormState(null);
        invalidate();
        return;
      }
      try {
        await attachPromotionProducts(created.id, [productId]);
        toast.success("Promo creada y asignada al producto");
        await reload(productId);
      } catch (err: unknown) {
        const e = err as { message?: string; errors?: Record<string, string[]> };
        const detail = e.errors ? Object.values(e.errors).flat().join(" · ") : "";
        toast.error(`La promo se creó pero no se pudo asignar: ${detail || e.message || "conflicto"}. Asígnala desde el menú Promos.`);
      }
      setFormState(null);
      invalidate();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo crear la promoción");
    } finally {
      setSaving(false);
    }
  };

  /** "Personalizar para mi tienda" (override local 2026-07-20): clona la promo
   *  GLOBAL como promo general LOCAL de la tienda del usuario y la asigna a
   *  ESTE producto — el motor sigue apagando la global por store_id. */
  const personalize = (promo: ProductPromotion) => {
    // Inicio en el pasado no se puede re-elegir en el picker (minValue hoy):
    // null = empieza ya. El vencimiento sí se conserva.
    const startsInput = toDateInput(promo.starts_at);
    const clone: Promotion = {
      ...promo,
      name: `${promo.name} · local`.slice(0, 100),
      store_id: user?.store_id ?? null,
      starts_at: startsInput > getTodayLocal() ? promo.starts_at : null,
    };
    setFormState({
      title: "Personalizar para mi tienda",
      subtitle: "Crea una promo local que reemplaza a la global en tu sucursal.",
      initial: clone,
    });
  };

  const renderScope = (promo: { store_id?: number | null }) => (
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
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] font-bold" style={{ color: TMD }}>
          {productId == null
            ? <>Elige las promos de este producto — se <b>asignarán al guardar</b>. Las promos se crean y editan en el menú <b>Promos</b>.</>
            : <>En caja aplica sola la <b>mejor</b> promo vigente. Las promos se crean, pausan y editan en el menú <b>Promos</b> — aquí solo se asignan a este producto.</>}
        </p>
        {canManagePromos && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setShowPicker(v => !v)}
              data-testid="assign-existing-promo-btn"
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-widest"
              style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.4)", color: "#60A5FA" }}
            >
              <TicketPercent size={13} /> Asignar promo existente <ChevronDown size={12} style={{ transform: showPicker ? "rotate(180deg)" : "none" }} />
            </button>
            <button
              onClick={() => setFormState({ title: "Nueva promoción", subtitle: "Se crea como promo general y se asigna a este producto." })}
              data-testid="create-promo-btn"
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-widest"
              style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)", color: "#34d399" }}
            >
              <Plus size={13} /> Nueva promo
            </button>
          </div>
        )}
      </div>

      {!canManagePromos && (
        <p className="rounded-xl px-3 py-2 text-[10px] font-bold" style={{ background: "var(--td-surface-soft)", border: "1px solid var(--td-card-border)", color: TLO }}>
          Solo lectura — pide al admin el permiso "Gestionar Promociones" en Permisos.
        </p>
      )}

      {/* Picker de promos existentes */}
      {showPicker && canManagePromos && (
        <div className="rounded-2xl p-3 space-y-1.5" style={{ background: "var(--td-surface-soft)", border: "1px solid var(--td-card-border)" }} data-testid="promo-picker">
          {allPromosQuery.isLoading ? (
            <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin" style={{ color: TLO }} /></div>
          ) : assignable.length === 0 ? (
            <p className="py-2 text-center text-[11px] font-bold" style={{ color: TLO }}>
              No hay promos disponibles para asignar
              {!isAdmin ? " (las globales las asigna el admin)" : ""} — crea una con "Nueva promo".
            </p>
          ) : (
            assignable.map(promo => (
              <button
                key={promo.id}
                onClick={() => void attachExisting(promo)}
                disabled={saving}
                data-testid={`pick-promo-${promo.id}`}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5 disabled:opacity-40"
                style={{ border: "1px solid var(--td-card-border)", background: "var(--td-card-bg)" }}
              >
                <span className="rounded-lg px-2 py-1 text-[12px] font-black whitespace-nowrap"
                  style={{ background: "rgba(16,185,129,0.12)", color: "#34d399" }}
                  title={promoDetailLabel(promo)}>
                  {promoShortLabel(promo)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-black" style={{ color: THI }}>{promo.name}</span>
                  <span className="block text-[9px] font-bold" style={{ color: TLO }}>
                    {promo.store_id == null ? "Todas las tiendas" : (isAdmin ? storeName(promo.store_id) : "Tu tienda")}
                    {" · "}{STATUS_META[promo.status].label.toLowerCase()}
                    {" · "}{promo.products_count ?? promo.products?.length ?? 0} producto(s)
                  </span>
                </span>
                <Plus size={14} style={{ color: "#60A5FA" }} />
              </button>
            ))
          )}
        </div>
      )}

      {/* Producto SIN guardar: buffer de promos pendientes */}
      {productId == null ? (
        pendingPromos.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: "var(--td-surface-soft)", border: "1px solid var(--td-card-border)" }}>
            <TicketPercent size={22} className="mx-auto mb-2" style={{ color: TLO }} />
            <p className="text-[12px] font-bold" style={{ color: TMD }}>
              Sin promos elegidas — asigna una existente o crea una nueva; se aplicarán en cuanto guardes el producto.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="rounded-xl px-3 py-2 text-[10px] font-bold" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.3)", color: "#60A5FA" }}>
              Estas promos se asignarán automáticamente al guardar el producto.
            </p>
            {pendingPromos.map(promo => (
              <div key={promo.id} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}
                data-testid={`pending-promo-${promo.id}`}>
                <span className="rounded-xl px-2.5 py-1.5 text-[13px] font-black whitespace-nowrap"
                  style={{ background: "rgba(16,185,129,0.12)", color: "#34d399" }}
                  title={promoDetailLabel(promo)}>
                  {promoShortLabel(promo)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-black" style={{ color: THI }}>{promo.name}</p>
                  {renderScope(promo)}
                </div>
                <button
                  onClick={() => onPendingPromosChange?.(pendingPromoIds.filter(id => id !== promo.id))}
                  className="rounded-lg p-1.5 hover:bg-white/10"
                  title="Quitar de la lista (no se asignará)">
                  <Unlink size={14} style={{ color: "var(--td-red)" }} />
                </button>
              </div>
            ))}
          </div>
        )
      ) : loading ? (
        <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin" style={{ color: TLO }} /></div>
      ) : promotions.length === 0 ? (
        <p className="py-6 text-center text-[11px] font-bold" style={{ color: TLO }}>
          Este producto no tiene promociones — asigna una existente o crea una nueva.
        </p>
      ) : (
        <div className="space-y-2">
          {promotions.map(promo => {
            // "Activa" con fecha de inicio FUTURA aún no aplica en Caja ni sale
            // en Promos → mostrar "Programada" para no confundir (QA 2026-07-16).
            const isScheduled = promo.status === "active" && !!promo.starts_at && new Date(promo.starts_at) > new Date();
            const sinConfigurar = isPromoSinConfigurar(promo);
            const meta = sinConfigurar
              ? { label: "Sin configurar · edítala en Promos", color: "#FF8A80" }
              : isScheduled
                ? { label: `Programada · inicia ${toDateInput(promo.starts_at)}`, color: "#60A5FA" }
                : STATUS_META[promo.status];
            return (
              <div key={promo.id} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", opacity: promo.status === "expired" ? 0.55 : 1 }}>
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
                  {renderScope(promo)}
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
                {/* "Personalizar para mi tienda": clona la GLOBAL como promo
                    general LOCAL que la reemplaza en la sucursal del usuario. */}
                {canManagePromos && promo.store_id == null && !!user?.store_id && promo.status !== "expired" && (
                  <button onClick={() => personalize(promo)} className="rounded-lg p-1.5 hover:bg-white/10"
                    title="Personalizar para mi tienda (crea una promo local que reemplaza a esta en tu sucursal)">
                    <CopyPlus size={14} style={{ color: "#60A5FA" }} />
                  </button>
                )}
                {/* Quitar = des-asignar de ESTE producto; la promo sigue viva.
                    Gerente solo con promos de SU tienda (server 403ea el resto). */}
                {canManagePromos && canMutate(promo) && (
                  <button onClick={() => void detach(promo)} className="rounded-lg p-1.5 hover:bg-white/10"
                    title="Quitar de este producto (la promoción no se borra)"
                    data-testid={`detach-promo-${promo.id}`}>
                    <Unlink size={14} style={{ color: "var(--td-red)" }} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal crear/personalizar (PromoForm compartido con PromosPage) */}
      {formState && (
        <PromoFormModal
          title={formState.title}
          {...(formState.subtitle ? { subtitle: formState.subtitle } : {})}
          {...(formState.initial ? { initial: formState.initial } : {})}
          saving={saving}
          submitLabel="Crear promo"
          onSubmit={handleCreate}
          onCancel={() => setFormState(null)}
        />
      )}
    </div>
  );
}
