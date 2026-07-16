// Generador del PDF del reporte. Extraído de ReportsPage.tsx (handleExportPDF)
// para separar la lógica de exportación del componente de página.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { fmt, fmtDate } from "./reportFormat";
import type { ReportExportParams } from "./reportTypes";

export function exportReportPdf(params: ReportExportParams): void {
  const {
    groupedProducts, regularProducts, tomoProducts, paymentBreakdown,
    from, to, today, canViewCost, ivaRate, effectiveStoreId, selectedUserId,
    stores, users,
  } = params;
    try {
      toast.info("Generando archivo PDF...");
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4"
      });

      // Title & Header Info
      doc.setFillColor(204, 34, 0); // Tadaima Red
      doc.rect(10, 10, 277, 18, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("TADAIMA - REPORTE DE AUDITORÍA Y VENTAS", 15, 21);

      // Metadata
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`Periodo: ${fmtDate(from)} al ${fmtDate(to)}`, 15, 25);
      
      const storeName = stores.find(s => s.id === effectiveStoreId)?.name ?? "Todas las tiendas";
      const selectedUserName = selectedUserId ? (users.find(u => u.id === selectedUserId)?.name ?? "Todos los usuarios") : "Todos los usuarios";
      doc.text(`Tienda: ${storeName}   |   Usuario: ${selectedUserName}`, 130, 25);
      doc.text(`Generado: ${fmtDate(today)} ${new Date().toLocaleTimeString()}`, 230, 25);

      let currentY = 33;

      // Card Totals
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

      // Table 1: Detalle general
      doc.setTextColor(50, 50, 50);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("1. DETALLE GENERAL DE VENTAS POR PRODUCTO", 10, currentY);
      currentY += 3;

      const tbl1Body: any[] = [];
      
      const buildPdfRow = (prod: any) => {
        const comm = prod.commission_amount || 0;
        const iva = comm * ivaRate;
        const net = prod.total_revenue - comm - iva;
        const profit = (prod.total_profit || 0) - comm - iva;

        return [
          prod.name,
          (prod.returned_quantity && prod.returned_quantity > 0) ? `${prod.total_quantity} (-${prod.returned_quantity} dev)` : prod.total_quantity,
          (prod.returned_revenue && prod.returned_revenue > 0) ? `${fmt(prod.total_revenue)} (-${fmt(prod.returned_revenue)} dev)` : fmt(prod.total_revenue),
          fmt(comm),
          fmt(iva),
          fmt(net),
          ...(canViewCost ? [fmt(profit)] : [])
        ];
      };

      // Add regular products
      regularProducts.forEach(prod => {
        tbl1Body.push(buildPdfRow(prod));
      });

      // Add divider row if both are present
      let tomoPdfDividerIndex = -1;
      if (regularProducts.length > 0 && tomoProducts.length > 0) {
        tomoPdfDividerIndex = tbl1Body.length;
        tbl1Body.push([
          "MANGA NACIONAL",
          "",
          "",
          "",
          "",
          "",
          ...(canViewCost ? [""] : [])
        ]);
      }
      // Add tomo products
      tomoProducts.forEach(prod => {
        tbl1Body.push(buildPdfRow(prod));
      });

      // Calculate totals
      let t1Cant = 0, t1Bruto = 0, t1Com = 0, t1Net = 0, t1Profit = 0;
      groupedProducts.forEach(p => {
        t1Cant += p.total_quantity || 0;
        t1Bruto += p.total_revenue || 0;
        const c = p.commission_amount || 0;
        t1Com += c;
        t1Net += (p.total_revenue - c - (c * ivaRate));
        t1Profit += (p.total_profit || 0);
      });

      const t1IvaTotal = t1Com * ivaRate;
      t1Profit = t1Profit - t1Com - t1IvaTotal;
      tbl1Body.push([
        "TOTAL GENERAL",
        t1Cant.toString(),
        fmt(t1Bruto),
        fmt(t1Com),
        fmt(t1IvaTotal),
        fmt(t1Net),
        ...(canViewCost ? [fmt(t1Profit)] : [])
      ]);

      const pdfHeaders = canViewCost 
        ? ["Producto", "Cant.", "Bruto", "Comisión TPV", "IVA s/Comisión (16%)", "Neto Real", "Utilidad Neta"]
        : ["Producto", "Cant.", "Bruto", "Comisión TPV", "IVA s/Comisión (16%)", "Neto Real"];

      autoTable(doc, {
        startY: currentY,
        head: [pdfHeaders],
        body: tbl1Body,
        theme: "striped",
        headStyles: { fillColor: [80, 80, 80], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 28 },
          2: { halign: "center" },
          3: { halign: "center" },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
          7: { halign: "right", fontStyle: "bold" },
          ...(canViewCost ? {
            8: { halign: "right", fontStyle: "bold", textColor: [0, 150, 70] },
            9: { cellWidth: 60 }
          } : {
            8: { cellWidth: 60 }
          })
        },
        didParseCell: (data) => {
          if (tomoPdfDividerIndex !== -1 && data.row.index === tomoPdfDividerIndex) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [220, 220, 220];
            data.cell.styles.textColor = [50, 50, 50];
          } else if (data.row.index === tbl1Body.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [240, 240, 240];
            if ([4, 5, 6, 7].includes(data.column.index)) {
              data.cell.styles.textColor = data.column.index === 7 ? [0, 150, 70] : [50, 50, 50];
            }
          }
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;

      // Check if page overflow
      if (currentY > 185) {
        doc.addPage();
        currentY = 15;
      }

      // Table 2: Tarjetas
      const cardProducts = groupedProducts.filter(prod => 
        Object.keys(prod.payment_breakdown).some(m => m.toLowerCase().includes("tarjeta") || m.toLowerCase().includes("credit") || m.toLowerCase().includes("debito") || m.toLowerCase().includes("tpv") || m.toLowerCase().includes("terminal"))
      );

      if (cardProducts.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("2. DESGLOSE DE COBROS CON TARJETA Y COMISIONES (16% IVA)", 10, currentY);
        currentY += 3;

        const tbl2Body = cardProducts.map(prod => {
          let cardQty = 0;
          let cardRevenue = 0;
          Object.entries(prod.payment_breakdown).forEach(([method, data]) => {
            if (method.toLowerCase().includes("tarjeta") || method.toLowerCase().includes("credit") || method.toLowerCase().includes("debito") || method.toLowerCase().includes("tpv") || method.toLowerCase().includes("terminal")) {
              cardQty += data.qty;
              cardRevenue += data.revenue;
            }
          });
          const comm = prod.commission_amount || 0;
          const iva = comm * ivaRate;
          const ratio = prod.total_revenue > 0 ? (cardRevenue / prod.total_revenue) : 0;
          const baseProfit = (prod.total_profit || 0) * ratio;
          const cardProfit = baseProfit - comm - iva;
          return [
            prod.name,
            cardQty,
            fmt(cardRevenue),
            fmt(comm),
            fmt(iva),
            fmt(cardRevenue - comm - iva),
            ...(canViewCost ? [fmt(cardProfit)] : [])
          ];
        });

        // Totals
        let t2Cant = 0, t2Bruto = 0, t2Com = 0, t2Iva = 0, t2Net = 0, t2Profit = 0;
        cardProducts.forEach(prod => {
          let cardQty = 0;
          let cardRevenue = 0;
          Object.entries(prod.payment_breakdown).forEach(([method, data]) => {
            if (method.toLowerCase().includes("tarjeta") || method.toLowerCase().includes("credit") || method.toLowerCase().includes("debito") || method.toLowerCase().includes("tpv") || method.toLowerCase().includes("terminal")) {
              cardQty += data.qty;
              cardRevenue += data.revenue;
            }
          });
          const c = prod.commission_amount || 0;
          const i = c * ivaRate;
          t2Cant += cardQty;
          t2Bruto += cardRevenue;
          t2Com += c;
          t2Iva += i;
          t2Net += (cardRevenue - c - i);
          const ratio = prod.total_revenue > 0 ? (cardRevenue / prod.total_revenue) : 0;
          const baseProfit = (prod.total_profit || 0) * ratio;
          t2Profit += (baseProfit - c - i);
        });

        tbl2Body.push([
          "TOTAL TARJETAS",
          "",
          t2Cant.toString(),
          fmt(t2Bruto),
          fmt(t2Com),
          fmt(t2Iva),
          fmt(t2Net),
          ...(canViewCost ? [fmt(t2Profit)] : [])
        ]);

        const t2Headers = canViewCost
          ? ["Producto", "Cant. Tarjeta", "Bruto Tarjeta", "Comisión TPV", "IVA s/Comisión (16%)", "Neto Tarjeta", "Utilidad Tarjeta"]
          : ["Producto", "Cant. Tarjeta", "Bruto Tarjeta", "Comisión TPV", "IVA s/Comisión (16%)", "Neto Tarjeta"];
        autoTable(doc, {
          startY: currentY,
          head: [t2Headers],
          body: tbl2Body,
          theme: "striped",
          headStyles: { fillColor: [34, 102, 187], fontSize: 8, fontStyle: "bold" },
          bodyStyles: { fontSize: 7.5 },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { cellWidth: 35 },
            2: { halign: "center" },
            3: { halign: "right" },
            4: { halign: "right" },
            5: { halign: "right" },
            6: { halign: "right", fontStyle: "bold" },
            ...(canViewCost ? { 7: { halign: "right", fontStyle: "bold", textColor: [0, 150, 70] } } : {})
          },
          didParseCell: (data) => {
            if (data.row.index === tbl2Body.length - 1) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [230, 240, 255];
              if (data.column.index === 6 || (canViewCost && data.column.index === 7)) {
                data.cell.styles.textColor = [0, 150, 70];
              }
            }
          }
        });

        currentY = (doc as any).lastAutoTable.finalY + 10;
      }

      // Check page overflow for Section 3
      if (currentY > 185) {
        doc.addPage();
        currentY = 15;
      }

      // Table 3: Efectivo
      const cashProducts = groupedProducts.filter(prod => 
        Object.keys(prod.payment_breakdown).some(m => m.toLowerCase().includes("efectivo") || m.toLowerCase().includes("cash") || m.toLowerCase().includes("dolar") || m.toLowerCase().includes("dólar") || m.toLowerCase().includes("usd") || m.toLowerCase().includes("otro") || m.toLowerCase().includes("unmapped"))
      );

      if (cashProducts.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("3. DESGLOSE DE VENTAS EN EFECTIVO (PESOS / DÓLARES / OTROS)", 10, currentY);
        currentY += 3;

        const tbl3Body = cashProducts.map(prod => {
          let cashQty = 0;
          let cashRevenue = 0;
          Object.entries(prod.payment_breakdown).forEach(([method, data]) => {
            if (method.toLowerCase().includes("efectivo") || method.toLowerCase().includes("cash") || method.toLowerCase().includes("dolar") || method.toLowerCase().includes("dólar") || method.toLowerCase().includes("usd") || method.toLowerCase().includes("otro") || method.toLowerCase().includes("unmapped")) {
              cashQty += data.qty;
              cashRevenue += data.revenue;
            }
          });
          const ratio = prod.total_revenue > 0 ? (cashRevenue / prod.total_revenue) : 0;
          const cashProfit = (prod.total_profit || 0) * ratio;
          return [
            prod.name,
            cashQty,
            fmt(cashRevenue),
            ...(canViewCost ? [fmt(cashProfit)] : [])
          ];
        });

        // Totals
        let t3Cant = 0, t3Bruto = 0, t3Profit = 0;
        cashProducts.forEach(prod => {
          let cashQty = 0;
          let cashRevenue = 0;
          Object.entries(prod.payment_breakdown).forEach(([method, data]) => {
            if (method.toLowerCase().includes("efectivo") || method.toLowerCase().includes("cash") || method.toLowerCase().includes("dolar") || method.toLowerCase().includes("dólar") || method.toLowerCase().includes("usd") || method.toLowerCase().includes("otro") || method.toLowerCase().includes("unmapped")) {
              cashQty += data.qty;
              cashRevenue += data.revenue;
            }
          });
          t3Cant += cashQty;
          t3Bruto += cashRevenue;
          const ratio = prod.total_revenue > 0 ? (cashRevenue / prod.total_revenue) : 0;
          t3Profit += (prod.total_profit || 0) * ratio;
        });

        tbl3Body.push([
          "TOTAL EFECTIVO",
          "",
          t3Cant.toString(),
          fmt(t3Bruto),
          ...(canViewCost ? [fmt(t3Profit)] : [])
        ]);

        const t3Headers = canViewCost
          ? ["Producto", "Cant. Efectivo", "Monto Efectivo", "Utilidad Efectivo"]
          : ["Producto", "Cant. Efectivo", "Monto Efectivo"];
        autoTable(doc, {
          startY: currentY,
          head: [t3Headers],
          body: tbl3Body,
          theme: "striped",
          headStyles: { fillColor: [0, 153, 68], fontSize: 8, fontStyle: "bold" },
          bodyStyles: { fontSize: 7.5 },
          columnStyles: {
            0: { cellWidth: 100 },
            1: { cellWidth: 45 },
            2: { halign: "center" },
            3: { halign: "right", fontStyle: "bold" },
            ...(canViewCost ? { 4: { halign: "right", fontStyle: "bold", textColor: [0, 150, 70] } } : {})
          },
          didParseCell: (data) => {
            if (data.row.index === tbl3Body.length - 1) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [230, 250, 235];
              if (data.column.index === 3) {
                data.cell.styles.textColor = [0, 150, 70];
              }
            }
          }
        });

        currentY = (doc as any).lastAutoTable.finalY + 10;
      }

      // Check page overflow for Section 4
      if (currentY > 185) {
        doc.addPage();
        currentY = 15;
      }

      // Table 4: Preventas
      const preSaleProducts = groupedProducts.filter(prod => 
        (prod.pre_sale_apartado && prod.pre_sale_apartado > 0) || (prod.pre_sale_deuda && prod.pre_sale_deuda > 0)
      );

      if (preSaleProducts.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("4. CONTROL Y AUDITORÍA DE PREVENTAS (ABONADO VS DEUDA PENDIENTE)", 10, currentY);
        currentY += 3;

        const tbl4Body = preSaleProducts.map(prod => {
          const pactado = (prod.pre_sale_apartado || 0) + (prod.pre_sale_deuda || 0);
          return [
            prod.name,
            prod.total_quantity,
            fmt(prod.pre_sale_apartado || 0),
            fmt(prod.pre_sale_deuda || 0),
            fmt(pactado)
          ];
        });

        // Totals
        let t4Cant = 0, t4Ap = 0, t4Deu = 0, t4Tot = 0;
        preSaleProducts.forEach(p => {
          t4Cant += p.total_quantity || 0;
          t4Ap += p.pre_sale_apartado || 0;
          t4Deu += p.pre_sale_deuda || 0;
          t4Tot += ((p.pre_sale_apartado || 0) + (p.pre_sale_deuda || 0));
        });

        tbl4Body.push([
          "TOTAL PREVENTAS",
          "",
          t4Cant.toString(),
          fmt(t4Ap),
          fmt(t4Deu),
          fmt(t4Tot)
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [["Producto", "Cant. Preventa", "Abonado (Apartado)", "Pendiente (Deuda)", "Pactado (Total)"]],
          body: tbl4Body,
          theme: "striped",
          headStyles: { fillColor: [136, 51, 238], fontSize: 8, fontStyle: "bold" },
          bodyStyles: { fontSize: 7.5 },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 35 },
            2: { halign: "center" },
            3: { halign: "right", fontStyle: "bold" },
            4: { halign: "right", fontStyle: "bold" },
            5: { halign: "right" }
          },
          didParseCell: (data) => {
            if (data.row.index === tbl4Body.length - 1) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [245, 235, 255];
              if (data.column.index === 3) {
                data.cell.styles.textColor = [0, 150, 70];
              }
              if (data.column.index === 4) {
                data.cell.styles.textColor = [200, 30, 0];
              }
            }
          }
        });
      }

      currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : currentY;

      // Table 5: Devoluciones
      const returnedProducts = groupedProducts.filter(prod => 
        (prod.returned_quantity && prod.returned_quantity > 0)
      );

      if (returnedProducts.length > 0) {
        if (currentY > 185) {
          doc.addPage();
          currentY = 15;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("5. DEVOLUCIONES Y CANCELACIONES", 10, currentY);
        currentY += 3;

        const tbl5Body = returnedProducts.map(prod => {
          return [
            prod.name,
            prod.returned_quantity || 0,
            fmt(prod.returned_revenue || 0)
          ];
        });

        // Totals
        let t5Cant = 0, t5Monto = 0;
        returnedProducts.forEach(p => {
          t5Cant += p.returned_quantity || 0;
          t5Monto += p.returned_revenue || 0;
        });

        tbl5Body.push([
          "TOTAL DEVOLUCIONES",
          "",
          t5Cant.toString(),
          fmt(t5Monto)
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [["Producto", "Cant. Devuelta", "Monto Devuelto"]],
          body: tbl5Body,
          theme: "striped",
          headStyles: { fillColor: [255, 68, 34], fontSize: 8, fontStyle: "bold" },
          bodyStyles: { fontSize: 7.5 },
          columnStyles: {
            0: { cellWidth: 100 },
            1: { cellWidth: 45 },
            2: { halign: "center", fontStyle: "bold", textColor: [255, 68, 34] },
            3: { halign: "right", fontStyle: "bold", textColor: [255, 68, 34] }
          },
          didParseCell: (data) => {
            if (data.row.index === tbl5Body.length - 1) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [255, 235, 230];
            }
          }
        });
      }

      doc.save(`Tadaima_Reporte_Ventas_${from}_${to}.pdf`);
      toast.success("PDF generado exitosamente!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Hubo un error al generar el PDF");
    }
}
