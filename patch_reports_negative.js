const fs = require("fs");
const path = "landing/src/pages/ReportsPage.tsx";
let content = fs.readFileSync(path, "utf8");

content = content.replace(/\r\n/g, "\n");

// 1. Update matchesCancelledFilter inside groupedProducts to allow TODO/all and cancelled, and make values negative
const oldGroupedProductsLoop = `      // 1.2 Cancelled/Returned items (ADR-016)
      if (sale.cancelled_items && sale.cancelled_items.length > 0) {
        const matchesCancelledFilter = selectedFilters.includes("cancelled");
        if (matchesCancelledFilter) {
          for (const cItem of sale.cancelled_items) {
            const prodId = cItem.product_id;
            if (!prodId) continue;

            const prodName = cItem.name ?? "Artículo Cancelado";
            const prodSku = cItem.sku ?? "—";
            const qty = cItem.quantity;
            const itemTotal = cItem.line_total;
            const unitPrice = cItem.price;

            if (!map.has(prodId)) {
              map.set(prodId, {
                id: prodId,
                name: prodName,
                sku: prodSku,
                sales_count: 0,
                total_quantity: 0,
                total_revenue: 0,
                payment_breakdown: {},
                price_breakdown: {},
                commission_amount: 0,
                product_type: cItem.product_type ?? 'product',
              });
            }

            const pGroup = map.get(prodId)!;
            pGroup.sales_count += 1;
            pGroup.total_quantity += qty;
            pGroup.total_revenue += itemTotal;

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
      }`;

const newGroupedProductsLoop = `      // 1.2 Cancelled/Returned items (ADR-016)
      if (sale.cancelled_items && sale.cancelled_items.length > 0) {
        const matchesCancelledFilter = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.includes("cancelled");
        if (matchesCancelledFilter) {
          for (const cItem of sale.cancelled_items) {
            const prodId = cItem.product_id;
            if (!prodId) continue;

            const prodName = cItem.name ?? "Artículo Cancelado";
            const prodSku = cItem.sku ?? "—";
            // Return/cancellation means negative volume/income to represent withdrawal/refund
            const qty = -cItem.quantity;
            const itemTotal = -cItem.line_total;
            const unitPrice = cItem.price;

            if (!map.has(prodId)) {
              map.set(prodId, {
                id: prodId,
                name: prodName,
                sku: prodSku,
                sales_count: 0,
                total_quantity: 0,
                total_revenue: 0,
                payment_breakdown: {},
                price_breakdown: {},
                commission_amount: 0,
                product_type: cItem.product_type ?? 'product',
              });
            }

            const pGroup = map.get(prodId)!;
            pGroup.sales_count -= 1; // Reduces net sales count (ticket count)
            pGroup.total_quantity += qty; // Adds negative quantity
            pGroup.total_revenue += itemTotal; // Adds negative revenue

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
      }`;

if (content.includes(oldGroupedProductsLoop)) {
  content = content.replace(oldGroupedProductsLoop, newGroupedProductsLoop);
  console.log("Updated groupedProducts cancelled loop successfully.");
} else {
  console.log("Error: oldGroupedProductsLoop pattern not found.");
  process.exit(1);
}

