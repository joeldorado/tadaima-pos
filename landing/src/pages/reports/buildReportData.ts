// Lógica de cálculo del Reporte de Ventas, extraída de ReportsPage.tsx.
//
// Son funciones PURAS: reciben los datos ya traídos y devuelven las estructuras
// que consumen la tabla, el Excel y el PDF. Se extrajeron para poder generar el
// MISMO reporte desde el corte de caja (CloseCashModal) sin duplicar reglas —
// duplicarlas garantizaba que se desincronizaran al primer cambio.
//
// El código es un MOVIMIENTO literal de los useMemo originales: mismas reglas de
// neteo de cancelaciones, split por costo, prorrateo de preventas y descuentos v2.
import type { SaleDetail, PreSaleOrder, PreSaleOrderPayment } from "@tadaima/api";
import { toLocalYmd } from "@/lib/date";
import type { GroupedProduct, PresaleRow, ReportPaymentBreakdown } from "./reportTypes";

// ─── IVA sobre comisión de terminal ──────────────────────────────────────────
// Configurable por el usuario y guardada en localStorage; vive aquí para que el
// Reporte y el corte de caja usen exactamente la misma tasa.
export const DEFAULT_IVA_COMISION_PCT = 16;
export const IVA_PCT_STORAGE_KEY = "tadaima:iva-comision-pct";
export const readIvaRate = (): number => {
  try {
    const raw = localStorage.getItem(IVA_PCT_STORAGE_KEY);
    if (raw === null || raw.trim() === "") return DEFAULT_IVA_COMISION_PCT / 100;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 && v <= 100 ? v / 100 : DEFAULT_IVA_COMISION_PCT / 100;
  } catch {
    return DEFAULT_IVA_COMISION_PCT / 100;
  }
};

/** Filtro de la barra de Ventas (Todo / Efectivo / Tarjeta / …). */
export type SalesHistoryFilter =
  | "all" | "cash" | "dollar" | "card" | "transfer" | "preSales" | "cancelled" | "notPicked";

/** Pagos de preventa cuya fecha cae dentro del rango (día-negocio local). */
export function presalePaymentsInRange(
  payments: PreSaleOrderPayment[] | null | undefined,
  from: string,
  to: string,
): PreSaleOrderPayment[] {
  return (payments ?? []).filter((p) => {
    const ymd = toLocalYmd(new Date(p.created_at));
    return ymd >= from && ymd <= to;
  });
}

/** Folios de preventa que matchean los filtros activos de la barra. */
export function filterPreSaleOrders(
  preSaleOrders: PreSaleOrder[],
  selectedFilters: SalesHistoryFilter[],
): PreSaleOrder[] {
    const isCardMethod = (name: string) =>
      name.includes("tarjeta") || name.includes("credit") || name.includes("debito") || name.includes("tpv") || name.includes("terminal");
    const isCashMethod = (name: string) =>
      name.includes("efectivo") || name.includes("cash");
    const isDollarMethod = (name: string) =>
      name.includes("dolar") || name.includes("dólar") || name.includes("usd");
    const isTransferMethod = (name: string) =>
      name.includes("transfer") || name.includes("deposit") || name.includes("spei");

    return preSaleOrders.filter((order) => {
      const orderStatus = (order.status ?? "").toLowerCase();
      const orderIsCancelled = orderStatus.includes("cancel");
      const orderIsNotPicked = orderStatus.includes("expired") || orderStatus.includes("vencid") || orderStatus.includes("no recog");

      const methods = (order.payments ?? [])
        .map((p) => (p.payment_method?.name ?? "").toLowerCase())
        .filter(Boolean);

      if (selectedFilters.includes("all") || selectedFilters.length === 0) return true;

      return selectedFilters.some((filter) => {
        if (filter === "cash") return methods.some((m) => isCashMethod(m) || isDollarMethod(m)) || (methods.length === 0);
        if (filter === "dollar") return methods.some((m) => isDollarMethod(m));
        if (filter === "card") return methods.some((m) => isCardMethod(m));
        if (filter === "transfer") return methods.some((m) => isTransferMethod(m));
        if (filter === "preSales") return true;
        if (filter === "cancelled") return orderIsCancelled;
        if (filter === "notPicked") return orderIsNotPicked;
        return false;
      });
    });
}

