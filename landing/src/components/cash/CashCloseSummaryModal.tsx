import { X, Printer, CheckCircle2, AlertTriangle } from "lucide-react";
import type { CashSessionReport } from "@tadaima/api";

interface CashCloseSummaryModalProps {
  session: CashSessionReport;
  open: boolean;
  onClose: () => void;
}

/**
 * Modal del Corte de Caja — se abre al cerrar la sesión exitosamente o cuando
 * el admin pide reimprimir un corte histórico. Muestra:
 *  - Datos de la sesión (caja, cajero, horarios)
 *  - Efectivo inicial + ventas + entradas/salidas + ajustes
 *  - Esperado en caja vs cerrado real
 *  - Diferencia (descuadre) con badge verde/ámbar
 *  - Botón de imprimir que abre la versión print-friendly
 */
const fmt = (n: number): string =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—";

function buildPrintHtml(s: CashSessionReport): string {
  const diff = s.difference ?? 0;
  return `
    <html><head><title>Corte ${s.id}</title><style>
      body { font-family: ui-monospace, monospace; width: 58mm; margin: 0; padding: 8px; font-size: 11px; color: #000 }
      h2 { font-size: 14px; text-align: center; margin: 0 0 4px }
      .sub { text-align: center; color: #555; font-size: 9px; margin-bottom: 8px }
      .row { display: flex; justify-content: space-between; padding: 2px 0 }
      .divider { border-top: 1px dashed #000; margin: 6px 0 }
      .total { font-weight: 900; font-size: 13px; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px }
      @media print { @page { margin: 0; size: 58mm auto } body { width: 58mm } }
    </style></head><body>
      <h2>CORTE DE CAJA</h2>
      <div class="sub">${s.store?.name ?? ""} · ${s.register.name}</div>
      <div class="sub">${s.user.name} · #${s.id}</div>
      <div class="divider"></div>
      <div class="row"><span>Apertura</span><span>${fmtDate(s.opened_at)}</span></div>
      <div class="row"><span>Cierre</span><span>${fmtDate(s.closed_at)}</span></div>
      <div class="divider"></div>
      <div class="row"><span>Efectivo inicial</span><span>${fmt(s.opening_cash)}</span></div>
      <div class="row"><span>Ventas (${s.sales_count})</span><span>+${fmt(s.total_sales)}</span></div>
      ${s.total_entradas > 0 ? `<div class="row"><span>Entradas</span><span>+${fmt(s.total_entradas)}</span></div>` : ""}
      ${s.total_salidas > 0 ? `<div class="row"><span>Salidas</span><span>-${fmt(s.total_salidas)}</span></div>` : ""}
      ${s.total_ajustes !== 0 ? `<div class="row"><span>Ajustes</span><span>${s.total_ajustes > 0 ? "+" : ""}${fmt(s.total_ajustes)}</span></div>` : ""}
      <div class="row total"><span>Esperado</span><span>${fmt(s.expected_cash)}</span></div>
      <div class="row total"><span>Cerrado</span><span>${s.closing_cash != null ? fmt(s.closing_cash) : "—"}</span></div>
      ${s.closing_cash != null ? `<div class="row total" style="color: ${Math.abs(diff) < 0.01 ? "green" : "red"}"><span>Diferencia</span><span>${diff >= 0 ? "+" : ""}${fmt(diff)}</span></div>` : ""}
      <div class="sub" style="margin-top: 10px">Generado ${new Date().toLocaleString("es-MX")}</div>
    </body></html>
  `;
}

function doPrint(s: CashSessionReport): void {
  const w = window.open("", "_blank", "width=340,height=600");
  if (!w) return;
  w.document.write(buildPrintHtml(s));
  w.document.close();
  setTimeout(() => w.print(), 300);
}

