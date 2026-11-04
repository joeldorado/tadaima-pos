import { describe, expect, it } from "vitest";
import { SCAN_BURST_DEFAULTS, ScanBurst, type ScanResult, type ScanTargetKind } from "./scanBurst";

const CODE = "7503060913035";

function make() {
  return new ScanBurst<number>(SCAN_BURST_DEFAULTS);
}

/** Teclea `text` empezando en `start`, una tecla cada `step` ms. Devuelve el instante de la última. */
function type(
  b: ScanBurst<number>,
  text: string,
  { start = 0, step = 15, target = "other" }: { start?: number; step?: number; target?: ScanTargetKind } = {},
): { results: ScanResult<number>[]; last: number } {
  const results: ScanResult<number>[] = [];
  let at = start;
  for (let i = 0; i < text.length; i++) {
    at = start + i * step;
    results.push(b.press({ key: text.charAt(i), at, target, token: at }));
  }
  return { results, last: at };
}

function enter(b: ScanBurst<number>, at: number, target: ScanTargetKind = "other") {
  return b.press({ key: "Enter", at, target, token: at });
}

describe("ScanBurst — ráfaga con el foco fuera de un input", () => {
  it("código completo + Enter → scan completo y el Enter se traga", () => {
    const b = make();
    const { results, last } = type(b, CODE);
    expect(results.every(r => r.kind === "buffered")).toBe(true);

    const r = enter(b, last + 10);
    expect(r).toMatchObject({ kind: "scan", code: CODE, emit: true, incomplete: false, swallowEnter: true });
    expect(r.kind === "scan" && r.tokens.length).toBe(CODE.length);
    expect(b.pending).toBe("");
  });

  it("un hueco de 80 ms entre teclas (re-render de Caja) ya no corta el código", () => {
    const b = make();
    type(b, "7503", { step: 15 });
    const { last } = type(b, "060913035", { start: 45 + 80, step: 15 });
    expect(enter(b, last + 10)).toMatchObject({ kind: "scan", code: CODE, incomplete: false });
  });

  it("si de verdad se perdió un prefijo, el código sale marcado incompleto, nunca como bueno", () => {
    const b = make();
    type(b, "7503", { step: 15 });
    const { last } = type(b, "060913035", { start: 45 + 250, step: 15 });
    expect(enter(b, last + 10)).toMatchObject({ kind: "scan", code: "060913035", incomplete: true });
  });

  it("una tecla suelta vieja (sin timer que la limpie) no marca incompleto el siguiente escaneo", () => {
    const b = make();
    b.press({ key: "a", at: 0, target: "other", token: 0 });
    b.press({ key: "Shift", at: 50, target: "other", token: 50 });
    const { last } = type(b, CODE, { start: 1000 });
    expect(enter(b, last + 10)).toMatchObject({ kind: "scan", code: CODE, incomplete: false });
  });

  it("menos de 4 caracteres no es escaneo y el Enter sigue su curso", () => {
    const b = make();
    const { last } = type(b, "750");
    expect(enter(b, last + 10)).toEqual({ kind: "ignore" });
  });

  it("Ctrl/Meta/Alt, Tab y Escape reinician la ráfaga", () => {
    const b = make();
    type(b, "7503");
    expect(b.press({ key: "c", at: 60, target: "other", modifier: true, token: 60 })).toEqual({ kind: "ignore" });
    expect(b.pending).toBe("");
    type(b, "7503", { start: 100 });
    b.press({ key: "Tab", at: 160, target: "other", token: 160 });
    expect(b.pending).toBe("");
  });
});

