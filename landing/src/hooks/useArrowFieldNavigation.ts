import { useEffect } from "react";
import { arrowNavDirection, fieldKindOf, isNavTarget, type NavDirection } from "@/lib/fieldNav";

/**
 * Flechas para pasar de un campo a otro en TODOS los formularios (pedido de
 * tienda 2026-09-29). Un solo listener global montado en el Layout: las reglas
 * de qué tecla mueve viven en lib/fieldNav.ts.
 *
 * El recorrido se queda dentro del "alcance" del campo: el primer ancestro que
 * sea `[data-nav-scope]`, `[role=dialog]`, `<form>` o `position: fixed` (así
 * cubre los modales hechos a mano sin tocarlos); si no hay, `<main>`.
 * `data-arrow-nav="off"` en un campo o bloque lo excluye.
 *
 * Fase bubble a propósito: corre DESPUÉS de los onKeyDown de React, así respeta
 * a quien ya atendió la tecla (`defaultPrevented`).
 */
export function useArrowFieldNavigation(): void {
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (!ev.key.startsWith("Arrow")) return;
      const el = ev.target;
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;

      const kind = fieldKindOf(el.tagName, el.getAttribute("type"));
      const direction = arrowNavDirection(ev, {
        kind,
        ...caretOf(el, kind),
        valueLength: el.value.length,
      });
      if (!direction) return;

      const scope = resolveScope(el);
      if (!scope) return;
      const target = neighborField(scope, el, direction);
      // En la orilla (primer/último campo) no se hace nada, pero en números se
      // evita igual que ↑/↓ cambien el valor.
      ev.preventDefault();
      if (!target) return;
      target.focus();
      try { target.select(); } catch { /* algunos tipos no soportan select() */ }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

type Field = HTMLInputElement | HTMLTextAreaElement;

function caretOf(el: Field, kind: string): { selectionStart: number | null; selectionEnd: number | null } {
  if (kind === "number") return { selectionStart: null, selectionEnd: null };
  try {
    return { selectionStart: el.selectionStart, selectionEnd: el.selectionEnd };
  } catch {
    return { selectionStart: null, selectionEnd: null };
  }
}

function isScopeRoot(node: HTMLElement): boolean {
  return node.hasAttribute("data-nav-scope")
    || node.getAttribute("role") === "dialog"
    || node.tagName === "FORM"
    || node.tagName === "MAIN"
    || getComputedStyle(node).position === "fixed";
}

/** Alcance del campo, o null si está excluido con data-arrow-nav="off". */
function resolveScope(el: HTMLElement): HTMLElement | null {
  if (el.getAttribute("data-arrow-nav") === "off") return null;
  let node = el.parentElement;
  while (node && node !== document.body) {
    if (node.getAttribute("data-arrow-nav") === "off") return null;
    if (isScopeRoot(node)) return node;
    node = node.parentElement;
  }
  return document.body;
}

function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
}

function neighborField(scope: HTMLElement, current: Field, direction: NavDirection): Field | null {
  const fields = Array.from(scope.querySelectorAll<Field>("input, textarea")).filter(f =>
    f === current || (
      f.tabIndex >= 0
      && isNavTarget({ tag: f.tagName, type: f.getAttribute("type"), disabled: f.disabled, readOnly: f.readOnly })
      && isVisible(f)
      // Campos de un modal anidado (otro alcance) no cuentan para este.
      && resolveScope(f) === scope
    ));
  const idx = fields.indexOf(current);
  if (idx < 0) return null;
  return fields[direction === "next" ? idx + 1 : idx - 1] ?? null;
}
