import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, DollarSign, ShoppingBag, BarChart3, Loader2,
  CreditCard, CalendarDays, ChevronDown, X, ChevronRight, ChevronLeft,
  Package, Receipt, ImageOff, RotateCcw, AlertTriangle,
  Store, Printer, User as UserIcon, FileText, Download, Bookmark, FileSpreadsheet,
  Maximize2, Minimize2,
} from "lucide-react";
import {
  Button as AriaButton,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarHeading,
  Dialog,
  DialogTrigger,
  Popover,
  RangeCalendar,
} from "react-aria-components";
import { parseDate } from "@internationalized/date";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { returnSale, getCashReport, storageUrl } from "@tadaima/api";
import { getTodayLocal, toLocalYmd, daysAgoLocal, BUSINESS_TZ } from "@/lib/date";
import type { CashSessionReport } from "@tadaima/api";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useSalesQuery } from "@/hooks/queries/useSales";
import { usePreSaleOrdersQuery } from "@/hooks/queries/usePreSales";
import { useProductsQuery } from "@/hooks/queries/useProducts";
import { useStoresQuery } from "@/hooks/queries/useStores";
import { useUsersQuery } from "@/hooks/queries/useUsers";
import { useExchangeRateQuery } from "@/hooks/queries/useSystemSettings";
import { queryKeys } from "@/lib/queryKeys";
import { invalidateAfterSale } from "@/lib/optimisticSale";
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

/** Nombre corto para la UI: el catálogo de métodos trae variantes ("Tarjeta
 * débito", "Tarjeta de crédito") que no caben en la columna — basta "Tarjeta"
 * (Joel 2026-06-12). El desglose por método y el filtro usan includes
 * ("tarjeta") así que la normalización no los rompe. */
const shortMethodName = (name: string): string =>
  /tarjeta/i.test(name) ? "Tarjeta" : name;

function getPaymentMethodName(sale: SaleDetail): string {
  const first = sale.payments?.[0];
  if (!first) return "Efectivo";
  return shortMethodName(first.payment_method?.name ?? "Efectivo");
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n);

// % de comisión efectivo (comisión/venta) — sin decimales de ruido: 6% se ve
// "6%", 3.55% se ve "3.55%".
const fmtPct = (p: number) => `${Number(p.toFixed(2))}%`;

const fmtDate = (dateStr: string) => {
  if (!dateStr) return "DD/MM/YYYY";
  return new Date(dateStr + "T12:00:00")
    .toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
    .replace(".", "");
};

const fmtDateTime = (dateStr: string) =>
  dateStr ? new Date(dateStr).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: BUSINESS_TZ }) : "—";

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
function ProductThumb({ src, name, size = 44, rounded = "rounded-xl" }: { src?: string | undefined; name?: string | undefined; size?: number; rounded?: string }) {
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

const SALES_LIST_GRID_TEMPLATE = "20px 12px 80px 115px 108px minmax(180px,1fr) 150px 104px 52px 92px";

function toYmdFromDateValue(value: { year: number; month: number; day: number }): string {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

function SalesDateRangePicker({
  startDate,
  endDate,
  isActive,
  isFetching = false,
  onChange,
}: {
  startDate: string;
  endDate: string;
  isActive: boolean;
  /** true mientras las queries de ventas/preventas refetchean — con
      keepPreviousData la tabla no blankea, así que este es el único
      feedback visible de que el rango elegido ya está cargando. */
  isFetching?: boolean;
  onChange: (start: string, end: string) => void;
}) {
  const selectedRange = useMemo(() => ({
    start: parseDate(startDate || getTodayLocal()),
    end: parseDate(endDate || startDate || getTodayLocal()),
  }), [startDate, endDate]);

  const triggerLabel = `${fmtDate(startDate)} - ${fmtDate(endDate)}`;

  return (
    <DialogTrigger>
      {/* Debe ser el Button de react-aria: DialogTrigger pasa el press por
          PressResponder y un <button> nativo nunca lo recibe (popover muerto). */}
      <AriaButton
        className="flex items-center gap-2 rounded-full h-[34px] px-4 transition-all outline-none"
        style={{
          background: "var(--td-panel-bg)",
          border: `1px solid ${isActive ? "rgba(255,68,34,0.4)" : "var(--td-panel-border)"}`,
          color: "var(--td-text-hi)",
          minWidth: 286,
        }}
      >
        {isFetching ? (
          <Loader2 size={11} className="animate-spin" style={{ color: T.redBright, flexShrink: 0 }} />
        ) : (
          <CalendarDays size={11} style={{ color: isActive ? T.redBright : "var(--td-text-lo)", flexShrink: 0 }} />
        )}
        <span className="text-[10px] font-bold tracking-widest uppercase text-left whitespace-nowrap">
          {triggerLabel}
        </span>
      </AriaButton>

      <Popover
        placement="bottom end"
        offset={12}
        className="rounded-[28px] p-0 outline-none"
        style={{
          // bg sólido (no el glass translúcido): la tabla de ventas se
          // transparentaba detrás del calendario
          background: "var(--td-popup-bg)",
          border: "1px solid var(--td-panel-border)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <Dialog className="outline-none">
          <div className="w-[680px] max-w-[calc(100vw-32px)] p-5">
            <RangeCalendar
              aria-label="Rango de fechas de ventas"
              value={selectedRange}
              onChange={(range) => {
                if (!range?.start || !range?.end) return;
                onChange(toYmdFromDateValue(range.start), toYmdFromDateValue(range.end));
              }}
              visibleDuration={{ months: 2 }}
              pageBehavior="single"
              className="w-full"
            >
              <div className="flex items-center gap-3">
                <AriaButton
                  slot="previous"
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white/60 transition-colors hover:border-white/20 hover:text-white"
                >
                  <ChevronLeft size={15} />
                </AriaButton>

                <div className="grid flex-1 grid-cols-2 gap-4">
                  <CalendarHeading className="text-center text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--td-text-hi)" }} />
                  <CalendarHeading offset={{ months: 1 }} className="text-center text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--td-text-hi)" }} />
                </div>

                <AriaButton
                  slot="next"
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white/60 transition-colors hover:border-white/20 hover:text-white"
                >
                  <ChevronRight size={15} />
                </AriaButton>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <CalendarGrid
                  weekdayStyle="short"
                  className="w-full border-separate border-spacing-y-1.5"
                >
                  <CalendarGridHeader>
                    {(day) => (
                      <CalendarHeaderCell className="pb-2 text-center text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                        {day}
                      </CalendarHeaderCell>
                    )}
                  </CalendarGridHeader>
                  <CalendarGridBody>
                    {(date) => (
                      <CalendarCell
                        date={date}
                        className={({ isSelected, isSelectionStart, isSelectionEnd, isFocusVisible, isOutsideMonth, isDisabled }) =>
                          [
                            "flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold transition-all outline-none",
                            "data-[hovered]:bg-white/8",
                            isOutsideMonth ? "text-white/20" : "text-white/80",
                            isDisabled ? "opacity-25" : "",
                            isSelected ? "text-white bg-[var(--td-red)]" : "bg-black/10",
                            isSelectionStart || isSelectionEnd ? "ring-2 ring-[#FF7A59]" : "",
                            isFocusVisible ? "ring-2 ring-white/70" : "",
                          ].join(" ")
                        }
                      />
                    )}
                  </CalendarGridBody>
                </CalendarGrid>

                <CalendarGrid
                  offset={{ months: 1 }}
                  weekdayStyle="short"
                  className="w-full border-separate border-spacing-y-1.5"
                >
                  <CalendarGridHeader>
                    {(day) => (
                      <CalendarHeaderCell className="pb-2 text-center text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>
                        {day}
                      </CalendarHeaderCell>
                    )}
                  </CalendarGridHeader>
                  <CalendarGridBody>
                    {(date) => (
                      <CalendarCell
                        date={date}
                        className={({ isSelected, isSelectionStart, isSelectionEnd, isFocusVisible, isOutsideMonth, isDisabled }) =>
                          [
                            "flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold transition-all outline-none",
                            "data-[hovered]:bg-white/8",
                            isOutsideMonth ? "text-white/20" : "text-white/80",
                            isDisabled ? "opacity-25" : "",
                            isSelected ? "text-white bg-[var(--td-red)]" : "bg-black/10",
                            isSelectionStart || isSelectionEnd ? "ring-2 ring-[#FF7A59]" : "",
                            isFocusVisible ? "ring-2 ring-white/70" : "",
                          ].join(" ")
                        }
                      />
                    )}
                  </CalendarGridBody>
                </CalendarGrid>
              </div>
            </RangeCalendar>

            <div
              className="mt-4 flex items-center justify-between rounded-2xl px-4 py-3"
              style={{ background: "rgba(0,0,0,0.16)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "var(--td-text-lo)" }}>
                <span>
                  <span style={{ color: "var(--td-text-hi)" }}>Desde</span> {fmtDate(startDate)}
                  <span className="mx-2 opacity-50">•</span>
                  <span style={{ color: "var(--td-text-hi)" }}>Hasta</span> {fmtDate(endDate)}
                </span>
                {isFetching && (
                  <span className="flex items-center gap-1.5" style={{ color: "#FF7A59" }}>
                    <Loader2 size={11} className="animate-spin" />
                    Actualizando…
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  const today = getTodayLocal();
                  onChange(today, today);
                }}
                className="rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all"
                style={{ background: "rgba(255,68,34,0.12)", border: "1px solid rgba(255,68,34,0.28)", color: "#FF7A59" }}
              >
                Hoy
              </button>
            </div>
          </div>
        </Dialog>
      </Popover>
    </DialogTrigger>
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
        className="w-full flex lg:grid items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        style={{ gridTemplateColumns: SALES_LIST_GRID_TEMPLATE }}
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
                <ProductThumb
                  {...(info?.imagen ? { src: info.imagen } : {})}
                  {...((info?.name || item.product?.name) ? { name: info?.name || item.product?.name } : {})}
                  size={32}
                  rounded="rounded-none"
                />
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

        <div className="w-[108px] flex-shrink-0 hidden lg:flex flex-col items-center justify-center text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--td-text-hi)" }}>#{sale.id}</p>
          <p className="text-[7px] uppercase tracking-[0.14em]" style={{ color: "var(--td-text-lo)" }}>ticket</p>
        </div>

        <div className="flex-1 min-w-0 hidden lg:flex items-center justify-center text-center">
          {sale.customer?.name ? (
            <p className="text-[10px] truncate" style={{ color: "var(--td-text-md)" }}>
              {sale.customer.name}
            </p>
          ) : (
            <div className="w-full flex items-center justify-center">
              <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--td-text-lo)" }}>
                Sin cliente
              </span>
            </div>
          )}
        </div>

        <div className="w-[150px] flex-shrink-0 hidden lg:flex items-center">
          <div
            className="flex items-center gap-1 text-[9px] font-bold truncate"
            style={{ color: "var(--td-text-lo)" }}
            title={sale.user?.name || "Sin cajero"}
          >
            <UserIcon size={9} />
            <span className="truncate" style={{ color: "var(--td-text-md)" }}>{sale.user?.name || "—"}</span>
          </div>
        </div>

        <span className={`w-[104px] text-center text-[9px] font-black uppercase tracking-[0.12em] px-2.5 py-1 rounded-full border flex-shrink-0 ${methodBg(paymentName)}`}>
          {paymentName}
        </span>

        <div className="flex-shrink-0 text-center w-[52px] hidden sm:block">
          <p className="text-xs font-bold" style={{ color: "var(--td-text-md)" }}>{itemCount}</p>
          <p className="text-[7px] uppercase" style={{ color: "var(--td-text-lo)" }}>arts.</p>
        </div>

        {/* Total cobrado = sale.total (productos regulares) + anticipos de
            preventas creadas en el mismo ticket. Sin esto el row mostraba
            solo $100 cuando el cobro real fue $200 (producto + anticipo).
            Cancelada total: en vez del $0 (edit-in-place) se muestra −$X en
            ROJO = lo que se regresó (Joel 2026-06-12). SIMBÓLICO: el total ya
            descuenta la cancelación, este monto NO se suma a agregados. */}
        {(() => {
          const cancelled = sale.cancelled_amount ?? 0;
          const isFullCancel = sale.status === "returned" || sale.cancellation_status === "full";
          if (isFullCancel && cancelled > 0) {
            return (
              <div className="w-[92px] flex-shrink-0 text-right">
                <p className="text-sm font-black" style={{ color: "#f87171" }}>−{fmt(cancelled)}</p>
                <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#f87171" }}>
                  cancelada
                </p>
              </div>
            );
          }
          return (
            <div className="w-[92px] flex-shrink-0 text-right">
              <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>
                {fmt(sale.total + (sale.pre_sale_orders ?? []).reduce((s, o) => s + (o.paid_amount ?? 0), 0))}
              </p>
              {sale.cancellation_status === "partial" && cancelled > 0 ? (
                <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#f87171" }}>
                  −{fmt(cancelled)} canc.
                </p>
              ) : (sale.pre_sale_orders ?? []).length > 0 && (
                <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#f59e0b" }}>
                  + anticipo
                </p>
              )}
            </div>
          );
        })()}
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
                <ProductThumb {...(img ? { src: img } : {})} name={name} size={44} rounded="rounded-xl" />

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

          {/* Detalle de lo cancelado (ADR-016) — snapshot de items + monto
              reversado en ROJO. Simbólico: el total de la venta ya descuenta
              la cancelación (Joel 2026-06-12). */}
          {(sale.cancelled_items ?? []).length > 0 && (
            <div className="mt-3 p-3 rounded-xl space-y-1" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#f87171" }}>
                  Cancelado · se regresó
                </p>
                <p className="text-sm font-black" style={{ color: "#f87171" }}>−{fmt(sale.cancelled_amount ?? 0)}</p>
              </div>
              {(sale.cancelled_items ?? []).map((ci, idx) => (
                <div key={idx} className="flex items-center gap-3 py-1" style={{ borderTop: "1px solid rgba(239,68,68,0.12)" }}>
                  <p className="flex-1 min-w-0 text-xs font-bold truncate" style={{ color: "var(--td-text-md)" }}>
                    {ci.name}
                    {ci.sku && <span className="ml-2 text-[8px] uppercase tracking-widest" style={{ color: "var(--td-text-lo)" }}>{ci.sku}</span>}
                  </p>
                  <span className="text-[10px] font-black flex-shrink-0" style={{ color: "var(--td-text-md)" }}>×{ci.quantity}</span>
                  <span className="text-[10px] font-bold w-[60px] text-right flex-shrink-0" style={{ color: "var(--td-text-lo)" }}>{fmt(ci.price)}</span>
                  <span className="text-xs font-black w-[80px] text-right flex-shrink-0" style={{ color: "#f87171" }}>−{fmt(ci.line_total)}</span>
                </div>
              ))}
              <p className="text-[8px] pt-1" style={{ color: "var(--td-text-lo)" }}>
                Monto ya descontado del total y de los reportes — no se resta dos veces.
              </p>
            </div>
          )}

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

// ─── Filas unificadas de la lista de Ventas ───────────────────────────────────
// La lista mezcla ventas regulares (/sales) con movimientos de preventa:
//  - "anticipo"    → folio pending/ready (apartado nuevo, saldo pendiente)
//  - "liquidacion" → folio delivered (entregado/saldado)
// Excluimos preventas con linked_sale_id != null: ésas se cobraron junto a una
// venta regular y ya salen como hijas dentro de su SaleRow (evita doble conteo).
type VentasRow =
  | { kind: "sale"; key: string; ts: number; sale: SaleDetail }
  | { kind: "presale"; key: string; ts: number; order: PreSaleOrder; movement: "anticipo" | "liquidacion" };

/** Método de pago de un folio derivado de sus pagos. "Varios" si hay mezcla. */
function getPreSaleMethodName(order: PreSaleOrder): string {
  const names = Array.from(
    new Set(
      (order.payments ?? [])
        .map(p => p.payment_method?.name)
        .filter((n): n is string => !!n)
        // "Tarjeta débito"/"Tarjeta de crédito" → "Tarjeta" (también colapsa
        // débito+crédito en un solo nombre en vez de "Varios").
        .map(shortMethodName)
    )
  );
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0] ?? "—";
  return "Varios";
}

