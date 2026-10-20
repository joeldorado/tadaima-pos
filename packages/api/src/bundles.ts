import { apiClient } from './client'

/**
 * Paquetes (2026-10-07): combos de 2+ productos con precio y código propios.
 *
 * Un paquete ES un renglón de `products` con `product_type = 'bundle'`, así que
 * se vende en Caja como cualquier producto y su foto se maneja con
 * `uploadProductImage()` / `removeProductImage()` de products.ts. El stock del
 * paquete es FÍSICO por tienda: se "arma" descontando piezas de Exhibición o
 * Bodega y se "desarma" regresándolas. El backend calcula cuántos se pueden
 * armar (`availability`) — ninguna pantalla lo recalcula sola.
 */

/** De dónde salen las piezas al armar: automático (Exhibición y lo que falte de Bodega) o forzado. */
export type BundleSource = 'auto' | 'store' | 'bodega'

/** Movimiento del historial: se armaron o se desarmaron paquetes. */
export type BundleAssemblyType = 'armado' | 'desarmado'

/** Niveles de precio del paquete (mismos 5 niveles que un producto normal). */
export interface BundlePrices {
  price_1: number | null
  price_2: number | null
  price_3: number | null
  price_4: number | null
  price_5: number | null
}

/** Un producto que compone el paquete y cuántas piezas lleva. */
export interface BundleComponent {
  product_id: number
  name: string
  sku: string
  quantity: number
  /** Orden de captura (1-based), para mostrar la lista como se armó. */
  position: number
  image: string | null
  price_1: number | null
  /** Solo viaja si el usuario puede ver costos. */
  cost?: number | null
}

/** Disponibilidad de UN componente en una tienda (para la columna "limita"). */
export interface BundleComponentAvailability {
  product_id: number
  name: string
  sku: string
  /** Piezas que el paquete necesita de este producto. */
  quantity: number
  stock_exhibicion: number
  stock_bodega: number
  /** Paquetes armables usando solo Exhibición. */
  max_from_exhibicion: number
  /** Paquetes armables usando Exhibición + Bodega. */
  max_from_combined: number
  /** true = este producto es el cuello de botella. */
  limiting: boolean
}

/** Cuántos paquetes hay y cuántos se pueden armar en una tienda. */
export interface BundleStoreAvailability {
  store_id: number
  store_name: string
  has_bodega: boolean
  /** Paquetes ya armados en Exhibición (vendibles en Caja). */
  stock_exhibicion: number
  /** Paquetes ya armados en Bodega. */
  stock_bodega: number
  /** Máximo de paquetes que se pueden armar con las piezas de esta tienda (Exhibición + Bodega). */
  max_buildable: number
  warning?: string | null
  components: BundleComponentAvailability[]
}

export interface BundleImage {
  id: number
  image_path: string
  url: string
  sort_order: number
}

export interface Bundle {
  id: number
  product_type: 'bundle'
  name: string
  sku: string
  barcode: string | null
  description: string | null
  active: boolean
  catalog_visible: boolean
  /** Solo viaja si el usuario puede ver costos. */
  cost?: number | null
  prices: BundlePrices
  /** Primera imagen (URL lista para <img>), null = sin foto. */
  image: string | null
  images: BundleImage[]
  components_count: number
  /** Suma de precio_1 × cantidad de los componentes: referencia para el ahorro. */
  suggested_price_sum: number
  components: BundleComponent[]
  /** Paquetes armados en todas las tiendas (o en la pedida con ?store_id). */
  stock_total: number
  /** true = ya hay paquetes armados → no se pueden cambiar los componentes. */
  composition_locked: boolean
  availability: BundleStoreAvailability[]
  created_at: string
  updated_at: string
}

/** Detalle de un componente dentro de un movimiento de armado/desarmado. */
export interface BundleAssemblyComponent {
  product_id: number
  name: string
  sku: string
  qty_per_bundle: number
  total_qty: number
  /** Armado: piezas que salieron de Exhibición / Bodega. */
  from_store_qty?: number
  from_bodega_qty?: number
  /** Desarmado: a dónde regresaron las piezas. */
  to_warehouse?: 'store' | 'bodega'
  unit_cost?: number | null
}

export interface BundleAssembly {
  id: number
  type: BundleAssemblyType
  quantity: number
  store: { id: number; name: string } | null
  warehouse: { id: number; name: string; type: string } | null
  user: { id: number; name: string } | null
  notes: string | null
  components: BundleAssemblyComponent[]
  created_at: string
}

/** GET /bundles/{id}: el paquete + su historial de movimientos. */
export interface BundleDetail extends Bundle {
  assemblies: BundleAssembly[]
}

export interface BundleComponentInput {
  product_id: number
  quantity: number
}

/** Precio normal obligatorio; los demás niveles opcionales (null = sin ese nivel). */
export interface BundlePricesInput {
  price_1: number
  price_2: number | null
  price_3: number | null
  price_4: number | null
  price_5: number | null
}

