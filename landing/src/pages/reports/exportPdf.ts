// Generador del PDF del reporte. Reescrito para empatar con el Excel:
// mismas 5 tablas, mismo orden y columnas (Efectivo · Tarjeta · Preventas ·
// Devoluciones · Egresos), IVA dinámico y columnas de Costo/Utilidad gateadas.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { fmt, fmtDate } from "./reportFormat";
import type { ReportExportParams } from "./reportTypes";

const SUPPLY_SOURCE_LABEL: Record<string, string> = {
  caja: "Caja",
  caja_chica: "Caja chica",
  propio: "Dinero propio",
};

const DISCOUNT_REASON_LABEL: Record<string, string> = {
  danado: "dañado", caducidad: "caducidad", exhibicion: "exhibición", cortesia: "cortesía", otro: "otro",
};
const PROMO_FILL: [number, number, number] = [185, 251, 192];  // verde
const DESC_FILL: [number, number, number] = [255, 241, 118];   // amarillo

export function exportReportPdf(params: ReportExportParams): void {
  const {
    groupedProducts, paymentBreakdown, from, to, today, canViewCost, ivaRate,
    effectiveStoreId, selectedUserId, stores, users, supplyMovements,
  } = params;
  try {
    toast.info("Generando archivo PDF...");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const ivaLabel = `IVA (${Math.round(ivaRate * 100)}%)`;

    const isCard = (m: string) => {
      const s = m.toLowerCase();
      return s.includes("tarjeta") || s.includes("credit") || s.includes("debito") || s.includes("tpv") || s.includes("terminal");
    };
    const isCash = (m: string) => {
      const s = m.toLowerCase();
      return s.includes("efectivo") || s.includes("cash") || s.includes("dolar") || s.includes("dólar") || s.includes("usd") || s.includes("otro") || s.includes("unmapped");
    };

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
    doc.text(`Efectivo: ${fmt(paymentBreakdown.cash)}`, 80, currentY + 11);
    doc.text(`Tarjetas: ${fmt(paymentBreakdown.card)}`, 140, currentY + 11);
    doc.text(`Depósitos: ${fmt(paymentBreakdown.deposits)}`, 210, currentY + 11);
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
    const highlightLastRow = (bodyLen: number, fill: [number, number, number]) =>
      (data: any) => {
        if (data.row.index === bodyLen - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = fill;
        }
      };

    // ── 1. VENTAS EN EFECTIVO — Producto · Cant · [Costo] · Venta · [Utilidad] ─
    const cashProducts = groupedProducts.filter((p) => Object.keys(p.payment_breakdown).some(isCash));
    if (cashProducts.length > 0) {
      pageBreak();
      sectionTitle("1. VENTAS EN EFECTIVO");
      let tCant = 0, tCost = 0, tVenta = 0, tProfit = 0;
      const body: any[] = [];
      const rowFill: Record<number, [number, number, number]> = {};
      const cashTotalCols = canViewCost ? 5 : 3;
      const cashVentaIdx = canViewCost ? 3 : 2;
      cashProducts.forEach((prod) => {
        let qty = 0, revenue = 0;
        Object.entries(prod.payment_breakdown).forEach(([m, d]) => { if (isCash(m)) { qty += d.qty; revenue += d.revenue; } });
        // Costo por PIEZAS (costo unitario × piezas en efectivo), no por ingresos.
        const unitCost = (prod.total_quantity || 0) > 0 ? (prod.total_cost || 0) / prod.total_quantity : 0;
        const cost = unitCost * qty;
        const profit = revenue - cost;
        tCant += qty; tCost += cost; tVenta += revenue; tProfit += profit;
        body.push([prod.name, qty, ...(canViewCost ? [fmt(cost)] : []), fmt(revenue), ...(canViewCost ? [fmt(profit)] : [])]);
        // Renglones de beneficio (efectivo): uno por promo (verde) y por motivo (amarillo).
        Object.entries(prod.promo_breakdown ?? {}).forEach(([name, amt]) => {
          if (amt.cash > 0.005) {
            const row = new Array(cashTotalCols).fill(""); row[0] = `   Promo: ${name}`; row[cashVentaIdx] = `-${fmt(amt.cash)}`;
            rowFill[body.length] = PROMO_FILL; body.push(row);
          }
        });
        Object.entries(prod.discount_breakdown ?? {}).forEach(([reason, amt]) => {
          if (amt.cash > 0.005) {
            const row = new Array(cashTotalCols).fill(""); row[0] = `   Descuento (${DISCOUNT_REASON_LABEL[reason] ?? reason})`; row[cashVentaIdx] = `-${fmt(amt.cash)}`;
            rowFill[body.length] = DESC_FILL; body.push(row);
          }
        });
      });
      body.push(["TOTAL EFECTIVO", tCant, ...(canViewCost ? [fmt(tCost)] : []), fmt(tVenta), ...(canViewCost ? [fmt(tProfit)] : [])]);
      const cashLastIdx = body.length - 1;
      autoTable(doc, {
        startY: currentY,
        head: [["Producto", "Cant. Efectivo", ...(canViewCost ? ["Costo"] : []), "Venta Efectivo", ...(canViewCost ? ["Utilidad"] : [])]],
        body,
        theme: "striped",
        headStyles: { fillColor: [0, 153, 68], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: { 0: { cellWidth: 90 }, 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
        didParseCell: (data) => {
          const fill = rowFill[data.row.index];
          if (data.section === "body" && fill) {
            data.cell.styles.fillColor = fill;
            data.cell.styles.fontStyle = "bold";
          } else if (data.section === "body" && data.row.index === cashLastIdx) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [230, 250, 235];
          }
        },
      });
      advanceY();
    }

    // ── 2. TARJETA — Producto · Cant · Bruto · [Costo] · Comisión · IVA · Neto · [Utilidad] ─
    const cardProducts = groupedProducts.filter((p) => Object.keys(p.payment_breakdown).some(isCard));
    if (cardProducts.length > 0) {
      pageBreak();
      sectionTitle("2. DESGLOSE DE COBROS CON TARJETA");
      let tCant = 0, tBruto = 0, tCost = 0, tCom = 0, tIva = 0, tNet = 0, tProfit = 0;
      const body: any[] = [];
      const rowFill: Record<number, [number, number, number]> = {};
      const cardTotalCols = canViewCost ? 8 : 6;
      cardProducts.forEach((prod) => {
        let qty = 0, revenue = 0;
        Object.entries(prod.payment_breakdown).forEach(([m, d]) => { if (isCard(m)) { qty += d.qty; revenue += d.revenue; } });
        const comm = prod.commission_amount || 0;
        const iva = comm * ivaRate;
        const net = revenue - comm - iva;
        // Costo por PIEZAS (costo unitario × piezas en tarjeta). Utilidad = Neto − Costo.
        const unitCost = (prod.total_quantity || 0) > 0 ? (prod.total_cost || 0) / prod.total_quantity : 0;
        const cost = unitCost * qty;
        const profit = net - cost;
        tCant += qty; tBruto += revenue; tCost += cost; tCom += comm; tIva += iva; tNet += net; tProfit += profit;
        body.push([prod.name, qty, fmt(revenue), ...(canViewCost ? [fmt(cost)] : []), fmt(comm), fmt(iva), fmt(net), ...(canViewCost ? [fmt(profit)] : [])]);
        // Renglones de beneficio (tarjeta): monto en la columna Bruto (índice 2).
        Object.entries(prod.promo_breakdown ?? {}).forEach(([name, amt]) => {
          if (amt.card > 0.005) {
            const row = new Array(cardTotalCols).fill(""); row[0] = `   Promo: ${name}`; row[2] = `-${fmt(amt.card)}`;
            rowFill[body.length] = PROMO_FILL; body.push(row);
          }
        });
        Object.entries(prod.discount_breakdown ?? {}).forEach(([reason, amt]) => {
          if (amt.card > 0.005) {
            const row = new Array(cardTotalCols).fill(""); row[0] = `   Descuento (${DISCOUNT_REASON_LABEL[reason] ?? reason})`; row[2] = `-${fmt(amt.card)}`;
            rowFill[body.length] = DESC_FILL; body.push(row);
          }
        });
      });
      body.push(["TOTAL TARJETA", tCant, fmt(tBruto), ...(canViewCost ? [fmt(tCost)] : []), fmt(tCom), fmt(tIva), fmt(tNet), ...(canViewCost ? [fmt(tProfit)] : [])]);
      const cardLastIdx = body.length - 1;
      autoTable(doc, {
        startY: currentY,
        head: [["Producto", "Cant.", "Bruto", ...(canViewCost ? ["Costo"] : []), "Comisión TPV", ivaLabel, "Neto", ...(canViewCost ? ["Utilidad"] : [])]],
        body,
        theme: "striped",
        headStyles: { fillColor: [34, 102, 187], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: { 0: { cellWidth: 55 }, 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
        didParseCell: (data) => {
          const fill = rowFill[data.row.index];
          if (data.section === "body" && fill) {
            data.cell.styles.fillColor = fill;
            data.cell.styles.fontStyle = "bold";
          } else if (data.section === "body" && data.row.index === cardLastIdx) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [230, 240, 255];
          }
        },
      });
      advanceY();
    }

    // ── 3. APARTADOS Y PREVENTAS — Producto · Cant · Abonado · Pendiente · Pactado · [Costo] · [Utilidad] ─
    const preSaleProducts = groupedProducts.filter((p) => (p.pre_sale_apartado && p.pre_sale_apartado > 0) || (p.pre_sale_deuda && p.pre_sale_deuda > 0));
    if (preSaleProducts.length > 0) {
      pageBreak();
      sectionTitle("3. APARTADOS Y PREVENTAS");
      let tCant = 0, tAp = 0, tDeu = 0, tTot = 0, tCost = 0, tUtil = 0;
      const body = preSaleProducts.map((prod) => {
        const abonado = prod.pre_sale_apartado || 0;
        const pendiente = prod.pre_sale_deuda || 0;
        const pactado = abonado + pendiente;
        const cost = prod.pre_sale_costo_real || 0;
        const utilidad = pactado - cost;
        tCant += prod.total_quantity || 0; tAp += abonado; tDeu += pendiente; tTot += pactado; tCost += cost; tUtil += utilidad;
        return [prod.name, prod.total_quantity, fmt(abonado), fmt(pendiente), fmt(pactado), ...(canViewCost ? [fmt(cost), fmt(utilidad)] : [])];
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

    // ── 4. DEVOLUCIONES Y CANCELACIONES — Producto · Cant Devuelta · Monto ────
    const returnedProducts = groupedProducts.filter((p) => p.returned_quantity && p.returned_quantity > 0);
    if (returnedProducts.length > 0) {
      pageBreak();
      sectionTitle("4. DEVOLUCIONES Y CANCELACIONES");
      let tCant = 0, tMonto = 0;
      const body = returnedProducts.map((prod) => {
        tCant += prod.returned_quantity || 0; tMonto += prod.returned_revenue || 0;
        return [prod.name, prod.returned_quantity || 0, fmt(prod.returned_revenue || 0)];
      });
      body.push(["TOTAL DEVOLUCIONES", tCant, fmt(tMonto)]);
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

    // ── 5. EGRESOS — INSUMOS — Insumo · Descripción · Origen · Registró · Tienda · Monto ─
    if (supplyMovements.length > 0) {
      pageBreak();
      sectionTitle("5. EGRESOS — INSUMOS DE OPERACIÓN");
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

    doc.save(`Tadaima_Reporte_Ventas_${from}_${to}.pdf`);
    toast.success("PDF generado exitosamente!");
  } catch (error) {
    console.error("Error generating PDF:", error);
    toast.error("Hubo un error al generar el PDF");
  }
}
