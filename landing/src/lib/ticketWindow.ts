/**
 * Mecanismo de impresión por VENTANA (el flujo clásico, extraído tal cual de
 * SellPage.doPrintTicket en 2026-07-30 al entrar QZ Tray): ventana nombrada +
 * document.write + print() diferido, con fallback a iframe 0×0 si el navegador
 * bloquea el popup. Bajo Chrome --kiosk-printing el print sale silencioso.
 *
 * Notas load-bearing (no perderlas al refactorizar):
 * - El CSP (script-src 'self') bloquea scripts/onclick inline en la ventana →
 *   el print y los botones .print-btn/.close-btn se cablean desde AQUÍ (padre).
 * - Si hay <img class="logo">, se espera su load (con timeout) para que el
 *   ticket salga con logo.
 * - El iframe oculto hace que Chrome ignore el @page 58mm y gire el ticket 90°
 *   (por eso es solo fallback degradado, no el camino principal).
 */

export type WindowTransport = "window" | "iframe" | "none";

export interface PrintViaWindowOptions {
  /** Nombre de la ventana: reusar uno fijo evita acumular ventanas (SellPage usa "tadaima_ticket"). */
  readonly windowName?: string | undefined;
}

export function printViaWindow(html: string, opts?: PrintViaWindowOptions): WindowTransport {
  if (typeof window === "undefined" || typeof window.open !== "function") return "none";

  const w = window.open("", opts?.windowName ?? "_blank", "width=360,height=600");
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    let fired = false;
    const fire = () => { if (fired) return; fired = true; try { w.focus(); w.print(); } catch { /* noop */ } };
    const logoImg = w.document.querySelector("img.logo") as HTMLImageElement | null;
    if (logoImg && !logoImg.complete) {
      logoImg.addEventListener("load", fire, { once: true });
      logoImg.addEventListener("error", fire, { once: true });
      setTimeout(fire, 1200);
    } else {
      setTimeout(fire, 250);
    }
    w.document.querySelector(".print-btn")?.addEventListener("click", () => { try { w.print(); } catch { /* noop */ } });
    w.document.querySelector(".close-btn")?.addEventListener("click", () => { try { w.close(); } catch { /* noop */ } });
    return "window";
  }

  // Popup bloqueado → iframe oculto (degradado, puede salir girado) para no
  // perder la impresión automática.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(iframe);
  const idoc = iframe.contentWindow?.document;
  if (!idoc) { iframe.remove(); return "none"; }
  idoc.open();
  idoc.write(html);
  idoc.close();
  setTimeout(() => {
    try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { /* noop */ }
    setTimeout(() => iframe.remove(), 1500);
  }, 250);
  return "iframe";
}
