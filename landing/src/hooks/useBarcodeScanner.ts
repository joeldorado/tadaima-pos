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

/** Inputs que resuelven su propio Enter como escaneo (campo de código de Caja). */
function isSelfScanTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && el.closest('[data-scan-target="product"]') !== null;
}

/** Ventana (ms) para tragarse el Enter de un escaneo que ya se procesó por tiempo. */
const LATE_ENTER_WINDOW_MS = 300;

/**
 * Detector global de lectores USB HID (que emiten teclas + Enter).
 *
 * Heurística: si llegan ≥ `minLength` caracteres con intervalos < `maxIntervalMs`
 * y termina con Enter (o se queda sin teclas por `flushTimeoutMs`), se asume escaneo.
 *
 * Si el target del evento es un input/textarea, no interfiere a menos que la velocidad
 * del input claramente sea de máquina (todas las teclas < maxIntervalMs). Cuando detecta
 * escaneo, dispara `preventDefault` para evitar que el código termine "tipeado" en el input,
 * y detiene la propagación del Enter: ningún otro manejador (p. ej. el campo de efectivo,
 * que cobra con Enter) debe recibir el Enter del lector (bug prueba real 2026-09-28).
 *
 * Los inputs marcados `data-scan-target="product"` se ignoran: ellos mismos mandan su
 * término al flujo de escaneo en su Enter (evita códigos truncados cuando el re-render
 * por tecla hace que la ráfaga no se reconozca completa).
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
    // Lock anti-doble (QA 2026-06-08): la misma lectura repetida en <500ms se
    // ignora (algunos lectores re-emiten, o el código quedaba tipeado en el
    // input y se re-procesaba como segunda lectura).
    let lastScan = { code: "", at: 0 };
    // Si el escaneo se procesó por tiempo (el Enter del lector llegó tarde), ese
    // Enter se descarta hasta este instante para que no cobre ni envíe formularios.
    let swallowEnterUntil = 0;

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
        const target = keyEvents[keyEvents.length - 1]?.target ?? null;
        keyEvents.forEach(ev => ev.preventDefault());

        // preventDefault NO aplica retroactivo a eventos ya despachados: si
        // las teclas cayeron en un input enfocado, el código quedó TIPEADO ahí
        // y el buscador lo re-procesaba como segunda lectura (doble conteo,
        // QA 2026-06-08). Se quita del input y se notifica a React.
        if (isEditableTarget(target)) {
          const el = target as HTMLInputElement;
          if (typeof el.value === "string" && el.value.includes(code)) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            setter?.call(el, el.value.replace(code, ""));
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }

        const now = performance.now();
        if (code === lastScan.code && now - lastScan.at < 500) {
          reset();
          return true; // lectura duplicada — ignorada
        }
        lastScan = { code, at: now };

        reset();
        onScanRef.current(code);
        return true;
      }
      reset();
      return false;
    };

    const swallow = (ev: KeyboardEvent) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };

    const handler = (ev: KeyboardEvent) => {
      if (isSelfScanTarget(ev.target)) {
        reset();
        return;
      }

      if (ev.ctrlKey || ev.metaKey || ev.altKey) {
        reset();
        return;
      }

      const now = performance.now();
      const delta = lastKeyAt === 0 ? 0 : now - lastKeyAt;

      if (ev.key === "Enter") {
        if (buffer.length > 0) {
          if (flush()) swallow(ev);
        } else if (now < swallowEnterUntil) {
          swallowEnterUntil = 0;
          swallow(ev);
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
        if (buffer.length >= minLength && allFast) {
          if (flush()) swallowEnterUntil = performance.now() + LATE_ENTER_WINDOW_MS;
        } else reset();
      }, flushTimeoutMs);
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => {
      window.removeEventListener("keydown", handler, { capture: true });
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [enabled, maxIntervalMs, minLength, flushTimeoutMs]);
}
