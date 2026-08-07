import { spawn } from "node:child_process"
import path from "node:path"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import {
  CATEGORY_FILES,
  REPO_ROOT,
  TOURS_DATA_DIR,
  categoryFilePath,
  findTopicRaw,
  installArrivalOrdering,
  loadCorpusRaw,
  loadIconKeys,
  loadTourCheckNames,
  loadToursRaw,
  listDocImages,
  runInSlot,
  todayIso,
  writeJsonRaw,
  type CategoryFile,
  type RawTopic,
} from "./files.js"
import { DOC_ROLES, DocBlockSchema, DocTopicSchema, TourSchema, checkTableRows, checkTourStepIds } from "./schema.js"
import { validateCorpus } from "./validate.js"
import { coverageReport } from "./coverage.js"

/**
 * MCP de la Documentación-tutorial de Tadaima POS (`tadaima-docs`).
 *
 * Gestiona el Centro de Documentación in-app como DATOS del repo:
 * temas en landing/src/content/docs/data/*.json, tours guiados en
 * landing/src/content/tours/data/*.json y screenshots en
 * landing/src/assets/docs. NO usa el API de Laravel ni token — opera sobre
 * archivos. Todas las escrituras se serializan (ver files.ts).
 */

const server = new McpServer({ name: "tadaima-docs", version: "1.0.0" })

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] })
const fail = (e: unknown) => ({
  content: [{ type: "text" as const, text: `⚠️ ${e instanceof Error ? e.message : String(e)}` }],
  isError: true,
})

/** Localiza una sección por id o heading (exacto primero, luego case-insensitive). */
function findSectionIndex(topic: RawTopic, key: string): number {
  const sections = Array.isArray(topic["sections"]) ? (topic["sections"] as RawTopic[]) : []
  let idx = sections.findIndex((s) => s["id"] === key)
  if (idx === -1) idx = sections.findIndex((s) => s["heading"] === key)
  if (idx === -1) {
    const lower = key.toLowerCase()
    idx = sections.findIndex((s) => typeof s["heading"] === "string" && s["heading"].toLowerCase() === lower)
  }
  return idx
}

function sectionNames(topic: RawTopic): string {
  const sections = Array.isArray(topic["sections"]) ? (topic["sections"] as RawTopic[]) : []
  return sections
    .map((s, i) => `  [${i}] ${String(s["heading"] ?? "?")}${s["id"] ? ` (id: ${String(s["id"])})` : ""}`)
    .join("\n")
}

// ── 1. list_topics ───────────────────────────────────────────────────────────
server.tool(
  "list_topics",
  "Lista todos los temas del Centro de Documentación (landing/src/content/docs/data/*.json): slug, título, categoría, roles, tour asociado, updatedAt y número de secciones. Filtra por categoría (nombre visible o archivo) y/o por rol.",
  {
    category: z.string().optional().describe("Filtra por categoría visible (ej. 'Caja y ventas') o por archivo (ej. 'caja')"),
    role: z.enum(DOC_ROLES).optional().describe("Filtra temas visibles para este rol"),
  },
  async ({ category, role }, extra) =>
    runInSlot(extra.requestId, async () => {
      try {
        const corpus = await loadCorpusRaw()
        const lines: string[] = []
        let total = 0
        for (const file of CATEGORY_FILES) {
          const topics = corpus.get(file) ?? []
          for (const t of topics) {
            const cat = String(t["category"] ?? "")
            if (category) {
              const c = category.toLowerCase()
              if (cat.toLowerCase() !== c && file !== c) continue
            }
            const roles = Array.isArray(t["roles"]) ? (t["roles"] as string[]) : null
            if (role && roles && !roles.includes(role)) continue
            total++
            const sections = Array.isArray(t["sections"]) ? t["sections"].length : 0
            const meta = [
              roles ? `roles: ${roles.join("/")}` : "roles: todos",
              t["tourId"] ? `tour: ${String(t["tourId"])}` : null,
              t["updatedAt"] ? `updatedAt: ${String(t["updatedAt"])}` : null,
              `${sections} secciones`,
            ]
              .filter(Boolean)
              .join(" · ")
            lines.push(`  · ${String(t["slug"])} — ${String(t["title"])} [${cat} → data/${file}.json] (${meta})`)
          }
        }
        if (!total) return ok("Sin temas para ese filtro.")
        return ok(`TEMAS DE DOCUMENTACIÓN (${total}):\n\n${lines.join("\n")}`)
      } catch (e) {
        return fail(e)
      }
    })
)