// 2. Update paymentBreakdown to calculate net (positives - negatives) and pure cancellations
const oldPaymentBreakdown = `  const paymentBreakdown = useMemo(() => {
    let total = 0;
    let card = 0;
    let cash = 0;
    let deposits = 0;
    const contributingSales = new Set<number>();

    const isCard = (name: string) =>
      name.includes("tarjeta") || name.includes("credit") || name.includes("debito") || name.includes("tpv") || name.includes("terminal");
    const isTransfer = (name: string) =>
      name.includes("transfer") || name.includes("deposit") || name.includes("spei");

    for (const sale of filteredSales) {
      const isFullCancel = sale.status === "returned" || sale.cancellation_status === "full";
      if (isFullCancel) {
        continue;
      }
      let contributed = false;

      // 1. Process standard checkout payments
      const showRegularItems = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.some(f => ["cash", "dollar", "card", "transfer", "cancelled"].includes(f));
      if (showRegularItems && sale.items && sale.items.length > 0) {
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
        }
      }

      if (contributed) {
        contributingSales.add(sale.id);
      }
    }

    // 2. Process pre-sale payments (anticipos) from filteredPreSaleOrders that are not linked to already processed sales
    const processedLinkedSaleIds = new Set(filteredSales.map(s => s.id));
    const showPreSales = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.some(f => ["preSales", "notPicked", "cash", "dollar", "card", "transfer", "cancelled"].includes(f));
    
    if (showPreSales) {
      for (const order of filteredPreSaleOrders) {
        // If it's linked to a sale that we already processed, ignore to avoid double-counting!
        if (order.linked_sale_id && processedLinkedSaleIds.has(order.linked_sale_id)) {
          continue;
        }

        // Solo los cobros cuya fecha cae en el rango (por fecha de pago, no de
        // creación) — así el KPI suma lo realmente cobrado en el período.
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
      transactionCount: contributingSales.size,
    };
  }, [filteredSales, filteredPreSaleOrders, selectedFilters, from, to]);`;

const newPaymentBreakdown = `  const paymentBreakdown = useMemo(() => {
    let total = 0;
    let card = 0;
    let cash = 0;
    let deposits = 0;
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
        }
      }

      // 2. Process cancelled/negative parts (returns)
      if (showCancelled && (isFullCancel || (sale.cancellation_status && sale.cancellation_status !== "none")) && sale.cancelled_amount && sale.cancelled_amount > 0) {
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

    // 3. Process pre-sale payments (anticipos) from filteredPreSaleOrders that are not linked to already processed sales
    const processedLinkedSaleIds = new Set(filteredSales.map(s => s.id));
    const showPreSales = selectedFilters.includes("all") || selectedFilters.length === 0 || selectedFilters.some(f => ["preSales", "notPicked", "cash", "dollar", "card", "transfer", "cancelled"].includes(f));
    
    if (showPreSales) {
      for (const order of filteredPreSaleOrders) {
        // If it's linked to a sale that we already processed, ignore to avoid double-counting!
        if (order.linked_sale_id && processedLinkedSaleIds.has(order.linked_sale_id)) {
          continue;
        }

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
      transactionCount: contributingSales.size,
    };
  }, [filteredSales, filteredPreSaleOrders, selectedFilters, from, to]);`;

if (content.includes(oldPaymentBreakdown)) {
  content = content.replace(oldPaymentBreakdown, newPaymentBreakdown);
  console.log("Updated paymentBreakdown successfully.");
} else {
  console.log("Error: oldPaymentBreakdown pattern not found.");
  process.exit(1);
}

// 3. Update text color of negative total_revenue in renderProductRow
const oldProdRowRevenueSpan = `<span style={{ color: "#00CC66", fontWeight: 900 }}>{fmt(prod.total_revenue)}</span>`;
const newProdRowRevenueSpan = `<span style={{ color: prod.total_revenue < 0 ? "#FF4422" : "#00CC66", fontWeight: 900 }}>{fmt(prod.total_revenue)}</span>`;

if (content.includes(oldProdRowRevenueSpan)) {
  content = content.replace(oldProdRowRevenueSpan, newProdRowRevenueSpan);
  console.log("Updated renderProductRow positive/negative revenue color successfully.");
} else {
  console.log("Warning: oldProdRowRevenueSpan pattern not found.");
}

// 4. Update text color of payment breakdown in renderProductRow
const oldProdRowPaymentSpan = `<span style={{ color: "#00CC66", fontWeight: 900 }}>{fmt(data.revenue)}</span>`;
const newProdRowPaymentSpan = `<span style={{ color: data.revenue < 0 ? "#FF4422" : "#00CC66", fontWeight: 900 }}>{fmt(data.revenue)}</span>`;

if (content.includes(oldProdRowPaymentSpan)) {
  content = content.replace(oldProdRowPaymentSpan, newProdRowPaymentSpan);
  console.log("Updated renderProductRow payment_breakdown color successfully.");
} else {
  console.log("Warning: oldProdRowPaymentSpan pattern not found.");
}

