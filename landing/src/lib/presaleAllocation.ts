/**
 * Reparto de los pagos de un folio de preventa entre sus líneas.
 *
 * Los pagos viven por FOLIO (`pre_sale_order_payments`), no por producto. Para
 * decir cuánto se abonó de cada producto, el reporte tiene que repartir cada
 * pago entre las líneas del folio. La tienda aparta a tanto POR PIEZA (p. ej.
 * $200 por caja, sea un ETB de $1,100 o una Booster Box de $2,800), así que el
 * reparto es parejo por pieza, no proporcional al precio: repartir por precio
 * cargaba el anticipo a la pieza cara y dejaba a la barata casi en cero.
 *
 * Reglas:
 *  - Cada pago se reparte parejo por pieza, con tope en lo que le FALTA por
 *    cubrir a cada línea (precio × cantidad − lo ya asignado). Lo que sobra de
 *    una línea tapada pasa a las que todavía tienen saldo, de modo que al
 *    liquidar cada línea queda pagada exacto a su precio.
 *  - Los pagos se procesan en orden cronológico (`created_at`): lo asignado a
 *    un pago depende de lo que ya cubrieron los anteriores.
 *  - Si un pago excede lo que falta en todo el folio (sobrepago, o folio con
 *    total $0), el excedente se reparte parejo por pieza: la suma de lo
 *    asignado a las líneas siempre es igual al pago.
 */

export interface AllocationLine {
  quantity: number;
  unit_price: number;
  /**
   * Pago que liquidó esta línea al entregarla (entrega elegida en Caja, desde
   * 2026-11-13). Ese pago tapa primero sus líneas. Sin el dato (folios
   * anteriores, líneas pendientes) el reparto es el de siempre.
   */
  delivery_payment_id?: number | null;
}

export interface AllocationPayment {
  id?: number;
  amount: number;
  created_at: string;
}

export interface PresaleAllocation<P extends AllocationPayment> {
  /** Lo asignado a cada línea por cada pago (misma posición que las líneas). */
  byPayment: ReadonlyMap<P, readonly number[]>;
  /** Acumulado asignado a cada línea con todos los pagos. */
  paidByLine: readonly number[];
  /** Lo que falta por cubrir de cada línea; nunca negativo. */
  pendingByLine: readonly number[];
}

/** Tolerancia para considerar una línea "cubierta" o un pago "agotado" (centavos). */
const EPSILON = 0.000001;

