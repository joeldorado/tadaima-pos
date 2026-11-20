import { describe, expect, it } from "vitest";
import { formatPresaleDate, presaleDeliveryInfo, type DeliverableItem } from "./presaleDeliveryDate";

const pending: DeliverableItem = { status: "pending", delivered_at: null };
const delivered = (iso: string | null): DeliverableItem => ({ status: "delivered", delivered_at: iso });

describe("presaleDeliveryInfo", () => {
  it("folio sin entregar: sin fecha de entrega", () => {
    expect(presaleDeliveryInfo([pending, pending])).toEqual({
      lastDeliveredAt: null,
      deliveredCount: 0,
      totalCount: 2,
      isPartial: false,
    });
  });

  it("folio entregado completo: toma la fecha de entrega", () => {
    const info = presaleDeliveryInfo([delivered("2026-11-18T22:42:00.000000Z")]);
    expect(info.lastDeliveredAt).toBe("2026-11-18T22:42:00.000000Z");
    expect(info.isPartial).toBe(false);
  });

  it("entrega parcial: marca parcial y cuenta piezas entregadas", () => {
    const info = presaleDeliveryInfo([delivered("2026-11-18T22:42:00Z"), pending, pending]);
    expect(info).toEqual({
      lastDeliveredAt: "2026-11-18T22:42:00Z",
      deliveredCount: 1,
      totalCount: 3,
      isPartial: true,
    });
  });

  it("dos entregas en días distintos: gana la más reciente", () => {
    const info = presaleDeliveryInfo([
      delivered("2026-11-20T18:00:00Z"),
      delivered("2026-11-13T18:00:00Z"),
    ]);
    expect(info.lastDeliveredAt).toBe("2026-11-20T18:00:00Z");
  });

  it("partida entregada sin fecha (dato raro) se ignora para la fecha", () => {
    const info = presaleDeliveryInfo([delivered(null), delivered("2026-11-13T18:00:00Z")]);
    expect(info.lastDeliveredAt).toBe("2026-11-13T18:00:00Z");
    expect(info.deliveredCount).toBe(2);
  });

  it("sin partidas o items nulos no truena", () => {
    expect(presaleDeliveryInfo(undefined).lastDeliveredAt).toBeNull();
    expect(presaleDeliveryInfo([]).isPartial).toBe(false);
  });
});

describe("formatPresaleDate", () => {
  it("usa el día de Tijuana, no el UTC", () => {
    // 2026-11-19 05:00 UTC = 18 nov 21:00 en Tijuana
    expect(formatPresaleDate("2026-11-19T05:00:00Z")).toMatch(/^18 nov/);
  });

  it("fecha inválida o vacía → cadena vacía", () => {
    expect(formatPresaleDate(null)).toBe("");
    expect(formatPresaleDate("no-es-fecha")).toBe("");
  });
});
