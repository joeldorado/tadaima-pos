/**
 * Reglas puras para distinguir un escaneo de lector de lo que teclea el cajero en Caja.
 *
 * El lector "teclea" el código y manda Enter. Si el cursor está en "Pesos recibidos",
 * ese Enter cobraba la venta (bug de la prueba real 2026-09-28). Estas reglas deciden
 * cuándo un término/Enter es en realidad un código de producto.
 */

const MIN_CODE_LENGTH = 4;
/** Ningún pago en efectivo llega a 7 dígitos enteros ($1,000,000); un EAN/UPC sí. */
const MIN_BARCODE_INT_DIGITS = 7;

/** ¿El término del buscador parece SKU/código de barras (y no un nombre)? */
export function looksLikeProductCode(term: string): boolean {
  const t = term.trim();
  if (t.length < MIN_CODE_LENGTH) return false;
  if (/\s/.test(t)) return false;
  return /\d/.test(t);
}

function integerDigits(s: string): number {
  const intPart = s.trim().split(".")[0] ?? "";
  return intPart.replace(/\D/g, "").length;
}

/**
 * Enter en el campo de efectivo: `"scan"` si lo que se tecleó es un código
 * (letras/guiones — el input numérico los descarta de `value` — o 7+ dígitos
 * enteros); `"pay"` si es un monto normal o vacío (vacío = pago exacto).
 *
 * @param typedKeys teclas imprimibles capturadas en el campo desde la última limpieza
 * @param value valor actual del input numérico
 */
export function classifyCashEnter(typedKeys: string, value: string): "scan" | "pay" {
  if (/[A-Za-z_-]/.test(typedKeys)) return "scan";
  if (integerDigits(typedKeys) >= MIN_BARCODE_INT_DIGITS) return "scan";
  if (integerDigits(value) >= MIN_BARCODE_INT_DIGITS) return "scan";
  return "pay";
}
