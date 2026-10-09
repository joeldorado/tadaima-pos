import { isValidEan13 } from "@/lib/barcode";

/**
 * Etiqueta de anaquel/producto para Paquetes: 58 × 40 mm (rollo de la térmica
 * de las cajas) con nombre, precio, código de barras y SKU. Este módulo arma
 * el HTML que se manda a imprimir; el SVG del código lo genera `jsbarcode` en
 * el componente (aquí llega ya hecho). Solo NEGRO puro: la térmica lava los
 * grises (misma regla que los tickets).
 */

export interface LabelData {
  name: string;
  price: number;
  sku: string;
  barcode: string | null;
}

export type LabelBarcodeFormat = "EAN13" | "CODE128";

export const LABEL_WIDTH_MM = 58;
export const LABEL_HEIGHT_MM = 40;
/** Tope de copias por impresión (un rollo no da para más sin querer). */
export const MAX_COPIES = 100;
const MIN_COPIES = 1;
const LABEL_MARGIN_MM = 2;

/**
 * Qué se codifica en la etiqueta: el EAN-13 del paquete si es válido (lo lee
 * cualquier lector); si no hay o es inválido, CODE128 del código o del SKU
 * (CODE128 acepta letras y guiones, p. ej. "PAQ-0001").
 */
export function labelBarcodeValue(d: LabelData): { value: string; format: LabelBarcodeFormat } {
  const barcode = d.barcode?.trim() ?? "";
  if (isValidEan13(barcode)) return { value: barcode, format: "EAN13" };
  return { value: barcode || d.sku, format: "CODE128" };
}

/** Copias acotadas a 1..MAX_COPIES (NaN/decimales → entero válido). */
export function clampCopies(n: number): number {
  if (!Number.isFinite(n)) return MIN_COPIES;
  return Math.min(MAX_COPIES, Math.max(MIN_COPIES, Math.floor(n)));
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/** "$450" / "$450.50" — sin centavos cuando son cero (más grande y legible). */
export function formatLabelPrice(price: number): string {
  const safe = Number.isFinite(price) ? price : 0;
  const hasCents = Math.round(safe * 100) % 100 !== 0;
  return new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2,
  }).format(safe);
}

/**
 * Documento HTML completo para imprimir `copies` etiquetas, una por página.
 * `barcodeSvg` se inserta TAL CUAL (viene de jsbarcode, no de texto del usuario);
 * nombre y SKU sí se escapan. No lleva <script>: la impresión la dispara quien
 * abre la ventana (mismo esquema que el ticket).
 */
export function buildLabelHtml(d: LabelData, barcodeSvg: string, copies: number): string {
  const count = clampCopies(copies);
  const name = escapeHtml(d.name);
  const sku = escapeHtml(d.sku);
  const price = escapeHtml(formatLabelPrice(d.price));
  const innerWidth = LABEL_WIDTH_MM - LABEL_MARGIN_MM * 2;
  const innerHeight = LABEL_HEIGHT_MM - LABEL_MARGIN_MM * 2;

  const label = (isLast: boolean): string => `
    <div class="label"${isLast ? "" : ' style="page-break-after: always; break-after: page"'}>
      <div class="name">${name}</div>
      <div class="price">${price}</div>
      <div class="barcode">${barcodeSvg}</div>
      <div class="sku">${sku}</div>
    </div>`;

  const labels = Array.from({ length: count }, (_, i) => label(i === count - 1)).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Etiqueta ${sku}</title>
<style>
  @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: ${LABEL_MARGIN_MM}mm }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label {
    width: ${innerWidth}mm; height: ${innerHeight}mm; box-sizing: border-box; overflow: hidden;
    display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    text-align: center; color: #000;
  }
  .name {
    font-size: 12pt; font-weight: 700; line-height: 1.15; color: #000; width: 100%;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    word-break: break-word;
  }
  .price { font-size: 18pt; font-weight: 700; color: #000; line-height: 1.1; }
  .barcode { width: 100%; line-height: 0; }
  .barcode svg { max-width: 100%; height: auto; }
  .sku { font-size: 9pt; color: #000; letter-spacing: 0.04em; }
</style>
</head>
<body>${labels}
</body>
</html>`;
}
