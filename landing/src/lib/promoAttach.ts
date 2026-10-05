import type { Promotion } from "@tadaima/api";

/**
 * Agregar / quitar productos de una promo POR LOTES. El server valida cada
 * lote todo-o-nada (422 con `errors` por producto): aquí se reintenta una vez
 * sin los rechazados, para que un producto en conflicto no tumbe a toda la
 * categoría, y se arma el resumen que ve el usuario.
 */

/** Cada producto corre varias reglas en el server: lotes chicos = avance visible. */
export const ATTACH_CHUNK_SIZE = 100;
/** Quitar no valida reglas; va al tope que acepta el server por envío. */
export const DETACH_CHUNK_SIZE = 500;

export interface AttachRejection {
  productId: number;
  message: string;
}

export interface AttachOutcome {
  attachedIds: number[];
  rejections: AttachRejection[];
  /** Los que no se alcanzaron a mandar (falla general a media corrida). */
  pendingIds: number[];
  fatalMessage: string | null;
  /** Última versión de la promo que devolvió el server; null si nada entró. */
  promo: Promotion | null;
}

export type ParsedAttachError =
  | { kind: "per-product"; rejections: AttachRejection[] }
  | { kind: "fatal"; message: string };

interface AttachInChunksArgs {
  promoId: number;
  productIds: readonly number[];
  attach: (promoId: number, productIds: number[]) => Promise<Promotion>;
  chunkSize?: number;
  onProgress?: (done: number, total: number) => void;
}

interface DetachInChunksArgs {
  promoId: number;
  productIds: readonly number[];
  detach: (promoId: number, productIds: number[]) => Promise<Promotion>;
  chunkSize?: number;
}

export interface AttachSummary {
  headline: string;
  rejected: Array<AttachRejection & { name: string }>;
  pendingCount: number;
  fatalMessage: string | null;
}

const FALLBACK_ERROR = "No se pudieron agregar los productos. Intenta de nuevo.";
const VALIDATION_KEY = /^product_ids\.(\d+)$/;

export function chunkIds(ids: readonly number[], size: number): number[][] {
  const chunks: number[][] = [];
  for (let start = 0; start < ids.length; start += size) {
    chunks.push(ids.slice(start, start + size));
  }
  return chunks;
}

function errorShape(err: unknown): { message?: string; errors?: Record<string, unknown> } {
  return typeof err === "object" && err !== null ? err : {};
}

/** El server manda arreglos de mensajes; un proxy podría mandar el texto suelto. */
function firstMessage(messages: unknown): string {
  const first: unknown = Array.isArray(messages) ? messages[0] : messages;
  return typeof first === "string" && first !== "" ? first : FALLBACK_ERROR;
}

/**
 * El 422 del server trae `errors` con el id del producto como llave (reglas de
 * negocio) o `product_ids.N` (validación, N = posición en el lote). Cualquier
 * otra cosa es un error general: no se sabe qué producto falló.
 */
export function parseAttachError(err: unknown, chunk: readonly number[]): ParsedAttachError {
  const { message, errors } = errorShape(err);
  const inChunk = new Set(chunk);
  const rejections: AttachRejection[] = [];
  const otherMessages: string[] = [];

  for (const [key, messages] of Object.entries(errors ?? {})) {
    const text = firstMessage(messages);
    const byPosition = VALIDATION_KEY.exec(key);
    const productId = byPosition ? chunk[Number(byPosition[1])] : Number(key);
    if (productId !== undefined && inChunk.has(productId)) {
      rejections.push({ productId, message: text });
    } else {
      otherMessages.push(text);
    }
  }

  if (rejections.length > 0) return { kind: "per-product", rejections };
  return { kind: "fatal", message: otherMessages[0] ?? message ?? FALLBACK_ERROR };
}

