import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { Plus, RefreshCw, TicketPercent, Tv } from "lucide-react";
import { getProductsLight, type ProductLight } from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";
import { useCategoriesQuery } from "@/hooks/queries/useCategories";
import { usePromoViewer, usePromotionsQuery } from "@/hooks/queries/usePromotions";
import { useStoresQuery } from "@/hooks/queries/useStores";
import { visiblePromosFor } from "@/lib/promoList";
import { vigentesPorProducto, type LightPromo } from "@/lib/promoVigentes";
import { PromoButton } from "@/components/promos/PromoButton";
import { PromoList } from "@/components/promos/PromoList";
import { PromoWizard } from "@/components/promos/PromoWizard";
import { ShareBannerModal } from "@/components/promos/ShareBannerModal";
import { TvMode } from "@/components/promos/TvMode";

const NO_PRODUCTS: ProductLight[] = [];

/** Falla de carga: se dice claro y se ofrece reintentar (nunca "no hay promos"). */
function LoadError({ message, retrying, onRetry }: { message: string; retrying: boolean; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3"
      style={{ background: "rgba(224,34,26,0.10)", border: "1px solid rgba(224,34,26,0.4)" }}
    >
      <p className="text-[15px] font-bold" style={{ color: "var(--td-text-hi)" }}>{message}</p>
      <PromoButton icon={<RefreshCw size={16} aria-hidden />} loading={retrying} onClick={onRetry}>
        Reintentar
      </PromoButton>
    </div>
  );
}

/**
 * Promos (rediseño 2026-10): UNA lista de promos en tarjetas, con sus
 * productos desplegables, y un asistente de 3 pasos para crear la promo ya con
 * productos (por categoría o buscando). Todos los roles ven la misma lista; los
 * botones de modificar solo salen a quien puede (el server valida igual).
 */
export function PromosPage() {
  const viewer = usePromoViewer();
  const promosQuery = usePromotionsQuery();
  const categoriesQuery = useCategoriesQuery();
  const storesQuery = useStoresQuery({ enabled: viewer.isAdmin });

  // Productos light SIN store_id: el embed de promos viene sin filtrar por
  // tienda y el scoping se hace aquí. El sufijo 'global' evita chocar con las
  // keys store-scoped de Caja (le daría promos de otras sucursales). Cuelga de
  // products.all para que la invalidación de promos la alcance.
  const productsQuery = useQuery({
    queryKey: [...queryKeys.products.all, "light", "promos", "global"],
    queryFn: () => getProductsLight(),
    staleTime: 30_000,
  });

  const products = productsQuery.data?.data ?? NO_PRODUCTS;
  const productsById = useMemo(() => new Map(products.map(product => [product.id, product])), [products]);
  const pickableProducts = useMemo(() => products.filter(product => product.active), [products]);
  const categories = categoriesQuery.data ?? [];
  const storeNames = useMemo(
    () => new Map((storesQuery.data ?? []).map(store => [store.id, store.name])),
    [storesQuery.data],
  );

  // "Ahora" se renueva con cada recarga de promos (botón Actualizar o tras
  // guardar): así una promo programada que ya empezó, o una que ya venció,
  // cambia de estado sin tener que recargar la pestaña.
  const [mountedAt] = useState(() => Date.now());
  const promosUpdatedAt = promosQuery.dataUpdatedAt || mountedAt;
  const now = useMemo(() => new Date(promosUpdatedAt), [promosUpdatedAt]);
  const promos = useMemo(
    () => visiblePromosFor(promosQuery.data ?? [], viewer, now),
    [promosQuery.data, viewer, now],
  );
  // Promo que le toca HOY a cada producto (para el Modo TV).
  const vigentes = useMemo(() => vigentesPorProducto(products, viewer), [products, viewer]);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [tvMode, setTvMode] = useState(false);
  const [shareItem, setShareItem] = useState<{ product: ProductLight; promo: LightPromo } | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl p-3" style={{ background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.3)" }}>
            <TicketPercent size={24} style={{ color: "var(--td-red)" }} aria-hidden />
          </div>
          <div>
            <h1 className="text-[26px] font-black leading-tight" style={{ color: "var(--td-text-hi)" }}>Promos</h1>
            <p className="text-[15px] font-semibold" style={{ color: "var(--td-text-md)" }}>
              {viewer.canManage
                ? "Crea promociones y elige a qué productos aplican."
                : "Las promociones que aplican en tu tienda."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <PromoButton icon={<Tv size={18} aria-hidden />} onClick={() => setTvMode(true)} data-testid="tv-mode-btn">
            Modo TV
          </PromoButton>
          {viewer.canManage && (
            <PromoButton
              variant="primary"
              className="px-5 text-[16px]"
              icon={<Plus size={20} aria-hidden />}
              onClick={() => setWizardOpen(true)}
              data-testid="new-promo-btn"
            >
              Nueva promoción
            </PromoButton>
          )}
        </div>
      </header>

      {productsQuery.isError && (
        <LoadError
          message="No se pudieron cargar los productos. Sin ellos no se pueden elegir productos para una promo."
          retrying={productsQuery.isFetching}
          onRetry={() => void productsQuery.refetch()}
        />
      )}

      {promosQuery.isError ? (
        <LoadError
          message="No se pudieron cargar las promociones. Revisa tu conexión."
          retrying={promosQuery.isFetching}
          onRetry={() => void promosQuery.refetch()}
        />
      ) : (
      <PromoList
        promos={promos}
        loading={promosQuery.isLoading}
        now={now}
        viewer={viewer}
        storeNames={storeNames}
        productsById={productsById}
        pickableProducts={pickableProducts}
        loadingProducts={productsQuery.isLoading}
        categories={categories}
        onNew={() => setWizardOpen(true)}
        onShare={(product, promo) => setShareItem({ product, promo })}
      />
      )}

      {wizardOpen && (
        <PromoWizard
          products={pickableProducts}
          categories={categories}
          loadingProducts={productsQuery.isLoading}
          storeNames={storeNames}
          onClose={() => setWizardOpen(false)}
        />
      )}

      <AnimatePresence>
        {shareItem && (
          <ShareBannerModal product={shareItem.product} promo={shareItem.promo} onClose={() => setShareItem(null)} />
        )}
      </AnimatePresence>
      {tvMode && <TvMode items={vigentes} onExit={() => setTvMode(false)} />}
    </div>
  );
}