/** Ventas que matchean los filtros activos de la barra. */
export function filterSales(
  sales: SaleDetail[],
  selectedFilters: SalesHistoryFilter[],
): SaleDetail[] {
    const isCardMethod = (name: string) =>
      name.includes("tarjeta") || name.includes("credit") || name.includes("debito") || name.includes("tpv") || name.includes("terminal");
    const isCashMethod = (name: string) =>
      name.includes("efectivo") || name.includes("cash");
    const isDollarMethod = (name: string) =>
      name.includes("dolar") || name.includes("dólar") || name.includes("usd");
    const isTransferMethod = (name: string) =>
      name.includes("transfer") || name.includes("deposit") || name.includes("spei");

    return sales.filter((sale) => {
      const methods = (sale.payments ?? [])
        .map((p) => (p.payment_method?.name ?? "").toLowerCase())
        .filter(Boolean);
      const hasPreSales = (sale.pre_sale_orders?.length ?? 0) > 0;
      const hasCancelled = (sale.cancellation_status && sale.cancellation_status !== "none")
        || (sale.status ?? "").toLowerCase().includes("cancel")
        || (sale.status ?? "").toLowerCase().includes("return");
      const hasNotPicked = (sale.pre_sale_orders ?? []).some((o) => {
        const status = (o.status ?? "").toLowerCase();
        return status.includes("expired") || status.includes("vencid") || status.includes("no recog");
      });

      if (selectedFilters.includes("all") || selectedFilters.length === 0) return true;

      return selectedFilters.some((filter) => {
        if (filter === "cash") return methods.some((m) => isCashMethod(m) || isDollarMethod(m));
        if (filter === "dollar") return methods.some((m) => isDollarMethod(m));
        if (filter === "card") return methods.some((m) => isCardMethod(m));
        if (filter === "transfer") return methods.some((m) => isTransferMethod(m));
        if (filter === "preSales") return hasPreSales;
        if (filter === "cancelled") return hasCancelled;
        if (filter === "notPicked") return hasNotPicked;
        return false;
      });
    });
}

