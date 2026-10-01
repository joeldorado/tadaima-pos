/**
 * Corregir el método de pago de una venta ya cobrada (2026-09-30) — reglas
 * puras del modal "Corregir pago". Espejo de SalePaymentCorrectionService: el
 * backend vuelve a validar todo; esto solo evita mandar algo que va a rebotar.
 *
 * - Cualquier rol mientras la caja donde se cobró siga abierta; con el corte
 *   cerrado, solo admin.
 * - Solo ventas vigentes y sin cancelaciones.
 * - Un método (Efectivo / Tarjeta / Transferencia) o Mixto = Efectivo +
 *   Transferencia; misma suma; tarjeta con terminal; sin dólares.
 */
import type { SaleDetail } from "@tadaima/api";
import { computeMixedSplit } from "@/lib/mixedPayment";

/** Mismos ids que manda el cobro de Caja (SellPage, PM_IDS). */
export const PAYMENT_METHOD_IDS = { efectivo: 1, tarjeta: 2, transferencia: 4 } as const;

export type CorrectionMethod = "efectivo" | "tarjeta" | "transferencia" | "mixto";
export type PaymentKind = "efectivo" | "dolares" | "tarjeta" | "transferencia" | "otro";

export interface CorrectionPayment {
  payment_method_id: number;
  amount: number;
  terminal_id?: number | null;
}

type SalePayments = Pick<SaleDetail, "payments">;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Misma clasificación por nombre que PaymentMethod::isCard/isCashLike del backend. */
export function classifyMethodName(name: string | null | undefined): PaymentKind {
  const n = (name ?? "").toLowerCase();
  if (n.includes("tarjeta")) return "tarjeta";
  if (n.includes("dolar") || n.includes("dólar")) return "dolares";
  if (n.includes("efectivo")) return "efectivo";
  if (n.includes("transfer")) return "transferencia";
  return "otro";
}

export function paymentsTotal(sale: SalePayments): number {
  return round2((sale.payments ?? []).reduce((s, p) => s + Number(p.amount || 0), 0));
}

/** Lo que entró al cajón: efectivo y dólares. */
export function cashPortion(sale: SalePayments): number {
  return round2((sale.payments ?? [])
    .filter(p => {
      const kind = classifyMethodName(p.payment_method?.name);
      return kind === "efectivo" || kind === "dolares";
    })
    .reduce((s, p) => s + Number(p.amount || 0), 0));
}

/** El método actual en términos del modal (null si es algo raro, p. ej. dólares). */
export function currentCorrectionMethod(sale: SalePayments): CorrectionMethod | null {
  const kinds = [...new Set((sale.payments ?? []).map(p => classifyMethodName(p.payment_method?.name)))].sort();
  if (kinds.length === 1 && (kinds[0] === "efectivo" || kinds[0] === "tarjeta" || kinds[0] === "transferencia")) {
    return kinds[0];
  }
  if (kinds.length === 2 && kinds[0] === "efectivo" && kinds[1] === "transferencia") return "mixto";
  return null;
}

export interface CorrectionGateInput {
  sale: Pick<SaleDetail, "status" | "cancellation_status" | "payments" | "register_session_id" | "register_session_status">;
  isAdmin: boolean;
  /** Caja abierta de quien está usando la pantalla (para ventas recién cobradas). */
  activeSessionId?: number | null;
}

export interface CorrectionGate {
  allowed: boolean;
  reason?: string;
}