// ─── PreSaleMovementRow expandible ────────────────────────────────────────────
function PreSaleMovementRow({
  order, movement, rank,
}: {
  order: PreSaleOrder;
  movement: "anticipo" | "liquidacion";
  rank: number;
}) {
  const [open, setOpen] = useState(false);
  const items = order.items ?? [];
  const itemCount = items.reduce((s, it) => s + (it.quantity ?? 0), 0);
  const paymentName = getPreSaleMethodName(order);
  const cobrado = order.paid_amount ?? 0;
  const isLiq = movement === "liquidacion";
  const accent = isLiq ? "#22c55e" : "#f59e0b";
  const dateStr = isLiq ? (order.updated_at || order.created_at) : order.created_at;

  return (
    <div className="rounded-2xl overflow-hidden transition-all group" style={{ border: `1px solid ${accent}33` }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex lg:grid items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        style={{ background: `${accent}0d`, gridTemplateColumns: SALES_LIST_GRID_TEMPLATE }}
      >
        <span className="text-[9px] font-black w-5 text-center flex-shrink-0" style={{ color: "var(--td-text-lo)" }}>{rank}</span>

        <ChevronRight
          size={12}
          className={`transition-transform flex-shrink-0 group-hover:opacity-60 ${open ? "rotate-90" : ""}`}
          style={{ color: accent }}
        />

        {/* Badge de preventa en lugar de thumbnails de producto */}
        <div className="flex items-center justify-center flex-shrink-0 rounded-lg" style={{ width: 32, height: 32, background: `${accent}1f`, border: `1px solid ${accent}40` }}>
          <Bookmark size={15} style={{ color: accent }} />
        </div>

        <div className="flex-shrink-0 w-[115px]">
          <p className="text-xs font-bold" style={{ color: "var(--td-text-hi)" }}>{fmtDateTime(dateStr)}</p>
        </div>

        <div className="w-[108px] flex-shrink-0 hidden lg:flex flex-col items-center justify-center text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--td-text-hi)" }}>#{order.id}</p>
          <p className="text-[7px] uppercase tracking-[0.14em]" style={{ color: accent }}>
            {order.code}
          </p>
        </div>

        <div className="flex-1 min-w-0 hidden lg:flex items-center justify-center text-center">
          {order.customer?.name ? (
            <p className="text-[10px] truncate" style={{ color: "var(--td-text-md)" }}>
              {order.customer.name}
            </p>
          ) : (
            <div className="w-full flex items-center justify-center">
              <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--td-text-lo)" }}>
                Sin cliente
              </span>
            </div>
          )}
        </div>

        <div className="w-[150px] flex-shrink-0 hidden lg:flex items-center">
          <div className="flex items-center gap-1 text-[9px] font-bold truncate" style={{ color: "var(--td-text-lo)" }} title={order.user?.name || "Sin cajero"}>
            <UserIcon size={9} />
            <span className="truncate" style={{ color: "var(--td-text-md)" }}>{order.user?.name || "—"}</span>
          </div>
        </div>

        <span className={`w-[104px] text-center text-[9px] font-black uppercase tracking-[0.12em] px-2.5 py-1 rounded-full border flex-shrink-0 ${methodBg(paymentName)}`}>
          {paymentName}
        </span>

        <div className="flex-shrink-0 text-center w-[52px] hidden sm:block">
          <p className="text-xs font-bold" style={{ color: "var(--td-text-md)" }}>{itemCount}</p>
          <p className="text-[7px] uppercase" style={{ color: "var(--td-text-lo)" }}>arts.</p>
        </div>

        <div className="w-[92px] flex-shrink-0 text-right">
          <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{fmt(cobrado)}</p>
          <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: accent }}>
            {isLiq ? "liquidación" : "anticipo"}
          </p>
        </div>
      </button>

      {open && (
        <div className="px-5 py-4 space-y-2" style={{ borderTop: `1px solid ${accent}33`, background: "rgba(0,0,0,0.15)" }}>
          {items.length === 0 && (
            <p className="text-[10px] text-center py-3" style={{ color: "var(--td-text-lo)" }}>Sin detalle de artículos</p>
          )}
          {items.map(it => (
            <div key={it.id} className="flex items-center gap-3 py-2 last:border-0" style={{ borderBottom: "1px solid var(--td-panel-border)" }}>
              <ProductThumb
                {...(it.catalog?.image_path ? { src: storageUrl(it.catalog.image_path) } : {})}
                {...(it.catalog?.product_name ? { name: it.catalog.product_name } : {})}
                size={44}
                rounded="rounded-xl"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: "var(--td-text-hi)" }}>
                  {it.catalog?.product_name ?? `Producto #${it.product_id ?? "?"}`}
                </p>
              </div>
              <div className="flex items-center gap-5 flex-shrink-0 text-right">
                <div className="text-center">
                  <p className="text-xs font-black" style={{ color: "var(--td-text-md)" }}>×{it.quantity}</p>
                  <p className="text-[8px] uppercase" style={{ color: "var(--td-text-lo)" }}>cant.</p>
                </div>
                <div className="text-right w-[58px]">
                  <p className="text-xs font-bold" style={{ color: "var(--td-text-md)" }}>{fmt(it.unit_price)}</p>
                  <p className="text-[8px] uppercase" style={{ color: "var(--td-text-lo)" }}>unit.</p>
                </div>
                <div className="text-right w-[70px]">
                  <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{fmt(it.unit_price * it.quantity)}</p>
                  <p className="text-[8px] uppercase" style={{ color: "var(--td-text-lo)" }}>subtotal</p>
                </div>
              </div>
            </div>
          ))}

          {/* Desglose total / cobrado / saldo del folio */}
          <div className="mt-2 pt-2 space-y-1" style={{ borderTop: `1px dashed ${accent}40` }}>
            <div className="flex justify-between text-[10px]">
              <span style={{ color: "var(--td-text-lo)" }}>Total del folio</span>
              <span className="font-bold" style={{ color: "var(--td-text-md)" }}>{fmt(order.total ?? 0)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span style={{ color: "var(--td-text-lo)" }}>{isLiq ? "Pagado (acumulado)" : "Anticipo pagado"}</span>
              <span className="font-black" style={{ color: "#10b981" }}>{fmt(cobrado)}</span>
            </div>
            {(order.balance ?? 0) > 0.01 && (
              <div className="flex justify-between text-[10px]">
                <span style={{ color: "var(--td-text-lo)" }}>Saldo pendiente</span>
                <span className="font-black" style={{ color: "#f59e0b" }}>{fmt(order.balance ?? 0)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reporte del Día (Lectura X) ──────────────────────────────────────────────
// Resumen ejecutivo + desglose por método + preventas + caja para gerente/admin.
// Reutiliza data ya cargada por SalesPage; no hace queries propias.

// IVA sobre la comisión de terminal. En México la terminal cobra IVA (16%) sobre
// su comisión; el gerente lo resta en su corte semanal para obtener la venta real
// que le queda a la tienda. La tienda absorbe comisión + IVA (no se cobra al cliente).
// Tasa DEFAULT — editable desde el header del Reporte del Día (Joel
// 2026-06-11); se persiste en localStorage por dispositivo.
const DEFAULT_IVA_COMISION_PCT = 16;
const IVA_PCT_STORAGE_KEY = "tadaima:iva-comision-pct";

function loadIvaComisionPct(): number {
  // OJO: Number(null) === 0 — sin nada guardado el viejo código arrancaba la
  // variable en 0 en vez del default 16 (Joel 2026-06-12). Un 0 guardado
  // tampoco se respeta: el 0 es ajuste de sesión (input vacío) y al recargar
  // se vuelve al default.
  const raw = localStorage.getItem(IVA_PCT_STORAGE_KEY);
  if (raw === null || raw.trim() === "") return DEFAULT_IVA_COMISION_PCT;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 && v <= 100 ? v : DEFAULT_IVA_COMISION_PCT;
}

// Fila de producto en el corte del gerente (tablas 1,2,4,5). Costo/utilidad
// gateados por canViewCost; `tieneCosto` indica si hubo costo registrado.
interface CorteProdRow {
  key: string; name: string; fecha: string; // fecha YYYY-MM-DD (zona negocio)
  /** Precio unitario de la línea — el mismo producto a precios distintos sale
   * en renglones separados: cant × precio = venta (Joel 2026-06-12). */
  precioUnit: number;
  cantidad: number; venta: number; costo: number; tieneCosto: boolean;
  /** Comisión de terminal repartida a esta línea (solo tabla Tarjeta).
   * Viene del snapshot commission_amount de cada venta — cada terminal puede
   * tener % distinto, por eso se calcula POR FILA y no con un % global. */
  comision: number;
}
// Apartados con costo + fórmulas del Excel (Joel 2026-06-12): Venta = precio
// total apartado, Resta = Venta − Abono (por liquidar), Utilidad esperada =
// Venta − Costo (se realiza al liquidar). Costo del snapshot ADR-015.
interface CorteAbonoRow { key: string; name: string; fecha: string; cantidad: number; venta: number; abono: number; costo: number; tieneCosto: boolean }
interface CorteTotal { cantidad: number; venta: number; costo: number; comision: number }
interface CorteAbonoTotal { cantidad: number; venta: number; abono: number; costo: number }
interface ManagerCorte {
  ventasNormales: { rows: CorteProdRow[]; total: CorteTotal };
  ventasTarjeta:  { rows: CorteProdRow[]; total: CorteTotal };
  abonos:         { rows: CorteAbonoRow[]; total: CorteAbonoTotal };
  liquidacion:    { rows: CorteProdRow[]; total: CorteTotal };
  vencidas:       { rows: CorteProdRow[]; total: CorteTotal };
}

interface DailyReport {
  corte: ManagerCorte;
  subtotal: number; descuento: number; ventasNetas: number;
  comisionTotal: number; ivaComisionTotal: number; netoDespuesComision: number;
  ticketsCount: number; promedio: number;
  methodsRows: Array<{ name: string; count: number; amount: number; commission: number; iva: number }>;
  tipoCambio: number | null;
  anticiposCobrados: number; anticiposCount: number;
  liquidaciones: number; liquidadasCount: number;
  totalPreventas: number;
  anticiposRows: Array<{ code: string; cliente: string; cantidad: number; anticipo: number }>;
  liquidacionesRows: Array<{ code: string; cliente: string; cantidad: number; venta: number; costo: number; utilidad: number; tieneCosto: boolean }>;
  liqVentaTotal: number; liqCostoTotal: number; liqUtilidadTotal: number;
  apertura: number; entradas: number; salidas: number;
  esperado: number; declarado: number; descuadre: number;
  sesionesAbiertas: number; sesionesCerradas: number; sessionsCount: number;
  topProductsRows: Array<{ product_id: string; name: string; sku: string; units: number; revenue: number; tickets: number }>;
  cashierRows: Array<{ user_id: number; name: string; tickets: number; revenue: number; commission: number; iva: number; descuadre: number; hasOpenSession: boolean }>;
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

// Sub-tabs del corte del gerente (Joel 2026-06-12): Efectivo+Tarjeta se
// fusionaron en "Ventas" (2 columnas lado a lado) y Apartados+Liquidaciones
// en "Preventas". El print/PDF/Excel siguen emitiendo las 5 tablas.
type CorteTab = "ventas" | "preventas" | "vencidas";
const CORTE_TABS: Array<{ id: CorteTab; label: string }> = [
  { id: "ventas",    label: "Ventas" },
  { id: "preventas", label: "Preventas" },
  { id: "vencidas",  label: "Preventa vencidas" },
];

function ReporteDelDia({
  report, fromDate, toDate, storeName, isAdmin, ivaPct, onIvaPctChange,
}: {
  report: DailyReport;
  fromDate: string;
  toDate: string;
  storeName: string;
  /** Reservado para futuras queries por tienda; no se usa en el corte. */
  storeId?: number | null;
  /** Solo admin ve columnas Costo/Utilidad (backend gate de cost). */
  isAdmin: boolean;
  /** % de IVA sobre la comisión de terminal — editable aquí, persiste por
   * dispositivo. Recalcula footer de Tarjeta y todo el reporte al vuelo. */
  ivaPct: number;
  onIvaPctChange: (pct: number) => void;
}) {
  const isSameDay = fromDate === toDate;
  const periodLabel = isSameDay
    ? new Date(fromDate + "T12:00").toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    : `${fromDate} → ${toDate}`;

  const [corteTab, setCorteTab] = useState<CorteTab>("ventas");

  // Texto del input de IVA — string local para poder BORRARLO sin que el 0
  // controlado se re-inserte y pelee (Joel 2026-06-12). Vacío = 0 en la
  // sesión (placeholder lo indica); el default real de la variable es 16.
  const [ivaInput, setIvaInput] = useState<string>(ivaPct > 0 ? String(ivaPct) : "");

  const handlePrint = () => printDailyReport(report, fromDate, toDate, storeName, isAdmin);
  const handlePdf   = () => exportDailyReportPdf(report, fromDate, toDate, storeName, isAdmin);
  const handleExcel = () => { void exportDailyReportXlsx(report, fromDate, toDate, storeName, isAdmin); };

  return (
    <div id="reporte-dia-print" className="space-y-4">
      {/* Sub-tabs (chips) + control de IVA s/comisión (derecha). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {CORTE_TABS.map(t => {
            const active = corteTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setCorteTab(t.id)}
                className="px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02]"
                style={active
                  ? { background: "linear-gradient(135deg, #CC2200, #FF4422)", border: "1px solid rgba(255,120,90,0.3)", color: "#fff" }
                  : { background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", color: "var(--td-text-md)" }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* IVA sobre la comisión de terminal — Joel 2026-06-11: visible y
            editable (el SAT lo puede cambiar / hay terminales sin IVA).
            Es el impuesto sobre la comisión, NO el % de comisión. */}
        <label className="flex items-center gap-2 rounded-full px-3 h-[34px] cursor-text"
          title="IVA que la terminal cobra sobre su comisión. Aplica a todas las terminales por igual."
          style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap" style={{ color: "#F59E0B" }}>
            IVA s/comisión
          </span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            placeholder="0"
            value={ivaInput}
            onChange={e => {
              const raw = e.target.value;
              setIvaInput(raw);
              const v = raw.trim() === "" ? 0 : Number(raw);
              onIvaPctChange(Number.isFinite(v) ? v : 0);
            }}
            className="w-12 bg-transparent text-right outline-none text-xs font-black tabular-nums"
            style={{ color: "var(--td-text-hi)" }}
          />
          <span className="text-xs font-black" style={{ color: "var(--td-text-lo)" }}>%</span>
        </label>
      </div>

      {/* Vista activa según el sub-tab. Las vistas fusionadas pintan DOS
          tablas lado a lado (apiladas en pantallas angostas), cada una con
          su título centrado, scroll interno y total sticky al fondo. */}
      {corteTab === "ventas" && (
        <CorteDuo
          left={
            <CorteProdTable
              title="Efectivo"
              rows={report.corte.ventasNormales.rows}
              total={report.corte.ventasNormales.total}
              isAdmin={isAdmin}
              centered
            />
          }
          right={
            <CorteProdTable
              title="Tarjeta"
              rows={report.corte.ventasTarjeta.rows}
              total={report.corte.ventasTarjeta.total}
              isAdmin={isAdmin}
              centered
              showComision
              ivaPct={ivaPct}
            />
          }
        />
      )}
      {corteTab === "preventas" && (
        <CorteDuo
          left={
            <CorteAbonoTable
              title="1 · Apartados"
              rows={report.corte.abonos.rows}
              total={report.corte.abonos.total}
              isAdmin={isAdmin}
              centered
            />
          }
          right={
            <CorteProdTable
              title="2 · Liquidaciones"
              rows={report.corte.liquidacion.rows}
              total={report.corte.liquidacion.total}
              isAdmin={isAdmin}
              centered
            />
          }
        />
      )}
      {corteTab === "vencidas" && (
        <CorteProdTable
          title="Preventa vencidas"
          rows={report.corte.vencidas.rows}
          total={report.corte.vencidas.total}
          isAdmin={isAdmin}
        />
      )}

      {/* Desc del reporte + acciones — abajo (Joel 2026-06-12): primero las
          tablas, al final imprimir/exportar. */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t" style={{ borderColor: "var(--td-panel-border)" }}>
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
            onClick={handleExcel}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02]"
            style={{ background: "var(--td-panel-bg)", border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e" }}
            title="Descargar el reporte en Excel (.xlsx)"
          >
            <FileSpreadsheet size={12} /> Excel
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
    </div>
  );
}

// Altura FIJA de los paneles del corte: lo que quede de viewport tras header
// de página + tab bar + filtros + sub-tabs (~430px), con piso de 320px para
// laptops chicas. CSS puro — no hace falta medir con JS. Fija (no max) para
// que las 2 columnas (Efectivo|Tarjeta, Apartados|Liquidaciones) midan SIEMPRE
// lo mismo y el Total quede anclado al fondo parejo (Joel 2026-06-12).
const CORTE_TABLE_MAX_H = "max(320px, calc(100vh - 430px))";
// thead/tfoot sticky necesitan fondo SÓLIDO (el var es translúcido y las
// filas se transparentaban al pasar por debajo).
const CORTE_STICKY_BG = "var(--td-popup-bg)";

// Tabla de corte por producto (Efectivo/Tarjeta/Liquidaciones/Vencidas).
// Costo/Utilidad solo admin. Scroll interno + header y Total sticky (el
// total siempre visible aunque la lista sea larga — Joel 2026-06-12).
function CorteProdTable({
  title, rows, total, isAdmin, centered = false, showComision = false, ivaPct = DEFAULT_IVA_COMISION_PCT,
}: {
  title: string;
  rows: CorteProdRow[];
  total: CorteTotal;
  isAdmin: boolean;
  /** Título centrado — para las vistas fusionadas de 2 columnas. */
  centered?: boolean;
  /** Solo tabla Tarjeta: columna Comisión por fila (cada terminal puede
   * tener % distinto — el monto viene repartido del snapshot por venta). */
  showComision?: boolean;
  /** % de IVA sobre comisión (editable en el header del Reporte). */
  ivaPct?: number;
}) {
  // ── Fórmulas (espejo del Excel de corte del gerente) ──────────────────────
  // Efectivo:  Utilidad = Venta − Costo
  // Tarjeta:   Comisión = Venta × % terminal (snapshot por venta)
  //            IVA = Comisión × ivaPct (general, editable en el header)
  //            Venta real = Venta − Comisión − IVA
  //            Utilidad = Venta real − Costo
  const ivaRate = ivaPct / 100;
  const ivaComisionTotal = total.comision * ivaRate;
  const ventaRealTotal = total.venta - total.comision - ivaComisionTotal;
  const utilidad = (showComision ? ventaRealTotal : total.venta) - total.costo;
  // "Sin costo" = costo null O costo $0 guardado: en ambos casos la utilidad
  // sale inflada (venta completa) — el producto necesita captura de costo.
  const sinCostoCount = rows.filter(r => !r.tieneCosto || r.costo <= 0).length;
  const formulaLabel = showComision
    ? `Comisión = Venta × % terminal · IVA = Comisión × ${fmtPct(ivaPct)} · Venta real = Venta − Comisión − IVA · Utilidad = Venta real − Costo`
    : "Utilidad = Venta − Costo";
  // Mismo colgroup en la tabla del body y la del footer (table-layout fixed)
  // → columnas perfectamente alineadas aunque sean dos <table> separadas.
  const colGroup = (
    <colgroup>
      <col style={{ width: 92 }} />
      <col />
      <col style={{ width: 64 }} />
      <col style={{ width: 104 }} />
      <col style={{ width: 112 }} />
      {showComision && <col style={{ width: 104 }} />}
      {showComision && <col style={{ width: 88 }} />}
      {showComision && <col style={{ width: 112 }} />}
      {isAdmin && <col style={{ width: 168 }} />}
      {isAdmin && <col style={{ width: 112 }} />}
    </colgroup>
  );
  return (
    <ReportSection title={title} subtitle={formulaLabel} centered={centered}>
      {/* Panel de ALTURA FIJA (flex column): el body scrollea en medio y el
          Total vive en una banda aparte anclada al fondo — las 2 columnas de
          la vista fusionada siempre terminan parejas. */}
      <div className="flex flex-col rounded-xl overflow-hidden" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", height: CORTE_TABLE_MAX_H }}>
        {rows.length === 0 ? (
          <p className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--td-text-lo)" }}>Sin movimientos en el periodo.</p>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
              {colGroup}
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)", position: "sticky", top: 0, zIndex: 1, background: CORTE_STICKY_BG }}>
                  <th className="text-left py-2.5 px-3">Fecha</th>
                  <th className="text-left py-2.5 px-3">Producto</th>
                  <th className="text-right py-2.5 px-3">Cant.</th>
                  <th className="text-right py-2.5 px-3">P. Unit</th>
                  <th className="text-right py-2.5 px-3">Venta</th>
                  {showComision && <th className="text-right py-2.5 px-3" style={{ color: "#F59E0B" }}>Comisión</th>}
                  {showComision && <th className="text-right py-2.5 px-3" style={{ color: "#F59E0B" }}>IVA {fmtPct(ivaPct)}</th>}
                  {showComision && <th className="text-right py-2.5 px-3">Venta real</th>}
                  {isAdmin && <th className="text-right py-2.5 px-3">Costo</th>}
                  {isAdmin && <th className="text-right py-2.5 px-3">Utilidad</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  // Tarjeta: utilidad sobre la venta REAL (− comisión − IVA),
                  // como el Excel del gerente. Efectivo: venta − costo.
                  const ivaRow = r.comision * ivaRate;
                  const ventaReal = r.venta - r.comision - ivaRow;
                  const util = (showComision ? ventaReal : r.venta) - r.costo;
                  return (
                    <tr key={r.key} className="border-t" style={{ borderColor: "var(--td-divider)" }}>
                      <td className="py-2.5 px-3 whitespace-nowrap tabular-nums text-xs" style={{ color: "var(--td-text-lo)" }}>{fmtDate(r.fecha)}</td>
                      <td className="py-2.5 px-3 font-bold truncate" style={{ color: "var(--td-text-hi)" }} title={r.name}>{r.name}</td>
                      {/* Desglose por detalle: cant × precio unit = venta. */}
                      <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: "var(--td-text-md)" }}>{r.cantidad}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: "var(--td-text-md)" }}>{fmt(r.precioUnit)}</td>
                      <td className="py-2.5 px-3 text-right font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>{fmt(r.venta)}</td>
                      {showComision && (
                        <td className="py-2.5 px-3 text-right tabular-nums font-bold whitespace-nowrap" style={{ color: "#F59E0B" }}>
                          {/* % efectivo de la fila (comisión/venta): cada terminal
                              tiene su % (ej. Banorte 6% vs otra 16%) y así se VE
                              cuál se aplicó, no solo el monto. */}
                          −{fmt(r.comision)}
                          {r.venta > 0 && r.comision > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[8px] font-black align-middle"
                              style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)" }}>
                              {fmtPct((r.comision / r.venta) * 100)}
                            </span>
                          )}
                        </td>
                      )}
                      {showComision && (
                        <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: "#F59E0B" }}>−{fmt(ivaRow)}</td>
                      )}
                      {showComision && (
                        <td className="py-2.5 px-3 text-right font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>{fmt(ventaReal)}</td>
                      )}
                      {isAdmin && (() => {
                        // Sin costo = null O $0 guardado (cubre productos creados
                        // con costo 0): número en ROJO + flag, para que se vea de
                        // inmediato que la utilidad de esa fila está inflada.
                        const sinCosto = !r.tieneCosto || r.costo <= 0;
                        return (
                          <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap"
                            style={{ color: sinCosto ? "#f87171" : "var(--td-text-md)", fontWeight: sinCosto ? 800 : undefined }}>
                            {sinCosto ? (
                              <span className="inline-flex items-center gap-1.5">
                                {fmt(r.tieneCosto ? r.costo : 0)}
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider" style={{ background: "rgba(220,38,38,0.15)", color: "#f87171", border: "1px solid rgba(220,38,38,0.3)" }}>sin costo</span>
                              </span>
                            ) : fmt(r.costo)}
                          </td>
                        );
                      })()}
                      {isAdmin && <td className="py-2.5 px-3 text-right font-bold tabular-nums" style={{ color: util >= 0 ? "#10b981" : "#DC2626" }}>{fmt(util)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* Footer Total — banda fija al fondo del panel, fuera del scroll. */}
        <div className="shrink-0 border-t-2" style={{ borderColor: "var(--td-panel-border)", background: CORTE_STICKY_BG }}>
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            {colGroup}
            <tbody>
              <tr>
                <td className="py-2.5 px-3" />
                <td className="py-2.5 px-3 text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-hi)" }}>Total</td>
                <td className="py-2.5 px-3 text-right font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>{total.cantidad}</td>
                <td className="py-2.5 px-3" />
                <td className="py-2.5 px-3 text-right font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>{fmt(total.venta)}</td>
                {showComision && (
                  <td className="py-2.5 px-3 text-right font-black tabular-nums whitespace-nowrap" style={{ color: "#F59E0B" }}>
                    −{fmt(total.comision)}
                    {total.venta > 0 && total.comision > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded text-[8px] font-black align-middle"
                        style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)" }}>
                        {fmtPct((total.comision / total.venta) * 100)}
                      </span>
                    )}
                  </td>
                )}
                {showComision && (
                  <td className="py-2.5 px-3 text-right font-black tabular-nums" style={{ color: "#F59E0B" }}>−{fmt(ivaComisionTotal)}</td>
                )}
                {showComision && (
                  <td className="py-2.5 px-3 text-right font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>{fmt(ventaRealTotal)}</td>
                )}
                {isAdmin && (
                  <td className="py-2.5 px-3 text-right font-black tabular-nums whitespace-nowrap" style={{ color: "var(--td-text-hi)" }}>
                    {fmt(total.costo)}
                    {sinCostoCount > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider align-middle" style={{ background: "rgba(220,38,38,0.15)", color: "#f87171", border: "1px solid rgba(220,38,38,0.3)" }}>{sinCostoCount} sin costo</span>
                    )}
                  </td>
                )}
                {isAdmin && <td className="py-2.5 px-3 text-right font-black tabular-nums" style={{ color: utilidad >= 0 ? "#10b981" : "#DC2626" }}>{fmt(utilidad)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Totales de comisión (solo tabla Tarjeta): suma de la columna + IVA
          16% sobre la comisión + neto real que le queda a la tienda (la
          tienda absorbe comisión e IVA, nunca el cliente). */}
      {showComision && total.comision > 0 && (
        <div className="mt-2 flex items-center justify-between flex-wrap gap-2 rounded-xl px-3 py-2.5"
          style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)" }}>
          {/* OJO copy: el 16% es el IVA que la terminal cobra SOBRE su comisión
              (impuesto fijo, igual para todas las terminales) — NO el % de
              comisión, ese varía por terminal y se ve por fila en la columna. */}
          <span className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: "#F59E0B" }}>
            Comisión terminal
          </span>
          <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--td-text-md)" }}>
            Comisiones −{fmt(total.comision)}
            <span className="mx-1.5 opacity-40">·</span>
            + IVA de la comisión ({fmtPct(ivaPct)}) −{fmt(ivaComisionTotal)}
            <span className="mx-1.5 opacity-40">·</span>
            <span style={{ color: "var(--td-text-hi)" }}>Neto a la tienda {fmt(total.venta - total.comision - ivaComisionTotal)}</span>
          </span>
        </div>
      )}
    </ReportSection>
  );
}