/** Renglones de "Ventas por producto": agrupa ventas + preventas del rango. */
export function buildGroupedProducts(
  filteredSales: SaleDetail[],
  filteredPreSaleOrders: PreSaleOrder[],
  selectedFilters: SalesHistoryFilter[],
  from: string,
  to: string,
  canViewCost: boolean,
): GroupedProduct[] {
    const map = new Map<number | string, GroupedProduct>();

    const isCardMethod = (name: string) =>
      name.includes("tarjeta") || name.includes("credit") || name.includes("debito") || name.includes("tpv") || name.includes("terminal");
    const isCashMethod = (name: string) =>
      name.includes("efectivo") || name.includes("cash");
    const isDollarMethod = (name: string) =>
      name.includes("dolar") || name.includes("dólar") || name.includes("usd");
    const isTransferMethod = (name: string) =>
      name.includes("transfer") || name.includes("deposit") || name.includes("spei");

    for (const sale of filteredSales) {
      let payMethodName = "Otro";
      if (sale.payments && sale.payments.length > 0) {
        let mainPayment = sale.payments[0];
        if (mainPayment) {
          for (const p of sale.payments) {
            if (p && p.amount > mainPayment.amount) {
              mainPayment = p;
            }
          }
          payMethodName = mainPayment.payment_method?.name ?? "Otro";
        }
      }

      // Reparto MIXTO (efectivo + tarjeta/transferencia en un mismo ticket): en vez
      // de mandar todo el producto al método del pago más grande, se divide
      // PROPORCIONAL al monto de cada pago. Así el desglose por método (pantalla +
      // Excel/PDF) y el costo/utilidad por método quedan exactos. Un solo método → share 1.
      const totalPaid = (sale.payments ?? []).reduce((s, p) => s + (p?.amount || 0), 0);
      const methodShares: Array<{ name: string; share: number }> =
        totalPaid > 0 && sale.payments && sale.payments.length > 0
          ? sale.payments.filter(Boolean).map((p) => ({ name: p!.payment_method?.name ?? "Otro", share: (p!.amount || 0) / totalPaid }))
          : [{ name: payMethodName, share: 1 }];
      // Proporción pagada con TARJETA para atribuir promos/descuentos por método.
      // La TRANSFERENCIA cuenta como tarjeta (no entra al cajón físico).
      const isCardOrTransfer = (n: string) => isCardMethod(n) || isTransferMethod(n);
      const cardShare = totalPaid > 0
        ? (sale.payments ?? []).filter(Boolean).reduce((s, p) => s + (isCardOrTransfer((p!.payment_method?.name ?? "").toLowerCase()) ? (p!.amount || 0) : 0), 0) / totalPaid
        : (isCardOrTransfer(payMethodName.toLowerCase()) ? 1 : 0);

      const methods = (sale.payments ?? [])
        .map((p) => (p.payment_method?.name ?? "").toLowerCase())
        .filter(Boolean);
      const hasCancelled = (sale.cancellation_status && sale.cancellation_status !== "none")
        || (sale.status ?? "").toLowerCase().includes("cancel")
        || (sale.status ?? "").toLowerCase().includes("return");

      // 1. Regular items
      // NOTA: incluso las ventas TOTALMENTE canceladas se cuentan aquí en POSITIVO.
      // El bloque de cancelaciones (más abajo) las resta en negativo, de modo que
      // netean a 0 (la venta se anula) en vez de restarse sin haberse sumado —lo
      // que antes descuadraba ingresos/costo/utilidad. Fix descuadre cancelados 2026.
      for (const item of sale.items) {
        // Filter regular items using OR matching: must match at least one selected filter criteria
        const matchesRegularFilter = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.some(filter => {
          if (filter === "cash") return methods.some(m => isCashMethod(m) || isDollarMethod(m));
          if (filter === "dollar") return methods.some(m => isDollarMethod(m));
          if (filter === "card") return methods.some(m => isCardMethod(m));
          if (filter === "transfer") return methods.some(m => isTransferMethod(m));
          if (filter === "cancelled") return hasCancelled;
          return false;
        });

        if (!matchesRegularFilter) continue;

        // Producto ELIMINADO del catálogo (2026-08-18): product_id viene NULL
        // pero la línea conserva su snapshot product_name/product_sku. Se
        // agrupa por nombre (llave "del:") para que dos borrados distintos no
        // se mezclen, y el nombre lleva el flag "(eliminado)".
        const prodId = item.product_id ?? `del:${item.product_name ?? "?"}`;
        const isDeletedProduct = item.product_id == null;
        const baseName = item.product?.name ?? item.product_name ?? "Artículo Desconocido";
        const prodName = isDeletedProduct && item.product_name ? `${baseName} (eliminado)` : baseName;
        const prodSku = item.product?.sku ?? item.product_sku ?? "—";
        const qty = item.quantity;
        // Neto del item para el reporte (Joel 2026-07-17 "que salga lo real"):
        //  1. Descuentos v2/promos: si la venta trae beneficios POR LÍNEA
        //     (sale_items.discount_amount), el neto es EXACTO por línea
        //     (total bruto − beneficio de ESA línea) — ya no se prorratea, así
        //     el producto con promo absorbe SU descuento y no contamina a los
        //     demás productos del ticket.
        //  2. Ventas legacy (descuento global sin líneas): prorrateo proporcional
        //     como antes (Joel 2026-06-29). Sin descuento el ratio = 1.
        //  Con cancelación/devolución se conserva el crudo (la sección de
        //  cancelados resta line_total crudo y debe netear igual). El costo NO
        //  se prorratea (es el mismo con/sin promo).
        const saleHasReversal = (sale.cancelled_items?.length ?? 0) > 0 || sale.status === "returned";
        const saleHasLineBenefits = (sale.items ?? []).some(si => (si.discount_amount ?? 0) > 0);
        let itemTotal: number;
        if (saleHasReversal) {
          itemTotal = item.total;
        } else if (saleHasLineBenefits) {
          itemTotal = Math.max(0, item.total - (item.discount_amount ?? 0));
        } else {
          const discRatio = ((sale.discount ?? 0) > 0 && sale.subtotal > 0)
            ? sale.total / sale.subtotal
            : 1;
          itemTotal = item.total * discRatio;
        }
        const unitPrice = item.price;
        const unitCost = item.cost ?? item.product?.cost ?? 0;
        const itemCostTotal = unitCost * qty;

        // Split por COSTO (2026-08): si el usuario ve costos, el MISMO producto
        // vendido con costos distintos se parte en renglones separados (badge con el
        // costo). Sin canViewCost → llave = producto (un solo renglón, como antes).
        const groupKey = canViewCost ? `${prodId}::c${Math.round(unitCost * 100)}` : prodId;

        if (!map.has(groupKey)) {
          map.set(groupKey, {
            id: groupKey,
            base_product_id: prodId,
            cost_tag: unitCost,
            name: prodName,
            sku: prodSku,
            sales_count: 0,
            total_quantity: 0,
            total_revenue: 0,
            total_cost: 0,
            total_profit: 0,
            returned_quantity: 0,
            returned_revenue: 0,
            payment_breakdown: {},
            price_breakdown: {},
            commission_amount: 0,
            product_type: item.product?.product_type ?? 'product',
          });
        }

        const pGroup = map.get(groupKey)!;
        pGroup.sales_count += 1;
        pGroup.total_quantity += qty;
        pGroup.total_revenue += itemTotal;
        pGroup.total_cost += itemCostTotal;
        pGroup.total_profit += (itemTotal - itemCostTotal);

        // Descuentos v2: separar la parte PROMO vs DESCUENTO MANUAL de la línea.
        // Stacking: la promo aplica primero; el manual va sobre el neto-promo, así
        // que promoPart = snapshot de promo y manualPart = lo que reste del beneficio.
        const lineDisc = item.discount_amount ?? 0;
        if (lineDisc > 0) {
          const promoPart = item.benefit_type === "promo"
            ? lineDisc
            : Math.min(lineDisc, item.promo_amount ?? (item.promo_free_qty ? item.promo_free_qty * item.price : 0));
          const manualPart = Math.max(0, lineDisc - promoPart);
          pGroup.promo_total = (pGroup.promo_total ?? 0) + promoPart;
          pGroup.manual_total = (pGroup.manual_total ?? 0) + manualPart;
          // El beneficio se reparte por método según la proporción del ticket
          // (mixto: parte a tarjeta/transferencia, parte a efectivo).
          if (promoPart > 0) {
            const key = item.promo_name || "Promo aplicada";
            pGroup.promo_breakdown = pGroup.promo_breakdown ?? {};
            pGroup.promo_breakdown[key] = pGroup.promo_breakdown[key] ?? { cash: 0, card: 0 };
            pGroup.promo_breakdown[key].card += promoPart * cardShare;
            pGroup.promo_breakdown[key].cash += promoPart * (1 - cardShare);
          }
          if (manualPart > 0) {
            const key = item.discount_reason || "otro";
            pGroup.discount_breakdown = pGroup.discount_breakdown ?? {};
            pGroup.discount_breakdown[key] = pGroup.discount_breakdown[key] ?? { cash: 0, card: 0 };
            pGroup.discount_breakdown[key].card += manualPart * cardShare;
            pGroup.discount_breakdown[key].cash += manualPart * (1 - cardShare);
          }
        }

        // Desglose por método: se reparte proporcional a cada pago del ticket (mixto).
        for (const ms of methodShares) {
          if (!pGroup.payment_breakdown[ms.name]) {
            pGroup.payment_breakdown[ms.name] = { qty: 0, revenue: 0 };
          }
          const pBreakdown = pGroup.payment_breakdown[ms.name]!;
          pBreakdown.qty += qty * ms.share;
          pBreakdown.revenue += itemTotal * ms.share;
        }

        pGroup.price_breakdown[unitPrice] = (pGroup.price_breakdown[unitPrice] ?? 0) + qty;

        // Proportional commission allocation based on item total compared to sale total
        if (isCardMethod(payMethodName.toLowerCase()) && sale.total > 0) {
          const ratio = itemTotal / sale.total;
          const comm = (sale.commission_amount || 0) * ratio;
          pGroup.commission_amount = (pGroup.commission_amount ?? 0) + comm;
        }
      }

      // 1.2 Cancelled/Returned items (ADR-016 & Legacy Returns)
      const hasCancellations = sale.cancelled_items && sale.cancelled_items.length > 0;
      const isLegacyReturn = sale.status === "returned" && !hasCancellations;

      if (hasCancellations || isLegacyReturn) {
        const matchesCancelledFilter = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.includes("cancelled");
        if (matchesCancelledFilter) {
          const itemsToProcess = hasCancellations
            ? (sale.cancelled_items ?? []).map((ci: any) => {
                // cancelled_items NO trae 'cost' (ver tipo en packages/api). Sin el
                // costo, la cancelación restaría $0 de costo y la utilidad quedaría mal.
                // Fallback: tomar el costo del item ORIGINAL de la venta por product_id.
                const origItem = (sale.items ?? []).find((si) => si.product_id === ci.product_id);
                const unitCost = Number(ci.cost ?? origItem?.cost ?? origItem?.product?.cost ?? 0);
                return {
                  product_id: ci.product_id,
                  name: ci.name,
                  sku: ci.sku,
                  qty_cancelled: Number(ci.qty_cancelled || ci.quantity || 0),
                  line_total: Number(ci.line_total || 0),
                  price: Number(ci.price || 0),
                  cost: unitCost,
                  product_type: ci.product_type ?? 'product'
                };
              })
            : (sale.items || []).map((item: any) => ({
                product_id: item.product_id,
                // Producto borrado del catálogo → snapshot de la línea.
                name: item.product?.name ?? item.product_name ?? "Artículo Devuelto",
                sku: item.product?.sku ?? item.product_sku ?? "—",
                qty_cancelled: Number(item.quantity || 0),
                line_total: Number(item.total || 0),
                price: Number(item.price || 0),
                cost: Number(item.cost ?? item.product?.cost ?? 0),
                product_type: item.product?.product_type ?? 'product'
              }));

          for (const cItem of itemsToProcess) {
            // Misma llave que el bloque positivo: producto borrado (sin
            // product_id) agrupa por "del:{nombre}" para que el neteo
            // positivo/negativo caiga en el MISMO renglón.
            const prodId = cItem.product_id ?? (cItem.name ? `del:${cItem.name}` : null);
            if (!prodId) continue;

            const isDeletedProduct = cItem.product_id == null;
            const prodName = isDeletedProduct && cItem.name
              ? `${cItem.name} (eliminado)`
              : (cItem.name ?? "Artículo Cancelado");
            const prodSku = cItem.sku ?? "—";
            // Return/cancellation means negative volume/income to represent withdrawal/refund
            const cancelQty = cItem.qty_cancelled;
            const cancelTotal = cItem.line_total;
            const qty = -cancelQty;
            const itemTotal = -cancelTotal;
            const unitPrice = cItem.price;
            const unitCost = cItem.cost || 0;
            const itemCostTotal = unitCost * qty; // qty is negative

            // Misma llave por costo que el bloque positivo, para que la devolución
            // caiga en el MISMO renglón (mismo producto + mismo costo) y netee bien.
            const groupKey = canViewCost ? `${prodId}::c${Math.round(unitCost * 100)}` : prodId;

            if (!map.has(groupKey)) {
              map.set(groupKey, {
                id: groupKey,
                base_product_id: prodId,
                cost_tag: unitCost,
                name: prodName,
                sku: prodSku,
                sales_count: 0,
                total_quantity: 0,
                total_revenue: 0,
                total_cost: 0,
                total_profit: 0,
                returned_quantity: 0,
                returned_revenue: 0,
                payment_breakdown: {},
                price_breakdown: {},
                commission_amount: 0,
                product_type: cItem.product_type,
              });
            }

            const pGroup = map.get(groupKey)!;
            // NETEO A 0 — dos flujos distintos:
            //  • LEGACY (status=returned, sin cancelled_items): el item SIGUE en
            //    sale.items, así que el bloque positivo YA lo sumó arriba. Aquí lo
            //    restamos en negativo → netea a 0 (la venta se anula).
            //  • NUEVO (ADR-016, con cancelled_items/snapshot): el backend YA quitó el
            //    item de sale.items y redujo sale.total. El positivo NUNCA lo sumó, así
            //    que restar aquí lo contaría DOBLE (mostraba -$1000 en vez de $0).
            //    → En ese caso NO tocamos ingresos/costo/utilidad; solo Devoluciones.
            if (isLegacyReturn) {
              pGroup.sales_count -= 1;
              pGroup.total_quantity += qty; // negativo
              pGroup.total_revenue += itemTotal; // negativo
              pGroup.total_cost += itemCostTotal;
              pGroup.total_profit += (itemTotal - itemCostTotal);
            }

            pGroup.returned_quantity = (pGroup.returned_quantity || 0) + cancelQty;
            pGroup.returned_revenue = (pGroup.returned_revenue || 0) + cancelTotal;

            // El "(Devuelto)" negativo en payment_breakdown/price_breakdown SOLO tiene
            // sentido en el flujo LEGACY: ahí el positivo también se sumó, así que en las
            // tablas de Efectivo/Tarjeta del Excel/PDF netea a 0. En el flujo NUEVO el
            // positivo no existe (sale.items vacío) → agregarlo dejaría el export en -$200.
            if (isLegacyReturn) {
              const payMethodCancelled = payMethodName + " (Devuelto)";
              if (!pGroup.payment_breakdown[payMethodCancelled]) {
                pGroup.payment_breakdown[payMethodCancelled] = { qty: 0, revenue: 0 };
              }
              const pBreakdown = pGroup.payment_breakdown[payMethodCancelled]!;
              pBreakdown.qty += qty;
              pBreakdown.revenue += itemTotal;

              pGroup.price_breakdown[unitPrice] = (pGroup.price_breakdown[unitPrice] ?? 0) + qty;
            }
          }
        }
      }
    }

    // 2. Pre-sale items (Preventas)
    for (const order of filteredPreSaleOrders) {
      // Solo los pagos cuya fecha cae en el rango (anticipo y/o liquidación del
      // período). El monto reportado = lo COBRADO en el rango, no el acumulado.
      const paymentsInRange = presalePaymentsInRange(order.payments, from, to);
      const paidInRange = paymentsInRange.reduce((sum, p) => sum + (p.amount || 0), 0);
      // Abonos previos al rango (para el modelo del dueño al liquidar).
      const paidBeforeTotal = (order.payments ?? [])
        .filter((p) => toLocalYmd(new Date(p.created_at)) < from)
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      let payMethodName = "Efectivo";
      let mainPayment = paymentsInRange[0] || null;
      if (paymentsInRange.length > 0 && mainPayment) {
        for (const p of paymentsInRange) {
          if (p && p.amount > mainPayment.amount) {
            mainPayment = p;
          }
        }
        payMethodName = mainPayment.payment_method?.name ?? "Efectivo";
      }

      const orderItemsTotal = order.items ? order.items.reduce((sum, it) => sum + (it.unit_price * it.quantity), 0) : 0;

      if (order.items) {
        for (const item of order.items) {
          // If product_id is null, generate a unique negative ID based on catalog ID to avoid collisions
          const prodId = item.product_id ?? (item.catalog ? item.catalog.id * -1 : -999);
          const prodName = item.catalog?.product_name ?? `Preventa #${item.id}`;
          const prodSku = "PREVENTA";
          const qty = item.quantity;
          const itemTotal = item.unit_price * item.quantity;
          const unitPrice = item.unit_price;

          // Proportional allocation of paid-in-range and balance based on item's total value vs order items total
          const ratio = orderItemsTotal > 0 ? (itemTotal / orderItemsTotal) : (1 / order.items.length);
          const itemApartado = paidInRange * ratio;
          const itemPaidBefore = paidBeforeTotal * ratio;
          const itemDeuda = (order.balance || 0) * ratio;
          const itemCostoReal = (item.cost ?? 0) * qty;

          // Separamos la preventa por ESTADO (liquidada vs apartada), igual que la
          // tabla de exportación. Se clasifica por FECHA DE ENTREGA en el rango
          // (no por el status actual) para que un mes pasado no mute al liquidarse.
          const deliveredInRange = item.status === 'delivered' && !!item.delivered_at &&
            (() => { const d = toLocalYmd(new Date(item.delivered_at!)); return d >= from && d <= to; })();
          // Id único por estado: offset grande para NO chocar con ids reales ni entre
          // sí (React key / expandedIds usan este número).
          const rowId = (deliveredInRange ? 200_000_000 : 100_000_000) + prodId;
          const rowName = `${prodName} ${deliveredInRange ? '(Liquidada)' : '(Apartada)'}`;

          // MODELO DEL DUEÑO (mismo que la tabla de exportación):
          //  - APARTADA (no entregada): costo = venta (netea) → utilidad $0.
          //  - LIQUIDADA (entregada): costo = costo real − abonos previos; utilidad = venta − costo.
          const itemCostForTable = deliveredInRange ? (itemCostoReal - itemPaidBefore) : itemApartado;
          const itemProfitForTable = itemApartado - itemCostForTable;

          if (!map.has(rowId)) {
            map.set(rowId, {
              id: rowId,
              name: rowName,
              sku: prodSku,
              sales_count: 0,
              total_quantity: 0,
              total_revenue: 0,
              total_cost: 0,
              total_profit: 0,
              returned_quantity: 0,
              returned_revenue: 0,
              payment_breakdown: {},
              price_breakdown: {},
              pre_sale_apartado: 0,
              pre_sale_deuda: 0,
              pre_sale_costo_real: 0,
              product_type: item.product_type ?? 'product',
            });
          }

          const pGroup = map.get(rowId)!;
          pGroup.sales_count += 1;
          pGroup.total_quantity += qty;
          pGroup.total_revenue += itemApartado;
          pGroup.total_cost += itemCostForTable;
          pGroup.total_profit += itemProfitForTable;

          if (!pGroup.payment_breakdown[payMethodName]) {
            pGroup.payment_breakdown[payMethodName] = { qty: 0, revenue: 0 };
          }
          const preBreakdown = pGroup.payment_breakdown[payMethodName]!;
          preBreakdown.qty += qty;
          preBreakdown.revenue += itemApartado;

          pGroup.price_breakdown[unitPrice] = (pGroup.price_breakdown[unitPrice] ?? 0) + qty;

          pGroup.pre_sale_apartado = (pGroup.pre_sale_apartado ?? 0) + itemApartado;
          pGroup.pre_sale_deuda = (pGroup.pre_sale_deuda ?? 0) + itemDeuda;
          // Costo real SIEMPRE (anticipos incluidos): dato informativo del bloque de preventa.
          pGroup.pre_sale_costo_real = (pGroup.pre_sale_costo_real ?? 0) + itemCostoReal;
        }
      }
    }

    const arr = Array.from(map.values());

    // Split por costo: marca show_cost_tag en los productos BASE que tienen >1 costo
    // distinto en el rango (el badge solo se pinta cuando de verdad hubo cambio de costo).
    if (canViewCost) {
      const costsByBase = new Map<number | string, Set<number>>();
      for (const p of arr) {
        if (p.base_product_id == null) continue;
        const s = costsByBase.get(p.base_product_id) ?? new Set<number>();
        s.add(Math.round((p.cost_tag ?? 0) * 100));
        costsByBase.set(p.base_product_id, s);
      }
      for (const p of arr) {
        if (p.base_product_id != null && (costsByBase.get(p.base_product_id)?.size ?? 0) > 1) {
          p.show_cost_tag = true;
        }
      }
    }

    // Cantidad total por producto base → mantiene JUNTAS las variantes de costo.
    const qtyByBase = new Map<number | string, number>();
    for (const p of arr) {
      const b = p.base_product_id ?? p.id;
      qtyByBase.set(b, (qtyByBase.get(b) ?? 0) + (p.total_quantity || 0));
    }

    return arr.sort((a, b) => {
      const aIsManga = a.product_type === "manga";
      const bIsManga = b.product_type === "manga";
      if (aIsManga && !bIsManga) return 1;  // Mangas go to the bottom
      if (!aIsManga && bIsManga) return -1; // Non-mangas stay at the top
      const ba = a.base_product_id ?? a.id, bb = b.base_product_id ?? b.id;
      const qa = qtyByBase.get(ba) ?? 0, qb = qtyByBase.get(bb) ?? 0;
      if (qb !== qa) return qb - qa;                            // más vendidos primero
      if (ba !== bb) return String(ba) < String(bb) ? -1 : 1;   // mismo grupo, juntas
      return (a.cost_tag ?? 0) - (b.cost_tag ?? 0);             // por costo dentro del grupo
    });
}

