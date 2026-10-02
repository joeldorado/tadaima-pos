import { toast } from "sonner";

/**
 * Descarga de archivos generados en el navegador (Excel, imágenes).
 *
 * Fix 2026-10-02 (cajera en Chrome: el Excel del corte no bajaba, en Edge sí):
 * - el `<a download>` se agrega al DOM antes del clic;
 * - el blob se libera hasta 60 s después — liberarlo en el mismo instante
 *   puede hacer que Chrome marque la descarga como fallida.
 */
export const REVOKE_DELAY_MS = 60_000;

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/**
 * Descarga y deja un botón "Descargar otra vez". El archivo se arma después de
 * varios segundos de trabajo (pedir ventas, generar el Excel), así que Chrome
 * puede tomarlo como descarga automática y bloquearlo en silencio; el botón del
 * aviso es un clic nuevo del usuario y ese Chrome sí lo deja pasar.
 */
export function downloadWithRetry(blob: Blob, filename: string): void {
  downloadBlob(blob, filename);
  toast.success(`Archivo listo: ${filename}`, {
    description: "Si no aparece en Descargas, presiona Descargar otra vez.",
    duration: 12_000,
    action: { label: "Descargar otra vez", onClick: () => downloadBlob(blob, filename) },
  });
}
