import { useCallback, useEffect, useRef, useState } from "react"

interface DraftEnvelope<T> {
  version: number
  savedAt: number
  data: T
}

const DEFAULT_DEBOUNCE_MS = 400
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24h — un borrador más viejo no se auto-restaura

/**
 * Lee un borrador de localStorage. `null` si no existe, el JSON está
 * corrupto, la versión no coincide (forma vieja tras un cambio) o expiró.
 */
export function readFormDraft<T>(key: string, version: number, maxAgeMs = DEFAULT_MAX_AGE_MS): T | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DraftEnvelope<T>
    if (!parsed || parsed.version !== version) return null
    if (Date.now() - parsed.savedAt > maxAgeMs) return null
    return parsed.data
  } catch {
    return null
  }
}

/**
 * Escribe el borrador. Silencioso ante cuota llena / modo privado (mismo
 * patrón que useCart.ts) — nunca debe bloquear la UI.
 */
export function writeFormDraft<T>(key: string, version: number, data: T): void {
  if (typeof window === "undefined") return
  try {
    const envelope: DraftEnvelope<T> = { version, savedAt: Date.now(), data }
    window.localStorage.setItem(key, JSON.stringify(envelope))
  } catch {
    // almacenamiento lleno / modo privado — no bloquear la UI
  }
}

export function clearFormDraftStorage(key: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // no-op
  }
}

/** Llave del borrador por usuario (2026-09-30): cada quien ve solo el suyo. */
export function draftKeyFor(base: string, userId: number | string | null | undefined): string {
  return `${base}:${userId ?? "anon"}`
}

/** ¿Los datos son iguales a los valores iniciales del formulario? (= no hay nada capturado). */
export function isEmptyDraft<T>(data: T, emptyValue: T | undefined): boolean {
  if (emptyValue === undefined) return false
  try {
    return stableStringify(data) === stableStringify(emptyValue)
  } catch {
    return false
  }
}

/** JSON con llaves ordenadas: el orden en que se armó el objeto no importa. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v)
}

/**
 * Pasa un borrador de la llave vieja (sin usuario) a la nueva, una sola vez,
 * para no perder lo que estaban capturando al deployar. No pisa uno nuevo.
 */
export function migrateLegacyDraft(legacyKey: string, key: string): void {
  if (typeof window === "undefined" || legacyKey === key) return
  try {
    const legacy = window.localStorage.getItem(legacyKey)
    if (legacy === null) return
    if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, legacy)
    window.localStorage.removeItem(legacyKey)
  } catch {
    // no-op
  }
}

export interface Debouncer<T> {
  schedule: (data: T) => void
  cancel: () => void
  /** Corre YA la escritura pendiente (si hay). */
  flush: () => void
  /** En pausa no se agenda ni se escribe nada (mientras se guarda el alta). */
  setPaused: (paused: boolean) => void
  isPaused: () => boolean
}

/**
 * Debounce simple sin librería: agrupa `schedule()` rápidos y solo corre
 * `run` con el último valor tras `delayMs` de inactividad.
 */
export function createDebouncer<T>(run: (data: T) => void, delayMs: number): Debouncer<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: { data: T } | null = null
  let paused = false
  return {
    schedule(data: T) {
      if (paused) return
      if (timer) clearTimeout(timer)
      pending = { data }
      timer = setTimeout(() => {
        timer = null
        const p = pending
        pending = null
        if (p) run(p.data)
      }, delayMs)
    },
    cancel() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      pending = null
    },
    flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      const p = pending
      pending = null
      if (p) run(p.data)
    },
    setPaused(value: boolean) {
      paused = value
    },
    isPaused() {
      return paused
    },
  }
}

export interface UseFormDraftOptions<T> {
  /** Clave localStorage, p.ej. draftKeyFor("tadaima-product-draft", user.id) */
  key: string
  /** Llave vieja (sin usuario) a migrar una vez a `key`. */
  legacyKey?: string
  /** Valores iniciales del form: si los datos son iguales, no hay borrador. */
  emptyValue?: T
  /** Alternativa a `emptyValue` cuando el form vacío no es un objeto fijo. */
  isEmpty?: (data: T) => boolean
  /** Sube esta versión si cambia la forma persistida — descarta borradores viejos sin migrarlos. */
  version?: number
  /** false en modo edición: no lee ni escribe (p.ej. `!editingProduct`). */
  enabled?: boolean
  debounceMs?: number
  maxAgeMs?: number
}