// Vista fusionada de 2 tablas con expand/colapso (Joel 2026-06-11): el botón
// expande una tabla a TODO el ancho empujando la otra fuera (transición de
// grid-template-columns); el botón de la expandida regresa a 2 columnas.
// En pantallas angostas (<xl) siguen apiladas y el expand no aplica.
function CorteDuo({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  const [expanded, setExpanded] = useState<"left" | "right" | null>(null);
  const cols = expanded === "left" ? "1fr 0fr" : expanded === "right" ? "0fr 1fr" : "1fr 1fr";
  const panel = (side: "left" | "right") => {
    const isExpanded = expanded === side;
    const isCollapsed = expanded !== null && !isExpanded;
    return (
      <div
        className="relative min-w-0 overflow-hidden"
        style={{ opacity: isCollapsed ? 0 : 1, transition: "opacity .35s ease" }}
        aria-hidden={isCollapsed}
      >
        <button
          onClick={() => setExpanded(isExpanded ? null : side)}
          title={isExpanded ? "Volver a 2 columnas" : "Expandir esta tabla"}
          className="absolute top-0 right-0 z-10 hidden xl:flex h-7 w-7 items-center justify-center rounded-lg transition-all hover:scale-110"
          style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", color: "var(--td-text-md)" }}
        >
          {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
        {side === "left" ? left : right}
      </div>
    );
  };
  return (
    <div
      className="grid grid-cols-1 xl:[grid-template-columns:var(--duo-cols)] items-start"
      style={{
        "--duo-cols": cols,
        gap: expanded ? 0 : 16,
        transition: "grid-template-columns .45s cubic-bezier(.4,0,.2,1), gap .45s cubic-bezier(.4,0,.2,1)",
      } as React.CSSProperties}
    >
      {panel("left")}
      {panel("right")}
    </div>
  );
}

// Tabla de abonos/apartados de preventa. Columnas: Fecha | Producto | Cant |
// Venta | Abono | Resta (+ Costo | Utilidad gateadas). Fórmulas del Excel del
// gerente (Joel 2026-06-12): Resta = Venta − Abono; Utilidad = Venta − Costo
// (se realiza al liquidar — aquí es la esperada del apartado).
function CorteAbonoTable({
  title = "Abonos preventa", rows, total, isAdmin, centered = false,
}: {
  title?: string;
  rows: CorteAbonoRow[];
  total: CorteAbonoTotal;
  /** Costo/Utilidad solo para quien puede ver costos (admin ∥ flag). */
  isAdmin: boolean;
  centered?: boolean;
}) {
  const restaTotal = total.venta - total.abono;
  const utilidadTotal = total.venta - total.costo;
  const sinCostoCount = rows.filter(r => !r.tieneCosto || r.costo <= 0).length;
  const formulaLabel = isAdmin
    ? "Resta = Venta − Abono · Utilidad (al liquidar) = Venta − Costo · Abono repartido proporcional a la venta del item"
    : "Resta = Venta − Abono · Abono repartido proporcional a la venta del item";
  const colGroup = (
    <colgroup>
      <col style={{ width: 92 }} />
      <col />
      <col style={{ width: 64 }} />
      <col style={{ width: 112 }} />
      <col style={{ width: 112 }} />
      <col style={{ width: 112 }} />
      {isAdmin && <col style={{ width: 168 }} />}
      {isAdmin && <col style={{ width: 112 }} />}
    </colgroup>
  );
  return (
    <ReportSection title={title} subtitle={formulaLabel} centered={centered}>
      {/* Panel de altura fija con footer anclado — mismo patrón que
          CorteProdTable para que las 2 columnas terminen parejas. */}
      <div className="flex flex-col rounded-xl overflow-hidden" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", height: CORTE_TABLE_MAX_H }}>
        {rows.length === 0 ? (
          <p className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--td-text-lo)" }}>Sin abonos en el periodo.</p>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
              {colGroup}
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-lo)", position: "sticky", top: 0, zIndex: 1, background: CORTE_STICKY_BG }}>
                  <th className="text-left py-2.5 px-3">Fecha</th>
                  <th className="text-left py-2.5 px-3">Producto</th>
                  <th className="text-right py-2.5 px-3">Cant.</th>
                  <th className="text-right py-2.5 px-3">Venta</th>
                  <th className="text-right py-2.5 px-3">Abono</th>
                  <th className="text-right py-2.5 px-3" style={{ color: "#F59E0B" }}>Resta</th>
                  {isAdmin && <th className="text-right py-2.5 px-3">Costo</th>}
                  {isAdmin && <th className="text-right py-2.5 px-3">Utilidad</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const resta = r.venta - r.abono;
                  const util = r.venta - r.costo;
                  const sinCosto = !r.tieneCosto || r.costo <= 0;
                  return (
                    <tr key={r.key} className="border-t" style={{ borderColor: "var(--td-divider)" }}>
                      <td className="py-2.5 px-3 whitespace-nowrap tabular-nums text-xs" style={{ color: "var(--td-text-lo)" }}>{fmtDate(r.fecha)}</td>
                      <td className="py-2.5 px-3 font-bold truncate" style={{ color: "var(--td-text-hi)" }} title={r.name}>{r.name}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: "var(--td-text-md)" }}>{r.cantidad}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: "var(--td-text-md)" }}>{fmt(r.venta)}</td>
                      <td className="py-2.5 px-3 text-right font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>{fmt(r.abono)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold" style={{ color: resta > 0.009 ? "#F59E0B" : "#10b981" }}>{fmt(resta)}</td>
                      {isAdmin && (
                        <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap"
                          style={{ color: sinCosto ? "#f87171" : "var(--td-text-md)", fontWeight: sinCosto ? 800 : undefined }}>
                          {sinCosto ? (
                            <span className="inline-flex items-center gap-1.5">
                              {fmt(r.tieneCosto ? r.costo : 0)}
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider" style={{ background: "rgba(220,38,38,0.15)", color: "#f87171", border: "1px solid rgba(220,38,38,0.3)" }}>sin costo</span>
                            </span>
                          ) : fmt(r.costo)}
                        </td>
                      )}
                      {isAdmin && <td className="py-2.5 px-3 text-right font-bold tabular-nums" style={{ color: util >= 0 ? "#10b981" : "#DC2626" }}>{fmt(util)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="shrink-0 border-t-2" style={{ borderColor: "var(--td-panel-border)", background: CORTE_STICKY_BG }}>
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            {colGroup}
            <tbody>
              <tr>
                <td className="py-2.5 px-3" />
                <td className="py-2.5 px-3 text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-hi)" }}>Total</td>
                <td className="py-2.5 px-3 text-right font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>{total.cantidad}</td>
                <td className="py-2.5 px-3 text-right font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>{fmt(total.venta)}</td>
                <td className="py-2.5 px-3 text-right font-black tabular-nums" style={{ color: "var(--td-text-hi)" }}>{fmt(total.abono)}</td>
                <td className="py-2.5 px-3 text-right font-black tabular-nums" style={{ color: restaTotal > 0.009 ? "#F59E0B" : "#10b981" }}>{fmt(restaTotal)}</td>
                {isAdmin && (
                  <td className="py-2.5 px-3 text-right font-black tabular-nums whitespace-nowrap" style={{ color: "var(--td-text-hi)" }}>
                    {fmt(total.costo)}
                    {sinCostoCount > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider align-middle" style={{ background: "rgba(220,38,38,0.15)", color: "#f87171", border: "1px solid rgba(220,38,38,0.3)" }}>{sinCostoCount} sin costo</span>
                    )}
                  </td>
                )}
                {isAdmin && <td className="py-2.5 px-3 text-right font-black tabular-nums" style={{ color: utilidadTotal >= 0 ? "#10b981" : "#DC2626" }}>{fmt(utilidadTotal)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ReportSection>
  );
}

function ReportSection({ title, subtitle, children, centered = false }: { title: string; subtitle?: string | undefined; children: React.ReactNode; centered?: boolean }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "rgba(0,0,0,0.15)", border: "1px solid var(--td-panel-border)" }}>
      <p className={`font-black uppercase tracking-widest ${subtitle ? "mb-1" : "mb-3"} ${centered ? "text-center text-[11px]" : "text-[9px]"}`} style={{ color: centered ? "var(--td-text-hi)" : "var(--td-text-lo)" }}>{title}</p>
      {subtitle && (
        // Fórmula del cálculo a la vista (Joel 2026-06-11) — para validar
        // contra el Excel de corte; luego se decide si se queda.
        <p className={`mb-3 text-[9px] font-bold tracking-wide ${centered ? "text-center" : ""}`} style={{ color: "var(--td-text-lo)" }}>{subtitle}</p>
      )}
      {children}
    </div>
  );
}

