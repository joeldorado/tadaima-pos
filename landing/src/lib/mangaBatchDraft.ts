/**
 * ¿El alta de tomos por lote está vacía? (2026-09-30). El renglón inicial nace
 * con id aleatorio, así que no sirve comparar contra un objeto fijo: se revisa
 * campo por campo. Vacía = no se guarda borrador ni se avisa al reabrir.
 */
export interface MangaBatchDraftLike {
  series: { nombre: string; editorial: string; genero: string; precioPublico: string; margenPct: string; categoryIds?: number[] };
  prices: Partial<Record<"price1" | "price2" | "price3" | "price4" | "price5", string>>;
  warehouseGroups: readonly unknown[];
  tomos: ReadonlyArray<{ id?: string; numero: string; isbn: string; status: string }>;
}

const DEFAULT_MARGIN = "30";

export function isEmptyMangaBatchDraft(d: MangaBatchDraftLike, hasImages = false): boolean {
  if (hasImages) return false;
  const s = d.series;
  if (s.nombre.trim() || s.editorial || s.genero || s.precioPublico.trim()) return false;
  if (s.margenPct !== DEFAULT_MARGIN || (s.categoryIds?.length ?? 0) > 0) return false;
  if (Object.values(d.prices).some(v => (v ?? "").trim() !== "")) return false;
  if (d.warehouseGroups.length > 0) return false;
  if (d.tomos.length !== 1) return false;
  const [t] = d.tomos;
  return !!t && t.numero === "" && t.isbn === "" && t.status === "idle";
}
