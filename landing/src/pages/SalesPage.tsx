import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  TrendingUp, DollarSign, ShoppingBag, Users, BarChart3, Loader2,
  CreditCard, CalendarDays, ChevronDown, X, ChevronRight,
  Package, Receipt, PackageX, ChevronUp, ImageOff, RotateCcw, AlertTriangle,
  Store, Printer, User as UserIcon, FileText, Download, Bookmark,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { returnSale, getCashReport } from "@tadaima/api";
import { getTodayLocal } from "@/lib/date";
import type { CashSessionReport } from "@tadaima/api";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useSalesQuery } from "@/hooks/queries/useSales";
import { usePreSaleOrdersQuery } from "@/hooks/queries/usePreSales";
import { useProductsQuery } from "@/hooks/queries/useProducts";
import { useStoresQuery } from "@/hooks/queries/useStores";
import { useUsersQuery } from "@/hooks/queries/useUsers";
import { useExchangeRateQuery } from "@/hooks/queries/useSystemSettings";
import { useSaleCancellationsQuery } from "@/hooks/queries/useSaleCancellations";
import { queryKeys } from "@/lib/queryKeys";
import type { SaleDetail, PreSaleOrder, Product, Store as StoreType } from "@tadaima/api";
import { useAuth } from "@tadaima/auth";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const T = {
  bgGrad: "var(--td-page-bg)",
  glass: {
    background: "var(--td-panel-bg)",
    backdropFilter: "blur(28px) saturate(160%)",
    WebkitBackdropFilter: "blur(28px) saturate(160%)",
    border: "1px solid var(--td-panel-border)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)",
  } as React.CSSProperties,
  glassDim: {
    background: "var(--td-panel-bg)",
    backdropFilter: "blur(20px) saturate(140%)",
    WebkitBackdropFilter: "blur(20px) saturate(140%)",
    border: "1px solid var(--td-panel-border)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
  } as React.CSSProperties,
  redBright: "#FF4422",
  btnRed: {
    background: "linear-gradient(135deg, #CC2200 0%, #FF4422 100%)",
    borderRadius: "9999px",
    border: "1px solid rgba(255,120,90,0.3)",
    boxShadow: "0 0 28px rgba(204,34,0,0.45), 0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,180,160,0.25)",
    color: "#ffffff",
  } as React.CSSProperties,
};

interface ProductInfo {
  name: string;
  sku: string;
  imagen: string;
}

function getPaymentMethodName(sale: SaleDetail): string {
  const first = sale.payments?.[0];
  if (!first) return "Efectivo";
  return first.payment_method?.name ?? "Efectivo";
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n);

const fmtDate = (dateStr: string) => {
  if (!dateStr) return "DD/MM/YYYY";
  return new Date(dateStr + "T12:00:00")
    .toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
    .replace(".", "");
};

const fmtDateTime = (dateStr: string) =>
  dateStr ? new Date(dateStr).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—";

const methodBg = (m: string) => {
  const lm = (m || "").toLowerCase();
  if (lm.includes("tarjeta"))  return "bg-blue-500/10 border-blue-500/25 text-blue-400";
  if (lm.includes("dólar") || lm.includes("dolar")) return "bg-amber-500/10 border-amber-500/25 text-amber-400";
  if (lm.includes("transfer")) return "bg-purple-500/10 border-purple-500/25 text-purple-400";
  return "bg-emerald-500/10 border-emerald-500/25 text-emerald-400";
};

