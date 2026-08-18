/**
 * Lógica pura del selector de categorías múltiples (CategoryMultiPicker):
 * filtra por texto (sin acentos/mayúsculas), excluye las ya seleccionadas y
 * dice si el texto coincide EXACTO con una existente (para no ofrecer
 * "crear «x»" duplicado). Testeable en aislamiento.
 */
export interface PickableCategory {
  id: number;
  name: string;
  active?: boolean;
}

export function normalizeCategoryText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export function pickCategoryMatches<T extends PickableCategory>(
  all: readonly T[],
  query: string,
  selectedIds: readonly number[],
): { matches: T[]; exact: boolean } {
  const q = normalizeCategoryText(query);
  const selected = new Set(selectedIds);
  const notSelected = all.filter(c => !selected.has(c.id));
  if (q === "") {
    // Sin texto: todas las no seleccionadas, activas primero, alfabético.
    const sorted = [...notSelected].sort((a, b) => {
      const act = Number(b.active !== false) - Number(a.active !== false);
      return act !== 0 ? act : a.name.localeCompare(b.name, "es");
    });
    return { matches: sorted, exact: false };
  }
  const starts = notSelected.filter(c => normalizeCategoryText(c.name).startsWith(q));
  const contains = notSelected.filter(c => !starts.includes(c) && normalizeCategoryText(c.name).includes(q));
  const matches = [...starts, ...contains];
  // "exacto" mira TODAS (también las ya seleccionadas): si ya existe, no se crea otra.
  const exact = all.some(c => normalizeCategoryText(c.name) === q);
  return { matches, exact };
}

/** Nombres para pintar en pills/detalle: "Funko · Figuras" (o "Sin categoría"). */
export function joinCategoryNames(names: readonly string[], empty = "Sin categoría"): string {
  const clean = names.map(n => n.trim()).filter(Boolean);
  return clean.length ? clean.join(" · ") : empty;
}
