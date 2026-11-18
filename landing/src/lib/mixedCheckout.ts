/**
 * Cobro de una mesa de Caja con un folio de preventa cargado (2026-11-17, T-006).
 *
 * Antes eran tres llamadas en serie (venta → preventa nueva → entrega del folio):
 * si la última fallaba, la venta ya estaba guardada. Ahora es UNA llamada a
 * `POST /sales/mixed` y el servidor guarda todo o nada. Aquí vive el armado del
 * payload y los candados de la mesa, como lógica pura: sin React y sin red.
 *
 * Estructural a propósito (no importa `CartItem` ni `Mesa` de SellPage) para
 * probarlo en aislamiento.
 */
import { MIXED_CHECKOUT_FOLIO_CODES } from "@tadaima/api";
import type {
  MixedCheckoutInput,
  SaleDirectItem,
  SaleLineDiscountInput,
  SaleLineSurchargeInput,
} from "@tadaima/api";
import { lineCommentPayload } from "./lineComment";
import { presaleDiscountPayload } from "./presaleDiscount";
import { computeLoadedFolioChargeAmount } from "./promo";
import type { LineDiscount, LineSurcharge } from "./saleCalc";

/** Lo que el cobro necesita saber de una línea del carrito. */
export interface CheckoutCartLine {
  lineId: string;
  product: { id: string };
  quantity: number;
  /** Nivel de precio del carrito (a–e). La venta solo conoce a, b y c. */
  priceLevel: string;
  isDamaged?: boolean | undefined;
  damagedPrice?: number | undefined;
  discount?: LineDiscount | undefined;
  surcharge?: LineSurcharge | undefined;
  skipPromo?: boolean | undefined;
  comment?: string | undefined;
  isGift?: boolean | undefined;
  giftNote?: string | undefined;
  /** Anticipo: de la preventa nueva, o lo ya abonado a la partida del folio. */
  depositAmount?: number | undefined;
  isFromPreSale?: boolean | undefined;
  preSaleOrderItemId?: number | undefined;
  preSaleItemDelivered?: boolean | undefined;
  preSalePending?: number | undefined;
  preSaleUnitPrice?: number | undefined;
  /** Catálogo de una preventa NUEVA que se está reservando en esta mesa. */
  sellingCatalogId?: number | undefined;
}

/** Lo que el motor (`recalculateSale`) resolvió de una línea. */
export interface LineCalcInfo {
  /** Precio unitario efectivo (re-preciado a NORMAL si la línea entró a una promo). */
  unitPrice: number;
  /** Neto de la línea: con promo, descuento y aumento. */
  net: number;
  promoRepriced?: boolean | undefined;
}

