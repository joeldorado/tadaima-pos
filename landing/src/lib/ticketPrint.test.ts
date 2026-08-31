import { beforeEach, describe, expect, it, vi } from "vitest";

// El decisor se prueba con los dos transportes simulados: QZ (printHtmlViaQz)
// y ventana (printViaWindow). QzError se re-usa REAL desde el mock para que la
// clasificación por instanceof funcione igual que en producción.
vi.mock("./qz", async () => {
  const actual = await vi.importActual<typeof import("./qz")>("./qz");
  return {
    ...actual,
    printHtmlViaQz: vi.fn(),
    warmUpQz: vi.fn(() => Promise.resolve()),
  };
});
vi.mock("./ticketWindow", () => ({
  printViaWindow: vi.fn(() => "window"),
}));
vi.mock("sonner", () => ({
  toast: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
// Telemetría (POST /logs): se simula para que los tests no hagan HTTP real y
// para poder asegurar que cada intento QZ reporta su resultado.
vi.mock("@tadaima/api", () => ({
  createSystemLog: vi.fn(() => Promise.resolve()),
}));

import { toast } from "sonner";
import { createSystemLog } from "@tadaima/api";
import { QzError, printHtmlViaQz, warmUpQz } from "./qz";
import { printViaWindow } from "./ticketWindow";
import {
  QZ_PRINTER_STORAGE_KEY,
  adaptHtmlForQz,
  clearPrinterSettings,
  dispatchTicket,
  getPrinterSettings,
  resetQzDownToastForTests,
  savePrinterSettings,
  warmUpTicketPrinting,
} from "./ticketPrint";

const mockPrintQz = vi.mocked(printHtmlViaQz);
const mockWindow = vi.mocked(printViaWindow);

// vitest corre en environment node — localStorage se stubbea con un Map.
function stubLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  });
}

const SETTINGS = { enabled: true, printerName: "XP-58", widthMm: 58 };

beforeEach(() => {
  vi.clearAllMocks();
  stubLocalStorage();
  resetQzDownToastForTests();
  mockWindow.mockReturnValue("window");
});

describe("getPrinterSettings / savePrinterSettings", () => {
  it("round-trip guarda y recupera la configuración", () => {
    savePrinterSettings(SETTINGS);
    expect(getPrinterSettings()).toEqual(SETTINGS);
    clearPrinterSettings();
    expect(getPrinterSettings()).toBeNull();
  });

  it("tolera basura en localStorage y ancho inválido", () => {
    localStorage.setItem(QZ_PRINTER_STORAGE_KEY, "{no es json");
    expect(getPrinterSettings()).toBeNull();
    localStorage.setItem(QZ_PRINTER_STORAGE_KEY, JSON.stringify({ enabled: true, printerName: "XP", widthMm: -5 }));
    expect(getPrinterSettings()?.widthMm).toBe(58);
    localStorage.setItem(QZ_PRINTER_STORAGE_KEY, JSON.stringify({ enabled: true, printerName: "" }));
    expect(getPrinterSettings()).toBeNull();
  });
});

describe("adaptHtmlForQz", () => {
  it("quita la barra .no-print e inyecta el override antes de </head>", () => {
    const html = `<html><head><style>x</style></head><body><div class="no-print"><button class="print-btn">Imprimir</button></div><p>ticket</p></body></html>`;
    const out = adaptHtmlForQz(html);
    expect(out).not.toContain("print-btn");
    expect(out).toContain("background:#fff");
    expect(out.indexOf("background:#fff")).toBeLessThan(out.indexOf("</head>"));
    expect(out).toContain("<p>ticket</p>");
  });

  it("sin </head> antepone el override en vez de perderlo", () => {
    const out = adaptHtmlForQz("<body>plano</body>");
    expect(out.startsWith("<style>")).toBe(true);
  });
});

