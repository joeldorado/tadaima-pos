import type { BundleComponentAvailability, BundleSource } from "@tadaima/api";
import { AMBER, CARD_BORDER, GREEN, RED_SOFT, TEXT_HI, TEXT_MD } from "@/components/promos/promoTokens";
import { pluralize } from "./bundleTokens";

interface ComponentUsageRowProps {
  component: BundleComponentAvailability;
  /** Paquetes que se van a armar / desarmar. */
  buildQty: number;
  mode: "armar" | "desarmar";
  source: BundleSource;
  onSourceChange?: (source: BundleSource) => void;
  hasBodega: boolean;
  /** true solo cuando la cantidad está en el tope y este producto es el cuello de botella. */
  limiting: boolean;
}

const SOURCE_OPTIONS: ReadonlyArray<{ key: BundleSource; label: string }> = [
  { key: "auto", label: "Automático" },
  { key: "store", label: "Exhibición" },
  { key: "bodega", label: "Bodega" },
];

interface Usage {
  fromExh: number;
  fromBod: number;
  /** Piezas que faltan con la fuente elegida (0 = alcanza). */
  missing: number;
}

/** Cuántas piezas salen de cada almacén según la fuente (misma regla que el server: Exhibición primero). */
function usageFor(needed: number, exh: number, bod: number, source: BundleSource): Usage {
  if (source === "store") return { fromExh: needed, fromBod: 0, missing: Math.max(needed - exh, 0) };
  if (source === "bodega") return { fromExh: 0, fromBod: needed, missing: Math.max(needed - bod, 0) };
  const fromExh = Math.min(needed, exh);
  const fromBod = needed - fromExh;
  return { fromExh, fromBod, missing: Math.max(fromBod - bod, 0) };
}

const n = (value: number): string => value.toLocaleString("es-MX");

function usageText(usage: Usage): string {
  if (usage.missing > 0) return `Faltan ${pluralize(usage.missing, "pieza", "piezas")}`;
  if (usage.fromExh > 0 && usage.fromBod > 0) return `Usa ${n(usage.fromExh)} de Exhibición y ${n(usage.fromBod)} de Bodega`;
  if (usage.fromBod > 0) return `Usa ${n(usage.fromBod)} de Bodega`;
  return `Usa ${n(usage.fromExh)} de Exhibición`;
}

/**
 * Renglón de un componente en Armar/Desarmar: qué es, cuánto hay en cada
 * almacén y cuántas piezas se mueven. En "armar" deja elegir de dónde salen.
 */
export function ComponentUsageRow({
  component, buildQty, mode, source, onSourceChange, hasBodega, limiting,
}: ComponentUsageRowProps) {
  const needed = component.quantity * Math.max(buildQty, 0);
  const usage = usageFor(needed, component.stock_exhibicion, component.stock_bodega, source);
  const short = mode === "armar" && usage.missing > 0;
  const line = mode === "armar" ? usageText(usage) : `Regresan ${pluralize(needed, "pieza", "piezas")}`;

  return (
    <li className="py-3" style={{ borderTop: CARD_BORDER }}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight" style={{ color: TEXT_HI }}>
            {component.name}
            <span className="font-semibold" style={{ color: TEXT_MD }}> · ×{n(component.quantity)} por paquete</span>
          </p>
          <p className="mt-0.5 text-[13px] font-semibold tabular-nums" style={{ color: TEXT_MD }}>
            Exhibición: {n(component.stock_exhibicion)} · Bodega: {n(component.stock_bodega)}
          </p>
        </div>

        {mode === "armar" && (
          <div
            role="radiogroup"
            aria-label={`De dónde se toma ${component.name}`}
            className="inline-flex shrink-0 overflow-hidden rounded-xl"
            style={{ border: CARD_BORDER }}
          >
            {SOURCE_OPTIONS.map((option, index) => {
              const active = source === option.key;
              const disabled = option.key === "bodega" && !hasBodega;
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  title={disabled ? "Esta tienda no tiene bodega" : undefined}
                  onClick={() => onSourceChange?.(option.key)}
                  className="px-3 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    height: 36,
                    background: active ? `${GREEN}1F` : "transparent",
                    color: active ? GREEN : TEXT_MD,
                    borderLeft: index > 0 ? CARD_BORDER : "none",
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-bold" style={{ color: short ? RED_SOFT : TEXT_MD }}>
        <span className="tabular-nums">{line}</span>
        {limiting && (
          <span className="inline-flex items-center gap-1.5" style={{ color: AMBER }}>
            <span className="h-2 w-2 rounded-full" style={{ background: AMBER }} aria-hidden />
            Es el que limita
          </span>
        )}
      </p>
    </li>
  );
}
