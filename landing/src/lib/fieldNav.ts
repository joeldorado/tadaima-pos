/**
 * Moverse entre campos con las flechas (pedido de tienda 2026-09-29).
 *
 * En tienda capturan con teclado y quieren pasar de un campo a otro con las
 * flechas, como en una hoja de cálculo. Además, en los campos numéricos ↑/↓
 * subían o bajaban el precio sin querer. Reglas:
 *  - Número: ↑↓←→ siempre mueven (y ya no cambian el valor).
 *  - Texto: ↑↓ siempre mueven; ←→ solo en la orilla (cursor al inicio/fin y sin
 *    selección), para poder seguir editando dentro del texto.
 *  - Textarea, select, checkbox…: no se tocan (las flechas ahí hacen otra cosa).
 *  - Con Shift/Ctrl/Alt/⌘, en captura IME o si otro manejador ya atendió la
 *    tecla, nada.
 *
 * Lógica pura; el cableado al DOM vive en hooks/useArrowFieldNavigation.ts.
 */

export type NavDirection = "next" | "prev";
export type FieldKind = "number" | "text" | "multiline" | "other";

export interface NavKeyEvent {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
}

export interface NavField {
  kind: FieldKind;
  /** null cuando el navegador no expone el cursor (type=number, email). */
  selectionStart: number | null;
  selectionEnd: number | null;
  valueLength: number;
}

const TEXT_TYPES = new Set(["", "text", "search", "email", "tel", "password", "url"]);

export function fieldKindOf(tag: string, type: string | null): FieldKind {
  const t = tag.toUpperCase();
  if (t === "TEXTAREA") return "multiline";
  if (t !== "INPUT") return "other";
  const inputType = (type ?? "").toLowerCase();
  if (inputType === "number") return "number";
  return TEXT_TYPES.has(inputType) ? "text" : "other";
}

export function arrowNavDirection(ev: NavKeyEvent, field: NavField): NavDirection | null {
  if (ev.defaultPrevented || ev.isComposing) return null;
  if (ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey) return null;
  if (field.kind !== "number" && field.kind !== "text") return null;

  if (ev.key === "ArrowDown") return "next";
  if (ev.key === "ArrowUp") return "prev";
  if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return null;

  // Número (o texto sin cursor conocido): ←→ siempre mueven.
  const { selectionStart: start, selectionEnd: end } = field;
  if (field.kind === "number" || start === null || end === null) {
    return ev.key === "ArrowRight" ? "next" : "prev";
  }
  // Texto: con selección, ←→ solo la colapsan; sin selección, saltan en la orilla.
  if (start !== end) return null;
  if (ev.key === "ArrowRight") return end >= field.valueLength ? "next" : null;
  return start <= 0 ? "prev" : null;
}

export interface NavTargetInfo {
  tag: string;
  type: string | null;
  disabled?: boolean;
  readOnly?: boolean;
}

/** ¿Se puede aterrizar en este campo con las flechas? (los select se saltan). */
export function isNavTarget(el: NavTargetInfo): boolean {
  if (el.disabled || el.readOnly) return false;
  const kind = fieldKindOf(el.tag, el.type);
  return kind === "number" || kind === "text" || kind === "multiline";
}
