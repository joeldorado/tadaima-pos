import { useMemo, useState } from "react"
import { BookOpen, Hash } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { buildSearchIndex, searchDocs, type DocsSearchEntry } from "@/lib/docsSearch"
import type { DocTopic } from "@/content/docs"

/**
 * Buscador del Centro de Documentación (⌘K / Ctrl+K desde DocsPage).
 *
 * Composición manual Dialog + Command (mismas piezas que `CommandDialog` de
 * ui/command.tsx, que no deja pasar `shouldFilter` ni estilos al Content):
 * el matching es NUESTRO (normalizado sin acentos, ver lib/docsSearch.ts),
 * así que cmdk corre con `shouldFilter={false}`. El índice se construye solo
 * con los temas VISIBLES para el rol — lo que no ves, no aparece.
 */

interface DocsSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Temas ya filtrados por rol (los pasa DocsPage). */
  topics: DocTopic[]
  /** Navega a `?tema=X` (+ `&seccion=Y` si el resultado es una sección). */
  onNavigate: (tema: string, seccion?: string) => void
}

export function DocsSearch({ open, onOpenChange, topics, onNavigate }: DocsSearchProps) {
  const [query, setQuery] = useState("")

  const index = useMemo(() => buildSearchIndex(topics), [topics])
  const results = useMemo(() => searchDocs(index, query), [index, query])

  /** Resultados agrupados por categoría, en orden de aparición. */
  const grouped = useMemo(() => {
    const map = new Map<string, DocsSearchEntry[]>()
    for (const entry of results) {
      const bucket = map.get(entry.category)
      if (bucket) bucket.push(entry)
      else map.set(entry.category, [entry])
    }
    return [...map.entries()]
  }, [results])

  const handleOpenChange = (next: boolean) => {
    if (!next) setQuery("")
    onOpenChange(next)
  }

  const handleSelect = (entry: DocsSearchEntry) => {
    handleOpenChange(false)
    onNavigate(entry.tema, entry.seccion)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="overflow-hidden p-0 top-[22%] translate-y-0 sm:max-w-xl"
        style={{ background: "var(--td-popup-bg)", borderColor: "var(--td-card-border)" }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Buscar en la documentación</DialogTitle>
          <DialogDescription>Busca temas y secciones del centro de ayuda</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="bg-transparent">
          <CommandInput
            placeholder="Buscar en la documentación…"
            value={query}
            onValueChange={setQuery}
            style={{ color: "var(--td-text-hi)" }}
          />
          <CommandList className="max-h-[min(60vh,380px)]">
            {query.trim() === "" ? (
              <p className="py-8 text-center text-sm" style={{ color: "var(--td-text-ghost)" }}>
                Escribe para buscar en temas y secciones…
              </p>
            ) : (
              <CommandEmpty style={{ color: "var(--td-text-lo)" }}>
                Sin resultados para “{query}”.
              </CommandEmpty>
            )}
            {grouped.map(([category, entries]) => (
              <CommandGroup
                key={category}
                heading={category}
                className="[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-black"
              >
                {entries.map((entry) => {
                  const Icon = entry.type === "tema" ? BookOpen : Hash
                  return (
                    <CommandItem
                      key={`${entry.tema}#${entry.seccion ?? ""}`}
                      value={`${entry.tema}#${entry.seccion ?? ""}`}
                      onSelect={() => handleSelect(entry)}
                      className="gap-2.5 rounded-xl data-[selected=true]:bg-[var(--td-nav-active-bg)]"
                    >
                      <Icon size={15} className="shrink-0" style={{ color: "var(--td-text-lo)" }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold truncate" style={{ color: "var(--td-text-hi)" }}>
                          {entry.label}
                        </span>
                        <span className="block text-[11px] truncate" style={{ color: "var(--td-text-lo)" }}>
                          {entry.context}
                        </span>
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
