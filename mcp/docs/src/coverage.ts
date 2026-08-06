/**
 * Cobertura de documentación vs deploys del MASTERLOG.
 *
 * Parsea los encabezados de sesión del MASTERLOG.md de la raíz:
 *   ### Sesión YYYY-MM-DD ... — Título — DEPLOYADO rev `tadaima-XXXXX-xxx`
 * (con o sin backticks, con `(N)` de sesión múltiple, fechas `07-30/31`, etc.)
 * y cruza cada rev con el mapping curado feature→temas de coverage-map.json y
 * el `updatedAt` de los temas.
 */
import { promises as fs } from "node:fs"
import {
  COVERAGE_MAP_FILE,
  MASTERLOG_FILE,
  loadCorpusRaw,
  readJsonRaw,
} from "./files.js"

export interface SessionRev {
  rev: string // "00166"
  date: string // "2026-08-05" (primera fecha del encabezado)
  title: string
}

const HEADER_RE = /^### Sesión\s+(\d{4}-\d{2}-\d{2})\S*\s*(?:\(\d+\))?\s*—\s*(.+)$/
const REV_RE = /tadaima-(\d{5})/g

function cleanTitle(afterDash: string): string {
  return afterDash
    .replace(/\s*—\s*DEPLOYADOS?\b.*$/i, "")
    .replace(/\s*—\s*revs?\b.*$/i, "")
    .replace(/\s*DEPLOYADOS?\b.*$/i, "")
    .trim()
}

/** Sesiones del MASTERLOG que traen rev(s) tadaima-XXXXX. */
export async function parseMasterlog(): Promise<SessionRev[]> {
  const text = await fs.readFile(MASTERLOG_FILE, "utf8")
  const sessions: SessionRev[] = []
  for (const line of text.split("\n")) {
    const header = HEADER_RE.exec(line)
    if (!header) continue
    const date = header[1] ?? ""
    const title = cleanTitle(header[2] ?? "")
    REV_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = REV_RE.exec(line)) !== null) {
      const rev = m[1]
      if (rev && !sessions.some((s) => s.rev === rev)) {
        sessions.push({ rev, date, title })
      }
    }
  }
  return sessions
}

export async function coverageReport(sinceRev: string): Promise<string> {
  const since = sinceRev.padStart(5, "0")
  const sessions = (await parseMasterlog()).filter((s) => s.rev > since)
  sessions.sort((a, b) => (a.rev < b.rev ? -1 : 1))

  const map = await readJsonRaw<Record<string, string[]>>(COVERAGE_MAP_FILE)

  // slug → updatedAt de todos los temas
  const topicDates = new Map<string, string | undefined>()
  const corpus = await loadCorpusRaw()
  for (const topics of corpus.values()) {
    for (const t of topics) {
      if (typeof t["slug"] === "string") {
        topicDates.set(t["slug"], typeof t["updatedAt"] === "string" ? t["updatedAt"] : undefined)
      }
    }
  }

  const covered: string[] = []
  const unmapped: string[] = []
  const brokenMappings: string[] = []
  const staleTopics: string[] = []

  for (const s of sessions) {
    const mapped = map[s.rev]
    if (!mapped || !mapped.length) {
      unmapped.push(`rev ${s.rev} (${s.date}) — ${s.title}`)
      continue
    }
    const notes: string[] = []
    for (const slug of mapped) {
      if (!topicDates.has(slug)) {
        brokenMappings.push(`rev ${s.rev} → tema '${slug}' NO existe en el corpus`)
        notes.push(`${slug} ❌inexistente`)
        continue
      }
      const updatedAt = topicDates.get(slug)
      if (!updatedAt || updatedAt < s.date) {
        staleTopics.push(
          `rev ${s.rev} (${s.date}) → tema '${slug}' con updatedAt ${updatedAt ?? "(sin fecha)"} — posiblemente desactualizado`
        )
        notes.push(`${slug} ⚠️desactualizado`)
      } else {
        notes.push(`${slug} ✅`)
      }
    }
    covered.push(`rev ${s.rev} (${s.date}) — ${s.title} → ${notes.join(", ")}`)
  }

  // Mappings del archivo que apuntan a revs sin encabezado de sesión. Algunas
  // revs viejas viven como FILAS DE TABLA del MASTERLOG (| NNN | Área | ... rev
  // `tadaima-XXXXX-xxx` ... |), no como '### Sesión' — se distinguen aquí.
  const knownRevs = new Set(sessions.map((s) => s.rev))
  const masterlogText = await fs.readFile(MASTERLOG_FILE, "utf8")
  const orphanMapRevs = Object.keys(map)
    .filter((rev) => rev > since && !knownRevs.has(rev))
    .map((rev) =>
      masterlogText.includes(`tadaima-${rev}`)
        ? `${rev} (está en el MASTERLOG como fila de tabla, no como encabezado de sesión)`
        : `${rev} (no aparece en el MASTERLOG)`
    )

  const lines: string[] = [
    `COBERTURA DE DOCUMENTACIÓN — deploys desde rev ${since} (MASTERLOG.md × coverage-map.json × updatedAt)`,
    "",
    `Sesiones con rev encontradas: ${sessions.length}`,
    "",
  ]
  if (covered.length) {
    lines.push(`✅ Revs con mapping (${covered.length}):`)
    lines.push(...covered.map((c) => `  · ${c}`))
    lines.push("")
  }
  if (unmapped.length) {
    lines.push(`⚠️ Features SIN mapping en coverage-map.json (${unmapped.length}) — decidir si necesitan doc:`)
    lines.push(...unmapped.map((u) => `  ⚠️ ${u}`))
    lines.push("")
  }
  if (staleTopics.length) {
    lines.push(`⚠️ Temas mapeados con updatedAt anterior a la rev (${staleTopics.length}):`)
    lines.push(...staleTopics.map((t) => `  ⚠️ ${t}`))
    lines.push("")
  }
  if (brokenMappings.length) {
    lines.push(`❌ Mappings a temas inexistentes (${brokenMappings.length}):`)
    lines.push(...brokenMappings.map((b) => `  ❌ ${b}`))
    lines.push("")
  }
  if (orphanMapRevs.length) {
    lines.push(`⚠️ Revs en coverage-map.json sin encabezado de sesión en el MASTERLOG (${orphanMapRevs.length}):`)
    lines.push(...orphanMapRevs.map((o) => `  ⚠️ ${o}`))
    lines.push("")
  }
  if (!unmapped.length && !staleTopics.length && !brokenMappings.length) {
    lines.push("Todo cubierto: cada rev tiene mapping y sus temas están al día. 🎉")
  }
  return lines.join("\n").trimEnd()
}
