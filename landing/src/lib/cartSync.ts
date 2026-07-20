/**
 * Sincroniza el snapshot de producto que vive en cada línea del carrito con lo
 * que el catálogo dice AHORA.
 *
 * ¿Por qué existe? `CartItem.product` es una COPIA completa del producto,
 * persistida a localStorage. Nada la refrescaba nunca. Entonces: el dueño
 * borraba una promo, la creaba de nuevo distinta, y la línea que ya estaba en
 * el carrito seguía calculando con la promo muerta. Al cobrar, el server
 * recomputa con las promos vivas y rechaza ("Los pagos no coinciden con el
 * total") — pero el total del cliente nunca cambiaba, así que el cajero
 * quedaba en un bucle sin salida. Lo mismo con los precios
 * (`assertPricesMatchCatalog`).
 *
 * Es lógica pura a propósito: sin React, sin stores, testeable en aislamiento.
 */
import type { PromoSnapshot } from "@/types/pos";

/** Campos "de política": los manda el catálogo, no el cajero. */
export interface ProductPolicy {
  active_promotions: PromoSnapshot[];
  allow_cash: boolean;
  allow_card: boolean;
  price_a: number;
  price_b?: number;
  price_c?: number;
  price_d?: number;
  price_e?: number;
}

/** Lo mínimo que cartSync necesita saber de un producto del carrito. */
interface ProductLike extends Partial<ProductPolicy> {
  id: string;
  name: string;
}

/** Lo mínimo que necesita de una línea. Estructural: no importa CartItem. */
export interface CartLineLike {
  lineId: string;
  product: ProductLike;
  sellingCatalogId?: number;
  isFromPreSale?: boolean;
  isDamaged?: boolean;
}

export interface MesaLike<L extends CartLineLike> {
  items: L[];
}

/** Payload del API del que se construye el índice (subconjunto de ProductLight). */
export interface PolicySource {
  id: number | string;
  allow_cash?: boolean;
  allow_card?: boolean;
  prices?: {
    price_1?: number | null;
    price_2?: number | null;
    price_3?: number | null;
    price_4?: number | null;
    price_5?: number | null;
  };
  active_promotions?: PromoSnapshot[];
}

export interface LineChange {
  lineId: string;
  productName: string;
  promosChanged: boolean;
  flagsChanged: boolean;
  priceChanged: { from: number; to: number } | null;
}

export interface CartSyncResult<M> {
  /** La MISMA referencia de entrada si nada cambió — habilita el bailout de React. */
  mesas: readonly M[];
  changed: boolean;
  changes: LineChange[];
}

/**
 * Firma canónica de un set de promos.
 *
 * Compara la MATEMÁTICA, no los ids: una promo se puede editar conservando su
 * id (mayoreo de −$100 a −$50) y ese cambio movería el total en silencio si
 * solo comparáramos qué promos hay.
 */
export function promoSignature(promos: readonly PromoSnapshot[] | undefined): string {
  if (!promos || promos.length === 0) return "";
  return [...promos]
    .sort((a, b) => a.id - b.id)
    .map(p => [
      p.id,
      p.type ?? "nxm",
      p.buy_n ?? "",
      p.pay_m ?? "",
      p.min_qty ?? "",
      p.discount_per_unit ?? "",
      p.priority,
      p.store_id ?? "",
      p.allow_cash !== false ? 1 : 0,
      p.allow_card !== false ? 1 : 0,
    ].join("|"))
    .join(";");
}

function num(value: number | null | undefined): number {
  return Number(value ?? 0) || 0;
}

/** price_N > 0, o undefined (convención de los niveles b–e). */
function optionalPrice(value: number | null | undefined): number | undefined {
  const n = num(value);
  return n > 0 ? n : undefined;
}

/**
 * Índice id → política, a partir de una o más fuentes del API.
 *
 * Las fuentes se aplican EN ORDEN: la última gana. Así la Caja puede pasar
 * [pool top, resultados de búsqueda, productos del carrito] y que el más
 * específico (el consultado por id) mande.
 */
