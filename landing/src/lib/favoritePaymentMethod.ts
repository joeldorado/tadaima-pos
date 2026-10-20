/**
 * Método de pago favorito de Caja (2026-10-09): el cajero marca UN método con
 * un check y cada venta nueva (y cada mesa nueva) arranca con él en vez de
 * Efectivo. Es por USUARIO en esa computadora (localStorage, sin backend):
 * en otra caja se vuelve a marcar. Las reglas de cobro (preventa sin Tarjeta
 * ni Mixto, productos solo efectivo/solo tarjeta, precio socio) siguen
 * mandando sobre el favorito — esto solo decide con qué método ARRANCA.
 */

export type FavoriteMethod = "Efectivo" | "Tarjeta" | "Transferencia" | "Mixto";

export interface FavoritePayment {
  method: FavoriteMethod;
  /** Solo Tarjeta: la terminal con la que arranca (la última que eligió el cajero). */
  terminalId?: number;
}

export interface StartingPayment {
  paymentMethod: FavoriteMethod;
  selectedTerminalId: number | undefined;
}

const KEY_BASE = "tadaima-caja-metodo-fav";
const METHODS: readonly FavoriteMethod[] = ["Efectivo", "Tarjeta", "Transferencia", "Mixto"];

const isMethod = (v: unknown): v is FavoriteMethod =>
  typeof v === "string" && (METHODS as readonly string[]).includes(v);

const isTerminalId = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;

/** Llave por usuario (mismo patrón que `draftKeyFor`): cada cajero ve solo el suyo. */
export function favoriteKey(userId: number | string | null | undefined): string {
  return `${KEY_BASE}:${userId ?? "anon"}`;
}

/** Solo Tarjeta lleva terminal; cualquier otra cosa se normaliza fuera. */
function normalize(method: FavoriteMethod, terminalId: unknown): FavoritePayment {
  return method === "Tarjeta" && isTerminalId(terminalId) ? { method, terminalId } : { method };
}

export function readFavoritePayment(userId: number | string | null | undefined): FavoritePayment | null {
  try {
    const raw = localStorage.getItem(favoriteKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { method, terminalId } = parsed as { method?: unknown; terminalId?: unknown };
    return isMethod(method) ? normalize(method, terminalId) : null;
  } catch {
    return null;
  }
}

/** `null` quita el favorito (la Caja vuelve a arrancar en Efectivo). */
export function saveFavoritePayment(
  userId: number | string | null | undefined,
  fav: FavoritePayment | null,
): void {
  try {
    if (fav) localStorage.setItem(favoriteKey(userId), JSON.stringify(fav));
    else localStorage.removeItem(favoriteKey(userId));
  } catch {
    // modo privado / storage lleno — el favorito es solo comodidad
  }
}

/** Con qué arranca una venta o mesa nueva: el favorito, o Efectivo si no hay. */
export function startingPayment(fav: FavoritePayment | null): StartingPayment {
  if (!fav) return { paymentMethod: "Efectivo", selectedTerminalId: undefined };
  return {
    paymentMethod: fav.method,
    selectedTerminalId: fav.method === "Tarjeta" ? fav.terminalId : undefined,
  };
}

/**
 * Click en el check: marca `method` como el único favorito, o lo quita si ya
 * lo era. Para Tarjeta guarda la terminal elegida en ese momento (si hay).
 */
export function toggleFavorite(
  current: FavoritePayment | null,
  method: FavoriteMethod,
  terminalId?: number,
): FavoritePayment | null {
  if (current?.method === method) return null;
  return normalize(method, terminalId);
}

/**
 * Cuando el cajero elige terminal y su favorito es Tarjeta, el favorito
 * recuerda esa terminal para la siguiente venta. Mismo objeto si no cambia.
 */
export function withFavoriteTerminal(
  fav: FavoritePayment | null,
  terminalId: number,
): FavoritePayment | null {
  if (fav?.method !== "Tarjeta" || fav.terminalId === terminalId) return fav;
  return normalize("Tarjeta", terminalId);
}