// ─── Print / PDF helpers ──────────────────────────────────────────────────────

function periodLabelOf(fromDate: string, toDate: string): string {
  return fromDate === toDate
    ? new Date(fromDate + "T12:00").toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    : `${fromDate} → ${toDate}`;
}

function printDailyReport(r: DailyReport, fromDate: string, toDate: string, storeName: string, isAdmin: boolean): void {
  const periodLabel = periodLabelOf(fromDate, toDate);
  const c = r.corte;

  // Tabla por producto (Producto | Cantidad | Venta [| Costo | Utilidad]).
  const prodTable = (title: string, rows: CorteProdRow[], total: CorteTotal): string => {
    const utilidad = total.venta - total.costo;
    const head = isAdmin
      ? "<th>Fecha</th><th>Producto</th><th class='right'>Cantidad</th><th class='right'>Venta</th><th class='right'>Costo</th><th class='right'>Utilidad</th>"
      : "<th>Fecha</th><th>Producto</th><th class='right'>Cantidad</th><th class='right'>Venta</th>";
    const body = rows.length === 0
      ? `<tr><td colspan="${isAdmin ? 6 : 4}" style="text-align:center;color:#999">Sin movimientos</td></tr>`
      : rows.map(row => {
          const util = row.venta - row.costo;
          return isAdmin
            ? `<tr><td>${fmtDate(row.fecha)}</td><td>${row.name}</td><td class='right'>${row.cantidad}</td><td class='right'>${fmt(row.venta)}</td><td class='right'>${row.tieneCosto ? fmt(row.costo) : "—"}</td><td class='right'>${row.tieneCosto ? fmt(util) : "—"}</td></tr>`
            : `<tr><td>${fmtDate(row.fecha)}</td><td>${row.name}</td><td class='right'>${row.cantidad}</td><td class='right'>${fmt(row.venta)}</td></tr>`;
        }).join("");
    const foot = isAdmin
      ? `<tr class='total'><td></td><td>Total</td><td class='right'>${total.cantidad}</td><td class='right'>${fmt(total.venta)}</td><td class='right'>${fmt(total.costo)}</td><td class='right'>${fmt(utilidad)}</td></tr>`
      : `<tr class='total'><td></td><td>Total</td><td class='right'>${total.cantidad}</td><td class='right'>${fmt(total.venta)}</td></tr>`;
    return `<h2>${title}</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table>`;
  };

  // Tabla de abonos (Fecha | Producto | Cantidad | Venta | Abono | Resta
  // [| Costo | Utilidad]) — mismas columnas/fórmulas que la pantalla.
  const abonoTable = (): string => {
    const rows = c.abonos.rows;
    const t = c.abonos.total;
    const head = isAdmin
      ? "<th>Fecha</th><th>Producto</th><th class='right'>Cantidad</th><th class='right'>Venta</th><th class='right'>Abono</th><th class='right'>Resta</th><th class='right'>Costo</th><th class='right'>Utilidad</th>"
      : "<th>Fecha</th><th>Producto</th><th class='right'>Cantidad</th><th class='right'>Venta</th><th class='right'>Abono</th><th class='right'>Resta</th>";
    const body = rows.length === 0
      ? `<tr><td colspan="${isAdmin ? 8 : 6}" style="text-align:center;color:#999">Sin abonos</td></tr>`
      : rows.map(row => {
          const base = `<td>${fmtDate(row.fecha)}</td><td>${row.name}</td><td class='right'>${row.cantidad}</td><td class='right'>${fmt(row.venta)}</td><td class='right'>${fmt(row.abono)}</td><td class='right'>${fmt(row.venta - row.abono)}</td>`;
          return isAdmin
            ? `<tr>${base}<td class='right'>${row.tieneCosto ? fmt(row.costo) : "—"}</td><td class='right'>${row.tieneCosto ? fmt(row.venta - row.costo) : "—"}</td></tr>`
            : `<tr>${base}</tr>`;
        }).join("");
    const footBase = `<td></td><td>Total</td><td class='right'>${t.cantidad}</td><td class='right'>${fmt(t.venta)}</td><td class='right'>${fmt(t.abono)}</td><td class='right'>${fmt(t.venta - t.abono)}</td>`;
    const foot = isAdmin
      ? `<tr class='total'>${footBase}<td class='right'>${fmt(t.costo)}</td><td class='right'>${fmt(t.venta - t.costo)}</td></tr>`
      : `<tr class='total'>${footBase}</tr>`;
    return `<h2>Abonos preventa</h2><table>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
      <tfoot>${foot}</tfoot>
    </table>`;
  };

  const html = `
    <html><head><title>Corte ${fromDate}</title><style>
      body { font-family: system-ui, sans-serif; padding: 24px; color: #111; max-width: 820px; margin: 0 auto; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      h2 { font-size: 12px; margin: 20px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #ccc; text-transform: uppercase; letter-spacing: 0.06em; }
      .meta { color: #666; font-size: 11px; text-transform: capitalize; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
      th, td { padding: 5px 8px; text-align: left; border-bottom: 1px solid #eee; }
      th { background: #f3f3f3; font-weight: 700; text-transform: uppercase; font-size: 9px; letter-spacing: 0.06em; }
      .right { text-align: right; }
      tr.total td { font-weight: 800; border-top: 2px solid #333; background: #fafafa; }
    </style></head><body>
      <h1>Reporte del Día — ${storeName}</h1>
      <p class="meta">${periodLabel}</p>
      ${prodTable("Ventas normales", c.ventasNormales.rows, c.ventasNormales.total)}
      ${prodTable("Ventas con tarjeta", c.ventasTarjeta.rows, c.ventasTarjeta.total)}
      ${abonoTable()}
      ${prodTable("Preventa liquidación", c.liquidacion.rows, c.liquidacion.total)}
      ${prodTable("Preventa vencidas", c.vencidas.rows, c.vencidas.total)}
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
  const periodLabel = periodLabelOf(fromDate, toDate);
  const c = r.corte;

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
  y += 4;
  doc.setTextColor(20);

  const prodTable = (title: string, rows: CorteProdRow[], total: CorteTotal): void => {
    const utilidad = total.venta - total.costo;
    const head = isAdmin
      ? [["Fecha", title, "Cantidad", "Venta", "Costo", "Utilidad"]]
      : [["Fecha", title, "Cantidad", "Venta"]];
    const body = rows.map(row => {
      const util = row.venta - row.costo;
      return isAdmin
        ? [fmtDate(row.fecha), row.name, String(row.cantidad), fmt(row.venta), row.tieneCosto ? fmt(row.costo) : "—", row.tieneCosto ? fmt(util) : "—"]
        : [fmtDate(row.fecha), row.name, String(row.cantidad), fmt(row.venta)];
    });
    const foot = isAdmin
      ? [["", "Total", String(total.cantidad), fmt(total.venta), fmt(total.costo), fmt(utilidad)]]
      : [["", "Total", String(total.cantidad), fmt(total.venta)]];
    autoTable(doc, {
      head, body, foot,
      theme: "striped",
      headStyles: { fillColor: [204, 34, 0] },
      footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
      styles: { fontSize: 9 },
      columnStyles: isAdmin
        ? { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right", fontStyle: "bold" } }
        : { 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } },
    });
  };

  prodTable("Ventas normales", c.ventasNormales.rows, c.ventasNormales.total);
  prodTable("Ventas con tarjeta", c.ventasTarjeta.rows, c.ventasTarjeta.total);

  // Apartados con Venta/Resta (+ Costo/Utilidad admin) — espejo de pantalla.
  autoTable(doc, {
    head: isAdmin
      ? [["Fecha", "Abonos preventa", "Cantidad", "Venta", "Abono", "Resta", "Costo", "Utilidad"]]
      : [["Fecha", "Abonos preventa", "Cantidad", "Venta", "Abono", "Resta"]],
    body: c.abonos.rows.map(row => {
      const base = [fmtDate(row.fecha), row.name, String(row.cantidad), fmt(row.venta), fmt(row.abono), fmt(row.venta - row.abono)];
      return isAdmin
        ? [...base, row.tieneCosto ? fmt(row.costo) : "—", row.tieneCosto ? fmt(row.venta - row.costo) : "—"]
        : base;
    }),
    foot: (() => {
      const base = ["", "Total", String(c.abonos.total.cantidad), fmt(c.abonos.total.venta), fmt(c.abonos.total.abono), fmt(c.abonos.total.venta - c.abonos.total.abono)];
      return isAdmin
        ? [[...base, fmt(c.abonos.total.costo), fmt(c.abonos.total.venta - c.abonos.total.costo)]]
        : [base];
    })(),
    theme: "striped",
    headStyles: { fillColor: [204, 34, 0] },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: "bold" },
    styles: { fontSize: 9 },
    columnStyles: isAdmin
      ? { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right", fontStyle: "bold" } }
      : { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" }, 5: { halign: "right" } },
  });

  prodTable("Preventa liquidación", c.liquidacion.rows, c.liquidacion.total);
  prodTable("Preventa vencidas", c.vencidas.rows, c.vencidas.total);

  doc.save(`reporte-${fromDate}${isSameDay ? "" : "_" + toDate}.pdf`);
}

// Export a Excel (.xlsx) — las 5 tablas del corte del gerente, una debajo de
// otra en una sola hoja, con columnas exactas y fila Total por tabla. Costo y
// Utilidad solo si isAdmin. exceljs se carga con import dinámico (bundle).
async function exportDailyReportXlsx(r: DailyReport, fromDate: string, toDate: string, storeName: string, isAdmin: boolean): Promise<void> {
  const mod = await import("exceljs");
  const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod);
  const MONEY = '"$"#,##0.00';
  const isSameDay = fromDate === toDate;
  const periodLabel = periodLabelOf(fromDate, toDate);
  const c = r.corte;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Corte del Día");
  ws.columns = [{ width: 40 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }];

  const t = ws.addRow([`Reporte del Día · ${storeName}`]);
  t.font = { bold: true, size: 14 };
  ws.addRow([periodLabel]);
  ws.addRow([]);

  type XRow = ReturnType<typeof ws.addRow>;
  const money = (row: XRow, ...cols: number[]): void => {
    cols.forEach(col => { row.getCell(col).numFmt = MONEY; });
  };
  const sectionTitle = (title: string): void => {
    const row = ws.addRow([title]);
    row.font = { bold: true, size: 12, color: { argb: "FFCC2200" } };
  };

  // Tabla por producto (Fecha | Producto | Cantidad | Venta [| Costo | Utilidad]).
  const prodTable = (title: string, rows: CorteProdRow[], total: CorteTotal): void => {
    sectionTitle(title);
    const headCells = isAdmin
      ? ["Fecha", "Producto", "Cantidad", "Venta", "Costo", "Utilidad"]
      : ["Fecha", "Producto", "Cantidad", "Venta"];
    const headRow = ws.addRow(headCells);
    headRow.font = { bold: true };
    rows.forEach(row => {
      const util = row.venta - row.costo;
      const xr = isAdmin
        ? ws.addRow([fmtDate(row.fecha), row.name, row.cantidad, row.venta, row.tieneCosto ? row.costo : 0, row.tieneCosto ? util : 0])
        : ws.addRow([fmtDate(row.fecha), row.name, row.cantidad, row.venta]);
      if (isAdmin) money(xr, 4, 5, 6); else money(xr, 4);
    });
    const utilidad = total.venta - total.costo;
    const totalRow = isAdmin
      ? ws.addRow(["", "Total", total.cantidad, total.venta, total.costo, utilidad])
      : ws.addRow(["", "Total", total.cantidad, total.venta]);
    totalRow.font = { bold: true };
    if (isAdmin) money(totalRow, 4, 5, 6); else money(totalRow, 4);
    ws.addRow([]);
  };

  prodTable("Ventas normales", c.ventasNormales.rows, c.ventasNormales.total);
  prodTable("Ventas con tarjeta", c.ventasTarjeta.rows, c.ventasTarjeta.total);

  // Tabla de abonos (Fecha | Producto | Cantidad | Venta | Abono | Resta
  // [| Costo | Utilidad]) — fórmulas del Excel: Resta = Venta − Abono,
  // Utilidad = Venta − Costo.
  sectionTitle("Abonos preventa");
  const abonoHead = isAdmin
    ? ws.addRow(["Fecha", "Producto", "Cantidad", "Venta", "Abono", "Resta", "Costo", "Utilidad"])
    : ws.addRow(["Fecha", "Producto", "Cantidad", "Venta", "Abono", "Resta"]);
  abonoHead.font = { bold: true };
  c.abonos.rows.forEach(row => {
    const resta = row.venta - row.abono;
    const xr = isAdmin
      ? ws.addRow([fmtDate(row.fecha), row.name, row.cantidad, row.venta, row.abono, resta, row.tieneCosto ? row.costo : 0, row.tieneCosto ? row.venta - row.costo : 0])
      : ws.addRow([fmtDate(row.fecha), row.name, row.cantidad, row.venta, row.abono, resta]);
    if (isAdmin) money(xr, 4, 5, 6, 7, 8); else money(xr, 4, 5, 6);
  });
  const at = c.abonos.total;
  const abonoTotal = isAdmin
    ? ws.addRow(["", "Total", at.cantidad, at.venta, at.abono, at.venta - at.abono, at.costo, at.venta - at.costo])
    : ws.addRow(["", "Total", at.cantidad, at.venta, at.abono, at.venta - at.abono]);
  abonoTotal.font = { bold: true };
  if (isAdmin) money(abonoTotal, 4, 5, 6, 7, 8); else money(abonoTotal, 4, 5, 6);
  ws.addRow([]);

  prodTable("Preventa liquidación", c.liquidacion.rows, c.liquidacion.total);
  prodTable("Preventa vencidas", c.vencidas.rows, c.vencidas.total);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reporte-${fromDate}${isSameDay ? "" : "_" + toDate}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function SalesPage() {
  const { user } = useAuth();

  const isAdmin   = user?.roles?.some(r => ["admin","super_admin","owner","dueño"].includes(r.toLowerCase())) ?? false;
  const isGerente = user?.roles?.some(r => r.toLowerCase() === "gerente") ?? false;
  const isCashier = user?.roles?.some(r => r.toLowerCase() === "cajero") ?? false;
  // Costo/Utilidad en el Reporte: admin o quien tenga el flag can_view_cost
  // (gerente con tienda lo recibe automático — decisión 2026-06-10). Mismo
  // gate que el backend usa para mandar `cost` en los payloads.
  const canViewCost = isAdmin || !!user?.can_view_cost;
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
  const effectiveStoreId: number | null = canPickStore ? selectedStoreId : (user?.store_id ?? null);

  // Default: filtro "Hoy" al primer render — Joel quiere que las ventas del
  // día sean lo primero que ven al entrar.
  // CRÍTICO: las fechas se calculan en la zona del NEGOCIO (México), no la del
  // dispositivo (ver lib/date.ts). Antes esto usaba `new Date()` del navegador;
  // una Mac/tablet en otra zona (p.ej. Tijuana UTC-7) calculaba "hoy" un día
  // antes y un rango que terminaba "ayer MX" dejaba fuera ventas hechas pasada
  // la medianoche MX — ni "7 días" las traía (quedaban en el futuro del rango).
  const localDateISO = (d: Date = new Date()) => toLocalYmd(d);
  const todayISO = () => getTodayLocal();
  const [filterStartDate, setFilterStartDate] = useState<string>(todayISO);
  const [filterEndDate, setFilterEndDate]     = useState<string>(todayISO);
  const [filterMethod, setFilterMethod]       = useState("all");
  const [filterCashierId, setFilterCashierId] = useState<number | null>(null);
  const [isMethodOpen, setIsMethodOpen]       = useState(false);
  const [activeTab, setActiveTab]             = useState<"ventas" | "productos" | "flujo" | "reporte">("ventas");
  const [searchSale, setSearchSale]           = useState("");
  const [searchProduct, setSearchProduct]     = useState("");
  // % de IVA sobre la comisión de terminal — editable en el header del
  // Reporte del Día; persiste por dispositivo (localStorage).
  const [ivaComisionPct, setIvaComisionPct]   = useState<number>(loadIvaComisionPct);
  const handleIvaPctChange = (pct: number) => {
    const clamped = Math.min(100, Math.max(0, pct));
    setIvaComisionPct(clamped);
    // 0 (input vacío) vale durante la sesión pero NO se persiste: al recargar
    // la variable regresa al default 16 (Joel 2026-06-12).
    if (clamped > 0) localStorage.setItem(IVA_PCT_STORAGE_KEY, String(clamped));
    else localStorage.removeItem(IVA_PCT_STORAGE_KEY);
  };

  // Preset date shortcuts
  const setPreset = (preset: "today" | "week" | "month") => {
    const today = getTodayLocal();
    if (preset === "today") {
      setFilterStartDate(today);
      setFilterEndDate(today);
    } else if (preset === "week") {
      setFilterStartDate(daysAgoLocal(6));
      setFilterEndDate(today);
    } else {
      setFilterStartDate(`${today.slice(0, 7)}-01`); // primer día del mes (negocio)
      setFilterEndDate(today);
    }
  };

  // Identifica el preset activo para resaltar el chip correspondiente.
  const activePreset: "today" | "week" | "month" | "custom" = useMemo(() => {
    if (!filterStartDate || !filterEndDate) return "custom";
    const today = getTodayLocal();
    const monthStart = `${today.slice(0, 7)}-01`;
    const weekStartStr = daysAgoLocal(6);
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

  // El backend clampea per_page a 100 (SalesController::index) — pedir 500
  // solo engañaba: igual llegaban 100.
  const salesParams: Record<string, unknown> = { per_page: 100 };
  if (effectiveStoreId) salesParams.store_id = effectiveStoreId;
  if (filterStartDate) salesParams.from = filterStartDate;
  if (filterEndDate)   salesParams.to   = filterEndDate;
  // Cajero queda forzado backend a su propio user_id (RBAC), pero le mandamos
  // el filtro explícito para que el caching de RQ no mezcle con datos viejos.
  if (isCashier && user?.id) salesParams.user_id = user.id;
  else if (filterCashierId)   salesParams.user_id = filterCashierId;

  // Incluimos delivered+expired (además de pending/ready) para alimentar las
  // tablas "Preventa liquidación" y "Preventa vencidas" del Reporte del Día.
  // `filteredPreSales` y `todayRevenue` re-filtran a pending/ready client-side,
  // así que ampliar aquí NO afecta esos cálculos ni la lista de ventas.
  const preSaleOrdersParams: Record<string, unknown> = { per_page: 500, status: 'pending,ready,delivered,expired' };
  if (effectiveStoreId) preSaleOrdersParams.store_id = effectiveStoreId;
  if (filterStartDate) preSaleOrdersParams.from = filterStartDate;
  if (filterEndDate)   preSaleOrdersParams.to   = filterEndDate;

  // Polling casi-live (Joel 2026-06-12): SOLO mientras esta pantalla está
  // montada y la tab enfocada — admin/gerente ven ventas/folios hechos en
  // OTRAS máquinas sin tocar nada. El cajero no lo necesita: sus movimientos
  // ya aparecen al instante por la escritura optimista del checkout.
  const LIVE_POLL_MS = 20_000;
  const livePoll = { refetchIntervalMs: isCashier ? (false as const) : LIVE_POLL_MS };
  const salesQuery = useSalesQuery(salesParams as Parameters<typeof useSalesQuery>[0], livePoll);
  const preSaleOrdersQuery = usePreSaleOrdersQuery(preSaleOrdersParams as Parameters<typeof usePreSaleOrdersQuery>[0], livePoll);
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
  // productsQuery NO bloquea la tabla: solo alimenta productMap (thumbnails);
  // mientras carga, las filas salen sin imagen y se rellenan al llegar. Antes
  // el catálogo completo (query pesada) retenía toda la lista de ventas.
  const isFirstLoad =
    salesQuery.isPending || preSaleOrdersQuery.isPending;
  const salesHasData       = (salesQuery.data?.data?.length ?? 0) > 0;
  const preSalesHasData    = (preSaleOrdersQuery.data?.data?.length ?? 0) > 0;
  const isFreshFilterFetch =
    (salesQuery.isFetching       && !salesHasData) ||
    (preSaleOrdersQuery.isFetching && !preSalesHasData);
  const loading = isFirstLoad || isFreshFilterFetch;

  useEffect(() => {
    // Con el polling de 20s, un refetch de fondo que falla una sola vez
    // (red, sleep de la laptop, timeout de Cloud Run) deja `error` seteado
    // aunque la data anterior siga en pantalla — eso NO amerita toast (y se
    // repetiría en cada poll fallido). Solo avisamos cuando la falla deja a
    // la pantalla sin datos que mostrar.
    const failures: Array<[string, unknown]> = [
      ["ventas", salesQuery.isError && !salesQuery.data ? salesQuery.error : null],
      ["preventas", preSaleOrdersQuery.isError && !preSaleOrdersQuery.data ? preSaleOrdersQuery.error : null],
      ["productos", productsQuery.isError && !productsQuery.data ? productsQuery.error : null],
    ];
    const failed = failures.filter(([, e]) => e != null);
    if (failed.length === 0) return;
    const detail = (failed[0]?.[1] as { message?: string } | null)?.message;
    const which = failed.map(([name]) => name).join(", ");
    toast.error(`Error al cargar ${which}${detail ? `: ${detail}` : ""}`);
  }, [
    salesQuery.isError, salesQuery.error, salesQuery.data,
    preSaleOrdersQuery.isError, preSaleOrdersQuery.error, preSaleOrdersQuery.data,
    productsQuery.isError, productsQuery.error, productsQuery.data,
  ]);

  const handleReturn = async (saleId: number) => {
    try {
      await returnSale(saleId);
      // La devolución regresa el stock (InventoryMovement 'devolucion') —
      // invalidación central: catálogo de Caja, Existencias, historial,
      // lista de ventas y dashboards (bug QA 2026-06-11).
      invalidateAfterSale(queryClient);
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
    const ivaRate = ivaComisionPct / 100;
    // A) Resumen ejecutivo
    const subtotal     = filteredSales.reduce((a, s) => a + (s.subtotal ?? s.total), 0);
    const descuento    = filteredSales.reduce((a, s) => a + (s.discount ?? 0), 0);
    const ventasNetas  = filteredSales.reduce((a, s) => a + s.total, 0);
    const comisionTotal = filteredSales.reduce((a, s) => a + (s.commission_amount ?? 0), 0);
    const ivaComisionTotal = comisionTotal * ivaRate;
    const netoDespuesComision = ventasNetas - comisionTotal - ivaComisionTotal;
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
      .map(([name, b]) => ({ name, ...b, iva: b.commission * ivaRate }))
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

    // Detalle por folio (tablas como el corte del gerente). Utilidad REAL =
    // venta − costo (cost snapshot ADR-015, admin-gated). cantidad = suma de items.
    const qtyOf = (p: PreSaleOrder): number => (p.items ?? []).reduce((a, it) => a + (it.quantity ?? 0), 0);
    const anticiposRows = filteredPreSales
      .filter(p => p.status === "pending" || p.status === "ready")
      .map(p => ({
        code: p.code,
        cliente: p.customer?.name ?? "—",
        cantidad: qtyOf(p),
        anticipo: p.paid_amount ?? 0,
      }));
    const liquidacionesRows = filteredPreSales
      .filter(p => p.status === "delivered")
      .map(p => {
        const items = p.items ?? [];
        const venta = p.total ?? 0;
        let costo = 0;
        let tieneCosto = false;
        items.forEach(it => {
          if (it.cost != null) { costo += it.cost * (it.quantity ?? 0); tieneCosto = true; }
        });
        return {
          code: p.code,
          cliente: p.customer?.name ?? "—",
          cantidad: qtyOf(p),
          venta,
          costo,
          utilidad: venta - costo,
          tieneCosto,
        };
      });
    const liqVentaTotal = liquidacionesRows.reduce((a, r) => a + r.venta, 0);
    const liqCostoTotal = liquidacionesRows.reduce((a, r) => a + r.costo, 0);
    const liqUtilidadTotal = liqVentaTotal - liqCostoTotal;

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
      tickets: number; revenue: number; commission: number; iva: number;
      descuadre: number; hasOpenSession: boolean;
    };
    const cashierMap = new Map<number, CashierRow>();
    filteredSales.forEach(s => {
      if (s.user_id == null) return;
      const row = cashierMap.get(s.user_id) ?? {
        user_id: s.user_id,
        name: s.user?.name ?? `Usuario #${s.user_id}`,
        tickets: 0, revenue: 0, commission: 0, iva: 0, descuadre: 0, hasOpenSession: false,
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
      .map(r => ({ ...r, iva: r.commission * ivaRate }))
      .sort((a, b) => b.revenue - a.revenue);

    // H) Cancelaciones (ADR-016 Fase 1) — solo visibilidad por ahora.
    // Lee `sales.status='returned'` y `pre_sale_orders.status='cancelled'`
    // (campos ya existentes). Fase 2 traerá motivo + items + tabla detallada.
    const ventasCanceladas    = filteredSales.filter(s => s.status === "returned");
    const preventasCanceladas = filteredPreSales.filter(p => p.status === "cancelled");
    const cancelacionesCount  = ventasCanceladas.length + preventasCanceladas.length;
    // Monto reversado real: `cancelled_amount` del log ADR-016 (la venta
    // editada in-place queda en total=0, sumar s.total daba siempre $0).
    // Incluye también las cancelaciones PARCIALES de ventas activas.
    const montoVentasCanceladas    = filteredSales.reduce((a, s) => a + (s.cancelled_amount ?? 0), 0);
    const montoPreventasCanceladas = preventasCanceladas.reduce((a, p) => a + (p.paid_amount ?? 0), 0);
    const montoCanceladoTotal      = montoVentasCanceladas + montoPreventasCanceladas;
    const ventasNetasReales        = ventasNetas - montoCanceladoTotal;

    // ── CORTE DEL GERENTE (5 tablas, agrupadas por PRODUCTO) ──────────────────
    // Reemplaza el resumen ejecutivo: el gerente trabaja por producto, no por
    // ticket/folio. Cada tabla agrupa por nombre de producto y acumula.
    //
    // Tabla 1 vs 2: una venta REGULAR entera cae en "tarjeta" si ALGÚN
    // payment.payment_method.name contiene "tarjeta"/"card" (case-insensitive);
    // si no, cae en "normales". No se parte la venta entre métodos.
    const isCardSale = (s: SaleDetail): boolean =>
      (s.payments ?? []).some(p => {
        const n = (p.payment_method?.name ?? "").toLowerCase();
        return n.includes("tarjeta") || n.includes("card");
      });

    // Acumulador por producto con venta/costo/utilidad (+comisión en Tarjeta).
    type ProdCorte = {
      key: string; name: string; fecha: string; precioUnit: number;
      cantidad: number; venta: number; costo: number; tieneCosto: boolean;
      comision: number;
    };
    // Agrupamos por PRODUCTO + FECHA + PRECIO UNITARIO (Joel 2026-06-12): el
    // mismo producto vendido a precios distintos (Normal vs Socio, dañado,
    // re-precio) sale en renglones separados → cant × precio = venta, sin
    // promedios que confundan.
    //
    // withComision (tabla Tarjeta): cada terminal puede tener % de comisión
    // distinto, así que NO se aplica un % global — se reparte el snapshot
    // commission_amount de CADA venta entre sus items, proporcional a la venta
    // del item. La suma de la columna = suma real de comisiones del periodo.
    const accSaleItems = (sales: SaleDetail[], withComision = false): ProdCorte[] => {
      const map = new Map<string, ProdCorte>();
      sales.forEach(s => {
        const fecha = toLocalYmd(new Date(s.sold_at || s.created_at));
        const items = s.items ?? [];
        const saleVenta = items.reduce((a, it) => a + (it.price ?? 0) * (it.quantity ?? 0), 0);
        const saleComision = withComision ? (s.commission_amount ?? 0) : 0;
        items.forEach((it, idx) => {
          const name = it.product?.name ?? `#${it.product_id}`;
          const precioUnit = it.price ?? 0;
          const key = `${fecha}|${name}|${precioUnit}`;
          const row = map.get(key) ?? { key, name, fecha, precioUnit, cantidad: 0, venta: 0, costo: 0, tieneCosto: false, comision: 0 };
          const qty = it.quantity ?? 0;
          const itemVenta = precioUnit * qty;
          // cost: snapshot histórico (item.cost) → fallback product.cost actual.
          const unitCost = it.cost ?? it.product?.cost;
          row.cantidad += qty;
          row.venta    += itemVenta;
          // Reparto proporcional; fallback: todo al primer item si la venta es 0.
          row.comision += saleVenta > 0 ? saleComision * (itemVenta / saleVenta) : (idx === 0 ? saleComision : 0);
          if (unitCost != null) { row.costo += unitCost * qty; row.tieneCosto = true; }
          map.set(key, row);
        });
      });
      return Array.from(map.values()).sort((a, b) => b.fecha.localeCompare(a.fecha) || a.name.localeCompare(b.name) || b.venta - a.venta);
    };

    // Para preventa el item NO trae `product` ni `price`: usa catalog.product_name
    // y unit_price/subtotal (ver PreSaleOrderItem en @tadaima/api).
    const accPreSaleItems = (orders: PreSaleOrder[]): ProdCorte[] => {
      const map = new Map<string, ProdCorte>();
      orders.forEach(p => {
        const fecha = toLocalYmd(new Date(p.updated_at || p.created_at));
        (p.items ?? []).forEach(it => {
          const name = it.catalog?.product_name ?? `#${it.product_id ?? "?"}`;
          const qty = it.quantity ?? 0;
          const precioUnit = it.unit_price ?? (qty > 0 ? (it.subtotal ?? 0) / qty : 0);
          const key = `${fecha}|${name}|${precioUnit}`;
          const row = map.get(key) ?? { key, name, fecha, precioUnit, cantidad: 0, venta: 0, costo: 0, tieneCosto: false, comision: 0 };
          // Venta del item de preventa: subtotal si viene, si no unit_price*qty.
          row.venta += it.subtotal ?? ((it.unit_price ?? 0) * qty);
          row.cantidad += qty;
          if (it.cost != null) { row.costo += it.cost * qty; row.tieneCosto = true; }
          map.set(key, row);
        });
      });
      return Array.from(map.values()).sort((a, b) => b.fecha.localeCompare(a.fecha) || a.name.localeCompare(b.name) || b.venta - a.venta);
    };

    // Tablas 1 y 2: ventas regulares (excluye preventas, ya separadas).
    // Tarjeta lleva la comisión repartida por fila (withComision).
    const ventasNormalesRows = accSaleItems(filteredSales.filter(s => !isCardSale(s) && s.status !== "returned"));
    const ventasTarjetaRows  = accSaleItems(filteredSales.filter(s => isCardSale(s) && s.status !== "returned"), true);

    // Tabla 3: Abonos preventa (status pending | ready). Se agrupa por PRODUCTO.
    // Decisión sobre el reparto del `paid_amount` (anticipo) del folio:
    // el anticipo es a nivel folio, no por item. Lo repartimos proporcional a la
    // VENTA de cada item dentro del folio (item.subtotal / total del folio). Si
    // el folio no tiene venta calculable, se asigna todo al primer item. Así el
    // total de "Abono" de la tabla = suma de paid_amount de los folios.
    type AbonoRow = { key: string; name: string; fecha: string; cantidad: number; venta: number; abono: number; costo: number; tieneCosto: boolean };
    const abonoMap = new Map<string, AbonoRow>();
    filteredPreSales
      .filter(p => p.status === "pending" || p.status === "ready")
      .forEach(p => {
        const items = p.items ?? [];
        const paid = p.paid_amount ?? 0;
        const fecha = toLocalYmd(new Date(p.created_at)); // fecha del anticipo
        const totalVenta = items.reduce((a, it) => a + (it.subtotal ?? (it.unit_price ?? 0) * (it.quantity ?? 0)), 0);
        items.forEach((it, idx) => {
          const name = it.catalog?.product_name ?? `#${it.product_id ?? "?"}`;
          const key = `${fecha}|${name}`;
          const row = abonoMap.get(key) ?? { key, name, fecha, cantidad: 0, venta: 0, abono: 0, costo: 0, tieneCosto: false };
          const qty = it.quantity ?? 0;
          row.cantidad += qty;
          const itemVenta = it.subtotal ?? (it.unit_price ?? 0) * qty;
          row.venta += itemVenta;
          // Costo del snapshot ADR-015 (pre_sale_order_items.cost) — admin-gated
          // en el backend, para gerente sin flag llega null y la columna marca
          // "sin costo".
          if (it.cost != null) { row.costo += it.cost * qty; row.tieneCosto = true; }
          // Reparto proporcional; fallback: todo al primer item si no hay venta.
          row.abono += totalVenta > 0 ? paid * (itemVenta / totalVenta) : (idx === 0 ? paid : 0);
          abonoMap.set(key, row);
        });
      });
    const abonosRows = Array.from(abonoMap.values()).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.abono - a.abono);

    // Tabla 4: Preventa liquidación (status delivered). Por producto.
    // Tabla 5: Preventa vencidas (status expired). Por producto.
    // NOTA: la query de preventas hoy filtra server-side a status 'pending,ready'
    // (ver preSaleOrdersParams), así que estas dos tablas estarán vacías hasta
    // que se amplíe el fetch para incluir delivered/expired. La agregación queda
    // lista para cuando esos folios estén disponibles.
    const liquidacionRows = accPreSaleItems(preSaleOrders.filter(p => p.status === "delivered"));
    const vencidasRows     = accPreSaleItems(preSaleOrders.filter(p => p.status === "expired"));

    const sumCorte = (rows: ProdCorte[]) => ({
      cantidad: rows.reduce((a, r) => a + r.cantidad, 0),
      venta:    rows.reduce((a, r) => a + r.venta, 0),
      costo:    rows.reduce((a, r) => a + r.costo, 0),
      comision: rows.reduce((a, r) => a + r.comision, 0),
    });

    return {
      // A
      subtotal, descuento, ventasNetas, comisionTotal, ivaComisionTotal, netoDespuesComision,
      ticketsCount, promedio,
      // B
      methodsRows,
      tipoCambio: exchangeRateQuery.data ?? null,
      // C
      anticiposCobrados, anticiposCount,
      liquidaciones, liquidadasCount,
      totalPreventas,
      anticiposRows, liquidacionesRows,
      liqVentaTotal, liqCostoTotal, liqUtilidadTotal,
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
      // CORTE DEL GERENTE — 5 tablas agrupadas por producto
      corte: {
        ventasNormales:  { rows: ventasNormalesRows, total: sumCorte(ventasNormalesRows) },
        ventasTarjeta:   { rows: ventasTarjetaRows,  total: sumCorte(ventasTarjetaRows) },
        abonos:          { rows: abonosRows, total: {
          cantidad: abonosRows.reduce((a, r) => a + r.cantidad, 0),
          venta:    abonosRows.reduce((a, r) => a + r.venta, 0),
          abono:    abonosRows.reduce((a, r) => a + r.abono, 0),
          costo:    abonosRows.reduce((a, r) => a + r.costo, 0),
        } },
        liquidacion:     { rows: liquidacionRows, total: sumCorte(liquidacionRows) },
        vencidas:        { rows: vencidasRows, total: sumCorte(vencidasRows) },
      },
    };
  }, [filteredSales, filteredPreSales, preSaleOrders, cashReportQuery.data, exchangeRateQuery.data, ivaComisionPct]);

  // ── Lista de ventas ────────────────────────────────────────────────────────
  const sortedSales = useMemo(
    () => [...filteredSales].sort((a, b) =>
      new Date(b.sold_at || b.created_at).getTime() - new Date(a.sold_at || a.created_at).getTime()
    ),
    [filteredSales]
  );

  // Movimientos de preventa para mezclar en la Lista de Ventas. Solo cuando el
  // filtro de método permite preventas (mismo criterio que filteredPreSales).
  // Excluimos linked_sale_id != null (ya salen como hijas de su SaleRow).
  const preSaleMovementRows = useMemo<VentasRow[]>(() => {
    if (filterMethod !== "all" && filterMethod !== "varios") return [];
    return preSaleOrders
      .filter(p => p.linked_sale_id == null)
      .filter(p => p.status === "pending" || p.status === "ready" || p.status === "delivered")
      .map(p => {
        const movement: "anticipo" | "liquidacion" = p.status === "delivered" ? "liquidacion" : "anticipo";
        const dateStr = movement === "liquidacion" ? (p.updated_at || p.created_at) : p.created_at;
        return { kind: "presale" as const, key: `pre-${p.id}`, ts: new Date(dateStr).getTime(), order: p, movement };
      });
  }, [preSaleOrders, filterMethod]);

  // Lista unificada (ventas + anticipos + liquidaciones) ordenada por fecha desc,
  // con el buscador aplicado a ambos tipos de fila.
  const displayedRows = useMemo<VentasRow[]>(() => {
    const saleRows: VentasRow[] = sortedSales.map(s => ({
      kind: "sale" as const,
      key: `sale-${s.id}`,
      ts: new Date(s.sold_at || s.created_at).getTime(),
      sale: s,
    }));
    const merged = [...saleRows, ...preSaleMovementRows].sort((a, b) => b.ts - a.ts);
    if (!searchSale.trim()) return merged;
    const q = searchSale.toLowerCase();
    return merged.filter(row => {
      if (row.kind === "sale") {
        const s = row.sale;
        return (
          String(s.id).includes(q) ||
          (s.customer?.name || "").toLowerCase().includes(q) ||
          getPaymentMethodName(s).toLowerCase().includes(q) ||
          (s.items || []).some(i => {
            const info = productMap[String(i.product_id)];
            return (i.product?.name || info?.name || "").toLowerCase().includes(q) ||
                   (i.product?.sku  || info?.sku  || "").toLowerCase().includes(q);
          })
        );
      }
      const o = row.order;
      const movLabel = row.movement === "liquidacion" ? "liquidación" : "anticipo";
      return (
        o.code.toLowerCase().includes(q) ||
        (o.customer?.name || "").toLowerCase().includes(q) ||
        getPreSaleMethodName(o).toLowerCase().includes(q) ||
        movLabel.includes(q) ||
        (o.items ?? []).some(it => (it.catalog?.product_name || "").toLowerCase().includes(q))
      );
    });
  }, [sortedSales, preSaleMovementRows, searchSale, productMap]);

  // Stats del header del tab Ventas (incluyen movimientos de preventa).
  const displayedItemsCount = useMemo(
    () => displayedRows.reduce((a, r) =>
      a + (r.kind === "sale"
        ? (r.sale.items?.reduce((b, i) => b + i.quantity, 0) ?? 0)
        : (r.order.items ?? []).reduce((b, it) => b + (it.quantity ?? 0), 0)), 0),
    [displayedRows]
  );
  const displayedTotalReceived = useMemo(
    () => displayedRows.reduce((a, r) =>
      a + (r.kind === "sale"
        ? r.sale.total + (r.sale.pre_sale_orders ?? []).reduce((s, o) => s + (o.paid_amount ?? 0), 0)
        : (r.order.paid_amount ?? 0)), 0),
    [displayedRows]
  );

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
  // Refetch con data anterior en pantalla (keepPreviousData): la lista vieja
  // sigue visible — sin señal el cambio de fecha parecía "no funcionar".
  // Atenuamos la lista + chip "Cargando…" junto a los presets de período.
  // SOLO cuando isPlaceholderData (la data en pantalla es de OTRO filtro):
  // el polling de 20s y los refetch en background del MISMO filtro son
  // silenciosos — si no hay nada nuevo no se nota nada, y si hay, la fila
  // simplemente aparece en la lista (Joel 2026-06-12).
  const isRefreshingList =
    ((salesQuery.isFetching && salesQuery.isPlaceholderData) ||
      (preSaleOrdersQuery.isFetching && preSaleOrdersQuery.isPlaceholderData)) && !loading;
  const ventasPanelHeight = canSeeKpiRow
    ? "clamp(360px, calc(100vh - 470px), 760px)"
    : "clamp(420px, calc(100vh - 340px), 820px)";

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
      <div className="rounded-[36px] overflow-visible" style={T.glass}>

        {/* Tab bar */}
        <div className="flex flex-col gap-4 px-8 pt-7 pb-4" style={{ borderBottom: "1px solid var(--td-panel-border)" }}>
          <div className="flex items-end gap-1">
            {([
              { key: "ventas",    label: "Lista de Ventas", icon: Receipt,   count: displayedRows.length },
              // Reporte en 2ª posición (Joel 2026-06-12) — solo admin/gerente.
              ...(canSeeFinancials
                ? [{ key: "reporte" as const, label: "Reporte", icon: FileText, count: null as number | null }]
                : []),
              { key: "productos", label: "Por Producto",    icon: Package,   count: displayedProducts.length },
              ...(canSeeFinancials
                ? [{ key: "flujo" as const, label: "Flujo de Caja Semanal", icon: BarChart3, count: null as number | null }]
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

          <div className="flex flex-wrap items-center justify-end gap-2 relative z-50">
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

            <SalesDateRangePicker
              startDate={filterStartDate}
              endDate={filterEndDate}
              isActive={activePreset === "custom"}
              isFetching={salesQuery.isFetching || preSaleOrdersQuery.isFetching}
              onChange={(start, end) => {
                setFilterStartDate(start);
                setFilterEndDate(end);
              }}
            />

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

            {isRefreshingList && (
              <span
                className="flex items-center gap-1.5 h-[34px] px-3.5 rounded-full text-[10px] font-black uppercase tracking-widest"
                style={{ background: "rgba(255,170,0,0.1)", border: "1px solid rgba(255,170,0,0.3)", color: "#FFAA00" }}
              >
                <Loader2 size={12} strokeWidth={3} className="animate-spin" />
                Cargando…
              </span>
            )}
          </div>
        </div>

        <div className="p-6 space-y-4">

          {/* ══ Tab: Lista de Ventas ══ */}
          {activeTab === "ventas" && (
            <>
              <div
                className="rounded-[26px] overflow-hidden flex flex-col"
                style={{
                  height: ventasPanelHeight,
                  background: "rgba(0,0,0,0.16)",
                  border: "1px solid var(--td-panel-border)",
                }}
              >
                <div className="p-4 pb-3">
                  <div className="flex items-center gap-3 rounded-2xl px-4 py-2.5"
                    style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--td-panel-border)" }}>
                    <Receipt size={13} style={{ color: "var(--td-text-lo)" }} className="flex-shrink-0" />
                    <input value={searchSale} onChange={e => setSearchSale(e.target.value)}
                      placeholder="Buscar por No. Ticket, cliente, cajero, método de pago, producto…"
                      className="flex-1 bg-transparent outline-none text-xs"
                      style={{ color: "var(--td-text-hi)" }} />
                    {searchSale && <button onClick={() => setSearchSale("")} className="hover:opacity-70 transition-opacity" style={{ color: "var(--td-text-lo)" }}><X size={12} /></button>}
                  </div>
                </div>

                <div
                  className="flex lg:grid items-center gap-4 px-4 py-2 rounded-xl mx-4"
                  style={{
                    gridTemplateColumns: SALES_LIST_GRID_TEMPLATE,
                    color: "var(--td-text-lo)",
                    borderBottom: "1px solid var(--td-panel-border)",
                    background: "rgba(26,14,20,0.96)",
                    backdropFilter: "blur(10px)",
                    boxShadow: "0 6px 14px rgba(0,0,0,0.18)",
                  }}
                >
                  <span className="w-5 text-[9px] font-black uppercase tracking-[0.14em]">#</span>
                  <span className="w-3" />
                  <span style={{ width: 80 }} />
                  <span className="w-[115px] text-[10px] font-black uppercase tracking-[0.16em]">Fecha</span>
                  <span className="w-[108px] hidden lg:block text-[10px] font-black uppercase tracking-[0.16em] text-center">No. Ticket</span>
                  <span className="flex-1 hidden lg:block text-[10px] font-black uppercase tracking-[0.16em] text-center">Cliente</span>
                  <span className="w-[150px] hidden lg:block text-[10px] font-black uppercase tracking-[0.16em]">Cajero</span>
                  <span className="w-[104px] text-center text-[10px] font-black uppercase tracking-[0.16em]">Método pago</span>
                  <span className="w-[52px] text-center hidden sm:block text-[10px] font-black uppercase tracking-[0.16em]">Artículos</span>
                  <span className="w-[92px] text-right text-[10px] font-black uppercase tracking-[0.16em]">Total</span>
                </div>

                <div
                  className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 pr-3 transition-opacity duration-200"
                  style={{ opacity: isRefreshingList ? 0.45 : 1, pointerEvents: isRefreshingList ? "none" : "auto" }}
                >
                  <div className="space-y-1.5 pt-3">
                    {loading ? (
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
                    ) : displayedRows.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20" style={{ opacity: 0.15 }}>
                        <Receipt size={40} className="mb-3" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Sin ventas en este período</p>
                      </div>
                    ) : (
                      displayedRows.map((row, idx) => (
                        row.kind === "sale" ? (
                          <SaleRow key={row.key} sale={row.sale} productMap={productMap} rank={idx + 1} onReturn={handleReturn} />
                        ) : (
                          <PreSaleMovementRow key={row.key} order={row.order} movement={row.movement} rank={idx + 1} />
                        )
                      ))
                    )}
                  </div>
                </div>

                <div
                  className="flex items-center justify-end gap-3 px-5 py-3"
                  style={{
                    borderTop: "1px solid var(--td-panel-border)",
                    background: "rgba(22,12,17,0.96)",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <div className="flex items-end gap-8 flex-wrap justify-end ml-auto">
                    <div className="flex items-center gap-5">
                      <div className="text-right">
                        <p className="text-[8px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--td-text-lo)" }}>Movs.</p>
                        <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{displayedRows.length}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--td-text-lo)" }}>Vendidos</p>
                        <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{displayedItemsCount}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--td-text-lo)" }}>Gran total</p>
                      <p className="text-xl font-black" style={{ color: "#10B981" }}>{fmt(displayedTotalReceived)}</p>
                    </div>
                  </div>
                </div>
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
              isAdmin={canViewCost}
              ivaPct={ivaComisionPct}
              onIvaPctChange={handleIvaPctChange}
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
