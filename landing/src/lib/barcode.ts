/**
 * Genera un código de barras interno de 13 dígitos para productos/tomos que no
 * traen un código impreso de fábrica. Útil para dar de alta sin lector físico
 * (botón "scan" en los formularios) y para pruebas.
 *
 * Formato: prefijo "200" (rango GS1 reservado a uso interno de la tienda, no
 * colisiona con EAN reales) + 10 dígitos pseudoaleatorios. El componente de
 * tiempo reduce colisiones entre altas rápidas seguidas.
 */
export function generateBarcode(): string {
  const time = Date.now() % 100000; // 5 dígitos por tiempo
  const rand = Math.floor(Math.random() * 100000); // 5 dígitos aleatorios
  const body = `${time}`.padStart(5, "0") + `${rand}`.padStart(5, "0");
  return `200${body}`; // 3 + 10 = 13 dígitos
}

/**
 * SKU temporal para alta remota cuando el producto real aún no llega y no
 * se conoce su código (2026-08-04, reporte de cliente: el sistema bloqueaba
 * el guardado por falta de SKU). El campo sigue siendo obligatorio y único
 * en la base de datos — esto solo evita que el usuario tenga que inventar
 * un valor a mano. Prefijo `PEND-` distinto de `generateBarcode()` para no
 * confundirse con un código de barras real; el equipo lo reemplaza por el
 * SKU verdadero cuando el producto llega físicamente (la tabla de productos
 * marca estos valores con un badge).
 */
// Contador monotónico por sesión: dos llamadas en el MISMO milisegundo ya no
// dependen solo del azar (4 chars ≈ 1.7M combinaciones colisionaban a veces
// en altas masivas — y ponían flaky el test de unicidad).
let placeholderSeq = 0;

export function generatePlaceholderSku(): string {
  const time = Date.now().toString(36).toUpperCase();
  const seq = (placeholderSeq++ % 1296).toString(36).toUpperCase().padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PEND-${time}-${seq}${rand}`;
}

// ─── EAN-13 (Paquetes, 2026-10-07) ───────────────────────────────────────────
// Los paquetes llevan etiqueta impresa con código de barras real: para que
// cualquier lector lo lea sin configuración el código debe ser EAN-13 válido
// (12 dígitos + dígito verificador). `generateBarcode()` de arriba NO lleva
// verificador (es solo un identificador interno) — no lo uses para etiquetas.

const EAN13_BODY_LENGTH = 12;
const EAN13_LENGTH = 13;
const EAN13_DEFAULT_PREFIX = "200";

/**
 * Dígito verificador EAN-13 de los primeros 12 dígitos: pesos 1,3,1,3… de
 * izquierda a derecha; resultado (10 − suma mod 10) mod 10.
 * @throws Error si no son exactamente 12 dígitos.
 */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error("ean13CheckDigit: se esperan exactamente 12 dígitos");
  }
  const sum = first12
    .split("")
    .reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/** true solo si son 13 dígitos y el último es el verificador correcto. */
export function isValidEan13(code: string | null | undefined): boolean {
  if (typeof code !== "string" || !/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, EAN13_BODY_LENGTH)) === Number(code[EAN13_LENGTH - 1]);
}

/**
 * EAN-13 interno válido: `prefix` (default "200", rango GS1 de uso interno)
 * + tiempo + azar hasta completar 12 dígitos + verificador. 13 dígitos.
 */
export function generateEan13(prefix = EAN13_DEFAULT_PREFIX): string {
  const cleanPrefix = prefix.replace(/\D/g, "").slice(0, EAN13_BODY_LENGTH);
  // Tiempo primero (reduce colisiones entre altas seguidas), luego azar.
  const time = `${Date.now() % 100000}`.padStart(5, "0");
  const randomCount = Math.max(EAN13_BODY_LENGTH - cleanPrefix.length - time.length, 0);
  const randomDigits = Array.from({ length: randomCount }, () => Math.floor(Math.random() * 10)).join("");
  const body = (cleanPrefix + time + randomDigits).slice(0, EAN13_BODY_LENGTH);
  return body + ean13CheckDigit(body);
}
