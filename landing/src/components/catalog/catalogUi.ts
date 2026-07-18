import type React from "react"

/**
 * Sistema de botones del Catálogo Online (Catálogo v3).
 *
 * UNA sola forma de pill para tabs/chips/toggles (antes convivían 4 lenguajes:
 * tabs rounded-xl con gradiente+glow, chips rounded-full flat, paddings y
 * text-sizes mixtos). El glow queda RESERVADO para CTAs primarios.
 *
 * Colores vía vars `--cat-*` (lib/catalogThemes.ts) para que los 6 temas
 * re-pinten todo sin tocar componentes.
 */

export type TypeFilter = "all" | "product" | "manga"
export type SortMode = "featured" | "new" | "price_asc" | "price_desc" | "name"

/** Clases compartidas de toda pill (tabs de tipo, categorías, orden, toggles). */
export const PILL_CLASS =
  "shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all"

export function pillStyle(active: boolean, variant: "accent" | "good" = "accent"): React.CSSProperties {
  if (!active) {
    return { background: "var(--td-surface-muted)", border: "1px solid var(--td-divider)", color: "var(--td-text-lo)" }
  }
  if (variant === "good") {
    return { background: "rgba(16,185,129,0.16)", border: "1px solid rgba(16,185,129,0.4)", color: "var(--cat-good, #34D399)" }
  }
  return {
    background: "var(--cat-accent-dim, var(--td-red-dim))",
    border: "1px solid var(--cat-accent-brd, var(--td-red-brd))",
    color: "var(--cat-accent-text, #FF8A80)",
  }
}

/** CTA primario (carrito flotante, enviar pedido): gradiente + glow del tema. */
export const ctaStyle: React.CSSProperties = {
  background: "var(--cat-accent-g, var(--td-red-g))",
  border: "1px solid var(--cat-accent-brd, var(--td-red-brd))",
  color: "#fff",
  boxShadow: "0 8px 28px var(--cat-glow, rgba(224,34,26,0.4))",
}

/** Botón secundario ("Cargar más"): superficie neutra, sin glow. */
export const secondaryBtnStyle: React.CSSProperties = {
  background: "var(--td-surface-muted)",
  border: "1px solid var(--td-divider)",
  color: "var(--td-text-md)",
}