export interface UseFormDraft<T> {
  /** Snapshot leído UNA vez al montar (o null si no había/estaba disabled/vacío). */
  draft: T | null
  /** Llamar en cada cambio relevante del form — debounced internamente. */
  saveDraft: (data: T) => void
  /** Cancela cualquier escritura pendiente y borra el borrador. */
  clearDraft: () => void
  /** Deja de escribir (mientras se guarda: cerrar a media creación no reescribe). */
  pauseDraft: () => void
  resumeDraft: () => void
}

/**
 * Borrador de formulario en localStorage (Joel 2026-08-05): protege contra
 * perder datos capturados cuando algo interrumpe la sesión ANTES de
 * guardar — recarga, tab cerrada por accidente, crash del navegador.
 *
 * Desde 2026-09-30 el borrador SOBREVIVE a cerrar el modal (X, Cancelar,
 * clic afuera): solo se borra al crear con éxito o con "Limpiar datos". Al
 * desmontar y en `pagehide` se escribe lo pendiente; mientras se guarda se
 * pausa; y si los datos son los iniciales (`emptyValue`) no hay borrador.
 */
export function useFormDraft<T>(options: UseFormDraftOptions<T>): UseFormDraft<T> {
  const {
    key,
    legacyKey,
    emptyValue,
    isEmpty,
    version = 1,
    enabled = true,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    maxAgeMs = DEFAULT_MAX_AGE_MS,
  } = options

  const empty = (data: T): boolean => (isEmpty ? isEmpty(data) : isEmptyDraft(data, emptyValue))

  const [draft] = useState<T | null>(() => {
    if (!enabled) return null
    if (legacyKey) migrateLegacyDraft(legacyKey, key)
    const found = readFormDraft<T>(key, version, maxAgeMs)
    if (found === null || empty(found)) return null
    return found
  })

  const debouncerRef = useRef<Debouncer<T> | null>(null)
  if (debouncerRef.current == null) {
    debouncerRef.current = createDebouncer<T>((data) => writeFormDraft(key, version, data), debounceMs)
  }

  // Cerrar el modal o la pestaña escribe lo pendiente (antes se descartaba).
  useEffect(() => {
    if (!enabled) return
    const flush = () => debouncerRef.current?.flush()
    window.addEventListener("pagehide", flush)
    return () => {
      window.removeEventListener("pagehide", flush)
      flush()
    }
  }, [enabled])

  const saveDraft = useCallback(
    (data: T) => {
      if (!enabled || debouncerRef.current?.isPaused()) return
      if (empty(data)) {
        // Nada capturado (o se regresó a vacío): no dejar borrador.
        debouncerRef.current?.cancel()
        clearFormDraftStorage(key)
        return
      }
      debouncerRef.current?.schedule(data)
    },
    // emptyValue/isEmpty los define el caller una vez (constantes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, key],
  )

  const clearDraft = useCallback(() => {
    // `enabled=false` (p.ej. modo edición) significa que esta instancia no
    // administra ningún borrador bajo `key` — limpiar igual borraría un
    // borrador de OTRA sesión de alta que sigue en progreso.
    if (!enabled) return
    debouncerRef.current?.cancel()
    clearFormDraftStorage(key)
  }, [enabled, key])

  const pauseDraft = useCallback(() => {
    // Primero se escribe lo pendiente: si el guardado falla, el borrador trae
    // lo último que se tecleó.
    debouncerRef.current?.flush()
    debouncerRef.current?.setPaused(true)
  }, [])

  const resumeDraft = useCallback(() => {
    debouncerRef.current?.setPaused(false)
  }, [])

  return { draft, saveDraft, clearDraft, pauseDraft, resumeDraft }
}
