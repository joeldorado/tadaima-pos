import { Loader2, PackageMinus, PackagePlus, Pencil, Tag } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Bundle, BundleAssembly, BundleDetail } from "@tadaima/api";
import { useBundleQuery, type BundleViewer } from "@/hooks/queries/useBundles";
import { savingsPct } from "@/lib/bundleMath";
import { PromoButton } from "@/components/promos/PromoButton";
import { PromoDialog } from "@/components/promos/PromoDialog";
import { ProductThumb } from "@/components/promos/ProductPickerRows";
import { AMBER, CARD_BORDER, GRAY, GREEN, RED_SOFT, TEXT_HI, TEXT_MD, fmtMoney, tint } from "@/components/promos/promoTokens";
import { BundleStoreTable } from "./BundleAvailability";
import { ENTITY, bundlesLabel } from "./bundleTokens";

interface BundleDetailDialogProps {
  bundleId: number;
  viewer: BundleViewer;
  /** Tienda elegida en la página (acota la disponibilidad); null = todas. */
  storeId: number | null;
  onClose: () => void;
  onEdit: (bundle: Bundle) => void;
  onLabel: (bundle: Bundle) => void;
  onAssemble: (bundle: Bundle) => void;
  onDisassemble: (bundle: Bundle) => void;
}

const H3 = "mb-2 text-[17px] font-black";
const n = (value: number): string => value.toLocaleString("es-MX");

const formatWhen = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return format(date, "d MMM yyyy, HH:mm", { locale: es });
};

function savingsText(bundle: Bundle): string {
  const price = bundle.prices.price_1 ?? 0;
  const pct = savingsPct(price, bundle.suggested_price_sum);
  const base = `Suma por separado ${fmtMoney(bundle.suggested_price_sum)} · ${ENTITY.One} ${fmtMoney(price)}`;
  if (pct == null) return base;
  if (pct < 0) return `${base} · ${Math.abs(pct)}% más caro`;
  return `${base} · Ahorro ${pct}%`;
}

function AssemblyItem({ entry }: { entry: BundleAssembly }) {
  const assembled = entry.type === "armado";
  const Icon = assembled ? PackagePlus : PackageMinus;
  const color = assembled ? GREEN : AMBER;
  return (
    <li className="flex gap-3 py-3" style={{ borderTop: CARD_BORDER }}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={tint(color)}>
        <Icon size={16} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-extrabold" style={{ color: TEXT_HI }}>
          {assembled ? "Armó" : "Desarmó"} {n(entry.quantity)}
          <span className="font-semibold" style={{ color: TEXT_MD }}>
            {" "}· {entry.store?.name ?? "Sin tienda"} · {entry.user?.name ?? "Sin usuario"} · {formatWhen(entry.created_at)}
          </span>
        </p>
        {entry.notes && <p className="mt-0.5 text-[14px] font-semibold italic" style={{ color: TEXT_MD }}>{entry.notes}</p>}
        {entry.components.length > 0 && (
          <p className="mt-1 text-[13px] font-semibold tabular-nums" style={{ color: TEXT_MD }}>
            {entry.components.map(c => (assembled
              ? `${c.name} ×${n(c.qty_per_bundle)} (Exh ${n(c.from_store_qty ?? 0)} · Bod ${n(c.from_bodega_qty ?? 0)})`
              : `${c.name} ×${n(c.total_qty)} → ${c.to_warehouse === "bodega" ? "Bodega" : "Exhibición"}`
            )).join(" · ")}
          </p>
        )}
      </div>
    </li>
  );
}

