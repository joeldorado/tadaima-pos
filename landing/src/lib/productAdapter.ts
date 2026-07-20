/**
 * Adaptador ÚNICO `ProductLight` (payload del API) → `Product` (modelo de Caja).
 *
 * Antes esta conversión estaba copiada en tres lugares de SellPage (pool top,
 * merge de búsqueda, escaneo con cache miss), los tres cerrando con un cast
 * `as Product`. Ese cast es lo que dejó pasar campos faltantes en silencio: la
 * ruta de búsqueda perdía `active_promotions` y la de escaneo perdía además
 * `allow_cash`/`allow_card`/`product_type` — o sea que un producto
 * solo-efectivo escaneado fuera del top 200 NO disparaba el bloqueo de Caja y
 * el rechazo llegaba hasta el checkout.
 *
 * Por eso aquí el tipo de retorno va ANOTADO y no hay cast: si `Product` gana
 * un campo, TypeScript truena en este archivo y en ningún otro.
 */
import type { ProductLight } from "@tadaima/api";
import type { Product } from "@/types/pos";

/** price_N del payload, o undefined si no está definido (niveles b–e). */
function priceAt(p: ProductLight, level: 1 | 2 | 3 | 4 | 5): number {
  const key = `price_${level}` as keyof ProductLight["prices"];
  return Number(p.prices?.[key] ?? 0) || 0;
}

/** Igual que priceAt pero colapsa 0 a undefined — convención de los niveles b–e. */
function optionalPriceAt(p: ProductLight, level: 2 | 3 | 4 | 5): number | undefined {
  const value = priceAt(p, level);
  return value > 0 ? value : undefined;
}

/** `{ price_b: 120 }` o `{}` — nunca `{ price_b: undefined }`. */
function optionalPrice<K extends "price_b" | "price_c" | "price_d" | "price_e">(
  key: K,
  value: number | undefined,
): Partial<Record<K, number>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, number>);
}

export function toCartProduct(p: ProductLight): Product {
  const hasStock = typeof p.stock_total === "number";
  // `exactOptionalPropertyTypes` está activo: un campo opcional se OMITE, no se
  // pone en undefined. De ahí los spreads condicionales.
  return {
    id: String(p.id),
    name: p.name,
    sku: p.sku,
    ...(p.barcode ? { barcode: p.barcode } : {}),
    category: String(p.category_id ?? ""),
    image: p.image ?? "",
    price_a: priceAt(p, 1),
    ...optionalPrice("price_b", optionalPriceAt(p, 2)),
    ...optionalPrice("price_c", optionalPriceAt(p, 3)),
    ...optionalPrice("price_d", optionalPriceAt(p, 4)),
    ...optionalPrice("price_e", optionalPriceAt(p, 5)),
    // stock_total = Exhibición (vendible en Caja); stock_bodega = backstock
    // atrás (no vendible, solo para avisar "N en bodega" al cajero).
    ...(hasStock
      ? {
          stock: p.stock_total,
          stock_details: { tienda: p.stock_total, bodega: p.stock_bodega ?? 0, preventa: 0, dañado: 0 },
        }
      : {}),
    active: p.active,
    // QA crítico 2026-06-08: sin estos flags, itemAcceptsMethod/payBlocked
    // siempre pasaban y un producto solo-efectivo se cobraba con tarjeta.
    allow_cash: p.allow_cash ?? true,
    allow_card: p.allow_card ?? true,
    product_type: p.product_type ?? "product",
    volume_number: p.volume_number ?? null,
    is_assigned: p.is_assigned ?? true,
    active_promotions: p.active_promotions ?? [],
  };
}
