import { useState } from "react";
import {
  CalendarDays, ChevronDown, CreditCard, PackagePlus, Pause, Pencil, Play, Store as StoreIcon, Trash2,
} from "lucide-react";
import type { ProductLight, Promotion } from "@tadaima/api";
import type { PickableCategory } from "@/lib/categoryPicker";
import { promoBannerCopy, promoShortLabel } from "@/lib/promoLabel";
import { canMutatePromo, getPromoDisplayStatus, type PromoDisplayStatus, type PromoViewer } from "@/lib/promoList";
import { formatDiaIso, formatVigencia, paymentRestrictionLabel, promoScopeLabel } from "@/lib/promoPlain";
import type { LightPromo } from "@/lib/promoVigentes";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PromoButton } from "./PromoButton";
import { PromoProductsPanel } from "./PromoProductsPanel";
import {
  AMBER, BLUE, CARD_BG, CARD_BORDER, GRAY, GREEN, RED_SOFT, TEXT_HI, TEXT_MD, tint,
} from "./promoTokens";

interface PromoCardProps {
  promo: Promotion;
  viewer: PromoViewer;
  now: Date;
  storeNames: ReadonlyMap<number, string>;
  productsById: ReadonlyMap<number, ProductLight>;
  categories: readonly PickableCategory[];
  /** Esta promo está pausando/reanudando ahora mismo. */
  toggling: boolean;
  onAddProducts: (promo: Promotion) => void;
  onEdit: (promo: Promotion) => void;
  onToggleStatus: (promo: Promotion) => void;
  onDelete: (promo: Promotion) => void;
  onShare: (product: ProductLight, promo: LightPromo) => void;
}

const STATUS_COLOR: Record<PromoDisplayStatus, string> = {
  vigente: GREEN,
  programada: BLUE,
  pausada: AMBER,
  vencida: GRAY,
  sin_configurar: RED_SOFT,
};

function statusLabel(status: PromoDisplayStatus, promo: Promotion, now: Date): string {
  switch (status) {
    case "vigente": return "Activa";
    case "programada": return `Empieza el ${formatDiaIso(promo.starts_at, now)}`;
    case "pausada": return "Pausada";
    case "vencida": return "Terminó";
    case "sin_configurar": return "Le faltan datos";
  }
}

/** Dato con ícono de la tarjeta (fechas, tienda, forma de pago). */
function Fact({ icon: Icon, children }: { icon: typeof CalendarDays; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold" style={{ color: TEXT_MD }}>
      <Icon size={16} aria-hidden className="shrink-0" /> {children}
    </span>
  );
}

/**
 * Tarjeta de una promo: qué es, en lenguaje llano; sus productos desplegables;
 * y las acciones con texto (solo si quien mira puede modificar ESTA promo).
 */
export function PromoCard({
  promo, viewer, now, storeNames, productsById, categories, toggling,
  onAddProducts, onEdit, onToggleStatus, onDelete, onShare,
}: PromoCardProps) {
  const [open, setOpen] = useState(false);
  const status = getPromoDisplayStatus(promo, now);
  const mutable = canMutatePromo(promo, viewer);
  const count = promo.products_count ?? promo.products?.length ?? 0;
  const payment = paymentRestrictionLabel(promo);
  const isMayoreo = promo.type === "qty_discount";

  return (
    <article
      className="overflow-hidden rounded-3xl"
      style={{ background: CARD_BG, border: CARD_BORDER }}
      data-testid={`promo-row-${promo.id}`}
    >
      <div className="flex flex-wrap items-start gap-4 p-4 sm:p-5" style={{ opacity: status === "vencida" ? 0.7 : 1 }}>
        <span
          className={`flex min-h-16 min-w-20 shrink-0 items-center justify-center rounded-2xl px-3 text-center font-black leading-none ${isMayoreo ? "text-[17px]" : "text-[30px]"}`}
          style={tint(status === "sin_configurar" ? RED_SOFT : GREEN)}
        >
          {isMayoreo ? "Mayoreo" : promoShortLabel(promo)}
        </span>

        <div className="min-w-[200px] flex-1">
          <h3 className="text-[19px] font-black leading-tight" style={{ color: TEXT_HI }}>{promo.name}</h3>
          <p className="mt-0.5 text-[16px] font-bold" style={{ color: TEXT_MD }}>
            {status === "sin_configurar" ? "Le faltan los datos del descuento: edítala o bórrala." : promoBannerCopy(promo)}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Fact icon={CalendarDays}>{formatVigencia(promo.starts_at, promo.ends_at, now)}</Fact>
            <Fact icon={StoreIcon}>{promoScopeLabel(promo.store_id, viewer, storeNames)}</Fact>
            {payment && <Fact icon={CreditCard}>{payment}</Fact>}
          </div>
        </div>

        <span
          className="inline-flex min-h-8 shrink-0 items-center gap-2 rounded-full px-3 text-[14px] font-extrabold"
          style={tint(STATUS_COLOR[status])}
          data-testid={`promo-status-${promo.id}`}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[status] }} aria-hidden />
          {statusLabel(status, promo, now)}
        </span>
      </div>

      {/* Sin productos no hay nada que desplegar (p. ej. tras quitar el último). */}
      <Collapsible open={open && count > 0} onOpenChange={setOpen}>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-5">
          {count > 0 ? (
            <CollapsibleTrigger asChild>
              <PromoButton
                className="mr-auto"
                icon={<ChevronDown size={18} aria-hidden style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />}
                data-testid={`toggle-products-${promo.id}`}
              >
                {open ? "Ocultar productos" : `Ver ${count === 1 ? "el producto" : `los ${count.toLocaleString("es-MX")} productos`}`}
              </PromoButton>
            </CollapsibleTrigger>
          ) : (
            <p className="mr-auto text-[15px] font-bold" style={{ color: AMBER }}>
              Sin productos: todavía no aplica en Caja.
            </p>
          )}

          {mutable ? (
            <>
              <PromoButton
                variant={count === 0 ? "primary" : "accent"}
                icon={<PackagePlus size={16} aria-hidden />}
                onClick={() => onAddProducts(promo)}
                data-testid={`assign-promo-${promo.id}`}
              >
                Agregar productos
              </PromoButton>
              <PromoButton icon={<Pencil size={16} aria-hidden />} onClick={() => onEdit(promo)} data-testid={`edit-promo-${promo.id}`}>
                Editar
              </PromoButton>
              {status !== "vencida" && status !== "sin_configurar" && (
                <PromoButton
                  icon={promo.status === "active" ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
                  loading={toggling}
                  onClick={() => onToggleStatus(promo)}
                  data-testid={`toggle-promo-${promo.id}`}
                >
                  {promo.status === "active" ? "Pausar" : "Reanudar"}
                </PromoButton>
              )}
              <PromoButton variant="danger" icon={<Trash2 size={16} aria-hidden />} onClick={() => onDelete(promo)} data-testid={`delete-promo-${promo.id}`}>
                Borrar
              </PromoButton>
            </>
          ) : viewer.canManage && (
            <p className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>Esta promo la administra el dueño.</p>
          )}
        </div>

        <CollapsibleContent>
          <PromoProductsPanel
            promo={promo}
            productsById={productsById}
            categories={categories}
            viewer={viewer}
            mutable={mutable}
            onShare={onShare}
          />
        </CollapsibleContent>
      </Collapsible>
    </article>
  );
}