function printTicket(sale: SaleDetail) {
  const win = window.open("", "_blank", "width=340,height=600");
  if (!win) return;
  const payName = getPaymentMethodName(sale);
  const items = (sale.items || [])
    .map(i => {
      const name = i.product?.name || String(i.product_id);
      return `<tr>
        <td style="padding:2px 0;font-size:10px;">${name}</td>
        <td style="text-align:center;padding:2px 4px;font-size:10px;">×${i.quantity}</td>
        <td style="text-align:right;font-size:10px;">${fmt(i.price * i.quantity)}</td>
      </tr>`;
    })
    .join("");

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Ticket #${sale.id}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',monospace;font-size:11px;width:280px;padding:12px 8px}
    h2{font-size:16px;text-align:center;font-weight:900;margin-bottom:4px}
    .sub{font-size:9px;text-align:center;color:#555;margin-bottom:8px}
    .divider{border-top:1px dashed #000;margin:8px 0}
    table{width:100%;border-collapse:collapse}
    .total-row td{font-weight:900;font-size:13px;border-top:1px solid #000;padding-top:6px}
    .footer{text-align:center;font-size:9px;color:#555;margin-top:10px}
    @media print{@page{margin:0;size:58mm auto}body{width:58mm}}
  </style></head><body>
  <h2>TADAIMA</h2>
  <div class="sub">Manga & Hobby Store</div>
  <div class="divider"></div>
  <div style="font-size:9px;margin-bottom:6px">
    <div>Ticket #${sale.id}</div>
    <div>${fmtDateTime(sale.sold_at || sale.created_at)}</div>
    ${sale.customer?.name ? `<div>Cliente: ${sale.customer.name}</div>` : ""}
    <div>Pago: ${payName}</div>
  </div>
  <div class="divider"></div>
  <table>
    <thead><tr>
      <th style="text-align:left;font-size:9px">Artículo</th>
      <th style="text-align:center;font-size:9px">Cant</th>
      <th style="text-align:right;font-size:9px">Total</th>
    </tr></thead>
    <tbody>${items}</tbody>
    ${(sale.pre_sale_orders ?? []).length === 0 ? `
    <tfoot><tr class="total-row">
      <td colspan="2">TOTAL</td>
      <td style="text-align:right">${fmt(sale.total)}</td>
    </tr></tfoot>` : ""}
  </table>

  ${(sale.pre_sale_orders ?? []).length > 0 ? `
  <div class="divider"></div>
  ${(sale.pre_sale_orders ?? []).map(o => {
    const isLiq = (o.balance ?? 0) <= 0.01 && (o.paid_amount ?? 0) > 0;
    const statusLabel = isLiq ? "LIQUIDACIÓN" : "ANTICIPO";
    return `
    <div style="font-size:10px;margin-bottom:8px">
      <div style="font-weight:900;font-size:10px;display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <span>★ ${o.code}</span>
        <span style="font-size:8px;padding:1px 4px;border:1px solid #000">${statusLabel}</span>
      </div>
      ${o.items.map(it => `
        <div style="font-size:9px;display:flex;justify-content:space-between;margin-bottom:1px">
          <span>${it.catalog?.product_name ?? "Producto"} ×${it.quantity}</span>
          <span>${fmt(it.unit_price * it.quantity)}</span>
        </div>
      `).join("")}
      <div style="font-size:9px;margin-top:3px;border-top:1px dashed #000;padding-top:2px">
        <div style="display:flex;justify-content:space-between"><span>Precio total folio</span><span>${fmt(o.total)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:900"><span>${isLiq ? "Liquidación pagada" : "Anticipo pagado"}</span><span>${fmt(o.paid_amount)}</span></div>
        ${o.balance > 0 ? `<div style="display:flex;justify-content:space-between"><span>Saldo pendiente</span><span>${fmt(o.balance)}</span></div>` : ""}
      </div>
    </div>`;
  }).join("")}
  <div class="divider"></div>
  <div style="font-size:10px;display:flex;justify-content:space-between"><span>Productos regulares</span><span>${fmt(sale.total)}</span></div>
  <div style="font-size:10px;display:flex;justify-content:space-between"><span>Anticipo/Liquid. preventa</span><span>${fmt((sale.pre_sale_orders ?? []).reduce((s, o) => s + (o.paid_amount ?? 0), 0))}</span></div>
  <div style="font-weight:900;font-size:13px;border-top:1px solid #000;padding-top:6px;margin-top:4px;display:flex;justify-content:space-between"><span>TOTAL COBRADO</span><span>${fmt(sale.total + (sale.pre_sale_orders ?? []).reduce((s, o) => s + (o.paid_amount ?? 0), 0))}</span></div>
  ` : ""}

  <div class="divider"></div>
  <div class="footer">¡Gracias por tu compra!</div>
  </body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); }, 300);
}

// ─── Thumbnail de producto ────────────────────────────────────────────────────
function ProductThumb({ src, name, size = 44, rounded = "rounded-xl" }: { src?: string; name?: string; size?: number; rounded?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div
        className={`flex-shrink-0 ${rounded} flex items-center justify-center`}
        style={{ width: size, height: size, background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}
      >
        <ImageOff size={size * 0.35} style={{ color: "var(--td-text-lo)" }} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name || ""}
      onError={() => setErr(true)}
      className={`flex-shrink-0 ${rounded} object-cover`}
      style={{ width: size, height: size, border: "1px solid var(--td-panel-border)" }}
    />
  );
}

// ─── SaleRow expandible ───────────────────────────────────────────────────────
function SaleRow({
  sale, productMap, rank, onReturn,
}: {
  sale: SaleDetail;
  productMap: Record<string, ProductInfo>;
  rank: number;
  onReturn: (id: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [returning, setReturning] = useState(false);
  const itemCount = sale.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const paymentName = getPaymentMethodName(sale);

  const previewItems = (sale.items || []).slice(0, 3);

  return (
    <div className="rounded-2xl overflow-hidden transition-all group" style={{ border: "1px solid var(--td-panel-border)" }}>
      {/* ── Fila principal ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="text-[9px] font-black w-5 text-center flex-shrink-0" style={{ color: "var(--td-text-lo)" }}>{rank}</span>

        <ChevronRight
          size={12}
          className={`transition-transform flex-shrink-0 group-hover:opacity-60 ${open ? "rotate-90 !text-red-400" : ""}`}
          style={{ color: "var(--td-text-lo)" }}
        />

        <div className="flex items-center -space-x-2 flex-shrink-0">
          {previewItems.map((item, i) => {
            const info = productMap[String(item.product_id)];
            return (
              <div key={i} className="rounded-lg border-2 overflow-hidden" style={{ width: 32, height: 32, borderColor: "var(--td-page-bg)" }}>
                <ProductThumb src={info?.imagen} name={info?.name || item.product?.name} size={32} rounded="rounded-none" />
              </div>
            );
          })}
          {(sale.items || []).length > 3 && (
            <div className="w-8 h-8 rounded-lg border-2 flex items-center justify-center text-[8px] font-black flex-shrink-0"
              style={{ borderColor: "var(--td-page-bg)", background: "var(--td-panel-bg)", color: "var(--td-text-lo)" }}>
              +{sale.items.length - 3}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 w-[115px]">
          <p className="text-xs font-bold" style={{ color: "var(--td-text-hi)" }}>{fmtDateTime(sale.sold_at || sale.created_at)}</p>
        </div>

        <div className="flex-1 min-w-0 hidden lg:block">
          <div className="flex items-center gap-2">
            <p className="text-[9px] font-black uppercase tracking-widest truncate" style={{ color: "var(--td-text-lo)" }}>#{sale.id}</p>
            {sale.customer?.name && (
              <p className="text-[10px] truncate" style={{ color: "var(--td-text-md)" }}>{sale.customer.name}</p>
            )}
          </div>
          {sale.user?.name && (
            <div
              className="flex items-center gap-1 mt-0.5 text-[9px] font-bold truncate"
              style={{ color: "var(--td-text-lo)" }}
              title={`Vendido por ${sale.user.name}`}
            >
              <UserIcon size={9} />
              <span className="uppercase tracking-wider">Vendió:</span>
              <span className="truncate" style={{ color: "var(--td-text-md)" }}>{sale.user.name}</span>
            </div>
          )}
        </div>

        <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border flex-shrink-0 ${methodBg(paymentName)}`}>
          {paymentName}
        </span>

        <div className="flex-shrink-0 text-center w-10 hidden sm:block">
          <p className="text-xs font-bold" style={{ color: "var(--td-text-md)" }}>{itemCount}</p>
          <p className="text-[7px] uppercase" style={{ color: "var(--td-text-lo)" }}>arts.</p>
        </div>

        {/* Total cobrado = sale.total (productos regulares) + anticipos de
            preventas creadas en el mismo ticket. Sin esto el row mostraba
            solo $100 cuando el cobro real fue $200 (producto + anticipo). */}
        <div className="ml-auto flex-shrink-0 text-right">
          <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>
            {fmt(sale.total + (sale.pre_sale_orders ?? []).reduce((s, o) => s + (o.paid_amount ?? 0), 0))}
          </p>
          {(sale.pre_sale_orders ?? []).length > 0 && (
            <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#f59e0b" }}>
              + anticipo
            </p>
          )}
        </div>
      </button>

      {/* ── Detalle expandido ── */}
      {open && (
        <div className="px-5 py-4 space-y-2" style={{ borderTop: "1px solid var(--td-panel-border)", background: "rgba(0,0,0,0.15)" }}>
          {(sale.items || []).length === 0 && (
            <p className="text-[10px] text-center py-3" style={{ color: "var(--td-text-lo)" }}>Sin detalle de artículos</p>
          )}
          {(sale.items || []).map((item, idx) => {
            const info = productMap[String(item.product_id)];
            const name = item.product?.name || info?.name || String(item.product_id);
            const sku  = item.product?.sku  || info?.sku  || "";
            const img  = info?.imagen;
            return (
              <div
                key={idx}
                className="flex items-center gap-3 py-2 last:border-0"
                style={{ borderBottom: "1px solid var(--td-panel-border)" }}
              >
                <ProductThumb src={img} name={name} size={44} rounded="rounded-xl" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: "var(--td-text-hi)" }}>{name}</p>
                  {sku && <p className="text-[9px] uppercase tracking-widest mt-0.5 truncate" style={{ color: "var(--td-text-lo)" }}>{sku}</p>}
                </div>

                <div className="flex items-center gap-5 flex-shrink-0 text-right">
                  <div className="text-center">
                    <p className="text-xs font-black" style={{ color: "var(--td-text-md)" }}>×{item.quantity}</p>
                    <p className="text-[8px] uppercase" style={{ color: "var(--td-text-lo)" }}>cant.</p>
                  </div>
                  <div className="text-right w-[58px]">
                    <p className="text-xs font-bold" style={{ color: "var(--td-text-md)" }}>{fmt(item.price)}</p>
                    <p className="text-[8px] uppercase" style={{ color: "var(--td-text-lo)" }}>unit.</p>
                  </div>
                  <div className="text-right w-[70px]">
                    <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{fmt(item.price * item.quantity)}</p>
                    <p className="text-[8px] uppercase" style={{ color: "var(--td-text-lo)" }}>subtotal</p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Preventas creadas en el mismo ticket (cobro mixto). El backend
              las trae via Sale.preSaleOrders; si el campo viene, mostramos
              un sub-bloque para que el ticket sea un padre unificado en vez
              de aparecer separado de la venta regular. */}
          {(sale.pre_sale_orders ?? []).length > 0 && (
            <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px dashed var(--td-panel-border)" }}>
              <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#f59e0b" }}>
                Preventas creadas en este ticket
              </p>
              {(sale.pre_sale_orders ?? []).map(order => {
                // Status del cobro: si paid_amount cubre el total → liquidación,
                // si no → anticipo (todavía debe saldo).
                const isLiquidacion = (order.balance ?? 0) <= 0.01 && (order.paid_amount ?? 0) > 0;
                const statusKind: "liquidacion" | "anticipo" = isLiquidacion ? "liquidacion" : "anticipo";
                return (
                  <div key={order.id} className="rounded-xl p-3" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)" }}>
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Bookmark size={12} className="text-amber-400" />
                        <span className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--td-text-hi)" }}>{order.code}</span>
                        {/* Status de COBRO (anticipo vs liquidación) — más útil
                            al cajero que el status del folio (pending/ready). */}
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{
                          background: statusKind === "liquidacion" ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.18)",
                          color: statusKind === "liquidacion" ? "#22c55e" : "#f59e0b",
                          border: `1px solid ${statusKind === "liquidacion" ? "rgba(34,197,94,0.35)" : "rgba(245,158,11,0.4)"}`,
                        }}>
                          {statusKind === "liquidacion" ? "Liquidación" : "Anticipo"}
                        </span>
                        {/* Status del folio (entrega) — secundario */}
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{
                          background: order.status === 'delivered' ? "rgba(34,197,94,0.10)" : "rgba(255,255,255,0.05)",
                          color: order.status === 'delivered' ? "#22c55e" : "var(--td-text-lo)",
                        }}>
                          {order.status === 'delivered' ? "Entregado"
                            : order.status === 'ready' ? "Listo"
                            : order.status === 'pending' ? "Pendiente llegada"
                            : order.status}
                        </span>
                      </div>
                    </div>

                    {/* Items del folio */}
                    {order.items.map(it => (
                      <div key={it.id} className="flex items-center gap-3 py-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate" style={{ color: "var(--td-text-md)" }}>
                            {it.catalog?.product_name ?? `Producto #${it.product_id ?? "?"}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <span className="text-[10px] font-black" style={{ color: "var(--td-text-md)" }}>×{it.quantity}</span>
                          <span className="text-[10px] font-bold w-[60px]" style={{ color: "var(--td-text-md)" }}>{fmt(it.unit_price)}</span>
                          <span className="text-xs font-black w-[70px]" style={{ color: "var(--td-text-hi)" }}>{fmt(it.unit_price * it.quantity)}</span>
                        </div>
                      </div>
                    ))}

                    {/* Desglose anticipo / saldo / total */}
                    <div className="mt-2 pt-2 space-y-1" style={{ borderTop: "1px dashed rgba(245,158,11,0.25)" }}>
                      <div className="flex justify-between text-[10px]">
                        <span style={{ color: "var(--td-text-lo)" }}>Total del folio</span>
                        <span className="font-bold" style={{ color: "var(--td-text-md)" }}>{fmt(order.total)}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span style={{ color: "var(--td-text-lo)" }}>
                          {statusKind === "liquidacion" ? "Liquidación pagada" : "Anticipo pagado en este ticket"}
                        </span>
                        <span className="font-black" style={{ color: "#10b981" }}>{fmt(order.paid_amount)}</span>
                      </div>
                      {(order.balance ?? 0) > 0.01 && (
                        <div className="flex justify-between text-[10px]">
                          <span style={{ color: "var(--td-text-lo)" }}>Saldo pendiente</span>
                          <span className="font-black" style={{ color: "#f59e0b" }}>{fmt(order.balance)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Resumen total cobrado del ticket (productos + anticipos preventas).
              Visible solo cuando hay preventas vinculadas — si no, el TOTAL del
              footer es suficiente. */}
          {(sale.pre_sale_orders ?? []).length > 0 && (() => {
            const anticipos = (sale.pre_sale_orders ?? []).reduce((s, o) => s + (o.paid_amount ?? 0), 0);
            const totalCobrado = sale.total + anticipos;
            return (
              <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <div className="flex justify-between text-[10px]" style={{ color: "var(--td-text-md)" }}>
                  <span>Productos</span>
                  <span className="font-bold">{fmt(sale.total)}</span>
                </div>
                <div className="flex justify-between text-[10px]" style={{ color: "var(--td-text-md)" }}>
                  <span>Anticipo preventa</span>
                  <span className="font-bold">{fmt(anticipos)}</span>
                </div>
                <div className="flex justify-between text-sm font-black mt-1 pt-1" style={{ borderTop: "1px solid rgba(16,185,129,0.25)", color: "var(--td-text-hi)" }}>
                  <span>Total cobrado</span>
                  <span style={{ color: "#10b981" }}>{fmt(totalCobrado)}</span>
                </div>
              </div>
            );
          })()}

          <div className="flex justify-between items-center pt-2" style={{ borderTop: "1px solid var(--td-panel-border)" }}>
            <div className="flex items-center gap-3">
              {/* Reimprimir ticket */}
              <button
                onClick={() => printTicket(sale)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all hover:scale-105"
                style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", color: "var(--td-text-md)" }}
              >
                <Printer size={10} />
                Ticket
              </button>

              {/* Devolver */}
              {sale.status === "completed" && (
                confirmReturn ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                      <AlertTriangle size={11} /> ¿Confirmar?
                    </span>
                    <button
                      onClick={async () => {
                        setReturning(true);
                        try { await onReturn(sale.id); }
                        finally { setReturning(false); setConfirmReturn(false); }
                      }}
                      disabled={returning}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                    >
                      {returning ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                      Devolver
                    </button>
                    <button
                      onClick={() => setConfirmReturn(false)}
                      className="text-[8px] font-bold uppercase tracking-widest px-2 py-1 hover:opacity-70"
                      style={{ color: "var(--td-text-lo)" }}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmReturn(true)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all hover:border-amber-500/30"
                    style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", color: "var(--td-text-lo)" }}
                  >
                    <RotateCcw size={10} />
                    Devolver
                  </button>
                )
              )}
              {sale.status === "returned" && (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 text-amber-500">
                  <RotateCcw size={10} /> Devuelta
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Total cobrado:</span>
              <span className="text-base font-black" style={{ color: "var(--td-text-hi)" }}>
                {fmt(sale.total + (sale.pre_sale_orders ?? []).reduce((s, o) => s + (o.paid_amount ?? 0), 0))}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reporte del Día (Lectura X) ──────────────────────────────────────────────
// Resumen ejecutivo + desglose por método + preventas + caja para gerente/admin.
// Reutiliza data ya cargada por SalesPage; no hace queries propias.

interface DailyReport {
  subtotal: number; descuento: number; ventasNetas: number;
  comisionTotal: number; netoDespuesComision: number;
  ticketsCount: number; promedio: number;
  methodsRows: Array<{ name: string; count: number; amount: number; commission: number }>;
  tipoCambio: number | null;
  anticiposCobrados: number; anticiposCount: number;
  liquidaciones: number; liquidadasCount: number;
  totalPreventas: number;
  apertura: number; entradas: number; salidas: number;
  esperado: number; declarado: number; descuadre: number;
  sesionesAbiertas: number; sesionesCerradas: number; sessionsCount: number;
  topProductsRows: Array<{ product_id: string; name: string; sku: string; units: number; revenue: number; tickets: number }>;
  cashierRows: Array<{ user_id: number; name: string; tickets: number; revenue: number; commission: number; descuadre: number; hasOpenSession: boolean }>;
  // G) Ganancia bruta — solo confiable cuando isAdmin (backend gate)
  costoTotal: number; gananciaBruta: number; margenPct: number;
  tieneDatosCosto: boolean; tieneItemsSinCosto: boolean;
  // H) Cancelaciones (ADR-016 Fase 1)
  cancelacionesCount: number;
  ventasCanceladasCount: number;
  preventasCanceladasCount: number;
  montoVentasCanceladas: number;
  montoPreventasCanceladas: number;
  montoCanceladoTotal: number;
  ventasNetasReales: number;
}

function ReporteDelDia({
  report, fromDate, toDate, storeName, storeId, isAdmin,
}: {
  report: DailyReport;
  fromDate: string;
  toDate: string;
  storeName: string;
  /** Para fetch de log de cancelaciones del periodo + tienda. */
  storeId?: number | null;
  /** Solo admin ve sección de ganancia bruta (backend gate de cost). */
  isAdmin: boolean;
}) {
  const isSameDay = fromDate === toDate;
  const periodLabel = isSameDay
    ? new Date(fromDate + "T12:00").toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    : `${fromDate} → ${toDate}`;

  // ADR-016 Fase 4: log de cancelaciones del periodo para breakdown por motivo + cajero.
  const cancellationsQuery = useSaleCancellationsQuery({
    from: fromDate,
    to:   toDate,
    ...(storeId ? { store_id: storeId } : {}),
    per_page: 200,
  });
  const cancellations = cancellationsQuery.data?.data ?? [];

  // Agregados desde el log (más precisos que los de DailyReport — capturan
  // partial cancellations que el filtro `status='returned'` no detecta).
  const logMontoTotal = cancellations.reduce((s, c) => s + c.amount_refunded, 0);
  const logCount      = cancellations.length;
  // Brutas = lo que se cobró ANTES de cualquier cancelación.
  // ventasNetas (de DailyReport) ya refleja edit-in-place, así que: brutas = netas + cancelado.
  const ventasBrutas      = report.ventasNetas + logMontoTotal;
  const ventasNetasReales = report.ventasNetas;

  // Group by motivo
  const reasonLabels: Record<string, string> = {
    cliente_devuelve: 'Cliente devuelve',
    error_cajero:     'Error cajero',
    'dañado':         'Producto dañado',
    no_llego:         'No llegó',
    otro:             'Otro',
  };
  const byReason = new Map<string, { count: number; amount: number }>();
  cancellations.forEach(c => {
    const b = byReason.get(c.reason_code) ?? { count: 0, amount: 0 };
    b.count  += 1;
    b.amount += c.amount_refunded;
    byReason.set(c.reason_code, b);
  });
  const reasonRows = Array.from(byReason.entries())
    .map(([code, b]) => ({ code, label: reasonLabels[code] ?? code, ...b }))
    .sort((a, b) => b.amount - a.amount);

  // Group by cajero
  const byCashier = new Map<number, { name: string; count: number; amount: number }>();
  cancellations.forEach(c => {
    const id = c.cancelled_by?.id ?? 0;
    const name = c.cancelled_by?.name ?? 'Sistema';
    const b = byCashier.get(id) ?? { name, count: 0, amount: 0 };
    b.count  += 1;
    b.amount += c.amount_refunded;
    byCashier.set(id, b);
  });
  const cashierRows = Array.from(byCashier.entries())
    .map(([id, b]) => ({ user_id: id, ...b }))
    .sort((a, b) => b.amount - a.amount);

  const handlePrint = () => printDailyReport(report, fromDate, toDate, storeName, isAdmin);
  const handlePdf   = () => exportDailyReportPdf(report, fromDate, toDate, storeName, isAdmin);

  return (
    <div id="reporte-dia-print" className="space-y-4">
      {/* Header con acciones */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Reporte del Día · {storeName}</p>
          <p className="text-base font-black mt-1 capitalize" style={{ color: "var(--td-text-hi)" }}>{periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02]"
            style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", color: "var(--td-text-md)" }}
          >
            <Printer size={12} /> Imprimir
          </button>
          <button
            onClick={handlePdf}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02]"
            style={{ background: "linear-gradient(135deg, #CC2200, #FF4422)", border: "1px solid rgba(255,120,90,0.3)", color: "#fff" }}
          >
            <Download size={12} /> Exportar PDF
          </button>
        </div>
      </div>

      {/* A) Resumen ejecutivo */}
      <ReportSection title="A · Resumen Ejecutivo">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Ventas brutas (productos)" value={fmt(report.subtotal)} />
          <Kpi label="Descuentos"                value={`- ${fmt(report.descuento)}`} muted />
          <Kpi label="Ventas netas (productos)"  value={fmt(report.ventasNetas)} />
          <Kpi label="+ Anticipos/Liquidaciones preventa" value={fmt(report.totalPreventas)} hint={`${report.anticiposCount + report.liquidadasCount} folios`} />
          <Kpi label="Total cobrado"             value={fmt(report.ventasNetas + report.totalPreventas)} highlight />
          <Kpi label="Comisión terminal"         value={`- ${fmt(report.comisionTotal)}`} muted />
          <Kpi label="Neto después comisión"     value={fmt(report.netoDespuesComision + report.totalPreventas)} highlight hint="incluye preventas" />
          <Kpi label="Tickets"                   value={String(report.ticketsCount)} />
          <Kpi label="Ticket promedio"           value={fmt(report.promedio)} />
          {report.tipoCambio != null && (
            <Kpi label="Tipo de cambio" value={`$${report.tipoCambio.toFixed(2)} MXN/USD`} />
          )}
        </div>
      </ReportSection>

      {/* G) Ganancia bruta — SOLO ADMIN. Gerente NO ve esta sección. */}
      {isAdmin && (
        <ReportSection title="Ganancia Bruta · Solo Admin">
          {!report.tieneDatosCosto ? (
            <p className="text-xs py-4 text-center" style={{ color: "var(--td-text-lo)" }}>
              Sin datos de costo para los productos vendidos. Asigna `cost` en el catálogo de productos para calcular ganancia.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Ingreso bruto"    value={fmt(report.ventasNetas)} />
                <Kpi label="Costo de venta"   value={`- ${fmt(report.costoTotal)}`} muted />
                <Kpi
                  label="Ganancia bruta"
                  value={fmt(report.gananciaBruta)}
                  highlight={report.gananciaBruta > 0}
                  danger={report.gananciaBruta < 0}
                />
                <Kpi
                  label="Margen"
                  value={`${report.margenPct.toFixed(1)}%`}
                  hint={report.gananciaBruta < 0 ? "Pérdida en el periodo" : undefined}
                  highlight={report.margenPct >= 30}
                  danger={report.margenPct < 0}
                />
              </div>
              {report.tieneItemsSinCosto && (
                <p className="text-[10px] mt-3 px-3 py-2 rounded-lg" style={{
                  color: "#fbbf24",
                  background: "rgba(251,191,36,0.06)",
                  border: "1px solid rgba(251,191,36,0.2)",
                }}>
                  Algunos productos vendidos no tienen costo configurado — la ganancia real podría ser menor.
                </p>
              )}
              <p className="text-[9px] mt-2" style={{ color: "var(--td-text-lo)" }}>
                Calculado con el costo ACTUAL del producto, no histórico al momento de la venta.
              </p>
            </>
          )}
        </ReportSection>
      )}

      {/* B) Desglose por método de pago */}
      <ReportSection title="B · Desglose por Método de Pago">
        {report.methodsRows.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--td-text-lo)" }}>Sin pagos registrados en el periodo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                  <th className="text-left py-2 px-3">Método</th>
                  <th className="text-right py-2 px-3"># Tx</th>
                  <th className="text-right py-2 px-3">Monto</th>
                  <th className="text-right py-2 px-3">Comisión</th>
                  <th className="text-right py-2 px-3">Neto</th>
                </tr>
              </thead>
              <tbody>
                {report.methodsRows.map(r => (
                  <tr key={r.name} className="border-t" style={{ borderColor: "var(--td-panel-border)" }}>
                    <td className="py-2 px-3 font-bold" style={{ color: "var(--td-text-hi)" }}>{r.name}</td>
                    <td className="py-2 px-3 text-right" style={{ color: "var(--td-text-md)" }}>{r.count}</td>
                    <td className="py-2 px-3 text-right font-black" style={{ color: "var(--td-text-hi)" }}>{fmt(r.amount)}</td>
                    <td className="py-2 px-3 text-right" style={{ color: r.commission > 0 ? "#fbbf24" : "var(--td-text-lo)" }}>
                      {r.commission > 0 ? fmt(r.commission) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-bold" style={{ color: "var(--td-text-md)" }}>{fmt(r.amount - r.commission)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2" style={{ borderColor: "var(--td-panel-border)" }}>
                  <td className="py-2 px-3 text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Totales</td>
                  <td className="py-2 px-3 text-right font-black" style={{ color: "var(--td-text-md)" }}>
                    {report.methodsRows.reduce((a, r) => a + r.count, 0)}
                  </td>
                  <td className="py-2 px-3 text-right font-black" style={{ color: "var(--td-text-hi)" }}>
                    {fmt(report.methodsRows.reduce((a, r) => a + r.amount, 0))}
                  </td>
                  <td className="py-2 px-3 text-right font-black" style={{ color: "#fbbf24" }}>
                    {fmt(report.methodsRows.reduce((a, r) => a + r.commission, 0))}
                  </td>
                  <td className="py-2 px-3 text-right font-black" style={{ color: "var(--td-text-hi)" }}>
                    {fmt(report.methodsRows.reduce((a, r) => a + (r.amount - r.commission), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </ReportSection>

      {/* C) Preventas */}
      <ReportSection title="C · Preventas">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Kpi
            label={`Anticipos cobrados · ${report.anticiposCount} folios`}
            value={fmt(report.anticiposCobrados)}
            hint="Apartadas nuevas o aún pendientes"
          />
          <Kpi
            label={`Liquidaciones · ${report.liquidadasCount} folios`}
            value={fmt(report.liquidaciones)}
            hint="Preventas entregadas en el periodo"
          />
          <Kpi
            label="Total recibido por preventas"
            value={fmt(report.totalPreventas)}
            highlight
          />
        </div>
      </ReportSection>

      {/* D) Movimientos de caja */}
      <ReportSection title={`D · Movimientos de Caja · ${report.sessionsCount} sesión${report.sessionsCount === 1 ? "" : "es"}`}>
        {report.sessionsCount === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--td-text-lo)" }}>Sin sesiones de caja en el periodo.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Kpi label="Apertura inicial" value={fmt(report.apertura)} />
            <Kpi label="Entradas (depósitos)" value={`+ ${fmt(report.entradas)}`} />
            <Kpi label="Salidas (gastos)" value={`- ${fmt(report.salidas)}`} muted />
            <Kpi label="Esperado al cierre" value={fmt(report.esperado)} highlight />
            <Kpi label="Declarado real" value={fmt(report.declarado)} />
            <Kpi
              label="Descuadre"
              value={`${report.descuadre >= 0 ? "+" : ""}${fmt(report.descuadre)}`}
              danger={Math.abs(report.descuadre) > 0.01}
              hint={
                report.sesionesAbiertas > 0
                  ? `${report.sesionesAbiertas} sesión aún abierta`
                  : `${report.sesionesCerradas} cerradas`
              }
            />
          </div>
        )}
      </ReportSection>

      {/* E) Top productos */}
      <ReportSection title={`E · Top ${report.topProductsRows.length} Productos del Periodo`}>
        {report.topProductsRows.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--td-text-lo)" }}>Sin productos vendidos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                  <th className="text-left py-2 px-3 w-8">#</th>
                  <th className="text-left py-2 px-3">Producto</th>
                  <th className="text-right py-2 px-3">Tickets</th>
                  <th className="text-right py-2 px-3">Unidades</th>
                  <th className="text-right py-2 px-3">Ingreso</th>
                </tr>
              </thead>
              <tbody>
                {report.topProductsRows.map((p, idx) => (
                  <tr key={p.product_id} className="border-t" style={{ borderColor: "var(--td-panel-border)" }}>
                    <td className="py-2 px-3 font-black" style={{ color: "var(--td-text-lo)" }}>{idx + 1}</td>
                    <td className="py-2 px-3">
                      <div className="font-bold truncate max-w-[280px]" style={{ color: "var(--td-text-hi)" }}>{p.name}</div>
                      {p.sku && <div className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: "var(--td-text-lo)" }}>{p.sku}</div>}
                    </td>
                    <td className="py-2 px-3 text-right" style={{ color: "var(--td-text-md)" }}>{p.tickets}</td>
                    <td className="py-2 px-3 text-right font-bold" style={{ color: "var(--td-text-md)" }}>{p.units}</td>
                    <td className="py-2 px-3 text-right font-black" style={{ color: "var(--td-text-hi)" }}>{fmt(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportSection>

      {/* F) Tabla por cajero */}
      <ReportSection title={`F · Cajeros del Periodo · ${report.cashierRows.length}`}>
        {report.cashierRows.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--td-text-lo)" }}>Sin ventas en el periodo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                  <th className="text-left py-2 px-3">Cajero</th>
                  <th className="text-right py-2 px-3">Tickets</th>
                  <th className="text-right py-2 px-3">Cobrado</th>
                  <th className="text-right py-2 px-3">Comisión</th>
                  <th className="text-right py-2 px-3">Neto</th>
                  <th className="text-right py-2 px-3">Descuadre</th>
                </tr>
              </thead>
              <tbody>
                {report.cashierRows.map(c => (
                  <tr key={c.user_id} className="border-t" style={{ borderColor: "var(--td-panel-border)" }}>
                    <td className="py-2 px-3">
                      <div className="font-bold" style={{ color: "var(--td-text-hi)" }}>{c.name}</div>
                      {c.hasOpenSession && (
                        <div className="text-[9px] font-black uppercase tracking-widest mt-0.5" style={{ color: "#FFAA00" }}>Caja abierta</div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right" style={{ color: "var(--td-text-md)" }}>{c.tickets}</td>
                    <td className="py-2 px-3 text-right font-black" style={{ color: "var(--td-text-hi)" }}>{fmt(c.revenue)}</td>
                    <td className="py-2 px-3 text-right" style={{ color: c.commission > 0 ? "#fbbf24" : "var(--td-text-lo)" }}>
                      {c.commission > 0 ? fmt(c.commission) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right font-bold" style={{ color: "var(--td-text-md)" }}>{fmt(c.revenue - c.commission)}</td>
                    <td className="py-2 px-3 text-right font-bold" style={{
                      color: Math.abs(c.descuadre) < 0.01 ? "var(--td-text-lo)" : (c.descuadre < 0 ? "#DC2626" : "#10b981"),
                    }}>
                      {c.descuadre === 0 ? "—" : `${c.descuadre >= 0 ? "+" : ""}${fmt(c.descuadre)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2" style={{ borderColor: "var(--td-panel-border)" }}>
                  <td className="py-2 px-3 text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Totales</td>
                  <td className="py-2 px-3 text-right font-black" style={{ color: "var(--td-text-md)" }}>
                    {report.cashierRows.reduce((a, c) => a + c.tickets, 0)}
                  </td>
                  <td className="py-2 px-3 text-right font-black" style={{ color: "var(--td-text-hi)" }}>
                    {fmt(report.cashierRows.reduce((a, c) => a + c.revenue, 0))}
                  </td>
                  <td className="py-2 px-3 text-right font-black" style={{ color: "#fbbf24" }}>
                    {fmt(report.cashierRows.reduce((a, c) => a + c.commission, 0))}
                  </td>
                  <td className="py-2 px-3 text-right font-black" style={{ color: "var(--td-text-hi)" }}>
                    {fmt(report.cashierRows.reduce((a, c) => a + (c.revenue - c.commission), 0))}
                  </td>
                  <td className="py-2 px-3 text-right font-black" style={{ color: "var(--td-text-lo)" }}>
                    {fmt(report.cashierRows.reduce((a, c) => a + c.descuadre, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </ReportSection>

      {/* H) Cancelaciones — ADR-016 Fase 4 (detallado).
          Lee del log `sale_cancellations` con motivo + cajero + snapshot.
          Sustituye al cálculo simple Fase 1 (DailyReport.montoVentasCanceladas)
          porque edit-in-place ya descontó del sale.total, así que el monto real
          reversado vive en el log. */}
      <ReportSection title={`H · Cancelaciones · ${logCount}`}>
        {logCount === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--td-text-lo)" }}>Sin cancelaciones en el periodo.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Kpi label="Eventos de cancelación" value={String(logCount)} hint={logCount === 1 ? "1 evento" : `${logCount} eventos`} danger />
              <Kpi label="Monto reversado" value={fmt(logMontoTotal)} hint="salidas en cash_movements" danger />
              <Kpi label="Ventas brutas" value={fmt(ventasBrutas)} hint="antes de cancelaciones" />
              <Kpi label="Ventas netas reales" value={fmt(ventasNetasReales)} hint={`Brutas ${fmt(ventasBrutas)} − ${fmt(logMontoTotal)}`} highlight />
            </div>

            {/* Por motivo */}
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--td-text-lo)" }}>Por motivo</p>
              <div className="overflow-x-auto rounded-xl" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                      <th className="text-left py-2 px-3">Motivo</th>
                      <th className="text-right py-2 px-3">Eventos</th>
                      <th className="text-right py-2 px-3">Monto</th>
                      <th className="text-right py-2 px-3">% del total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reasonRows.map(r => (
                      <tr key={r.code} className="border-t" style={{ borderColor: "var(--td-divider)" }}>
                        <td className="py-2 px-3 font-bold" style={{ color: "var(--td-text-hi)" }}>{r.label}</td>
                        <td className="py-2 px-3 text-right" style={{ color: "var(--td-text-md)" }}>{r.count}</td>
                        <td className="py-2 px-3 text-right font-black" style={{ color: "#f87171" }}>{fmt(r.amount)}</td>
                        <td className="py-2 px-3 text-right" style={{ color: "var(--td-text-lo)" }}>{logMontoTotal > 0 ? `${((r.amount / logMontoTotal) * 100).toFixed(0)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Por cajero */}
            <div className="mb-2">
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--td-text-lo)" }}>Por cajero</p>
              <div className="overflow-x-auto rounded-xl" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                      <th className="text-left py-2 px-3">Cajero</th>
                      <th className="text-right py-2 px-3">Cancelaciones</th>
                      <th className="text-right py-2 px-3">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashierRows.map(r => (
                      <tr key={r.user_id} className="border-t" style={{ borderColor: "var(--td-divider)" }}>
                        <td className="py-2 px-3 font-bold" style={{ color: "var(--td-text-hi)" }}>{r.name}</td>
                        <td className="py-2 px-3 text-right" style={{ color: "var(--td-text-md)" }}>{r.count}</td>
                        <td className="py-2 px-3 text-right font-black" style={{ color: "#f87171" }}>{fmt(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-[10px] mt-2" style={{ color: "var(--td-text-lo)" }}>
              Detalle completo en Admin → tab Cancelaciones (filtros por motivo, cajero, rango).
            </p>
          </>
        )}
      </ReportSection>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.15)", border: "1px solid var(--td-panel-border)" }}>
      <p className="text-[9px] font-black uppercase tracking-widest mb-3" style={{ color: "var(--td-text-lo)" }}>{title}</p>
      {children}
    </div>
  );
}

function Kpi({
  label, value, hint, highlight = false, muted = false, danger = false,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
  muted?: boolean;
  danger?: boolean;
}) {
  const color = danger ? "#DC2626" : highlight ? "#FF4422" : muted ? "var(--td-text-md)" : "var(--td-text-hi)";
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--td-panel-border)" }}>
      <p className="text-[8px] font-black uppercase tracking-widest truncate" style={{ color: "var(--td-text-lo)" }}>{label}</p>
      <p className="text-lg font-black mt-1" style={{ color }}>{value}</p>
      {hint && <p className="text-[9px] font-bold mt-0.5" style={{ color: "var(--td-text-lo)" }}>{hint}</p>}
    </div>
  );
}

// ─── Print / PDF helpers ──────────────────────────────────────────────────────

function printDailyReport(r: DailyReport, fromDate: string, toDate: string, storeName: string, isAdmin: boolean): void {
  const isSameDay = fromDate === toDate;
  const periodLabel = isSameDay
    ? new Date(fromDate + "T12:00").toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    : `${fromDate} → ${toDate}`;

  const html = `
    <html><head><title>Reporte ${fromDate}</title><style>
      body { font-family: system-ui, sans-serif; padding: 24px; color: #111; max-width: 820px; margin: 0 auto; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      h2 { font-size: 12px; margin: 18px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #ccc; text-transform: uppercase; letter-spacing: 0.06em; }
      .meta { color: #666; font-size: 11px; text-transform: capitalize; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
      th, td { padding: 5px 8px; text-align: left; border-bottom: 1px solid #eee; }
      th { background: #f3f3f3; font-weight: 700; text-transform: uppercase; font-size: 9px; letter-spacing: 0.06em; }
      .right { text-align: right; }
      .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
      .kpi { padding: 6px 10px; background: #fafafa; border: 1px solid #eee; border-radius: 4px; }
      .kpi-label { font-size: 9px; text-transform: uppercase; color: #777; }
      .kpi-value { font-size: 14px; font-weight: 800; margin-top: 2px; }
      .danger { color: #c00; }
    </style></head><body>
      <h1>Reporte del Día — ${storeName}</h1>
      <p class="meta">${periodLabel}</p>

      <h2>A · Resumen Ejecutivo</h2>
      <div class="grid">
        <div class="kpi"><div class="kpi-label">Ventas brutas (productos)</div><div class="kpi-value">${fmt(r.subtotal)}</div></div>
        <div class="kpi"><div class="kpi-label">Descuentos</div><div class="kpi-value">- ${fmt(r.descuento)}</div></div>
        <div class="kpi"><div class="kpi-label">Ventas netas (productos)</div><div class="kpi-value">${fmt(r.ventasNetas)}</div></div>
        <div class="kpi"><div class="kpi-label">+ Anticipos/Liquid. preventa</div><div class="kpi-value">${fmt(r.totalPreventas)}</div></div>
        <div class="kpi"><div class="kpi-label">Total cobrado</div><div class="kpi-value">${fmt(r.ventasNetas + r.totalPreventas)}</div></div>
        <div class="kpi"><div class="kpi-label">Comisión terminal</div><div class="kpi-value">- ${fmt(r.comisionTotal)}</div></div>
        <div class="kpi"><div class="kpi-label">Neto después comisión</div><div class="kpi-value">${fmt(r.netoDespuesComision + r.totalPreventas)}</div></div>
        <div class="kpi"><div class="kpi-label">Tickets · Promedio</div><div class="kpi-value">${r.ticketsCount} · ${fmt(r.promedio)}</div></div>
        ${r.tipoCambio != null ? `<div class="kpi"><div class="kpi-label">Tipo de cambio</div><div class="kpi-value">$${r.tipoCambio.toFixed(2)} MXN/USD</div></div>` : ""}
      </div>

      ${isAdmin && r.tieneDatosCosto ? `
      <h2>Ganancia Bruta · Solo Admin</h2>
      <div class="grid">
        <div class="kpi"><div class="kpi-label">Ingreso bruto</div><div class="kpi-value">${fmt(r.ventasNetas)}</div></div>
        <div class="kpi"><div class="kpi-label">Costo de venta</div><div class="kpi-value">- ${fmt(r.costoTotal)}</div></div>
        <div class="kpi"><div class="kpi-label">Ganancia bruta</div><div class="kpi-value ${r.gananciaBruta < 0 ? "danger" : ""}">${fmt(r.gananciaBruta)}</div></div>
        <div class="kpi"><div class="kpi-label">Margen</div><div class="kpi-value ${r.margenPct < 0 ? "danger" : ""}">${r.margenPct.toFixed(1)}%</div></div>
      </div>
      ${r.tieneItemsSinCosto ? '<p style="color:#a37000;font-size:10px;margin-top:6px">Algunos productos sin costo configurado — ganancia podría ser menor.</p>' : ""}
      ` : ""}

      <h2>B · Desglose por Método de Pago</h2>
      <table>
        <thead><tr><th>Método</th><th class="right"># Tx</th><th class="right">Monto</th><th class="right">Comisión</th><th class="right">Neto</th></tr></thead>
        <tbody>
          ${r.methodsRows.map(m => `
            <tr><td>${m.name}</td><td class="right">${m.count}</td><td class="right">${fmt(m.amount)}</td><td class="right">${m.commission > 0 ? fmt(m.commission) : "—"}</td><td class="right">${fmt(m.amount - m.commission)}</td></tr>
          `).join("")}
        </tbody>
      </table>

      <h2>C · Preventas</h2>
      <div class="grid">
        <div class="kpi"><div class="kpi-label">Anticipos cobrados · ${r.anticiposCount} folios</div><div class="kpi-value">${fmt(r.anticiposCobrados)}</div></div>
        <div class="kpi"><div class="kpi-label">Liquidaciones · ${r.liquidadasCount} folios</div><div class="kpi-value">${fmt(r.liquidaciones)}</div></div>
        <div class="kpi"><div class="kpi-label">Total recibido</div><div class="kpi-value">${fmt(r.totalPreventas)}</div></div>
      </div>

      <h2>D · Movimientos de Caja · ${r.sessionsCount} sesión${r.sessionsCount === 1 ? "" : "es"}</h2>
      <div class="grid">
        <div class="kpi"><div class="kpi-label">Apertura inicial</div><div class="kpi-value">${fmt(r.apertura)}</div></div>
        <div class="kpi"><div class="kpi-label">Entradas</div><div class="kpi-value">+ ${fmt(r.entradas)}</div></div>
        <div class="kpi"><div class="kpi-label">Salidas</div><div class="kpi-value">- ${fmt(r.salidas)}</div></div>
        <div class="kpi"><div class="kpi-label">Esperado</div><div class="kpi-value">${fmt(r.esperado)}</div></div>
        <div class="kpi"><div class="kpi-label">Declarado</div><div class="kpi-value">${fmt(r.declarado)}</div></div>
        <div class="kpi"><div class="kpi-label">Descuadre</div><div class="kpi-value ${Math.abs(r.descuadre) > 0.01 ? "danger" : ""}">${r.descuadre >= 0 ? "+" : ""}${fmt(r.descuadre)}</div></div>
      </div>

      <h2>E · Top ${r.topProductsRows.length} Productos</h2>
      <table>
        <thead><tr><th>#</th><th>Producto</th><th>SKU</th><th class="right">Tickets</th><th class="right">Uds</th><th class="right">Ingreso</th></tr></thead>
        <tbody>
          ${r.topProductsRows.map((p, idx) => `
            <tr><td>${idx + 1}</td><td>${p.name}</td><td>${p.sku || "—"}</td><td class="right">${p.tickets}</td><td class="right">${p.units}</td><td class="right">${fmt(p.revenue)}</td></tr>
          `).join("")}
        </tbody>
      </table>

      <h2>F · Cajeros del Periodo</h2>
      <table>
        <thead><tr><th>Cajero</th><th class="right">Tickets</th><th class="right">Cobrado</th><th class="right">Comisión</th><th class="right">Neto</th><th class="right">Descuadre</th></tr></thead>
        <tbody>
          ${r.cashierRows.map(c => `
            <tr>
              <td>${c.name}${c.hasOpenSession ? ' <span style="color:#f59e0b">·abierta</span>' : ''}</td>
              <td class="right">${c.tickets}</td>
              <td class="right">${fmt(c.revenue)}</td>
              <td class="right">${c.commission > 0 ? fmt(c.commission) : "—"}</td>
              <td class="right">${fmt(c.revenue - c.commission)}</td>
              <td class="right">${c.descuadre === 0 ? "—" : `${c.descuadre >= 0 ? "+" : ""}${fmt(c.descuadre)}`}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </body></html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    w.print();
  }
}

function exportDailyReportPdf(r: DailyReport, fromDate: string, toDate: string, storeName: string, isAdmin: boolean): void {
  const isSameDay = fromDate === toDate;
  const periodLabel = isSameDay
    ? new Date(fromDate + "T12:00").toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    : `${fromDate} → ${toDate}`;

  const doc = new jsPDF({ unit: "mm", format: "letter" });
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`Reporte del Día — ${storeName}`, 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(periodLabel, 14, y);
  y += 8;
  doc.setTextColor(20);

  autoTable(doc, {
    startY: y,
    head: [["A · Resumen Ejecutivo", ""]],
    body: [
      ["Ventas brutas (productos)", fmt(r.subtotal)],
      ["Descuentos",                `- ${fmt(r.descuento)}`],
      ["Ventas netas (productos)",  fmt(r.ventasNetas)],
      ["+ Anticipos/Liquid. preventa", fmt(r.totalPreventas)],
      ["Total cobrado",             fmt(r.ventasNetas + r.totalPreventas)],
      ["Comisión terminal",         `- ${fmt(r.comisionTotal)}`],
      ["Neto después comisión",     fmt(r.netoDespuesComision + r.totalPreventas)],
      ["Tickets · Promedio",        `${r.ticketsCount} · ${fmt(r.promedio)}`],
      ...(r.tipoCambio != null ? [["Tipo de cambio", `$${r.tipoCambio.toFixed(2)} MXN/USD`]] : []),
    ],
    theme: "striped",
    headStyles: { fillColor: [204, 34, 0] },
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
  });

  if (isAdmin && r.tieneDatosCosto) {
    autoTable(doc, {
      head: [["Ganancia Bruta · Solo Admin", ""]],
      body: [
        ["Ingreso bruto",   fmt(r.ventasNetas)],
        ["Costo de venta", `- ${fmt(r.costoTotal)}`],
        ["Ganancia bruta",  fmt(r.gananciaBruta)],
        ["Margen",         `${r.margenPct.toFixed(1)}%`],
      ],
      theme: "striped",
      headStyles: { fillColor: [204, 34, 0] },
      styles: { fontSize: 10 },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    });
  }

  autoTable(doc, {
    head: [["B · Método", "# Tx", "Monto", "Comisión", "Neto"]],
    body: r.methodsRows.map(m => [
      m.name,
      String(m.count),
      fmt(m.amount),
      m.commission > 0 ? fmt(m.commission) : "—",
      fmt(m.amount - m.commission),
    ]),
    theme: "striped",
    headStyles: { fillColor: [204, 34, 0] },
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } },
  });

  autoTable(doc, {
    head: [["C · Preventas", ""]],
    body: [
      [`Anticipos cobrados (${r.anticiposCount} folios)`, fmt(r.anticiposCobrados)],
      [`Liquidaciones (${r.liquidadasCount} folios)`,     fmt(r.liquidaciones)],
      ["Total recibido",                                   fmt(r.totalPreventas)],
    ],
    theme: "striped",
    headStyles: { fillColor: [204, 34, 0] },
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
  });

  autoTable(doc, {
    head: [[`D · Movimientos de Caja (${r.sessionsCount} sesión${r.sessionsCount === 1 ? "" : "es"})`, ""]],
    body: [
      ["Apertura inicial",   fmt(r.apertura)],
      ["Entradas",          `+ ${fmt(r.entradas)}`],
      ["Salidas",           `- ${fmt(r.salidas)}`],
      ["Esperado al cierre", fmt(r.esperado)],
      ["Declarado real",     fmt(r.declarado)],
      ["Descuadre",          `${r.descuadre >= 0 ? "+" : ""}${fmt(r.descuadre)}`],
    ],
    theme: "striped",
    headStyles: { fillColor: [204, 34, 0] },
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
  });

  autoTable(doc, {
    head: [["E · Top Productos", "Tickets", "Uds", "Ingreso"]],
    body: r.topProductsRows.map((p, idx) => [
      `${idx + 1}. ${p.name}${p.sku ? ` · ${p.sku}` : ""}`,
      String(p.tickets),
      String(p.units),
      fmt(p.revenue),
    ]),
    theme: "striped",
    headStyles: { fillColor: [204, 34, 0] },
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } },
  });

  autoTable(doc, {
    head: [["F · Cajero", "Tickets", "Cobrado", "Comisión", "Neto", "Descuadre"]],
    body: r.cashierRows.map(c => [
      `${c.name}${c.hasOpenSession ? " (caja abierta)" : ""}`,
      String(c.tickets),
      fmt(c.revenue),
      c.commission > 0 ? fmt(c.commission) : "—",
      fmt(c.revenue - c.commission),
      c.descuadre === 0 ? "—" : `${c.descuadre >= 0 ? "+" : ""}${fmt(c.descuadre)}`,
    ]),
    theme: "striped",
    headStyles: { fillColor: [204, 34, 0] },
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" }, 5: { halign: "right" } },
  });

  doc.save(`reporte-${fromDate}${isSameDay ? "" : "_" + toDate}.pdf`);
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function SalesPage() {
  const { user } = useAuth();

  const isAdmin   = user?.roles?.some(r => ["admin","super_admin","owner","dueño"].includes(r.toLowerCase())) ?? false;
  const isGerente = user?.roles?.some(r => r.toLowerCase() === "gerente") ?? false;
  const isCashier = user?.roles?.some(r => r.toLowerCase() === "cajero") ?? false;
  const canPickStore = isAdmin;
  // Cajero no ve cards de finanzas (ingresos, por cobrar, totales). Gerente y
  // admin sí — gerente para su tienda, admin para todas o la que elija.
  // KPI row (Ingresos Periodo/Hoy/Por Cobrar/Totales/Artículos) solo admin.
  // Gráfico semanal admin + gerente. Cajero no ve nada de agregados.
  const canSeeKpiRow = isAdmin;
  const canSeeFinancials = !isCashier;
  // Gerente puede filtrar por cajero dentro de su tienda; admin si selecciona
  // tienda también; cajero queda forzado a sus propias ventas.
  const canFilterByCashier = isAdmin || isGerente;

  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  // Refs a los <input type="date"> para abrir el native picker en cualquier
  // clic del pill (Chromium/Firefox soportan input.showPicker()).
  const dateInputRefs = useRef<Array<HTMLInputElement | null>>([null, null]);
  const effectiveStoreId: number | null = canPickStore ? selectedStoreId : (user?.store_id ?? null);

  // Default: filtro "Hoy" al primer render — Joel quiere que las ventas del
  // día sean lo primero que el cajero/gerente/admin ven al entrar.
  // CRÍTICO: usamos la fecha LOCAL del navegador, no UTC. Antes esto usaba
  // `toISOString().split('T')[0]` que devuelve fecha UTC; a partir de las 18:00 MX
  // (00:00 UTC del día siguiente) el filtro cambiaba a "mañana" y dejaba de
  // mostrar las ventas del día.
  const localDateISO = (d: Date = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const todayISO = () => localDateISO();
  const [filterStartDate, setFilterStartDate] = useState<string>(todayISO);
  const [filterEndDate, setFilterEndDate]     = useState<string>(todayISO);
  const [filterMethod, setFilterMethod]       = useState("all");
  const [filterCashierId, setFilterCashierId] = useState<number | null>(null);
  const [isMethodOpen, setIsMethodOpen]       = useState(false);
  const [activeTab, setActiveTab]             = useState<"ventas" | "productos" | "flujo" | "reporte">("ventas");
  const [searchSale, setSearchSale]           = useState("");
  const [searchProduct, setSearchProduct]     = useState("");

  // Preset date shortcuts
  const setPreset = (preset: "today" | "week" | "month") => {
    const now = new Date();
    const today = localDateISO(now);
    if (preset === "today") {
      setFilterStartDate(today);
      setFilterEndDate(today);
    } else if (preset === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      setFilterStartDate(localDateISO(d));
      setFilterEndDate(today);
    } else {
      setFilterStartDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
      setFilterEndDate(today);
    }
  };

  // Identifica el preset activo para resaltar el chip correspondiente.
  const activePreset: "today" | "week" | "month" | "custom" = useMemo(() => {
    if (!filterStartDate || !filterEndDate) return "custom";
    const today = todayISO();
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 6);
    const weekStartStr = localDateISO(weekStart);
    if (filterStartDate === today && filterEndDate === today) return "today";
    if (filterStartDate === weekStartStr && filterEndDate === today) return "week";
    if (filterStartDate === monthStart && filterEndDate === today) return "month";
    return "custom";
  }, [filterStartDate, filterEndDate]);

  const methodOptions = [
    { value: "all",      label: "Todos los pagos" },
    { value: "efectivo", label: "Efectivo" },
    { value: "tarjeta",  label: "Tarjeta" },
    { value: "dólares",  label: "Dólares" },
    { value: "varios",   label: "Varios / Preventas" },
  ];

  const gradientId = useMemo(() => `grad-${Math.random().toString(36).slice(2, 8)}`, []);

  const queryClient = useQueryClient();
  const storesQuery = useStoresQuery({ active: true, enabled: canPickStore });
  const stores: StoreType[] = storesQuery.data ?? [];
  const activeStoreName: string = (effectiveStoreId
    ? (stores.find(s => s.id === effectiveStoreId)?.name ?? user?.store?.name ?? "")
    : (user?.store?.name ?? "Todas las tiendas"));

  // Lista de cajeros de la tienda — solo gerente/admin la consume para el
  // dropdown "Filtrar por cajero". Admin sin tienda seleccionada → todos.
  const cashiersQuery = useUsersQuery(
    canFilterByCashier && effectiveStoreId ? { store_id: effectiveStoreId, active: true } : undefined,
    { enabled: canFilterByCashier && !!effectiveStoreId }
  );
  const cashiers = cashiersQuery.data ?? [];

  const salesParams: Record<string, unknown> = { per_page: 500 };
  if (effectiveStoreId) salesParams.store_id = effectiveStoreId;
  if (filterStartDate) salesParams.from = filterStartDate;
  if (filterEndDate)   salesParams.to   = filterEndDate;
  // Cajero queda forzado backend a su propio user_id (RBAC), pero le mandamos
  // el filtro explícito para que el caching de RQ no mezcle con datos viejos.
  if (isCashier && user?.id) salesParams.user_id = user.id;
  else if (filterCashierId)   salesParams.user_id = filterCashierId;

  const preSaleOrdersParams: Record<string, unknown> = { per_page: 500, status: 'pending,ready' };
  if (effectiveStoreId) preSaleOrdersParams.store_id = effectiveStoreId;
  if (filterStartDate) preSaleOrdersParams.from = filterStartDate;
  if (filterEndDate)   preSaleOrdersParams.to   = filterEndDate;

  const salesQuery = useSalesQuery(salesParams as Parameters<typeof useSalesQuery>[0]);
  const preSaleOrdersQuery = usePreSaleOrdersQuery(preSaleOrdersParams as Parameters<typeof usePreSaleOrdersQuery>[0]);
  const productsQuery = useProductsQuery();

  // Reporte del Día — sesiones de caja del rango filtrado. Backend RBAC ya
  // limita a la tienda del gerente/cajero. Solo se carga cuando el tab está
  // activo o cuando se quiere imprimir/exportar.
  const cashReportQuery = useQuery({
    queryKey: ['daily-report', 'cash', filterStartDate, filterEndDate, selectedStoreId],
    queryFn: () => getCashReport({
      from: filterStartDate || getTodayLocal(),
      to:   filterEndDate   || getTodayLocal(),
      ...(selectedStoreId ? { store_id: selectedStoreId } : {}),
    }),
    enabled: canSeeFinancials,
    staleTime: 30_000,
  });
  const exchangeRateQuery = useExchangeRateQuery({ enabled: canSeeFinancials });

  const sales: SaleDetail[] = salesQuery.data?.data ?? [];
  const preSaleOrders: PreSaleOrder[] = preSaleOrdersQuery.data?.data ?? [];
  const productMap: Record<string, ProductInfo> = useMemo(() => {
    const map: Record<string, ProductInfo> = {};
    (productsQuery.data?.data ?? []).forEach((p: Product) => {
      if (p.id) {
        // Antes `imagen: ""` siempre — el thumbnail salía roto en Historial.
        // El endpoint devuelve `images: [{ url, ... }]`, tomamos la primera.
        map[String(p.id)] = {
          name: p.name || "",
          sku: p.sku || "",
          imagen: p.images?.[0]?.url ?? "",
        };
      }
    });
    return map;
  }, [productsQuery.data]);
  // Skeleton se muestra cuando:
  //  - Primer load (no hay data en cache de RQ)
  //  - Cambio de filtro/queryKey: data anterior ya no aplica y la nueva está
  //    fetcheando — distinguimos esto de un polling background usando
  //    `isFetching && !hasData`. Sin esto, el polling de 30s tira skeleton
  //    aunque haya data válida en pantalla.
  const isFirstLoad =
    salesQuery.isPending || preSaleOrdersQuery.isPending || productsQuery.isPending;
  const salesHasData       = (salesQuery.data?.data?.length ?? 0) > 0;
  const preSalesHasData    = (preSaleOrdersQuery.data?.data?.length ?? 0) > 0;
  const productsHasData    = (productsQuery.data?.data?.length ?? 0) > 0;
  const isFreshFilterFetch =
    (salesQuery.isFetching       && !salesHasData) ||
    (preSaleOrdersQuery.isFetching && !preSalesHasData) ||
    (productsQuery.isFetching    && !productsHasData);
  const loading = isFirstLoad || isFreshFilterFetch;

  useEffect(() => {
    if (salesQuery.error || preSaleOrdersQuery.error || productsQuery.error) {
      toast.error("Error al cargar datos financieros");
    }
  }, [salesQuery.error, preSaleOrdersQuery.error, productsQuery.error]);

  const handleReturn = async (saleId: number) => {
    try {
      await returnSale(saleId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      toast.success("Devolución registrada. Inventario restaurado.");
    } catch {
      toast.error("Error al procesar la devolución");
    }
  };

  // ── Filtrado (method only, dates now server-side) ─────────────────────────
  const filteredSales = useMemo(() => {
    if (filterMethod === "all") return sales;
    return sales.filter(s => getPaymentMethodName(s).toLowerCase().includes(filterMethod.toLowerCase()));
  }, [sales, filterMethod]);

  const filteredPreSales = useMemo(() => {
    if (filterMethod !== "all" && filterMethod !== "varios") return [];
    return preSaleOrders.filter(p => p.status === 'pending' || p.status === 'ready');
  }, [preSaleOrders, filterMethod]);

  // ── Métricas ──────────────────────────────────────────────────────────────
  const totalSalesRevenue = useMemo(() => filteredSales.reduce((a, s) => a + s.total, 0), [filteredSales]);
  const totalPreRevenue   = useMemo(() => filteredPreSales.reduce((a, p) => a + (p.paid_amount ?? 0), 0), [filteredPreSales]);
  const totalRevenue = totalSalesRevenue + totalPreRevenue;

  const todayRevenue = useMemo(() => {
    if (filterStartDate || filterEndDate) return totalRevenue;
    const today = localDateISO();
    return (
      sales.filter(s => (s.sold_at || s.created_at).startsWith(today)).reduce((a, s) => a + s.total, 0) +
      preSaleOrders
        .filter(p => (p.status === 'pending' || p.status === 'ready') && p.created_at.startsWith(today))
        .reduce((a, p) => a + (p.paid_amount ?? 0), 0)
    );
  }, [sales, preSaleOrders, filterStartDate, filterEndDate, totalRevenue]);

  const pendingPreSales = useMemo(
    () => filteredPreSales.reduce((a, p) => a + (p.balance ?? 0), 0),
    [filteredPreSales]
  );

  const methodsBreakdown = useMemo(() => {
    const map: Record<string, number> = { Efectivo: 0, Tarjeta: 0, Dólares: 0, Transferencia: 0 };
    filteredSales.forEach(s => {
      const m = getPaymentMethodName(s);
      map[m] = (map[m] || 0) + s.total;
    });
    return map;
  }, [filteredSales]);

  const salesByDay = useMemo(() => {
    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const map: Record<string, number> = {};
    filteredSales.forEach(s => {
      const d = days[new Date(s.sold_at || s.created_at).getDay()];
      if (d) map[d] = (map[d] || 0) + s.total;
    });
    filteredPreSales.forEach(p => {
      const d = days[new Date(p.created_at).getDay()];
      if (d) map[d] = (map[d] || 0) + (p.paid_amount ?? 0);
    });
    return days.map(d => ({ day: d, revenue: map[d] || 0 }));
  }, [filteredSales, filteredPreSales]);

  // ── Reporte del Día (Lectura X) ────────────────────────────────────────────
  // Agregados para el tab "Reporte del Día". Reutiliza filteredSales /
  // filteredPreSales (ya scopeados por rango + tienda) y suma data de cortes
  // de caja (cashReportQuery) y TC del día (exchangeRateQuery).
  const dailyReport = useMemo(() => {
    // A) Resumen ejecutivo
    const subtotal     = filteredSales.reduce((a, s) => a + (s.subtotal ?? s.total), 0);
    const descuento    = filteredSales.reduce((a, s) => a + (s.discount ?? 0), 0);
    const ventasNetas  = filteredSales.reduce((a, s) => a + s.total, 0);
    const comisionTotal = filteredSales.reduce((a, s) => a + (s.commission_amount ?? 0), 0);
    const netoDespuesComision = ventasNetas - comisionTotal;
    const ticketsCount = filteredSales.length;
    const promedio     = ticketsCount > 0 ? ventasNetas / ticketsCount : 0;

    // B) Desglose por método de pago — iterar payments[] de cada venta
    type Bucket = { count: number; amount: number; commission: number };
    const byMethod = new Map<string, Bucket>();
    filteredSales.forEach(s => {
      (s.payments ?? []).forEach(p => {
        const name = p.payment_method?.name ?? "Sin método";
        const b = byMethod.get(name) ?? { count: 0, amount: 0, commission: 0 };
        b.count     += 1;
        b.amount    += Number(p.amount) || 0;
        b.commission += Number(p.commission_amount) || 0;
        byMethod.set(name, b);
      });
    });
    const methodsRows = Array.from(byMethod.entries())
      .map(([name, b]) => ({ name, ...b }))
      .sort((a, b) => b.amount - a.amount);

    // C) Preventas
    // Anticipos cobrados = preventas creadas en el rango (paid_amount inicial)
    // Liquidaciones      = preventas con status "delivered" en el rango (total entregado)
    const anticiposCobrados = filteredPreSales
      .filter(p => p.status === "pending" || p.status === "ready")
      .reduce((a, p) => a + (p.paid_amount ?? 0), 0);
    const anticiposCount = filteredPreSales.filter(p => p.status === "pending" || p.status === "ready").length;
    const liquidaciones = filteredPreSales
      .filter(p => p.status === "delivered")
      .reduce((a, p) => a + (p.paid_amount ?? 0), 0);
    const liquidadasCount = filteredPreSales.filter(p => p.status === "delivered").length;
    const totalPreventas = anticiposCobrados + liquidaciones;

    // D) Movimientos de caja — suma de sesiones del rango (closed o open)
    const sessions: CashSessionReport[] = cashReportQuery.data?.sessions ?? [];
    const apertura  = sessions.reduce((a, s) => a + (s.opening_cash ?? 0), 0);
    const entradas  = sessions.reduce((a, s) => a + (s.total_entradas ?? 0), 0);
    const salidas   = sessions.reduce((a, s) => a + (s.total_salidas ?? 0), 0);
    const esperado  = sessions.reduce((a, s) => a + (s.expected_cash ?? 0), 0);
    const declarado = sessions.reduce((a, s) => a + (s.closing_cash ?? 0), 0);
    const descuadre = sessions.reduce((a, s) => a + (s.difference ?? 0), 0);
    const sesionesAbiertas = sessions.filter(s => s.status === "open").length;
    const sesionesCerradas = sessions.filter(s => s.status === "closed").length;

    // E) Top productos — agregamos aquí en vez de depender de `productStats`
    // (que se calcula más abajo) para no acoplar el orden de los useMemo.
    type ProdRow = { product_id: string; name: string; sku: string; units: number; revenue: number; tickets: number };
    const prodMap = new Map<string, ProdRow>();
    filteredSales.forEach(sale => {
      const seenInThisSale = new Set<string>();
      (sale.items ?? []).forEach(item => {
        const pid = String(item.product_id);
        const row = prodMap.get(pid) ?? {
          product_id: pid,
          name: item.product?.name ?? `#${pid}`,
          sku:  item.product?.sku  ?? "",
          units: 0, revenue: 0, tickets: 0,
        };
        row.units   += item.quantity;
        row.revenue += item.price * item.quantity;
        if (!seenInThisSale.has(pid)) { row.tickets += 1; seenInThisSale.add(pid); }
        prodMap.set(pid, row);
      });
    });
    const topProductsRows = Array.from(prodMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // G) Ganancia bruta (solo admin — backend solo expone cost a admin).
    // Prioridad: item.cost (snapshot histórico al momento del INSERT) →
    // fallback item.product.cost (cost actual del producto). El snapshot es la
    // verdad: ventas creadas después de 2026-05-22 lo tienen siempre.
    let costoTotal = 0;
    let itemsConCosto = 0;
    let itemsSinCosto = 0;
    filteredSales.forEach(s => {
      (s.items ?? []).forEach(item => {
        const cost = item.cost ?? item.product?.cost;
        if (cost != null) {
          costoTotal += cost * item.quantity;
          itemsConCosto += 1;
        } else {
          itemsSinCosto += 1;
        }
      });
    });
    const gananciaBruta = ventasNetas - costoTotal;
    const margenPct = ventasNetas > 0 ? (gananciaBruta / ventasNetas) * 100 : 0;
    const tieneDatosCosto = itemsConCosto > 0;
    const tieneItemsSinCosto = itemsSinCosto > 0;

    // F) Tabla por cajero — agrupar filteredSales por user_id + cruzar con
    // sesiones de caja del rango para el descuadre por cajero.
    type CashierRow = {
      user_id: number; name: string;
      tickets: number; revenue: number; commission: number;
      descuadre: number; hasOpenSession: boolean;
    };
    const cashierMap = new Map<number, CashierRow>();
    filteredSales.forEach(s => {
      if (s.user_id == null) return;
      const row = cashierMap.get(s.user_id) ?? {
        user_id: s.user_id,
        name: s.user?.name ?? `Usuario #${s.user_id}`,
        tickets: 0, revenue: 0, commission: 0, descuadre: 0, hasOpenSession: false,
      };
      row.tickets    += 1;
      row.revenue    += s.total;
      row.commission += s.commission_amount ?? 0;
      // Si SaleResource trae user pero el map no tenía nombre, llenarlo.
      if (s.user?.name && row.name.startsWith("Usuario #")) row.name = s.user.name;
      cashierMap.set(s.user_id, row);
    });
    // Cruzar con sesiones para sumar descuadre por cajero.
    sessions.forEach(sess => {
      const row = cashierMap.get(sess.user.id);
      if (!row) return;
      row.descuadre += sess.difference ?? 0;
      if (sess.status === "open") row.hasOpenSession = true;
    });
    const cashierRows: CashierRow[] = Array.from(cashierMap.values())
      .sort((a, b) => b.revenue - a.revenue);

    // H) Cancelaciones (ADR-016 Fase 1) — solo visibilidad por ahora.
    // Lee `sales.status='returned'` y `pre_sale_orders.status='cancelled'`
    // (campos ya existentes). Fase 2 traerá motivo + items + tabla detallada.
    const ventasCanceladas    = filteredSales.filter(s => s.status === "returned");
    const preventasCanceladas = filteredPreSales.filter(p => p.status === "cancelled");
    const cancelacionesCount  = ventasCanceladas.length + preventasCanceladas.length;
    const montoVentasCanceladas    = ventasCanceladas.reduce((a, s) => a + s.total, 0);
    const montoPreventasCanceladas = preventasCanceladas.reduce((a, p) => a + (p.paid_amount ?? 0), 0);
    const montoCanceladoTotal      = montoVentasCanceladas + montoPreventasCanceladas;
    const ventasNetasReales        = ventasNetas - montoCanceladoTotal;

    return {
      // A
      subtotal, descuento, ventasNetas, comisionTotal, netoDespuesComision,
      ticketsCount, promedio,
      // B
      methodsRows,
      tipoCambio: exchangeRateQuery.data ?? null,
      // C
      anticiposCobrados, anticiposCount,
      liquidaciones, liquidadasCount,
      totalPreventas,
      // D
      apertura, entradas, salidas, esperado, declarado, descuadre,
      sesionesAbiertas, sesionesCerradas, sessionsCount: sessions.length,
      // E
      topProductsRows,
      // F
      cashierRows,
      // G — solo admin (gerente recibe null en product.cost)
      costoTotal, gananciaBruta, margenPct, tieneDatosCosto, tieneItemsSinCosto,
      // H — cancelaciones (Fase 1: solo visibilidad)
      cancelacionesCount, ventasCanceladasCount: ventasCanceladas.length,
      preventasCanceladasCount: preventasCanceladas.length,
      montoVentasCanceladas, montoPreventasCanceladas, montoCanceladoTotal,
      ventasNetasReales,
    };
  }, [filteredSales, filteredPreSales, cashReportQuery.data, exchangeRateQuery.data]);

  // ── Lista de ventas ────────────────────────────────────────────────────────
  const sortedSales = useMemo(
    () => [...filteredSales].sort((a, b) =>
      new Date(b.sold_at || b.created_at).getTime() - new Date(a.sold_at || a.created_at).getTime()
    ),
    [filteredSales]
  );

  const displayedSales = useMemo(() => {
    if (!searchSale.trim()) return sortedSales;
    const q = searchSale.toLowerCase();
    return sortedSales.filter(s =>
      String(s.id).includes(q) ||
      (s.customer?.name || "").toLowerCase().includes(q) ||
      getPaymentMethodName(s).toLowerCase().includes(q) ||
      (s.items || []).some(i => {
        const info = productMap[String(i.product_id)];
        return (i.product?.name || info?.name || "").toLowerCase().includes(q) ||
               (i.product?.sku  || info?.sku  || "").toLowerCase().includes(q);
      })
    );
  }, [sortedSales, searchSale, productMap]);

  // ── Agregado por producto ──────────────────────────────────────────────────
  interface ProductStat {
    product_id: string; name: string; sku: string; imagen: string;
    timesAppeared: number; totalUnits: number; totalRevenue: number;
    avgPrice: number;
  }

  const productStats = useMemo((): ProductStat[] => {
    const map = new Map<string, ProductStat>();
    filteredSales.forEach(sale => {
      const seen = new Set<string>();
      (sale.items || []).forEach(item => {
        const pid  = String(item.product_id);
        const info = productMap[pid];
        const name = item.product?.name || info?.name || pid;
        const sku  = item.product?.sku  || info?.sku  || "";
        const img  = info?.imagen || "";
        if (!map.has(pid)) map.set(pid, { product_id: pid, name, sku, imagen: img, timesAppeared: 0, totalUnits: 0, totalRevenue: 0, avgPrice: 0 });
        const st = map.get(pid)!;
        if (!st.imagen && img) st.imagen = img;
        if (!seen.has(pid)) { st.timesAppeared++; seen.add(pid); }
        st.totalUnits   += item.quantity;
        st.totalRevenue += item.price * item.quantity;
      });
    });
    map.forEach(st => { st.avgPrice = st.totalUnits > 0 ? st.totalRevenue / st.totalUnits : 0; });
    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [filteredSales, productMap]);

  const displayedProducts = useMemo(() => {
    if (!searchProduct.trim()) return productStats;
    const q = searchProduct.toLowerCase();
    return productStats.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }, [productStats, searchProduct]);

  const topRevenue = displayedProducts[0]?.totalRevenue || 1;

  // `loading` se mantiene para mostrar skeleton dentro de la tabla. Quitamos
  // el return de pantalla completa para que el header y los filtros siempre
  // estén visibles mientras se cambia el rango (antes Joel veía un spinner que
  // tapaba todo y no podía corregir el filtro hasta que el fetch acabara).
  const isFetching = salesQuery.isFetching || preSaleOrdersQuery.isFetching || productsQuery.isFetching;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: T.bgGrad }}>

      {/* ── Header ── */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
            <BarChart3 size={24} style={{ color: T.redBright }} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter" style={{ color: "var(--td-text-hi)" }}>
              REPORTE DE <span style={{ color: T.redBright }}>VENTAS</span>
            </h1>
            {/* Subtítulo dinámico: tienda activa + rol del usuario. Cajero ve
                "Mi tienda · {nombre} · Mis ventas"; gerente ve nombre de tienda. */}
            <p className="text-[9px] font-black uppercase tracking-[0.3em] mt-0.5" style={{ color: "var(--td-text-lo)" }}>
              {(() => {
                const storeName = (canPickStore ? stores.find(s => s.id === effectiveStoreId)?.name : user?.store?.name) ?? null;
                if (isCashier) return `MI TIENDA · ${storeName ?? "—"} · MIS VENTAS`;
                if (isGerente) return `GERENTE · ${storeName ?? "—"}`;
                return `Control Financiero · ${storeName ?? "Todas las tiendas"}`;
              })()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Store picker — solo admin */}
          {canPickStore && (
            <div className="flex items-center gap-2 rounded-full px-3 py-1.5 h-[36px]"
              style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
              <Store size={12} style={{ color: "var(--td-text-lo)" }} />
              <select
                value={selectedStoreId ?? ""}
                onChange={e => setSelectedStoreId(e.target.value ? Number(e.target.value) : null)}
                className="bg-transparent outline-none text-[10px] font-bold uppercase tracking-widest cursor-pointer"
                style={{ color: "var(--td-text-hi)" }}
              >
                <option value="">Todas las tiendas</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          {/* Botón 'Actualizar' comentado — React Query refetcha en background
              + refetchOnWindowFocus + las mutaciones (devolver venta) invalidan
              ya el cache. No tiene sentido manual. Decisión Joel 2026-05-21.
              Indicador de fetch en background ahora vive en el subtítulo del header. */}
          {false && (
            <button onClick={() => { void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all }); void queryClient.invalidateQueries({ queryKey: queryKeys.preSaleOrders.all }); }}
              className="flex items-center justify-center gap-2 px-5 h-[36px] font-black text-[9px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
              style={T.btnRed}>
              {isFetching && !loading
                ? <Loader2 size={13} strokeWidth={3} className="animate-spin" />
                : <TrendingUp size={13} strokeWidth={3} />}
              {isFetching && !loading ? "Actualizando…" : "Actualizar"}
            </button>
          )}
        </div>
      </header>

      {/* ── Filtro principal: ocupa todo el ancho arriba de la tabla. Joel pidió
          que el periodo sea lo primero y se vea siempre activo cuál preset
          está seleccionado (Hoy por default). ──
          relative + z-50 fuerza a este panel a pintar encima del panel de
          tabla que viene después en el DOM, así el dropdown 'Todos los pagos'
          no queda tapado cuando se despliega hacia abajo. */}
      <div className="rounded-[24px] p-4 flex flex-wrap items-center gap-3 relative z-50" style={T.glass}>
        <div className="flex items-center gap-2">
          <CalendarDays size={14} style={{ color: T.redBright }} />
          <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--td-text-md)" }}>
            Periodo
          </span>
        </div>

        {/* Chips de preset — el activo va con gradient rojo y borde luminoso */}
        {(["today", "week", "month"] as const).map(p => {
          const active = activePreset === p;
          return (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className="h-[34px] px-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
              style={active
                ? { background: "linear-gradient(135deg,#CC2200,#FF4422)", color: "#fff", border: "1px solid rgba(255,80,50,0.4)", boxShadow: "0 4px 18px rgba(204,34,0,0.4)" }
                : { background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", color: "var(--td-text-md)" }
              }
            >
              {p === "today" ? "Hoy" : p === "week" ? "7 días" : "Este mes"}
            </button>
          );
        })}

        {/* Rango personalizado — DOS pills separados para que el click target
            de cada fecha sea grande, claro y diferenciable. Antes era un solo
            pill compartido y se batallaba para acertar al inicio vs fin. */}
        {([
          { value: filterStartDate, set: setFilterStartDate, label: "Desde", placeholder: "—" },
          { value: filterEndDate,   set: setFilterEndDate,   label: "Hasta", placeholder: "—", min: filterStartDate },
        ] as const).map((d, i) => {
          const inputRef = (el: HTMLInputElement | null) => { dateInputRefs.current[i] = el; };
          // Forzamos la apertura del native date picker en cualquier click del pill.
          // Sin esto el navegador a veces solo enfoca el input (sin abrir) cuando
          // se clickea fuera del ícono pequeño nativo.
          const openPicker = (e: React.MouseEvent) => {
            const input = dateInputRefs.current[i];
            if (!input) return;
            if (typeof input.showPicker === "function") {
              e.preventDefault();
              try { input.showPicker(); } catch { /* algunos browsers exigen gesto distinto */ }
            }
          };
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={openPicker}
              className="relative flex items-center gap-2 rounded-full h-[34px] cursor-pointer transition-all"
              style={{
                padding: "0 12px 0 14px",
                background: "var(--td-panel-bg)",
                border: `1px solid ${activePreset === "custom" ? "rgba(255,68,34,0.4)" : "var(--td-panel-border)"}`,
                minWidth: 130,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,68,34,0.6)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = activePreset === "custom" ? "rgba(255,68,34,0.4)" : "var(--td-panel-border)"; }}
            >
              <CalendarDays size={11} style={{ color: "var(--td-text-lo)", flexShrink: 0, pointerEvents: "none" }} />
              <span className="text-[8px] font-black uppercase tracking-widest pointer-events-none select-none" style={{ color: "var(--td-text-lo)" }}>
                {d.label}
              </span>
              <span className="text-[10px] font-bold tracking-widest uppercase pointer-events-none select-none"
                style={{ color: d.value ? "var(--td-text-hi)" : "var(--td-text-lo)" }}>
                {fmtDate(d.value) || d.placeholder}
              </span>
              <input
                ref={inputRef}
                type="date"
                value={d.value}
                {...(("min" in d) && d.min ? { min: d.min } : {})}
                onChange={e => d.set(e.target.value)}
                // Cubre todo el pill como fallback si el browser no soporta
                // showPicker(). Mantenemos opacity-0 para que se vea el label.
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                tabIndex={-1}
              />
            </div>
          );
        })}

        <div className="flex-1 min-w-0" />

        {/* Filtro de cajero — solo gerente/admin lo ven. Cajero no necesita
            (siempre se le fuerza a su user_id en backend). */}
        {canFilterByCashier && cashiers.length > 0 && (
          <div className="flex items-center gap-2 rounded-full px-3 h-[34px]"
            style={{ background: "var(--td-panel-bg)", border: `1px solid ${filterCashierId ? "rgba(255,68,34,0.4)" : "var(--td-panel-border)"}` }}>
            <Receipt size={12} style={{ color: filterCashierId ? T.redBright : "var(--td-text-lo)" }} />
            <select
              value={filterCashierId ?? ""}
              onChange={e => setFilterCashierId(e.target.value ? Number(e.target.value) : null)}
              className="bg-transparent outline-none text-[10px] font-bold uppercase tracking-widest cursor-pointer"
              style={{ color: "var(--td-text-hi)" }}
            >
              <option value="">Todos los cajeros</option>
              {cashiers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Método de pago — secundario, en la misma fila */}
        <div className="relative">
          <button onClick={() => setIsMethodOpen(v => !v)}
            className="flex items-center gap-2 rounded-full px-4 h-[34px] transition-colors"
            style={{ background: "var(--td-panel-bg)", border: `1px solid ${filterMethod !== "all" ? "rgba(255,68,34,0.4)" : "var(--td-panel-border)"}` }}>
            <CreditCard size={12} style={{ color: filterMethod !== "all" ? T.redBright : "var(--td-text-lo)" }} />
            <span className="text-[10px] font-bold uppercase tracking-widest whitespace-nowrap" style={{ color: "var(--td-text-hi)" }}>
              {methodOptions.find(o => o.value === filterMethod)?.label}
            </span>
            <ChevronDown size={10} style={{ color: "var(--td-text-lo)" }} className="ml-1" />
          </button>
          {isMethodOpen && (
            <div className="absolute top-[calc(100%+6px)] right-0 w-48 rounded-2xl overflow-hidden shadow-2xl"
              style={{
                zIndex: 60,
                // --td-popup-bg es opaco por tema (#13091e dark / #ffffff light).
                // Antes usábamos --td-panel-bg que tiene alpha y dejaba ver la
                // tabla detrás del dropdown.
                background: "var(--td-popup-bg)",
                border: "1px solid var(--td-popup-border)",
                boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
              }}>
              {methodOptions.map(opt => (
                <button key={opt.value} onClick={() => { setFilterMethod(opt.value); setIsMethodOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors"
                  style={{
                    color: filterMethod === opt.value ? T.redBright : "var(--td-text-md)",
                    background: filterMethod === opt.value ? "rgba(255,68,34,0.08)" : "transparent",
                  }}
                  onMouseEnter={e => { if (filterMethod !== opt.value) (e.target as HTMLElement).style.background = "var(--td-panel-border)"; }}
                  onMouseLeave={e => { if (filterMethod !== opt.value) (e.target as HTMLElement).style.background = "transparent"; }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── KPIs ── Solo admin. Gerente y cajero NO ven agregados del row.
          Gerente sí ve el tab de Flujo de Caja Semanal abajo. */}
      {canSeeKpiRow && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { label: (filterStartDate || filterEndDate) ? "Ingresos Período" : "Ingresos Totales", value: fmt(totalRevenue), icon: DollarSign, color: T.redBright },
            { label: "Ingresos Hoy",           value: fmt(todayRevenue),    icon: TrendingUp,  color: "#00CC66" },
            { label: "Por Cobrar (Preventas)",  value: fmt(pendingPreSales), icon: CreditCard,  color: "#facc15" },
            { label: "Ventas Totales",          value: String(filteredSales.length + filteredPreSales.length), icon: ShoppingBag, color: "#4488FF" },
            { label: "Artículos Vendidos",      value: String(filteredSales.reduce((a, s) => a + (s.items?.reduce((b, i) => b + i.quantity, 0) ?? 0), 0)), icon: Package, color: "#FFAA00" },
          ].map((stat, i) => (
            <div key={i} className="p-4 rounded-[24px] flex items-center gap-3" style={T.glass}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
                <stat.icon size={16} style={{ color: stat.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-widest truncate" style={{ color: "var(--td-text-lo)" }}>{stat.label}</p>
                <p className="text-lg font-black italic leading-tight" style={{ color: "var(--td-text-hi)" }}>{stat.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════ LISTAS ══════════ */}
      <div className="rounded-[36px] overflow-hidden" style={T.glass}>

        {/* Tab bar */}
        <div className="flex items-center justify-between px-8 pt-7 pb-0" style={{ borderBottom: "1px solid var(--td-panel-border)" }}>
          <div className="flex items-end gap-1">
            {([
              { key: "ventas",    label: "Lista de Ventas", icon: Receipt,   count: displayedSales.length },
              { key: "productos", label: "Por Producto",    icon: Package,   count: displayedProducts.length },
              // El tab de flujo y reporte solo aparecen para admin/gerente.
              ...(canSeeFinancials
                ? [
                    { key: "reporte" as const, label: "Reporte del Día",       icon: FileText,  count: null as number | null },
                    { key: "flujo"   as const, label: "Flujo de Caja Semanal", icon: BarChart3, count: null as number | null },
                  ]
                : []),
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2.5 px-6 py-3.5 rounded-t-2xl text-[10px] font-black uppercase tracking-widest transition-all border-b-2 -mb-px ${
                  activeTab === t.key
                    ? "border-red-500 bg-gradient-to-b from-red-500/10 to-transparent"
                    : "border-transparent hover:bg-white/[0.02]"
                }`}
                style={{ color: activeTab === t.key ? "var(--td-text-hi)" : "var(--td-text-lo)" }}
              >
                <t.icon size={14} />
                {t.label}
                {t.count !== null && (
                  <span className="px-2 py-0.5 rounded-full text-[8px] font-black"
                    style={{ background: activeTab === t.key ? "rgba(255,68,34,0.2)" : "var(--td-panel-bg)", color: activeTab === t.key ? "#FF8866" : "var(--td-text-lo)" }}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-6 pb-1">
            {activeTab === "ventas" ? (
              <>
                <div className="text-right">
                  <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Artículos vendidos</p>
                  <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>
                    {displayedSales.reduce((a, s) => a + (s.items?.reduce((b, i) => b + i.quantity, 0) ?? 0), 0)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Total recibido</p>
                  <p className="text-sm font-black" style={{ color: T.redBright }}>{fmt(displayedSales.reduce((a, s) => a + s.total, 0))}</p>
                </div>
              </>
            ) : (
              <>
                <div className="text-right">
                  <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Productos únicos</p>
                  <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{displayedProducts.length}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>Total ingresado</p>
                  <p className="text-sm font-black" style={{ color: T.redBright }}>{fmt(displayedProducts.reduce((a, p) => a + p.totalRevenue, 0))}</p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-6 space-y-4">

          {/* ══ Tab: Lista de Ventas ══ */}
          {activeTab === "ventas" && (
            <>
              <div className="flex items-center gap-3 rounded-2xl px-4 py-2.5"
                style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--td-panel-border)" }}>
                <Receipt size={13} style={{ color: "var(--td-text-lo)" }} className="flex-shrink-0" />
                <input value={searchSale} onChange={e => setSearchSale(e.target.value)}
                  placeholder="Buscar por ID, cliente, método de pago, producto…"
                  className="flex-1 bg-transparent outline-none text-xs"
                  style={{ color: "var(--td-text-hi)" }} />
                {searchSale && <button onClick={() => setSearchSale("")} className="hover:opacity-70 transition-opacity" style={{ color: "var(--td-text-lo)" }}><X size={12} /></button>}
              </div>

              <div className="flex items-center gap-4 px-4 py-1.5 text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)", borderBottom: "1px solid var(--td-panel-border)" }}>
                <span className="w-5">#</span>
                <span className="w-3" />
                <span style={{ width: 80 }} />
                <span className="w-[115px]">Fecha</span>
                <span className="flex-1 hidden lg:block">ID / Cliente</span>
                <span>Método</span>
                <span className="w-10 text-center hidden sm:block">Arts.</span>
                <span className="ml-auto">Total</span>
              </div>

              {/* Body con scroll interno. Sin esto la página entera scrollea
                  y el header de columnas queda lejos cuando hay muchos records. */}
              <div className="space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: "60vh" }}>
                {loading ? (
                  // Skeleton: 5 filas con shimmer mientras cargan los datos
                  Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={`sk-${i}`}
                      className="flex items-center gap-4 px-4 py-3 rounded-2xl animate-pulse"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--td-panel-border)" }}
                    >
                      <div className="w-9 h-9 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }} />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-2.5 w-32 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
                        <div className="h-2 w-20 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
                      </div>
                      <div className="h-2.5 w-16 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
                      <div className="h-3 w-20 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
                    </div>
                  ))
                ) : displayedSales.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20" style={{ opacity: 0.15 }}>
                    <Receipt size={40} className="mb-3" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Sin ventas en este período</p>
                  </div>
                ) : (
                  displayedSales.map((sale, idx) => (
                    <SaleRow key={`${sale.id}-${idx}`} sale={sale} productMap={productMap} rank={idx + 1} onReturn={handleReturn} />
                  ))
                )}
              </div>
            </>
          )}

          {/* ══ Tab: Por Producto ══ */}
          {activeTab === "productos" && (
            <>
              <div className="flex items-center gap-3 rounded-2xl px-4 py-2.5"
                style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--td-panel-border)" }}>
                <Package size={13} style={{ color: "var(--td-text-lo)" }} className="flex-shrink-0" />
                <input value={searchProduct} onChange={e => setSearchProduct(e.target.value)}
                  placeholder="Buscar producto por nombre o SKU…"
                  className="flex-1 bg-transparent outline-none text-xs"
                  style={{ color: "var(--td-text-hi)" }} />
                {searchProduct && <button onClick={() => setSearchProduct("")} className="hover:opacity-70 transition-opacity" style={{ color: "var(--td-text-lo)" }}><X size={12} /></button>}
              </div>

              <div className="grid grid-cols-[56px_1fr_72px_72px_96px_112px] gap-3 px-4 py-1.5 text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)", borderBottom: "1px solid var(--td-panel-border)" }}>
                <span />
                <span>Producto</span>
                <span className="text-center"># Ventas</span>
                <span className="text-center">Unidades</span>
                <span className="text-right">Prom. precio</span>
                <span className="text-right">Total recibido</span>
              </div>

              <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "60vh" }}>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={`pk-${i}`}
                      className="flex items-center gap-4 px-4 py-3 rounded-2xl animate-pulse"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--td-panel-border)" }}
                    >
                      <div className="w-10 h-10 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }} />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-2.5 w-40 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
                        <div className="h-2 w-24 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
                      </div>
                      <div className="h-2.5 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
                      <div className="h-2.5 w-14 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
                      <div className="h-3 w-20 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
                    </div>
                  ))
                ) : displayedProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20" style={{ opacity: 0.15 }}>
                    <Package size={40} className="mb-3" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Sin productos vendidos en este período</p>
                  </div>
                ) : (
                  displayedProducts.map((p, idx) => {
                    const barPct = Math.round((p.totalRevenue / topRevenue) * 100);
                    const rankCls =
                      idx === 0 ? "bg-amber-400/20 text-amber-400 border-amber-400/30" :
                      idx === 1 ? "bg-white/10 text-white/50 border-white/10" :
                      idx === 2 ? "bg-orange-700/20 text-orange-500 border-orange-700/30" :
                      "bg-white/5 text-white/20 border-white/5";

                    return (
                      <div key={p.product_id} className="rounded-2xl overflow-hidden transition-all" style={{ border: "1px solid var(--td-panel-border)" }}>
                        <div className="grid grid-cols-[56px_1fr_72px_72px_96px_112px] gap-3 items-center px-4 py-3.5">
                          <div className="flex flex-col items-center gap-1.5">
                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center text-[8px] font-black ${rankCls}`}>
                              {idx + 1}
                            </div>
                            <ProductThumb src={p.imagen} name={p.name} size={36} rounded="rounded-xl" />
                          </div>

                          <div className="min-w-0">
                            <p className="text-sm font-bold truncate" style={{ color: "var(--td-text-hi)" }}>{p.name}</p>
                            {p.sku && <p className="text-[8px] uppercase tracking-widest mt-0.5 truncate" style={{ color: "var(--td-text-lo)" }}>{p.sku}</p>}
                          </div>

                          <div className="text-center">
                            <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{p.timesAppeared}</p>
                            <p className="text-[7px] uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>ventas</p>
                          </div>

                          <div className="text-center">
                            <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{p.totalUnits}</p>
                            <p className="text-[7px] uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>uds.</p>
                          </div>

                          <div className="text-right">
                            <p className="text-xs font-bold" style={{ color: "var(--td-text-md)" }}>{fmt(p.avgPrice)}</p>
                            <p className="text-[7px] uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>promedio</p>
                          </div>

                          <div className="text-right">
                            <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{fmt(p.totalRevenue)}</p>
                            <p className="text-[7px] uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>ingresado</p>
                          </div>
                        </div>

                        <div className="h-[2px]" style={{ background: "var(--td-panel-border)" }}>
                          <div className="h-full bg-gradient-to-r from-red-700 to-red-400 transition-all duration-700" style={{ width: `${barPct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* ══ Tab: Reporte del Día (Lectura X) ══ (admin + gerente) */}
          {activeTab === "reporte" && canSeeFinancials && (
            <ReporteDelDia
              report={dailyReport}
              fromDate={filterStartDate || getTodayLocal()}
              toDate={filterEndDate || getTodayLocal()}
              storeName={activeStoreName}
              storeId={effectiveStoreId ?? null}
              isAdmin={isAdmin}
            />
          )}

          {/* ══ Tab: Flujo de Caja Semanal ══ (admin + gerente) */}
          {activeTab === "flujo" && canSeeFinancials && (
            <div className="space-y-4">
              {/* Breakdown por método de pago */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { l: "Efectivo", v: methodsBreakdown["Efectivo"] || 0, c: "#34d399" },
                  { l: "Tarjeta",  v: methodsBreakdown["Tarjeta"]  || 0, c: "#60a5fa" },
                  { l: "Dólares",  v: methodsBreakdown["Dólares"]  || 0, c: "#fbbf24" },
                ].map((m, i) => (
                  <div key={i} className="rounded-2xl px-4 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--td-panel-border)" }}>
                    <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: m.c }}>{m.l}</p>
                    <p className="text-base font-black mt-1" style={{ color: "var(--td-text-hi)" }}>{fmt(m.v)}</p>
                  </div>
                ))}
              </div>

              {/* Gráfico de revenue por día de la semana (Dom→Sáb) */}
              <div className="rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.15)", border: "1px solid var(--td-panel-border)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 size={13} style={{ color: "var(--td-text-lo)" }} />
                  <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                    Revenue por día · {filterStartDate || "histórico"}{filterEndDate ? ` → ${filterEndDate}` : ""}
                  </span>
                </div>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesByDay}>
                      <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#FF4422" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#FF4422" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 9, fill: "var(--td-text-lo)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "var(--td-text-lo)" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", borderRadius: "10px" }} itemStyle={{ color: "#FF4422", fontWeight: 900, fontSize: 11 }} />
                      <Area type="monotone" dataKey="revenue" stroke="#FF4422" strokeWidth={2.5} fill={`url(#${gradientId})`} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[9px] mt-2" style={{ color: "var(--td-text-lo)" }}>
                  Suma de ventas + anticipos de preventa, agrupado por día de la semana dentro del rango filtrado.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
