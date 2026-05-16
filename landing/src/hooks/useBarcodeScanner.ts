import { useEffect, useRef } from "react";

interface UseBarcodeScannerOptions {
  onScan: (code: string) => void;
  enabled?: boolean;
  /** Tiempo máximo (ms) entre teclas para considerarlas parte del mismo escaneo HID. Humanos: 80-200ms. Lectores: 5-30ms */
  maxIntervalMs?: number;
  /** Longitud mínima para considerar el buffer un escaneo válido (evita falsos positivos) */
  minLength?: number;
  /** Tiempo de inactividad (ms) antes de flush automático si el lector no envía Enter al final */
  flushTimeoutMs?: number;
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

/**
 * Detector global de lectores USB HID (que emiten teclas + Enter).
 *
 * Heurística: si llegan ≥ `minLength` caracteres con intervalos < `maxIntervalMs`
 * y termina con Enter (o se queda sin teclas por `flushTimeoutMs`), se asume escaneo.
 *
 * Si el target del evento es un input/textarea, no interfiere a menos que la velocidad
 * del input claramente sea de máquina (todas las teclas < maxIntervalMs). Cuando detecta
 * escaneo, dispara `preventDefault` para evitar que el código termine "tipeado" en el input.
 */
export function useBarcodeScanner({
  onScan,
  enabled = true,
  maxIntervalMs = 35,
  minLength = 4,
  flushTimeoutMs = 100,
}: UseBarcodeScannerOptions) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = "";
    let lastKeyAt = 0;
    let allFast = true;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let keyEvents: KeyboardEvent[] = [];

    const reset = () => {
      buffer = "";
      lastKeyAt = 0;
      allFast = true;
      keyEvents = [];
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    };

    const flush = () => {
      if (allFast && buffer.length >= minLength) {
        const code = buffer;
        keyEvents.forEach(ev => ev.preventDefault());
        reset();
        onScanRef.current(code);
        return true;
      }
      reset();
      return false;
    };

    const handler = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) {
        reset();
        return;
      }

      const now = performance.now();
      const delta = lastKeyAt === 0 ? 0 : now - lastKeyAt;

      if (ev.key === "Enter") {
        if (buffer.length > 0) {
          const wasScan = flush();
          if (wasScan) ev.preventDefault();
        }
        return;
      }

      if (ev.key === "Tab" || ev.key === "Escape") {
        reset();
        return;
      }

      if (ev.key.length !== 1) return;

      if (lastKeyAt !== 0 && delta > maxIntervalMs) {
        // No es ráfaga de scanner → reset; si target es input, el char llega al input normalmente
        reset();
        if (isEditableTarget(ev.target)) return;
      }

      if (lastKeyAt !== 0 && delta > maxIntervalMs) allFast = false;

      buffer += ev.key;
      keyEvents.push(ev);
      lastKeyAt = now;

      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        if (buffer.length >= minLength && allFast) flush();
        else reset();
      }, flushTimeoutMs);
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => {
      window.removeEventListener("keydown", handler, { capture: true });
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [enabled, maxIntervalMs, minLength, flushTimeoutMs]);
}
