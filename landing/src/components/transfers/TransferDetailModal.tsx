import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, Package, Search, X } from "lucide-react";
import { motion } from "motion/react";
import type { Transfer } from "@tadaima/api";
import { BUSINESS_TZ } from "@/lib/date";
import { filterTransferItems, summarizeTransferItems } from "@/lib/transferItems";
import { getStatusInfo } from "./transferStatus";

/** A partir de cuántos productos aparece el buscador del popup. */
const SEARCH_MIN_ITEMS = 8;

const fmtDate = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: BUSINESS_TZ,
});

interface TransferDetailModalProps {
  transfer: Transfer;
  canReceive: boolean;
  canCancel: boolean;
  busy: boolean;
  onClose: () => void;
  onReceive: () => void;
  onCancel: () => void;
}

/**
 * Detalle de un traslado (2026-10-09): la tarjeta solo enseña el primer
 * producto y "+N más"; aquí se ven todos con su cantidad, y si está pendiente
 * se puede recibir o cancelar desde el mismo popup (mismos permisos y avisos
 * que los botones de la tarjeta).
 */
export function TransferDetailModal({
  transfer, canReceive, canCancel, busy, onClose, onReceive, onCancel,
}: TransferDetailModalProps) {
  const [query, setQuery] = useState("");
  const status = getStatusInfo(transfer.status);
  const StatusIcon = status.icon;
  const summary = summarizeTransferItems(transfer.items);
  const visible = useMemo(() => filterTransferItems(transfer.items, query), [transfer.items, query]);
  const showActions = transfer.status === "pending" && (canReceive || canCancel);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-[#07070a]/80 backdrop-blur-xl"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trf-detail-title"
        initial={{ scale: 0.96, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-xl max-h-[85vh] rounded-[28px] flex flex-col overflow-hidden shadow-2xl"
        style={{
          background: "var(--td-panel-bg)",
          backdropFilter: "blur(28px) saturate(160%)",
          WebkitBackdropFilter: "blur(28px) saturate(160%)",
          border: "1px solid var(--td-panel-border)",
        }}
      >
        {/* Encabezado: número, estado, ruta y datos */}
        <div className="px-5 sm:px-6 pt-5 pb-4 space-y-4 shrink-0" style={{ borderBottom: "1px solid var(--td-divider)" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 id="trf-detail-title" className="text-xl font-black tracking-tight" style={{ color: "var(--td-text-hi)" }}>
                Traslado #{transfer.id}
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest" style={{ background: status.bg, color: status.color }}>
                <StatusIcon size={11} />
                {status.label}
              </span>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar detalle del traslado"
              className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
              style={{ color: "var(--td-text-md)", border: "1px solid var(--td-card-border)" }}
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl px-4 py-3" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
            <div className="min-w-0">
              <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Origen · manda</p>
              <p className="text-sm font-bold leading-tight break-words" style={{ color: "var(--td-text-hi)" }}>{transfer.from_warehouse?.name ?? "—"}</p>
            </div>
            <ArrowRight size={16} style={{ color: "var(--td-text-lo)" }} />
            <div className="min-w-0 text-right">
              <p className="text-[9px] font-black text-green-500 uppercase tracking-widest">Destino · recibe</p>
              <p className="text-sm font-bold leading-tight break-words" style={{ color: "var(--td-text-hi)" }}>{transfer.to_warehouse?.name ?? "—"}</p>
            </div>
          </div>

          <p className="text-[11px] font-semibold" style={{ color: "var(--td-text-lo)" }}>
            {transfer.user?.name ? `Creado por ${transfer.user.name} · ` : ""}
            {fmtDate.format(new Date(transfer.created_at))}
          </p>
          {transfer.notes && (
            <p className="text-xs rounded-xl px-3 py-2 italic" style={{ color: "var(--td-text-md)", background: "var(--td-card-bg)" }}>
              “{transfer.notes}”
            </p>
          )}
        </div>

        {/* Resumen + buscador */}
        <div className="px-5 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3 shrink-0" style={{ borderBottom: "1px solid var(--td-divider)" }}>
          <p className="text-xs font-black uppercase tracking-widest shrink-0" style={{ color: "var(--td-text-md)" }}>
            <span style={{ color: "var(--td-text-hi)" }}>{summary.skus}</span> {summary.skus === 1 ? "producto" : "productos"}
            {" · "}
            <span style={{ color: "var(--td-text-hi)" }}>{summary.pieces}</span> {summary.pieces === 1 ? "pieza" : "piezas"}
          </p>
          {summary.skus > SEARCH_MIN_ITEMS && (
            <label className="relative flex-1 min-w-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--td-text-lo)" }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar nombre o SKU…"
                aria-label="Buscar producto en el traslado"
                className="w-full h-9 pl-9 pr-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-red-500/40"
                style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-input-text)" }}
              />
            </label>
          )}
        </div>

        {/* Lista de productos */}
        <ul className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-2">
          {visible.length === 0 ? (
            <li className="py-10 text-center text-xs font-black uppercase tracking-widest" style={{ color: "var(--td-text-ghost)" }}>
              {summary.skus === 0 ? "Sin productos" : "Sin coincidencias"}
            </li>
          ) : visible.map(it => (
            <li key={it.id} className="flex items-center gap-3 px-2 py-2.5 rounded-xl transition-colors hover:bg-white/[0.04]">
              {it.product?.image_url ? (
                <img src={it.product.image_url} alt="" width={40} height={40} loading="lazy" className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
                  <Package size={16} style={{ color: "var(--td-text-lo)" }} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold leading-tight line-clamp-2" style={{ color: "var(--td-text-hi)" }}>
                  {it.product?.name ?? "Producto eliminado"}
                </p>
                {it.product?.sku && (
                  <p className="text-[10px] font-mono uppercase tracking-wide mt-0.5" style={{ color: "var(--td-text-lo)" }}>{it.product.sku}</p>
                )}
              </div>
              <span className="text-lg font-black tabular-nums shrink-0" style={{ color: "var(--td-text-hi)" }} aria-label={`${it.quantity} piezas`}>
                ×{it.quantity}
              </span>
            </li>
          ))}
        </ul>

        {/* Acciones (solo pendiente y con permiso) */}
        {showActions && (
          <div className="px-5 sm:px-6 py-4 flex justify-end gap-2 shrink-0" style={{ borderTop: "1px solid var(--td-divider)" }}>
            {canCancel && (
              <button
                onClick={onCancel}
                disabled={busy}
                className="text-[11px] font-black uppercase px-4 py-2.5 rounded-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
                style={{ background: "rgba(255,68,34,0.12)", color: "#FF4422" }}
              >
                Cancelar traslado
              </button>
            )}
            {canReceive && (
              <button
                onClick={onReceive}
                disabled={busy}
                className="inline-flex items-center gap-2 text-[11px] font-black uppercase px-5 py-2.5 rounded-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
                style={{ background: "rgba(0,204,102,0.18)", color: "#00CC66" }}
              >
                {busy && <Loader2 size={12} className="animate-spin" />}
                Recibir
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