export interface BundleInput {
  name: string
  description: string | null
  /** Omitido = el server genera uno (PAQ-0001…). */
  sku?: string
  /** Omitido = sin código de barras (se puede generar uno EAN-13 interno). */
  barcode?: string
  prices: BundlePricesInput
  components: BundleComponentInput[]
  active?: boolean
  catalog_visible?: boolean
}

/** POST /bundles/preview: qué se podría armar ANTES de guardar el paquete. */
export interface BundlePreview {
  components: Array<{
    product_id: number
    name: string
    sku: string
    quantity: number
    price_1: number | null
    cost?: number | null
  }>
  suggested_price_sum: number
  cost_sum?: number | null
  availability: BundleStoreAvailability[]
}

export interface BundleAssembleInput {
  store_id: number
  quantity: number
  notes?: string
  /** Por componente; omitido = 'auto' (Exhibición y lo que falte de Bodega). */
  sources?: Array<{ product_id: number; source: BundleSource }>
}

export interface BundleDisassembleInput {
  store_id: number
  quantity: number
  notes?: string
  /** A dónde regresan las piezas; omitido = Exhibición ('store'). */
  destination?: 'store' | 'bodega'
}

/** Respuesta de armar/desarmar: el movimiento creado + el paquete ya actualizado. */
export interface BundleMutationResult {
  assembly: BundleAssembly
  bundle: Bundle
}

export interface GetBundlesParams {
  /** Acota stock/disponibilidad a esa tienda (gerente/cajero: la suya). */
  store_id?: number
  search?: string
  active?: boolean
  page?: number
  per_page?: number
}

export interface BundlesPage {
  data: Bundle[]
  pagination: { total: number; per_page: number; current_page: number; last_page: number }
}

export interface GetBundleAssembliesParams {
  store_id?: number
  page?: number
  per_page?: number
}

export interface BundleAssembliesPage {
  data: BundleAssembly[]
  pagination: { total: number; per_page: number; current_page: number; last_page: number }
}

/** Tope por defecto: la pantalla de Paquetes carga todo de un golpe (son pocos). */
const DEFAULT_PER_PAGE = 200

/**
 * Lista de paquetes. Sin `page` se piden hasta 200 (la pantalla muestra todos;
 * la paginación existe para la app móvil y el crecimiento futuro).
 */
export async function getBundles(params?: GetBundlesParams): Promise<BundlesPage> {
  const response = await apiClient.get<BundlesPage>('/bundles', {
    params: { per_page: DEFAULT_PER_PAGE, ...params },
  })
  return response.data
}

/** Detalle con historial. `storeId` acota la disponibilidad a esa tienda. */
export async function getBundle(id: number, storeId?: number | null): Promise<BundleDetail> {
  const response = await apiClient.get<BundleDetail>(`/bundles/${id}`, {
    params: storeId != null ? { store_id: storeId } : {},
  })
  return response.data
}

export async function createBundle(input: BundleInput): Promise<Bundle> {
  const response = await apiClient.post<Bundle>('/bundles', input)
  return response.data
}

/**
 * Edición parcial. Con paquetes ya armados (`composition_locked`) el server
 * rechaza cambiar `components` — hay que desarmar primero.
 */
export async function updateBundle(id: number, input: Partial<BundleInput>): Promise<Bundle> {
  const response = await apiClient.put<Bundle>(`/bundles/${id}`, input)
  return response.data
}

/** Borra el paquete (el server bloquea si hay paquetes armados o apartados). */
export async function deleteBundle(id: number): Promise<void> {
  await apiClient.delete(`/bundles/${id}`)
}

/**
 * Vista previa ANTES de guardar: precios sugeridos y cuántos se podrían armar
 * por tienda con esa lista de componentes.
 */
export async function previewBundle(
  components: BundleComponentInput[],
  storeId?: number | null,
): Promise<BundlePreview> {
  const response = await apiClient.post<BundlePreview>('/bundles/preview', {
    components,
    ...(storeId != null ? { store_id: storeId } : {}),
  })
  return response.data
}

/** Arma N paquetes en una tienda: descuenta piezas y suma paquetes a Exhibición. */
export async function assembleBundle(id: number, input: BundleAssembleInput): Promise<BundleMutationResult> {
  const response = await apiClient.post<BundleMutationResult>(`/bundles/${id}/assemble`, input)
  return response.data
}

/** Desarma N paquetes: resta paquetes y regresa las piezas al almacén elegido. */
export async function disassembleBundle(
  id: number,
  input: BundleDisassembleInput,
): Promise<BundleMutationResult> {
  const response = await apiClient.post<BundleMutationResult>(`/bundles/${id}/disassemble`, input)
  return response.data
}

/** Historial paginado de armados/desarmados de un paquete. */
export async function getBundleAssemblies(
  id: number,
  params?: GetBundleAssembliesParams,
): Promise<BundleAssembliesPage> {
  const response = await apiClient.get<BundleAssembliesPage>(`/bundles/${id}/assemblies`, { params })
  return response.data
}
