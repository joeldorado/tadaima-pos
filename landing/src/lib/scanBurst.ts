/**
 * Máquina de estados PURA del detector de lectores USB HID (teclean el código y mandan Enter).
 * `useBarcodeScanner` solo traduce eventos del DOM a `press()` y aplica el resultado.
 *
 * Reglas (bug tienda 2026-11-03: el lector leía `7503060913035` y Caja buscaba `060913035`):
 * - El tiempo de cada tecla lo pone quien llama (`ev.timeStamp`: cuándo la generó el sistema,
 *   no cuándo la procesó el hilo principal). Una pausa por re-render ya no abre "huecos".
 * - Umbral por destino: fuera de un campo editable (body, botón) nadie más consume las teclas,
 *   así que se tolera más (`maxIntervalOtherMs`); dentro de un input se exige velocidad de
 *   máquina (`maxIntervalEditableMs`) para no confundir a un humano tecleando el efectivo.
 * - Si aun así hubo un hueco y se descartó un prefijo, el código se entrega marcado
 *   `incomplete: true`: nunca se busca un código recortado como si estuviera completo.
 * - Si el foco entra al campo de producto (`target: "self"`) a mitad de la ráfaga, lo acumulado
 *   se devuelve como `carry` para insertarlo en ese campo en vez de tirarlo.
 */

export type ScanTargetKind = "self" | "editable" | "other";

export interface ScanBurstOptions {
  /** Longitud mínima para considerar el buffer un escaneo (evita falsos positivos). */
  minLength: number;
  /** Máximo entre teclas dentro de un input/textarea. Humanos: 80-200 ms. Lectores: 5-30 ms. */
  maxIntervalEditableMs: number;
  /** Máximo entre teclas con el foco fuera de un campo editable. */
  maxIntervalOtherMs: number;
  /** Inactividad antes del flush automático (lectores sin Enter al final). */
  flushTimeoutMs: number;
  /** La misma lectura repetida dentro de esta ventana se ignora (lectores que re-emiten). */
  duplicateWindowMs: number;
  /** Tras un flush por tiempo, el Enter que llegue dentro de esta ventana se traga. */
  lateEnterWindowMs: number;
}

export const SCAN_BURST_DEFAULTS: ScanBurstOptions = {
  minLength: 4,
  maxIntervalEditableMs: 40,
  maxIntervalOtherMs: 100,
  flushTimeoutMs: 400,
  duplicateWindowMs: 500,
  lateEnterWindowMs: 300,
};

export interface ScanPress<T> {
  /** `KeyboardEvent.key` */
  key: string;
  /** Instante de la tecla en ms (mismo reloj que `performance.now()`). */
  at: number;
  target: ScanTargetKind;
  /** Ctrl / Meta / Alt presionados: atajo, no escaneo. */
  modifier?: boolean;
  /** Lo que quien llama quiera recuperar al hacer flush (p. ej. el KeyboardEvent). */
  token: T;
}

export type ScanResult<T> =
  /** La tecla no es parte de un escaneo: sigue su curso normal. */
  | { kind: "ignore" }
  /** La tecla se acumuló; hay que (re)armar el flush por tiempo. */
  | { kind: "buffered" }
  /** El foco entró al campo de producto a mitad de la ráfaga: insertar `text` ahí. */
  | { kind: "carry"; text: string }
  /** Enter tardío de un escaneo ya procesado por tiempo: no debe llegar a nadie. */
  | { kind: "swallow" }
  /** Ráfaga completa. `emit: false` = lectura duplicada (se limpia pero no se procesa). */
  | {
      kind: "scan";
      code: string;
      tokens: T[];
      emit: boolean;
      incomplete: boolean;
      swallowEnter: boolean;
    };

export class ScanBurst<T> {
  private buffer = "";
  private tokens: T[] = [];
  private lastKeyAt = 0;
  private incomplete = false;
  private lastScan = { code: "", at: 0 };
  private swallowEnterUntil = 0;

  constructor(private readonly opts: ScanBurstOptions = SCAN_BURST_DEFAULTS) {}

  /** Lo acumulado hasta ahora (solo para diagnóstico/tests). */
  get pending(): string {
    return this.buffer;
  }

  press(p: ScanPress<T>): ScanResult<T> {
    const { key, at, target } = p;

    if (target === "self") {
      if (key !== "Enter" && key.length !== 1) {
        // Shift antes de una mayúscula (PAQ-0001, TAD…) no tira lo acumulado;
        // Tab/Escape sí cierran la ráfaga.
        if (key === "Tab" || key === "Escape") this.reset();
        return { kind: "ignore" };
      }
      const text = this.buffer;
      const isFresh = text.length > 0 && at - this.lastKeyAt <= this.opts.maxIntervalOtherMs;
      this.reset();
      return isFresh ? { kind: "carry", text } : { kind: "ignore" };
    }

    if (p.modifier) {
      this.reset();
      return { kind: "ignore" };
    }

    if (key === "Enter") {
      if (this.buffer.length > 0) return this.flush(at, true) ?? { kind: "ignore" };
      if (at < this.swallowEnterUntil) {
        this.swallowEnterUntil = 0;
        return { kind: "swallow" };
      }
      return { kind: "ignore" };
    }

    if (key === "Tab" || key === "Escape") {
      this.reset();
      return { kind: "ignore" };
    }

    if (key.length !== 1) return { kind: "ignore" };

    const limit = target === "editable" ? this.opts.maxIntervalEditableMs : this.opts.maxIntervalOtherMs;
    if (this.buffer.length > 0 && at - this.lastKeyAt > limit) {
      // Un buffer más viejo que el flush por tiempo es una tecla suelta del
      // humano (el timer ya debió limpiarlo), no un prefijo perdido del lector.
      const droppedPrefix = this.buffer.length > 0 && at - this.lastKeyAt <= this.opts.flushTimeoutMs;
      this.reset();
      // En un input la tecla es del humano: que llegue al campo. Fuera de un input nadie
      // la consume: arranca una ráfaga nueva, pero recordando que se perdió un prefijo.
      if (target === "editable") return { kind: "ignore" };
      this.incomplete = droppedPrefix;
    }

    this.buffer += key;
    this.tokens.push(p.token);
    this.lastKeyAt = at;
    return { kind: "buffered" };
  }

  /** Flush por inactividad (el lector no mandó Enter). `now` en el mismo reloj que `at`. */
  timeout(now: number): ScanResult<T> {
    if (this.buffer.length === 0) return { kind: "ignore" };
    const result = this.flush(now, false);
    if (result?.kind === "scan") this.swallowEnterUntil = now + this.opts.lateEnterWindowMs;
    return result ?? { kind: "ignore" };
  }

  private flush(at: number, viaEnter: boolean): ScanResult<T> | null {
    const { buffer: code, tokens, incomplete } = this;
    this.reset();
    if (code.length < this.opts.minLength) return null;
    const isDuplicate = code === this.lastScan.code && at - this.lastScan.at < this.opts.duplicateWindowMs;
    if (!isDuplicate) this.lastScan = { code, at };
    return { kind: "scan", code, tokens, emit: !isDuplicate, incomplete, swallowEnter: viaEnter };
  }

  private reset(): void {
    this.buffer = "";
    this.tokens = [];
    this.lastKeyAt = 0;
    this.incomplete = false;
  }
}