/** Renglones de la tabla de Preventas (modelo del dueño: apartada vs liquidada). */
export function buildPresaleRows(
  filteredPreSaleOrders: PreSaleOrder[],
  from: string,
  to: string,
): PresaleRow[] {
    const map = new Map<string, { productId: number; baseName: string; entregado: boolean; qty: number; apartado: number; deuda: number; costoReal: number; paidBefore: number }>();
    for (const order of filteredPreSaleOrders) {
      const paymentsInRange = presalePaymentsInRange(order.payments, from, to);
      const paidInRange = paymentsInRange.reduce((sum, p) => sum + (p.amount || 0), 0);
      // Abonos previos al rango (created_at < desde): lo que ya se había cobrado antes.
      const paidBeforeTotal = (order.payments ?? [])
        .filter((p) => toLocalYmd(new Date(p.created_at)) < from)
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      const orderItemsTotal = order.items ? order.items.reduce((sum, it) => sum + (it.unit_price * it.quantity), 0) : 0;
      for (const item of order.items ?? []) {
        const prodId = item.product_id ?? (item.catalog ? item.catalog.id * -1 : -999);
        const baseName = item.catalog?.product_name ?? `Preventa #${item.id}`;
        const qty = item.quantity;
        const itemTotal = item.unit_price * item.quantity;
        const ratio = orderItemsTotal > 0 ? (itemTotal / orderItemsTotal) : (1 / (order.items?.length || 1));
        const itemApartado = paidInRange * ratio;
        const itemPaidBefore = paidBeforeTotal * ratio;
        const itemDeuda = (order.balance || 0) * ratio;
        const itemCostoReal = (item.cost ?? 0) * qty;
        // Entregada EN EL RANGO = es la liquidación de este periodo.
        const deliveredInRange = item.status === "delivered" && !!item.delivered_at &&
          (() => { const d = toLocalYmd(new Date(item.delivered_at!)); return d >= from && d <= to; })();
        const key = `${prodId}__${deliveredInRange ? "liq" : "abono"}`;
        const g = map.get(key) ?? { productId: prodId, baseName, entregado: deliveredInRange, qty: 0, apartado: 0, deuda: 0, costoReal: 0, paidBefore: 0 };
        g.qty += qty; g.apartado += itemApartado; g.deuda += itemDeuda; g.costoReal += itemCostoReal; g.paidBefore += itemPaidBefore;
        map.set(key, g);
      }
    }
    return Array.from(map.values()).map((g) => {
      const pactado = g.apartado + g.deuda;
      // Liquidación: costo = costo real − abonos previos; abono: costo = venta (netea a $0).
      const costoNeto = g.entregado ? (g.costoReal - g.paidBefore) : g.apartado;
      const utilidad = g.apartado - costoNeto; // abono → 0; liquidación → venta − costo.
      return {
        productId: g.productId,
        name: `${g.baseName} ${g.entregado ? "(Liquidada)" : "(Apartada)"}`,
        entregado: g.entregado, qty: g.qty, apartado: g.apartado, deuda: g.deuda,
        pactado, costoReal: g.costoReal, costoNeto, utilidad,
      };
    }).sort((a, b) => (a.productId - b.productId) || (a.entregado === b.entregado ? 0 : a.entregado ? -1 : 1));
}

