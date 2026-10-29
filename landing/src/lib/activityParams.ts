import type { ActivityGroup, GetActivityParams } from "@tadaima/api";
import { GROUP_ORDER } from "@/lib/activityFormat";

/**
 * Estado de los filtros de la pestaña Actividad. Vive en la URL
 * (`/admin?tab=actividad&...`) para que un enlace se pueda compartir, y de
 * aquí salen los params de `GET /activity` y `/activity/summary`.
 */
export interface ActivityFilterState {
  from: string;
  to: string;
  productIds: number[];
  userId: number | null;
  storeId: number | null;
  /** Grupos (chips) activos. Vacío = sin filtro de tipo (todos). */
  groups: ActivityGroup[];
  search: string;
  includeNoise: boolean;
  page: number;
  perPage: number;
  /**
   * El admin ya dio «Filtrar» (o llegó por un enlace con filtros): solo entonces
   * se consulta al servidor. Al entrar la pestaña está vacía (Joel 2026-10-29:
   * no tiene sentido cargar datos que no va a ver).
   */
  armed: boolean;
}

export const ACTIVITY_DEFAULT_PER_PAGE = 50;
export const ACTIVITY_PAGE_SIZES = [25, 50, 100, 200] as const;

/** Los grupos que mandamos al servidor: null = sin filtro de tipo (todos). */
export function effectiveGroups(groups: readonly ActivityGroup[]): ActivityGroup[] | null {
  const valid = GROUP_ORDER.filter((g) => groups.includes(g));
  if (valid.length === 0 || valid.length === GROUP_ORDER.length) return null;
  return valid;
}

/**
 * Params del feed. Pura: misma entrada → mismos params (y misma queryKey).
 * Con producto o usuario el rango deja de ser obligatorio en el backend,
 * pero lo seguimos mandando: Pier acota lo que quiere ver.
 */
export function buildActivityParams(state: ActivityFilterState): GetActivityParams {
  const groups = effectiveGroups(state.groups);
  const search = state.search.trim();
  return {
    ...(state.from ? { from: state.from } : {}),
    ...(state.to ? { to: state.to } : {}),
    ...(state.productIds.length ? { product_ids: [...state.productIds].sort((a, b) => a - b) } : {}),
    ...(state.userId ? { user_id: state.userId } : {}),
    ...(state.storeId ? { store_id: state.storeId } : {}),
    ...(groups ? { group: groups.join(",") } : {}),
    ...(search ? { search } : {}),
    ...(state.includeNoise ? { include_noise: 1 as const } : {}),
    page: Math.max(1, state.page),
    per_page: state.perPage,
  };
}

/** ¿Los dos estados piden lo mismo al servidor (sin contar la página)? */
export function filtersEqual(a: ActivityFilterState, b: ActivityFilterState): boolean {
  return JSON.stringify(buildActivitySummaryParams(a)) === JSON.stringify(buildActivitySummaryParams(b));
}

/** Mismos filtros sin paginación (para el resumen y el export). */
export function buildActivitySummaryParams(state: ActivityFilterState): GetActivityParams {
  const params = buildActivityParams(state);
  return Object.fromEntries(Object.entries(params).filter(([k]) => k !== "page" && k !== "per_page"));
}

// ─── URL ⇄ estado ─────────────────────────────────────────────────────────────

const intList = (raw: string | null): number[] =>
  (raw ?? "").split(",").map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0);

const intOrNull = (raw: string | null): number | null => {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n > 0 ? n : null;
};

export function filtersFromSearchParams(sp: URLSearchParams, defaults: { from: string; to: string }): ActivityFilterState {
  const groups = (sp.get("g") ?? "").split(",").filter((g): g is ActivityGroup => (GROUP_ORDER as readonly string[]).includes(g));
  const perPage = Number(sp.get("pp"));
  return {
    from: sp.get("from") ?? defaults.from,
    to: sp.get("to") ?? defaults.to,
    productIds: intList(sp.get("p")),
    userId: intOrNull(sp.get("u")),
    storeId: intOrNull(sp.get("s")),
    groups,
    search: sp.get("q") ?? "",
    includeNoise: sp.get("noise") === "1",
    page: Math.max(1, Number(sp.get("page")) || 1),
    perPage: (ACTIVITY_PAGE_SIZES as readonly number[]).includes(perPage) ? perPage : ACTIVITY_DEFAULT_PER_PAGE,
    armed: sp.get("go") === "1",
  };
}

/** Solo escribe lo que difiere del default: la URL queda corta. */
export function filtersToSearchParams(state: ActivityFilterState, defaults: { from: string; to: string }, base?: URLSearchParams): URLSearchParams {
  const sp = new URLSearchParams(base);
  const set = (k: string, v: string | null) => (v ? sp.set(k, v) : sp.delete(k));
  set("from", state.from !== defaults.from ? state.from : null);
  set("to", state.to !== defaults.to ? state.to : null);
  set("p", state.productIds.length ? state.productIds.join(",") : null);
  set("u", state.userId ? String(state.userId) : null);
  set("s", state.storeId ? String(state.storeId) : null);
  set("g", state.groups.length ? state.groups.join(",") : null);
  set("q", state.search.trim() || null);
  set("noise", state.includeNoise ? "1" : null);
  set("page", state.page > 1 ? String(state.page) : null);
  set("pp", state.perPage !== ACTIVITY_DEFAULT_PER_PAGE ? String(state.perPage) : null);
  set("go", state.armed ? "1" : null);
  return sp;
}