export function canCorrectPayment({ sale, isAdmin, activeSessionId }: CorrectionGateInput): CorrectionGate {
  if (sale.status !== "completed") {
    return { allowed: false, reason: "La venta está cancelada." };
  }
  if ((sale.cancellation_status ?? "none") !== "none") {
    return { allowed: false, reason: "Esta venta ya tiene cancelaciones: la devolución se calculó con el pago original." };
  }
  if ((sale.payments ?? []).length === 0) {
    return { allowed: false, reason: "Esta venta no tiene pagos registrados." };
  }
  // undefined = no se sabe (fila optimista recién cobrada): decide el backend.
  // null = la venta no tiene caja (p. ej. entrega de apartado) → como cerrada.
  const sessionOpen = sale.register_session_status === "open"
    || (activeSessionId != null && sale.register_session_id === activeSessionId);
  const sessionClosed = sale.register_session_status === "closed" || sale.register_session_status === null;
  if (sessionClosed && !sessionOpen && !isAdmin) {
    return { allowed: false, reason: "La caja de esta venta ya se cerró (corte hecho). Pide a un administrador que lo corrija." };
  }
  return { allowed: true };
}

/** Motivo mínimo: queda en el log (el backend lo exige). */
export const MIN_REASON_LENGTH = 3;

export interface CorrectionDraft {
  method: CorrectionMethod;
  /** Lo cobrado (Σ pagos actuales). */
  total: number;
  terminalId: number | null;
  /** Mixto: monto por transferencia como lo teclean. */
  transferStr: string;
  /** ¿la venta se cobró con dólares? */
  hasUsd: boolean;
  current: SalePayments;
}

export type CorrectionResult =
  | { ok: true; payments: CorrectionPayment[] }
  | { ok: false; error: string };

function paymentsFor(draft: CorrectionDraft): CorrectionResult {
  const { method, total, terminalId, transferStr } = draft;
  switch (method) {
    case "efectivo":
      return { ok: true, payments: [{ payment_method_id: PAYMENT_METHOD_IDS.efectivo, amount: total }] };
    case "transferencia":
      return { ok: true, payments: [{ payment_method_id: PAYMENT_METHOD_IDS.transferencia, amount: total }] };
    case "tarjeta": {
      if (terminalId == null) return { ok: false, error: "Elige la terminal con la que se cobró." };
      // Si ya era tarjeta (solo cambia la terminal) se conserva su método
      // (Débito/Crédito); si no, el de Caja.
      const currentCard = (draft.current.payments ?? []).find(p => classifyMethodName(p.payment_method?.name) === "tarjeta");
      const methodId = currentCard?.payment_method_id ?? PAYMENT_METHOD_IDS.tarjeta;
      return { ok: true, payments: [{ payment_method_id: methodId, amount: total, terminal_id: terminalId }] };
    }
    case "mixto": {
      const split = computeMixedSplit(total, transferStr);
      if (!split.valid) return { ok: false, error: "Captura cuánto fue por transferencia (menos que el total)." };
      return {
        ok: true,
        payments: [
          { payment_method_id: PAYMENT_METHOD_IDS.efectivo, amount: split.cashPortion },
          { payment_method_id: PAYMENT_METHOD_IDS.transferencia, amount: split.transfer },
        ],
      };
    }
  }
}

/** Arma el body de PUT /sales/{id}/payments o explica por qué no se puede. */
export function buildCorrectionPayload(draft: CorrectionDraft): CorrectionResult {
  const usesCash = draft.method === "efectivo" || draft.method === "mixto";
  if (draft.hasUsd && usesCash) {
    return { ok: false, error: "Se cobró con dólares: solo se puede corregir a Tarjeta o Transferencia." };
  }
  const result = paymentsFor(draft);
  if (!result.ok) return result;

  const signature = (list: ReadonlyArray<{ payment_method_id: number; amount: number; terminal_id?: number | null }>) =>
    list.map(p => `${p.payment_method_id}|${p.terminal_id ?? 0}|${round2(Number(p.amount)).toFixed(2)}`).sort().join(",");
  if (signature(result.payments) === signature(draft.current.payments ?? [])) {
    return { ok: false, error: "No hay cambios: la venta ya está registrada así." };
  }
  return result;
}

/** Efectivo que quedaría en el cajón con el pago corregido. */
export function cashAfter(payments: readonly CorrectionPayment[]): number {
  return round2(payments
    .filter(p => p.payment_method_id === PAYMENT_METHOD_IDS.efectivo)
    .reduce((s, p) => s + p.amount, 0));
}
