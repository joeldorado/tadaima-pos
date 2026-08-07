import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { BookOpen, ChevronRight, Play, Search } from "lucide-react"
import { useAuth } from "@tadaima/auth"
import { DOC_TOPICS, DOC_CATEGORIES, findTopic } from "@/content/docs"
import type { DocTopic } from "@/content/docs"
import { findTour } from "@/content/tours"
import { useTourStore } from "@/stores/tourStore"
import { primaryRole, type Role } from "@/lib/permisos"
import { sectionAnchor } from "@/lib/docsSearch"
import { DocBlockView } from "@/components/docs/DocBlocks"
import { DocsSearch } from "@/components/docs/DocsSearch"

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

function TopicNav({
  topics,
  categories,
  active,
  onPick,
}: {
  topics: DocTopic[]
  categories: string[]
  active: string
  onPick: (slug: string) => void
}) {
  return (
    <nav className="space-y-5">
      {categories.map((cat) => (
        <div key={cat}>
          <p className="text-[10px] font-black uppercase tracking-widest px-2 mb-1.5" style={{ color: T.ghost }}>
            {cat}
          </p>
          <div className="space-y-0.5">
            {topics.filter((t) => t.category === cat).map((t) => {
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

function TopicContent({
  topic,
  role,
  onNavigateTopic,
}: {
  topic: DocTopic
  role: Role
  onNavigateTopic: (slug: string) => void
}) {
  const Icon = topic.icon
  const startTour = useTourStore((s) => s.start)
  // Botón "Iniciar tour" solo si el tema tiene tour ligado Y el rol puede tomarlo.
  const tour = findTour(topic.tourId)
  const canTour = tour != null && (!tour.roles || tour.roles.some((r) => r === role))
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
        {canTour && tour && (
          <button
            type="button"
            onClick={() => startTour(tour.id)}
            className="hidden md:inline-flex items-center gap-2 rounded-xl px-3.5 py-2 transition-all hover:brightness-110"
            style={{ background: "var(--td-red-dim)", border: "1px solid var(--td-red-brd)" }}
          >
            <Play size={13} style={{ color: T.redBright }} />
            <span className="text-[12px] font-black uppercase tracking-wider" style={{ color: T.redBright }}>
              Iniciar tour guiado
            </span>
          </button>
        )}
      </header>

      {topic.sections.map((section, si) => (
        <section key={si} id={sectionAnchor(section)} className="space-y-3.5 scroll-mt-6">
          <h3
            className="text-[13px] font-black uppercase tracking-widest pb-2"
            style={{ color: T.textPrimary, borderBottom: `1px solid ${T.divider}` }}
          >
            {section.heading}
          </h3>
          <div className="space-y-3.5">
            {section.blocks.map((block, bi) => (
              <DocBlockView key={bi} block={block} onNavigateTopic={onNavigateTopic} />
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
  const [searchOpen, setSearchOpen] = useState(false)
  const { user } = useAuth()
  const role = primaryRole(user?.roles)

  // Filtro por rol: sin `roles` = visible para todos; con `roles` = solo esos.
  const visibleTopics = useMemo(
    () => DOC_TOPICS.filter((t) => !t.roles || t.roles.some((r) => r === role)),
    [role],
  )
  const visibleCategories = useMemo(
    () => DOC_CATEGORIES.filter((cat) => visibleTopics.some((t) => t.category === cat)),
    [visibleTopics],
  )

  // Deep-link a tema oculto para el rol (o inexistente) → primer tema visible.
  const active = useMemo<DocTopic | undefined>(() => {
    const requested = findTopic(params.get("tema"))
    if (requested && visibleTopics.some((t) => t.slug === requested.slug)) return requested
    return visibleTopics[0]
  }, [params, visibleTopics])

  const seccion = params.get("seccion")

  // El setter SIEMPRE escribe tema (+ seccion solo si aplica): cambiar de
  // tema limpia `seccion` y nunca arrastra otros params del querystring.
  const navigate = (tema: string, toSeccion?: string) => {
    setParams(toSeccion ? { tema, seccion: toSeccion } : { tema })
  }
  const pick = (slug: string) => navigate(slug)

  // Con `?seccion=` el scroll aterriza en su ancla; sin ella, al inicio.
  useEffect(() => {
    if (!active) return
    if (seccion) {
      const el = scrollRef.current?.querySelector<HTMLElement>(`[id="${seccion}"]`)
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" })
        return
      }
    }
    scrollRef.current?.scrollTo({ top: 0 })
  }, [active, seccion])

  // ⌘K / Ctrl+K abre el buscador — listener vivo solo mientras DocsPage monta.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  if (!active) return null

  const idx = visibleTopics.findIndex((t) => t.slug === active.slug)
  const prev = idx > 0 ? (visibleTopics[idx - 1] ?? null) : null
  const next = idx >= 0 && idx < visibleTopics.length - 1 ? (visibleTopics[idx + 1] ?? null) : null

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto p-8 space-y-8 no-scrollbar" style={{ background: T.bgGrad }}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
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
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 transition-colors hover:brightness-125"
          style={{ background: T.surfaceSoft, border: T.cardBorder }}
        >
          <Search size={14} style={{ color: T.textMuted }} />
          <span className="text-[13px]" style={{ color: T.textMuted }}>
            Buscar en la documentación…
          </span>
          <kbd
            className="text-[10px] font-black px-1.5 py-0.5 rounded-md"
            style={{ background: "var(--td-card-bg)", border: T.cardBorder, color: T.ghost }}
          >
            ⌘K
          </kbd>
        </button>
      </header>

      <div className="grid gap-8 md:grid-cols-[248px_1fr]">
        <aside className="md:sticky md:top-0 md:self-start">
          <TopicNav topics={visibleTopics} categories={visibleCategories} active={active.slug} onPick={pick} />
        </aside>

        <div className="min-w-0 space-y-8">
          <TopicContent topic={active} role={role} onNavigateTopic={pick} />

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

      <DocsSearch open={searchOpen} onOpenChange={setSearchOpen} topics={visibleTopics} onNavigate={navigate} />
    </div>
  )
}
