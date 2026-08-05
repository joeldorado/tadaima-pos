import { beforeEach, describe, expect, it, vi } from "vitest"
import { clearFormDraftStorage, createDebouncer, readFormDraft, writeFormDraft } from "./useFormDraft"

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
