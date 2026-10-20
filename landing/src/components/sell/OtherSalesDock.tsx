import { useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Circle, Crown, ShoppingCart, Trash2 } from "lucide-react";

/** Resumen de cada venta en espera; Caja lo arma con el precio real de cada línea. */
export interface DockSale {
  id: string;
  name: string;
  /** Piezas en el carrito (Σ cantidades). */
  itemCount: number;
  /** Σ precio del nivel de la línea × cantidad, antes de promos y descuentos. */
  subtotal: number;
}

interface OtherSalesDockProps {
  mesas: readonly DockSale[];
  activeMesaId: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

const PRINCIPAL = "Caja Principal";
const STORAGE_KEY = "tadaima-caja-otras-ventas";
/** Con más ventas en espera que esto, las filas se hacen compactas. */
const COMPACT_AFTER = 4;

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "open");
  } catch {
    // Sin storage (incógnito estricto): solo no se recuerda.
  }
}

const piecesLabel = (n: number): string => `${n} ${n === 1 ? "artículo" : "artículos"}`;

/**
 * Atajo flotante "Otras ventas" de Caja (abajo a la izquierda, para no tapar el
 * panel de cobro). Aparece con más de una venta abierta. Antes crecía sin tope
 * hacia arriba y tapaba la pantalla (2026-10-19): ahora tiene alto máximo con
 * scroll adentro, filas compactas cuando hay muchas y se puede plegar en una
 * píldora (se recuerda por PC). Filas con productos siempre en rojo (mismo
 * contraste en claro y oscuro).
 */
