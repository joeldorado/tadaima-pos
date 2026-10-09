import type { Bundle, BundleComponentInput, BundleInput, ProductLight } from "@tadaima/api";
import { isValidEan13 } from "@/lib/barcode";

/**
 * Borrador del asistente de Paquetes (crear y editar): estado en strings para
 * inputs controlados, validación por paso con mensajes llanos y conversión al
 * body que espera `POST/PUT /bundles`. Mismas reglas que el server; él las
 * vuelve a validar.
 */

/** Un paquete son al menos 2 productos DISTINTOS. */
export const MIN_COMPONENTS = 2;
/** Tope de piezas de un mismo producto por paquete. */
export const MAX_QTY = 999;
/** Los SKU generados van como PAQ-0001, PAQ-0002… */
export const SKU_PREFIX = "PAQ";
export const MAX_NAME = 150;
export const MAX_DESCRIPTION = 500;
/** `products.sku` es varchar(100) en el backend. */
const MAX_SKU = 100;
const SKU_PAD = 4;

export interface BundleDraftComponent {
  productId: number;
  name: string;
  sku: string;
  image: string | null;
  quantity: number;
  /** Precio normal (nivel 1) de la pieza, para la suma sugerida. */
  unitPrice: number;
  /** Stock en la tienda del que arma; null = vista global (sin tienda). */
  stockExh: number | null;
  stockBod: number | null;
}

export interface BundleDraft {
  components: BundleDraftComponent[];
  name: string;
  /** true cuando el usuario ya editó el nombre a mano (deja de sugerirse). */
  nameTouched: boolean;
  description: string;
  price1: string;
  price2: string;
  price3: string;
  price4: string;
  price5: string;
  sku: string;
  skuTouched: boolean;
  barcode: string;
  /** Paso 3: armar paquetes en cuanto se guarde. */
  buildNow: boolean;
  buildQty: string;
  buildStoreId: number | null;
}

export function emptyDraft(): BundleDraft {
  return {
    components: [],
    name: "",
    nameTouched: false,
    description: "",
    price1: "",
    price2: "",
    price3: "",
    price4: "",
    price5: "",
    sku: "",
    skuTouched: false,
    barcode: "",
    buildNow: false,
    buildQty: "1",
    buildStoreId: null,
  };
}

/** Nombre como se ve en Caja: los tomos llevan su número ("Naruto Vol. 3"). */
function displayName(p: Pick<ProductLight, "name" | "volume_number">): string {
  return p.volume_number != null ? `${p.name} Vol. ${p.volume_number}` : p.name;
}

/** Convierte un producto del buscador en componente (1 pieza). */
export function toDraftComponent(p: ProductLight, hasStore: boolean): BundleDraftComponent {
  return {
    productId: p.id,
    name: displayName(p),
    sku: p.sku,
    image: p.image,
    quantity: 1,
    unitPrice: p.prices.price_1 ?? 0,
    stockExh: hasStore ? p.stock_total : null,
    stockBod: hasStore ? (p.stock_bodega ?? 0) : null,
  };
}

const clampQty = (qty: number): number =>
  Number.isFinite(qty) ? Math.min(MAX_QTY, Math.max(1, Math.floor(qty))) : 1;

/** Agrega el producto; si ya está, le suma una pieza (tope MAX_QTY). */
export function addComponent(
  components: readonly BundleDraftComponent[],
  p: ProductLight,
  hasStore: boolean,
): BundleDraftComponent[] {
  const exists = components.some((c) => c.productId === p.id);
  if (!exists) return [...components, toDraftComponent(p, hasStore)];
  return components.map((c) => (c.productId === p.id ? { ...c, quantity: clampQty(c.quantity + 1) } : c));
}

/**
 * Check de la tabla: si el producto no está, entra con 1 pieza; si ya está, sale.
 * (Para el lector se usa `addComponent`, que suma piezas al repetir.)
 */
export function toggleComponent(
  components: readonly BundleDraftComponent[],
  p: ProductLight,
  hasStore: boolean,
): BundleDraftComponent[] {
  return components.some((c) => c.productId === p.id)
    ? components.filter((c) => c.productId !== p.id)
    : [...components, toDraftComponent(p, hasStore)];
}

export function removeComponent(
  components: readonly BundleDraftComponent[],
  productId: number,
): BundleDraftComponent[] {
  return components.filter((c) => c.productId !== productId);
}

/** Fija la cantidad de un componente, acotada a 1..MAX_QTY (NaN → 1). */
export function setQuantity(
  components: readonly BundleDraftComponent[],
  productId: number,
  qty: number,
): BundleDraftComponent[] {
  return components.map((c) => (c.productId === productId ? { ...c, quantity: clampQty(qty) } : c));
}

