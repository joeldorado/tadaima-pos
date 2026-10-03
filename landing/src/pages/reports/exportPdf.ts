// Generador del PDF del reporte. Mismo formato que el Excel (pedido del equipo
// 2026-10-03): bloques por método (Efectivo · Tarjeta · Transferencias) con los
// tomos al final y su subtotal "Manga Nacional", detalle por ticket de
// descuentos/ofertas y aumentos, Preventas, Devoluciones y Egresos. Los
// renglones salen de ventasReportRows (los mismos del Excel).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { fmt, fmtDate } from "./reportFormat";
import type { ReportExportParams } from "./reportTypes";
import type { PayBucket } from "./paymentBucket";
import { buildVentasReportRows, sumMethodRows, type AdjustmentRow, type MethodRow } from "./ventasReportRows";

type Rgb = [number, number, number];

const SUPPLY_SOURCE_LABEL: Record<string, string> = {
  caja: "Caja",
  caja_chica: "Caja chica",
  propio: "Dinero propio",
};

const MANGA_TEXT: Rgb = [29, 78, 216];
const MANGA_FILL: Rgb = [219, 234, 254];

interface MethodSection {
  bucket: PayBucket;
  number: number;
  title: string;
  /** Nombre en los títulos de detalle y totales. */
  label: string;
  headFill: Rgb;
  totalFill: Rgb;
}

const METHOD_SECTIONS: MethodSection[] = [
  { bucket: "cash", number: 1, title: "VENTAS EN EFECTIVO", label: "EFECTIVO", headFill: [0, 153, 68], totalFill: [230, 250, 235] },
  { bucket: "card", number: 2, title: "DESGLOSE DE COBROS CON TARJETA", label: "TARJETA", headFill: [34, 102, 187], totalFill: [230, 240, 255] },
  { bucket: "transfer", number: 3, title: "TRANSFERENCIAS / DEPÓSITOS", label: "TRANSFERENCIAS", headFill: [17, 153, 153], totalFill: [225, 245, 245] },
];

