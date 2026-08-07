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
export const TOUR_CHECKS_FILE = path.join(REPO_ROOT, "landing", "src", "content", "tours", "checks.ts")
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

// ── Cola de serialización por ORDEN DE LLEGADA ───────────────────────────────
// No basta con encolar dentro del handler: el SDK valida los args con
// `safeParseAsync` ANTES de invocarlo, y un input trivial (get_topic) resuelve
// en menos microtasks que uno profundo (upsert_topic) — el get se colaría
// ANTES que el set del mismo batch. Por eso el turno se reserva cuando el
// `tools/call` LLEGA por el pipe (installArrivalOrdering envuelve
// transport.onmessage) y el handler lo reclama con runInSlot(requestId, op).
// Si el handler nunca corre (p.ej. el parse falla), la respuesta de error que
// manda el SDK libera el turno (wrapper de transport.send) — y hay un timeout
// de seguridad para cualquier camino no previsto.

interface Gate {
  turn: Promise<void>
  release: () => void
  claimed: boolean
  timer?: NodeJS.Timeout
}

let tail: Promise<void> = Promise.resolve()
const slots = new Map<string, Gate>()
const UNCLAIMED_SLOT_TIMEOUT_MS = 120_000

function newGate(): Gate {
  let releaseDone!: () => void
  const done = new Promise<void>((resolve) => (releaseDone = resolve))
  const gate: Gate = {
    turn: tail,
    claimed: false,
    release: () => {
      if (gate.timer) clearTimeout(gate.timer)
      releaseDone()
    },
  }
  // El siguiente turno espera a mis predecesores Y a mí.
  tail = gate.turn.then(() => done)
  return gate
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

/** Tools cuyo turno NO se reserva (larguísimas y sin tocar el corpus JSON). */
const UNQUEUED_TOOLS = new Set(["capture_screenshots"])

function noteArrival(message: unknown): void {
  if (!isRecord(message) || message["method"] !== "tools/call" || message["id"] === undefined) return
  const params = message["params"]
  const name = isRecord(params) ? params["name"] : undefined
  if (typeof name === "string" && UNQUEUED_TOOLS.has(name)) return
  const gate = newGate()
  gate.timer = setTimeout(() => {
    if (!gate.claimed) gate.release()
  }, UNCLAIMED_SLOT_TIMEOUT_MS)
  gate.timer.unref?.()
  slots.set(String(message["id"]), gate)
}

function noteResponse(message: unknown): void {
  if (!isRecord(message) || message["id"] === undefined || "method" in message) return
  const key = String(message["id"])
  const gate = slots.get(key)
  if (gate && !gate.claimed) {
    slots.delete(key)
    gate.release()
  }
}

/**
 * Envuelve el transport (tras server.connect) para reservar turnos al llegar
 * cada tools/call y liberarlos si el SDK responde sin invocar el handler.
 */
export function installArrivalOrdering(transport: {
  onmessage?: ((...args: never[]) => void) | undefined
  send: (...args: never[]) => Promise<void>
}): void {
  const t = transport as {
    onmessage?: (message: unknown, extra?: unknown) => void
    send: (message: unknown, options?: unknown) => Promise<void>
  }
  const originalOnMessage = t.onmessage?.bind(t)
  if (originalOnMessage) {
    t.onmessage = (message, extra) => {
      try {
        noteArrival(message)
      } catch {
        /* nunca romper el dispatch por el ordering */
      }
      originalOnMessage(message, extra)
    }
  }
  const originalSend = t.send.bind(t)
  t.send = (message, options) => {
    try {
      noteResponse(message)
    } catch {
      /* idem */
    }
    return originalSend(message, options)
  }
}

/**
 * Corre `op` en el turno reservado para `requestId` (orden de llegada). Sin
 * ticket (id desconocido/undefined) crea un turno al final de la cola.
 */
export async function runInSlot<T>(requestId: unknown, op: () => Promise<T>): Promise<T> {
  const key = requestId === undefined ? undefined : String(requestId)
  let gate = key !== undefined ? slots.get(key) : undefined
  if (gate && key !== undefined) slots.delete(key)
  if (!gate) gate = newGate()
  gate.claimed = true
  if (gate.timer) clearTimeout(gate.timer)
  await gate.turn
  try {
    return await op()
  } finally {
    gate.release()
  }
}

/** Encadena una operación al final de la cola (sin ticket de llegada). */
export function enqueue<T>(op: () => Promise<T>): Promise<T> {
  return runInSlot(undefined, op)
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

/**
 * Keys de TOUR_CHECKS parseadas de tours/checks.ts (regex, solo lectura).
 * Devuelve null si el archivo aún no existe (tours en construcción).
 */
export async function loadTourCheckNames(): Promise<string[] | null> {
  let text: string
  try {
    text = await fs.readFile(TOUR_CHECKS_FILE, "utf8")
  } catch {
    return null
  }
  const start = text.indexOf("TOUR_CHECKS")
  const slice = start === -1 ? text : text.slice(start)
  const keys: string[] = []
  const re = /^\s*(?:"([a-z0-9-]+)"|([a-zA-Z0-9]+)):\s*(?:\(|async|function)/gm
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

export interface DataTourTargets {
  /** Valores literales: data-tour="x" o data-tour={'x'}. */
  literals: Set<string>
  /**
   * Prefijos de anclas DINÁMICAS: data-tour={"nav-" + …} o data-tour={`nav-${…}`}
   * (Layout.tsx genera nav-<ruta> en runtime — inescaneable estáticamente).
   */
  prefixes: Set<string>
}

/** Búsqueda recursiva propia (sin spawn) de valores data-tour="X" en landing/src/*.tsx. */
export async function collectDataTourTargets(): Promise<DataTourTargets> {
  const literals = new Set<string>()
  const prefixes = new Set<string>()
  async function scan(text: string): Promise<void> {
    const litRe = /data-tour=\{?["'`]([^"'`$]+)["'`]\}?/g
    let m: RegExpExecArray | null
    while ((m = litRe.exec(text)) !== null) {
      if (m[1]) literals.add(m[1])
    }
    const concatRe = /data-tour=\{\s*["'`]([A-Za-z0-9_-]+)["'`]\s*\+/g
    while ((m = concatRe.exec(text)) !== null) {
      if (m[1]) prefixes.add(m[1])
    }
    const tplRe = /data-tour=\{`([A-Za-z0-9_-]+)\$\{/g
    while ((m = tplRe.exec(text)) !== null) {
      if (m[1]) prefixes.add(m[1])
    }
  }
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
        await scan(await fs.readFile(full, "utf8"))
      }
    }
  }
  await walk(LANDING_SRC_DIR)
  return { literals, prefixes }
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