// 5. Update KPI Cards value dynamic coloring in the JSX
const oldKpiCardSpan = `<p className="text-5xl font-black italic leading-none text-center" style={{ color: kpi.color }}>{kpi.val}</p>`;
const newKpiCardSpan = `<p className="text-5xl font-black italic leading-none text-center" style={{ color: kpi.val.startsWith("-") ? "#FF4422" : kpi.color }}>{kpi.val}</p>`;

if (content.includes(oldKpiCardSpan)) {
  content = content.replace(oldKpiCardSpan, newKpiCardSpan);
  console.log("Updated KPI Cards value color successfully.");
} else {
  console.log("Warning: oldKpiCardSpan pattern not found.");
}

// 6. Update table bottom totals bruto coloring
const oldTotalsBrutoSpan = `<span style={{ color: "#00CC66", fontWeight: 900 }}>{fmt(uiTotals.bruto)}</span>`;
const newTotalsBrutoSpan = `<span style={{ color: uiTotals.bruto < 0 ? "#FF4422" : "#00CC66", fontWeight: 900 }}>{fmt(uiTotals.bruto)}</span>`;

// Replace multiple times for both main table and modal table
if (content.includes(oldTotalsBrutoSpan)) {
  content = content.split(oldTotalsBrutoSpan).join(newTotalsBrutoSpan);
  console.log("Updated totals bruto row colors successfully.");
} else {
  console.log("Warning: oldTotalsBrutoSpan pattern not found.");
}

// 7. Update bottom summary cards text and background colors based on negative value
const oldVentaBrutaCard = `<div className="p-4 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(255,255,255,0.05)" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: TM }}>Venta Bruta Total</p>
                      <p className="text-xl font-black mt-1" style={{ color: TP }}>{fmt(uiTotals.bruto)}</p>
                    </div>`;

const newVentaBrutaCard = `<div className="p-4 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(255,255,255,0.05)" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: TM }}>Venta Bruta Total</p>
                      <p className="text-xl font-black mt-1" style={{ color: uiTotals.bruto < 0 ? "#FF4422" : TP }}>{fmt(uiTotals.bruto)}</p>
                    </div>`;

if (content.includes(oldVentaBrutaCard)) {
  content = content.replace(oldVentaBrutaCard, newVentaBrutaCard);
  console.log("Updated summary Venta Bruta card successfully.");
} else {
  console.log("Warning: oldVentaBrutaCard pattern not found.");
}

const oldNetoCard = `<div className="p-4 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(255,255,255,0.05)", background: "linear-gradient(135deg, rgba(0,204,102,0.1), rgba(0,153,70,0.1))" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#00CC66" }}>Neto Real para la Tienda</p>
                      <p className="text-xl font-black mt-1" style={{ color: "#00CC66" }}>{fmt(uiTotals.neto)}</p>
                    </div>`;

const newNetoCard = `<div className="p-4 rounded-2xl" style={{ ...GLASS, border: "1px solid rgba(255,255,255,0.05)", background: uiTotals.neto < 0 ? "linear-gradient(135deg, rgba(255,68,34,0.1), rgba(200,30,10,0.1))" : "linear-gradient(135deg, rgba(0,204,102,0.1), rgba(0,153,70,0.1))" }}>
                      <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: uiTotals.neto < 0 ? "#FF4422" : "#00CC66" }}>Neto Real para la Tienda</p>
                      <p className="text-xl font-black mt-1" style={{ color: uiTotals.neto < 0 ? "#FF4422" : "#00CC66" }}>{fmt(uiTotals.neto)}</p>
                    </div>`;

if (content.includes(oldNetoCard)) {
  content = content.split(oldNetoCard).join(newNetoCard);
  console.log("Updated summary Neto Real card successfully.");
} else {
  console.log("Warning: oldNetoCard pattern not found.");
}

fs.writeFileSync(path, content, "utf8");
console.log("ReportsPage patched with negative totals and colors successfully.");
