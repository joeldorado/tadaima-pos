/**
 * Wrapper único de QZ Tray (impresión silenciosa, 2026-07-30).
 *
 * - qz-tray se carga con import dinámico (chunk aparte — no engorda el bundle
 *   inicial) y se configura UNA vez: certificado público del backend + firmas
 *   SHA512withRSA vía POST /qz/sign. NUNCA resolver la firma con string vacío:
 *   eso manda el request "sin firmar" y dispara el diálogo amarillo en la caja.
 * - Conexión single-flight con timeout corto; sin reconnect loop (el siguiente
 *   print reintenta). Multi-tab OK: QZ acepta N conexiones y los jobs caen al
 *   spooler del SO.
 * - No fijar puerto/host en connect: la lib recorre 8181→8282→… sola
 *   (wss desde HTTPS, ws en dev http). El CSP ya permite ws(s)://localhost:*.
 */
import { getQzCertificate, signQzRequest } from "@tadaima/api";
import type * as QzTypes from "qz-tray";

type QzModule = typeof QzTypes;

export type QzStatus = "disconnected" | "connecting" | "connected";

export type QzFailureKind =
  | "not-running"       // websocket no conectó (QZ no instalado/cerrado/cert local roto)
  | "connect-timeout"   // nuestro timeout venció antes del handshake
  | "sign-failed"       // /qz/sign o /qz/cert fallaron (401, red, 503 sin config)
  | "printer-not-found" // el tray no encontró la impresora configurada
  | "print-failed"      // conectó pero el print falló (determinista)
  | "print-timeout";    // print sin respuesta — AMBIGUO: pudo encolar (no re-imprimir)

export class QzError extends Error {
  readonly kind: QzFailureKind;
  constructor(kind: QzFailureKind, message: string, cause?: unknown) {
    super(message);
    this.name = "QzError";
    this.kind = kind;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

const DEFAULT_CONNECT_TIMEOUT_MS = 3500;
const DEFAULT_PRINT_TIMEOUT_MS = 20000;
export const DEFAULT_TICKET_WIDTH_MM = 58;

let qzLoad: Promise<QzModule> | null = null;
let connectPromise: Promise<void> | null = null;
let certPromise: Promise<string> | null = null;
let status: QzStatus = "disconnected";
const statusListeners = new Set<(s: QzStatus) => void>();

function setStatus(next: QzStatus): void {
  if (status === next) return;
  status = next;
  statusListeners.forEach(l => l(next));
}

export function getQzStatus(): QzStatus {
  return status;
}

/** Para el modal de configuración. Devuelve el unsubscribe. */
export function onQzStatusChange(listener: (s: QzStatus) => void): () => void {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function classify(err: unknown, fallback: QzFailureKind, message: string): QzError {
  return err instanceof QzError ? err : new QzError(fallback, message, err);
}

async function loadQz(): Promise<QzModule> {
  if (!qzLoad) {
    qzLoad = import("qz-tray").then(mod => {
      // El paquete es CJS/UMD: según el interop llega como default o namespace.
      const qz = (mod as QzModule & { default?: QzModule }).default ?? mod;
      qz.security.setCertificatePromise((resolve, reject) => {
        certPromise = certPromise ?? getQzCertificate();
        certPromise.then(resolve, (err: unknown) => {
          certPromise = null;
          reject(toError(err).message);
        });
      });
      qz.security.setSignaturePromise((toSign: string) =>
        signQzRequest(toSign).catch((err: unknown) => {
          throw new QzError("sign-failed", "No se pudo autorizar la impresión con el servidor", err);
        }),
      );
      qz.security.setSignatureAlgorithm("SHA512");
      qz.websocket.setClosedCallbacks(() => {
        connectPromise = null;
        setStatus("disconnected");
      });
      qz.websocket.setErrorCallbacks(() => {
        if (!qz.websocket.isActive()) {
          connectPromise = null;
          setStatus("disconnected");
        }
      });
      return qz;
    }).catch((err: unknown) => {
      qzLoad = null;
      throw new QzError("not-running", "No se pudo cargar el módulo de impresión", err);
    });
  }
  return qzLoad;
}

/** Conecta (o reutiliza) el websocket con QZ Tray. Solo lanza QzError. */
export async function ensureQzConnection(opts?: { readonly timeoutMs?: number }): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const qz = await loadQz();
  if (qz.websocket.isActive()) {
    setStatus("connected");
    return;
  }
  if (!connectPromise) {
    setStatus("connecting");
    connectPromise = qz.websocket.connect({ retries: 0, delay: 1 }).then(
      () => { setStatus("connected"); },
      (err: unknown) => {
        connectPromise = null;
        setStatus("disconnected");
        throw new QzError("not-running", "QZ Tray no está activo en esta máquina", err);
      },
    );
  }
  const attempt = connectPromise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new QzError("connect-timeout", "QZ Tray no respondió a tiempo")), timeoutMs);
  });
  try {
    await Promise.race([attempt, timeout]);
  } catch (err) {
    if (err instanceof QzError && err.kind === "connect-timeout") {
      // La promesa abandonada no debe explotar como unhandled rejection; si el
      // handshake llega tarde, el .then de arriba dejará el status en connected.
      attempt.catch(() => { /* noop */ });
      if (connectPromise === attempt) connectPromise = null;
      setStatus("disconnected");
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function listQzPrinters(): Promise<string[]> {
  await ensureQzConnection();
  const qz = await loadQz();
  try {
    const found = await qz.printers.find();
    return Array.isArray(found) ? found : [found];
  } catch (err) {
    throw classify(err, "print-failed", "No se pudieron listar las impresoras");
  }
}

export interface QzPrintOptions {
  readonly printer: string;
  readonly widthMm?: number | undefined;
  readonly jobName?: string | undefined;
  readonly copies?: number | undefined;
  readonly timeoutMs?: number | undefined;
}

export async function printHtmlViaQz(html: string, opts: QzPrintOptions): Promise<void> {
  await ensureQzConnection();
  const qz = await loadQz();
  const widthMm = opts.widthMm ?? DEFAULT_TICKET_WIDTH_MM;

  // Verificación determinista de la impresora: "apagada con spooler" no es
  // detectable, pero "no existe / cambió de nombre" sí — y da mejor toast.
  try {
    await qz.printers.find(opts.printer);
  } catch (err) {
    throw classify(err, "printer-not-found", `No se encontró la impresora "${opts.printer}"`);
  }

  const config = qz.configs.create(opts.printer, {
    units: "mm",
    size: { width: widthMm, height: null },
    margins: 0,
    scaleContent: true,
    colorType: "grayscale",
    copies: opts.copies ?? 1,
    jobName: opts.jobName,
  } as unknown as QzTypes.PrinterOptions);

  const data = [{
    type: "pixel",
    format: "html",
    flavor: "plain",
    data: html,
    options: { pageWidth: widthMm, pageHeight: null },
  }] as unknown as QzTypes.PrintData[];

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new QzError("print-timeout", "La impresora no respondió")), opts.timeoutMs ?? DEFAULT_PRINT_TIMEOUT_MS);
  });
  try {
    await Promise.race([qz.print(config, data), timeout]);
  } catch (err) {
    throw classify(err, "print-failed", "No se pudo imprimir el ticket");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Solo para el modal de configuración y tests. */
export async function disconnectQz(): Promise<void> {
  if (!qzLoad) return;
  const qz = await qzLoad;
  if (qz.websocket.isActive()) {
    await qz.websocket.disconnect().catch(() => { /* noop */ });
  }
  connectPromise = null;
  setStatus("disconnected");
}
