import { useState } from "react"
import { Check, MessageCircle, Plus, TicketPercent } from "lucide-react"
import { storageUrl } from "@tadaima/api"
import type { GlobalCatalogItem } from "@tadaima/api"
import { HoverCard } from "@/components/aceternity/HoverCard"
import { ImageWithFallback } from "@/components/figma/ImageWithFallback"
import { buildOrderMessage, buildWhatsAppLink } from "@/lib/catalogWhatsApp"

const DISPLAY = "'Space Grotesk', system-ui, sans-serif"

const fmt = (n: number): string =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n || 0)

const fmtEnds = (iso: string | null | undefined): string | null =>
  iso
    ? new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", timeZone: "America/Tijuana" })
    : null

interface ProductCardProps {
  item: GlobalCatalogItem
  showPrice: boolean
  showStock: boolean
  showDescription: boolean
  cartEnabled: boolean
  onAdd: (item: GlobalCatalogItem) => void
  onWhatsAppClick?: ((item: GlobalCatalogItem) => void) | undefined
}

export function ProductCard({
  item,
  showPrice,
  showStock,
  showDescription,
  cartEnabled,
  onAdd,
  onWhatsAppClick,
}: ProductCardProps) {
  const img = item.images?.[0]?.path ? storageUrl(item.images[0].path) : null
  const hasPrice = showPrice && typeof item.price === "number"
  const isManga = item.product_type === "manga"
  const isOut = (item.total ?? 0) <= 0
  const topStore = item.stores.length ? [...item.stores].sort((a, b) => b.qty - a.qty)[0]! : null
  // Mejor promo vigente (mismo desempate que el motor: prioridad no viaja al
  // público, así que id asc = la más vieja gana el pill).
  const promo = item.active_promotions?.[0] ?? null
  const promoEnds = promo ? fmtEnds(promo.ends_at) : null
  const promoStoreName = promo?.store_id != null
    ? item.stores.find((s) => s.store_id === promo.store_id)?.store_name ?? "una sucursal"
    : null

  // Micro-feedback "✓ Agregado" (~900ms) sin abrir el drawer.
  const [justAdded, setJustAdded] = useState(false)
  const handleAdd = () => {
    onAdd(item)
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 900)
  }

  const directWaHref = (): string => {
    const message = buildOrderMessage(
      topStore?.store_name ?? "la tienda",
      [{ name: item.name, price: item.price, qty: 1 }],
      { showPrice }
    )
    return buildWhatsAppLink(topStore?.whatsapp ?? null, message)
  }

  return (
    <HoverCard
      accent="rgba(224,34,26,0.20)"
      className="h-full rounded-3xl p-2.5 flex flex-col"
      style={{
        background: "var(--td-card-bg)",
        border: "1px solid var(--td-card-border)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      {/* Imagen: aspect-ratio fijo (CLS) + placeholder de marca cuando no hay foto */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{ aspectRatio: "1 / 1", background: "var(--td-surface-strong)", filter: isOut ? "grayscale(1)" : undefined }}
      >
        <ImageWithFallback
          src={img}
          alt={item.name}
          className="w-full h-full object-cover"
          style={{ width: "100%", height: "100%" }}
        />
        <span
          className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md"
          style={
            isManga
              ? { background: "rgba(224,34,26,0.24)", border: "1px solid var(--td-red-brd)", color: "#FF8A80" }
              : { background: "rgba(0,0,0,0.45)", border: "1px solid var(--td-card-border)", color: "var(--td-text-md)" }
          }
        >
          {isManga ? "Manga" : item.category?.name ?? "Producto"}
        </span>
        {isOut && (
          <span
            className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md"
            style={{ background: "#DC2626", color: "#fff" }}
          >
            Agotado
          </span>
        )}
      </div>

      <p
        className="text-sm font-bold mt-2.5 leading-tight line-clamp-2"
        style={{ color: "var(--td-text-hi)", fontFamily: DISPLAY }}
      >
        {item.name}
      </p>
      {showDescription && item.description && (
        <p className="text-[11px] mt-1 line-clamp-1" style={{ color: "var(--td-text-lo)" }}>
          {item.description}
        </p>
      )}

      {/* Pill de promo vigente (Tienda Online v2.0) */}
      {promo && (
        <div className="mt-1.5">
          <span
            title={`${promo.name} · ${promo.buy_n}x${promo.pay_m}${promoEnds ? ` · hasta ${promoEnds}` : ""}${promoStoreName ? ` · en ${promoStoreName}` : ""}`}
            className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md"
            style={{ background: "rgba(16,185,129,0.14)", border: "1px solid rgba(16,185,129,0.35)", color: "#34D399" }}
          >
            <TicketPercent size={10} />
            {promo.buy_n}x{promo.pay_m}
            {promoEnds ? ` · hasta ${promoEnds}` : ""}
            {promoStoreName ? ` · ${promoStoreName}` : ""}
          </span>
        </div>
      )}

      <div className="mt-1.5">
        {hasPrice ? (
          <p className="text-lg font-black tabular-nums leading-tight" style={{ color: "#FFB020", fontFamily: DISPLAY }}>
            {fmt(item.price as number)}
          </p>
        ) : (
          <p className="text-[11px] font-bold" style={{ color: "var(--td-text-ghost)" }}>
            Precio por mensaje
          </p>
        )}
      </div>

      {/* Disponibilidad simplificada (v2.0): una línea + detalle expandible.
          Antes: 3 chips de sucursal + chip Total saturaban la card en 9px. */}
      {showStock && item.stores.length > 0 && (
        item.stores.length === 1 ? (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold" style={{ color: "var(--td-text-lo)" }}>
            <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#34D399" }} />
            Disponible en {item.stores[0]!.store_name}
          </p>
        ) : (
          <details className="mt-1.5 group">
            <summary
              className="list-none inline-flex items-center gap-1.5 text-[10px] font-bold cursor-pointer select-none"
              style={{ color: "var(--td-text-lo)" }}
            >
              <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#34D399" }} />
              Disponible · {item.stores.length} sucursales
              <span className="transition-transform group-open:rotate-90" style={{ color: "var(--td-text-ghost)" }}>›</span>
            </summary>
            <div className="mt-1 flex flex-wrap gap-1">
              {item.stores.map((s) => (
                <span
                  key={s.store_id}
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                  style={{ background: "var(--td-surface-muted)", border: "1px solid var(--td-divider)", color: "var(--td-text-lo)" }}
                >
                  {s.store_name}: <span style={{ color: "#34D399", fontWeight: 900 }}>{s.qty}</span>
                </span>
              ))}
            </div>
          </details>
        )
      )}

      <div className="mt-auto pt-2.5">
        {cartEnabled ? (
          <button
            type="button"
            onClick={handleAdd}
            disabled={isOut}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 text-[11px] font-black uppercase tracking-widest transition-colors cursor-pointer hover:brightness-125 disabled:opacity-45 disabled:cursor-not-allowed"
            style={justAdded
              ? { minHeight: 44, background: "rgba(16,185,129,0.16)", border: "1px solid rgba(16,185,129,0.4)", color: "#34D399" }
              : { minHeight: 44, background: "var(--td-red-dim)", border: "1px solid var(--td-red-brd)", color: "#FF8A80" }}
          >
            {isOut
              ? "Sin stock"
              : justAdded
                ? (<><Check size={14} /> Agregado</>)
                : (<><Plus size={14} /> Agregar</>)}
          </button>
        ) : (
          <a
            href={directWaHref()}
            target="_blank"
            rel="noreferrer"
            onClick={() => onWhatsAppClick?.(item)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 text-[11px] font-black uppercase tracking-widest transition-colors cursor-pointer hover:brightness-125"
            style={{ minHeight: 44, background: "rgba(37,211,102,0.14)", border: "1px solid rgba(37,211,102,0.30)", color: "#34D399" }}
          >
            <MessageCircle size={14} /> Pedir por WhatsApp
          </a>
        )}
      </div>
    </HoverCard>
  )
}