export function OtherSalesDock({ mesas, activeMesaId, onSelect, onRemove }: OtherSalesDockProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  if (mesas.length <= 1) return null;

  const others = mesas.filter(m => m.id !== activeMesaId);
  const withItems = others.filter(m => m.itemCount > 0).length;
  const compact = others.length > COMPACT_AFTER;
  const ToggleIcon = collapsed ? ChevronUp : ChevronDown;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    saveCollapsed(next);
  };

  const remove = (m: DockSale, itemCount: number, subtotal: number) => {
    if (itemCount > 0) {
      const ok = window.confirm(
        `${m.name} tiene ${piecesLabel(itemCount)} ($${subtotal.toFixed(0)}).\n\n¿Cancelar la venta? Los productos se perderán.`,
      );
      if (!ok) return;
    }
    onRemove(m.id);
  };

  return (
    <>
      <style>{`
        @keyframes td-shortcut-pulse {
          0%, 100% { box-shadow: 0 0 0 rgba(224,34,26,0); }
          50%      { box-shadow: 0 0 18px rgba(224,34,26,0.55); }
        }
      `}</style>
      <div
        data-testid="other-sales-dock"
        style={{
          position: "fixed",
          bottom: 20,
          left: 20,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: 236,
          // Nunca más alto que la pantalla menos la barra de arriba de Caja.
          maxHeight: "calc(100dvh - 120px)",
          background: "var(--td-popup-bg)",
          backdropFilter: "blur(14px)",
          border: "1px solid var(--td-popup-border)",
          borderRadius: 18,
          padding: collapsed ? 6 : 10,
          boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
        }}
      >
        {/* Encabezado = botón de plegar; siempre visible aunque la lista scrollee. */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          title={collapsed ? "Mostrar las otras ventas" : "Plegar las otras ventas"}
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: collapsed ? "6px 8px" : "2px 6px 8px",
            background: "none",
            border: "none",
            borderBottom: collapsed ? "none" : "1px solid var(--td-panel-border)",
            cursor: "pointer",
            color: "inherit",
            font: "inherit",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ShoppingCart size={11} style={{ color: "var(--td-red)" }} />
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--td-red)" }}>
              Otras ventas
            </span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: "var(--td-text-ghost)" }} title="Con productos / en espera">
              {withItems}/{others.length}
            </span>
            <ToggleIcon size={13} style={{ color: "var(--td-text-lo)" }} aria-hidden />
          </span>
        </button>

        {!collapsed && (
          <div
            className="td-scroll-visible"
            // Padding: el brillo de las filas con productos y el desliz del hover
            // no se cortan contra el borde de la zona con scroll.
            style={{ display: "grid", gap: compact ? 6 : 8, minHeight: 0, overflowY: "auto", padding: "4px 6px", margin: "-4px -6px" }}
          >
            {others.map(m => {
              const { itemCount, subtotal } = m;
              const hasItems = itemCount > 0;
              const isPrincipal = m.name === PRINCIPAL;
              const Icon = isPrincipal ? Crown : ShoppingCart;
              const iconBox = compact ? 26 : 32;
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    paddingRight: isPrincipal ? 0 : 8,
                    borderRadius: 12,
                    // Activas → rojo sólido (mismo contraste en light/dark).
                    // Vacías → fondo y bordes del theme para integrarse.
                    background: hasItems ? "linear-gradient(135deg, #BB1100 0%, #FF3322 100%)" : "var(--td-input-bg)",
                    border: hasItems ? "1px solid rgba(255,120,80,0.5)" : "1px solid var(--td-input-border)",
                    color: hasItems ? "#fff" : "var(--td-text-lo)",
                    transition: "transform 0.12s ease, background 0.15s",
                    animation: hasItems ? "td-shortcut-pulse 2.6s ease-in-out infinite" : undefined,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateX(-3px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateX(0)"; }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(m.id)}
                    title={`Ir a ${m.name}${hasItems ? ` · ${piecesLabel(itemCount)} · $${subtotal.toFixed(0)}` : " · vacía"}`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: compact ? "6px 4px 6px 10px" : "10px 4px 10px 12px",
                      background: "none",
                      border: "none",
                      color: "inherit",
                      font: "inherit",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        width: iconBox,
                        height: iconBox,
                        borderRadius: 10,
                        background: hasItems ? "rgba(255,255,255,0.20)" : "var(--td-panel-bg)",
                        border: hasItems ? "none" : "1px solid var(--td-panel-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        color: hasItems ? "#fff" : "var(--td-text-ghost)",
                      }}
                    >
                      <Icon size={compact ? 13 : 15} strokeWidth={2.5} />
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, lineHeight: 1.15 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.name}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: hasItems ? "rgba(255,255,255,0.85)" : "var(--td-text-ghost)" }}>
                        {hasItems ? `${itemCount} art. · $${subtotal.toFixed(0)}` : "Vacía"}
                      </span>
                    </span>
                    {hasItems ? (
                      <ChevronRight size={14} style={{ opacity: 0.9, color: "#fff", flexShrink: 0 }} />
                    ) : (
                      <Circle size={6} fill="currentColor" style={{ opacity: 0.4, color: "var(--td-text-ghost)", flexShrink: 0 }} />
                    )}
                  </button>
                  {/* Cancelar venta — nunca en Caja Principal. Con productos pide
                      confirmación para no borrar una venta en curso por accidente. */}
                  {!isPrincipal && (
                    <button
                      type="button"
                      onClick={() => remove(m, itemCount, subtotal)}
                      title={`Cancelar ${m.name}`}
                      aria-label={`Cancelar ${m.name}`}
                      style={{
                        width: 26,
                        height: 26,
                        padding: 0,
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: hasItems ? "rgba(0,0,0,0.18)" : "transparent",
                        border: hasItems ? "1px solid rgba(255,255,255,0.18)" : "1px solid var(--td-panel-border)",
                        color: hasItems ? "rgba(255,255,255,0.85)" : "var(--td-text-ghost)",
                        cursor: "pointer",
                        flexShrink: 0,
                        transition: "background 0.12s, color 0.12s",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = "rgba(224,34,26,0.9)";
                        e.currentTarget.style.color = "#fff";
                        e.currentTarget.style.borderColor = "rgba(255,80,50,0.6)";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = hasItems ? "rgba(0,0,0,0.18)" : "transparent";
                        e.currentTarget.style.color = hasItems ? "rgba(255,255,255,0.85)" : "var(--td-text-ghost)";
                        e.currentTarget.style.borderColor = hasItems ? "rgba(255,255,255,0.18)" : "var(--td-panel-border)";
                      }}
                    >
                      <Trash2 size={12} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
