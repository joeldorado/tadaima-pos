/**
 * Borrador de «Nueva Transferencia» (2026-11-24, reporte de la tienda: «llevábamos unos
 * productos escaneados y nos sacó de la nada»). Lo capturado se guarda en localStorage por
 * usuario (`useFormDraft`) y sobrevive a cerrar el modal y a recargar la página; se borra al
 * crear el traslado o con «Empezar de cero».
 */

/** Un artículo de la lista del traslado en captura. */
export interface DraftItem {
  product_id: number;
  name: string;
  sku: string;
  quantity: number;
  quantityInput: string;
}

export interface TransferDraft {
  fromWhId: string;
  toWhId: string;
  notes: string;
  items: DraftItem[];
  currentStep: 1 | 2;
}

/** Sube si cambia la forma guardada: los borradores viejos se descartan. */
export const TRANSFER_DRAFT_VERSION = 1;
export const TRANSFER_DRAFT_KEY = "tadaima-transfer-draft";

/** Sin artículos ni notas no hay nada que guardar (origen/destino se eligen solos). */
export function isEmptyTransferDraft(draft: TransferDraft): boolean {
  return draft.items.length === 0 && draft.notes.trim() === "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeItem(raw: unknown): DraftItem | null {
  if (!isRecord(raw)) return null;
  const productId = Number(raw.product_id);
  const quantity = Number(raw.quantity);
  if (!Number.isInteger(productId) || productId < 1) return null;
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  return {
    product_id: productId,
    name: typeof raw.name === "string" ? raw.name : "",
    sku: typeof raw.sku === "string" ? raw.sku : "",
    quantity,
    quantityInput: String(quantity),
  };
}

/**
 * Limpia un borrador leído de localStorage (dato externo: puede venir corrupto o de otra
 * versión). Descarta artículos mal formados o repetidos y almacenes que ya no existen
 * (`warehouseIds`; sin la lista todavía, los deja pasar). `null` si no queda nada útil.
 */
export function sanitizeTransferDraft(
  raw: unknown,
  warehouseIds?: ReadonlySet<string>,
): TransferDraft | null {
  if (!isRecord(raw)) return null;

  const seen = new Set<number>();
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map(sanitizeItem)
    .filter((item): item is DraftItem => {
      if (item === null || seen.has(item.product_id)) return false;
      seen.add(item.product_id);
      return true;
    });

  const keepWarehouse = (value: unknown): string => {
    const id = typeof value === "string" ? value : "";
    if (!id || (warehouseIds && !warehouseIds.has(id))) return "";
    return id;
  };

  const draft: TransferDraft = {
    fromWhId: keepWarehouse(raw.fromWhId),
    toWhId: keepWarehouse(raw.toWhId),
    notes: typeof raw.notes === "string" ? raw.notes : "",
    items,
    // La revisión sin artículos no tiene sentido: regresa a Datos.
    currentStep: raw.currentStep === 2 && items.length > 0 ? 2 : 1,
  };

  return isEmptyTransferDraft(draft) ? null : draft;
}

/** Rótulo del botón de la lista: «Continuar traslado (N)» si hay algo capturado. */
export function transferDraftButtonLabel(itemCount: number): string {
  return itemCount > 0 ? `Continuar traslado (${itemCount})` : "Nueva Transferencia";
}
