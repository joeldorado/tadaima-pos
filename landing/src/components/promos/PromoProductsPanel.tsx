import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Share2, Trash2 } from "lucide-react";
import {
  detachPromotionProduct, detachPromotionProducts, getLightPrice,
  type ProductLight, type Promotion,
} from "@tadaima/api";
import type { PickableCategory } from "@/lib/categoryPicker";
import { usePromoCache } from "@/hooks/queries/usePromotions";
import { detachInChunks } from "@/lib/promoAttach";
import type { PromoViewer } from "@/lib/promoList";
import {
  buildCategoryBuckets, filterProductsByText, type CategoryBucket, type PickerProduct,
} from "@/lib/promoProductPicker";
import { localOverrideFor, type LightPromo } from "@/lib/promoVigentes";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProductThumb } from "./ProductPickerRows";
import { PromoButton } from "./PromoButton";
import { BLUE, CARD_BORDER, TEXT_HI, TEXT_LO, TEXT_MD, fmtMoney, inputStyle } from "./promoTokens";

interface PromoProductsPanelProps {
  promo: Promotion;
  productsById: ReadonlyMap<number, ProductLight>;
  categories: readonly PickableCategory[];
  viewer: PromoViewer;
  /** El usuario puede quitar productos de ESTA promo. */
  mutable: boolean;
  onShare: (product: ProductLight, promo: LightPromo) => void;
}

/** Filas que se pintan de golpe; el resto entra con "Mostrar más". */
const PAGE_SIZE = 60;
/** A partir de cuántos productos conviene ofrecer el buscador interno. */
const SEARCH_THRESHOLD = 12;

/** Un producto que aún no está en el caché de productos: se muestra con lo que trae la promo. */
const fallbackProduct = (product: { id: number; name: string }): PickerProduct =>
  ({ id: product.id, name: product.name, sku: "", barcode: null, category_id: null });

/**
 * Los productos de una promo, agrupados por categoría. Antes solo se veían en
 * un globito al pasar el mouse; aquí se despliegan con foto, precio y los
 * botones Quitar / Compartir.
 */