describe("ScanBurst — ráfaga dentro de un input (efectivo, cliente)", () => {
  it("velocidad de máquina → scan; el Enter no llega al campo", () => {
    const b = make();
    const { last } = type(b, CODE, { target: "editable", step: 20 });
    expect(enter(b, last + 10, "editable")).toMatchObject({ kind: "scan", code: CODE, swallowEnter: true });
  });

  it("un humano tecleando a 120 ms por tecla nunca es escaneo", () => {
    const b = make();
    const { results, last } = type(b, "1500", { target: "editable", step: 120 });
    expect(results.every(r => r.kind === "buffered" || r.kind === "ignore")).toBe(true);
    expect(b.pending.length).toBeLessThan(SCAN_BURST_DEFAULTS.minLength);
    expect(enter(b, last + 100, "editable")).toEqual({ kind: "ignore" });
  });

  it("un hueco mayor a 40 ms en un input deja pasar la tecla al campo", () => {
    const b = make();
    type(b, "75", { target: "editable", step: 20 });
    expect(b.press({ key: "0", at: 20 + 90, target: "editable", token: 1 })).toEqual({ kind: "ignore" });
    expect(b.pending).toBe("");
  });
});

describe("ScanBurst — el foco entra al campo de producto a mitad del escaneo", () => {
  it("lo acumulado se entrega como carry para insertarlo en el campo", () => {
    const b = make();
    type(b, "7503", { step: 15 });
    const r = b.press({ key: "0", at: 60, target: "self", token: 60 });
    expect(r).toEqual({ kind: "carry", text: "7503" });
    expect(b.pending).toBe("");
    // El resto lo teclea el lector directo en el campo: el detector no interviene.
    expect(b.press({ key: "6", at: 75, target: "self", token: 75 })).toEqual({ kind: "ignore" });
    expect(enter(b, 200, "self")).toEqual({ kind: "ignore" });
  });

  it("un Shift que cae en el campo (mayúscula del lector) no tira lo acumulado", () => {
    const b = make();
    type(b, "PAQ-", { step: 15 });
    expect(b.press({ key: "Shift", at: 60, target: "self", token: 60 })).toEqual({ kind: "ignore" });
    expect(b.press({ key: "0", at: 75, target: "self", token: 75 })).toEqual({ kind: "carry", text: "PAQ-" });
  });

  it("si el foco cambia justo antes del Enter, el código completo viaja en el carry", () => {
    const b = make();
    const { last } = type(b, CODE, { step: 15 });
    expect(enter(b, last + 10, "self")).toEqual({ kind: "carry", text: CODE });
  });

  it("un buffer viejo no se mete al campo", () => {
    const b = make();
    type(b, "7503", { step: 15 });
    expect(b.press({ key: "a", at: 45 + 500, target: "self", token: 1 })).toEqual({ kind: "ignore" });
  });
});

describe("ScanBurst — flush por tiempo y duplicados", () => {
  it("sin Enter: el timeout entrega el código y el Enter tardío se traga una sola vez", () => {
    const b = make();
    const { last } = type(b, CODE);
    const r = b.timeout(last + SCAN_BURST_DEFAULTS.flushTimeoutMs);
    expect(r).toMatchObject({ kind: "scan", code: CODE, emit: true, swallowEnter: false });
    const lateAt = last + SCAN_BURST_DEFAULTS.flushTimeoutMs + 100;
    expect(enter(b, lateAt)).toEqual({ kind: "swallow" });
    expect(enter(b, lateAt + 10)).toEqual({ kind: "ignore" });
  });

  it("timeout con buffer vacío no hace nada", () => {
    expect(make().timeout(1000)).toEqual({ kind: "ignore" });
  });

  it("la misma lectura repetida en menos de 500 ms se limpia pero no se emite", () => {
    const b = make();
    const first = type(b, CODE);
    enter(b, first.last + 10);
    const second = type(b, CODE, { start: first.last + 200 });
    const r = enter(b, second.last + 10);
    expect(r).toMatchObject({ kind: "scan", code: CODE, emit: false, swallowEnter: true });
    expect(r.kind === "scan" && r.tokens.length).toBe(CODE.length);

    const third = type(b, CODE, { start: second.last + 900 });
    expect(enter(b, third.last + 10)).toMatchObject({ kind: "scan", emit: true });
  });
});
