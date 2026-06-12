import { useEffect, useState } from "react";

/**
 * Zona horaria del NEGOCIO. Decisión Joel 2026-06-11 (cierra el TODO #117):
 * las tiendas Tadaima operan en TIJUANA, así que el día de negocio corre en
 * `America/Tijuana` — antes estaba en America/Mexico_City y a las 11pm de
 * Tijuana el "Hoy" brincaba al día siguiente (medianoche CDMX) dejando la
 * lista de Ventas vacía. El backend usa la misma zona (`App\Support\DateRange`
 * + env BUSINESS_TIMEZONE). El "hoy" del frontend DEBE calcularse en esta
 * zona, NO en la del dispositivo (bug 2026-06-04): así una caja con el SO mal
 * configurado no cambia el día de negocio.
 */
export const BUSINESS_TZ = "America/Tijuana";

/** YYYY-MM-DD de un Date en la zona del negocio (robusto vía formatToParts). */
function ymdInBusinessTz(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Fecha "de hoy" YYYY-MM-DD en la zona del NEGOCIO (México), independiente de
 * la zona del dispositivo. Coincide con el filtro "hoy" del backend.
 */
export function getTodayLocal(): string {
  return ymdInBusinessTz(new Date());
}

/**
 * Convierte un Date a YYYY-MM-DD en la zona del NEGOCIO (México).
 */
export function toLocalYmd(d: Date): string {
  return ymdInBusinessTz(d);
}

/**
 * Hook reactivo con la fecha actual local. Cambia automáticamente al cruzar
 * medianoche sin requerir refresh del navegador. Útil en queryKeys de
 * dashboards / reportes "del día" para que re-fetch automático.
 *
 * El chequeo cada 60s es trivial (una comparación de strings) y mucho más
 * barato que recalcular en cada render del componente.
 */
export function useTodayLocal(): string {
  const [today, setToday] = useState<string>(getTodayLocal());
  useEffect(() => {
    const tick = () => {
      const now = getTodayLocal();
      if (now !== today) setToday(now);
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [today]);
  return today;
}

/**
 * Devuelve la fecha local YYYY-MM-DD desplazada N días atrás desde hoy.
 * Usado para rangos tipo "últimos 30 días" en reportes y filtros.
 */
export function daysAgoLocal(days: number): string {
  // Resta días sobre el "hoy" del negocio (no del dispositivo). Anclamos al
  // mediodía UTC del día de negocio para que restar días no salte por DST.
  const [y, m, d] = getTodayLocal().split("-").map(Number) as [number, number, number];
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() - days);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
}
