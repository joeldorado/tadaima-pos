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
}

export interface AllocationPayment {
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
    const share = splitByPiece(Math.max(0, payment.amount || 0), pieces, capacity);
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
