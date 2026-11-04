import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { SCAN_BURST_DEFAULTS, ScanBurst, type ScanResult, type ScanTargetKind } from "@/lib/scanBurst";

interface UseBarcodeScannerOptions {
  onScan: (code: string) => void;
  /**
   * El detector descartó un prefijo (hueco real entre teclas): `code` NO está completo y no
   * se entrega a `onScan`. Por default avisa con un toast; Caja además regresa el foco.
   */
  onIncomplete?: (code: string) => void;
  enabled?: boolean;
  /** Longitud mínima para considerar el buffer un escaneo válido (evita falsos positivos) */
  minLength?: number;
  /** Tiempo de inactividad (ms) antes de flush automático si el lector no envía Enter al final */
  flushTimeoutMs?: number;
}

type TextField = HTMLInputElement | HTMLTextAreaElement;

function isTextField(el: EventTarget | null): el is TextField {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

/**
 * `self`: el campo de código de Caja (`data-scan-target="product"`), que resuelve su propio
 * Enter como escaneo. `editable`: cualquier otro input/textarea/contentEditable. `other`: body,
 * botones, etc.
 */
function classifyTarget(el: EventTarget | null): ScanTargetKind {
  if (!(el instanceof HTMLElement)) return "other";
  if (el.closest('[data-scan-target="product"]') !== null) return "self";
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return "editable";
  return "other";
}

/** Cambia el valor con el setter nativo y avisa a React (un `value=` directo no dispara onChange). */
function setNativeValue(el: TextField, value: string, caret?: number): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  // El setter nativo se invoca con `.call(el)`: el `this` es intencional.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  if (caret !== undefined) {
    try {
      el.setSelectionRange(caret, caret);
    } catch {
      // Los inputs numéricos no permiten selección: el caret queda al final.
    }
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * preventDefault NO aplica retroactivo a eventos ya despachados: si las teclas cayeron en un
 * input enfocado, el código quedó TIPEADO ahí y el buscador lo re-procesaba como segunda
 * lectura (doble conteo, QA 2026-06-08). Se quita del input y se notifica a React.
 */
function removeTypedCode(target: EventTarget | null, code: string): void {
  if (!isTextField(target)) return;
  if (typeof target.value === "string" && target.value.includes(code)) {
    setNativeValue(target, target.value.replace(code, ""));
  }
}

/**
 * El foco entró al campo de producto a mitad de la ráfaga (p. ej. el `requestAnimationFrame`
 * de `focusCodeInput` del escaneo anterior): lo que el detector ya llevaba se inserta en la
 * selección actual del campo, y el resto lo teclea el lector ahí mismo.
 */
function carryIntoField(target: EventTarget | null, text: string): void {
  if (!isTextField(target)) return;
  const value = target.value ?? "";
  const start = target.selectionStart ?? value.length;
  const end = target.selectionEnd ?? value.length;
  setNativeValue(target, value.slice(0, start) + text + value.slice(end), start + text.length);
}

/**
 * Detector global de lectores USB HID (que emiten teclas + Enter).
 *
 * La heurística vive en `lib/scanBurst.ts` (pura, con tests): ≥ `minLength` caracteres con
 * intervalos cortos y Enter al final (o inactividad). Aquí solo se traducen los eventos y se
 * aplican los resultados:
 * - El tiempo de cada tecla es `ev.timeStamp` (cuándo la generó el sistema). Antes se medía
 *   al procesarla y un re-render de Caja entre dos teclas partía el código en dos
 *   (tienda 2026-11-03: el lector leía `7503060913035` y se buscaba `060913035`).
 * - Cuando detecta escaneo hace `preventDefault` y detiene la propagación del Enter: ningún
 *   otro manejador (p. ej. el campo de efectivo, que cobra con Enter) debe recibirlo
 *   (bug prueba real 2026-09-28).
 * - Los inputs `data-scan-target="product"` mandan ellos mismos su término al flujo de
 *   escaneo en su Enter; si el foco entra ahí a mitad de la ráfaga, lo acumulado se les
 *   inserta en vez de perderse.
 */
function warnIncomplete(code: string): void {
  toast.warning(`Lectura incompleta del lector («${code}»). Vuelve a escanear.`);
}

export function useBarcodeScanner({
  onScan,
  onIncomplete = warnIncomplete,
  enabled = true,
  minLength = SCAN_BURST_DEFAULTS.minLength,
  flushTimeoutMs = SCAN_BURST_DEFAULTS.flushTimeoutMs,
}: UseBarcodeScannerOptions) {
  const onScanRef = useRef(onScan);
  const onIncompleteRef = useRef(onIncomplete);
  useEffect(() => {
    onScanRef.current = onScan;
    onIncompleteRef.current = onIncomplete;
  });

  useEffect(() => {
    if (!enabled) return;

    const burst = new ScanBurst<KeyboardEvent>({ ...SCAN_BURST_DEFAULTS, minLength, flushTimeoutMs });
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
    };

    const swallow = (ev: KeyboardEvent) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };

    const apply = (result: ScanResult<KeyboardEvent>, ev: KeyboardEvent | null) => {
      // `ignore` también llega con Shift/flechas a mitad de ráfaga: el timer sigue
      // armado para que lo acumulado no quede huérfano.
      switch (result.kind) {
        case "buffered":
          clearTimer();
          flushTimer = setTimeout(() => {
            flushTimer = null;
            apply(burst.timeout(performance.now()), null);
          }, flushTimeoutMs);
          return;
        case "carry":
          clearTimer();
          if (ev) carryIntoField(ev.target, result.text);
          return;
        case "swallow":
          if (ev) swallow(ev);
          return;
        case "scan": {
          clearTimer();
          result.tokens.forEach(t => t.preventDefault());
          removeTypedCode(result.tokens[result.tokens.length - 1]?.target ?? null, result.code);
          if (result.swallowEnter && ev) swallow(ev);
          if (!result.emit) return;
          if (result.incomplete) onIncompleteRef.current(result.code);
          else onScanRef.current(result.code);
          return;
        }
        default:
          return;
      }
    };

    const handler = (ev: KeyboardEvent) => {
      apply(
        burst.press({
          key: ev.key,
          at: ev.timeStamp,
          target: classifyTarget(ev.target),
          modifier: ev.ctrlKey || ev.metaKey || ev.altKey,
          token: ev,
        }),
        ev,
      );
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => {
      window.removeEventListener("keydown", handler, { capture: true });
      clearTimer();
    };
  }, [enabled, minLength, flushTimeoutMs]);
}