export function buildPolicyIndex(sources: ReadonlyArray<readonly PolicySource[]>): Map<string, ProductPolicy> {
  const index = new Map<string, ProductPolicy>();
  for (const source of sources) {
    for (const p of source) {
      index.set(String(p.id), {
        active_promotions: p.active_promotions ?? [],
        allow_cash: p.allow_cash ?? true,
        allow_card: p.allow_card ?? true,
        price_a: num(p.prices?.price_1),
        ...withPrice("price_b", optionalPrice(p.prices?.price_2)),
        ...withPrice("price_c", optionalPrice(p.prices?.price_3)),
        ...withPrice("price_d", optionalPrice(p.prices?.price_4)),
        ...withPrice("price_e", optionalPrice(p.prices?.price_5)),
      });
    }
  }
  return index;
}

/** `{ price_b: 120 }` o `{}` — `exactOptionalPropertyTypes` prohíbe el undefined explícito. */
function withPrice<K extends "price_b" | "price_c" | "price_d" | "price_e">(
  key: K,
  value: number | undefined,
): Partial<Record<K, number>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, number>);
}

/**
 * Una línea de preventa NO se toca: su `price_a` está prorrateado a mano
 * (liquidación de folio) o forzado a 0 (item ya entregado). Resucitarle el
 * precio de catálogo sería el peor error posible — dinero que se mueve solo en
 * la dirección equivocada.
 */
function isPreSaleLine(line: CartLineLike): boolean {
  return line.sellingCatalogId != null || line.isFromPreSale === true;
}

export function syncCartWithCatalog<L extends CartLineLike, M extends MesaLike<L>>(
  mesas: readonly M[],
  fresh: ReadonlyMap<string, ProductPolicy>,
): CartSyncResult<M> {
  const changes: LineChange[] = [];
  let anyMesaChanged = false;

  const nextMesas = mesas.map(mesa => {
    let mesaChanged = false;

    const nextItems = mesa.items.map(line => {
      const policy = fresh.get(line.product.id);
      // Ausencia = no-op. El pool encoge cuando el cajero borra la búsqueda;
      // jamás vaciar promos por no haber encontrado el producto.
      if (!policy || isPreSaleLine(line)) return line;

      const promosChanged =
        promoSignature(line.product.active_promotions) !== promoSignature(policy.active_promotions);
      const flagsChanged =
        (line.product.allow_cash ?? true) !== policy.allow_cash ||
        (line.product.allow_card ?? true) !== policy.allow_card;
      // El precio de una línea dañada lo gobierna `damagedPrice` y el server se
      // salta el guard de catálogo para ella.
      const priceChanged =
        !line.isDamaged && num(line.product.price_a) !== policy.price_a
          ? { from: num(line.product.price_a), to: policy.price_a }
          : null;

      if (!promosChanged && !flagsChanged && !priceChanged) return line;

      mesaChanged = true;
      changes.push({
        lineId: line.lineId,
        productName: line.product.name,
        promosChanged,
        flagsChanged,
        priceChanged,
      });

      const { price_a: _dropA, price_b: _dropB, price_c: _dropC, price_d: _dropD, price_e: _dropE, ...priceless } = line.product;
      const prices = line.isDamaged
        ? {
            price_a: num(line.product.price_a),
            ...withPrice("price_b", line.product.price_b),
            ...withPrice("price_c", line.product.price_c),
            ...withPrice("price_d", line.product.price_d),
            ...withPrice("price_e", line.product.price_e),
          }
        : {
            price_a: policy.price_a,
            ...withPrice("price_b", policy.price_b),
            ...withPrice("price_c", policy.price_c),
            ...withPrice("price_d", policy.price_d),
            ...withPrice("price_e", policy.price_e),
          };

      return {
        ...line,
        product: {
          ...priceless,
          ...prices,
          active_promotions: policy.active_promotions,
          allow_cash: policy.allow_cash,
          allow_card: policy.allow_card,
        },
      };
    });

    if (!mesaChanged) return mesa;
    anyMesaChanged = true;
    return { ...mesa, items: nextItems };
  });

  // Misma referencia de entrada si nada cambió → setMesas hace bailout.
  return anyMesaChanged
    ? { mesas: nextMesas, changed: true, changes }
    : { mesas, changed: false, changes: [] };
}