// ── 2. get_topic ─────────────────────────────────────────────────────────────
server.tool(
  "get_topic",
  "Devuelve el JSON completo de un tema de documentación por slug, con el archivo de categoría donde vive.",
  { slug: z.string().describe("Slug del tema (ej. 'cobro-caja')") },
  async ({ slug }, extra) =>
    runInSlot(extra.requestId, async () => {
      try {
        const loc = await findTopicRaw(slug)
        if (!loc) return fail(new Error(`No existe el tema '${slug}'. Usa list_topics para ver los slugs.`))
        return ok(`Tema '${slug}' (data/${loc.file}.json, posición ${loc.index}):\n\n${JSON.stringify(loc.topic, null, 2)}`)
      } catch (e) {
        return fail(e)
      }
    })
)

// ── 3. upsert_topic ──────────────────────────────────────────────────────────
server.tool(
  "upsert_topic",
  "Crea o reemplaza un tema COMPLETO de documentación. Si el slug ya existe, lo reemplaza en su archivo actual (aunque difiera del category_file pedido — se avisa); si es nuevo, lo inserta en category_file en la posición dada o al final. Valida contra el schema y sella updatedAt.",
  {
    category_file: z.enum(CATEGORY_FILES).describe("Archivo de categoría destino (data/<file>.json)"),
    topic: DocTopicSchema.describe("El tema completo (DocTopicData)"),
    position: z.number().int().min(0).optional().describe("Índice de inserción para temas nuevos (default: al final)"),
  },
  async ({ category_file, topic, position }, extra) =>
    runInSlot(extra.requestId, async () => {
      try {
        const tableErrors = checkTableRows(topic, `tema '${topic.slug}'`)
        if (tableErrors.length) return fail(new Error(tableErrors.join("\n")))
        const stamped = { ...topic, updatedAt: topic.updatedAt ?? todayIso() }

        const existing = await findTopicRaw(topic.slug)
        if (existing) {
          const next = existing.topics.map((t, i) => (i === existing.index ? stamped : t))
          await writeJsonRaw(existing.filePath, next)
          const warn =
            existing.file !== category_file
              ? ` ⚠️ OJO: el tema ya vivía en data/${existing.file}.json (no en '${category_file}') — se reemplazó AHÍ, en su posición ${existing.index}.`
              : ""
          return ok(`✅ Tema '${topic.slug}' REEMPLAZADO en data/${existing.file}.json (posición ${existing.index}).${warn}`)
        }

        const filePath = categoryFilePath(category_file)
        const corpus = await loadCorpusRaw()
        const topics = corpus.get(category_file) ?? []
        const idx = position !== undefined ? Math.min(position, topics.length) : topics.length
        const next = [...topics.slice(0, idx), stamped, ...topics.slice(idx)]
        await writeJsonRaw(filePath, next)
        return ok(`✅ Tema '${topic.slug}' CREADO en data/${category_file}.json (posición ${idx} de ${next.length}).`)
      } catch (e) {
        return fail(e)
      }
    })
)

