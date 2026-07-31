/**
 * Punto ÚNICO de salida de tickets térmicos (2026-07-30): decide entre la
 * impresión silenciosa por QZ Tray (si esta máquina la configuró) y el flujo
 * clásico de ventana (printViaWindow). Los 3 sitios que imprimen — venta
 * (SellPage), reimpresión (SalesPage) y corte (CashCloseSummaryModal) — llaman
 * dispatchTicket con SU html; los builders NO se unificaron a propósito.
 *
 * Regla de oro: sin configuración QZ todo se comporta EXACTAMENTE como antes
 * (ventana + --kiosk-printing como puente), sin toasts.
 */
import { toast } from "sonner";
import { DEFAULT_TICKET_WIDTH_MM, QzError, printHtmlViaQz, type QzFailureKind } from "./qz";
import { printViaWindow, type WindowTransport } from "./ticketWindow";

// ─── Configuración por MÁQUINA (localStorage — la impresora es del equipo, no
// de la empresa) ──────────────────────────────────────────────────────────────

export const QZ_PRINTER_STORAGE_KEY = "tadaima_qz_printer";

export interface QzPrinterSettings {
  /** Switch maestro "Impresión silenciosa". */
  readonly enabled: boolean;
  /** Nombre exacto de la impresora según el SO/QZ. */
  readonly printerName: string;
  /** 58 default; 48 si la Xprinter recorta el borde derecho. */
  readonly widthMm: number;
}

export function getPrinterSettings(): QzPrinterSettings | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(QZ_PRINTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QzPrinterSettings>;
    if (typeof parsed.printerName !== "string" || parsed.printerName.trim() === "") return null;
    return {
      enabled: parsed.enabled === true,
      printerName: parsed.printerName,
      widthMm: typeof parsed.widthMm === "number" && parsed.widthMm > 0 ? parsed.widthMm : DEFAULT_TICKET_WIDTH_MM,
    };
  } catch {
    return null;
  }
}

export function savePrinterSettings(settings: QzPrinterSettings): void {
  localStorage.setItem(QZ_PRINTER_STORAGE_KEY, JSON.stringify(settings));
}

export function clearPrinterSettings(): void {
  localStorage.removeItem(QZ_PRINTER_STORAGE_KEY);
}

// ─── Adaptación del HTML para el WebView de QZ ───────────────────────────────

/**
 * El tray renderiza con estilos de PANTALLA (media print no garantizado): hay
 * que quitar la barra .no-print (botones Imprimir/Cerrar) y neutralizar el
 * fondo gris + padding-top que solo existen para la vista en ventana. Pura —
 * replica lo que ya hace el @media print del propio ticket.
 */
export function adaptHtmlForQz(html: string): string {
  const sinBarra = html.replace(/<div class="no-print"[\s\S]*?<\/div>/g, "");
  const override = "<style>html{background:#fff}body{margin:0;padding:2mm 1.5mm;width:auto}.no-print{display:none!important}</style>";
  if (sinBarra.includes("</head>")) return sinBarra.replace("</head>", `${override}</head>`);
  return override + sinBarra;
}

// ─── Decisor ─────────────────────────────────────────────────────────────────

export type TicketTransport = "qz" | WindowTransport;

export type FallbackReason =
  | "qz-apagado"       // not-running | connect-timeout
  | "firma-fallo"      // sign-failed
  | "impresora-error"; // printer-not-found | print-failed | print-timeout

export interface DispatchResult {
  readonly transport: TicketTransport;
  /** Solo cuando había configuración QZ y se degradó (o se abortó). */
  readonly fallbackReason?: FallbackReason;
}

export interface DispatchOptions {
  /** "Ticket #123" | "Corte #45" — nombre del job en el spooler. */
  readonly jobName: string;
  /** Ventana nombrada del fallback (SellPage recicla "tadaima_ticket"). */
  readonly windowName?: string;
  readonly copies?: number;
}

// El aviso "QZ no está activo" solo una vez por pestaña — sin spamear cada venta.
let qzDownToastShown = false;

/** Solo para tests. */
export function resetQzDownToastForTests(): void {
  qzDownToastShown = false;
}

function reasonFor(kind: QzFailureKind): FallbackReason {
  if (kind === "sign-failed") return "firma-fallo";
  if (kind === "not-running" || kind === "connect-timeout") return "qz-apagado";
  return "impresora-error";
}

export async function dispatchTicket(html: string, opts: DispatchOptions): Promise<DispatchResult> {
  const settings = getPrinterSettings();
  if (!settings || !settings.enabled) {
    // Comportamiento idéntico a antes de QZ: cero toasts, cero espera.
    return { transport: printViaWindow(html, { windowName: opts.windowName }) };
  }

  try {
    await printHtmlViaQz(adaptHtmlForQz(html), {
      printer: settings.printerName,
      widthMm: settings.widthMm,
      jobName: opts.jobName,
      copies: opts.copies,
    });
    return { transport: "qz" };
  } catch (err) {
    const kind: QzFailureKind = err instanceof QzError ? err.kind : "print-failed";

    if (kind === "print-timeout") {
      // AMBIGUO: el job pudo entrar al spooler — reimprimir aquí duplicaría el
      // ticket. Sin fallback automático, solo instrucción.
      toast.warning("La impresora no respondió. Si el ticket no salió, reimprímelo desde Historial.");
      return { transport: "none", fallbackReason: "impresora-error" };
    }

    const reason = reasonFor(kind);
    if (reason === "qz-apagado") {
      if (!qzDownToastShown) {
        qzDownToastShown = true;
        toast.info("QZ Tray no está activo — el ticket se abrió en pantalla. Ábrelo en esta caja o desactiva la impresión silenciosa en Impresora.");
      }
    } else if (reason === "firma-fallo") {
      toast.error("No se pudo autorizar la impresión silenciosa — el ticket se abrió en pantalla.");
    } else {
      toast.error(`No se pudo imprimir en "${settings.printerName}". Revisa que esté encendida — el ticket se abrió en pantalla.`);
    }
    return { transport: printViaWindow(html, { windowName: opts.windowName }), fallbackReason: reason };
  }
}
