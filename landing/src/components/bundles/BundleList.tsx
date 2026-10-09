import { Boxes, LayoutGrid, Loader2, Search, TableProperties } from "lucide-react";
import type { Bundle } from "@tadaima/api";
import type { BundleViewer } from "@/hooks/queries/useBundles";
import { PromoButton } from "@/components/promos/PromoButton";
import { CARD_BG, CARD_BORDER, GREEN, PANEL_BG, TEXT_HI, TEXT_LO, TEXT_MD, inputStyle, tint } from "@/components/promos/promoTokens";
import { BundleCard } from "./BundleCard";
import { BundleTable } from "./BundleTable";

export type BundlesView = "cards" | "table";

export interface BundleListActions {
  onAssemble: (bundle: Bundle) => void;
  onDisassemble: (bundle: Bundle) => void;
  onLabel: (bundle: Bundle) => void;
  onDetail: (bundle: Bundle) => void;
  onEdit: (bundle: Bundle) => void;
  onToggleActive: (bundle: Bundle) => void;
  onDelete: (bundle: Bundle) => void;
}

interface BundleListProps extends BundleListActions {
  bundles: readonly Bundle[];
  /** Total sin filtrar (para distinguir "no hay" de "no coincide"). */
  total: number;
  loading: boolean;
  viewer: BundleViewer;
  storeId: number | null;
  query: string;
  onQueryChange: (next: string) => void;
  onQueryEnter: (typed: string) => void;
  togglingId: number | null;
  onNew: () => void;
  view: BundlesView;
  onViewChange: (next: BundlesView) => void;
}

/** Buscador + tarjetas + estados vacíos de la pantalla de Paquetes. */
export function BundleList({
  bundles, total, loading, viewer, storeId, query, onQueryChange, onQueryEnter, togglingId, onNew, view, onViewChange, ...actions
}: BundleListProps) {
  const viewButton = (key: BundlesView, label: string, Icon: typeof LayoutGrid) => {
    const active = view === key;
    return (
      <button
        type="button"
        onClick={() => onViewChange(key)}
        aria-pressed={active}
        title={label}
        className="flex h-12 w-12 items-center justify-center rounded-xl"
        style={active ? tint(GREEN) : { background: CARD_BG, border: CARD_BORDER, color: TEXT_MD, cursor: "pointer" }}
        data-testid={`bundles-view-${key}`}
      >
        <Icon size={20} aria-hidden />
        <span className="sr-only">{label}</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Barra fija: el buscador y el cambio de vista no se pierden al bajar por la lista. */}
      <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 rounded-2xl px-1 py-2" style={{ background: "var(--td-popup-bg)", backdropFilter: "blur(12px)" }}>
        <div className="relative flex-1">
          <Search size={18} aria-hidden style={{ position: "absolute", left: 14, top: 15, color: TEXT_LO }} />
          <input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); onQueryEnter(event.currentTarget.value); } }}
            placeholder="Buscar paquete por nombre, SKU o código"
            aria-label="Buscar paquete por nombre, SKU o código"
            data-scan-target="product"
            style={{ ...inputStyle, paddingLeft: 42 }}
            data-testid="bundle-list-search"
          />
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Vista">
          {viewButton("cards", "Tarjetas", LayoutGrid)}
          {viewButton("table", "Tabla", TableProperties)}
        </div>
      </div>

      {loading ? (
        <p className="flex items-center justify-center gap-3 py-16 text-[15px] font-semibold" style={{ color: TEXT_MD }}>
          <Loader2 size={20} className="animate-spin" aria-hidden /> Cargando paquetes…
        </p>
      ) : total === 0 ? (
        <div className="rounded-3xl px-6 py-12 text-center" style={{ background: PANEL_BG, border: CARD_BORDER }} data-testid="bundles-empty">
          <Boxes size={40} aria-hidden style={{ color: TEXT_MD, margin: "0 auto 12px" }} />
          <p className="text-[20px] font-black" style={{ color: TEXT_HI }}>Todavía no hay paquetes</p>
          <p className="mx-auto mt-2 max-w-xl text-[15px] font-semibold" style={{ color: TEXT_MD }}>
            Junta 2 o más productos en un paquete con su propio precio y código de barras. Se vende en Caja como
            cualquier producto y lo armas con las piezas que ya tienes en la tienda.
          </p>
          <PromoButton variant="primary" className="mt-5 px-5 text-[16px]" onClick={onNew} data-testid="bundles-empty-new">
            Crear el primer paquete
          </PromoButton>
        </div>
      ) : bundles.length === 0 ? (
        <div className="rounded-3xl px-6 py-10 text-center" style={{ background: PANEL_BG, border: CARD_BORDER }}>
          <p className="text-[16px] font-bold" style={{ color: TEXT_HI }}>Ningún paquete coincide con lo que buscas.</p>
          <PromoButton className="mt-4" onClick={() => onQueryChange("")}>Ver todos los paquetes</PromoButton>
        </div>
      ) : view === "table" ? (
        <BundleTable bundles={bundles} viewer={viewer} storeId={storeId} togglingId={togglingId} {...actions} />
      ) : (
        <div className="space-y-3">
          {bundles.map(bundle => (
            <BundleCard
              key={bundle.id}
              bundle={bundle}
              viewer={viewer}
              storeId={storeId}
              toggling={togglingId === bundle.id}
              {...actions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
