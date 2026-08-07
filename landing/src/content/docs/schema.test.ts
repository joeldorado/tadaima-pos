import { describe, expect, it } from "vitest"
import { validateTopicData } from "./schema"
import type { DocBlockData, DocTopicData } from "./schema"
import { ICON_MAP } from "./icons"
import { DOC_TOPICS } from "./index"
import primerosPasosData from "./data/primeros-pasos.json"
import catalogoData from "./data/catalogo.json"
import cajaData from "./data/caja.json"
import pedidosData from "./data/pedidos.json"
import inventarioData from "./data/inventario.json"
import clientesReportesData from "./data/clientes-reportes.json"
import adminData from "./data/admin.json"
import ayudaData from "./data/ayuda.json"

/** Mismo orden de categorías que `index.ts`. */
const ALL_FILES: [string, unknown[]][] = [
  ["primeros-pasos", primerosPasosData],
  ["catalogo", catalogoData],
  ["caja", cajaData],
  ["pedidos", pedidosData],
  ["inventario", inventarioData],
  ["clientes-reportes", clientesReportesData],
  ["admin", adminData],
  ["ayuda", ayudaData],
]

/** Temas ya validados (para los checks cruzados de slug/icon/link). */
const ALL_TOPICS: DocTopicData[] = ALL_FILES.flatMap(([source, topics]) =>
  topics.map((raw, i) => {
    const result = validateTopicData(raw, `${source}[${i}]`)
    if (!result.ok) throw new Error(result.errors.join("\n"))
    return result.value
  }),
)

describe("data/*.json contra validateTopicData", () => {
  it.each(ALL_FILES)("todos los temas de %s.json son válidos", (source, topics) => {
    topics.forEach((raw, i) => {
      const result = validateTopicData(raw, `${source}[${i}]`)
      expect(result.ok ? [] : result.errors).toEqual([])
    })
  })

  it("los slugs son únicos globalmente", () => {
    const slugs = ALL_TOPICS.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it("todo icon existe en ICON_MAP", () => {
    for (const topic of ALL_TOPICS) {
      expect(ICON_MAP[topic.icon], `icono '${topic.icon}' del tema '${topic.slug}'`).toBeDefined()
    }
  })

  it("todo link.toTopic apunta a un slug existente", () => {
    const slugs = new Set(ALL_TOPICS.map((t) => t.slug))
    for (const topic of ALL_TOPICS) {
      for (const section of topic.sections) {
        for (const block of section.blocks) {
          if (block.kind === "link") {
            expect(slugs.has(block.toTopic), `link roto '${block.toTopic}' en '${topic.slug}'`).toBe(true)
          }
        }
      }
    }
  })
})

describe("DOC_TOPICS (hidratado)", () => {
  it("hidrata exactamente 26 temas hoy", () => {
    expect(DOC_TOPICS).toHaveLength(26)
  })

  it("cada tema trae su icono resuelto como componente", () => {
    for (const topic of DOC_TOPICS) {
      expect(typeof topic.icon === "function" || typeof topic.icon === "object").toBe(true)
      expect(topic.icon).not.toBeNull()
    }
  })
})

describe("validateTopicData: casos inválidos", () => {
  const validTopic = (): Record<string, unknown> => ({
    slug: "tema-demo",
    title: "Tema demo",
    category: "Demo",
    icon: "book-open",
    summary: "Resumen.",
    sections: [{ heading: "Sección", blocks: [{ kind: "prose", text: "Hola" }] }],
  })

  it("acepta un tema mínimo válido", () => {
    expect(validateTopicData(validTopic()).ok).toBe(true)
  })

  it("acepta las extensiones nuevas (id, roles, keywords, tourId, updatedAt, image, link)", () => {
    const topic = {
      ...validTopic(),
      roles: ["admin", "gerente"],
      keywords: ["demo", "prueba"],
      tourId: "tour-demo",
      updatedAt: "2026-08-06",
      sections: [
        {
          id: "ancla",
          heading: "Sección",
          blocks: [
            { kind: "image", src: "/img/demo.png", alt: "Demo", caption: "Pie" } satisfies DocBlockData,
            { kind: "link", toTopic: "cobro-caja", label: "Ver cobro" } satisfies DocBlockData,
          ],
        },
      ],
    }
    const result = validateTopicData(topic)
    expect(result.ok ? [] : result.errors).toEqual([])
  })

  it("rechaza un no-objeto", () => {
    const result = validateTopicData("nope", "x")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toContain("x: debe ser un objeto")
  })

  it("rechaza slug que no es kebab-case", () => {
    const result = validateTopicData({ ...validTopic(), slug: "Con Espacios" }, "demo[0]")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("demo[0].slug")
  })

  it("rechaza kind desconocido con la ruta del bloque", () => {
    const topic = validTopic()
    topic["sections"] = [{ heading: "S", blocks: [{ kind: "x" }] }]
    const result = validateTopicData(topic, "caja[0]")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("caja[0].sections[0].blocks[0]: kind desconocido 'x'")
    }
  })

  it("rechaza tone inválido en callout y en chips", () => {
    const topic = validTopic()
    topic["sections"] = [
      {
        heading: "S",
        blocks: [
          { kind: "callout", tone: "rojo", title: "T", text: "t" },
          { kind: "chips", chips: [{ label: "L", tone: "morado" }] },
        ],
      },
    ]
    const result = validateTopicData(topic)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("tone inválido 'rojo'")
      expect(result.errors.join("\n")).toContain("tone inválido 'morado'")
    }
  })

  it("rechaza rol inválido", () => {
    const result = validateTopicData({ ...validTopic(), roles: ["superadmin"] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("rol inválido 'superadmin'")
  })

  it("rechaza fila de tabla con celdas de más", () => {
    const topic = validTopic()
    topic["sections"] = [
      { heading: "S", blocks: [{ kind: "table", head: ["A", "B"], rows: [["1", "2", "3"]] }] },
    ]
    const result = validateTopicData(topic)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join("\n")).toContain("3 celdas pero head tiene 2")
  })

  it("rechaza campos requeridos faltantes con su ruta", () => {
    const result = validateTopicData({ slug: "solo-slug" }, "demo[0]")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const joined = result.errors.join("\n")
      for (const key of ["title", "category", "icon", "summary", "sections"]) {
        expect(joined).toContain(`demo[0].${key}`)
      }
    }
  })
})