// ── 4. patch_topic ───────────────────────────────────────────────────────────
server.tool(
  "patch_topic",
  "Patch superficial de un tema SIN tocar sus secciones: title, summary, keywords, roles, tourId y/o updatedAt. Sella updatedAt automáticamente si no lo mandas. tourId con \"\" lo quita.",
  {
    slug: z.string().describe("Slug del tema a modificar"),
    set: z
      .object({
        title: z.string().optional().describe("Nuevo título"),
        summary: z.string().optional().describe("Nuevo resumen de una línea"),
        keywords: z.array(z.string()).optional().describe("Nuevos keywords (reemplaza el array completo)"),
        roles: z.array(z.enum(DOC_ROLES)).optional().describe("Nuevos roles (reemplaza; [] = todos los roles)"),
        tourId: z.string().optional().describe("Tour asociado; \"\" para quitarlo"),
        updatedAt: z.string().optional().describe("Fecha ISO explícita (default: hoy)"),
      })
      .describe("Campos a cambiar (solo los que mandes)"),
  },
  async ({ slug, set }, extra) =>
    runInSlot(extra.requestId, async () => {
      try {
        const loc = await findTopicRaw(slug)
        if (!loc) return fail(new Error(`No existe el tema '${slug}'.`))
        const changes: string[] = []
        const patched: RawTopic = { ...loc.topic }
        if (set.title !== undefined) (patched["title"] = set.title), changes.push("title")
        if (set.summary !== undefined) (patched["summary"] = set.summary), changes.push("summary")
        if (set.keywords !== undefined) (patched["keywords"] = set.keywords), changes.push("keywords")
        if (set.roles !== undefined) {
          if (set.roles.length === 0) delete patched["roles"]
          else patched["roles"] = set.roles
          changes.push("roles")
        }
        if (set.tourId !== undefined) {
          if (set.tourId === "") delete patched["tourId"]
          else patched["tourId"] = set.tourId
          changes.push("tourId")
        }
        if (!changes.length) return fail(new Error("Manda al menos un campo en set."))
        patched["updatedAt"] = set.updatedAt ?? todayIso()

        const parsed = DocTopicSchema.safeParse(patched)
        if (!parsed.success) return fail(new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n")))

        const next = loc.topics.map((t, i) => (i === loc.index ? patched : t))
        await writeJsonRaw(loc.filePath, next)
        return ok(`✅ Tema '${slug}' actualizado (${changes.join(", ")}) en data/${loc.file}.json. updatedAt: ${String(patched["updatedAt"])}.`)
      } catch (e) {
        return fail(e)
      }
    })
)

// ── 5. add_block ─────────────────────────────────────────────────────────────
server.tool(
  "add_block",
  "Inserta UN bloque validado (prose/steps/callout/chips/fields/table/image/link) en una sección de un tema. La sección se identifica por su id o su heading.",
  {
    slug: z.string().describe("Slug del tema"),
    section: z.string().describe("id o heading de la sección destino"),
    block: DocBlockSchema.describe("El bloque a insertar"),
    index: z.number().int().min(0).optional().describe("Posición dentro de blocks (default: al final)"),
  },
  async ({ slug, section, block, index }, extra) =>
    runInSlot(extra.requestId, async () => {
      try {
        if (block.kind === "table") {
          const errs = checkTableRows({ sections: [{ heading: "x", blocks: [block] }] }, "block")
          if (errs.length) return fail(new Error(errs.join("\n")))
        }
        const loc = await findTopicRaw(slug)
        if (!loc) return fail(new Error(`No existe el tema '${slug}'.`))
        const si = findSectionIndex(loc.topic, section)
        if (si === -1) {
          return fail(new Error(`No encontré la sección '${section}' en '${slug}'. Secciones disponibles:\n${sectionNames(loc.topic)}`))
        }
        const sections = loc.topic["sections"] as RawTopic[]
        const target = sections[si] as RawTopic
        const blocks = Array.isArray(target["blocks"]) ? (target["blocks"] as unknown[]) : []
        const bi = index !== undefined ? Math.min(index, blocks.length) : blocks.length
        const nextSection = { ...target, blocks: [...blocks.slice(0, bi), block, ...blocks.slice(bi)] }
        const patched = {
          ...loc.topic,
          sections: sections.map((s, i) => (i === si ? nextSection : s)),
          updatedAt: todayIso(),
        }
        const next = loc.topics.map((t, i) => (i === loc.index ? patched : t))
        await writeJsonRaw(loc.filePath, next)
        return ok(`✅ Bloque '${block.kind}' insertado en '${slug}' → sección "${String(target["heading"])}" (posición ${bi} de ${blocks.length + 1}).`)
      } catch (e) {
        return fail(e)
      }
    })
)

// ── 6. update_section ────────────────────────────────────────────────────────
server.tool(
  "update_section",
  "Reemplaza campos de una sección de un tema: heading, id y/o blocks (el array COMPLETO de bloques, validado). La sección se identifica por su id o heading actual.",
  {
    slug: z.string().describe("Slug del tema"),
    section: z.string().describe("id o heading ACTUAL de la sección"),
    heading: z.string().optional().describe("Nuevo heading"),
    id: z.string().optional().describe("Nuevo id (anchor); \"\" para quitarlo"),
    blocks: z.array(DocBlockSchema).optional().describe("Nuevo array completo de bloques (reemplaza)"),
  },
  async ({ slug, section, heading, id, blocks }, extra) =>
    runInSlot(extra.requestId, async () => {
      try {
        if (heading === undefined && id === undefined && blocks === undefined) {
          return fail(new Error("Manda al menos heading, id o blocks."))
        }
        if (blocks) {
          const errs = checkTableRows({ sections: [{ heading: "x", blocks }] }, "blocks")
          if (errs.length) return fail(new Error(errs.join("\n")))
        }
        const loc = await findTopicRaw(slug)
        if (!loc) return fail(new Error(`No existe el tema '${slug}'.`))
        const si = findSectionIndex(loc.topic, section)
        if (si === -1) {
          return fail(new Error(`No encontré la sección '${section}' en '${slug}'. Secciones disponibles:\n${sectionNames(loc.topic)}`))
        }
        const sections = loc.topic["sections"] as RawTopic[]
        const target = sections[si] as RawTopic
        const nextSection: RawTopic = { ...target }
        const changes: string[] = []
        if (heading !== undefined) (nextSection["heading"] = heading), changes.push("heading")
        if (id !== undefined) {
          if (id === "") delete nextSection["id"]
          else nextSection["id"] = id
          changes.push("id")
        }
        if (blocks !== undefined) (nextSection["blocks"] = blocks), changes.push(`blocks (${blocks.length})`)
        const patched = {
          ...loc.topic,
          sections: sections.map((s, i) => (i === si ? nextSection : s)),
          updatedAt: todayIso(),
        }
        const parsed = DocTopicSchema.safeParse(patched)
        if (!parsed.success) return fail(new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n")))
        const next = loc.topics.map((t, i) => (i === loc.index ? patched : t))
        await writeJsonRaw(loc.filePath, next)
        return ok(`✅ Sección "${String(target["heading"])}" de '${slug}' actualizada (${changes.join(", ")}).`)
      } catch (e) {
        return fail(e)
      }
    })
)

// ── 7. delete_topic ──────────────────────────────────────────────────────────
server.tool(
  "delete_topic",
  "⚠️ DESTRUCTIVO: elimina un tema completo de la documentación (con todas sus secciones y bloques) de su archivo de categoría. No hay papelera — la única vuelta atrás es git. Úsalo solo con confirmación explícita del usuario.",
  { slug: z.string().describe("Slug del tema a ELIMINAR definitivamente") },
  async ({ slug }, extra) =>
    runInSlot(extra.requestId, async () => {
      try {
        const loc = await findTopicRaw(slug)
        if (!loc) return fail(new Error(`No existe el tema '${slug}'.`))
        const next = loc.topics.filter((_, i) => i !== loc.index)
        await writeJsonRaw(loc.filePath, next)
        const sections = Array.isArray(loc.topic["sections"]) ? loc.topic["sections"].length : 0
        return ok(
          `🗑️ Tema '${slug}' ("${String(loc.topic["title"])}", ${sections} secciones) ELIMINADO de data/${loc.file}.json. Recuperable solo vía git.`
        )
      } catch (e) {
        return fail(e)
      }
    })
)

// ── 8. list_tours ────────────────────────────────────────────────────────────
server.tool(
  "list_tours",
  "Lista los tours guiados (landing/src/content/tours/data/*.json): id, título, tema asociado, roles y número de pasos. Si la carpeta aún no existe devuelve lista vacía con nota.",
  {},
  async (_args, extra) =>
    runInSlot(extra.requestId, async () => {
      try {
        const { tours, dirExists } = await loadToursRaw()
        if (!dirExists) return ok("Sin tours: la carpeta landing/src/content/tours/data aún no existe (los tours están en construcción).")
        if (!tours.length) return ok("La carpeta de tours existe pero está vacía.")
        const lines = tours.map(({ fileName, tour }) => {
          const steps = Array.isArray(tour["steps"]) ? tour["steps"].length : 0
          const roles = Array.isArray(tour["roles"]) ? (tour["roles"] as string[]).join("/") : "todos"
          const topic = tour["topicSlug"] ? ` · tema: ${String(tour["topicSlug"])}` : ""
          return `  · ${String(tour["id"] ?? fileName)} — ${String(tour["title"] ?? "?")} (${steps} pasos · roles: ${roles}${topic})`
        })
        return ok(`TOURS GUIADOS (${tours.length}):\n\n${lines.join("\n")}`)
      } catch (e) {
        return fail(e)
      }
    })
)

// ── 9. get_tour ──────────────────────────────────────────────────────────────
server.tool(
  "get_tour",
  "Devuelve el JSON completo de un tour guiado por id.",
  { id: z.string().describe("Id del tour (nombre del archivo sin .json)") },
  async ({ id }, extra) =>
    runInSlot(extra.requestId, async () => {
      try {
        const { tours, dirExists } = await loadToursRaw()
        if (!dirExists) return fail(new Error("La carpeta de tours aún no existe."))
        const found = tours.find(({ tour, fileName }) => tour["id"] === id || fileName === `${id}.json`)
        if (!found) {
          const ids = tours.map(({ tour, fileName }) => String(tour["id"] ?? fileName)).join(", ") || "(ninguno)"
          return fail(new Error(`No existe el tour '${id}'. Disponibles: ${ids}`))
        }
        return ok(`Tour '${id}' (tours/data/${found.fileName}):\n\n${JSON.stringify(found.tour, null, 2)}`)
      } catch (e) {
        return fail(e)
      }
    })
)

// ── 10. upsert_tour ──────────────────────────────────────────────────────────
server.tool(
  "upsert_tour",
  "Crea o reemplaza un tour guiado: valida contra el schema TourDefinition y escribe landing/src/content/tours/data/<id>.json (crea la carpeta si hace falta). Avisa si topicSlug no existe como tema.",
  { tour: TourSchema.describe("El tour completo (TourDefinition)") },
  async ({ tour }, extra) =>
    runInSlot(extra.requestId, async () => {
      try {
        const idErrors = checkTourStepIds(tour, `tour '${tour.id}'`)
        if (idErrors.length) return fail(new Error(idErrors.join("\n")))
        const checkNames = await loadTourCheckNames()
        if (checkNames !== null) {
          const badChecks = tour.steps
            .filter((s) => s.precondition && !checkNames.includes(s.precondition.check))
            .map((s) => `paso '${s.id}': precondition.check '${s.precondition?.check}' no existe en TOUR_CHECKS (válidos: ${checkNames.join(", ")})`)
          if (badChecks.length) return fail(new Error(badChecks.join("\n")))
        }
        const filePath = path.join(TOURS_DATA_DIR, `${tour.id}.json`)
        const { tours } = await loadToursRaw()
        const existed = tours.some(({ tour: t, fileName }) => t["id"] === tour.id || fileName === `${tour.id}.json`)
        await writeJsonRaw(filePath, tour)
        let warn = ""
        if (tour.topicSlug) {
          const topic = await findTopicRaw(tour.topicSlug)
          if (!topic) warn = ` ⚠️ topicSlug '${tour.topicSlug}' no existe como tema (¿typo o tema pendiente?).`
          else if (topic.topic["tourId"] !== tour.id) {
            warn = ` ℹ️ El tema '${tour.topicSlug}' no apunta de vuelta (tourId actual: ${String(topic.topic["tourId"] ?? "ninguno")}) — usa patch_topic para ligarlo.`
          }
        }
        return ok(`✅ Tour '${tour.id}' ${existed ? "REEMPLAZADO" : "CREADO"} (${tour.steps.length} pasos) en tours/data/${tour.id}.json.${warn}`)
      } catch (e) {
        return fail(e)
      }
    })
)

// ── 11. list_icons ───────────────────────────────────────────────────────────
server.tool(
  "list_icons",
  "Lista las keys de iconos válidas (ICON_MAP de landing/src/content/docs/icons.ts — solo lectura). Para usar un icono nuevo hay que agregarlo a ese archivo en landing.",
  {},
  async (_args, extra) =>
    runInSlot(extra.requestId, async () => {
      try {
        const keys = await loadIconKeys()
        return ok(`ICONOS VÁLIDOS (${keys.length} keys de ICON_MAP):\n\n${keys.map((k) => `  · ${k}`).join("\n")}`)
      } catch (e) {
        return fail(e)
      }
    })
)

// ── 12. list_images ──────────────────────────────────────────────────────────
server.tool(
  "list_images",
  "Lista los screenshots disponibles en landing/src/assets/docs (convención: <slug>/<nn>-<nombre>.png). Filtra por tema (subcarpeta).",
  { topic: z.string().optional().describe("Slug del tema para filtrar (subcarpeta de assets/docs)") },
  async ({ topic }, extra) =>
    runInSlot(extra.requestId, async () => {
      try {
        let images = await listDocImages()
        if (topic) images = images.filter((img) => img.startsWith(`${topic}/`))
        if (!images.length) {
          return ok(
            topic
              ? `Sin imágenes para '${topic}' en landing/src/assets/docs.`
              : "Sin imágenes en landing/src/assets/docs (¿aún no se capturan? Ver capture_screenshots)."
          )
        }
        return ok(`SCREENSHOTS (${images.length}) en landing/src/assets/docs:\n\n${images.map((i) => `  · ${i}`).join("\n")}`)
      } catch (e) {
        return fail(e)
      }
    })
)

// ── 13. validate ─────────────────────────────────────────────────────────────
server.tool(
  "validate",
  "Valida el corpus COMPLETO: JSON de temas y tours parsean y cumplen el schema, slugs únicos, iconos en ICON_MAP, image.src existen como archivo, link.toTopic existen, tourId ↔ tours, target de pasos existe como data-tour=\"...\" en landing/src y route de pasos existe en el router. Reporte agrupado ✅/⚠️/❌.",
  {},
  async (_args, extra) =>
    runInSlot(extra.requestId, async () => {
      try {
        return ok(await validateCorpus())
      } catch (e) {
        return fail(e)
      }
    })
)

// ── 14. coverage_report ──────────────────────────────────────────────────────
server.tool(
  "coverage_report",
  "Cruza los deploys del MASTERLOG.md (encabezados 'Sesión ... rev tadaima-XXXXX') desde una rev dada con el mapping curado coverage-map.json y el updatedAt de los temas: detecta features sin mapping, mappings a temas inexistentes y temas posiblemente desactualizados.",
  {
    since_rev: z
      .string()
      .regex(/^\d{1,5}$/, "número de rev, ej. '00134'")
      .optional()
      .describe("Rev desde la cual revisar (exclusiva). Default: 00134 (nacimiento del Centro de Documentación)"),
  },
  async ({ since_rev }, extra) =>
    runInSlot(extra.requestId, async () => {
      try {
        return ok(await coverageReport(since_rev ?? "00134"))
      } catch (e) {
        return fail(e)
      }
    })
)

// ── 15. capture_screenshots ──────────────────────────────────────────────────
server.tool(
  "capture_screenshots",
  "Corre la captura de screenshots de documentación: `npx playwright test tests/e2e/capture-docs.spec.ts` con DOCS_CAPTURE=1 (cwd = raíz del repo, timeout 5 min). ⚠️ REQUIERE el frontend local en :5173 y el backend en :8000 corriendo; si no, fallará. Las imágenes caen en landing/src/assets/docs.",
  { grep: z.string().optional().describe("Filtro --grep de Playwright para capturar solo algunos casos") },
  async ({ grep }) => {
    try {
      const args = ["playwright", "test", "tests/e2e/capture-docs.spec.ts"]
      if (grep) args.push("--grep", grep)
      const result = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolve) => {
        const child = spawn("npx", args, {
          cwd: REPO_ROOT,
          env: { ...process.env, DOCS_CAPTURE: "1" },
          timeout: 5 * 60_000,
        })
        let stdout = ""
        let stderr = ""
        let timedOut = false
        child.stdout.on("data", (d: Buffer) => (stdout += d.toString()))
        child.stderr.on("data", (d: Buffer) => (stderr += d.toString()))
        child.on("error", (err) => resolve({ code: null, stdout, stderr: `${stderr}\n${err.message}`, timedOut }))
        child.on("close", (code, signal) => {
          if (signal === "SIGTERM") timedOut = true
          resolve({ code, stdout, stderr, timedOut })
        })
      })
      const cap = (s: string) => (s.length > 4000 ? `…(recortado)…\n${s.slice(-4000)}` : s)
      const status = result.timedOut
        ? "⏱️ TIMEOUT a los 5 min (¿están corriendo el front :5173 y el backend :8000?)"
        : result.code === 0
          ? "✅ Captura completada"
          : `❌ Playwright salió con código ${result.code ?? "?"} (revisa que el front :5173 y backend :8000 estén corriendo)`
      return ok(
        `${status}\n\n── stdout ──\n${cap(result.stdout) || "(vacío)"}\n\n── stderr ──\n${cap(result.stderr) || "(vacío)"}`
      )
    } catch (e) {
      return fail(e)
    }
  }
)

// ── Arranque ─────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
// DESPUÉS de connect (el Protocol ya registró su onmessage): reserva turnos
// por orden de llegada para que un get tras un set del mismo batch lea fresco.
installArrivalOrdering(transport)
console.error("tadaima-docs MCP listo (stdio). Repo root:", REPO_ROOT)
