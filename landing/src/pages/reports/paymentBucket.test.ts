import { describe, expect, it } from "vitest";
import { bucketShares, payBucketOf } from "./paymentBucket";

describe("payBucketOf", () => {
  it("tarjeta: crédito, débito, TPV y terminal", () => {
    for (const name of ["Tarjeta", "Tarjeta de crédito", "Tarjeta de Débito", "Credit card", "TPV", "Terminal Clip"]) {
      expect(payBucketOf(name)).toBe("card");
    }
  });

  it("transferencia: transferencia, depósito y SPEI", () => {
    for (const name of ["Transferencia", "Deposito bancario", "SPEI", "Transferencia (Devuelto)"]) {
      expect(payBucketOf(name)).toBe("transfer");
    }
  });

  it("todo lo demás es efectivo, igual que la fila de resumen del reporte", () => {
    for (const name of ["Efectivo", "Efectivo (Devuelto)", "Dólares", "Otro", "", null, undefined]) {
      expect(payBucketOf(name)).toBe("cash");
    }
  });
});

describe("bucketShares", () => {
  const pay = (name: string, amount: number) => ({ amount, payment_method: { name } });

  it("un solo método se lleva todo", () => {
    expect(bucketShares([pay("Efectivo", 150)], "Otro")).toEqual({ cash: 1, card: 0, transfer: 0 });
  });

  it("venta mixta: proporcional al monto de cada pago", () => {
    const shares = bucketShares([pay("Efectivo", 60), pay("Transferencia", 40)], "Otro");
    expect(shares.cash).toBeCloseTo(0.6);
    expect(shares.transfer).toBeCloseTo(0.4);
    expect(shares.card).toBe(0);
  });

  it("sin pagos (o pagado $0) cae en el método de respaldo", () => {
    expect(bucketShares([], "Tarjeta")).toEqual({ cash: 0, card: 1, transfer: 0 });
    expect(bucketShares(undefined, "Otro")).toEqual({ cash: 1, card: 0, transfer: 0 });
    expect(bucketShares([pay("Transferencia", 0)], "Efectivo")).toEqual({ cash: 1, card: 0, transfer: 0 });
  });
});
