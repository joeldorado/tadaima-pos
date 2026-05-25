import { useEffect, useState } from "react";

/**
 * Fecha local YYYY-MM-DD del navegador.
 *
 * Por qué no `new Date().toISOString().split("T")[0]`:
 *  - `toISOString()` siempre devuelve UTC. En MX (UTC-6) después de las 6pm
 *    locales (00:00 UTC del día siguiente), el split da el día EQUIVOCADO.
 *  - Ejemplo: 22-may 19:00 MX = 23-may 01:00 UTC → toISOString → "2026-05-23"
 *    cuando para el usuario sigue siendo 22-may.
 */
export function getTodayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Convierte un Date al formato local YYYY-MM-DD del navegador.
 */
export function toLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toLocalYmd(d);
}
