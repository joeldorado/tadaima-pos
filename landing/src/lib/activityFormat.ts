import type { ActivityEvent, ActivityGroup } from "@tadaima/api";
import { BUSINESS_TZ } from "@/lib/date";

/**
 * Formato del feed de Actividad (Administración → Actividad). Espejo en
 * español de `backend/app/Support/ActivityGroups.php`: etiquetas y color por
 * grupo, nombres de los campos de `meta.changes` y el "detalle" legible de
 * cada evento. Lógica pura con test al lado.
 */

export interface GroupStyle {
  label: string;
  /** Color de texto/borde del badge. */
  color: string;
  /** Triplete RGB para fondos translúcidos. */
  rgb: string;
}

export const GROUP_STYLES: Record<ActivityGroup, GroupStyle> = {
  stock:     { label: "Stock",      color: "#60A5FA", rgb: "96,165,250" },
  producto:  { label: "Producto",   color: "#A78BFA", rgb: "167,139,250" },
  venta:     { label: "Venta",      color: "#34D399", rgb: "52,211,153" },
  caja:      { label: "Caja",       color: "#FBBF24", rgb: "251,191,36" },
  paquete:   { label: "Paquete",    color: "#F472B6", rgb: "244,114,182" },
  preventa:  { label: "Preventa",   color: "#22D3EE", rgb: "34,211,238" },
  insumo:    { label: "Insumo",     color: "#FB923C", rgb: "251,146,60" },
  sistema:   { label: "Sistema",    color: "#9CA3AF", rgb: "156,163,175" },
  impresion: { label: "Impresión",  color: "#94A3B8", rgb: "148,163,184" },
};

/** Orden de los chips del filtro. Impresión va al final y apagada por default. */
export const GROUP_ORDER: readonly ActivityGroup[] = [
  "stock", "producto", "venta", "caja", "paquete", "preventa", "insumo", "sistema", "impresion",
];

export const DEFAULT_GROUPS: readonly ActivityGroup[] = GROUP_ORDER.filter((g) => g !== "impresion");

export function groupStyle(group: string): GroupStyle {
  return GROUP_STYLES[group as ActivityGroup] ?? GROUP_STYLES.sistema;
}

/** Etiqueta en español de un campo de `meta.changes`. */
export const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  sku: "SKU",
  barcode: "Código de barras",
  description: "Descripción",
  category_id: "Categoría",
  categories: "Categorías",
  supplier_id: "Proveedor",
  cost: "Costo",
  active: "Activo",
  product_type: "Tipo",
  "prices.price_1": "Precio Normal",
  "prices.price_2": "Precio Socio",
  "prices.price_3": "Precio Mayorista",
  "prices.price_4": "Precio D",
  "prices.price_5": "Precio E",
  "payment.allow_cash": "Acepta efectivo",
  "payment.allow_card": "Acepta tarjeta",
  "details.volume_number": "Número de tomo",
  "details.editorial": "Editorial",
  "details.genre": "Género",
};

const MONEY_FIELDS = new Set(["cost", "prices.price_1", "prices.price_2", "prices.price_3", "prices.price_4", "prices.price_5"]);

const money = (n: number): string =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

const qtyFmt = (n: number): string => new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(n);

/** "+5", "−2", "0" (con signo tipográfico). */
export function formatDelta(delta: number | null | undefined): string {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return "—";
  if (delta > 0) return `+${qtyFmt(delta)}`;
  if (delta < 0) return `−${qtyFmt(Math.abs(delta))}`;
  return "0";
}

export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "vacío";
  if (typeof value === "boolean") return value ? "sí" : "no";
  if (Array.isArray(value)) {
    return value.length === 0 ? "ninguna" : value.map((v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v))).join(", ");
  }
  if (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)))) {
    const n = Number(value);
    if (MONEY_FIELDS.has(field)) return money(n);
    if (field === "active") return n ? "sí" : "no";
    return qtyFmt(n);
  }
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? "";
}

export interface ChangeLine {
  field: string;
  label: string;
  from: string;
  to: string;
}

