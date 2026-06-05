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
