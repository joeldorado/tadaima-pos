import { useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { BookOpen, ChevronRight } from "lucide-react"
import { DOC_TOPICS, DOC_CATEGORIES, findTopic } from "@/content/docs"
import type { DocTopic } from "@/content/docs"
import { DocBlockView } from "@/components/docs/DocBlocks"

const T = {
  bgGrad: "var(--td-page-bg)",
  textPrimary: "var(--td-text-hi)",
  textSecondary: "var(--td-text-md)",
  textMuted: "var(--td-text-lo)",
  ghost: "var(--td-text-ghost)",
  red: "var(--td-red)",
  redBright: "#FF4422",
  surfaceSoft: "var(--td-surface-soft)",
  cardBorder: "1px solid var(--td-card-border)",
  divider: "var(--td-divider)",
}

function TopicNav({ active, onPick }: { active: string; onPick: (slug: string) => void }) {
  return (
    <nav className="space-y-5">
      {DOC_CATEGORIES.map((cat) => (
        <div key={cat}>
          <p className="text-[10px] font-black uppercase tracking-widest px-2 mb-1.5" style={{ color: T.ghost }}>
            {cat}
          </p>
          <div className="space-y-0.5">
            {DOC_TOPICS.filter((t) => t.category === cat).map((t) => {
              const isActive = t.slug === active
              const Icon = t.icon
              return (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => onPick(t.slug)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors"
                  style={{
                    background: isActive ? "var(--td-nav-active-bg)" : "transparent",
                    border: `1px solid ${isActive ? "var(--td-nav-active-border)" : "transparent"}`,
                  }}
                >
                  <Icon size={15} style={{ color: isActive ? T.redBright : T.textMuted }} className="shrink-0" />
                  <span
                    className="text-[13px] font-bold leading-tight"
                    style={{ color: isActive ? "var(--td-nav-active-label)" : T.textSecondary }}
                  >
                    {t.title}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

function TopicContent({ topic }: { topic: DocTopic }) {
  const Icon = topic.icon
  return (
    <article className="space-y-7 max-w-3xl">
      <header className="space-y-2">
        <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: T.ghost }}>
          {topic.category}
        </p>
        <div className="flex items-center gap-3">
          <span
            className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "var(--td-red-dim)", border: "1px solid var(--td-red-brd)" }}
          >
            <Icon size={22} style={{ color: T.redBright }} />
          </span>
          <h2 className="text-2xl font-black tracking-tight" style={{ color: T.textPrimary }}>
            {topic.title}
          </h2>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: T.textMuted }}>
          {topic.summary}
        </p>
      </header>

      {topic.sections.map((section, si) => (
        <section key={si} className="space-y-3.5">
          <h3
            className="text-[13px] font-black uppercase tracking-widest pb-2"
            style={{ color: T.textPrimary, borderBottom: `1px solid ${T.divider}` }}
          >
            {section.heading}
          </h3>
          <div className="space-y-3.5">
            {section.blocks.map((block, bi) => (
              <DocBlockView key={bi} block={block} />
            ))}
          </div>
        </section>
      ))}
    </article>
  )
}

export function DocsPage() {
  const [params, setParams] = useSearchParams()
  const scrollRef = useRef<HTMLDivElement>(null)

  const active = useMemo<DocTopic>(() => {
    return findTopic(params.get("tema")) ?? DOC_TOPICS[0]!
  }, [params])

  const pick = (slug: string) => setParams({ tema: slug })

  // Al cambiar de tema, regresa el scroll al inicio del contenido.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [active.slug])

  const idx = DOC_TOPICS.findIndex((t) => t.slug === active.slug)
  const prev = idx > 0 ? DOC_TOPICS[idx - 1] : null
  const next = idx < DOC_TOPICS.length - 1 ? DOC_TOPICS[idx + 1] : null

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto p-8 space-y-8 no-scrollbar" style={{ background: T.bgGrad }}>
      <header className="space-y-1.5">
        <div className="flex items-center gap-2">
          <BookOpen size={16} style={{ color: T.redBright }} />
          <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: T.ghost }}>
            Centro de ayuda
          </p>
        </div>
        <h1 className="text-[26px] font-black tracking-tight" style={{ color: T.textPrimary }}>
          Documenta<span style={{ color: T.red }}>ción</span>
        </h1>
        <p className="text-sm" style={{ color: T.textMuted }}>
          Guías paso a paso del sistema: catálogo, promociones, caja, inventario y administración.
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-[248px_1fr]">
        <aside className="md:sticky md:top-0 md:self-start">
          <TopicNav active={active.slug} onPick={pick} />
        </aside>

        <div className="min-w-0 space-y-8">
          <TopicContent topic={active} />

          <nav
            className="flex items-stretch gap-3 pt-6"
            style={{ borderTop: `1px solid ${T.divider}` }}
            aria-label="Navegación entre temas"
          >
            {prev ? (
              <button
                type="button"
                onClick={() => pick(prev.slug)}
                className="flex-1 text-left rounded-2xl p-3.5 transition-colors hover:brightness-125"
                style={{ background: T.surfaceSoft, border: T.cardBorder }}
              >
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest" style={{ color: T.ghost }}>
                  <ChevronRight size={12} className="rotate-180" /> Anterior
                </span>
                <span className="block text-sm font-bold mt-1" style={{ color: T.textPrimary }}>
                  {prev.title}
                </span>
              </button>
            ) : (
              <span className="flex-1" />
            )}
            {next ? (
              <button
                type="button"
                onClick={() => pick(next.slug)}
                className="flex-1 text-right rounded-2xl p-3.5 transition-colors hover:brightness-125"
                style={{ background: T.surfaceSoft, border: T.cardBorder }}
              >
                <span className="flex items-center justify-end gap-1 text-[10px] font-black uppercase tracking-widest" style={{ color: T.ghost }}>
                  Siguiente <ChevronRight size={12} />
                </span>
                <span className="block text-sm font-bold mt-1" style={{ color: T.textPrimary }}>
                  {next.title}
                </span>
              </button>
            ) : (
              <span className="flex-1" />
            )}
          </nav>
        </div>
      </div>
    </div>
  )
}
