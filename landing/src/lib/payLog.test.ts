import { describe, it, expect } from "vitest";
import { pushPayEntry, PAY_LOG_MAX, type PayLogEntry } from "./payLog";

describe("pushPayEntry", () => {
  it("agrega entradas en orden y arranca desde undefined", () => {
    // Arrange + Act
    const a = pushPayEntry(undefined, { label: "Billete +$200", kind: "mxn" });
    const b = pushPayEntry(a, { label: "Dólares US$15", kind: "usd" });

    // Assert
    expect(b).toHaveLength(2);
    expect(b[0]!.label).toBe("Billete +$200");
    expect(b[1]!.label).toBe("Dólares US$15");
    expect(b[1]!.id).not.toBe(b[0]!.id);
    expect(b[1]!.at).toBeTruthy();
  });

  it("una captura directa consecutiva REEMPLAZA a la anterior (teclear no spamea)", () => {
    const a = pushPayEntry(undefined, { label: "Capturado $2", kind: "mxn-input" });
    const b = pushPayEntry(a, { label: "Capturado $20", kind: "mxn-input" });
    const c = pushPayEntry(b, { label: "Capturado $200", kind: "mxn-input" });

    expect(c).toHaveLength(1);
    expect(c[0]!.label).toBe("Capturado $200");
  });

  it("NO reemplaza cuando la anterior es de otro tipo", () => {
    const a = pushPayEntry(undefined, { label: "Billete +$100", kind: "mxn" });
    const b = pushPayEntry(a, { label: "Capturado $150", kind: "mxn-input" });
    const c = pushPayEntry(b, { label: "Dólares US$10", kind: "usd" });
    const d = pushPayEntry(c, { label: "Capturado $180", kind: "mxn-input" });

    // La captura directa quedó separada por el evento USD → no reemplaza.
    expect(d).toHaveLength(4);
    expect(d.map(e => e.label)).toEqual([
      "Billete +$100", "Capturado $150", "Dólares US$10", "Capturado $180",
    ]);
  });

  it("respeta el tope: se van las entradas más viejas", () => {
    let log: PayLogEntry[] = [];
    for (let i = 1; i <= PAY_LOG_MAX + 5; i++) {
      log = pushPayEntry(log, { label: `Billete +$${i}`, kind: "mxn" });
    }

    expect(log).toHaveLength(PAY_LOG_MAX);
    expect(log[0]!.label).toBe("Billete +$6");
    expect(log[log.length - 1]!.label).toBe(`Billete +$${PAY_LOG_MAX + 5}`);
  });

  it("es inmutable: no toca el arreglo original", () => {
    const a = pushPayEntry(undefined, { label: "Billete +$50", kind: "mxn" });
    const snapshot = [...a];

    pushPayEntry(a, { label: "Capturado $80", kind: "mxn-input" });

    expect(a).toEqual(snapshot);
  });
});
