/**
 * Aviso "este código ya existe" compartido por el alta de producto y el alta de
 * tomos (2026-11-23). `productCode.ts` decide CUÁNDO consultar; aquí se decide
 * QUÉ decir y QUÉ botones ofrecer según lo que encontró GET /products/lookup, y
 * qué renglones de un lote de tomos chocan entre sí o con el catálogo.
 */
import { isSkuMatch, normalizeCode } from "./productCode";

/** Lo mínimo que se necesita de una coincidencia para decidir. */
export interface CodeMatch {
  sku: string;
  product_type?: string | null;
}

/** "create": alta (ofrece abrir el existente). "edit": solo avisa. */
export type DuplicateNoticeMode = "create" | "edit";

/** Botones que puede llevar el aviso. */
export type DuplicateAction = "edit-product" | "edit-manga" | "stock-manga";

/** Qué handlers tiene disponibles la pantalla que muestra el aviso. */
export interface DuplicateActionHandlers {
  editProduct: boolean;
  editManga: boolean;
  stock: boolean;
}

export function isMangaMatch(match: Pick<CodeMatch, "product_type">): boolean {
  return match.product_type === "manga";
}

/** Título del aviso: dice "tomo" cuando lo que ya tiene el código es un tomo. */
export function duplicateNoticeTitle(match: CodeMatch, code: string, mode: DuplicateNoticeMode): string {
  const manga = isMangaMatch(match);
  if (mode === "edit") return manga ? "Un tomo ya usa este código" : "Otro producto ya usa este código";
  if (isSkuMatch(match, code)) return manga ? "Este código ya es de un tomo" : "Este código ya existe";
  return manga
    ? "Este código ya es el código de barras de un tomo"
    : "Este código ya es el código de barras de otro producto";
}

/**
 * Botones del aviso. Solo en alta y solo para quien puede editar (admin /
 * gerente). Un tomo se edita en su propio modal (no en el de producto) y ofrece
 * cambiar su existencia; un producto normal, "Editar ese producto".
 */
export function duplicateNoticeActions(
  match: CodeMatch,
  opts: { mode: DuplicateNoticeMode; canEdit: boolean; handlers: DuplicateActionHandlers },
): DuplicateAction[] {
  if (opts.mode !== "create" || !opts.canEdit) return [];
  const { handlers } = opts;
  if (isMangaMatch(match)) {
    return [
      ...(handlers.editManga ? (["edit-manga"] as const) : []),
      ...(handlers.stock ? (["stock-manga"] as const) : []),
    ];
  }
  return handlers.editProduct ? ["edit-product"] : [];
}

/**
 * ¿Mostrar "Pide a un gerente que lo edite"? Solo en alta, para quien no puede
 * editar, y cuando el código choca por SKU (el alta no va a proceder).
 */
export function showAskManagerHint(match: CodeMatch, code: string, opts: { mode: DuplicateNoticeMode; canEdit: boolean }): boolean {
  return opts.mode === "create" && !opts.canEdit && isSkuMatch(match, code);
}

/** La primera coincidencia que ya usa el código como SKU (bloquea el alta). */
export function findSkuOwner<T extends CodeMatch>(matches: readonly T[], code: string): T | undefined {
  return matches.find(m => isSkuMatch(m, code));
}

/**
 * Renglones de un lote cuyo código se repite DENTRO del mismo lote (sin
 * distinguir mayúsculas ni espacios). Los vacíos no cuentan: el backend les
 * genera un SKU propio. Devuelve los ids de TODOS los renglones repetidos.
 */
export function findBatchDuplicateIds(rows: readonly { id: string; code: string }[]): Set<string> {
  const byCode = rows.reduce<Map<string, string[]>>((acc, row) => {
    const code = normalizeCode(row.code);
    if (!code) return acc;
    return new Map(acc).set(code, [...(acc.get(code) ?? []), row.id]);
  }, new Map());
  return new Set([...byCode.values()].filter(ids => ids.length > 1).flat());
}
