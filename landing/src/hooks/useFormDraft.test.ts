import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearFormDraftStorage,
  createDebouncer,
  draftKeyFor,
  isEmptyDraft,
  migrateLegacyDraft,
  readFormDraft,
  writeFormDraft,
} from "./useFormDraft"

// vitest corre en env node: se stubbea window.localStorage con un Map (mismo
// patrón que StorePickPopover.test.ts/ticketPrint.test.ts).
const storage = new Map<string, string>()
beforeEach(() => {
  storage.clear()
  ;(globalThis as Record<string, unknown>)["window"] = {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    },
  }
})

interface Payload {
  name: string
  qty: number
}

describe("readFormDraft / writeFormDraft", () => {
  it("round-trip: escribe y lee el mismo objeto", () => {
    writeFormDraft<Payload>("k", 1, { name: "Goku", qty: 3 })
    expect(readFormDraft<Payload>("k", 1)).toEqual({ name: "Goku", qty: 3 })
  })

  it("clave inexistente devuelve null", () => {
    expect(readFormDraft<Payload>("no-existe", 1)).toBeNull()
  })

  it("JSON corrupto en storage devuelve null, no revienta", () => {
    storage.set("k", "{ esto no es json")
    expect(readFormDraft<Payload>("k", 1)).toBeNull()
  })

  it("versión distinta a la esperada descarta el borrador", () => {
    writeFormDraft<Payload>("k", 1, { name: "Goku", qty: 3 })
    expect(readFormDraft<Payload>("k", 2)).toBeNull()
  })

  it("savedAt más viejo que maxAgeMs descarta el borrador", () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    writeFormDraft<Payload>("k", 1, { name: "Goku", qty: 3 })
    vi.setSystemTime(1000 * 60 * 60 * 25) // 25h después
    expect(readFormDraft<Payload>("k", 1, 1000 * 60 * 60 * 24)).toBeNull()
    vi.useRealTimers()
  })

  it("setItem que revienta (cuota llena) no propaga el error", () => {
    ;(globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem = () => {
      throw new Error("QuotaExceededError")
    }
    expect(() => writeFormDraft<Payload>("k", 1, { name: "Goku", qty: 3 })).not.toThrow()
  })
})

describe("clearFormDraftStorage", () => {
  it("borra la clave; una lectura posterior devuelve null", () => {
    writeFormDraft<Payload>("k", 1, { name: "Goku", qty: 3 })
    clearFormDraftStorage("k")
    expect(readFormDraft<Payload>("k", 1)).toBeNull()
  })
})

describe("createDebouncer", () => {
  beforeEach(() => vi.useFakeTimers())

  it("agrupa varios schedule() rápidos y corre run() una sola vez con el último valor", () => {
    const run = vi.fn()
    const debouncer = createDebouncer<number>(run, 400)

    debouncer.schedule(1)
    vi.advanceTimersByTime(100)
    debouncer.schedule(2)
    vi.advanceTimersByTime(100)
    debouncer.schedule(3)
    vi.advanceTimersByTime(400)

    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(3)
  })

  it("cancel() evita la ejecución pendiente", () => {
    const run = vi.fn()
    const debouncer = createDebouncer<number>(run, 400)

    debouncer.schedule(1)
    debouncer.cancel()
    vi.advanceTimersByTime(500)

    expect(run).not.toHaveBeenCalled()
  })
})

describe("createDebouncer.flush (2026-09-30)", () => {
  beforeEach(() => vi.useFakeTimers())

  it("flush() corre YA lo pendiente (cerrar el modal no pierde lo último tecleado)", () => {
    const run = vi.fn()
    const debouncer = createDebouncer<number>(run, 400)

    debouncer.schedule(7)
    debouncer.flush()
    expect(run).toHaveBeenCalledWith(7)
    vi.advanceTimersByTime(500)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("en pausa no agenda nada; al reanudar vuelve a guardar", () => {
    const run = vi.fn()
    const debouncer = createDebouncer<number>(run, 400)

    debouncer.setPaused(true)
    debouncer.schedule(1)
    vi.advanceTimersByTime(500)
    expect(run).not.toHaveBeenCalled()
    expect(debouncer.isPaused()).toBe(true)

    debouncer.setPaused(false)
    debouncer.schedule(2)
    vi.advanceTimersByTime(500)
    expect(run).toHaveBeenCalledWith(2)
  })

  it("flush() sin nada pendiente no hace nada", () => {
    const run = vi.fn()
    createDebouncer<number>(run, 400).flush()
    expect(run).not.toHaveBeenCalled()
  })
})

describe("isEmptyDraft", () => {
  it("igual a los valores iniciales = vacío (abrir y cerrar no deja borrador)", () => {
    expect(isEmptyDraft({ name: "", qty: 0 }, { name: "", qty: 0 })).toBe(true)
    expect(isEmptyDraft({ name: "Goku", qty: 0 }, { name: "", qty: 0 })).toBe(false)
    expect(isEmptyDraft({ name: "", qty: 0 }, undefined)).toBe(false)
    expect(isEmptyDraft({ qty: 0, name: "" }, { name: "", qty: 0 })).toBe(true) // el orden no importa
  })
})

describe("draftKeyFor", () => {
  it("un borrador por usuario", () => {
    expect(draftKeyFor("tadaima-product-draft", 7)).toBe("tadaima-product-draft:7")
    expect(draftKeyFor("tadaima-product-draft", undefined)).toBe("tadaima-product-draft:anon")
  })
})

describe("migrateLegacyDraft", () => {
  it("pasa el borrador de la llave vieja a la nueva y borra la vieja", () => {
    writeFormDraft<Payload>("old", 1, { name: "Goku", qty: 3 })
    migrateLegacyDraft("old", "new")
    expect(readFormDraft<Payload>("new", 1)).toEqual({ name: "Goku", qty: 3 })
    expect(storage.has("old")).toBe(false)
  })

  it("si ya hay borrador en la llave nueva, no lo pisa; solo borra la vieja", () => {
    writeFormDraft<Payload>("old", 1, { name: "Viejo", qty: 1 })
    writeFormDraft<Payload>("new", 1, { name: "Nuevo", qty: 2 })
    migrateLegacyDraft("old", "new")
    expect(readFormDraft<Payload>("new", 1)).toEqual({ name: "Nuevo", qty: 2 })
    expect(storage.has("old")).toBe(false)
  })
})
