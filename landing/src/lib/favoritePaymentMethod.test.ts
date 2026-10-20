import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  favoriteKey,
  readFavoritePayment,
  saveFavoritePayment,
  startingPayment,
  toggleFavorite,
  withFavoriteTerminal,
} from "./favoritePaymentMethod";

// vitest corre en environment node — localStorage se stubbea con un Map.
function stubLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  });
  return store;
}

let store: Map<string, string>;
beforeEach(() => {
  store = stubLocalStorage();
});

describe("favoriteKey", () => {
  it("es por usuario y cae a anon sin sesión", () => {
    expect(favoriteKey(7)).toBe("tadaima-caja-metodo-fav:7");
    expect(favoriteKey(undefined)).toBe("tadaima-caja-metodo-fav:anon");
    expect(favoriteKey(null)).toBe("tadaima-caja-metodo-fav:anon");
  });
});

describe("readFavoritePayment / saveFavoritePayment", () => {
  it("round-trip por usuario: otro usuario no ve el favorito", () => {
    saveFavoritePayment(7, { method: "Transferencia" });

    expect(readFavoritePayment(7)).toEqual({ method: "Transferencia" });
    expect(readFavoritePayment(8)).toBeNull();
  });

  it("Tarjeta conserva la terminal", () => {
    saveFavoritePayment(7, { method: "Tarjeta", terminalId: 3 });
    expect(readFavoritePayment(7)).toEqual({ method: "Tarjeta", terminalId: 3 });
  });

  it("null borra la llave", () => {
    saveFavoritePayment(7, { method: "Mixto" });
    saveFavoritePayment(7, null);

    expect(readFavoritePayment(7)).toBeNull();
    expect(store.has(favoriteKey(7))).toBe(false);
  });

  it("tolera basura: JSON roto, método inválido o terminal inválida", () => {
    store.set(favoriteKey(1), "{no es json");
    expect(readFavoritePayment(1)).toBeNull();

    store.set(favoriteKey(1), JSON.stringify({ method: "Dólares" }));
    expect(readFavoritePayment(1)).toBeNull();

    store.set(favoriteKey(1), JSON.stringify("Efectivo"));
    expect(readFavoritePayment(1)).toBeNull();

    // Terminal inválida → se descarta la terminal, se respeta el método.
    store.set(favoriteKey(1), JSON.stringify({ method: "Tarjeta", terminalId: -2 }));
    expect(readFavoritePayment(1)).toEqual({ method: "Tarjeta" });

    // Solo Tarjeta lleva terminal.
    store.set(favoriteKey(1), JSON.stringify({ method: "Efectivo", terminalId: 4 }));
    expect(readFavoritePayment(1)).toEqual({ method: "Efectivo" });
  });

  it("sin localStorage (o si truena) no rompe la Caja", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("bloqueado"); },
      setItem: () => { throw new Error("lleno"); },
      removeItem: () => { throw new Error("bloqueado"); },
    });

    expect(readFavoritePayment(7)).toBeNull();
    expect(() => saveFavoritePayment(7, { method: "Efectivo" })).not.toThrow();
    expect(() => saveFavoritePayment(7, null)).not.toThrow();
  });
});

describe("startingPayment", () => {
  it("sin favorito arranca en Efectivo (como siempre)", () => {
    expect(startingPayment(null)).toEqual({ paymentMethod: "Efectivo", selectedTerminalId: undefined });
  });

  it("Tarjeta arranca con su terminal", () => {
    expect(startingPayment({ method: "Tarjeta", terminalId: 3 }))
      .toEqual({ paymentMethod: "Tarjeta", selectedTerminalId: 3 });
    expect(startingPayment({ method: "Tarjeta" }))
      .toEqual({ paymentMethod: "Tarjeta", selectedTerminalId: undefined });
  });

  it("otros métodos arrancan sin terminal", () => {
    expect(startingPayment({ method: "Transferencia" }))
      .toEqual({ paymentMethod: "Transferencia", selectedTerminalId: undefined });
    expect(startingPayment({ method: "Mixto" }))
      .toEqual({ paymentMethod: "Mixto", selectedTerminalId: undefined });
  });
});

describe("toggleFavorite", () => {
  it("marca un método nuevo (solo uno: reemplaza al anterior)", () => {
    expect(toggleFavorite(null, "Transferencia")).toEqual({ method: "Transferencia" });
    expect(toggleFavorite({ method: "Transferencia" }, "Mixto")).toEqual({ method: "Mixto" });
  });

  it("tocar el favorito actual lo desmarca", () => {
    expect(toggleFavorite({ method: "Mixto" }, "Mixto")).toBeNull();
    expect(toggleFavorite({ method: "Tarjeta", terminalId: 3 }, "Tarjeta")).toBeNull();
  });

  it("Tarjeta guarda la terminal que esté elegida; otros la ignoran", () => {
    expect(toggleFavorite(null, "Tarjeta", 5)).toEqual({ method: "Tarjeta", terminalId: 5 });
    expect(toggleFavorite(null, "Tarjeta")).toEqual({ method: "Tarjeta" });
    expect(toggleFavorite(null, "Efectivo", 5)).toEqual({ method: "Efectivo" });
  });
});

describe("withFavoriteTerminal", () => {
  it("actualiza la terminal solo si el favorito es Tarjeta", () => {
    expect(withFavoriteTerminal({ method: "Tarjeta", terminalId: 3 }, 9))
      .toEqual({ method: "Tarjeta", terminalId: 9 });
    expect(withFavoriteTerminal({ method: "Tarjeta" }, 9))
      .toEqual({ method: "Tarjeta", terminalId: 9 });
  });

  it("devuelve el mismo objeto cuando no hay nada que cambiar", () => {
    const fav = { method: "Tarjeta" as const, terminalId: 3 };
    expect(withFavoriteTerminal(fav, 3)).toBe(fav);

    const efectivo = { method: "Efectivo" as const };
    expect(withFavoriteTerminal(efectivo, 9)).toBe(efectivo);
    expect(withFavoriteTerminal(null, 9)).toBeNull();
  });
});
