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
