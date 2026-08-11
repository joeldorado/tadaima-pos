import { useCallback, useEffect, useRef, useState } from "react";
import { X, Printer, RefreshCw, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  ensureQzConnection,
  getQzStatus,
  listQzPrinters,
  onQzStatusChange,
  QzError,
  type QzStatus,
} from "@/lib/qz";
import {
  clearPrinterSettings,
  dispatchTicket,
  getPrinterSettings,
  savePrinterSettings,
} from "@/lib/ticketPrint";

interface PrinterConfigModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Timeout de conexión SOLO para este modal: en la primera configuración QZ
 * puede mostrar su diálogo "Action Required" (Allow) y el humano tarda en
 * contestarlo — mucho más que los 3.5s del default que usa el flujo de cobro.
 */
const SETUP_CONNECT_TIMEOUT_MS = 30_000;

/**
 * Configuración de la impresión silenciosa (QZ Tray) — POR MÁQUINA, no por
 * empresa: la impresora es del equipo donde corre la caja (localStorage).
 * Requiere QZ Tray instalado en esta máquina (guía en Documentación →
 * "Impresión automática"). Sin QZ o con el switch apagado, los tickets siguen
 * saliendo por la ventana de siempre.
 */
export function PrinterConfigModal({ open, onClose }: PrinterConfigModalProps) {
  const saved = getPrinterSettings();
  const [enabled, setEnabled] = useState(saved?.enabled ?? false);
  const [printerName, setPrinterName] = useState(saved?.printerName ?? "");
  const [widthMm, setWidthMm] = useState(saved?.widthMm ?? 58);
  const [status, setStatus] = useState<QzStatus>(getQzStatus());
  const [printers, setPrinters] = useState<string[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [testPrinting, setTestPrinting] = useState(false);

  useEffect(() => onQzStatusChange(setStatus), []);

  const refreshPrinters = useCallback(async () => {
    setLoadingPrinters(true);
    setConnectError(null);
    try {
      await ensureQzConnection({ timeoutMs: SETUP_CONNECT_TIMEOUT_MS });
      const found = await listQzPrinters();
      setPrinters(found);
      // Preselección amable: si no hay impresora elegida aún, sugerir una
      // térmica por nombre (XP/58/POS) o la primera de la lista.
      setPrinterName(prev => {
        if (prev && found.includes(prev)) return prev;
        const guess = found.find(p => /xp|58|pos|ticket|therm/i.test(p)) ?? found[0] ?? "";
        return guess;
      });
    } catch (err) {
      setPrinters([]);
      setConnectError(err instanceof QzError && err.kind === "sign-failed"
        ? "QZ Tray sí respondió, pero el servidor no autorizó la firma. Cierra sesión y vuelve a entrar; si sigue, avisa al administrador."
        : "No se pudo conectar con QZ Tray. Revisa que esté instalado y abierto en ESTA máquina (icono verde junto al reloj).");
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  // Al abrir: intento automático de conexión + lista (sin bloquear el modal).
  useEffect(() => {
    if (open) void refreshPrinters();
  }, [open, refreshPrinters]);

  // La conexión puede entrar DESPUÉS de que refreshPrinters se rindió (p.ej.
  // el usuario tardó en contestar el diálogo Allow de QZ y venció el timeout):
  // al pasar a "connected" recargamos la lista solos, sin otro clic en Buscar.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (open && status === "connected" && prev !== "connected" && !loadingPrinters) {
      void refreshPrinters();
    }
  }, [status, open, loadingPrinters, refreshPrinters]);

  if (!open) return null;

  const persist = (): boolean => {
    if (enabled && !printerName) {
      toast.error("Elige una impresora antes de activar la impresión silenciosa.");
      return false;
    }
    if (!printerName) {
      clearPrinterSettings();
      return true;
    }
    savePrinterSettings({ enabled, printerName, widthMm });
    return true;
  };

  const handleSave = () => {
    if (!persist()) return;
    toast.success(enabled ? "Impresión silenciosa activada en esta máquina" : "Configuración guardada (impresión por ventana)");
    onClose();
  };

  const handleTestPrint = async () => {
    if (!persist()) return;
    setTestPrinting(true);
    try {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Prueba</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:11px;font-weight:700;width:58mm;padding:2mm 1.5mm;background:#fff}h2{font-size:15px;text-align:center;font-weight:900}.sub{font-size:9px;text-align:center}.divider{border-top:1px dashed #000;margin:6px 0}
      @media print{@page{size:58mm auto;margin:0}}</style></head><body>
      <h2>TADAIMA</h2><div class="sub">Prueba de impresión</div><div class="divider"></div>
      <div style="font-size:10px;text-align:center">${new Date().toLocaleString("es-MX")}</div>
      <div style="font-size:10px;text-align:center;margin-top:6px;font-weight:900">Si este ticket salió SOLO,<br>la impresión silenciosa quedó lista.</div>
      <div class="divider"></div><div class="sub">Ancho configurado: ${widthMm}mm</div>
      </body></html>`;
      const result = await dispatchTicket(html, { jobName: "Prueba de impresión" });
      if (result.transport === "qz") toast.success("Prueba enviada a la impresora");
    } finally {
      setTestPrinting(false);
    }
  };

  const statusChip = status === "connected"
    ? { label: "Conectado a QZ Tray", color: "#34d399", Icon: CheckCircle2 }
    : status === "connecting"
      ? { label: "Conectando…", color: "#F59E0B", Icon: Loader2 }
      : { label: "Sin conexión con QZ Tray", color: "#f87171", Icon: AlertTriangle };

  const inputStyle = {
    width: "100%", background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)",
    borderRadius: 14, color: "var(--td-input-text)", padding: "12px 16px",
    fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" as const,
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)" }} onClick={onClose} />
      <div style={{ position: "relative", background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", borderRadius: 28, padding: 32, minWidth: 380, maxWidth: 480, width: "100%" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <h3 style={{ color: "var(--td-text-hi)", fontSize: 17, fontWeight: 900, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Printer size={17} /> Impresora de tickets
            </h3>
            <p style={{ color: "var(--td-text-ghost)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", margin: "4px 0 0" }}>
              Impresión silenciosa · Solo esta máquina
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--td-text-ghost)", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Estado de conexión */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 14, padding: "10px 14px", marginBottom: 14 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 900, color: statusChip.color }}>
            <statusChip.Icon size={14} className={status === "connecting" ? "animate-spin" : undefined} />
            {statusChip.label}
          </span>
          <button
            onClick={() => { void refreshPrinters(); }}
            disabled={loadingPrinters}
            data-testid="qz-refresh-btn"
            style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 10, color: "var(--td-text-lo)", padding: "6px 12px", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", cursor: loadingPrinters ? "wait" : "pointer" }}
          >
            {loadingPrinters ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Buscar
          </button>
        </div>

        {loadingPrinters && status !== "connected" && (
          <p style={{ margin: "-6px 0 14px", fontSize: 10, fontWeight: 700, color: "#F59E0B" }}>
            Si QZ Tray abre una ventana de permiso ("Action Required"), presiona Allow.
          </p>
        )}

        {connectError && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.30)", borderRadius: 14, padding: "10px 14px", marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#f87171" }}>{connectError}</p>
            <p style={{ margin: "6px 0 0", fontSize: 10, fontWeight: 600, color: "var(--td-text-ghost)" }}>
              La guía de instalación está en Documentación → "Impresión automática". Mientras tanto los tickets siguen saliendo por la ventana de siempre.
            </p>
          </div>
        )}

        {/* Impresora */}
        <label style={{ display: "block", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--td-text-ghost)", marginBottom: 8 }}>
          Impresora de esta caja
        </label>
        <select
          value={printerName}
          onChange={e => setPrinterName(e.target.value)}
          data-testid="qz-printer-select"
          style={{ ...inputStyle, marginBottom: 14, cursor: "pointer" }}
        >
          {printerName && !printers.includes(printerName) && <option value={printerName}>{printerName} (guardada)</option>}
          {!printerName && <option value="">— Elegir impresora —</option>}
          {printers.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* Ancho del papel */}
        <label style={{ display: "block", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--td-text-ghost)", marginBottom: 8 }}>
          Ancho del papel
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[58, 48].map(mm => (
            <button
              key={mm}
              onClick={() => setWidthMm(mm)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 12, fontSize: 13, fontWeight: 900, cursor: "pointer",
                background: widthMm === mm ? "rgba(16,185,129,0.15)" : "var(--td-input-bg)",
                border: widthMm === mm ? "1px solid rgba(16,185,129,0.5)" : "1px solid var(--td-input-border)",
                color: widthMm === mm ? "#34d399" : "var(--td-text-lo)",
              }}
            >
              {mm} mm{mm === 58 ? " (normal)" : ""}
            </button>
          ))}
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 10, color: "var(--td-text-ghost)", fontWeight: 600 }}>
          Si el ticket sale recortado del lado derecho, cambia a 48 mm.
        </p>

        {/* Switch maestro */}
        <button
          onClick={() => setEnabled(!enabled)}
          data-testid="qz-enabled-toggle"
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            background: enabled ? "rgba(16,185,129,0.10)" : "var(--td-card-bg)",
            border: enabled ? "1px solid rgba(16,185,129,0.40)" : "1px solid var(--td-card-border)",
            borderRadius: 14, padding: "12px 16px", marginBottom: 20, cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 900, color: enabled ? "#34d399" : "var(--td-text-lo)" }}>
            Impresión silenciosa (sin ventana)
          </span>
          <span style={{
            width: 40, height: 22, borderRadius: 999, position: "relative", transition: "background 150ms",
            background: enabled ? "#10b981" : "var(--td-input-border)",
          }}>
            <span style={{ position: "absolute", top: 2, left: enabled ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 150ms" }} />
          </span>
        </button>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => { void handleTestPrint(); }}
            disabled={testPrinting || !printerName}
            data-testid="qz-test-print"
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 14, color: "var(--td-text-lo)", padding: "12px", fontSize: 12, fontWeight: 700, cursor: testPrinting || !printerName ? "not-allowed" : "pointer", opacity: !printerName ? 0.5 : 1 }}
          >
            {testPrinting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
            Imprimir prueba
          </button>
          <button
            onClick={handleSave}
            data-testid="qz-save"
            style={{ flex: 1, background: "linear-gradient(135deg, #065f46, #10b981)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 14, color: "#fff", padding: "12px", fontSize: 12, fontWeight: 900, cursor: "pointer" }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