function DetailBody({ bundle, viewer }: { bundle: BundleDetail; viewer: BundleViewer }) {
  const price = bundle.prices.price_1 ?? 0;
  const otherPrices = [
    bundle.prices.price_2 != null ? `Socio ${fmtMoney(bundle.prices.price_2)}` : null,
    bundle.prices.price_3 != null ? `Mayorista ${fmtMoney(bundle.prices.price_3)}` : null,
  ].filter((text): text is string => text != null);
  const components = [...bundle.components].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start gap-4">
        <ProductThumb image={bundle.image} size={96} />
        <div className="min-w-[200px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[22px] font-black leading-tight" style={{ color: TEXT_HI }}>{fmtMoney(price)}</p>
            {!bundle.active && (
              <span className="rounded-full px-2.5 py-0.5 text-[12px] font-extrabold" style={tint(GRAY)}>Desactivado</span>
            )}
          </div>
          {otherPrices.length > 0 && (
            <p className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>{otherPrices.join(" · ")}</p>
          )}
          {bundle.description && (
            <p className="mt-2 text-[15px] font-semibold leading-relaxed" style={{ color: TEXT_MD }}>{bundle.description}</p>
          )}
        </div>
      </section>

      <section>
        <h3 className={H3} style={{ color: TEXT_HI }}>Qué lleva</h3>
        <ul>
          {components.map(c => (
            <li key={c.product_id} className="flex items-center gap-3 py-2" style={{ borderTop: CARD_BORDER }}>
              <ProductThumb image={c.image} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold" style={{ color: TEXT_HI }}>
                  <span style={{ color: GREEN }}>{n(c.quantity)} ×</span> {c.name}
                </span>
                <span className="block text-[13px] font-semibold" style={{ color: TEXT_MD }}>
                  Código {c.sku}{c.price_1 != null ? ` · ${fmtMoney(c.price_1)} c/u` : ""}
                </span>
              </span>
              <span className="shrink-0 text-[15px] font-bold tabular-nums" style={{ color: TEXT_HI }}>
                {fmtMoney((c.price_1 ?? 0) * c.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[14px] font-bold" style={{ color: TEXT_MD, borderTop: CARD_BORDER, paddingTop: 8 }}>{savingsText(bundle)}</p>
      </section>

      <section>
        <h3 className={H3} style={{ color: TEXT_HI }}>Existencias por tienda</h3>
        <BundleStoreTable rows={bundle.availability} highlightStoreId={viewer.storeId} showComponents />
      </section>

      <section>
        <h3 className={H3} style={{ color: TEXT_HI }}>Historial</h3>
        {bundle.assemblies.length === 0 ? (
          <p className="text-[14px] font-semibold" style={{ color: TEXT_MD }}>Todavía no se ha armado ninguno.</p>
        ) : (
          <ul>{bundle.assemblies.map(entry => <AssemblyItem key={entry.id} entry={entry} />)}</ul>
        )}
      </section>
    </div>
  );
}

/** Ficha completa de un paquete: foto, precio, productos, existencias e historial de armados. */
export function BundleDetailDialog({
  bundleId, viewer, storeId, onClose, onEdit, onLabel, onAssemble, onDisassemble,
}: BundleDetailDialogProps) {
  const query = useBundleQuery(bundleId, storeId);
  const bundle = query.data;
  const anyBuildable = bundle?.availability.some(row => row.max_buildable > 0) ?? false;
  const anyAssembled = bundle?.availability.some(row => row.stock_exhibicion > 0) ?? false;
  const canOperate = viewer.isAdmin || viewer.storeId != null;

  return (
    <PromoDialog
      title={bundle?.name ?? ENTITY.One}
      {...(bundle ? { subtitle: `SKU ${bundle.sku} · ${bundle.barcode ?? "sin código de barras"} · ${bundlesLabel(bundle.stock_total)} armados` } : {})}
      size="lg"
      onClose={onClose}
      testId="bundle-detail-dialog"
      footer={bundle ? (
        <>
          <PromoButton icon={<Pencil size={18} aria-hidden />} onClick={() => onEdit(bundle)} data-testid="detail-edit">Editar</PromoButton>
          <PromoButton icon={<Tag size={18} aria-hidden />} onClick={() => onLabel(bundle)} data-testid="detail-label">Etiqueta</PromoButton>
          {canOperate && (
            <>
              <PromoButton
                variant={anyBuildable && bundle.active ? "primary" : "secondary"}
                icon={<PackagePlus size={18} aria-hidden />}
                disabled={!anyBuildable || !bundle.active}
                title={bundle.active ? (anyBuildable ? undefined : "No hay piezas suficientes para armar") : "Activa el paquete para armarlo"}
                onClick={() => onAssemble(bundle)}
                data-testid="detail-assemble"
              >
                Armar
              </PromoButton>
              <PromoButton
                icon={<PackageMinus size={18} aria-hidden />}
                disabled={!anyAssembled}
                title={anyAssembled ? undefined : "No hay paquetes armados"}
                onClick={() => onDisassemble(bundle)}
                data-testid="detail-disassemble"
              >
                Desarmar
              </PromoButton>
            </>
          )}
          <PromoButton onClick={onClose}>Cerrar</PromoButton>
        </>
      ) : (
        <PromoButton onClick={onClose}>Cerrar</PromoButton>
      )}
    >
      {bundle ? (
        <DetailBody bundle={bundle} viewer={viewer} />
      ) : query.isError ? (
        <div className="space-y-3">
          <p role="alert" className="rounded-xl px-4 py-3 text-[15px] font-bold" style={{ background: "rgba(224,34,26,0.12)", color: RED_SOFT }}>
            No se pudo cargar el paquete.
          </p>
          <PromoButton onClick={() => { void query.refetch(); }} loading={query.isFetching}>Reintentar</PromoButton>
        </div>
      ) : (
        <p className="flex items-center gap-2 py-6 text-[15px] font-semibold" style={{ color: TEXT_MD }}>
          <Loader2 size={18} className="animate-spin" aria-hidden /> Cargando paquete…
        </p>
      )}
    </PromoDialog>
  );
}
