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

export interface Debouncer<T> {
  schedule: (data: T) => void
  cancel: () => void
}

/**
 * Debounce simple sin librería: agrupa `schedule()` rápidos y solo corre
 * `run` con el último valor tras `delayMs` de inactividad.
 */
export function createDebouncer<T>(run: (data: T) => void, delayMs: number): Debouncer<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    schedule(data: T) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        run(data)
      }, delayMs)
    },
    cancel() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}

export interface UseFormDraftOptions {
  /** Clave localStorage, p.ej. "tadaima-product-draft" */
  key: string
  /** Sube esta versión si cambia la forma persistida — descarta borradores viejos sin migrarlos. */
  version?: number
  /** false en modo edición: no lee ni escribe (p.ej. `!editingProduct`). */
  enabled?: boolean
  debounceMs?: number
  maxAgeMs?: number
}

export interface UseFormDraft<T> {
  /** Snapshot leído UNA vez al montar (o null si no había/estaba disabled). */
  draft: T | null
  /** Llamar en cada cambio relevante del form — debounced internamente. */
  saveDraft: (data: T) => void
  /** Cancela cualquier escritura pendiente y borra el borrador. */
  clearDraft: () => void
}

/**
 * Borrador de formulario en localStorage (Joel 2026-08-05): protege contra
 * perder datos capturados cuando algo interrumpe la sesión ANTES de
 * guardar — recarga, tab cerrada por accidente, crash del navegador. Es
 * un complemento del patrón try/await/catch de cierre-solo-en-éxito (que
 * protege contra errores de validación), no un reemplazo.
 */
export function useFormDraft<T>(options: UseFormDraftOptions): UseFormDraft<T> {
  const {
    key,
    version = 1,
    enabled = true,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    maxAgeMs = DEFAULT_MAX_AGE_MS,
  } = options

  const [draft] = useState<T | null>(() => (enabled ? readFormDraft<T>(key, version, maxAgeMs) : null))

  const debouncerRef = useRef<Debouncer<T> | null>(null)
  if (!debouncerRef.current) {
    debouncerRef.current = createDebouncer<T>((data) => writeFormDraft(key, version, data), debounceMs)
  }
  useEffect(() => () => debouncerRef.current?.cancel(), [])

  const saveDraft = useCallback(
    (data: T) => {
      if (enabled) debouncerRef.current?.schedule(data)
    },
    [enabled],
  )

  const clearDraft = useCallback(() => {
    // `enabled=false` (p.ej. modo edición) significa que esta instancia no
    // administra ningún borrador bajo `key` — limpiar igual borraría un
    // borrador de OTRA sesión de alta que sigue en progreso.
    if (!enabled) return
    debouncerRef.current?.cancel()
    clearFormDraftStorage(key)
  }, [enabled, key])

  return { draft, saveDraft, clearDraft }
}
