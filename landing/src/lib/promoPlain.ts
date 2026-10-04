import { toLocalYmd } from "@/lib/date";
import { toDateInput } from "@/lib/promoInput";
import type { PromoViewer } from "@/lib/promoList";

/**
 * Textos en lenguaje llano para la pantalla de Promos: vigencia ("del 3 al 15
 * de octubre"), tienda, forma de pago y el resumen del asistente. Sin jerga.
 */

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

interface YmdParts {
  year: number;
  month: number;
  day: number;
}

function parseYmd(ymd: string): YmdParts {
  const [year = 0, month = 1, day = 1] = ymd.split("-").map(Number);
  return { year, month, day };
}

const monthName = (month: number): string => MESES[month - 1] ?? "";

function dayLabel(date: YmdParts, showYear: boolean): string {
  return `${date.day} de ${monthName(date.month)}${showYear ? ` de ${date.year}` : ""}`;
}

/**
 * Vigencia a partir de fechas planas YYYY-MM-DD ("" = sin fecha). `todayYmd`
 * es el día de negocio: decide "hasta/terminó" y si hace falta decir el año.
 */
export function formatVigenciaYmd(startYmd: string, endYmd: string, todayYmd: string): string {
  const currentYear = parseYmd(todayYmd).year;

  if (!startYmd && !endYmd) return "Sin fecha de fin";

  if (!startYmd) {
    const end = parseYmd(endYmd);
    const label = dayLabel(end, end.year !== currentYear);
    return endYmd >= todayYmd ? `Hasta el ${label}` : `Terminó el ${label}`;
  }

  if (!endYmd) {
    const start = parseYmd(startYmd);
    const label = dayLabel(start, start.year !== currentYear);
    return `${startYmd > todayYmd ? "Empieza" : "Desde"} el ${label}, sin fecha de fin`;
  }

  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  const endLabel = dayLabel(end, end.year !== currentYear);

  if (startYmd === endYmd) return `Solo el ${endLabel}`;
  if (start.year === end.year && start.month === end.month) return `Del ${start.day} al ${endLabel}`;

  // El año del inicio solo se dice si no coincide ni con el del fin ni con el actual.
  const startLabel = dayLabel(start, start.year !== end.year && start.year !== currentYear);
  return `Del ${startLabel} al ${endLabel}`;
}

/** Vigencia desde los ISO del server, leídos en el día de negocio (Tijuana). */
export function formatVigencia(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  now: Date,
): string {
  return formatVigenciaYmd(toDateInput(startsAt), toDateInput(endsAt), toLocalYmd(now));
}

/** Fecha suelta en español ("13 de octubre"), para "Empieza el …". */
export function formatDiaIso(iso: string | null | undefined, now: Date): string {
  const ymd = toDateInput(iso);
  if (!ymd) return "";
  const date = parseYmd(ymd);
  return dayLabel(date, date.year !== parseYmd(toLocalYmd(now)).year);
}

/** En qué tiendas aplica la promo, dicho para quien la está viendo. */
export function promoScopeLabel(
  storeId: number | null | undefined,
  viewer: PromoViewer,
  storeNames: ReadonlyMap<number, string>,
): string {
  if (storeId == null) return "Todas las tiendas";
  if (!viewer.isAdmin) return storeId === viewer.storeId ? "Solo tu tienda" : "Otra tienda";
  const name = storeNames.get(storeId);
  return name ? `Solo ${name}` : "Solo una tienda";
}

/** Aviso si la promo solo aplica con una forma de pago; null si no hay restricción. */
export function paymentRestrictionLabel(promo: { allow_cash?: boolean; allow_card?: boolean }): string | null {
  const cash = promo.allow_cash !== false;
  const card = promo.allow_card !== false;
  if (cash && card) return null;
  if (cash) return "Solo pagando en efectivo";
  if (card) return "Solo pagando con tarjeta";
  return "Sin forma de pago";
}

const MAX_CATEGORIES_IN_NAME = 2;

/** Nombre sugerido para una promo nueva: "2x1 en Mangas". */
export function suggestPromoName(label: string, fullCategories: readonly string[]): string {
  if (fullCategories.length === 0 || fullCategories.length > MAX_CATEGORIES_IN_NAME) return label;
  return `${label} en ${fullCategories.join(" y ")}`;
}

interface SummaryInput {
  label: string;
  productCount: number;
  fullCategories: readonly string[];
  looseCount: number;
  vigencia: string;
  scope: string;
}

function selectionDetail(fullCategories: readonly string[], looseCount: number): string {
  if (fullCategories.length === 0) return "";
  const categories = fullCategories.length === 1
    ? `toda la categoría ${fullCategories[0]}`
    : `las categorías ${fullCategories.join(", ")} completas`;
  const loose = looseCount > 0 ? ` + ${looseCount} suelto${looseCount === 1 ? "" : "s"}` : "";
  return ` (${categories}${loose})`;
}

/** El resumen del asistente antes de guardar, en una frase. */
export function promoSummarySentence(input: SummaryInput): string {
  const { label, productCount, fullCategories, looseCount, vigencia, scope } = input;
  const products = productCount === 0
    ? `${label} sin productos todavía`
    : `${label} en ${productCount.toLocaleString("es-MX")} producto${productCount === 1 ? "" : "s"}`
      + selectionDetail(fullCategories, looseCount);
  return `${products}. ${vigencia}. ${scope}.`;
}