export interface SaleLineContext<L extends CheckoutCartLine> {
  calcById: Readonly<Record<string, LineCalcInfo | undefined>>;
  /** Precio de CATÁLOGO de la línea según su nivel (o el manual si es dañado). */
  listPriceOf: (line: L) => number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const PRESALE_PRICE_LEVEL: Readonly<Record<string, 1 | 2 | 3 | 4 | 5>> = { a: 1, b: 2, c: 3, d: 4, e: 5 };

/** Las tres clases de línea de una mesa con folio cargado. */
export function splitMesaLines<L extends CheckoutCartLine>(lines: readonly L[]): {
  /** Partidas del folio que el cliente se lleva HOY (las que siguen en el carrito). */
  liquidation: L[];
  /** Productos normales. */
  regular: L[];
  /** Preventas nuevas (catálogo publicado). */
  newCatalog: L[];
} {
  return {
    liquidation: lines.filter((l) => l.isFromPreSale && !l.preSaleItemDelivered),
    regular: lines.filter((l) => !l.isFromPreSale && l.sellingCatalogId == null),
    newCatalog: lines.filter((l) => l.sellingCatalogId != null),
  };
}

/**
 * Captura del ajuste por línea (2026-09-29): regalo, descuento O aumento. Solo
 * viaja tipo/base/valor/motivo/nota: el monto lo recalcula el servidor.
 */
export function lineAdjustmentPayload(
  line: Pick<CheckoutCartLine, "discount" | "surcharge" | "isGift" | "giftNote">,
): { is_gift?: true; gift_note?: string; line_discount?: SaleLineDiscountInput; line_surcharge?: SaleLineSurchargeInput } {
  // Regalo: el precio que viaja es el de catálogo; el servidor deja la línea en $0.
  if (line.isGift) {
    return { is_gift: true, ...(line.giftNote ? { gift_note: line.giftNote } : {}) };
  }
  if (line.discount) {
    const d = line.discount;
    return { line_discount: { kind: d.kind, basis: d.basis, value: d.value, reason: d.reason, ...(d.note ? { note: d.note } : {}) } };
  }
  if (line.surcharge) {
    const x = line.surcharge;
    return { line_surcharge: { kind: x.kind, basis: x.basis, value: x.value, reason: x.reason, ...(x.note ? { note: x.note } : {}) } };
  }
  return {};
}

/** Precio unitario efectivo de la línea: el del motor o, sin dato, el de lista. */
function unitPriceOf<L extends CheckoutCartLine>(line: L, ctx: SaleLineContext<L>): number {
  return ctx.calcById[line.lineId]?.unitPrice ?? ctx.listPriceOf(line);
}

/**
 * Precio que viaja en `items[].price`. Un regalo manda su precio de CATÁLOGO
 * (el servidor lo valida y lo guarda en `sale_gifts`; la línea queda en $0); un
 * dañado, su precio manual; el resto, el efectivo del motor.
 */
function checkoutPriceOf<L extends CheckoutCartLine>(line: L, ctx: SaleLineContext<L>): number {
  return line.isGift ? ctx.listPriceOf(line) : (line.damagedPrice ?? unitPriceOf(line, ctx));
}

/**
 * Las líneas de una venta como las espera el servidor (`POST /sales` y el
 * bloque `sale` de `POST /sales/mixed`). Antes este armado estaba copiado en
 * las tres ramas del cobro de Caja.
 */
export function buildSaleDirectItems<L extends CheckoutCartLine>(
  lines: readonly L[],
  ctx: SaleLineContext<L>,
): SaleDirectItem[] {
  return lines
    .map((line): SaleDirectItem => ({
      product_id: parseInt(line.product.id, 10),
      quantity: line.quantity,
      price: checkoutPriceOf(line, ctx),
      // Con promo la línea se cobra a NORMAL; la venta no conoce los niveles d y e.
      price_level: ctx.calcById[line.lineId]?.promoRepriced
        ? "a"
        : line.priceLevel === "b" || line.priceLevel === "c" ? line.priceLevel : "a",
      // Dañado → precio manual; el servidor salta la validación de catálogo.
      ...(line.isDamaged ? { is_damaged: true } : {}),
      ...lineAdjustmentPayload(line),
      ...(line.skipPromo ? { skip_promotion: true } : {}),
      ...lineCommentPayload(line.comment ? { comment: line.comment } : {}),
    }))
    .filter((item) => !Number.isNaN(item.product_id));
}

export interface MixedCheckoutBuildInput<L extends CheckoutCartLine> extends SaleLineContext<L> {
  storeId: number;
  registerSessionId: number;
  customerId?: number | null | undefined;
  /** Folio cargado en la mesa. */
  preSaleOrderId: number;
  lines: readonly L[];
  /** Lo que falta de las piezas del folio que se entregan hoy (ya con su descuento). */
  folioCharge: number;
  paymentMethodId: number;
  /** Solo con tarjeta. */
  terminalId?: number | undefined;
  cash: {
    /** Pesos entregados. */
    received: number;
    /** Dólares físicos entregados (0 si fue solo simulación). */
    receivedUsd: number;
    exchangeRate: number;
  };
}

export interface MixedCheckoutBuild<L extends CheckoutCartLine> {
  payload: MixedCheckoutInput;
  parts: ReturnType<typeof splitMesaLines<L>>;
  /** Líneas de la venta regular (vacío si la mesa no lleva venta). */
  saleItems: SaleDirectItem[];
  amounts: {
    /** Cobro del folio. */
    folio: number;
    /** Neto de la venta regular. */
    regularNet: number;
    /** Anticipo de la preventa nueva. */
    newDeposit: number;
    /** Total del ticket: lo que se cobra hoy. */
    total: number;
  };
  /** Efectivo del ticket en pesos (incluye dólares × TC) y su cambio. */
  cash: { received: number; receivedUsd: number; change: number };
}

/**
 * Arma el cobro completo de una mesa con folio cargado.
 *
 * @throws Error si la mesa trae una preventa nueva y no tiene cliente, o si el
 *   folio cargado no trae ninguna pieza por entregar.
 */
export function buildMixedCheckout<L extends CheckoutCartLine>(input: MixedCheckoutBuildInput<L>): MixedCheckoutBuild<L> {
  const parts = splitMesaLines(input.lines);
  const { liquidation, regular, newCatalog } = parts;

  if (newCatalog.length > 0 && !input.customerId) {
    throw new Error("Falta cliente para la nueva preventa");
  }

  const folio = round2(Math.max(0, input.folioCharge));
  const itemIds = liquidation.flatMap((l) => (typeof l.preSaleOrderItemId === "number" ? [l.preSaleOrderItemId] : []));
  // El servidor exige las piezas que se entregan: sin ellas entregaría todo lo
  // que ya llegó sin validar el dinero. Solo pasa con un carrito guardado muy viejo.
  if (itemIds.length === 0) {
    throw new Error("El folio de esta mesa no trae piezas por entregar. Quítalo de la mesa y vuelve a cargarlo.");
  }
  const itemDiscounts = presaleDiscountPayload(liquidation);

  // Venta regular: va si cobra algo o si regala algo (un regalo vale $0 pero saca stock).
  const regularGross = regular.reduce((sum, l) => sum + unitPriceOf(l, input) * l.quantity, 0);
  const saleItems = regular.length > 0 && (regularGross > 0 || regular.some((l) => l.isGift))
    ? buildSaleDirectItems(regular, input)
    : [];
  // El pago debe cuadrar con el recálculo del servidor: el NETO de cada línea, no el bruto.
  const regularNet = saleItems.length > 0
    ? round2(regular.reduce((sum, l) => sum + (input.calcById[l.lineId]?.net ?? unitPriceOf(l, input) * l.quantity), 0))
    : 0;

  const newDeposit = round2(newCatalog.reduce((sum, l) => sum + (l.depositAmount ?? 0), 0));

  // Misma fórmula con la que la pantalla enseña «Total a cobrar». El descuento
  // y el aumento ya vienen dentro del neto de cada línea.
  const total = round2(computeLoadedFolioChargeAmount({
    folioCharge: folio,
    regularSubtotal: regularNet,
    catalogDeposit: newDeposit,
    discountAmt: 0,
  }));

  const receivedUsd = Math.max(0, input.cash.receivedUsd);
  const received = round2(Math.max(0, input.cash.received) + receivedUsd * input.cash.exchangeRate);
  const change = received > total ? round2(received - total) : 0;

  const payload: MixedCheckoutInput = {
    store_id: input.storeId,
    register_session_id: input.registerSessionId,
    ...(input.customerId ? { customer_id: input.customerId } : {}),
    liquidation: {
      pre_sale_order_id: input.preSaleOrderId,
      item_ids: itemIds,
      ...(folio > 0 ? { payment: { amount: folio, payment_method_id: input.paymentMethodId } } : {}),
      ...(itemDiscounts.length > 0 ? { item_discounts: itemDiscounts } : {}),
    },
    ...(saleItems.length > 0 ? {
      sale: {
        calc_version: 2 as const,
        items: saleItems,
        payments: [{
          payment_method_id: input.paymentMethodId,
          amount: regularNet,
          ...(input.terminalId != null ? { terminal_id: input.terminalId } : {}),
        }],
        // Dólares físicos y TC usado (Historial, corte y reporte); efectivo
        // entregado y cambio de TODO el ticket, para el ticket y el detalle.
        ...(receivedUsd > 0 ? { cash_received_usd: receivedUsd, exchange_rate: input.cash.exchangeRate } : {}),
        ...(received > 0 ? { cash_received: received, change_amount: change } : {}),
      },
    } : {}),
    ...(newCatalog.length > 0 ? {
      new_order: {
        items: newCatalog.map((l) => ({
          catalog_id: l.sellingCatalogId as number,
          quantity: l.quantity,
          price_level: PRESALE_PRICE_LEVEL[l.priceLevel] ?? 1,
        })),
        ...(newDeposit > 0 ? { advance_amount: newDeposit, payment_method_id: input.paymentMethodId } : {}),
      },
    } : {}),
  };

  return {
    payload,
    parts,
    saleItems,
    amounts: { folio, regularNet, newDeposit, total },
    cash: { received, receivedUsd, change },
  };
}

// ─── Candados de la mesa ─────────────────────────────────────────────────────

/**
 * Otra mesa que ya tiene cargado ese folio. Un folio en dos mesas se cobraba
 * dos veces (caso de tienda 2026-11-17): Caja no lo carga otra vez y cambia a
 * la mesa que ya lo tiene.
 */
export function findMesaWithFolio<M extends { id: string; loadedPreSaleOrderId?: number | undefined }>(
  mesas: readonly M[],
  orderId: number,
  exceptMesaId: string,
): M | undefined {
  return mesas.find((m) => m.id !== exceptMesaId && m.loadedPreSaleOrderId === orderId);
}

/**
 * Quita el folio de la mesa y conserva lo demás (productos normales, preventas
 * nuevas, cliente, método de pago). Devuelve una mesa nueva.
 */
export function unloadFolioFromMesa<
  L extends { isFromPreSale?: boolean | undefined },
  M extends {
    items: L[];
    depositAmount: number;
    loadedPreSaleOrderId?: number | undefined;
    loadedPreSaleOrderCode?: string | undefined;
    loadedPreSaleOldDebt?: number | undefined;
  },
>(mesa: M): M {
  const {
    loadedPreSaleOrderId: _orderId,
    loadedPreSaleOrderCode: _orderCode,
    loadedPreSaleOldDebt: _oldDebt,
    ...rest
  } = mesa;
  return { ...rest, items: mesa.items.filter((l) => !l.isFromPreSale), depositAmount: 0 } as unknown as M;
}

/**
 * ¿El error del cobro dice que el folio ya no se puede entregar? Null si es
 * otro error. Con esto Caja quita el folio de la mesa: no se cobró nada.
 */
export function staleFolioError(err: unknown): { alreadyDelivered: boolean; message: string } | null {
  if (typeof err !== "object" || err === null) return null;
  const { errors, message } = err as { errors?: unknown; message?: unknown };
  if (typeof errors !== "object" || errors === null) return null;
  const codes = (errors as Record<string, unknown>)["code"];
  const code = Array.isArray(codes) ? codes[0] : undefined;
  if (code !== MIXED_CHECKOUT_FOLIO_CODES.alreadyDelivered && code !== MIXED_CHECKOUT_FOLIO_CODES.notReady) return null;
  return {
    alreadyDelivered: code === MIXED_CHECKOUT_FOLIO_CODES.alreadyDelivered,
    message: typeof message === "string" ? message : "",
  };
}
