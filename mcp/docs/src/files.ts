/**
 * Acceso a archivos del corpus de documentación (lectura/escritura de JSON).
 *
 * GOTCHA documentado del repo: las llamadas MCP llegan por el MISMO pipe stdio
 * y corren CONCURRENTES — un `get_topic` inmediatamente después de un
 * `upsert_topic` en el mismo batch podría leer el archivo viejo. Por eso TODAS
 * las operaciones (lecturas incluidas) se encadenan en una cola de promesas:
 * los handlers envuelven su cuerpo completo en `enqueue(...)` y así cada
 * read-modify-write es atómico respecto a los demás tools.
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// ── Resolución del root del repo ─────────────────────────────────────────────
// Preferencia: env TADAIMA_REPO_ROOT. Fallback: relativo a este módulo —
// dist/files.js vive en mcp/docs/dist, así que ../../.. es la raíz del repo
// (igual funciona corriendo con tsx desde mcp/docs/src). Esto hace al server
// independiente del cwd con el que lo arranque el cliente MCP.
const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export const REPO_ROOT = process.env.TADAIMA_REPO_ROOT
  ? path.resolve(process.env.TADAIMA_REPO_ROOT)
  : path.resolve(moduleDir, "..", "..", "..")

export const DOCS_DATA_DIR = path.join(REPO_ROOT, "landing", "src", "content", "docs", "data")
export const TOURS_DATA_DIR = path.join(REPO_ROOT, "landing", "src", "content", "tours", "data")
export const ICONS_FILE = path.join(REPO_ROOT, "landing", "src", "content", "docs", "icons.ts")
export const ASSETS_DOCS_DIR = path.join(REPO_ROOT, "landing", "src", "assets", "docs")
export const ROUTER_FILE = path.join(REPO_ROOT, "landing", "src", "router", "index.tsx")
export const MASTERLOG_FILE = path.join(REPO_ROOT, "MASTERLOG.md")
export const COVERAGE_MAP_FILE = path.resolve(moduleDir, "..", "coverage-map.json")
export const LANDING_SRC_DIR = path.join(REPO_ROOT, "landing", "src")

/** Los 8 archivos de categoría de la documentación (data/<file>.json). */
export const CATEGORY_FILES = [
  "primeros-pasos",
  "catalogo",
  "caja",
  "pedidos",
  "inventario",
  "clientes-reportes",
  "admin",
  "ayuda",
] as const
export type CategoryFile = (typeof CATEGORY_FILES)[number]

export function categoryFilePath(file: CategoryFile): string {
  return path.join(DOCS_DATA_DIR, `${file}.json`)
}

// ── Cola de serialización ────────────────────────────────────────────────────
let queue: Promise<unknown> = Promise.resolve()

/** Encadena una operación en la cola global; los errores no rompen la cadena. */
export function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op)
  queue = run.catch(() => undefined)
  return run
}

// ── Helpers crudos (usar SOLO dentro de una operación ya encolada) ───────────

