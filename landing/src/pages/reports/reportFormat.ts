// Helpers de formato para los generadores de reporte (Excel/PDF).
// Copiados de ReportsPage.tsx para que los módulos de exportación no dependan
// del componente de página (evita imports circulares).
import { BUSINESS_TZ } from "@/lib/date";

/** Moneda MXN, sin decimales por defecto (es-MX). */
export const fmt = (n: number): string =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n ?? 0);

/**
 * Fecha anclada a la zona del NEGOCIO (México), no la del dispositivo: una
 * Mac/tablet en otra zona (Tijuana) mostraría el día equivocado cerca de medianoche.
 */
export const fmtDate = (iso: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const parts = iso.split("-").map(Number);
    const y = parts[0] ?? 2000;
    const m = parts[1] ?? 1;
    const d = parts[2] ?? 1;
    const safeUtcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return safeUtcNoon.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: BUSINESS_TZ });
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Fecha inválida";
  return parsed.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: BUSINESS_TZ });
};
