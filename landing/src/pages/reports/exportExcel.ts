// Generador del Excel del reporte. Extraído de ReportsPage.tsx (handleExportExcel)
// para separar la lógica de exportación del componente de página.
import { toast } from "sonner";
import { fmt, fmtDate } from "./reportFormat";
import type { ReportExportParams } from "./reportTypes";

export async function exportReportExcel(params: ReportExportParams): Promise<void> {
  const {
    groupedProducts, paymentBreakdown, invReport, topReport, custReport,
    from, to, today, activeTab, canViewCost, ivaRate, effectiveStoreId,
    selectedUserId, stores, users,
  } = params;
    try {
      toast.info("Generando archivo de Excel...");
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      
      workbook.creator = "Tadaima POS";
      workbook.lastModifiedBy = "Tadaima POS";
      workbook.created = new Date();
      workbook.modified = new Date();
      
      if (activeTab === "ventas") {
        const sheet = workbook.addWorksheet("Ventas");

        sheet.mergeCells("A1:G1");
        const titleCell = sheet.getCell("A1");
        titleCell.value = "TADAIMA - REPORTE DE AUDITORÍA Y VENTAS";
        titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
        titleCell.alignment = { vertical: "middle", horizontal: "center" };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCC2200" } };
        sheet.getRow(1).height = 35;

        sheet.mergeCells("A2:G2");
        const subtitleCell = sheet.getCell("A2");
        subtitleCell.value = `Periodo: ${fmtDate(from)} al ${fmtDate(to)}  |  Tienda: ${!effectiveStoreId ? "Todas" : stores.find((s) => s.id === effectiveStoreId)?.name || "Todas"}  |  Usuario: ${!selectedUserId ? "Todos" : users.find((u) => u.id === selectedUserId)?.name || "Todos"}`;
        subtitleCell.font = { name: "Arial", size: 10, italic: true };
        subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
        sheet.getRow(2).height = 20;

        // Payment Breakdown Overview
        sheet.mergeCells("A4:G4");
        const overviewCell = sheet.getCell("A4");
        overviewCell.value = "INGRESOS COBRADOS EN CAJA (CONCEPTO VS MONTO NETO REAL DEL PERIODO)";
        overviewCell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FF666666" } };
        overviewCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F8F8" } };
        overviewCell.alignment = { vertical: "middle", horizontal: "center" };
        sheet.getRow(4).height = 24;

        sheet.getCell("A5").value = `Total Bruto: ${fmt(paymentBreakdown.total)}`;
        sheet.getCell("C5").value = `Efectivo: ${fmt(paymentBreakdown.cash)}`;
        sheet.getCell("E5").value = `Tarjetas: ${fmt(paymentBreakdown.card)}`;
        sheet.getCell("G5").value = `Depósitos: ${fmt(paymentBreakdown.deposits)}`;
        sheet.getRow(5).font = { name: "Arial", size: 10, bold: true, color: { argb: "FF333333" } };
        sheet.getRow(5).height = 20;

        const tableStartRow = 8;
        
        // Definitions for filtered products
        const cardProducts = groupedProducts.filter(prod => 
          Object.keys(prod.payment_breakdown).some(m => m.toLowerCase().includes("tarjeta") || m.toLowerCase().includes("credit") || m.toLowerCase().includes("debito") || m.toLowerCase().includes("tpv") || m.toLowerCase().includes("terminal"))
        );
        const cashProducts = groupedProducts.filter(prod => 
          Object.keys(prod.payment_breakdown).some(m => m.toLowerCase().includes("efectivo") || m.toLowerCase().includes("cash") || m.toLowerCase().includes("dolar") || m.toLowerCase().includes("dólar") || m.toLowerCase().includes("usd") || m.toLowerCase().includes("otro") || m.toLowerCase().includes("unmapped"))
        );
        const presaleProducts = groupedProducts.filter(prod => 
          ((prod.pre_sale_apartado && prod.pre_sale_apartado > 0) || (prod.pre_sale_deuda && prod.pre_sale_deuda > 0))
        );
        const returnedProducts = groupedProducts.filter(prod => 
          (prod.returned_revenue && prod.returned_revenue > 0) || 
          (prod.returned_quantity && prod.returned_quantity > 0)
        );

        // Helper to set cells
        const setCell = (r: number, c: number, value: any, options?: any) => {
            const cell = sheet.getCell(r, c);
            cell.value = value;
            if (options) {
                if (options.font) cell.font = options.font;
                if (options.alignment) cell.alignment = options.alignment;
                if (options.fill) cell.fill = options.fill;
                if (options.numFmt) cell.numFmt = options.numFmt;
            }
        };

        const setHeader = (r: number, cStart: number, cEnd: number, title: string, bgColor: string) => {
            const startColName = sheet.getColumn(cStart).letter;
            const endColName = sheet.getColumn(cEnd).letter;
            sheet.mergeCells(`${startColName}${r}:${endColName}${r}`);
            setCell(r, cStart, title, {
                font: { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } },
                fill: { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } },
                alignment: { vertical: "middle", horizontal: "center" }
            });
            sheet.getRow(r).height = 25;
        };

        const setSubHeaderRow = (r: number, cStart: number, headers: string[], bgColor: string) => {
            headers.forEach((h, i) => {
                setCell(r, cStart + i, h, {
                    font: { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } },
                    fill: { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } },
                    alignment: { vertical: "middle", horizontal: "center" }
                });
            });
            sheet.getRow(r).height = 20;
        };

        const ivaLabel = `IVA (${Math.round(ivaRate * 100)}%)`;

        // Table Offsets
        // Efectivo:  Producto · Cant · [Costo] · Venta · [Utilidad]   (Costo/Utilidad solo si canViewCost)
        const T2_COL = 1; // Efectivo
        const T2_COLS = canViewCost ? 5 : 3;

        // Tarjeta:  Producto · Cant · Bruto · [Costo] · Comisión · IVA · Neto · [Utilidad]
        const T3_COL = T2_COL + T2_COLS + 3; // Tarjeta
        const T3_COLS = canViewCost ? 8 : 6;

        const T4_COL = T3_COL + T3_COLS + 3; // Preventa
        const T4_COLS = canViewCost ? 7 : 5;

        const T5_COL = T4_COL + T4_COLS + 3; // Devoluciones
        const T5_COLS = 3;

        // Draw Section Headers
        setHeader(tableStartRow, T2_COL, T2_COL + T2_COLS - 1, " 1. VENTAS EN EFECTIVO", "FF33BB66");
        setHeader(tableStartRow, T3_COL, T3_COL + T3_COLS - 1, " 2. DESGLOSE DE COBROS CON TARJETA", "FF2266BB");
        setHeader(tableStartRow, T4_COL, T4_COL + T4_COLS - 1, " 3. APARTADOS Y PREVENTAS", "FFAA66FF");
        setHeader(tableStartRow, T5_COL, T5_COL + T5_COLS - 1, " 4. DEVOLUCIONES Y CANCELACIONES", "FFFF7755");

        const hrRow = tableStartRow + 1;

        // Draw Column Headers
        setSubHeaderRow(hrRow, T2_COL, ["Producto", "Cant. Efectivo", ...(canViewCost ? ["Costo Producto"] : []), "Venta Efectivo", ...(canViewCost ? ["Utilidad Efectivo"] : [])], "FF55CC77");
        setSubHeaderRow(hrRow, T3_COL, ["Producto", "Cant. Tarjeta", "Bruto Tarjeta", ...(canViewCost ? ["Costo Producto"] : []), "Comisión TPV", ivaLabel, "Neto Tarjeta", ...(canViewCost ? ["Utilidad Tarjeta"] : [])], "FF4488DD");
        setSubHeaderRow(hrRow, T4_COL, ["Producto", "Cant. Preventa", "Abonado", "Pendiente", "Pactado", ...(canViewCost ? ["Costo Producto", "Utilidad"] : [])], "FFCC88FF");
        setSubHeaderRow(hrRow, T5_COL, ["Producto", "Cant. Devuelta", "Monto Devuelto"], "FFFF8866");

        // We will keep a separate row pointer for each table, starting at tableStartRow + 2
        let r2 = tableStartRow + 2;
        let r3 = tableStartRow + 2;
        let r4 = tableStartRow + 2;
        let r5 = tableStartRow + 2;

        // Estilos para las filas de TOTAL (fondo gris claro + negrita).
        const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
        const totalLabelOpts = { font: { name: "Arial", size: 9, bold: true, color: { argb: "FF111111" } }, fill: TOTAL_FILL, alignment: { horizontal: "left", vertical: "middle" } };
        const totalQtyOpts = { font: { name: "Arial", size: 9, bold: true, color: { argb: "FF111111" } }, fill: TOTAL_FILL, alignment: { horizontal: "center", vertical: "middle" } };
        const totalMoneyOpts = (argb: string) => ({ numFmt: "$#,##0.00", font: { name: "Arial", size: 9, bold: true, color: { argb } }, fill: TOTAL_FILL, alignment: { horizontal: "right", vertical: "middle" } });

        // TABLE 2: EFECTIVO  →  Producto · Cant · [Costo] · Venta · [Utilidad]
        // Columnas de Costo (T2_COL+2) y Utilidad (T2_COL+4) solo si canViewCost.
        const cashVentaCol = canViewCost ? T2_COL + 3 : T2_COL + 2;
        let totCashQty = 0, totCashCost = 0, totCashRevenue = 0, totCashProfit = 0;
        cashProducts.forEach((prod) => {
            let cashQty = 0;
            let cashRevenue = 0;
            Object.entries(prod.payment_breakdown).forEach(([method, data]) => {
                const isCashMethodName = method.toLowerCase().includes("efectivo") || method.toLowerCase().includes("cash");
                if (isCashMethodName) {
                    cashQty += data.qty;
                    cashRevenue += data.revenue;
                }
            });
            const ratio = prod.total_revenue > 0 ? (cashRevenue / prod.total_revenue) : 0;
            const cashCost = (prod.total_cost || 0) * ratio;
            const cashProfit = (prod.total_profit || 0) * ratio;
            totCashQty += cashQty; totCashCost += cashCost; totCashRevenue += cashRevenue; totCashProfit += cashProfit;

            setCell(r2, T2_COL, prod.name, { alignment: { horizontal: "left", vertical: "middle", wrapText: true } });
            setCell(r2, T2_COL + 1, cashQty, { alignment: { horizontal: "center", vertical: "middle" } });
            if (canViewCost) {
                setCell(r2, T2_COL + 2, cashCost, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, color: { argb: "FF444444" } }, alignment: { horizontal: "right", vertical: "middle" } });
            }
            setCell(r2, cashVentaCol, cashRevenue, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, bold: true, color: { argb: "FF009944" } }, alignment: { horizontal: "right", vertical: "middle" } });
            if (canViewCost) {
                setCell(r2, T2_COL + 4, cashProfit, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, bold: true, color: { argb: "FF009944" } }, alignment: { horizontal: "right", vertical: "middle" } });
            }
            sheet.getRow(r2).height = 20;
            r2++;
        });
        if (cashProducts.length > 0) {
            setCell(r2, T2_COL, "TOTAL EFECTIVO", totalLabelOpts);
            setCell(r2, T2_COL + 1, totCashQty, totalQtyOpts);
            if (canViewCost) setCell(r2, T2_COL + 2, totCashCost, totalMoneyOpts("FF444444"));
            setCell(r2, cashVentaCol, totCashRevenue, totalMoneyOpts("FF009944"));
            if (canViewCost) setCell(r2, T2_COL + 4, totCashProfit, totalMoneyOpts("FF009944"));
            sheet.getRow(r2).height = 20;
            r2++;
        }

        // TABLE 3: TARJETA
        // TABLE 3: TARJETA  →  Producto · Cant · Bruto · [Costo] · Comisión · IVA · Neto · [Utilidad]
        // La columna Costo (T3_COL+3) solo aparece con canViewCost; las de comisión/IVA/neto
        // se recorren una posición cuando está presente.
        const cardCostCol = T3_COL + 3;
        const cardCommCol = canViewCost ? T3_COL + 4 : T3_COL + 3;
        const cardIvaCol  = canViewCost ? T3_COL + 5 : T3_COL + 4;
        const cardNetCol  = canViewCost ? T3_COL + 6 : T3_COL + 5;
        const cardProfitCol = T3_COL + 7;
        let totCardQty = 0, totCardRevenue = 0, totCardCost = 0, totCardComm = 0, totCardIva = 0, totCardNet = 0, totCardProfit = 0;
        cardProducts.forEach((prod) => {
            let cardQty = 0;
            let cardRevenue = 0;
            Object.entries(prod.payment_breakdown).forEach(([method, data]) => {
                const isCardMethodName = method.toLowerCase().includes("tarjeta") || method.toLowerCase().includes("credit") || method.toLowerCase().includes("debito") || method.toLowerCase().includes("tpv") || method.toLowerCase().includes("terminal");
                if (isCardMethodName) {
                    cardQty += data.qty;
                    cardRevenue += data.revenue;
                }
            });

            const prodComm = prod.commission_amount || 0;
            const prodIva = prodComm * ivaRate;
            const netCard = cardRevenue - prodComm - prodIva;
            const ratio = prod.total_revenue > 0 ? (cardRevenue / prod.total_revenue) : 0;
            const cardCost = (prod.total_cost || 0) * ratio;
            const baseProfit = (prod.total_profit || 0) * ratio;
            const cardProfit = baseProfit - prodComm - prodIva;
            totCardQty += cardQty; totCardRevenue += cardRevenue; totCardCost += cardCost; totCardComm += prodComm; totCardIva += prodIva; totCardNet += netCard; totCardProfit += cardProfit;

            setCell(r3, T3_COL, prod.name, { alignment: { horizontal: "left", vertical: "middle", wrapText: true } });
            setCell(r3, T3_COL + 1, cardQty, { alignment: { horizontal: "center", vertical: "middle" } });
            setCell(r3, T3_COL + 2, cardRevenue, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, color: { argb: "FF444444" } }, alignment: { horizontal: "right", vertical: "middle" } });
            if (canViewCost) {
                setCell(r3, cardCostCol, cardCost, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, color: { argb: "FF444444" } }, alignment: { horizontal: "right", vertical: "middle" } });
            }
            setCell(r3, cardCommCol, prodComm, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, color: { argb: "FFFF2200" } }, alignment: { horizontal: "right", vertical: "middle" } });
            setCell(r3, cardIvaCol, prodIva, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, color: { argb: "FFF59E0B" } }, alignment: { horizontal: "right", vertical: "middle" } });
            setCell(r3, cardNetCol, netCard, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, bold: true, color: { argb: "FF009944" } }, alignment: { horizontal: "right", vertical: "middle" } });
            if (canViewCost) {
                setCell(r3, cardProfitCol, cardProfit, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, bold: true, color: { argb: "FF009944" } }, alignment: { horizontal: "right", vertical: "middle" } });
            }
            sheet.getRow(r3).height = 20;
            r3++;
        });
        if (cardProducts.length > 0) {
            setCell(r3, T3_COL, "TOTAL TARJETA", totalLabelOpts);
            setCell(r3, T3_COL + 1, totCardQty, totalQtyOpts);
            setCell(r3, T3_COL + 2, totCardRevenue, totalMoneyOpts("FF444444"));
            if (canViewCost) setCell(r3, cardCostCol, totCardCost, totalMoneyOpts("FF444444"));
            setCell(r3, cardCommCol, totCardComm, totalMoneyOpts("FFFF2200"));
            setCell(r3, cardIvaCol, totCardIva, totalMoneyOpts("FFF59E0B"));
            setCell(r3, cardNetCol, totCardNet, totalMoneyOpts("FF009944"));
            if (canViewCost) setCell(r3, cardProfitCol, totCardProfit, totalMoneyOpts("FF009944"));
            sheet.getRow(r3).height = 20;
            r3++;
        }

        // TABLE 4: PREVENTAS
        // Campos correctos: pre_sale_apartado (abonado) y pre_sale_deuda (pendiente).
        // Pactado = abonado + pendiente (igual que el PDF y la vista en pantalla).
        let totPreQty = 0, totPreDeposit = 0, totPrePending = 0, totPrePactado = 0, totPreCost = 0, totPreUtilidad = 0;
        presaleProducts.forEach((prod) => {
            const deposit = prod.pre_sale_apartado || 0;
            const pending = prod.pre_sale_deuda || 0;
            const pactado = deposit + pending;
            // Costo real snapshot del folio (anticipos incluidos), no total_cost:
            // total_cost solo se llena el día de entrega (Opción B) y dejaba $0
            // en anticipos aunque el costo sí existiera.
            const cost = prod.pre_sale_costo_real || 0;
            const utilidad = pactado - cost; // Utilidad esperada al liquidar el folio.
            totPreQty += prod.sales_count || 0; totPreDeposit += deposit; totPrePending += pending; totPrePactado += pactado; totPreCost += cost; totPreUtilidad += utilidad;
            setCell(r4, T4_COL, prod.name, { alignment: { horizontal: "left", vertical: "middle", wrapText: true } });
            setCell(r4, T4_COL + 1, prod.sales_count, { alignment: { horizontal: "center", vertical: "middle" } });
            setCell(r4, T4_COL + 2, deposit, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, bold: true, color: { argb: "FF009944" } }, alignment: { horizontal: "right", vertical: "middle" } });
            setCell(r4, T4_COL + 3, pending, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, bold: true, color: { argb: "FFFF2200" } }, alignment: { horizontal: "right", vertical: "middle" } });
            setCell(r4, T4_COL + 4, pactado, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, color: { argb: "FF444444" } }, alignment: { horizontal: "right", vertical: "middle" } });
            if (canViewCost) {
                setCell(r4, T4_COL + 5, cost, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, color: { argb: "FF444444" } }, alignment: { horizontal: "right", vertical: "middle" } });
                setCell(r4, T4_COL + 6, utilidad, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, bold: true, color: { argb: utilidad < 0 ? "FFFF2200" : "FF009944" } }, alignment: { horizontal: "right", vertical: "middle" } });
            }
            sheet.getRow(r4).height = 20;
            r4++;
        });
        if (presaleProducts.length > 0) {
            setCell(r4, T4_COL, "TOTAL PREVENTAS", totalLabelOpts);
            setCell(r4, T4_COL + 1, totPreQty, totalQtyOpts);
            setCell(r4, T4_COL + 2, totPreDeposit, totalMoneyOpts("FF009944"));
            setCell(r4, T4_COL + 3, totPrePending, totalMoneyOpts("FFFF2200"));
            setCell(r4, T4_COL + 4, totPrePactado, totalMoneyOpts("FF444444"));
            if (canViewCost) setCell(r4, T4_COL + 5, totPreCost, totalMoneyOpts("FF444444"));
            if (canViewCost) setCell(r4, T4_COL + 6, totPreUtilidad, totalMoneyOpts(totPreUtilidad < 0 ? "FFFF2200" : "FF009944"));
            sheet.getRow(r4).height = 20;
            r4++;
        }

        // TABLE 5: DEVOLUCIONES
        let totRetQty = 0, totRetRevenue = 0;
        returnedProducts.forEach((prod) => {
            totRetQty += prod.returned_quantity || 0; totRetRevenue += prod.returned_revenue || 0;
            setCell(r5, T5_COL, prod.name, { alignment: { horizontal: "left", vertical: "middle", wrapText: true } });
            setCell(r5, T5_COL + 1, prod.returned_quantity || 0, { alignment: { horizontal: "center", vertical: "middle", font: { color: { argb: "FFFF2200" }, bold: true } } });
            setCell(r5, T5_COL + 2, prod.returned_revenue || 0, { numFmt: "$#,##0.00", font: { name: "Arial", size: 9, bold: true, color: { argb: "FFFF2200" } }, alignment: { horizontal: "right", vertical: "middle" } });
            sheet.getRow(r5).height = 20;
            r5++;
        });
        if (returnedProducts.length > 0) {
            setCell(r5, T5_COL, "TOTAL DEVOLUCIONES", totalLabelOpts);
            setCell(r5, T5_COL + 1, totRetQty, totalQtyOpts);
            setCell(r5, T5_COL + 2, totRetRevenue, totalMoneyOpts("FFFF2200"));
            sheet.getRow(r5).height = 20;
            r5++;
        }

        // Set column widths explicitly
        const colWidths = {
            [T2_COL]: 28, [T2_COL + 1]: 14, [T2_COL + 2]: 15, [T2_COL + 3]: 15, [T2_COL + 4]: 15,
            [T3_COL]: 28, [T3_COL + 1]: 14, [T3_COL + 2]: 13.5, [T3_COL + 3]: 13.5, [T3_COL + 4]: 13.5, [T3_COL + 5]: 13.5, [T3_COL + 6]: 13.5, [T3_COL + 7]: 13.5,
            [T4_COL]: 28, [T4_COL + 1]: 14, [T4_COL + 2]: 15, [T4_COL + 3]: 15, [T4_COL + 4]: 15, [T4_COL + 5]: 15, [T4_COL + 6]: 15,
            [T5_COL]: 28, [T5_COL + 1]: 14, [T5_COL + 2]: 15
        };

        Object.entries(colWidths).forEach(([colStr, width]) => {
            const colIdx = parseInt(colStr);
            const column = sheet.getColumn(colIdx);
            column.width = width;
        });

        // ─── Tabla de EGRESOS (placeholder) ──────────────────────────────────────
        // Los datos de egresos aún están en construcción en el backend. Por ahora
        // dejamos la tabla vacía (Nombre · Descripción · Cantidad) para captura
        // manual; cuando exista el endpoint se llenará desde aquí.
        const egresosRow = Math.max(r2, r3, r4, r5) + 2;
        setHeader(egresosRow, T2_COL, T2_COL + 2, " 5. EGRESOS", "FFCC7722");
        setSubHeaderRow(egresosRow + 1, T2_COL, ["Nombre", "Descripción", "Cantidad"], "FFDD9944");
        // Filas en blanco con borde para captura manual.
        for (let i = 0; i < 5; i++) {
            const er = egresosRow + 2 + i;
            setCell(er, T2_COL, "", { alignment: { horizontal: "left", vertical: "middle" } });
            setCell(er, T2_COL + 1, "", { alignment: { horizontal: "left", vertical: "middle" } });
            setCell(er, T2_COL + 2, "", { numFmt: "$#,##0.00", alignment: { horizontal: "right", vertical: "middle" } });
            sheet.getRow(er).height = 18;
        }

} else if (activeTab === "inventario") {
        const sheet = workbook.addWorksheet("Inventario");
        sheet.mergeCells("A1:E1");
        const titleCell = sheet.getCell("A1");
        titleCell.value = "TADAIMA - REPORTE DE INVENTARIO";
        titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
        titleCell.alignment = { vertical: "middle", horizontal: "center" };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF4422" } };
        sheet.getRow(1).height = 35;

        sheet.mergeCells("A2:E2");
        const subtitleCell = sheet.getCell("A2");
        subtitleCell.value = `Exportado: ${fmtDate(today)} ${new Date().toLocaleTimeString()}`;
        subtitleCell.font = { name: "Arial", size: 10, italic: true };
        subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
        sheet.getRow(2).height = 20;

        sheet.addRow([]);

        const headerRow = sheet.addRow(["Producto", "Bodega", "Tienda", "Cantidad"]);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF333333" } };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        });

        invReport?.data.forEach((r) => {
          const row = sheet.addRow([
            r.product.name,
            r.warehouse.name,
            r.warehouse.store ?? "—",
            r.quantity
          ]);
          row.getCell(2).alignment = { horizontal: "center" };
          row.getCell(3).alignment = { horizontal: "center" };
          row.getCell(4).alignment = { horizontal: "center" };
          if (r.quantity <= 5) {
            row.getCell(4).font = { bold: true, color: { argb: "FFFF2200" } };
          } else if (r.quantity <= 10) {
            row.getCell(4).font = { bold: true, color: { argb: "FFFFAA00" } };
          } else {
            row.getCell(4).font = { bold: true, color: { argb: "FF009944" } };
          }
        });

        sheet.columns.forEach((column) => {
          if (column.values) {
            let maxLength = 0;
            column.values.forEach((v) => {
              if (v) {
                const strLen = String(v).length;
                if (strLen > maxLength) maxLength = strLen;
              }
            });
            column.width = Math.min(Math.max(maxLength + 3, 10), 40);
          }
        });
      } else if (activeTab === "productos") {
        const sheet = workbook.addWorksheet("Top Productos");
        sheet.mergeCells("A1:G1");
        const titleCell = sheet.getCell("A1");
        titleCell.value = "TADAIMA - TOP PRODUCTOS VENDIDOS";
        titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
        titleCell.alignment = { vertical: "middle", horizontal: "center" };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF4422" } };
        sheet.getRow(1).height = 35;

        sheet.mergeCells("A2:G2");
        const subtitleCell = sheet.getCell("A2");
        subtitleCell.value = `Periodo: ${fmtDate(from)} al ${fmtDate(to)}  |  Exportado: ${fmtDate(today)} ${new Date().toLocaleTimeString()}`;
        subtitleCell.font = { name: "Arial", size: 10, italic: true };
        subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
        sheet.getRow(2).height = 20;

        sheet.addRow([]);

        const headerRow = sheet.addRow(["Lugar", "Nombre", "Tipo", "Veces Vendido", "Unidades Vendidas", "Ingresos Totales"]);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF333333" } };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        });

        topReport?.data.forEach((r, idx) => {
          const row = sheet.addRow([
            idx + 1,
            r.name,
            r.type,
            r.times_sold,
            r.total_quantity,
            r.total_revenue
          ]);
          row.getCell(1).alignment = { horizontal: "center" };
          row.getCell(3).alignment = { horizontal: "center" };
          row.getCell(4).alignment = { horizontal: "center" };
          row.getCell(5).alignment = { horizontal: "center" };
          row.getCell(6).alignment = { horizontal: "center" };
          row.getCell(7).numFmt = "$#,##0.00";
          row.getCell(7).font = { bold: true, color: { argb: "FF009944" } };
        });

        sheet.columns.forEach((column) => {
          if (column.values) {
            let maxLength = 0;
            column.values.forEach((v) => {
              if (v) {
                const strLen = String(v).length;
                if (strLen > maxLength) maxLength = strLen;
              }
            });
            column.width = Math.min(Math.max(maxLength + 3, 10), 40);
          }
        });
      } else if (activeTab === "clientes") {
        const sheet = workbook.addWorksheet("Top Clientes");
        sheet.mergeCells("A1:F1");
        const titleCell = sheet.getCell("A1");
        titleCell.value = "TADAIMA - TOP CLIENTES";
        titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
        titleCell.alignment = { vertical: "middle", horizontal: "center" };
        titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF4422" } };
        sheet.getRow(1).height = 35;

        sheet.mergeCells("A2:F2");
        const subtitleCell = sheet.getCell("A2");
        subtitleCell.value = `Periodo: ${fmtDate(from)} al ${fmtDate(to)}  |  Exportado: ${fmtDate(today)} ${new Date().toLocaleTimeString()}`;
        subtitleCell.font = { name: "Arial", size: 10, italic: true };
        subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
        sheet.getRow(2).height = 20;

        sheet.addRow([]);

        const headerRow = sheet.addRow(["Lugar", "Cliente", "Teléfono", "Compras", "Total Gastado", "Crédito"]);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF333333" } };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        });

        custReport?.data.forEach((r, idx) => {
          const row = sheet.addRow([
            idx + 1,
            r.name,
            r.phone ?? "—",
            r.total_purchases,
            r.total_spent,
            r.credit_balance
          ]);
          row.getCell(1).alignment = { horizontal: "center" };
          row.getCell(3).alignment = { horizontal: "center" };
          row.getCell(4).alignment = { horizontal: "center" };
          row.getCell(5).numFmt = "$#,##0.00";
          row.getCell(5).font = { bold: true, color: { argb: "FF009944" } };
          row.getCell(6).numFmt = "$#,##0.00";
        });

        sheet.columns.forEach((column) => {
          if (column.values) {
            let maxLength = 0;
            column.values.forEach((v) => {
              if (v) {
                const strLen = String(v).length;
                if (strLen > maxLength) maxLength = strLen;
              }
            });
            column.width = Math.min(Math.max(maxLength + 3, 10), 40);
          }
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tadaima_reporte_${activeTab}_${from}_${to}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Excel descargado correctamente");
    } catch (error) {
      console.error(error);
      toast.error("Error al exportar a Excel");
    }
}