export async function readJsonRaw<T = unknown>(file: string): Promise<T> {
  const text = await fs.readFile(file, "utf8")
  try {
    return JSON.parse(text) as T
  } catch (e) {
    throw new Error(`${path.relative(REPO_ROOT, file)}: JSON inválido — ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Escritura estándar del corpus: pretty 2 espacios + newline final. */
export async function writeJsonRaw(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

export async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

// ── Corpus de temas ──────────────────────────────────────────────────────────

export type RawTopic = Record<string, unknown>

export interface TopicLocation {
  file: CategoryFile
  filePath: string
  index: number
  topics: RawTopic[]
  topic: RawTopic
}

/** Lee los 8 archivos de categoría → Map archivo → array crudo de temas. */
export async function loadCorpusRaw(): Promise<Map<CategoryFile, RawTopic[]>> {
  const corpus = new Map<CategoryFile, RawTopic[]>()
  for (const file of CATEGORY_FILES) {
    const data = await readJsonRaw(categoryFilePath(file))
    if (!Array.isArray(data)) {
      throw new Error(`data/${file}.json: debe ser un array de temas`)
    }
    corpus.set(file, data as RawTopic[])
  }
  return corpus
}

/** Localiza un tema por slug en cualquiera de los 8 archivos. */
export async function findTopicRaw(slug: string): Promise<TopicLocation | null> {
  const corpus = await loadCorpusRaw()
  for (const [file, topics] of corpus) {
    const index = topics.findIndex((t) => t["slug"] === slug)
    if (index !== -1) {
      const topic = topics[index]
      if (!topic) continue
      return { file, filePath: categoryFilePath(file), index, topics, topic }
    }
  }
  return null
}

// ── Tours (tolerantes a que la carpeta aún no exista) ────────────────────────

export interface RawTourFile {
  fileName: string
  tour: Record<string, unknown>
}

/** Lee todos los tours de tours/data. Carpeta ausente → lista vacía. */
export async function loadToursRaw(): Promise<{ tours: RawTourFile[]; dirExists: boolean }> {
  let entries: string[]
  try {
    entries = await fs.readdir(TOURS_DATA_DIR)
  } catch {
    return { tours: [], dirExists: false }
  }
  const tours: RawTourFile[] = []
  for (const fileName of entries.filter((f) => f.endsWith(".json")).sort()) {
    const tour = await readJsonRaw<Record<string, unknown>>(path.join(TOURS_DATA_DIR, fileName))
    tours.push({ fileName, tour })
  }
  return { tours, dirExists: true }
}

// ── Utilidades varias ────────────────────────────────────────────────────────

/** Fecha de hoy en ISO (YYYY-MM-DD) para el sello updatedAt. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Keys de ICON_MAP parseadas de icons.ts (solo lectura, regex). */
export async function loadIconKeys(): Promise<string[]> {
  const text = await fs.readFile(ICONS_FILE, "utf8")
  const start = text.indexOf("ICON_MAP")
  const slice = start === -1 ? text : text.slice(start)
  const keys: string[] = []
  const re = /^\s*(?:"([a-z0-9-]+)"|([a-zA-Z0-9]+)):\s*[A-Z][A-Za-z0-9]*\s*,?\s*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(slice)) !== null) {
    const key = m[1] ?? m[2]
    if (key) keys.push(key)
  }
  return keys
}

/** Lista PNGs bajo landing/src/assets/docs (recursivo, rutas relativas al dir). */
export async function listDocImages(): Promise<string[]> {
  const results: string[] = []
  async function walk(dir: string, prefix: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel)
      else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) results.push(rel)
    }
  }
  await walk(ASSETS_DOCS_DIR, "")
  return results.sort()
}

/** Búsqueda recursiva propia (sin spawn) de valores data-tour="X" en landing/src/*.tsx. */
export async function collectDataTourTargets(): Promise<Set<string>> {
  const targets = new Set<string>()
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue
        await walk(full)
      } else if (entry.name.endsWith(".tsx")) {
        const text = await fs.readFile(full, "utf8")
        const re = /data-tour=\{?["'`]([^"'`]+)["'`]\}?/g
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          if (m[1]) targets.add(m[1])
        }
      }
    }
  }
  await walk(LANDING_SRC_DIR)
  return targets
}

/** Patterns `path: '...'` del router de landing. */
export async function loadRouterPaths(): Promise<string[]> {
  const text = await fs.readFile(ROUTER_FILE, "utf8")
  const paths: string[] = []
  const re = /path:\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[1]) paths.push(m[1])
  }
  return paths
}

/** ¿La ruta de un paso de tour existe en el router? (segmentos, params `:x` comodín). */
export function routeExists(route: string, patterns: string[]): boolean {
  const clean = (route.split(/[?#]/)[0] ?? "").replace(/^\/+|\/+$/g, "")
  const segs = clean === "" ? [] : clean.split("/")
  return patterns.some((p) => {
    const pc = p.replace(/^\/+|\/+$/g, "")
    const psegs = pc === "" ? [] : pc.split("/")
    if (psegs.length !== segs.length) return false
    return psegs.every((ps, i) => ps.startsWith(":") || ps === segs[i])
  })
}