/** Totales cobrados por método (efectivo / tarjeta / depósitos / dólares). */
export function buildPaymentBreakdown(
  filteredSales: SaleDetail[],
  filteredPreSaleOrders: PreSaleOrder[],
  selectedFilters: SalesHistoryFilter[],
  from: string,
  to: string,
): ReportPaymentBreakdown {
    let total = 0;
    let card = 0;
    let cash = 0;
    let deposits = 0;
    let usd = 0; // dólares físicos recibidos (informativo; el MXN ya está en cash)
    const contributingSales = new Set<number>();

    const isCard = (name: string) =>
      name.includes("tarjeta") || name.includes("credit") || name.includes("debito") || name.includes("tpv") || name.includes("terminal");
    const isTransfer = (name: string) =>
      name.includes("transfer") || name.includes("deposit") || name.includes("spei");

    // Dynamic show controls based on active filters
    const showActive = selectedFilters.includes("all") || selectedFilters.length === 0 || !selectedFilters.includes("cancelled") || selectedFilters.length > 1;
    const showCancelled = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.includes("cancelled");

    for (const sale of filteredSales) {
      const isFullCancel = sale.status === "returned" || sale.cancellation_status === "full";
      let contributed = false;

      // 1. Process standard checkout payments (positive active sales)
      if (showActive && !isFullCancel && sale.items && sale.items.length > 0) {
        const methods = (sale.payments ?? []).map(p => (p.payment_method?.name ?? "").toLowerCase()).filter(Boolean);
        const hasCancelled = (sale.cancellation_status && sale.cancellation_status !== "none") || (sale.status ?? "").toLowerCase().includes("cancel") || (sale.status ?? "").toLowerCase().includes("return");

        const matchesRegularFilter = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.some(filter => {
          if (filter === "cash") return methods.some(m => m.includes("efectivo") || m.includes("cash") || m.includes("dolar") || m.includes("dólar") || m.includes("usd"));
          if (filter === "dollar") return methods.some(m => m.includes("dolar") || m.includes("dólar") || m.includes("usd"));
          if (filter === "card") return methods.some(m => isCard(m));
          if (filter === "transfer") return methods.some(m => isTransfer(m));
          if (filter === "cancelled") return hasCancelled;
          return false;
        });

        if (matchesRegularFilter) {
          contributed = true;
          if (sale.payments) {
            for (const p of sale.payments) {
              if (!p) continue;
              const name = (p.payment_method?.name ?? "").toLowerCase();
              const amount = p.amount || 0;

              total += amount;
              if (isCard(name)) {
                card += amount;
              } else if (isTransfer(name)) {
                deposits += amount;
              } else {
                cash += amount;
              }
            }
          }
          usd += sale.cash_received_usd || 0;
        }
      }

      // 2. Process cancelled/negative parts (returns)
      // NETEO de cancelaciones TOTALES: el dinero entró y se devolvió (neto = 0).
      // El bloque positivo NO cuenta las ventas full-cancel (sale.items queda vacío),
      // así que restar aquí las dejaba en NEGATIVO (mostraba -$200 en TODO). Por eso,
      // para un full-cancel SOLO restamos cuando se aísla la vista CANCELADOS
      // (showActive=false); en TODO/por-método netea a 0. Los PARCIALES sí se restan
      // siempre (el positivo ya sumó el total original de la venta).
      const subtractCancel = !isFullCancel || !showActive;
      if (subtractCancel && showCancelled && (isFullCancel || (sale.cancellation_status && sale.cancellation_status !== "none")) && sale.cancelled_amount && sale.cancelled_amount > 0) {
        contributed = true;
        const cancelledAmount = sale.cancelled_amount;
        const originalTotal = sale.total + cancelledAmount;
        
        if (originalTotal > 0 && sale.payments && sale.payments.length > 0) {
          for (const p of sale.payments) {
            if (!p) continue;
            const name = (p.payment_method?.name ?? "").toLowerCase();
            const ratio = (p.amount || 0) / originalTotal;
            const pCancelledAmount = cancelledAmount * ratio;

            total -= pCancelledAmount;
            if (isCard(name)) {
              card -= pCancelledAmount;
            } else if (isTransfer(name)) {
              deposits -= pCancelledAmount;
            } else {
              cash -= pCancelledAmount;
            }
          }
        } else {
          total -= cancelledAmount;
          cash -= cancelledAmount;
        }
      }

      if (contributed) {
        contributingSales.add(sale.id);
      }
    }

    // 3. Pagos de preventa (anticipos) cobrados en el rango. Se cuentan TODAS las
    // preventas —igual que la tabla de productos (groupedProducts)— para que el
    // efectivo del anticipo del periodo sí sume a "Efectivo cobrado". Antes se
    // saltaban las preventas ligadas a una venta, lo que dejaba fuera anticipos
    // reales y descuadraba el resumen contra la tabla.
    const showPreSales = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.some(f => ["preSales", "notPicked", "cash", "dollar", "card", "transfer", "cancelled"].includes(f));

    if (showPreSales) {
      for (const order of filteredPreSaleOrders) {
        const paymentsInRange = presalePaymentsInRange(order.payments, from, to);
        if (paymentsInRange.length > 0) {
          let orderContributed = false;
          for (const p of paymentsInRange) {
            if (!p) continue;
            const amount = p.amount || 0;
            if (amount > 0) {
              orderContributed = true;
              total += amount;
              const name = (p.payment_method?.name ?? "").toLowerCase();
              if (isCard(name)) {
                card += amount;
              } else if (isTransfer(name)) {
                deposits += amount;
              } else {
                cash += amount;
              }
            }
          }
          if (orderContributed) {
            contributingSales.add(order.id * -1); // negative ID to avoid collision
          }
        }
      }
    }

    return {
      total,
      card,
      cash,
      deposits,
      usd,
      transactionCount: contributingSales.size,
    };
}
