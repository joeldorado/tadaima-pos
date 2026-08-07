import { describe, expect, it } from "vitest"
import { validateTourDefinition } from "./schema"
import type { TourStepData } from "./schema"
import { TOURS, stepsForRole, toursForRole } from "./index"
import ventaCajaData from "./data/venta-caja.json"
import preventasData from "./data/preventas.json"
import corteCajaData from "./data/corte-caja.json"
import altaProductoData from "./data/alta-producto.json"

const ALL_FILES: [string, unknown][] = [
  ["venta-caja", ventaCajaData],
  ["preventas", preventasData],
  ["corte-caja", corteCajaData],
  ["alta-producto", altaProductoData],
]

/** Tour base válido para mutarlo en los casos negativos. */
const validTour = () => ({
  id: "tour-demo",
  title: "Tour demo",
  description: "Un tour de prueba",
  steps: [
    { id: "intro", title: "Hola", body: "Bienvenido" },
    { id: "paso-dos", target: "sell-search", title: "Busca", body: "Escribe aquí" },
  ],
})

describe("validateTourDefinition · casos negativos", () => {
  it("rechaza lo que no es objeto", () => {
    const result = validateTourDefinition(null, "x")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toContain("debe ser un objeto")
  })

  it("exige id kebab-case", () => {
    const result = validateTourDefinition({ ...validTour(), id: "Tour Con Espacios" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("no es kebab-case")
  })

  it("exige title y description", () => {
    const result = validateTourDefinition({ ...validTour(), title: "", description: undefined })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const msg = result.errors.join("\n")
      expect(msg).toContain(".title")
      expect(msg).toContain(".description")
    }
  })

  it("rechaza steps vacío", () => {
    const result = validateTourDefinition({ ...validTour(), steps: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("NO vacío")
  })

  it("rechaza ids de paso duplicados", () => {
    const base = validTour()
    const result = validateTourDefinition({
      ...base,
      steps: [...base.steps, { id: "intro", title: "Otra vez", body: "Duplicado" }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("duplicado 'intro'")
  })

  it("rechaza placement inválido", () => {
    const base = validTour()
    const result = validateTourDefinition({
      ...base,
      steps: [{ ...base.steps[0], placement: "center" }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("placement inválido 'center'")
  })

  it("rechaza checks desconocidos en precondition", () => {
    const base = validTour()
    const result = validateTourDefinition({
      ...base,
      steps: [{
        ...base.steps[0],
        precondition: { check: "no-existe", failTitle: "t", failBody: "b" },
      }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("check desconocido 'no-existe'")
  })

  it("rechaza roles inválidos", () => {
    const result = validateTourDefinition({ ...validTour(), roles: ["superusuario"] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("rol inválido 'superusuario'")
  })

  it("rechaza route que no empieza con '/'", () => {
    const base = validTour()
    const result = validateTourDefinition({
      ...base,
      steps: [{ ...base.steps[0], route: "caja" }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("empiece con '/'")
  })
})

describe("data/*.json contra validateTourDefinition", () => {
  it.each(ALL_FILES)("%s.json es válido", (source, raw) => {
    const result = validateTourDefinition(raw, source)
    expect(result.ok ? [] : result.errors).toEqual([])
  })

  it("los ids de tour son únicos y los 4 hidratan", () => {
    expect(TOURS).toHaveLength(4)
    const ids = TOURS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("filtrado por rol (funciones puras)", () => {
  const steps: TourStepData[] = [
    { id: "a", title: "A", body: "a" },
    { id: "b", title: "B", body: "b", roles: ["admin"] },
    { id: "c", title: "C", body: "c", roles: ["admin", "gerente"] },
  ]

  it("paso sin roles lo ven todos; con roles, solo esos", () => {
    expect(stepsForRole(steps, "admin").map((s) => s.id)).toEqual(["a", "b", "c"])
    expect(stepsForRole(steps, "gerente").map((s) => s.id)).toEqual(["a", "c"])
    expect(stepsForRole(steps, "cajero").map((s) => s.id)).toEqual(["a"])
    expect(stepsForRole(steps, "unknown").map((s) => s.id)).toEqual(["a"])
  })

  it("toursForRole respeta roles a nivel tour", () => {
    const adminTours = toursForRole("admin").map((t) => t.id)
    const cajeroTours = toursForRole("cajero").map((t) => t.id)
    expect(adminTours).toContain("alta-producto")
    // alta-producto es admin+gerente — el cajero no lo ve.
    expect(cajeroTours).not.toContain("alta-producto")
    expect(cajeroTours).toContain("venta-caja")
  })

  it("el paso 'nuevo-catalogo' de preventas es solo admin/gerente", () => {
    const tour = TOURS.find((t) => t.id === "preventas")
    expect(tour).toBeDefined()
    if (!tour) return
    expect(stepsForRole(tour.steps, "admin").map((s) => s.id)).toContain("nuevo-catalogo")
    expect(stepsForRole(tour.steps, "cajero").map((s) => s.id)).not.toContain("nuevo-catalogo")
  })
})

// ─── Anclas data-tour: todo target de los tours debe EXISTIR en el código ────
// Glob RAW sobre landing/src buscando `data-tour="…"`. Si alguien borra un
// ancla de una página, este test truena señalando el target huérfano.

const RAW_SOURCES = import.meta.glob<string>("../../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
})

describe("targets de los tours contra anclas data-tour reales", () => {
  const files = Object.keys(RAW_SOURCES).filter((f) => !f.includes(".test."))
  const staticAnchors = new Set<string>()
  let layoutSource = ""
  for (const file of files) {
    const source = RAW_SOURCES[file] ?? ""
    for (const match of source.matchAll(/data-tour="([a-z0-9-]+)"/g)) {
      const anchor = match[1]
      if (anchor) staticAnchors.add(anchor)
    }
    if (file.endsWith("layouts/Layout.tsx")) layoutSource = source
  }

  const usedTargets = [
    ...new Set(
      TOURS.flatMap((t) =>
        t.steps.flatMap((s) => [
          ...(s.target ? [s.target] : []),
          ...(s.precondition?.target ? [s.precondition.target] : []),
        ]),
      ),
    ),
  ]

  it("se recolectaron anclas del código (sanity)", () => {
    expect(files.length).toBeGreaterThan(0)
    expect(staticAnchors.size).toBeGreaterThan(0)
    expect(layoutSource).not.toBe("")
  })

  it.each(usedTargets.map((t) => [t]))("el target '%s' apunta a un ancla existente", (target) => {
    if (target.startsWith("nav-")) {
      // Anclas del sidebar: se generan dinámicamente en Layout.tsx a partir de
      // la ruta (`data-tour={"nav-" + …}`). Validamos el patrón + la ruta.
      expect(layoutSource).toMatch(/data-tour=\{"nav-" \+/)
      const routePath = `/${target.slice("nav-".length)}`
      expect(layoutSource).toContain(`"${routePath}"`)
    } else {
      expect(staticAnchors.has(target)).toBe(true)
    }
  })
})
