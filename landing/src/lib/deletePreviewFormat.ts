/**
 * Formato compartido por los modales de "vista previa antes de borrar/cancelar".
 * Vive aparte de DeletePreviewParts.tsx para que ese archivo solo exporte
 * componentes (react-refresh).
 */

/** Mensaje legible de un error del cliente API (`ApiError { message }`) o un fallback. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === 'string' && msg.trim() !== '') return msg
  }
  return fallback
}

/** Cantidades: enteros sin decimales, fracciones con 2. */
export function fmtQty(n: number): string {
  return Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(2)
}

export const fmtMoney = (n: number): string =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0)