/** `meta.changes` ({campo: {old, new}}) → renglones legibles. Tolera `[]` (sin cambios). */
export function formatChanges(meta: Record<string, unknown> | null | undefined): ChangeLine[] {
  const changes = meta?.["changes"];
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  const out: ChangeLine[] = [];
  for (const [field, raw] of Object.entries(changes as Record<string, unknown>)) {
    const pair = (raw ?? {}) as { old?: unknown; new?: unknown };
    out.push({
      field,
      label: FIELD_LABELS[field] ?? field,
      from: formatFieldValue(field, pair.old),
      to: formatFieldValue(field, pair.new),
    });
  }
  return out;
}

/**
 * Detalle de una línea del feed, corto y en español. Ejemplos:
 *  - ajuste:  "10 → 8 (−2) · Tadaima CENTRO"
 *  - venta:   "−1 · VENTA-3300 · Tadaima CENTRO"
 *  - edición: "Nombre: «Fig SHF Gon mx» → «Fig SHF Gon mx OF»"
 *  - otros:   la descripción del log.
 */
export function describeEvent(e: ActivityEvent): string {
  const parts: string[] = [];
  const place = e.warehouse?.name ?? e.store?.name ?? null;

  if (e.source === "mov") {
    if (e.stock_before !== null && e.stock_after !== null) {
      parts.push(`${qtyFmt(e.stock_before)} → ${qtyFmt(e.stock_after)} (${formatDelta(e.qty_delta)})`);
    } else {
      parts.push(formatDelta(e.qty_delta));
    }
    if (e.reference) parts.push(e.reference);
    if (place) parts.push(place);
    const notesRaw = e.meta?.["notes"];
    const notes = typeof notesRaw === "string" ? notesRaw : "";
    if (notes && !/^Ajuste manual:/i.test(notes) && !/^(Salida|Entrada) por traslado/i.test(notes)) parts.push(notes);
    return parts.join(" · ");
  }

  if (e.action === "inventory.adjusted" && e.stock_before !== null && e.stock_after !== null) {
    parts.push(`${qtyFmt(e.stock_before)} → ${qtyFmt(e.stock_after)} (${formatDelta(e.qty_delta)})`);
    if (place) parts.push(place);
    return parts.join(" · ");
  }

  const changes = formatChanges(e.meta);
  if (changes.length > 0) {
    return changes.map((c) => `${c.label}: «${c.from}» → «${c.to}»`).join(" · ");
  }

  if (e.action === "sale.cancelled" || e.action === "pre_sale_order.cancelled") {
    const refunded = Number(e.meta?.["amount_refunded"]);
    const modeRaw = e.meta?.["mode"];
    const mode = typeof modeRaw === "string" ? modeRaw : "";
    const modeLabel = mode === "full" ? "total" : mode === "partial_items" ? "parcial" : mode;
    const bits = [modeLabel && `cancelación ${modeLabel}`, Number.isFinite(refunded) && refunded > 0 ? `devuelto ${money(refunded)}` : ""].filter(Boolean);
    if (bits.length) return bits.join(" · ");
  }

  if (e.action === "bundle.assembled" || e.action === "bundle.disassembled") {
    const qty = Number(e.meta?.["quantity"]);
    const comps = Array.isArray(e.meta?.["components"]) ? (e.meta["components"] as Array<{ name?: string }>) : [];
    const names = comps.map((c) => c.name).filter(Boolean).slice(0, 3).join(", ");
    const bits = [Number.isFinite(qty) ? `${qtyFmt(qty)} paquete(s)` : "", names, e.store?.name ?? ""].filter(Boolean);
    if (bits.length) return bits.join(" · ");
  }

  return e.description?.trim() || "";
}

/** "29 oct 13:30" en la zona del negocio (Tijuana). */
export function formatEventTime(iso: string, withSeconds = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("es-MX", {
    timeZone: BUSINESS_TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const month = get("month").replace(".", "");
  const time = `${get("hour")}:${get("minute")}${withSeconds ? `:${get("second")}` : ""}`;
  return `${get("day")} ${month} ${time}`;
}

/** Etiqueta corta del tipo de producto. */
export function productTypeLabel(type: string | null | undefined): string {
  if (type === "manga") return "Tomo";
  if (type === "bundle") return "Paquete";
  if (type === "product") return "Producto";
  return "";
}
