import { X, Printer, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getCashSessionDetail } from "@tadaima/api";
import type { CashSessionReport, CashSessionDetail, CashTicket } from "@tadaima/api";

interface CashCloseSummaryModalProps {
  session: CashSessionReport;
  open: boolean;
  onClose: () => void;
}

/**
 * Modal del Corte de Caja — se abre al cerrar la sesión exitosamente o cuando
 * el admin pide reimprimir un corte histórico. Muestra:
 *  - Datos de la sesión (caja, cajero, horarios)
 *  - Efectivo inicial + ventas totales + dinero que sí entró a caja
 *  - (tarjeta queda visible, pero NO cuenta para el descuadre físico)
 *  - Esperado en caja vs cerrado real
 *  - Diferencia (descuadre) con badge verde/ámbar
 *  - Botón de imprimir que abre la versión print-friendly
 */
const fmt = (n: number): string =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—";

/** Bloque de tickets desglosados para la impresión del corte. */
// Escape básico para strings interpolados en el HTML del corte impreso
// (nombres de item/insumo, descripciones, notas). document.write no escapa
// y el CSP no bloquea inyección de markup — escapar SIEMPRE.
function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildTicketsHtml(detail: CashSessionDetail | null): string {
  if (!detail || detail.tickets.length === 0) return "";
  const tickets = detail.tickets.map(t => {
    const cancelled = t.status === "returned" || t.cancellation_status === "full";
    const items = t.items.map(i =>
      `<div class="row"><span>${i.quantity} × ${esc(i.name)}</span><span>${fmt(i.total)}</span></div>`
    ).join("");
    const pays = t.payments.map(p => `${p.method} ${fmt(p.amount)}`).join(" + ");
    return `<div class="row" style="font-weight:900; margin-top:4px"><span>#${t.id}${cancelled ? " CANCELADO" : ""}</span><span>${fmt(t.total)}</span></div>${items}<div class="row"><span>${pays}</span><span></span></div>`;
  }).join("");
  const presale = detail.pre_sale_payments.map(p =>
    `<div class="row"><span>${esc(p.folio)} · ${esc(p.method)}</span><span>+${fmt(p.amount)}</span></div>`
  ).join("");
  const movs = detail.movements.map(m =>
    `<div class="row"><span>${esc(m.description || m.type)}</span><span>${m.type === "salida" ? "-" : "+"}${fmt(m.amount)}</span></div>`
  ).join("");
  const supplies = (detail.supply_purchases ?? []).map(p =>
    `<div class="row"><span>${esc(p.name)}${p.quantity !== 1 ? ` ×${p.quantity}` : ""}</span><span>-${fmt(p.amount)}</span></div>`
  ).join("");
  return `
    <div class="divider"></div>
    <div class="sub">DESGLOSE DE TICKETS</div>
    ${tickets}
    ${presale ? `<div class="divider"></div><div class="sub">PREVENTA</div>${presale}` : ""}
    ${supplies ? `<div class="divider"></div><div class="sub">INSUMOS DEL DÍA</div>${supplies}` : ""}
    ${movs ? `<div class="divider"></div><div class="sub">MOVIMIENTOS</div>${movs}` : ""}
  `;
}