export function CashCloseSummaryModal({ session: s, open, onClose }: CashCloseSummaryModalProps) {
  if (!open) return null;
  const diff = s.difference ?? 0;
  const isMatch = s.closing_cash != null && Math.abs(diff) < 0.01;
  const isShort = s.closing_cash != null && diff < -0.01;
  const isOver  = s.closing_cash != null && diff > 0.01;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)" }} />
      <div style={{
        position: "relative",
        background: "var(--td-popup-bg)",
        border: "1px solid var(--td-popup-border)",
        borderRadius: 24,
        padding: 24,
        width: "100%", maxWidth: 460,
        maxHeight: "90vh", overflow: "auto",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: isMatch ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
              border: `1px solid ${isMatch ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {isMatch ? <CheckCircle2 size={20} color="#10b981" /> : <AlertTriangle size={20} color="#f59e0b" />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "var(--td-text-hi)" }}>Corte de Caja</h3>
              <p style={{ margin: "2px 0 0", fontSize: 10, fontWeight: 700, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                {s.store?.name ?? ""} · {s.register.name} · #{s.id}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--td-text-ghost)", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Datos de sesión */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, padding: "12px 14px", background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 14 }}>
          <Row label="Cajero" value={s.user.name} />
          <Row label="Apertura" value={fmtDate(s.opened_at)} />
          <Row label="Cierre" value={fmtDate(s.closed_at)} />
        </div>

        {/* Resumen monetario */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
          <Row label="Efectivo inicial" value={fmt(s.opening_cash)} />
          <Row label={`Ventas (${s.sales_count})`} value={`+${fmt(s.total_sales)}`} valueColor="#10b981" />
          {s.total_entradas > 0 && <Row label="Entradas" value={`+${fmt(s.total_entradas)}`} valueColor="#10b981" />}
          {s.total_salidas > 0 && <Row label="Salidas" value={`-${fmt(s.total_salidas)}`} valueColor="#DC2626" />}
          {s.total_ajustes !== 0 && <Row label="Ajustes" value={`${s.total_ajustes > 0 ? "+" : ""}${fmt(s.total_ajustes)}`} />}
        </div>

        {/* Esperado / Cerrado / Diferencia */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "14px 16px", background: "rgba(0,0,0,0.2)", border: "1px solid var(--td-card-border)", borderRadius: 16, marginBottom: 18 }}>
          <Row label="Esperado en caja" value={fmt(s.expected_cash)} bold />
          {s.closing_cash != null && (
            <>
              <Row label="Cerrado real" value={fmt(s.closing_cash)} bold />
              <Row
                label="Diferencia"
                value={`${diff >= 0 ? "+" : ""}${fmt(diff)}`}
                bold
                valueColor={isMatch ? "#10b981" : isShort ? "#DC2626" : "#f59e0b"}
                tag={isMatch ? "✓ Cuadra" : isShort ? "Falta" : "Sobra"}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => doPrint(s)}
            style={{
              flex: 1, padding: "12px", borderRadius: 14,
              background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)",
              color: "var(--td-text-hi)", fontSize: 11, fontWeight: 900,
              textTransform: "uppercase", letterSpacing: "0.12em",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <Printer size={13} />
            Imprimir
          </button>
          <button onClick={onClose}
            style={{
              flex: 1, padding: "12px", borderRadius: 14,
              background: "linear-gradient(135deg,#BB1100,#FF3322)",
              border: "none", color: "#fff", fontSize: 11, fontWeight: 900,
              textTransform: "uppercase", letterSpacing: "0.12em", cursor: "pointer",
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
  tag?: string;
}
function Row({ label, value, valueColor, bold, tag }: RowProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--td-text-md)" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {tag && (
          <span style={{
            fontSize: 8, fontWeight: 900, padding: "1px 6px", borderRadius: 6,
            background: valueColor === "#10b981" ? "rgba(16,185,129,0.15)" : valueColor === "#DC2626" ? "rgba(220,38,38,0.15)" : "rgba(245,158,11,0.15)",
            color: valueColor, border: `1px solid ${valueColor}40`,
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>{tag}</span>
        )}
        <span style={{ fontSize: bold ? 14 : 12, fontWeight: bold ? 900 : 800, color: valueColor ?? "var(--td-text-hi)" }}>
          {value}
        </span>
      </span>
    </div>
  );
}
