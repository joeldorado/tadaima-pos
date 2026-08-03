import { useState } from "react"
import { Check, MessageCircle, Plus, Star, TicketPercent } from "lucide-react"
import { storageUrl } from "@tadaima/api"
import type { GlobalCatalogItem } from "@tadaima/api"
import { HoverCard } from "@/components/aceternity/HoverCard"
import { ImageWithFallback } from "@/components/figma/ImageWithFallback"
import { buildOrderMessage, buildWhatsAppLink } from "@/lib/catalogWhatsApp"
import { promoDetailLabel, promoShortLabel } from "@/lib/promoLabel"

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

/** URL de la primera foto real del producto (null = sin foto → card compacta). */
export function cardImageUrl(item: GlobalCatalogItem): string | null {
  const firstImg = item.images?.[0]
  return firstImg?.url || (firstImg?.path ? storageUrl(firstImg.path) : null)
}

interface ProductCardProps {
  item: GlobalCatalogItem
  showPrice: boolean
  showStock: boolean
  showDescription: boolean
  cartEnabled: boolean
  onAdd: (item: GlobalCatalogItem) => void
  onWhatsAppClick?: ((item: GlobalCatalogItem) => void) | undefined
  /**
   * "square" fija 1:1 (evita CLS, es lo que quieren las cuadrículas parejas).
   * "natural" deja mandar a la foto — lo usa el layout Revista, donde las
   * alturas dispares SON el efecto (Catálogo v4).
   */
  imageAspect?: "square" | "natural"
}