function buildPrintHtml(s: CashSessionReport, detail: CashSessionDetail | null = null): string {
  const diff = s.difference ?? 0;
  // Fuera del cajón (tarjeta/transferencia) — informativo, NO suma al esperado.
  const cardOut = s.total_card ?? 0;
  const transferOut = s.total_transfer ?? 0;
  return `
    <html><head><title>Corte ${s.id}</title><style>
      body { font-family: ui-monospace, monospace; width: 58mm; margin: 0; padding: 8px; font-size: 11px; font-weight: 700; color: #000 }
      h2 { font-size: 14px; text-align: center; margin: 0 0 4px }
      .sub { text-align: center; color: #000; font-size: 9px; margin-bottom: 8px }
      .row { display: flex; justify-content: space-between; padding: 2px 0 }
      .divider { border-top: 1px dashed #000; margin: 6px 0 }
      .total { font-weight: 900; font-size: 13px; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px }
      @media print { @page { margin: 0; size: 58mm auto; orientation: portrait } body { width: 58mm } }
    </style></head><body>
      <h2>CORTE DE CAJA</h2>
      <div class="sub">${s.store?.name ?? ""} · ${s.register.name}</div>
      <div class="sub">${s.user.name} · #${s.id}</div>
      <div class="divider"></div>
      <div class="row"><span>Apertura</span><span>${fmtDate(s.opened_at)}</span></div>
      <div class="row"><span>Cierre</span><span>${fmtDate(s.closed_at)}</span></div>
      <div class="divider"></div>
      <div class="row"><span>Efectivo inicial</span><span>${fmt(s.opening_cash)}</span></div>
      <div class="row"><span>Ventas totales (${s.sales_count})</span><span>${fmt(s.total_sales)}</span></div>
      ${(s.total_usd_received ?? 0) > 0 ? `<div class="row"><span>Dólares recibidos</span><span>${s.total_usd_received} USD</span></div>` : ""}
      ${s.total_pre_sale_payments > 0 ? `<div class="row"><span>Preventas cobradas</span><span>${fmt(s.total_pre_sale_payments)}</span></div>` : ""}
      <div class="row"><span>Cobrado en caja</span><span>+${fmt(s.cash_collected)}</span></div>
      ${cardOut > 0 ? `<div class="row"><span>Tarjeta (fuera de caja)</span><span>${fmt(cardOut)}</span></div>` : ""}
      ${transferOut > 0 ? `<div class="row"><span>Transfer. (fuera de caja)</span><span>${fmt(transferOut)}</span></div>` : ""}
      ${s.total_entradas > 0 ? `<div class="row"><span>Entradas</span><span>+${fmt(s.total_entradas)}</span></div>` : ""}
      ${s.total_salidas > 0 ? `<div class="row"><span>Salidas de caja</span><span>-${fmt(s.total_salidas)}</span></div>` : ""}
      ${(s.total_supplies ?? 0) > 0 ? `<div class="row"><span>&nbsp;&nbsp;De salidas, insumos (${s.supplies_count ?? 0})</span><span>-${fmt(s.total_supplies ?? 0)}</span></div>` : ""}
      ${s.total_ajustes !== 0 ? `<div class="row"><span>Ajustes</span><span>${s.total_ajustes > 0 ? "+" : ""}${fmt(s.total_ajustes)}</span></div>` : ""}
      <div class="row total"><span>Esperado</span><span>${fmt(s.expected_cash)}</span></div>
      <div class="row total"><span>Cerrado</span><span>${s.closing_cash != null ? fmt(s.closing_cash) : "—"}</span></div>
      ${s.closing_cash != null ? `<div class="row total" style="color: ${Math.abs(diff) < 0.01 ? "green" : "red"}"><span>Diferencia</span><span>${diff >= 0 ? "+" : ""}${fmt(diff)}</span></div>` : ""}
      ${buildTicketsHtml(detail)}
      <div class="sub" style="margin-top: 10px">Generado ${new Date().toLocaleString("es-MX")}</div>
    </body></html>
  `;
}

/** Impresión 58mm del corte (resumen + desglose). Reusada por la página Cortes. */
export function printCashCut(s: CashSessionReport, detail: CashSessionDetail | null = null): void {
  // OJO: NO usar "noopener" aquí — window.open devolvería null y no podríamos
  // escribir el documento. La defensa contra inyección es esc() en el HTML.
  const w = window.open("", "_blank", "width=340,height=600");
  if (!w) return;
  w.document.write(buildPrintHtml(s, detail));
  w.document.close();
  setTimeout(() => w.print(), 300);
}