export function PromoProductsPanel({ promo, productsById, categories, viewer, mutable, onShare }: PromoProductsPanelProps) {
  const { applyFresh, invalidate } = usePromoCache();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [removeGroup, setRemoveGroup] = useState<CategoryBucket | null>(null);
  const [removingGroup, setRemovingGroup] = useState(false);

  const assigned = useMemo(
    () => (promo.products ?? []).map(product => productsById.get(product.id) ?? fallbackProduct(product)),
    [promo.products, productsById],
  );
  const buckets = useMemo(
    () => buildCategoryBuckets(filterProductsByText(assigned, query), categories, { primaryOnly: true }),
    [assigned, query, categories],
  );
  const namesById = useMemo(() => new Map(assigned.map(product => [product.id, product.name])), [assigned]);

  const orderedIds = buckets.flatMap(bucket => bucket.productIds);
  const visibleIds = new Set(orderedIds.slice(0, limit));
  const remaining = orderedIds.length - visibleIds.size;

  const finish = (fresh: Promotion | null, message: string) => {
    if (fresh) applyFresh(fresh);
    invalidate();
    toast.success(message);
  };

  const removeOne = async (productId: number) => {
    setBusyId(productId);
    try {
      const fresh = await detachPromotionProduct(promo.id, productId);
      finish(fresh, `Se quitó "${namesById.get(productId) ?? "el producto"}" de la promo`);
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudo quitar el producto");
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemoveGroup = async () => {
    if (!removeGroup) return;
    setRemovingGroup(true);
    try {
      const fresh = await detachInChunks({
        promoId: promo.id, productIds: removeGroup.productIds, detach: detachPromotionProducts,
      });
      finish(fresh, `Se quitaron ${removeGroup.productIds.length} productos de ${removeGroup.name}`);
      setRemoveGroup(null);
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "No se pudieron quitar los productos");
      invalidate();
    } finally {
      setRemovingGroup(false);
    }
  };

  const renderRow = (productId: number) => {
    const light = productsById.get(productId);
    const livePromo = light?.active_promotions?.find(candidate => candidate.id === promo.id);
    const override = light ? localOverrideFor(light, promo, viewer) : null;
    const canShare = Boolean(light?.active && livePromo && !override);
    return (
      <li key={productId} className="flex flex-wrap items-center gap-3 px-3 py-2.5" style={{ borderTop: CARD_BORDER }}>
        <ProductThumb image={light?.image} />
        <div className="min-w-[160px] flex-1">
          <p className="text-[15px] font-bold leading-snug" style={{ color: TEXT_HI }}>{namesById.get(productId)}</p>
          <p className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>
            {light ? `Precio normal ${fmtMoney(getLightPrice(light, 1))}` : ""}
            {light && !light.active ? " · Producto inactivo" : ""}
          </p>
          {override && (
            <p className="text-[14px] font-bold" style={{ color: BLUE }}>En tu tienda aplica «{override.name}» en vez de esta.</p>
          )}
        </div>
        {canShare && light && livePromo && (
          <PromoButton
            icon={<Share2 size={16} aria-hidden />}
            onClick={() => onShare(light, livePromo)}
            style={{ color: "#25D366", border: "1px solid rgba(37,211,102,0.4)" }}
            data-testid={`share-promo-${productId}`}
          >
            Compartir
          </PromoButton>
        )}
        {mutable && (
          <PromoButton
            variant="danger"
            icon={<Trash2 size={16} aria-hidden />}
            loading={busyId === productId}
            onClick={() => void removeOne(productId)}
            data-testid={`detach-product-${productId}`}
          >
            Quitar
          </PromoButton>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-3 px-4 pb-4 sm:px-5" data-testid={`promo-products-${promo.id}`}>
      {assigned.length > SEARCH_THRESHOLD && (
        <div className="relative">
          <Search size={18} aria-hidden style={{ position: "absolute", left: 14, top: 15, color: TEXT_LO }} />
          <input
            value={query}
            onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }}
            placeholder="Buscar dentro de esta promo"
            aria-label="Buscar un producto dentro de esta promo"
            style={{ ...inputStyle, paddingLeft: 42 }}
          />
        </div>
      )}

      {orderedIds.length === 0 && (
        <p className="py-4 text-center text-[15px] font-semibold" style={{ color: TEXT_MD }}>
          {query.trim() ? `Ningún producto de esta promo coincide con "${query.trim()}".` : "Esta promo no tiene productos."}
        </p>
      )}

      {buckets.map(bucket => {
        const ids = bucket.productIds.filter(id => visibleIds.has(id));
        if (ids.length === 0) return null;
        return (
          <section key={bucket.key} className="overflow-hidden rounded-2xl" style={{ border: CARD_BORDER }}>
            <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <h4 className="text-[15px] font-extrabold" style={{ color: TEXT_HI }}>
                {bucket.name} <span className="font-semibold" style={{ color: TEXT_MD }}>· {bucket.productIds.length}</span>
              </h4>
              {mutable && bucket.productIds.length > 1 && !query.trim() && (
                <button
                  type="button"
                  onClick={() => setRemoveGroup(bucket)}
                  className="min-h-11 rounded-xl px-3 text-[14px] font-bold underline"
                  style={{ color: TEXT_MD, cursor: "pointer" }}
                >
                  Quitar los {bucket.productIds.length} de {bucket.name}
                </button>
              )}
            </header>
            <ul>{ids.map(renderRow)}</ul>
          </section>
        );
      })}

      {remaining > 0 && (
        <div className="text-center">
          <PromoButton onClick={() => setLimit(current => current + PAGE_SIZE)}>
            Mostrar {Math.min(PAGE_SIZE, remaining)} más (quedan {remaining.toLocaleString("es-MX")})
          </PromoButton>
        </div>
      )}

      {removeGroup && (
        <ConfirmDialog
          title={`¿Quitar ${removeGroup.name} de la promo?`}
          confirmLabel={`Sí, quitar los ${removeGroup.productIds.length}`}
          busyLabel="Quitando…"
          busy={removingGroup}
          onConfirm={() => void confirmRemoveGroup()}
          onCancel={() => setRemoveGroup(null)}
        >
          Se van a quitar <b>{removeGroup.productIds.length} productos</b> de <b>{promo.name}</b>. La promo sigue
          existiendo y los productos no se borran: solo dejan de tener esta promo.
        </ConfirmDialog>
      )}
    </div>
  );
}
