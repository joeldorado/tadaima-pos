// Generador del Excel del reporte. Extraído de ReportsPage.tsx (handleExportExcel)
// para separar la lógica de exportación del componente de página.
import { toast } from "sonner";
import type { Workbook } from "exceljs";
import { fmtDate } from "./reportFormat";
import type { ReportExportParams } from "./reportTypes";
import { downloadWithRetry } from "@/lib/downloadFile";
import { writeSheetModel } from "./excelSheetModel";
import { buildVentasSheetModel } from "./excelVentasModel";
import { buildVentasReportRows } from "./ventasReportRows";

type ExcelLib = Pick<typeof import("exceljs"), "Workbook">;

// Etiqueta legible del origen del dinero de un insumo.
const SUPPLY_SOURCE_LABEL: Record<string, string> = {
  caja: "Caja",
  caja_chica: "Caja chica",
  propio: "Dinero propio",
};

/**
 * Arma el libro de Excel del reporte, sin toast ni descarga (la librería llega
 * inyectada), para poder generarlo y leerlo de vuelta en un test.
 */
export function buildReportWorkbook(ExcelJS: ExcelLib, params: ReportExportParams): Workbook {
  const {
    groupedProducts, paymentBreakdown, invReport, topReport, custReport,
    from, to, today, activeTab, canViewCost, ivaRate, effectiveStoreId,
    selectedUserId, stores, users, supplyMovements, presaleRows,
  } = params;

      const workbook = new ExcelJS.Workbook();

      workbook.creator = "Tadaima POS";
      workbook.lastModifiedBy = "Tadaima POS";
      workbook.created = new Date();
      workbook.modified = new Date();

      if (activeTab === "ventas") {
        // Hoja "Ventas" con el formato que pidió el equipo (2026-10-03): bloques por
        // método (Efectivo · Tarjeta · Transferencias), tomos al final con subtotal
        // "Manga Nacional", fórmulas y detalle por ticket. Ver excelVentasModel.ts.
        const storeName = !effectiveStoreId ? "Todas" : stores.find((s) => s.id === effectiveStoreId)?.name || "Todas";
        const userName = !selectedUserId ? "Todos" : users.find((u) => u.id === selectedUserId)?.name || "Todos";
        const model = buildVentasSheetModel({
          subtitle: `Periodo: ${fmtDate(from)} al ${fmtDate(to)}  |  Tienda: ${storeName}  |  Usuario: ${userName}`,
          rows: buildVentasReportRows(groupedProducts),
          presaleRows,
          paymentBreakdown,
          canViewCost,
          ivaRate,
          supplies: supplyMovements.map((m) => {
            const origin = SUPPLY_SOURCE_LABEL[m.money_source ?? "caja"] ?? (m.money_source ?? "—");
            return {
              name: m.supply?.name ?? "Insumo",
              note: m.note ?? "",
              origin: m.money_source === "propio" && m.payer_name ? `${origin} · ${m.payer_name}` : origin,
              user: m.user?.name ?? "—",
              store: m.supply?.store_id
                ? (stores.find((s) => s.id === m.supply?.store_id)?.name ?? `Tienda ${m.supply?.store_id}`)
                : "Toda la empresa",
              amount: m.amount || 0,
            };
          }),
        });
        writeSheetModel(workbook.addWorksheet("Ventas"), model);
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

  return workbook;
}

export async function exportReportExcel(params: ReportExportParams): Promise<void> {
    try {
      toast.info("Generando archivo de Excel...");
      const workbook = buildReportWorkbook(await import("exceljs"), params);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      downloadWithRetry(blob, `tadaima_reporte_${params.activeTab}_${params.from}_${params.to}${params.fileSuffix ? `_${params.fileSuffix}` : ""}.xlsx`);
    } catch (error) {
      console.error(error);
      toast.error("Error al exportar a Excel");
    }
}