export function CashCloseSummaryModal({ session: s, open, onClose }: CashCloseSummaryModalProps) {
  // Desglose del corte (tickets + preventa + movimientos) — Joel 2026-06-10.
  const detailQuery = useQuery({
    queryKey: ["cash-session-detail", s.id],
    queryFn: () => getCashSessionDetail(s.id),
    enabled: open,
    staleTime: 60_000,
  });
  const detail = detailQuery.data ?? null;

  if (!open) return null;
  const diff = s.difference ?? 0;
  const isMatch = s.closing_cash != null && Math.abs(diff) < 0.01;
  const isShort = s.closing_cash != null && diff < -0.01;
  // Desglose de lo que se cobró SIN entrar al cajón. Los campos llegan desde
  // 2026-07-23; un payload viejo cacheado cae al agregado calculado.
  const cardOutside = s.total_card;
  const transferOutside = s.total_transfer;
  const hasBreakdown = cardOutside != null && transferOutside != null;
  const outsideDrawer = hasBreakdown
    ? cardOutside + transferOutside
    : Math.max(0, (s.total_sales + s.total_pre_sale_payments) - s.cash_collected);

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
          <Row label={`Ventas totales (${s.sales_count})`} value={fmt(s.total_sales)} />
          {(s.total_usd_received ?? 0) > 0 && (
            <Row label="Dólares recibidos" value={`${s.total_usd_received} USD`} valueColor="#10b981" />
          )}
          {s.total_pre_sale_payments > 0 && (
            <Row label="Preventas cobradas" value={fmt(s.total_pre_sale_payments)} valueColor="#F59E0B" />
          )}
          <Row label="Cobrado en caja" value={`+${fmt(s.cash_collected)}`} valueColor="#10b981" bold />
          {s.total_entradas > 0 && <Row label="Entradas" value={`+${fmt(s.total_entradas)}`} valueColor="#10b981" />}
          {s.total_salidas > 0 && <Row label="Salidas de caja" value={`-${fmt(s.total_salidas)}`} valueColor="#DC2626" />}
          {/* Insumos: ya incluidos en Salidas (informativo, no se re-resta). */}
          {(s.total_supplies ?? 0) > 0 && (
            <Row label={`· De salidas, insumos (${s.supplies_count ?? 0})`} value={`-${fmt(s.total_supplies ?? 0)}`} valueColor="#F97316" />
          )}
          {s.total_ajustes !== 0 && <Row label="Ajustes" value={`${s.total_ajustes > 0 ? "+" : ""}${fmt(s.total_ajustes)}`} />}
        </div>

        <div style={{ marginBottom: 16, padding: "10px 12px", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.22)", borderRadius: 14 }}>
          <p style={{ margin: 0, fontSize: 10, color: "var(--td-text-md)", lineHeight: 1.45 }}>
            El faltante o sobrante se calcula SOLO con el efectivo del cajón (pesos y
            dólares). Tarjetas y transferencias no entran al esperado.
            {!hasBreakdown && outsideDrawer > 0 ? ` Fuera de caja: ${fmt(outsideDrawer)}.` : ""}
          </p>
          {hasBreakdown && outsideDrawer > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8, paddingTop: 8, borderTop: "1px dashed rgba(59,130,246,0.25)" }}>
              {cardOutside > 0 && <Row label="Fuera de caja · Tarjeta" value={fmt(cardOutside)} />}
              {transferOutside > 0 && <Row label="Fuera de caja · Transferencia" value={fmt(transferOutside)} />}
            </div>
          )}
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

        {/* Desglose de tickets del corte */}
        <div style={{ marginBottom: 18 }}>
          <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 900, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Desglose del corte
          </p>
          {detailQuery.isPending ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 14, color: "var(--td-text-lo)", fontSize: 11 }}>
              <Loader2 size={14} className="animate-spin" /> Cargando tickets…
            </div>
          ) : !detail ? (
            <p style={{ fontSize: 11, color: "var(--td-text-lo)", padding: "8px 0" }}>No se pudo cargar el desglose.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto", paddingRight: 4 }}>
              {detail.tickets.map(t => <TicketRow key={t.id} ticket={t} />)}
              {detail.tickets.length === 0 && (
                <p style={{ fontSize: 11, color: "var(--td-text-lo)", margin: 0 }}>Sin ventas en esta sesión.</p>
              )}

              {detail.pre_sale_payments.length > 0 && (
                <div style={{ padding: "10px 12px", background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 12 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 9, fontWeight: 900, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.1em" }}>Preventa (anticipos / liquidaciones)</p>
                  {detail.pre_sale_payments.map(p => (
                    <Row key={p.id} label={`${p.folio} · ${p.method}`} value={`+${fmt(p.amount)}`} valueColor="#F59E0B" />
                  ))}
                </div>
              )}

              {(detail.supply_purchases ?? []).length > 0 && (
                <div style={{ padding: "10px 12px", background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 12 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 9, fontWeight: 900, color: "#F97316", textTransform: "uppercase", letterSpacing: "0.1em" }}>Insumos del día</p>
                  {(detail.supply_purchases ?? []).map(p => (
                    <Row
                      key={p.id}
                      label={`${p.name}${p.quantity !== 1 ? ` ×${p.quantity}` : ""}${p.note ? ` · ${p.note}` : ""}`}
                      value={`-${fmt(p.amount)}`}
                      valueColor="#F97316"
                    />
                  ))}
                </div>
              )}

              {detail.movements.length > 0 && (
                <div style={{ padding: "10px 12px", background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 12 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 9, fontWeight: 900, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Movimientos de caja</p>
                  {detail.movements.map(m => (
                    <Row
                      key={m.id}
                      label={m.description || m.type}
                      value={`${m.type === "salida" ? "-" : "+"}${fmt(m.amount)}`}
                      valueColor={m.type === "salida" ? "#DC2626" : "#10b981"}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => printCashCut(s, detail)}
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

/** Ticket desglosado: encabezado (folio/hora/total) + items + métodos de pago. */
function TicketRow({ ticket: t }: { ticket: CashTicket }) {
  const cancelled = t.status === "returned" || t.cancellation_status === "full";
  const partial = t.cancellation_status === "partial";
  return (
    <div style={{ padding: "10px 12px", background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 12, opacity: cancelled ? 0.55 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: "var(--td-text-hi)" }}>
          Ticket #{t.id}
          {t.customer ? ` · ${t.customer}` : ""}
          {cancelled && <span style={{ color: "#DC2626", marginLeft: 6 }}>CANCELADO</span>}
          {partial && <span style={{ color: "#F59E0B", marginLeft: 6 }}>CANC. PARCIAL</span>}
        </span>
        <span style={{ fontSize: 9, color: "var(--td-text-lo)" }}>
          {t.sold_at ? new Date(t.sold_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : ""}
        </span>
      </div>
      {t.items.map((i, idx) => (
        <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--td-text-md)", padding: "1px 0" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>
            {i.quantity} × {i.name}
          </span>
          <span style={{ flexShrink: 0 }}>{fmt(i.total)}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--td-card-border)" }}>
        <span style={{ fontSize: 9, color: "var(--td-text-lo)" }}>
          {t.payments.map(p => `${p.method} ${fmt(p.amount)}`).join(" + ") || "—"}
          {t.discount > 0 ? ` · desc ${fmt(t.discount)}` : ""}
        </span>
        <span style={{ fontSize: 11, fontWeight: 900, color: "var(--td-text-hi)" }}>{fmt(t.total)}</span>
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
