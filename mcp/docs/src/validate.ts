/**
 * Validación cruzada del corpus completo de documentación + tours.
 *
 * Checks: JSON parsea y valida contra el schema zod; slugs únicos; iconos en
 * ICON_MAP; image.src existe como archivo; link.toTopic existe; tourId de
 * temas ↔ tours existentes; target de pasos existe como data-tour="X" en
 * landing/src (*.tsx, búsqueda recursiva propia); route de pasos existe en el
 * router; roles válidos (vía schema). Reporte agrupado ✅ / ⚠️ / ❌.
 */
import path from "node:path"
import {
  ASSETS_DOCS_DIR,
  CATEGORY_FILES,
  LANDING_SRC_DIR,
  REPO_ROOT,
  categoryFilePath,
  collectDataTourTargets,
  fileExists,
  loadIconKeys,
  loadRouterPaths,
  loadToursRaw,
  readJsonRaw,
  routeExists,
  type RawTopic,
} from "./files.js"
import {
  DocTopicSchema,
  TourSchema,
  checkTableRows,
  checkTourStepIds,
  formatZodErrors,
  type DocTopicData,
  type TourDefinition,
} from "./schema.js"
import { loadTourCheckNames } from "./files.js"

interface Report {
  passed: string[]
  warnings: string[]
  errors: string[]
}

/** Candidatos de resolución para un image.src (varias convenciones toleradas). */
function imageSrcCandidates(src: string): string[] {
  const stripped = src.replace(/^\/+/, "")
  const candidates = [
    path.join(REPO_ROOT, stripped),
    path.join(LANDING_SRC_DIR, stripped),
    path.join(ASSETS_DOCS_DIR, stripped),
    path.join(REPO_ROOT, "landing", stripped),
  ]
  if (src.startsWith("@/")) candidates.unshift(path.join(LANDING_SRC_DIR, src.slice(2)))
  if (src.startsWith("../") || src.startsWith("./")) {
    // relativo al dir de los data/*.json
    candidates.unshift(path.resolve(path.join(LANDING_SRC_DIR, "content", "docs", "data"), src))
  }
  return candidates
}

async function imageSrcExists(src: string): Promise<boolean> {
  for (const candidate of imageSrcCandidates(src)) {
    if (await fileExists(candidate)) return true
  }
  return false
}

