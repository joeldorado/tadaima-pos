/**
 * Historial del Día en Caja (2026-10-19): con muchos tickets la lista se
 * agrupa por hora y se pinta por tandas. Lógica pura, sin React.
 */

/** Tickets que se pintan por tanda ("Mostrar N más"). */
export const HISTORIAL_PAGE_SIZE = 50;

export interface HourGroup<T> {
  /** Clave estable de la hora local ("2026-10-19T15"), o "sin-hora". */
  key: string;
  /** "3 p. m.", "12 a. m."… o "Sin hora". */
  label: string;
  /** Tickets de esa hora que se pintan ahora. */
  items: T[];
  /** Total de tickets de esa hora (aunque la tanda no los muestre todos). */
  total: number;
}

const NO_HOUR_KEY = "sin-hora";
const pad = (n: number): string => String(n).padStart(2, "0");

/** "3 p. m." para 15 h, "12 a. m." para 0 h (hora local, formato es-MX). */
export function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? "a. m." : "p. m."}`;
}

function hourKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}`;
}

/**
 * Agrupa por hora local respetando el orden de entrada (el historial ya viene
 * de lo más nuevo a lo más viejo). Si una hora reaparece más abajo se junta con
 * la primera. Lo que no tiene fecha válida va al final en "Sin hora".
 */
export function groupByHour<T>(
  items: readonly T[],
  dateOf: (item: T) => string | null | undefined,
): HourGroup<T>[] {
  const groups = new Map<string, HourGroup<T>>();
  const noHour: T[] = [];
  for (const item of items) {
    const raw = dateOf(item);
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) {
      noHour.push(item);
      continue;
    }
    const key = hourKey(date);
    const current = groups.get(key);
    groups.set(key, current
      ? { ...current, items: [...current.items, item], total: current.total + 1 }
      : { key, label: hourLabel(date.getHours()), items: [item], total: 1 });
  }
  const ordered = [...groups.values()];
  return noHour.length > 0
    ? [...ordered, { key: NO_HOUR_KEY, label: "Sin hora", items: noHour, total: noHour.length }]
    : ordered;
}

/**
 * Deja solo los primeros `limit` tickets (en orden), sin perder el `total` de
 * cada hora para el encabezado. Las horas que quedan vacías no se regresan.
 */
export function sliceGroups<T>(groups: readonly HourGroup<T>[], limit: number): HourGroup<T>[] {
  let left = Math.max(0, Math.floor(limit));
  const out: HourGroup<T>[] = [];
  for (const group of groups) {
    if (left <= 0) break;
    const items = group.items.slice(0, left);
    left -= items.length;
    out.push({ ...group, items });
  }
  return out;
}

/** Cuántos tickets hay en total en los grupos. */
export function countItems<T>(groups: readonly HourGroup<T>[]): number {
  return groups.reduce((acc, g) => acc + g.items.length, 0);
}

/** "3:42 p. m." — hora local de un ticket del día; "" si la fecha no sirve. */
export function ticketTime(raw: string | null | undefined): string {
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const hour = date.getHours();
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad(date.getMinutes())} ${hour < 12 ? "a. m." : "p. m."}`;
}