export async function attachInChunks(args: AttachInChunksArgs): Promise<AttachOutcome> {
  const { promoId, productIds, attach, chunkSize = ATTACH_CHUNK_SIZE, onProgress } = args;
  const chunks = chunkIds(productIds, chunkSize);
  let outcome: AttachOutcome = { attachedIds: [], rejections: [], pendingIds: [], fatalMessage: null, promo: null };
  let done = 0;

  const stopWith = (fatalMessage: string, unsent: readonly number[], chunkIndex: number): AttachOutcome => ({
    ...outcome,
    fatalMessage,
    pendingIds: [...unsent, ...chunks.slice(chunkIndex + 1).flat()],
  });

  for (const [index, chunk] of chunks.entries()) {
    try {
      const promo = await attach(promoId, chunk);
      outcome = { ...outcome, promo, attachedIds: [...outcome.attachedIds, ...chunk] };
    } catch (err: unknown) {
      const parsed = parseAttachError(err, chunk);
      if (parsed.kind === "fatal") return stopWith(parsed.message, chunk, index);

      const rejected = new Set(parsed.rejections.map(rejection => rejection.productId));
      const rest = chunk.filter(id => !rejected.has(id));
      outcome = { ...outcome, rejections: [...outcome.rejections, ...parsed.rejections] };

      if (rest.length > 0) {
        try {
          const promo = await attach(promoId, rest);
          outcome = { ...outcome, promo, attachedIds: [...outcome.attachedIds, ...rest] };
        } catch (retryErr: unknown) {
          // Un solo reintento: si vuelve a fallar se deja pendiente y se avisa.
          const retry = parseAttachError(retryErr, rest);
          if (retry.kind === "fatal") return stopWith(retry.message, rest, index);
          // Otro rechazo por producto (alguien cambió promos a media corrida):
          // se guarda el motivo y el resto queda pendiente para "Intentar de nuevo".
          const rejectedAgain = new Set(retry.rejections.map(rejection => rejection.productId));
          outcome = { ...outcome, rejections: [...outcome.rejections, ...retry.rejections] };
          return stopWith(FALLBACK_ERROR, rest.filter(id => !rejectedAgain.has(id)), index);
        }
      }
    }
    done += chunk.length;
    onProgress?.(done, productIds.length);
  }

  return outcome;
}

/** Junta el resultado de un reintento con lo que ya se había logrado antes. */
export function mergeAttachOutcomes(previous: AttachOutcome, retry: AttachOutcome): AttachOutcome {
  return {
    attachedIds: [...previous.attachedIds, ...retry.attachedIds],
    rejections: [...previous.rejections, ...retry.rejections],
    pendingIds: retry.pendingIds,
    fatalMessage: retry.fatalMessage,
    promo: retry.promo ?? previous.promo,
  };
}

/** Quita por lotes; devuelve la última versión de la promo (null si no había nada). */
export async function detachInChunks(args: DetachInChunksArgs): Promise<Promotion | null> {
  const { promoId, productIds, detach, chunkSize = DETACH_CHUNK_SIZE } = args;
  let promo: Promotion | null = null;
  for (const chunk of chunkIds(productIds, chunkSize)) {
    promo = await detach(promoId, chunk);
  }
  return promo;
}

const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);

export function summarizeAttachOutcome(outcome: AttachOutcome, names: ReadonlyMap<number, string>): AttachSummary {
  const added = outcome.attachedIds.length;
  const rejected = outcome.rejections.length;

  const addedText = added === 0
    ? "No se agregó ningún producto."
    : `${plural(added, "Se agregó", "Se agregaron")} ${added.toLocaleString("es-MX")} ${plural(added, "producto", "productos")}.`;
  const rejectedText = rejected === 0
    ? ""
    : ` ${rejected.toLocaleString("es-MX")} no ${plural(rejected, "se pudo", "se pudieron")} agregar.`;

  return {
    headline: addedText + rejectedText,
    rejected: outcome.rejections.map(rejection => ({
      ...rejection,
      name: names.get(rejection.productId) ?? `Producto #${rejection.productId}`,
    })),
    pendingCount: outcome.pendingIds.length,
    fatalMessage: outcome.fatalMessage,
  };
}