export function ProductCard({
  item,
  showPrice,
  showStock,
  showDescription,
  cartEnabled,
  onAdd,
  onWhatsAppClick,
  imageAspect = "square",
}: ProductCardProps) {
  // `url` viene resuelta del backend (GCS en prod); `path` es fallback legacy.
  const img = cardImageUrl(item)
  // v5: sin foto la card es COMPACTA — sin cuadro de imagen, mitad de alto.
  // Con ~14k productos importados sin foto, el cuadro con placeholder gigante
  // desperdiciaba la mitad de la tienda (Joel 2026-08-03).
  const compact = !img
  // El alto libre solo tiene sentido con foto real.
  const naturalAspect = imageAspect === "natural" && !!img
  const hasPrice = showPrice && typeof item.price === "number"
  const isManga = item.product_type === "manga"
  const isOut = (item.total ?? 0) <= 0
  const topStore = item.stores.length ? [...item.stores].sort((a, b) => b.qty - a.qty)[0]! : null
  // Mejor promo vigente (mismo desempate que el motor: prioridad no viaja al
  // público, así que id asc = la más vieja gana el pill).
  // Locales primero si conviven (la local reemplaza a la global en su tienda).
  const promo = [...(item.active_promotions ?? [])]
    .sort((a, b) => (b.store_id != null ? 1 : 0) - (a.store_id != null ? 1 : 0))[0] ?? null
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

  const typeBadge = (
    <span
      className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md"
      style={
        isManga
          ? { background: "var(--cat-accent-dim, rgba(224,34,26,0.24))", border: "1px solid var(--cat-accent-brd, var(--td-red-brd))", color: "var(--cat-accent-text, #FF8A80)" }
          : { background: "var(--cat-badge-bg, rgba(0,0,0,0.45))", border: "1px solid var(--td-card-border)", color: "var(--td-text-md)" }
      }
    >
      {isManga ? "Manga" : item.category?.name ?? "Producto"}
    </span>
  )

  const promoPill = promo && (
    <div className="mt-1.5">
      <span
        title={`${promo.name} · ${promoDetailLabel(promo)}${promoEnds ? ` · hasta ${promoEnds}` : ""}${promoStoreName ? ` · en ${promoStoreName}` : ""}`}
        className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md"
        style={{ background: "var(--cat-good-dim, rgba(16,185,129,0.14))", border: "1px solid var(--cat-good-brd, rgba(16,185,129,0.35))", color: "var(--cat-good, #34D399)" }}
      >
        <TicketPercent size={10} />
        {promoShortLabel(promo)}
        {promoEnds ? ` · hasta ${promoEnds}` : ""}
        {promoStoreName ? ` · ${promoStoreName}` : ""}
      </span>
    </div>
  )

  const priceBlock = (
    <div className="mt-1.5">
      {hasPrice ? (
        <p className="text-lg font-black tabular-nums leading-tight" style={{ color: "var(--cat-price, #FFB020)", fontFamily: DISPLAY }}>
          {fmt(item.price as number)}
        </p>
      ) : (
        <p className="text-[11px] font-bold" style={{ color: "var(--td-text-ghost)" }}>
          Precio por mensaje
        </p>
      )}
    </div>
  )

  // Disponibilidad simplificada (v2.0): una línea + detalle expandible.
  const stockBlock = showStock && item.stores.length > 0 && (
    item.stores.length === 1 ? (
      <p className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold" style={{ color: "var(--td-text-lo)" }}>
        <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--cat-good, #34D399)" }} />
        Disponible en {item.stores[0]!.store_name}
      </p>
    ) : (
      <details className="mt-1.5 group">
        <summary
          className="list-none inline-flex items-center gap-1.5 text-[10px] font-bold cursor-pointer select-none"
          style={{ color: "var(--td-text-lo)" }}
        >
          <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--cat-good, #34D399)" }} />
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
              {s.store_name}: <span style={{ color: "var(--cat-good, #34D399)", fontWeight: 900 }}>{s.qty}</span>
            </span>
          ))}
        </div>
      </details>
    )
  )

  const cta = (
    <div className={compact ? "mt-auto pt-2" : "mt-auto pt-2.5"}>
      {cartEnabled ? (
        <button
          type="button"
          onClick={handleAdd}
          disabled={isOut}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 text-[11px] font-black uppercase tracking-widest transition-colors cursor-pointer hover:brightness-125 disabled:opacity-45 disabled:cursor-not-allowed"
          style={justAdded
            ? { minHeight: compact ? 38 : 44, background: "var(--cat-good-dim, rgba(16,185,129,0.16))", border: "1px solid var(--cat-good-brd, rgba(16,185,129,0.4))", color: "var(--cat-good, #34D399)" }
            : { minHeight: compact ? 38 : 44, background: "var(--cat-accent-dim, var(--td-red-dim))", border: "1px solid var(--cat-accent-brd, var(--td-red-brd))", color: "var(--cat-accent-text, #FF8A80)" }}
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
          style={{ minHeight: compact ? 38 : 44, background: "var(--cat-good-dim, rgba(37,211,102,0.14))", border: "1px solid var(--cat-good-brd, rgba(37,211,102,0.30))", color: "var(--cat-good, #34D399)" }}
        >
          <MessageCircle size={14} /> Pedir por WhatsApp
        </a>
      )}
    </div>
  )

  return (
    <HoverCard
      accent="var(--cat-hover, rgba(224,34,26,0.20))"
      className={`${compact ? "" : "h-full "}rounded-3xl p-2.5 flex flex-col`}
      style={{
        // v5: superficie/sombra por tema (--cat-card-*) — los temas oscuros
        // conservan el glass opaco v2.3; corporativo pinta card blanca plana.
        background: "var(--cat-card-bg, linear-gradient(160deg, rgba(28,18,24,0.92) 0%, rgba(15,10,16,0.94) 100%))",
        border: "1px solid var(--td-card-border)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        boxShadow: "var(--cat-card-shadow, 0 8px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05))",
      }}
    >
      {compact ? (
        // ── Card COMPACTA (sin foto): chips arriba, nombre, precio, CTA ──────
        <div className="flex items-center gap-1.5 flex-wrap">
          {typeBadge}
          {isOut && (
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md" style={{ background: "#DC2626", color: "#fff" }}>
              Agotado
            </span>
          )}
          {item.featured && (
            <span
              className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md"
              style={{ background: "var(--cat-accent-dim, rgba(224,34,26,0.24))", border: "1px solid var(--cat-accent-brd, var(--td-red-brd))", color: "var(--cat-accent-text, #FF8A80)" }}
            >
              <Star size={9} fill="currentColor" /> Destacado
            </span>
          )}
        </div>
      ) : (
        // ── Card con FOTO: aspect-ratio fijo (CLS) + badges encima ───────────
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            ...(naturalAspect ? {} : { aspectRatio: "1 / 1" }),
            background: "var(--td-surface-strong)",
            filter: isOut ? "grayscale(1)" : undefined,
          }}
        >
          <ImageWithFallback
            src={img}
            alt={item.name}
            className={naturalAspect ? "w-full h-auto object-contain" : "w-full h-full object-cover"}
            style={naturalAspect ? { width: "100%", height: "auto" } : { width: "100%", height: "100%" }}
          />
          <span className="absolute top-2 left-2">{typeBadge}</span>
          {isOut && (
            <span
              className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md"
              style={{ background: "#DC2626", color: "#fff" }}
            >
              Agotado
            </span>
          )}
          {/* Destacado (v3): abajo-derecha para no chocar con el badge de tipo
              (arriba-izquierda) en cards angostas de móvil. */}
          {item.featured && (
            <span
              className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md"
              style={{ background: "var(--cat-accent-dim, rgba(224,34,26,0.24))", border: "1px solid var(--cat-accent-brd, var(--td-red-brd))", color: "var(--cat-accent-text, #FF8A80)", backdropFilter: "blur(6px)" }}
            >
              <Star size={9} fill="currentColor" /> Destacado
            </span>
          )}
        </div>
      )}

      <p
        className={`text-sm font-bold leading-tight line-clamp-2 ${compact ? "mt-2" : "mt-2.5"}`}
        style={{ color: "var(--td-text-hi)", fontFamily: DISPLAY }}
      >
        {item.name}
      </p>
      {!compact && showDescription && item.description && (
        <p className="text-[11px] mt-1 line-clamp-1" style={{ color: "var(--td-text-lo)" }}>
          {item.description}
        </p>
      )}

      {/* Pill de promo vigente (Tienda Online v2.0) */}
      {promoPill}
      {priceBlock}
      {stockBlock}
      {cta}
    </HoverCard>
  )
}
