import type { Promotion } from "@tadaima/api";
import { normalizeCategoryText } from "@/lib/categoryPicker";
import { isPromoSinConfigurar, promoShortLabel } from "@/lib/promoLabel";

/**
 * Lógica pura de la lista de promos (/promos): qué estado mostrar, quién ve
 * qué, quién puede modificar, búsqueda y orden. El server sigue siendo la
 * autoridad de permisos; esto solo decide qué botones pintar.
 */

/** Estado que ve la gente (el `status` del server no distingue "programada"). */
export type PromoDisplayStatus = "vigente" | "programada" | "pausada" | "vencida" | "sin_configurar";

export type PromoChip = "todas" | "activas" | "pausadas" | "vencidas";

export interface PromoViewer {
  isAdmin: boolean;
  /** Puede crear/editar promos: admin, o gerente con "Gestionar Promociones". */
  canManage: boolean;
  storeId: number | null;
}

interface PromoFilterOptions {
  query: string;
  chip: PromoChip;
  now: Date;
}

const STATUS_RANK: Record<PromoDisplayStatus, number> = {
  vigente: 0,
  programada: 1,
  sin_configurar: 2,
  pausada: 3,
  vencida: 4,
};

const CHIP_STATUSES: Record<Exclude<PromoChip, "todas">, readonly PromoDisplayStatus[]> = {
  activas: ["vigente", "programada"],
  pausadas: ["pausada", "sin_configurar"],
  vencidas: ["vencida"],
};

export function getPromoDisplayStatus(promo: Promotion, now: Date): PromoDisplayStatus {
  if (isPromoSinConfigurar(promo)) return "sin_configurar";
  // El server marca `expired` de forma perezosa: la fecha manda.
  if (promo.status === "expired") return "vencida";
  if (promo.ends_at && new Date(promo.ends_at) < now) return "vencida";
  if (promo.status === "paused") return "pausada";
  if (promo.starts_at && new Date(promo.starts_at) > now) return "programada";
  return "vigente";
}

const productCount = (promo: Promotion): number =>
  promo.products_count ?? promo.products?.length ?? 0;

/**
 * Admin: todas. Los demás: las generales y las de SU tienda. Quien no gestiona
 * promos (cajero) solo ve lo que aplica o va a aplicar en Caja.
 */
export function visiblePromosFor(promos: readonly Promotion[], viewer: PromoViewer, now: Date): Promotion[] {
  return promos.filter(promo => {
    if (viewer.isAdmin) return true;
    if (promo.store_id != null && promo.store_id !== viewer.storeId) return false;
    if (viewer.canManage) return true;
    const status = getPromoDisplayStatus(promo, now);
    return (status === "vigente" || status === "programada") && productCount(promo) > 0;
  });
}

/** El gerente solo modifica promos de SU tienda; las generales son del admin. */
export function canMutatePromo(promo: Promotion, viewer: PromoViewer): boolean {
  if (!viewer.canManage) return false;
  if (viewer.isAdmin) return true;
  return promo.store_id != null && promo.store_id === viewer.storeId;
}

function matchesChip(status: PromoDisplayStatus, chip: PromoChip): boolean {
  return chip === "todas" || CHIP_STATUSES[chip].includes(status);
}

/** Texto donde se busca: nombre, etiqueta ("2x1") y los productos de la promo. */
function searchHaystack(promo: Promotion): string {
  const productNames = (promo.products ?? []).map(p => p.name).join(" ");
  return normalizeCategoryText(`${promo.name} ${promoShortLabel(promo)} ${productNames}`);
}

export function filterPromos(promos: readonly Promotion[], { query, chip, now }: PromoFilterOptions): Promotion[] {
  const tokens = normalizeCategoryText(query).split(/\s+/).filter(Boolean);
  return promos.filter(promo => {
    if (!matchesChip(getPromoDisplayStatus(promo, now), chip)) return false;
    if (tokens.length === 0) return true;
    const haystack = searchHaystack(promo);
    return tokens.every(token => haystack.includes(token));
  });
}

/** Vigentes primero y vencidas al final; dentro de cada grupo, A-Z. */
export function sortPromosForList(promos: readonly Promotion[], now: Date): Promotion[] {
  return [...promos].sort((a, b) =>
    STATUS_RANK[getPromoDisplayStatus(a, now)] - STATUS_RANK[getPromoDisplayStatus(b, now)]
    || a.name.localeCompare(b.name, "es"));
}

export function countByChip(promos: readonly Promotion[], now: Date): Record<PromoChip, number> {
  const statuses = promos.map(promo => getPromoDisplayStatus(promo, now));
  const count = (chip: PromoChip) => statuses.filter(status => matchesChip(status, chip)).length;
  return { todas: promos.length, activas: count("activas"), pausadas: count("pausadas"), vencidas: count("vencidas") };
}
