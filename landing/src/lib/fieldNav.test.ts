import { describe, expect, it } from "vitest";
import { arrowNavDirection, fieldKindOf, isNavTarget, type NavField } from "./fieldNav";

const numberField: NavField = { kind: "number", selectionStart: null, selectionEnd: null, valueLength: 4 };
const textAt = (start: number, end = start, len = 5): NavField =>
  ({ kind: "text", selectionStart: start, selectionEnd: end, valueLength: len });

describe("fieldKindOf", () => {
  it("clasifica los campos", () => {
    expect(fieldKindOf("INPUT", "number")).toBe("number");
    expect(fieldKindOf("INPUT", "text")).toBe("text");
    expect(fieldKindOf("INPUT", null)).toBe("text");
    expect(fieldKindOf("INPUT", "email")).toBe("text");
    expect(fieldKindOf("INPUT", "search")).toBe("text");
    expect(fieldKindOf("TEXTAREA", null)).toBe("multiline");
    expect(fieldKindOf("INPUT", "checkbox")).toBe("other");
    expect(fieldKindOf("INPUT", "radio")).toBe("other");
    expect(fieldKindOf("SELECT", null)).toBe("other");
    expect(fieldKindOf("BUTTON", null)).toBe("other");
  });
});

describe("arrowNavDirection", () => {
  it("en números todas las flechas mueven (y así ya no cambian el valor)", () => {
    expect(arrowNavDirection({ key: "ArrowDown" }, numberField)).toBe("next");
    expect(arrowNavDirection({ key: "ArrowRight" }, numberField)).toBe("next");
    expect(arrowNavDirection({ key: "ArrowUp" }, numberField)).toBe("prev");
    expect(arrowNavDirection({ key: "ArrowLeft" }, numberField)).toBe("prev");
  });

  it("en texto ↑↓ siempre mueven; ←→ solo en la orilla", () => {
    expect(arrowNavDirection({ key: "ArrowDown" }, textAt(2))).toBe("next");
    expect(arrowNavDirection({ key: "ArrowUp" }, textAt(2))).toBe("prev");
    expect(arrowNavDirection({ key: "ArrowRight" }, textAt(2))).toBeNull();
    expect(arrowNavDirection({ key: "ArrowLeft" }, textAt(2))).toBeNull();
    expect(arrowNavDirection({ key: "ArrowRight" }, textAt(5))).toBe("next");
    expect(arrowNavDirection({ key: "ArrowLeft" }, textAt(0))).toBe("prev");
  });

  it("con texto seleccionado ←→ no saltan (colapsan la selección)", () => {
    expect(arrowNavDirection({ key: "ArrowRight" }, textAt(0, 5))).toBeNull();
    expect(arrowNavDirection({ key: "ArrowLeft" }, textAt(0, 5))).toBeNull();
  });

  it("texto sin posición de cursor conocida se comporta como número", () => {
    expect(arrowNavDirection({ key: "ArrowRight" }, { kind: "text", selectionStart: null, selectionEnd: null, valueLength: 3 })).toBe("next");
  });

  it("modificadores, IME y eventos ya atendidos no mueven", () => {
    expect(arrowNavDirection({ key: "ArrowDown", shiftKey: true }, numberField)).toBeNull();
    expect(arrowNavDirection({ key: "ArrowDown", ctrlKey: true }, numberField)).toBeNull();
    expect(arrowNavDirection({ key: "ArrowDown", altKey: true }, numberField)).toBeNull();
    expect(arrowNavDirection({ key: "ArrowDown", metaKey: true }, numberField)).toBeNull();
    expect(arrowNavDirection({ key: "ArrowDown", isComposing: true }, numberField)).toBeNull();
    expect(arrowNavDirection({ key: "ArrowDown", defaultPrevented: true }, numberField)).toBeNull();
  });

  it("textarea, select y otras teclas no mueven", () => {
    const multiline: NavField = { kind: "multiline", selectionStart: 0, selectionEnd: 0, valueLength: 10 };
    const other: NavField = { kind: "other", selectionStart: null, selectionEnd: null, valueLength: 0 };
    expect(arrowNavDirection({ key: "ArrowDown" }, multiline)).toBeNull();
    expect(arrowNavDirection({ key: "ArrowDown" }, other)).toBeNull();
    expect(arrowNavDirection({ key: "Enter" }, numberField)).toBeNull();
    expect(arrowNavDirection({ key: "Tab" }, numberField)).toBeNull();
  });
});

describe("isNavTarget", () => {
  it("acepta texto, número y textarea habilitados y editables", () => {
    expect(isNavTarget({ tag: "INPUT", type: "number" })).toBe(true);
    expect(isNavTarget({ tag: "INPUT", type: "text" })).toBe(true);
    expect(isNavTarget({ tag: "TEXTAREA", type: null })).toBe(true);
  });

  it("salta select, checkbox, deshabilitados y de solo lectura", () => {
    expect(isNavTarget({ tag: "SELECT", type: null })).toBe(false);
    expect(isNavTarget({ tag: "INPUT", type: "checkbox" })).toBe(false);
    expect(isNavTarget({ tag: "INPUT", type: "hidden" })).toBe(false);
    expect(isNavTarget({ tag: "INPUT", type: "text", disabled: true })).toBe(false);
    expect(isNavTarget({ tag: "INPUT", type: "number", readOnly: true })).toBe(false);
  });
});
