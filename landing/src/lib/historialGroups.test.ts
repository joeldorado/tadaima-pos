import { describe, expect, it } from "vitest";
import { countItems, groupByHour, hourLabel, sliceGroups, ticketTime } from "./historialGroups";

interface Ticket { id: number; at: string | null }

/** Fecha local (sin zona) para que la prueba no dependa del huso de la máquina. */
const local = (h: number, m = 0): string => new Date(2026, 9, 19, h, m).toISOString();

const byDate = (t: Ticket): string | null => t.at;

describe("hourLabel", () => {
  it("usa a. m. / p. m. con el 12 bien puesto", () => {
    expect(hourLabel(0)).toBe("12 a. m.");
    expect(hourLabel(9)).toBe("9 a. m.");
    expect(hourLabel(12)).toBe("12 p. m.");
    expect(hourLabel(15)).toBe("3 p. m.");
    expect(hourLabel(23)).toBe("11 p. m.");
  });
});

describe("ticketTime", () => {
  it("da la hora con minutos en dos dígitos", () => {
    expect(ticketTime(local(15, 7))).toBe("3:07 p. m.");
    expect(ticketTime(local(0, 30))).toBe("12:30 a. m.");
  });

  it("regresa vacío si no hay fecha válida", () => {
    expect(ticketTime(null)).toBe("");
    expect(ticketTime("no-es-fecha")).toBe("");
  });
});

describe("groupByHour", () => {
  it("agrupa por hora respetando el orden de lo más nuevo a lo más viejo", () => {
    const tickets: Ticket[] = [
      { id: 5, at: local(15, 50) },
      { id: 4, at: local(15, 2) },
      { id: 3, at: local(14, 59) },
      { id: 2, at: local(10, 0) },
      { id: 1, at: local(10, 0) },
    ];
    const groups = groupByHour(tickets, byDate);
    expect(groups.map(g => g.label)).toEqual(["3 p. m.", "2 p. m.", "10 a. m."]);
    expect(groups.map(g => g.total)).toEqual([2, 1, 2]);
    expect(groups[0]?.items.map(t => t.id)).toEqual([5, 4]);
  });

  it("junta una hora que reaparece y manda lo que no tiene fecha al final", () => {
    const tickets: Ticket[] = [
      { id: 1, at: local(15) },
      { id: 2, at: null },
      { id: 3, at: local(14) },
      { id: 4, at: local(15, 30) },
      { id: 5, at: "basura" },
    ];
    const groups = groupByHour(tickets, byDate);
    expect(groups.map(g => [g.label, g.items.map(t => t.id)])).toEqual([
      ["3 p. m.", [1, 4]],
      ["2 p. m.", [3]],
      ["Sin hora", [2, 5]],
    ]);
  });

  it("sin tickets no hay grupos", () => {
    expect(groupByHour<Ticket>([], byDate)).toEqual([]);
  });
});

describe("sliceGroups", () => {
  const tickets: Ticket[] = Array.from({ length: 7 }, (_, i) => ({ id: 7 - i, at: local(i < 4 ? 15 : 14) }));
  const groups = groupByHour(tickets, byDate); // 3 p. m. = 4 tickets, 2 p. m. = 3

  it("corta en el límite sin perder el total de cada hora", () => {
    const sliced = sliceGroups(groups, 5);
    expect(sliced.map(g => [g.label, g.items.length, g.total])).toEqual([
      ["3 p. m.", 4, 4],
      ["2 p. m.", 1, 3],
    ]);
    expect(countItems(sliced)).toBe(5);
  });

  it("no regresa horas vacías ni falla con límites raros", () => {
    expect(sliceGroups(groups, 4).map(g => g.label)).toEqual(["3 p. m."]);
    expect(sliceGroups(groups, 0)).toEqual([]);
    expect(sliceGroups(groups, -3)).toEqual([]);
    expect(countItems(sliceGroups(groups, 100))).toBe(7);
  });

  it("no cambia los grupos originales", () => {
    sliceGroups(groups, 2);
    expect(groups[0]?.items).toHaveLength(4);
  });
});
