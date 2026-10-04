// Generador del Excel del reporte. Extraído de ReportsPage.tsx (handleExportExcel)
// para separar la lógica de exportación del componente de página. La hoja de
// Ventas (también la de los cortes de caja) vive en excelVentas.ts.
import { toast } from "sonner";
import { fmtDate } from "./reportFormat";
import type { ReportExportParams } from "./reportTypes";
import { downloadWithRetry } from "@/lib/downloadFile";
import { addVentasSheet } from "./excelVentas";

export async function exportReportExcel(params: ReportExportParams): Promise<void> {
  const { invReport, topReport, custReport, from, to, today, activeTab } = params;

    try {
      toast.info("Generando archivo de Excel...");
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      
      workbook.creator = "Tadaima POS";
      workbook.lastModifiedBy = "Tadaima POS";
      workbook.created = new Date();
      workbook.modified = new Date();
      
      if (activeTab === "ventas") {
        // Réplica del Excel de la app (2026-10-03): ver excelVentas.ts.
        addVentasSheet(workbook, params);
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
          row.getCell(6).numFmt = "$#,##0.00";
          row.getCell(6).font = { bold: true, color: { argb: "FF009944" } };
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
      downloadWithRetry(blob, `tadaima_reporte_${activeTab}_${from}_${to}${params.fileSuffix ? `_${params.fileSuffix}` : ""}.xlsx`);
    } catch (error) {
      console.error(error);
      // El motivo en el aviso: sin él no hay forma de diagnosticar desde la caja.
      const reason = error instanceof Error ? error.message : String(error);
      toast.error(`Error al exportar a Excel: ${reason}`);
    }
}
