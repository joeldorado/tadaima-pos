import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import type { Bundle } from "@tadaima/api";
import {
  MAX_COPIES, buildLabelHtml, formatLabelPrice, labelBarcodeValue, type LabelBarcodeFormat, type LabelData,
} from "@/lib/bundleLabel";
import { printViaWindow } from "@/lib/ticketWindow";
import { PromoButton } from "@/components/promos/PromoButton";
import { PromoDialog } from "@/components/promos/PromoDialog";
import { AMBER, TEXT_HI, TEXT_MD } from "@/components/promos/promoTokens";
import { QtyStepper } from "./QtyStepper";
import { pluralize } from "./bundleTokens";

interface BundleLabelModalProps {
  bundle: Pick<Bundle, "name" | "sku" | "barcode" | "prices">;
  onClose: () => void;
}

const LABEL = "mb-1.5 block text-[15px] font-bold";
/** 58 mm escalados a pantalla. */
const PREVIEW_WIDTH = 220;
const BARCODE_HEIGHT = 48;
const BARCODE_FONT = 14;
const WINDOW_NAME = "tadaima_label";

/**
 * Imprimir la etiqueta del paquete (58 × 40 mm): vista previa en blanco (la
 * etiqueta es blanca aunque el tema sea oscuro), copias y envío a la
 * impresora que elija el usuario en el diálogo del navegador.
 */
export function BundleLabelModal({ bundle, onClose }: BundleLabelModalProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [copies, setCopies] = useState(1);
  const [barcodeError, setBarcodeError] = useState(false);

  const data: LabelData = { name: bundle.name, price: bundle.prices.price_1 ?? 0, sku: bundle.sku, barcode: bundle.barcode };
  const primary = labelBarcodeValue(data);
  const value = barcodeError ? bundle.sku : primary.value;
  const format: LabelBarcodeFormat = barcodeError ? "CODE128" : primary.format;

  useEffect(() => {
    let cancelled = false;
    const fail = () => { if (!cancelled && !barcodeError) setBarcodeError(true); };
    void import("jsbarcode")
      .then(mod => {
        const svg = svgRef.current;
        if (cancelled || !svg) return;
        try {
          mod.default(svg, value, {
            format, displayValue: true, fontSize: BARCODE_FONT, height: BARCODE_HEIGHT, margin: 0,
            lineColor: "#000", background: "#fff",
            valid: ok => { if (!ok) fail(); },
          });
        } catch {
          fail();
        }
      })
      .catch(fail);
    return () => { cancelled = true; };
  }, [value, format, barcodeError]);

  const print = () => {
    const svgHtml = svgRef.current?.outerHTML ?? "";
    const html = buildLabelHtml(data, svgHtml, copies);
    const transport = printViaWindow(html, { windowName: WINDOW_NAME });
    if (transport === "none") {
      toast.error("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e intenta de nuevo.");
      return;
    }
    toast.success("Enviado a imprimir");
    onClose();
  };

  return (
    <PromoDialog
      title="Imprimir etiqueta"
      subtitle={bundle.name}
      size="sm"
      onClose={onClose}
      testId="bundle-label-modal"
      footer={(
        <>
          <PromoButton onClick={onClose}>Cerrar</PromoButton>
          <PromoButton variant="primary" icon={<Printer size={18} aria-hidden />} onClick={print} data-testid="confirm-print-label">
            Imprimir {pluralize(copies, "etiqueta", "etiquetas")}
          </PromoButton>
        </>
      )}
    >
      <div className="space-y-5">
        <div
          className="mx-auto flex flex-col items-center gap-1 text-center"
          style={{ width: PREVIEW_WIDTH, padding: 8, background: "#fff", color: "#000", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.35)" }}
          aria-label="Vista previa de la etiqueta"
          data-testid="label-preview"
        >
          <p className="line-clamp-2 w-full break-words font-bold leading-tight" style={{ fontSize: "12pt", color: "#000" }}>{bundle.name}</p>
          <p className="font-bold" style={{ fontSize: "18pt", color: "#000", lineHeight: 1.1 }}>{formatLabelPrice(data.price)}</p>
          <svg ref={svgRef} role="img" aria-label={`Código de barras ${value}`} style={{ maxWidth: "100%", height: "auto" }} />
          <p style={{ fontSize: "9pt", color: "#000", letterSpacing: "0.04em" }}>{bundle.sku}</p>
        </div>
        {barcodeError && (
          <p className="text-[14px] font-bold" style={{ color: AMBER }}>El código de barras no es válido; se imprime el SKU.</p>
        )}
        <p className="text-[13px] font-semibold" style={{ color: TEXT_MD }}>
          Sale en la impresora que elijas en el diálogo de impresión (etiquetadora o la de tickets).
        </p>
        <div>
          <span className={LABEL} style={{ color: TEXT_HI }}>Copias</span>
          <QtyStepper value={copies} min={1} max={MAX_COPIES} onChange={setCopies} ariaLabel="Copias de la etiqueta" testId="label-copies" />
        </div>
      </div>
    </PromoDialog>
  );
}