describe("dispatchTicket — matriz de decisión", () => {
  it("sin configuración va DIRECTO a ventana, sin QZ y sin toasts", async () => {
    const result = await dispatchTicket("<html></html>", { jobName: "Ticket" });
    expect(result).toEqual({ transport: "window" });
    expect(mockPrintQz).not.toHaveBeenCalled();
    expect(vi.mocked(toast.info)).not.toHaveBeenCalled();
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it("con switch apagado también va directo a ventana", async () => {
    savePrinterSettings({ ...SETTINGS, enabled: false });
    const result = await dispatchTicket("<html></html>", { jobName: "Ticket" });
    expect(result.transport).toBe("window");
    expect(mockPrintQz).not.toHaveBeenCalled();
  });

  it("con configuración imprime por QZ con el html adaptado y sin ventana", async () => {
    savePrinterSettings(SETTINGS);
    mockPrintQz.mockResolvedValueOnce(undefined);
    const html = `<html><head></head><body><div class="no-print"><button class="print-btn">x</button></div>t</body></html>`;

    const result = await dispatchTicket(html, { jobName: "Ticket #9" });

    expect(result).toEqual({ transport: "qz" });
    expect(mockWindow).not.toHaveBeenCalled();
    const [sentHtml, sentOpts] = mockPrintQz.mock.calls[0]!;
    expect(sentHtml).not.toContain("print-btn");
    expect(sentOpts).toMatchObject({ printer: "XP-58", widthMm: 58, jobName: "Ticket #9" });
  });

  it.each([
    ["not-running", "qz-apagado"],
    ["connect-timeout", "qz-apagado"],
    ["sign-failed", "firma-fallo"],
    ["printer-not-found", "impresora-error"],
    ["print-failed", "impresora-error"],
  ] as const)("QzError %s cae a ventana con razón %s", async (kind, reason) => {
    savePrinterSettings(SETTINGS);
    mockPrintQz.mockRejectedValueOnce(new QzError(kind, "boom"));

    const result = await dispatchTicket("<html></html>", { jobName: "Ticket" });

    expect(result).toEqual({ transport: "window", fallbackReason: reason });
    expect(mockWindow).toHaveBeenCalledTimes(1);
  });

  it("print-timeout NO cae a ventana (evita ticket doble) y avisa reimprimir", async () => {
    savePrinterSettings(SETTINGS);
    mockPrintQz.mockRejectedValueOnce(new QzError("print-timeout", "sin respuesta"));

    const result = await dispatchTicket("<html></html>", { jobName: "Ticket" });

    expect(result).toEqual({ transport: "none", fallbackReason: "impresora-error" });
    expect(mockWindow).not.toHaveBeenCalled();
    expect(vi.mocked(toast.warning)).toHaveBeenCalledTimes(1);
  });

  it("el aviso 'QZ no está activo' sale UNA sola vez por pestaña", async () => {
    savePrinterSettings(SETTINGS);
    mockPrintQz.mockRejectedValue(new QzError("not-running", "apagado"));

    await dispatchTicket("<html></html>", { jobName: "T1" });
    await dispatchTicket("<html></html>", { jobName: "T2" });

    expect(vi.mocked(toast.info)).toHaveBeenCalledTimes(1);
    expect(mockWindow).toHaveBeenCalledTimes(2); // el fallback sí ocurre siempre
  });

  it("un error desconocido (no QzError) se trata como impresora-error con fallback", async () => {
    savePrinterSettings(SETTINGS);
    mockPrintQz.mockRejectedValueOnce(new Error("algo raro"));

    const result = await dispatchTicket("<html></html>", { jobName: "Ticket" });

    expect(result).toEqual({ transport: "window", fallbackReason: "impresora-error" });
    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1);
  });
});

describe("dispatchTicket — telemetría remota (POST /logs)", () => {
  it("el éxito QZ reporta qz_print_ok con impresora y job", async () => {
    savePrinterSettings(SETTINGS);
    mockPrintQz.mockResolvedValueOnce(undefined);

    await dispatchTicket("<html></html>", { jobName: "Ticket #9" });

    expect(vi.mocked(createSystemLog)).toHaveBeenCalledWith(
      "qz_print_ok",
      expect.stringContaining("XP-58"),
    );
  });

  it("el fallo QZ reporta qz_print_error con el kind y el mensaje", async () => {
    savePrinterSettings(SETTINGS);
    mockPrintQz.mockRejectedValueOnce(new QzError("printer-not-found", "no está"));

    await dispatchTicket("<html></html>", { jobName: "Ticket #9" });

    expect(vi.mocked(createSystemLog)).toHaveBeenCalledWith(
      "qz_print_error",
      expect.stringContaining("printer-not-found"),
    );
  });

  it("sin configuración QZ no se reporta nada (flujo legacy sin ruido)", async () => {
    await dispatchTicket("<html></html>", { jobName: "Ticket" });

    expect(vi.mocked(createSystemLog)).not.toHaveBeenCalled();
  });

  it("si el log falla, la impresión NO se ve afectada", async () => {
    savePrinterSettings(SETTINGS);
    vi.mocked(createSystemLog).mockRejectedValueOnce(new Error("offline"));
    mockPrintQz.mockResolvedValueOnce(undefined);

    const result = await dispatchTicket("<html></html>", { jobName: "Ticket" });

    expect(result).toEqual({ transport: "qz" });
  });
});

describe("warmUpTicketPrinting — precalentado al entrar a Caja", () => {
  it("con config QZ activa precalienta con la impresora guardada", () => {
    savePrinterSettings(SETTINGS);

    warmUpTicketPrinting();

    expect(vi.mocked(warmUpQz)).toHaveBeenCalledWith(SETTINGS.printerName);
  });

  it("sin configuración (o switch apagado) no hace nada", () => {
    warmUpTicketPrinting();
    savePrinterSettings({ ...SETTINGS, enabled: false });
    warmUpTicketPrinting();

    expect(vi.mocked(warmUpQz)).not.toHaveBeenCalled();
  });
});