export function allocatePresalePayments<P extends AllocationPayment>(
  lines: readonly AllocationLine[],
  payments: readonly P[],
): PresaleAllocation<P> {
  const lineTotals = lines.map((l) => Math.max(0, (l.unit_price || 0) * (l.quantity || 0)));
  const pieces = lines.map((l) => Math.max(0, l.quantity || 0));
  const ordered = [...payments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const byPayment = new Map<P, readonly number[]>();
  let paidByLine: readonly number[] = lines.map(() => 0);

  for (const payment of ordered) {
    const capacity = lineTotals.map((total, i) => Math.max(0, total - paidByLine[i]!));
    const share = splitPayment(payment, lines, pieces, capacity);
    byPayment.set(payment, share);
    paidByLine = paidByLine.map((paid, i) => paid + share[i]!);
  }

  const pendingByLine = lineTotals.map((total, i) => Math.max(0, total - paidByLine[i]!));
  return { byPayment, paidByLine, pendingByLine };
}

/**
 * Suma, por línea, lo asignado a un subconjunto de pagos (los del rango, los
 * de un método, los previos al rango…). Un pago que no esté en `byPayment`
 * no suma nada.
 */
export function sumByLine<P extends AllocationPayment>(
  byPayment: ReadonlyMap<P, readonly number[]>,
  payments: readonly P[],
): number[] {
  const lineCount = byPayment.values().next().value?.length ?? 0;
  const totals: number[] = Array.from({ length: lineCount }, () => 0);
  for (const payment of payments) {
    const share = byPayment.get(payment);
    if (!share) continue;
    for (let i = 0; i < share.length; i++) totals[i] = (totals[i] ?? 0) + share[i]!;
  }
  return totals;
}

/**
 * Reparto de UN pago. Si el pago liquidó una entrega, primero tapa las líneas
 * de esa entrega (lo que les faltaba) y solo el resto se reparte parejo por
 * pieza: en un folio entregado en dos visitas, el cobro de la primera no debe
 * aparecer abonado a la pieza que el cliente todavía no se lleva.
 */
function splitPayment(
  payment: AllocationPayment,
  lines: readonly AllocationLine[],
  pieces: readonly number[],
  capacity: readonly number[],
): number[] {
  const amount = Math.max(0, payment.amount || 0);
  const isOwn = (line: AllocationLine) => payment.id != null && line.delivery_payment_id === payment.id;
  if (!lines.some(isOwn)) return splitByPiece(amount, pieces, capacity);

  let remaining = amount;
  const own = lines.map((line, i) => {
    if (!isOwn(line)) return 0;
    const take = Math.min(capacity[i]!, remaining);
    remaining -= take;
    return take;
  });
  const rest = splitByPiece(remaining, pieces, capacity.map((cap, i) => cap - own[i]!));
  return own.map((taken, i) => taken + rest[i]!);
}

export interface DeliveryLine extends AllocationLine {
  /** La línea ya se entregó al cliente. */
  delivered: boolean;
}

export interface PresaleDeliveryCharge {
  /** Lo que falta por cobrar de cada línea (0 en las ya entregadas), en pesos con centavos exactos. */
  pendingByLine: readonly number[];
  /**
   * Saldo de piezas ya entregadas que nunca se cobró (folios viejos donde se
   * marcó «entregado» sin cobrar). Se cobra completo en la siguiente entrega.
   */
  oldDebt: number;
  /** Cobro de esta entrega: lo pendiente de las líneas elegidas + la deuda vieja. */
  charge: number;
}

/**
 * Cuánto cobrar al entregar SOLO algunas líneas de un folio (2026-11-13).
 *
 * Las líneas ya entregadas se dan por pagadas completas; lo que sobra de lo
 * pagado es el anticipo de las pendientes, parejo por pieza y con tope en el
 * precio de cada una. El cobro de hoy es lo que les falta a las líneas que el
 * cliente se lleva: la que se queda conserva su anticipo y su saldo.
 *
 * Todo se cierra en centavos enteros: elegir todas las pendientes da exacto el
 * saldo del folio y, para cualquier selección, lo pagado después del cobro
 * cubre lo entregado (la regla que valida el servidor).
 *
 * @param selected índices (posición en `lines`) de las líneas que se entregan hoy.
 */
export function presaleDeliveryCharge(
  lines: readonly DeliveryLine[],
  paid: number,
  selected: readonly number[],
): PresaleDeliveryCharge {
  const totals = lines.map((l) => toCents(Math.max(0, (l.unit_price || 0) * (l.quantity || 0))));
  const deliveredTotal = totals.reduce((sum, total, i) => sum + (lines[i]!.delivered ? total : 0), 0);
  const pool = toCents(Math.max(0, paid || 0)) - deliveredTotal;

  const pieces = lines.map((l) => (l.delivered ? 0 : Math.max(0, l.quantity || 0)));
  const capacity = totals.map((total, i) => (lines[i]!.delivered ? 0 : total));
  const shares = wholeCents(splitByPiece(Math.max(0, pool), pieces, capacity), Math.max(0, pool), capacity);

  const pending = totals.map((total, i) => (lines[i]!.delivered ? 0 : Math.max(0, total - shares[i]!)));
  const oldDebt = Math.max(0, -pool);
  const chosen = new Set(selected);
  const charge = pending.reduce((sum, cents, i) => sum + (chosen.has(i) ? cents : 0), 0)
    + (chosen.size > 0 ? oldDebt : 0);

  return {
    pendingByLine: pending.map(fromCents),
    oldDebt: fromCents(oldDebt),
    charge: fromCents(charge),
  };
}

/**
 * Cobro de las partidas de un folio que siguen en el carrito de Caja: lo que
 * les falta a esas partidas más la deuda vieja del folio. Sin partidas no se
 * cobra nada (el folio se descarga de la mesa).
 */
export function chargeForLoadedLines(pendings: readonly number[], oldDebt: number): number {
  if (pendings.length === 0) return 0;
  const cents = pendings.reduce((sum, pending) => sum + toCents(Math.max(0, pending || 0)), 0);
  return fromCents(cents + toCents(Math.max(0, oldDebt || 0)));
}

const toCents = (amount: number): number => Math.round(amount * 100);
const fromCents = (cents: number): number => cents / 100;

/**
 * Pasa un reparto en centavos fraccionados a centavos enteros sin perder ni
 * inventar dinero: redondea hacia abajo y entrega los centavos sobrantes a las
 * líneas con mayor fracción que todavía tengan capacidad.
 */
function wholeCents(shares: readonly number[], total: number, capacity: readonly number[]): number[] {
  const floors = shares.map((share) => Math.floor(share + EPSILON));
  let leftover = Math.round(Math.min(total, shares.reduce((sum, share) => sum + share, 0)))
    - floors.reduce((sum, cents) => sum + cents, 0);
  const byFraction = shares
    .map((share, i) => ({ i, fraction: share - floors[i]! }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);

  const result = [...floors];
  for (const { i } of byFraction) {
    if (leftover <= 0) break;
    if (capacity[i]! > 0 && result[i]! >= capacity[i]!) continue;
    result[i] = result[i]! + 1;
    leftover -= 1;
  }
  return result;
}

/**
 * Reparte `amount` parejo por pieza entre las líneas, sin pasar la capacidad
 * de cada una; lo que sobra se vuelve a repartir entre las que aún tienen
 * capacidad. Si ninguna tiene, el resto se reparte parejo por pieza (sobrepago).
 */
function splitByPiece(
  amount: number,
  pieces: readonly number[],
  capacity: readonly number[],
): number[] {
  const share = pieces.map(() => 0);
  if (share.length === 0 || amount <= 0) return share;

  let remaining = amount;
  let open = pieces.map((_, i) => i).filter((i) => capacity[i]! > EPSILON);

  while (remaining > EPSILON && open.length > 0) {
    const openPieces = open.reduce((sum, i) => sum + pieces[i]!, 0);
    const perPiece = openPieces > 0 ? remaining / openPieces : remaining / open.length;
    let assigned = 0;
    const stillOpen: number[] = [];
    for (const i of open) {
      const wanted = openPieces > 0 ? perPiece * pieces[i]! : perPiece;
      const room = capacity[i]! - share[i]!;
      const take = Math.min(wanted, room);
      share[i] = share[i]! + take;
      assigned += take;
      if (room - take > EPSILON) stillOpen.push(i);
    }
    remaining -= assigned;
    open = stillOpen;
  }

  // Sobrepago o folio en $0: el resto va parejo por pieza para no perderlo.
  if (remaining > EPSILON) {
    const totalPieces = pieces.reduce((sum, q) => sum + q, 0);
    for (let i = 0; i < share.length; i++) {
      share[i] = share[i]! + (totalPieces > 0 ? remaining * pieces[i]! / totalPieces : remaining / share.length);
    }
  }

  return share;
}