/** Arma el PDF (sin toast ni descarga) para poder generarlo en un test. */
export function buildReportPdf(params: ReportExportParams): jsPDF {
  const {
    groupedProducts, paymentBreakdown, from, to, today, canViewCost, ivaRate,
    effectiveStoreId, selectedUserId, stores, users, supplyMovements, presaleRows,
  } = params;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const ivaLabel = `IVA (${Math.round(ivaRate * 100)}%)`;
    const rows = buildVentasReportRows(groupedProducts);
    const mangaRevenue = METHOD_SECTIONS.reduce((sum, s) => sum + sumMethodRows(rows.blocks[s.bucket].filter(r => r.isManga)).revenue, 0);

    // ── Encabezado ──────────────────────────────────────────────────────────
    doc.setFillColor(204, 34, 0); // Tadaima Red
    doc.rect(10, 10, 277, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("TADAIMA - REPORTE DE AUDITORÍA Y VENTAS", 15, 21);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Periodo: ${fmtDate(from)} al ${fmtDate(to)}`, 15, 25);
    const storeName = stores.find((s) => s.id === effectiveStoreId)?.name ?? "Todas las tiendas";
    const selectedUserName = selectedUserId ? (users.find((u) => u.id === selectedUserId)?.name ?? "Todos los usuarios") : "Todos los usuarios";
    doc.text(`Tienda: ${storeName}   |   Usuario: ${selectedUserName}`, 130, 25);
    doc.text(`Generado: ${fmtDate(today)} ${new Date().toLocaleTimeString()}`, 230, 25);

    let currentY = 33;

    // ── Resumen (ingresos cobrados) ─────────────────────────────────────────
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(248, 248, 248);
    doc.roundedRect(10, currentY, 277, 16, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("INGRESOS COBRADOS EN CAJA (CONCEPTO VS MONTO NETO REAL DEL PERIODO)", 14, currentY + 5);
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text(`Total Bruto: ${fmt(paymentBreakdown.total)}`, 14, currentY + 11);
    doc.text(`Efectivo: ${fmt(paymentBreakdown.cash)}`, 70, currentY + 11);
    doc.text(`Tarjetas: ${fmt(paymentBreakdown.card)}`, 120, currentY + 11);
    doc.text(`Depósitos: ${fmt(paymentBreakdown.deposits)}`, 170, currentY + 11);
    doc.setTextColor(...MANGA_TEXT);
    doc.text(`Manga Nacional: ${fmt(mangaRevenue)}`, 225, currentY + 11);
    doc.setTextColor(50, 50, 50);
    currentY += 21;

    const advanceY = () => {
      currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : currentY;
    };
    const pageBreak = () => {
      if (currentY > 185) { doc.addPage(); currentY = 15; }
    };
    const sectionTitle = (title: string) => {
      doc.setTextColor(50, 50, 50);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(title, 10, currentY);
      currentY += 3;
    };
    const highlightLastRow = (bodyLen: number, fill: Rgb) =>
      (data: any) => {
        if (data.row.index === bodyLen - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = fill;
        }
      };

    // ── 1-3. Bloques por método: productos por más vendidos, tomos al final,
    //         TOTAL y subtotal "MANGA NACIONAL (incluido)" ──────────────────────
    const isCard = (s: MethodSection) => s.bucket === "card";
    const methodHead = (s: MethodSection): string[] => isCard(s)
      ? ["Producto", "Cant.", "Bruto", ...(canViewCost ? ["Costo"] : []), "Comisión TPV", ivaLabel, "Neto", ...(canViewCost ? ["Utilidad"] : [])]
      : ["Producto", "Cant.", ...(canViewCost ? ["Costo"] : []), "Venta", ...(canViewCost ? ["Utilidad"] : [])];
    /** Celdas numéricas de un renglón (o de un total) del bloque. */
    const methodCells = (s: MethodSection, r: Pick<MethodRow, "qty" | "revenue" | "cost" | "commission">): Array<string | number> => {
      if (!isCard(s)) {
        return [r.qty, ...(canViewCost ? [fmt(r.cost)] : []), fmt(r.revenue), ...(canViewCost ? [fmt(r.revenue - r.cost)] : [])];
      }
      const iva = r.commission * ivaRate;
      const net = r.revenue - r.commission - iva;
      return [r.qty, fmt(r.revenue), ...(canViewCost ? [fmt(r.cost)] : []), fmt(r.commission), fmt(iva), fmt(net), ...(canViewCost ? [fmt(net - r.cost)] : [])];
    };

    const methodTable = (s: MethodSection, blockRows: MethodRow[]) => {
      pageBreak();
      sectionTitle(`${s.number}. ${s.title}`);
      const manga = blockRows.filter(r => r.isManga);
      const body: Array<Array<string | number>> = blockRows.map(r => [r.name, ...methodCells(s, r)]);
      const totalIdx = body.length;
      body.push([`TOTAL ${s.label}`, ...methodCells(s, sumMethodRows(blockRows))]);
      if (manga.length > 0) body.push(["MANGA NACIONAL (incluido)", ...methodCells(s, sumMethodRows(manga))]);
      autoTable(doc, {
        startY: currentY,
        head: [methodHead(s)],
        body,
        theme: "striped",
        headStyles: { fillColor: s.headFill, fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: { 0: { cellWidth: isCard(s) ? 55 : 90 }, 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          if (data.row.index === totalIdx) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = s.totalFill;
          } else if (data.row.index > totalIdx) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = MANGA_FILL;
            data.cell.styles.textColor = MANGA_TEXT;
          } else if (data.column.index === 0 && blockRows[data.row.index]?.isManga) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = MANGA_TEXT;
          }
        },
      });
      advanceY();
    };

    // Detalle por ticket (x.1 descuentos y ofertas, x.2 aumentos); vacío no se pinta.
    const detailTable = (title: string, amountHead: string, totalLabel: string, entries: AdjustmentRow[], headFill: Rgb, amountColor: Rgb) => {
      if (entries.length === 0) return;
      pageBreak();
      sectionTitle(title);
      const body: string[][] = entries.map(e => [e.product, e.label, e.ticket, e.cashier, e.date, fmt(e.amount)]);
      body.push([totalLabel, "", "", "", "", fmt(entries.reduce((sum, e) => sum + e.amount, 0))]);
      autoTable(doc, {
        startY: currentY,
        head: [["Producto", "Motivo / nota", "Ticket", "Cobró", "Fecha", amountHead]],
        body,
        theme: "striped",
        headStyles: { fillColor: headFill, fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 85 }, 2: { cellWidth: 28 }, 3: { cellWidth: 40 }, 4: { cellWidth: 26 }, 5: { halign: "right", fontStyle: "bold", textColor: amountColor } },
        didParseCell: highlightLastRow(body.length, [237, 237, 237]),
      });
      advanceY();
    };

    for (const s of METHOD_SECTIONS) {
      if (rows.blocks[s.bucket].length > 0) methodTable(s, rows.blocks[s.bucket]);
      detailTable(`${s.number}.1 ${s.label} — DESCUENTOS Y OFERTAS`, "Descuento", `TOTAL DESCUENTOS ${s.label}`, rows.discounts[s.bucket], [184, 134, 11], [255, 34, 0]);
      detailTable(`${s.number}.2 ${s.label} — AUMENTOS DE PRECIO`, "Aumento", `TOTAL AUMENTOS ${s.label}`, rows.surcharges[s.bucket], [204, 119, 34], [204, 119, 34]);
    }

    // ── 4. APARTADOS Y PREVENTAS — un renglón por PRODUCTO + ESTADO (liquidada/apartada) ─
    if (presaleRows.length > 0) {
      pageBreak();
      sectionTitle("4. APARTADOS Y PREVENTAS");
      let tCant = 0, tAp = 0, tDeu = 0, tTot = 0, tCost = 0, tUtil = 0;
      const body = presaleRows.map((row) => {
        tCant += row.qty; tAp += row.apartado; tDeu += row.deuda; tTot += row.pactado; tCost += row.costoNeto; tUtil += row.utilidad;
        return [row.name, row.qty, fmt(row.apartado), fmt(row.deuda), fmt(row.pactado), ...(canViewCost ? [fmt(row.costoNeto), fmt(row.utilidad)] : [])];
      });
      body.push(["TOTAL PREVENTAS", tCant, fmt(tAp), fmt(tDeu), fmt(tTot), ...(canViewCost ? [fmt(tCost), fmt(tUtil)] : [])]);
      autoTable(doc, {
        startY: currentY,
        head: [["Producto", "Cant. Preventa", "Abonado", "Pendiente", "Pactado", ...(canViewCost ? ["Costo", "Utilidad"] : [])]],
        body,
        theme: "striped",
        headStyles: { fillColor: [136, 51, 238], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: { 0: { cellWidth: 65 }, 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
        didParseCell: highlightLastRow(body.length, [245, 235, 255]),
      });
      advanceY();
    }

    // ── 5. DEVOLUCIONES Y CANCELACIONES — Producto · Cant Devuelta · Monto ────
    if (rows.returns.length > 0) {
      pageBreak();
      sectionTitle("5. DEVOLUCIONES Y CANCELACIONES");
      const body: Array<Array<string | number>> = rows.returns.map((r) => [r.name, r.qty, fmt(r.amount)]);
      body.push(["TOTAL DEVOLUCIONES", rows.returns.reduce((sum, r) => sum + r.qty, 0), fmt(rows.returns.reduce((sum, r) => sum + r.amount, 0))]);
      autoTable(doc, {
        startY: currentY,
        head: [["Producto", "Cant. Devuelta", "Monto Devuelto"]],
        body,
        theme: "striped",
        headStyles: { fillColor: [255, 68, 34], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: { 0: { cellWidth: 120 }, 1: { halign: "center", textColor: [255, 68, 34] }, 2: { halign: "right", fontStyle: "bold", textColor: [255, 68, 34] } },
        didParseCell: highlightLastRow(body.length, [255, 235, 230]),
      });
      advanceY();
    }

    // ── 6. EGRESOS — INSUMOS — Insumo · Descripción · Origen · Registró · Tienda · Monto ─
    if (supplyMovements.length > 0) {
      pageBreak();
      sectionTitle("6. EGRESOS — INSUMOS DE OPERACIÓN");
      let tMonto = 0;
      const body = supplyMovements.map((m) => {
        const origen = SUPPLY_SOURCE_LABEL[m.money_source ?? "caja"] ?? (m.money_source ?? "—");
        const origenTxt = m.money_source === "propio" && m.payer_name ? `${origen} · ${m.payer_name}` : origen;
        const tienda = m.supply?.store_id ? (stores.find((s) => s.id === m.supply?.store_id)?.name ?? `Tienda ${m.supply?.store_id}`) : "Toda la empresa";
        tMonto += m.amount || 0;
        return [m.supply?.name ?? "Insumo", m.note ?? "", origenTxt, m.user?.name ?? "—", tienda, fmt(m.amount || 0)];
      });
      body.push(["TOTAL EGRESOS", "", "", "", "", fmt(tMonto)]);
      autoTable(doc, {
        startY: currentY,
        head: [["Insumo", "Descripción", "Origen", "Registró", "Tienda", "Monto"]],
        body,
        theme: "striped",
        headStyles: { fillColor: [204, 119, 34], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 95 }, 2: { cellWidth: 28 }, 3: { cellWidth: 38 }, 4: { cellWidth: 32 }, 5: { halign: "right", fontStyle: "bold", textColor: [204, 34, 0] } },
        didParseCell: highlightLastRow(body.length, [250, 240, 225]),
      });
      advanceY();
    }

  return doc;
}

export function exportReportPdf(params: ReportExportParams): void {
  try {
    toast.info("Generando archivo PDF...");
    buildReportPdf(params).save(`Tadaima_Reporte_Ventas_${params.from}_${params.to}.pdf`);
    toast.success("PDF generado exitosamente!");
  } catch (error) {
    console.error("Error generating PDF:", error);
    toast.error("Hubo un error al generar el PDF");
  }
}
