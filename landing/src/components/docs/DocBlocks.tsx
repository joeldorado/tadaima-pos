import { useEffect, useState } from "react"
import { Info, TriangleAlert, Sparkles, ImageOff, ChevronRight } from "lucide-react"
import type { DocBlock, DocField } from "@/content/docs/types"
import { findTopic } from "@/content/docs"
import { resolveDocImage } from "@/content/docs/images"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Renderers presentacionales del Centro de Documentación.
 * Un componente por `kind` de bloque; `DocBlockView` despacha por tipo.
 * Todo el color sale de los tokens `--td-*` (tema oscuro/claro nativo).
 */

function Prose({ text }: { text: string }) {
  return (
    <p className="text-sm leading-relaxed" style={{ color: "var(--td-text-md)" }}>
      {text}
    </p>
  )
}

function Steps({ items }: { items: { title: string; detail?: string }[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span
            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black tabular-nums"
            style={{
              background: "var(--td-red-dim)",
              border: "1px solid var(--td-red-brd)",
              color: "#FF8A80",
            }}
          >
            {i + 1}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-sm font-bold" style={{ color: "var(--td-text-hi)" }}>
              {it.title}
            </p>
            {it.detail && (
              <p className="text-[13px] mt-0.5 leading-relaxed" style={{ color: "var(--td-text-lo)" }}>
                {it.detail}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

const CALLOUT_STYLES = {
  info: { bg: "rgba(96,165,250,0.10)", brd: "rgba(96,165,250,0.32)", fg: "#93C5FD", Icon: Info },
  warn: { bg: "rgba(245,158,11,0.10)", brd: "rgba(245,158,11,0.35)", fg: "#FBBF24", Icon: TriangleAlert },
  gold: { bg: "rgba(224,34,26,0.10)", brd: "var(--td-red-brd)", fg: "#FF8A80", Icon: Sparkles },
} as const

function Callout({ tone, title, text }: { tone: "info" | "warn" | "gold"; title: string; text: string }) {
  const s = CALLOUT_STYLES[tone]
  return (
    <div className="rounded-2xl p-4 flex gap-3" style={{ background: s.bg, border: `1px solid ${s.brd}` }}>
      <s.Icon size={18} className="shrink-0 mt-0.5" style={{ color: s.fg }} />
      <div className="min-w-0">
        <p className="text-[13px] font-black uppercase tracking-wide" style={{ color: s.fg }}>
          {title}
        </p>
        <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--td-text-md)" }}>
          {text}
        </p>
      </div>
    </div>
  )
}

/**
 * Visualización de "descuento por cantidad": desglosa el ejemplo en los grupos
 * greedy que arma el motor (escalón mayor primero) y muestra la suma total.
 * Espejo visual de `qtyDiscountAmount` (saleCalc.ts / SaleCalculator.php).
 */

const CHIP_STYLES = {
  amber: { bg: "rgba(245,158,11,0.14)", brd: "rgba(245,158,11,0.4)", fg: "#FBBF24" },
  blue: { bg: "rgba(96,165,250,0.14)", brd: "rgba(96,165,250,0.4)", fg: "#93C5FD" },
  green: { bg: "rgba(16,185,129,0.14)", brd: "rgba(16,185,129,0.35)", fg: "#34D399" },
} as const

function Chips({ chips }: { chips: { label: string; tone: "amber" | "blue" | "green" }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c, i) => {
        const s = CHIP_STYLES[c.tone]
        return (
          <span
            key={i}
            className="text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg"
            style={{ background: s.bg, border: `1px solid ${s.brd}`, color: s.fg }}
          >
            {c.label}
          </span>
        )
      })}
    </div>
  )
}

/** Mini-mock de campos de formulario, con el label real que ve el usuario. */
function Fields({ fields }: { fields: DocField[] }) {
  return (
    <div className="space-y-2.5">
      {fields.map((f, i) => (
        <div key={i}>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: "var(--td-text-lo)" }}>
              {f.label}
            </span>
            {f.required && (
              <span
                className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded"
                style={{ background: "var(--td-red-dim)", border: "1px solid var(--td-red-brd)", color: "#FF8A80" }}
              >
                req
              </span>
            )}
          </div>
          <div
            className="h-9 rounded-lg flex items-center px-3 text-[13px]"
            style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-placeholder)" }}
          >
            {f.hint ?? ""}
          </div>
        </div>
      ))}
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--td-card-border)" }}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ background: "var(--td-table-head-bg)" }}>
            {head.map((h, i) => (
              <th
                key={i}
                className="text-left px-3 py-2.5 text-[11px] font-black uppercase tracking-wide"
                style={{ color: "var(--td-text-md)", borderBottom: "1px solid var(--td-divider)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-3 py-2.5 align-top"
                  style={{
                    color: ci === 0 ? "var(--td-text-hi)" : "var(--td-text-lo)",
                    fontWeight: ci === 0 ? 700 : 400,
                    borderBottom: ri < rows.length - 1 ? "1px solid var(--td-divider)" : "none",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Captura de pantalla con lightbox: la miniatura abre un Radix Dialog con la
 * imagen grande sobre fondo oscuro (Esc / click fuera / click en la imagen
 * cierran). Si la captura no existe todavía, placeholder discreto con el alt.
 */
function ImageBlock({ src, alt, caption }: { src: string; alt: string; caption?: string | undefined }) {
  const [open, setOpen] = useState(false)
  const resolved = resolveDocImage(src)

  useEffect(() => {
    if (!resolved && import.meta.env.DEV) {
      console.warn(`[docs] Imagen no encontrada: '${src}' (esperada en src/assets/docs/${src})`)
    }
  }, [resolved, src])

  if (!resolved) {
    return (
      <div
        className="rounded-2xl p-4 flex items-center gap-3"
        style={{ background: "var(--td-surface-soft)", border: "1px dashed var(--td-card-border)" }}
      >
        <ImageOff size={16} className="shrink-0" style={{ color: "var(--td-text-ghost)" }} />
        <span className="text-[13px]" style={{ color: "var(--td-text-lo)" }}>
          {alt}
        </span>
      </div>
    )
  }

  return (
    <figure className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full cursor-zoom-in"
        aria-label={`Ampliar imagen: ${alt}`}
      >
        <img
          src={resolved}
          alt={alt}
          loading="lazy"
          className="w-full rounded-2xl"
          style={{ border: "1px solid var(--td-card-border)" }}
        />
      </button>
      {caption && (
        <figcaption className="text-xs text-center leading-relaxed" style={{ color: "var(--td-text-ghost)" }}>
          {caption}
        </figcaption>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-1.5 bg-transparent border-none shadow-none max-w-[94vw] sm:max-w-[min(94vw,72rem)]">
          <DialogHeader className="sr-only">
            <DialogTitle>{alt}</DialogTitle>
            <DialogDescription>{caption ?? alt}</DialogDescription>
          </DialogHeader>
          <img
            src={resolved}
            alt={alt}
            onClick={() => setOpen(false)}
            className="w-full max-h-[85vh] object-contain rounded-xl cursor-zoom-out"
          />
        </DialogContent>
      </Dialog>
    </figure>
  )
}

/**
 * Card "Ver también" hacia otro tema (`?tema=<slug>`). La navegación la pone
 * el padre vía `onNavigateTopic` (DocsPage). Si el tema no existe, no rinde.
 */
function LinkBlock({
  toTopic,
  label,
  onNavigate,
}: {
  toTopic: string
  label?: string | undefined
  onNavigate?: ((slug: string) => void) | undefined
}) {
  const target = findTopic(toTopic)
  if (!target) return null
  const Icon = target.icon
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(toTopic)}
      className="w-full flex items-center gap-3 rounded-2xl p-3.5 text-left transition-colors hover:brightness-125"
      style={{ background: "var(--td-surface-soft)", border: "1px solid var(--td-card-border)" }}
    >
      <span
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "var(--td-red-dim)", border: "1px solid var(--td-red-brd)" }}
      >
        <Icon size={15} style={{ color: "#FF8A80" }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-ghost)" }}>
          Ver también
        </span>
        <span className="block text-sm font-bold mt-0.5 truncate" style={{ color: "var(--td-text-hi)" }}>
          {label ?? target.title}
        </span>
      </span>
      <ChevronRight size={16} className="shrink-0" style={{ color: "var(--td-text-lo)" }} />
    </button>
  )
}

export function DocBlockView({
  block,
  onNavigateTopic,
}: {
  block: DocBlock
  /** Navegación entre temas para los bloques `link` (la inyecta DocsPage). */
  onNavigateTopic?: ((slug: string) => void) | undefined
}) {
  switch (block.kind) {
    case "prose":
      return <Prose text={block.text} />
    case "steps":
      return <Steps items={block.items} />
    case "callout":
      return <Callout tone={block.tone} title={block.title} text={block.text} />
    case "chips":
      return <Chips chips={block.chips} />
    case "fields":
      return <Fields fields={block.fields} />
    case "table":
      return <Table head={block.head} rows={block.rows} />
    case "image":
      return <ImageBlock src={block.src} alt={block.alt} caption={block.caption} />
    case "link":
      return <LinkBlock toTopic={block.toTopic} label={block.label} onNavigate={onNavigateTopic} />
    default:
      return null
  }
}