export function totalPieces(components: readonly BundleDraftComponent[]): number {
  return components.reduce((acc, c) => acc + c.quantity, 0);
}

/** Paso "¿Qué lleva?": null = todo bien. */
export function validateComponentes(draft: BundleDraft): string | null {
  if (draft.components.length < MIN_COMPONENTS) {
    return "Un paquete necesita al menos 2 productos distintos.";
  }
  if (draft.components.some((c) => c.quantity < 1)) {
    return "Cada producto necesita cantidad de 1 o más.";
  }
  return null;
}

/**
 * Dinero tecleado → número, estricto: acepta "$ 1,200.50" pero NO "1.2.3" ni
 * "12abc" (parseFloat los dejaba pasar como 1.2 / 12 y se guardaba mal).
 * Devuelve NaN si no es un monto válido.
 */
export function parseMoney(value: string): number {
  const cleaned = value.replace(/[$\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

const toMoney = (value: string): number => parseMoney(value);

/** Precio opcional: "" → null; con texto debe ser > 0. */
const isValidOptionalPrice = (value: string): boolean => {
  if (!value.trim()) return true;
  const n = toMoney(value);
  return Number.isFinite(n) && n > 0;
};

/** Paso "Nombre, precio y código": null = todo bien. */
export function validateDatos(draft: BundleDraft): string | null {
  const name = draft.name.trim();
  if (!name) return "Ponle nombre al paquete para reconocerlo en Caja.";
  if (name.length > MAX_NAME) return `El nombre es muy largo (máximo ${MAX_NAME} caracteres).`;

  const price1 = toMoney(draft.price1);
  if (!Number.isFinite(price1) || price1 <= 0) {
    return "Escribe el precio normal del paquete (mayor a $0).";
  }

  const sku = draft.sku.trim();
  if (!sku) return "El SKU no puede ir vacío: es el código que se teclea en Caja.";
  if (sku.length > MAX_SKU) return `El SKU es muy largo (máximo ${MAX_SKU} caracteres).`;

  const barcode = draft.barcode.trim();
  if (barcode && !isValidEan13(barcode)) return "El código de barras debe tener 13 dígitos válidos.";

  const others = [draft.price2, draft.price3, draft.price4, draft.price5];
  if (!others.every(isValidOptionalPrice)) {
    return "Los demás precios deben ser números mayores a $0 o quedar vacíos.";
  }

  if (draft.description.trim().length > MAX_DESCRIPTION) {
    return `La descripción es muy larga (máximo ${MAX_DESCRIPTION} caracteres).`;
  }
  return null;
}

/**
 * Paso "Revisar y armar": solo valida si se pidió armar ahora.
 * `maxForStore` = tope que calculó el server para la tienda elegida (null = aún no se sabe).
 */
export function validateArmado(draft: BundleDraft, maxForStore: number | null): string | null {
  if (!draft.buildNow) return null;
  if (draft.buildStoreId == null) return "Para armar ahora elige una tienda.";
  const qty = parseInt(draft.buildQty, 10);
  if (!Number.isFinite(qty) || qty < 1) return "Escribe cuántos paquetes quieres armar (1 o más).";
  if (maxForStore != null && qty > maxForStore) return `En esa tienda solo puedes armar ${maxForStore}.`;
  return null;
}

const optionalMoney = (value: string): number | null => (value.trim() ? toMoney(value) : null);

/** Body para POST/PUT. SKU y código solo viajan si tienen valor (el server genera el SKU si falta). */
export function draftToInput(draft: BundleDraft): BundleInput {
  const sku = draft.sku.trim();
  const barcode = draft.barcode.trim();
  const description = draft.description.trim();
  return {
    name: draft.name.trim(),
    description: description || null,
    ...(sku ? { sku } : {}),
    ...(barcode ? { barcode } : {}),
    prices: {
      price_1: toMoney(draft.price1),
      price_2: optionalMoney(draft.price2),
      price_3: optionalMoney(draft.price3),
      price_4: optionalMoney(draft.price4),
      price_5: optionalMoney(draft.price5),
    },
    components: draftLines(draft),
  };
}

const priceToInput = (value: number | null | undefined): string =>
  value != null ? String(Number(value)) : "";

/** Borrador para EDITAR: nombre y SKU ya "tocados" (no se vuelven a sugerir). Sin stock por tienda. */
export function draftFromBundle(b: Bundle): BundleDraft {
  const ordered = [...b.components].sort((x, y) => x.position - y.position);
  return {
    ...emptyDraft(),
    components: ordered.map((c) => ({
      productId: c.product_id,
      name: c.name,
      sku: c.sku,
      image: c.image,
      quantity: c.quantity,
      unitPrice: c.price_1 ?? 0,
      stockExh: null,
      stockBod: null,
    })),
    name: b.name,
    nameTouched: true,
    description: b.description ?? "",
    price1: priceToInput(b.prices.price_1),
    price2: priceToInput(b.prices.price_2),
    price3: priceToInput(b.prices.price_3),
    price4: priceToInput(b.prices.price_4),
    price5: priceToInput(b.prices.price_5),
    sku: b.sku,
    skuTouched: true,
    barcode: b.barcode ?? "",
  };
}

const SENTENCE_MAX_NAMES = 3;

/** "1 × Goku + 4 × Llavero" (hasta 3 nombres, luego "y N más"). "" sin componentes. */
export function componentsSentence(components: readonly BundleDraftComponent[]): string {
  if (components.length === 0) return "";
  const shown = components.slice(0, SENTENCE_MAX_NAMES).map((c) => `${c.quantity} × ${c.name}`);
  const rest = components.length - SENTENCE_MAX_NAMES;
  return rest > 0 ? `${shown.join(" + ")} y ${rest} más` : shown.join(" + ");
}

/** "Paquete Goku + Vegeta" / "Paquete Goku + Vegeta + 2 más". "" sin componentes. */
export function suggestBundleName(components: readonly BundleDraftComponent[]): string {
  const [first, second] = components;
  if (!first) return "";
  if (!second) return `Paquete ${first.name}`.slice(0, MAX_NAME);
  const rest = components.length - 2;
  const tail = rest > 0 ? ` + ${rest} más` : "";
  return `Paquete ${first.name} + ${second.name}${tail}`.slice(0, MAX_NAME);
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Siguiente SKU libre: sufijo numérico más alto de `PREFIX-NNNN` (sin importar
 * mayúsculas) + 1, con 4 dígitos mínimo. Sin ninguno → PAQ-0001.
 */
export function nextSku(existingSkus: readonly string[], prefix = SKU_PREFIX): string {
  const re = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`, "i");
  const highest = existingSkus.reduce((max, sku) => {
    const match = re.exec(sku.trim());
    const n = match?.[1] != null ? parseInt(match[1], 10) : Number.NaN;
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(SKU_PAD, "0")}`;
}

/** Firma estable de la lista de componentes ("12x2,45x1", ordenada por id) — key de la vista previa. */
export function componentsSignature(lines: readonly BundleComponentInput[]): string {
  return [...lines]
    .sort((a, b) => a.product_id - b.product_id)
    .map((l) => `${l.product_id}x${l.quantity}`)
    .join(",");
}

export function draftLines(draft: Pick<BundleDraft, "components">): BundleComponentInput[] {
  return draft.components.map((c) => ({ product_id: c.productId, quantity: c.quantity }));
}

/** true si el usuario no ha capturado nada (el código de barras no cuenta: se puede generar solo). */
export function isEmptyBundleDraft(d: BundleDraft): boolean {
  const empty = emptyDraft();
  // barcode se genera solo y buildStoreId/buildQty los pre-llena el asistente
  // (tienda del usuario): no cuentan como "capturado".
  const ignored: ReadonlySet<keyof BundleDraft> = new Set(["barcode", "buildStoreId", "buildQty"]);
  return (Object.keys(empty) as Array<keyof BundleDraft>).every((key) => {
    if (ignored.has(key)) return true;
    if (key === "components") return d.components.length === 0;
    return d[key] === empty[key];
  });
}

/** Primer mensaje de un `errors` de validación Laravel ({ campo: [msg, …] }). */
function firstValidationMessage(errors: unknown): string | null {
  if (typeof errors !== "object" || errors === null) return null;
  for (const messages of Object.values(errors as Record<string, unknown>)) {
    const first: unknown = Array.isArray(messages) ? (messages as unknown[])[0] : messages;
    if (typeof first === "string" && first.trim()) return first;
  }
  return null;
}

/**
 * Texto para el toast cuando falla armar/desarmar/guardar. Con `errors` de
 * validación gana el primer mensaje de campo (es el más concreto); si no, el
 * `message`; vacío → `fallback`.
 */
export function assembleErrorText(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { message?: unknown; errors?: unknown };
    const fieldMessage = firstValidationMessage(e.errors);
    if (fieldMessage) return fieldMessage;
    if (typeof e.message === "string" && e.message.trim()) return e.message;
  }
  return fallback;
}