export async function validateCorpus(): Promise<string> {
  const report: Report = { passed: [], warnings: [], errors: [] }

  // 1. Parse + schema de los 8 archivos de categoría
  const validTopics: { file: string; topic: DocTopicData }[] = []
  let parsedFiles = 0
  for (const file of CATEGORY_FILES) {
    let data: unknown
    try {
      data = await readJsonRaw(categoryFilePath(file))
    } catch (e) {
      report.errors.push(e instanceof Error ? e.message : String(e))
      continue
    }
    if (!Array.isArray(data)) {
      report.errors.push(`data/${file}.json: debe ser un array de temas`)
      continue
    }
    parsedFiles++
    ;(data as RawTopic[]).forEach((raw, i) => {
      const parsed = DocTopicSchema.safeParse(raw)
      if (!parsed.success) {
        report.errors.push(...formatZodErrors(parsed.error, `${file}[${i}]`))
        return
      }
      const tableErrors = checkTableRows(parsed.data, `${file}[${i}]`)
      if (tableErrors.length) {
        report.errors.push(...tableErrors)
        return
      }
      validTopics.push({ file, topic: parsed.data })
    })
  }
  report.passed.push(`${parsedFiles}/${CATEGORY_FILES.length} archivos de categoría parsean como JSON`)
  report.passed.push(`${validTopics.length} temas válidos contra el schema`)

  // 2. Slugs únicos
  const slugCount = new Map<string, string[]>()
  for (const { file, topic } of validTopics) {
    const list = slugCount.get(topic.slug) ?? []
    list.push(file)
    slugCount.set(topic.slug, list)
  }
  const dupes = [...slugCount.entries()].filter(([, files]) => files.length > 1)
  for (const [slug, files] of dupes) {
    report.errors.push(`slug duplicado '${slug}' en: ${files.join(", ")}`)
  }
  if (!dupes.length) report.passed.push("slugs únicos en todo el corpus")
  const slugs = new Set(slugCount.keys())

  // 3. Iconos ∈ ICON_MAP
  let iconKeys: string[] = []
  try {
    iconKeys = await loadIconKeys()
    const iconSet = new Set(iconKeys)
    const badIcons = validTopics.filter(({ topic }) => !iconSet.has(topic.icon))
    for (const { file, topic } of badIcons) {
      report.errors.push(`${file}/${topic.slug}: icono '${topic.icon}' no existe en ICON_MAP (icons.ts)`)
    }
    if (!badIcons.length) report.passed.push(`iconos válidos (ICON_MAP tiene ${iconKeys.length} keys)`)
  } catch (e) {
    report.errors.push(`no pude leer icons.ts: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 4. image.src existe + link.toTopic existe
  let imageCount = 0
  let linkCount = 0
  for (const { file, topic } of validTopics) {
    for (const [si, section] of topic.sections.entries()) {
      for (const [bi, block] of section.blocks.entries()) {
        const where = `${file}/${topic.slug} sections[${si}].blocks[${bi}]`
        if (block.kind === "image") {
          imageCount++
          if (!/^https?:\/\//.test(block.src) && !(await imageSrcExists(block.src))) {
            report.errors.push(`${where}: image.src '${block.src}' no existe como archivo`)
          }
        } else if (block.kind === "link") {
          linkCount++
          if (!slugs.has(block.toTopic)) {
            report.errors.push(`${where}: link.toTopic '${block.toTopic}' no es un tema existente`)
          }
        }
      }
    }
  }
  report.passed.push(`${imageCount} bloques image y ${linkCount} bloques link revisados`)

  // 5. Tours: schema + cruces con temas, data-tour y rutas
  const { tours, dirExists } = await loadToursRaw()
  const validTours: TourDefinition[] = []
  if (!dirExists) {
    report.warnings.push("landing/src/content/tours/data aún no existe — tours sin validar (se tolera)")
  } else {
    for (const { fileName, tour } of tours) {
      const parsed = TourSchema.safeParse(tour)
      if (!parsed.success) {
        report.errors.push(...formatZodErrors(parsed.error, `tours/${fileName}`))
        continue
      }
      if (fileName !== `${parsed.data.id}.json`) {
        report.warnings.push(`tours/${fileName}: el archivo no se llama como su id ('${parsed.data.id}.json')`)
      }
      const idErrors = checkTourStepIds(parsed.data, `tours/${fileName}`)
      if (idErrors.length) {
        report.errors.push(...idErrors)
        continue
      }
      validTours.push(parsed.data)
    }
    report.passed.push(`${validTours.length}/${tours.length} tours válidos contra el schema`)
  }
  const tourIds = new Set(validTours.map((t) => t.id))

  // topic.tourId → tour existente
  for (const { file, topic } of validTopics) {
    if (!topic.tourId) continue
    if (tourIds.has(topic.tourId)) continue
    if (!dirExists) {
      report.warnings.push(`${file}/${topic.slug}: tourId '${topic.tourId}' aún sin tour (carpeta de tours no existe)`)
    } else {
      report.errors.push(`${file}/${topic.slug}: tourId '${topic.tourId}' no existe en tours/data`)
    }
  }
  // tour.topicSlug → tema existente
  for (const tour of validTours) {
    if (tour.topicSlug && !slugs.has(tour.topicSlug)) {
      report.errors.push(`tour '${tour.id}': topicSlug '${tour.topicSlug}' no es un tema existente`)
    }
    if (tour.icon && iconKeys.length && !iconKeys.includes(tour.icon)) {
      report.errors.push(`tour '${tour.id}': icono '${tour.icon}' no existe en ICON_MAP`)
    }
  }

  // targets data-tour, rutas del router y checks de precondición (solo si hay tours)
  if (validTours.length) {
    const targets = await collectDataTourTargets()
    const routerPaths = await loadRouterPaths()
    const checkNames = await loadTourCheckNames()

    /** Un target es válido si es literal, o si cae en un prefijo dinámico conocido
     *  (nav-<ruta> se resuelve contra el router; otros prefijos solo avisan). */
    const checkTarget = (target: string, where: string, field: string): void => {
      if (targets.literals.has(target)) return
      for (const prefix of targets.prefixes) {
        if (!target.startsWith(prefix)) continue
        if (prefix === "nav-") {
          const suffix = target.slice(prefix.length)
          if (suffix === "inicio" || routeExists(`/${suffix}`, routerPaths)) return
          report.errors.push(`${where}: ${field} '${target}' — el ancla nav-* existe pero '/${suffix}' no es ruta del router`)
          return
        }
        report.warnings.push(`${where}: ${field} '${target}' es un ancla dinámica ('${prefix}…') — no verificable estáticamente`)
        return
      }
      report.errors.push(`${where}: ${field} '${target}' no existe como data-tour="..." en landing/src`)
    }

    for (const tour of validTours) {
      for (const step of tour.steps) {
        const where = `tour '${tour.id}' paso '${step.id}'`
        if (step.target) checkTarget(step.target, where, "target")
        if (step.route && !routeExists(step.route, routerPaths)) {
          report.errors.push(`${where}: route '${step.route}' no existe en el router`)
        }
        if (step.precondition) {
          if (checkNames === null) {
            report.warnings.push(`${where}: precondition.check sin validar (tours/checks.ts aún no existe)`)
          } else if (!checkNames.includes(step.precondition.check)) {
            report.errors.push(`${where}: precondition.check '${step.precondition.check}' no existe en TOUR_CHECKS (válidos: ${checkNames.join(", ")})`)
          }
          if (step.precondition.target) checkTarget(step.precondition.target, where, "precondition.target")
        }
      }
    }
    report.passed.push(
      `targets/rutas/checks de ${validTours.length} tours cruzados contra landing/src (${targets.literals.size} data-tour literales + ${targets.prefixes.size} prefijos dinámicos${checkNames ? `, ${checkNames.length} checks` : ""})`
    )
  }

  // ── Formato del reporte ────────────────────────────────────────────────────
  const lines: string[] = ["VALIDACIÓN DEL CORPUS DE DOCUMENTACIÓN", ""]
  lines.push(`✅ Correcto (${report.passed.length}):`)
  lines.push(...report.passed.map((p) => `  ✅ ${p}`))
  if (report.warnings.length) {
    lines.push("", `⚠️ Avisos (${report.warnings.length}):`)
    lines.push(...report.warnings.map((w) => `  ⚠️ ${w}`))
  }
  if (report.errors.length) {
    lines.push("", `❌ Errores (${report.errors.length}):`)
    lines.push(...report.errors.map((e) => `  ❌ ${e}`))
  } else {
    lines.push("", "❌ Errores: ninguno — corpus en verde.")
  }
  return lines.join("\n")
}
