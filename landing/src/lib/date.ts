import { useEffect, useState } from "react";

/**
 * Zona horaria del NEGOCIO. Todas las tiendas operan en hora de México y el
 * backend filtra "hoy" con esta misma zona (`App\Support\DateRange` →
 * `America/Mexico_City`). El "hoy" del frontend DEBE calcularse en esta zona,
 * NO en la del dispositivo.
 *
 * Por qué no la zona del dispositivo: una tablet/Mac configurada en otra zona
 * (p.ej. Tijuana UTC-7) calcula un día distinto cerca de medianoche. Una venta
 * hecha a las 00:04 hora MX (= 23:04 en Tijuana) se archiva en el día MX por el
 * backend, pero el dispositivo pide el día anterior → la venta "desaparece" del
 * historial del día. Anclando a la zona del negocio, frontend y backend siempre
 * coinciden. (Bug 2026-06-04.)
 */
export const BUSINESS_TZ = "America/Mexico_City";

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
