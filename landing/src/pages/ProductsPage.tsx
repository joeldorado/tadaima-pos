import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { CSSProperties } from "react";
import {
  Search, Plus,
  Package, AlertTriangle,
  DollarSign, Scan,
  ChevronRight,
  Warehouse, CheckCircle2,
  X, Save,
  BookOpen, TrendingUp,
  MessageCircle,
  Upload, Camera, Loader2,
  ArrowUp, ArrowDown, ArrowUpDown,
  ChevronLeft, ChevronsLeft, ChevronsRight, Trash2, Pencil, RefreshCw, PackageX, TicketPercent
} from "lucide-react";
import { useActiveStore } from "@/contexts/StoreContext";
import { useAuth } from "@tadaima/auth";
import { isAdmin as isAdminRole, isManager as isManagerRole } from "@/lib/permisos";
import { toast } from "sonner";
import { createProduct, updateProduct, deleteProduct, forceDeleteProduct, uploadProductImage, removeProductImage, getInventory, updateInventory, getPrice, sendStockAlert, getCategories, createCategory, getSuppliers, createSupplier } from "@tadaima/api";
import type { ApiError } from "@tadaima/api";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useProductsQuery } from "@/hooks/queries/useProducts";
import { useMangasQuery } from "@/hooks/queries/useMangas";
import { ProductsSkeleton } from "@/components/products/ProductsSkeleton";
import { useStoresQuery } from "@/hooks/queries/useStores";
import { useWarehousesQuery } from "@/hooks/queries/useWarehouses";
import { queryKeys } from "@/lib/queryKeys";
import { generateBarcode } from "@/lib/barcode";
import { warehouseTypeLabel } from "@/lib/warehouse";
import { PRICE_FORM_LABELS, PRICE_LEVEL_LABELS, PRICE_LEVEL_COLORS, PRICE_LEVEL_RGB } from "@/lib/priceLevels";

function formatApiError(err: unknown, fallback: string): { title: string; detail: string } {
  const apiErr = err as ApiError;
  if (apiErr?.errors && typeof apiErr.errors === "object") {
    const detail = Object.entries(apiErr.errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(", ")}`)
      .join("\n");
    if (detail) return { title: apiErr.message || fallback, detail };
  }
  return { title: fallback, detail: apiErr?.message ?? "" };
}
import { ProductTypeSelectorModal } from "@/components/products/ProductTypeSelectorModal";
import { StoreStockBreakdown } from "@/components/inventory/StoreStockBreakdown";
import { MangaBatchModal } from "@/components/products/MangaBatchModal";
import { MangaEditModal } from "@/components/products/MangaEditModal";
import { QuickStockModal } from "@/components/products/QuickStockModal";
import { ProductPromotionsTab } from "@/components/products/ProductPromotionsTab";
import type { Product, Manga } from "@tadaima/api";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import type { SortingState, PaginationState } from '@tanstack/react-table';

// ─── Paleta Tadaima (Coherencia con SellPage) ──────────────────────────────────
const T = {
  bgGrad: "var(--td-page-bg)",
  glass: {
    background: "var(--td-panel-bg)",
    backdropFilter: "blur(28px) saturate(160%)",
    WebkitBackdropFilter: "blur(28px) saturate(160%)",
    border: "1px solid var(--td-panel-border)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)",
  } as CSSProperties,
  glassMd: {
    background: "var(--td-card-bg)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid var(--td-card-border)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
  } as CSSProperties,
  textPrimary: "var(--td-text-hi)",
  textSecondary: "var(--td-text-md)",
  textMuted: "var(--td-text-lo)",
  redBright: "#FF4422",
  redGlow: "rgba(204,34,0,0.45)",
  btnRed: {
    background: "linear-gradient(135deg, #CC2200 0%, #FF4422 100%)",
    borderRadius: "9999px",
    border: "1px solid rgba(255,120,90,0.3)",
    boxShadow: "0 0 28px rgba(204,34,0,0.45), 0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,180,160,0.25)",
    color: "#ffffff",
  } as CSSProperties,
  chipActive: {
    background: "linear-gradient(135deg, #CC2200, #FF4422)",
    border: "1px solid rgba(255,120,90,0.4)",
    boxShadow: "0 0 16px rgba(204,34,0,0.35), inset 0 1px 0 rgba(255,160,140,0.2)",
    color: "#fff",
  } as CSSProperties,
  chipInactive: {
    background: "var(--td-panel-bg)",
    border: "1px solid var(--td-panel-border)",
    color: "var(--td-text-lo)",
  } as CSSProperties,
  input: {
    background: "var(--td-input-bg)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid var(--td-input-border)",
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.08)",
    color: "var(--td-input-text)",
  } as CSSProperties,
};

const PRODUCT_THEME = {
  surfaceSoft: "var(--td-surface-soft)",
  surfaceMuted: "var(--td-surface-muted)",
  surfaceStrong: "var(--td-surface-strong)",
  surfaceStronger: "var(--td-surface-stronger)",
  tableHead: "var(--td-table-head-bg)",
  tableFoot: "var(--td-table-foot-bg)",
  borderSubtle: "1px solid var(--td-card-border)",
  borderPanel: "1px solid var(--td-panel-border)",
};

const SECONDARY_BUTTON = {
  color: T.textSecondary,
  background: PRODUCT_THEME.surfaceMuted,
  border: PRODUCT_THEME.borderSubtle,
} as CSSProperties;

// ─── Tipos ────────────────────────────────────────────────────────────────────
type TipoProducto = "normal" | "libro" | "unico" | "temporal";
type EtiquetaProducto = "en bodega" | "dañado" | "preventa";

interface StockDetallado {
  bodega: number;
  danado: number;
  preventa: number; // Unidades reservadas para preventa
  tienda: number;
  enCamino: number; // Unidades solicitadas pero no recibidas
}

interface StockUbicacion {
  warehouseId?: number; // backend warehouse id — undefined for optimistic/legacy rows
  ubicacion: string;
  quantity: number; // source of truth from backend inventory.quantity
  total: number;
  disponibleVenta: number;
  comprometido: number;
  detalle: StockDetallado;
  stock: number;
}

interface Producto {
  id: number;
  nombre: string;
  sku: string;
  barcode?: string;
  categoria: string;
  proveedor: string;
  tipo: TipoProducto;
  desactivado: boolean;
  costo: number; // Solo admin
  precioA: number; // Default
  precioB?: number;
  precioC?: number;
  precioD?: number;
  precioE?: number;
  porcentajeLibro?: number; // Para tipo libro
  imagen: string;
  imageIds: number[];
  imagenesAdicionales?: string[];
  stockUbicaciones: StockUbicacion[];
  etiquetas: EtiquetaProducto[];
  almacenistaVeCosto?: boolean;
  soloEfectivo?: boolean;
  allowCash: boolean;
  allowCard: boolean;
  ventasTotales: number;
  esUnico?: boolean; // No se puede resurtir, no aparece en bajo stock
  visible_en_catalogo?: boolean;
  // false = sin inventario en la tienda activa ("No asignado" → agregar stock).
  // Solo viene con store_id; default true para la vista global admin.
  isAssigned?: boolean;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n);

// Adapta Product (API) → Producto (UI local).
function apiProductToProducto(p: Product): Producto {
  const precioB = getPrice(p, 2)
  const precioC = getPrice(p, 3)
  const precioD = getPrice(p, 4)
  const precioE = getPrice(p, 5)
  return {
    id: p.id,
    nombre: p.name,
    sku: p.sku,
    barcode: p.barcode ?? undefined,
    categoria: p.category?.name ?? (p.category_id !== null ? String(p.category_id) : ''),
    proveedor: p.supplier?.name ?? '',
    tipo: 'normal',
    desactivado: !p.active,
    costo: p.cost,
    precioA: getPrice(p, 1),
    ...(precioB > 0 ? { precioB } : {}),
    ...(precioC > 0 ? { precioC } : {}),
    ...(precioD > 0 ? { precioD } : {}),
    ...(precioE > 0 ? { precioE } : {}),
    imagen: p.images[0]?.url ?? '',
    imageIds: p.images.map(img => img.id),
    stockUbicaciones: [],
    etiquetas: [],
    ventasTotales: 0,
    allowCash: p.allow_cash ?? true,
    allowCard: p.allow_card ?? true,
    isAssigned: p.is_assigned ?? true,
  }
}

function ProductThumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [src]);
  if (failed) return null;
  return (
    <img
      src={src}
      alt={alt}
      className="w-10 h-10 rounded-xl object-cover shrink-0"
      style={{ minWidth: 40 }}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function DetailChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
      style={{ background: PRODUCT_THEME.surfaceSoft, color: T.textSecondary, border: PRODUCT_THEME.borderSubtle }}
    >
      {children}
    </span>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.textMuted }}>{label}</p>
      <div className="rounded-2xl px-4 py-3" style={{ background: PRODUCT_THEME.surfaceMuted, border: PRODUCT_THEME.borderSubtle, color: T.textPrimary }}>
        {value}
      </div>
    </div>
  );
}

function ProductDetailModal({
  product,
  stock,
  storeLabel,
  onClose,
  onNotify,
  canNotify,
  sending,
  notified,
  canViewCost,
  highlightStoreId,
}: {
  product: Producto;
  stock: number;
  storeLabel: string;
  onClose: () => void;
  onNotify: () => void;
  canNotify: boolean;
  sending: boolean;
  notified: boolean;
  canViewCost: boolean;
  highlightStoreId?: number | null;
}) {
  const priceRows = [
    { level: "a", price: product.precioA },
    { level: "b", price: product.precioB },
    { level: "c", price: product.precioC },
    { level: "d", price: product.precioD },
    { level: "e", price: product.precioE },
  ].filter((row): row is { level: "a" | "b" | "c" | "d" | "e"; price: number } => Number(row.price) > 0);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-[32px] flex flex-col" style={T.glass}>
        <div className="p-6 flex items-center justify-between gap-4" style={{ borderBottom: PRODUCT_THEME.borderPanel }}>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.redBright }}>Detalle de producto</p>
            <h2 className="text-xl font-black truncate" style={{ color: T.textPrimary }}>{product.nombre}</h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <DetailChip>{product.sku || 'Sin código'}</DetailChip>
              {product.categoria && <DetailChip>{product.categoria}</DetailChip>}
              <DetailChip>{storeLabel}: {stock}</DetailChip>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl transition-colors" style={SECONDARY_BUTTON}>
            <X size={20} style={{ color: T.textSecondary }} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-40 h-40 rounded-[28px] overflow-hidden shrink-0 flex items-center justify-center" style={{ background: PRODUCT_THEME.surfaceMuted, border: PRODUCT_THEME.borderSubtle }}>
              {product.imagen ? (
                <img src={product.imagen} alt={product.nombre} className="w-full h-full object-cover" />
              ) : (
                <Package size={36} style={{ color: T.textMuted }} />
              )}
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <DetailField label="Nombre" value={<span className="text-sm font-bold">{product.nombre}</span>} />
              <DetailField label="Código" value={<span className="text-sm font-mono">{product.sku || "—"}</span>} />
              <DetailField label="Categoría" value={<span className="text-sm">{product.categoria || "Sin categoría"}</span>} />
              <DetailField label="Proveedor" value={<span className="text-sm">{product.proveedor || "Sin proveedor"}</span>} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.textMuted }}>
                Niveles de precio
              </p>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: T.textMuted }}>
                {priceRows.length === 1 ? "1 nivel activo" : `${priceRows.length} niveles activos`}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {priceRows.map(({ level, price }) => {
                const rgb = PRICE_LEVEL_RGB[level];
                return (
                  <div
                    key={`detail-${product.id}-${level}`}
                    className="rounded-[24px] px-4 py-3.5"
                    style={{
                      background: `rgba(${rgb},0.10)`,
                      border: `1px solid rgba(${rgb},0.30)`,
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                    }}
                  >
                    <div className="flex items-end justify-between gap-4">
                      <div className="min-w-0">
                        <p
                          className="text-[11px] font-black uppercase tracking-[0.16em] mb-1"
                          style={{ color: `rgba(${rgb},0.92)` }}
                        >
                          {PRICE_LEVEL_LABELS[level]}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: T.textMuted }}>
                          Precio de venta
                        </p>
                      </div>
                      <span
                        className="text-[2rem] leading-none font-black tabular-nums shrink-0"
                        style={{ color: PRICE_LEVEL_COLORS[level] }}
                      >
                        {fmt(price)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {canViewCost && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DetailField
                label="Costo real"
                value={<span className="text-lg font-black" style={{ color: "#FFAA00" }}>{product.costo ? fmt(product.costo) : "Sin costo"}</span>}
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DetailField
              label="Métodos de pago"
              value={(
                <div className="flex items-center gap-2 flex-wrap">
                  {product.allowCash && <DetailChip>Efectivo</DetailChip>}
                  {product.allowCard && <DetailChip>Tarjeta</DetailChip>}
                  {!product.allowCash && !product.allowCard && <span className="text-sm">Sin métodos configurados</span>}
                </div>
              )}
            />
            <DetailField
              label="Pieza única"
              value={<span className="text-sm font-bold">{product.esUnico ? "Sí" : "No"}</span>}
            />
            <DetailField
              label="Stock de tienda"
              value={<span className="text-lg font-black" style={{ color: stock <= 0 ? T.redBright : stock <= 10 ? "#FFAA00" : T.textPrimary }}>{stock}</span>}
            />
            <DetailField
              label="Estado"
              value={<span className="text-sm font-bold">{stock <= 0 ? "Agotado" : stock <= 10 ? "Por agotarse" : "Disponible"}</span>}
            />
          </div>

          {/* Existencias en otras tiendas (gerente/cajero ven dónde hay stock). */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: T.textMuted }}>Stock por tienda</p>
            <StoreStockBreakdown productId={product.id} highlightStoreId={highlightStoreId} />
          </div>
        </div>

        <div className="p-6 flex items-center justify-between gap-3" style={{ borderTop: PRODUCT_THEME.borderPanel }}>
          <p className="text-xs" style={{ color: T.textMuted }}>
            {canNotify ? "Puedes avisar al gerente/admin cuando el stock esté por agotarse." : "Vista solo lectura."}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-2xl text-sm font-bold" style={{ ...T.glassMd, color: T.textSecondary }}>
              Cerrar
            </button>
            {canNotify && (
              <button
                onClick={onNotify}
                disabled={sending}
                className="px-4 py-2 rounded-2xl text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                style={notified
                  ? { background: "linear-gradient(135deg, #15803d 0%, #22c55e 100%)", borderRadius: "16px", border: "1px solid rgba(134,239,172,0.35)", color: "#fff" }
                  : T.btnRed}
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <AlertTriangle size={15} />}
                {notified ? "Avisado" : "Notificar stock"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MangaDetailModal({
  manga,
  storeLabel,
  onClose,
  onNotify,
  canNotify,
  sending,
  notified,
  canViewCost,
  highlightStoreId,
}: {
  manga: Manga;
  storeLabel: string;
  onClose: () => void;
  onNotify: () => void;
  canNotify: boolean;
  sending: boolean;
  notified: boolean;
  canViewCost: boolean;
  highlightStoreId?: number | null;
}) {
  const stock = manga.stock ?? 0;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-[32px] flex flex-col" style={T.glass}>
        <div className="p-6 flex items-center justify-between gap-4" style={{ borderBottom: PRODUCT_THEME.borderPanel }}>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.redBright }}>Detalle de tomo</p>
            <h2 className="text-xl font-black truncate" style={{ color: T.textPrimary }}>{manga.name}</h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {manga.code && <DetailChip>{manga.code}</DetailChip>}
              {manga.editorial && <DetailChip>{manga.editorial}</DetailChip>}
              <DetailChip>{storeLabel}: {stock}</DetailChip>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl transition-colors" style={SECONDARY_BUTTON}>
            <X size={20} style={{ color: T.textSecondary }} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="w-40 h-40 rounded-[28px] overflow-hidden shrink-0 flex items-center justify-center" style={{ background: PRODUCT_THEME.surfaceMuted, border: PRODUCT_THEME.borderSubtle }}>
              {manga.image_url ? (
                <img src={manga.image_url} alt={manga.name} className="w-full h-full object-cover" />
              ) : (
                <BookOpen size={36} style={{ color: T.textMuted }} />
              )}
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <DetailField label="Nombre" value={<span className="text-sm font-bold">{manga.name}</span>} />
              <DetailField label="Código" value={<span className="text-sm font-mono">{manga.code || "—"}</span>} />
              <DetailField label="Editorial" value={<span className="text-sm">{manga.editorial || "Sin editorial"}</span>} />
              <DetailField label="Género" value={<span className="text-sm">{manga.genre || "Sin género"}</span>} />
              <DetailField label="Detalle del tomo" value={<span className="text-sm">{manga.volume_number ? `Volumen ${manga.volume_number}` : "Sin volumen registrado"}</span>} />
              <DetailField label="Estado" value={<span className="text-sm font-bold">{stock <= 0 ? "Agotado" : stock <= 10 ? "Por agotarse" : "Disponible"}</span>} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DetailField label="Precio público" value={<span className="text-lg font-black" style={{ color: "#00CC66" }}>{fmt(manga.public_price)}</span>} />
            <DetailField label="Stock de tienda" value={<span className="text-lg font-black" style={{ color: stock <= 0 ? T.redBright : stock <= 10 ? "#FFAA00" : T.textPrimary }}>{stock}</span>} />
            <DetailField label="Activo" value={<span className="text-sm font-bold">{manga.active ? "Sí" : "No"}</span>} />
          </div>

          {canViewCost && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DetailField
                label="Costo real"
                value={<span className="text-lg font-black" style={{ color: "#FFAA00" }}>{manga.cost ? fmt(manga.cost) : "Sin costo"}</span>}
              />
              <DetailField
                label="Margen %"
                value={<span className="text-sm font-bold">{manga.profit_margin_percent ? `${manga.profit_margin_percent}%` : "—"}</span>}
              />
            </div>
          )}

          {/* Existencias en otras tiendas. */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: T.textMuted }}>Stock por tienda</p>
            <StoreStockBreakdown productId={manga.id} highlightStoreId={highlightStoreId} />
          </div>
        </div>

        <div className="p-6 flex items-center justify-between gap-3" style={{ borderTop: PRODUCT_THEME.borderPanel }}>
          <p className="text-xs" style={{ color: T.textMuted }}>
            {canNotify ? "Puedes avisar al gerente/admin cuando este tomo se esté agotando." : "Vista solo lectura."}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-2xl text-sm font-bold" style={{ ...T.glassMd, color: T.textSecondary }}>
              Cerrar
            </button>
            {canNotify && (
              <button
                onClick={onNotify}
                disabled={sending}
                className="px-4 py-2 rounded-2xl text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                style={notified
                  ? { background: "linear-gradient(135deg, #15803d 0%, #22c55e 100%)", borderRadius: "16px", border: "1px solid rgba(134,239,172,0.35)", color: "#fff" }
                  : T.btnRed}
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <AlertTriangle size={15} />}
                {notified ? "Avisado" : "Notificar stock"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const columnHelper = createColumnHelper<Producto>();
const mangaColumnHelper = createColumnHelper<Manga>();

// ─── Componente Modal de Producto ──────────────────────────────────────────────
function ProductModal({
  onClose,
  onSave,
  onDelete,
  product,
  isAdmin,
  canViewCost,
  canManage,
  categorias,
  onAddCategoria,
  proveedores,
  onAddProveedor,
  locations = []
}: {
  onClose: () => void;
  onSave: (p: Producto, imageFile?: File) => void;
  onDelete?: (p: Producto) => void;
  product?: Producto;
  isAdmin: boolean;
  canViewCost: boolean;
  canManage: boolean;
  categorias: string[];
  onAddCategoria: (c: string) => void;
  proveedores: string[];
  onAddProveedor: (p: string) => void;
  locations: {warehouseId: number, name: string, store: string, type: 'central' | 'store' | 'bodega'}[];
}) {
  const [formData, setFormData] = useState<Partial<Producto>>(() => {
    if (product) {
      // Sincronizar ubicaciones: Si hay nuevas ubicaciones que el producto no tiene, agregarlas con stock 0
      const existingUbicaciones = product.stockUbicaciones?.map(u => u.ubicacion) || [];
      const newUbicaciones = locations.filter(l => !existingUbicaciones.includes(l.name));
      
      const updatedStockUbicaciones = [
        ...(product.stockUbicaciones || []),
        ...newUbicaciones.map(l => ({
          warehouseId: l.warehouseId,
          ubicacion: l.name, quantity: 0, stock: 0, total: 0, comprometido: 0, disponibleVenta: 0,
          detalle: { bodega: 0, tienda: 0, danado: 0, preventa: 0, enCamino: 0 }
        }))
      ];
      
      return { ...product, stockUbicaciones: updatedStockUbicaciones };
    }
    
    // Nuevo producto — empieza sin ubicaciones; el usuario las agrega desde el tab Inventario
    return {
      nombre: "", sku: "", categoria: "", proveedor: "",
      tipo: "normal", desactivado: false, costo: 0, precioA: 0, precioB: 0, precioC: 0, precioD: 0, precioE: 0,
      stockUbicaciones: [],
      etiquetas: ["en bodega"], imagen: "", imageIds: [],
      ventasTotales: 0,
      allowCash: true,
      allowCard: true,
    };
  });

  const [activeTab, setActiveTab] = useState<"general" | "precios" | "inventario" | "promociones">("general");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Aplica un archivo de imagen al formulario. Compartido por el <input file>
  // (click) y el drop (drag & drop) para no duplicar la lógica.
  const applyImageFile = (file: File | undefined | null): void => {
    if (!file || !file.type.startsWith('image/')) return;
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setFormData(prev => ({ ...prev, imagen: url }));
  };
  // Local state for the "add warehouse" inline form in the Inventario tab
  const [addWarehouseId, setAddWarehouseId] = useState<number | ''>('');
  const [addQty, setAddQty] = useState<number | ''>('');

  // Preselecciona el almacén cuando solo hay una opción (p.ej. gerente con una sola tienda)
  useEffect(() => {
    const assignedIds = new Set((formData.stockUbicaciones ?? []).map(u => u.warehouseId));
    const available = locations.filter(l => !assignedIds.has(l.warehouseId));
    if (addWarehouseId === '' && available.length === 1) setAddWarehouseId(available[0]!.warehouseId);
  }, [locations, formData.stockUbicaciones, addWarehouseId]);

  // Load real inventory quantities from backend when editing an existing product
  useEffect(() => {
    if (!product) return
    void getInventory({ product_id: product.id }).then(items => {
      setFormData(prev => ({
        ...prev,
        stockUbicaciones: (prev.stockUbicaciones ?? []).map(loc => {
          if (loc.warehouseId === undefined) return loc
          const inv = items.find(i => i.warehouse_id === loc.warehouseId)
          if (!inv) return loc
          const qty = inv.quantity
          return {
            ...loc,
            quantity: qty,
            stock: qty,
            total: qty,
            disponibleVenta: qty,
            detalle: { bodega: qty, tienda: 0, danado: 0, preventa: 0, enCamino: 0 },
          }
        }),
      }))
    }).catch(() => {})
  }, [product?.id])

  const handleSave = () => {
    if (!formData.nombre?.trim()) {
      toast.error("El nombre del producto es requerido");
      setActiveTab("general");
      return;
    }
    if ((formData.precioA ?? 0) <= 0) {
      toast.error("Precio Normal es requerido");
      setActiveTab("precios");
      return;
    }
    if (!product && (formData.stockUbicaciones ?? []).length === 0) {
      toast.error("Agrega al menos una ubicación de inventario");
      setActiveTab("inventario");
      return;
    }
    if (!formData.allowCash && !formData.allowCard) {
      toast.error("El producto debe aceptar al menos un método de pago (efectivo o tarjeta)");
      setActiveTab("precios");
      return;
    }
    onSave({ ...formData, id: formData.id || Date.now() } as Producto, imageFile ?? undefined);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      
      <div 
        className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-[32px] flex flex-col shadow-2xl"
        style={T.glass}
      >
        <div className="p-6 flex items-center justify-between" style={{ borderBottom: PRODUCT_THEME.borderPanel }}>
          <div>
            <h2 className="text-xl font-black" style={{ color: T.textPrimary }}>
              {product ? "Editar Producto" : "Nuevo Producto"}
            </h2>
            <p className="text-xs" style={{ color: T.textSecondary }}>Configuración detallada de catálogo</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl transition-colors" style={SECONDARY_BUTTON}>
            <X size={20} style={{ color: T.textSecondary }} />
          </button>
        </div>

        {/* Required checklist */}
        {!product && (() => {
          const checks = [
            { label: "Nombre", done: !!formData.nombre?.trim() },
            { label: "Precio Normal", done: (formData.precioA ?? 0) > 0 },
            { label: "Inventario", done: (formData.stockUbicaciones ?? []).length > 0 },
          ];
          return (
            <div className="px-6 py-2.5 flex items-center gap-5" style={{ borderBottom: PRODUCT_THEME.borderSubtle, background: PRODUCT_THEME.surfaceMuted }}>
              {checks.map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  {item.done
                    ? <CheckCircle2 size={11} style={{ color: "#4ade80" }} />
                    : <div className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: T.textMuted }} />
                  }
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: item.done ? T.textMuted : T.textSecondary,
                    textDecoration: item.done ? "line-through" : "none",
                  }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}

        {(() => {
          const generalOk = !!formData.nombre?.trim();
          const preciosOk = (formData.precioA ?? 0) > 0;
          const inventarioOk = !!product || (formData.stockUbicaciones ?? []).length > 0;
          const tabValid: Record<string, boolean> = { general: generalOk, precios: preciosOk, inventario: inventarioOk, promociones: true };
          return (
            <div className="flex px-6 pt-4 gap-4">
              {([
                { id: "general", label: "General", icon: Package },
                { id: "precios", label: "Precios", icon: DollarSign },
                { id: "inventario", label: "Inventario", icon: Warehouse },
                { id: "promociones", label: "Promos", icon: TicketPercent }
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all relative"
                  style={activeTab === tab.id ? T.chipActive : { color: T.textMuted }}
                >
                  <tab.icon size={14} />
                  {tab.label}
                  {!tabValid[tab.id] && (
                    <span
                      className="ml-0.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide"
                      style={{ background: "rgba(224,34,26,0.18)", color: "#FF6644" }}
                    >
                      req
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })()}

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "general" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-6">
                <div
                  className="w-36 h-36 rounded-[28px] overflow-hidden shrink-0 border-2 border-dashed flex flex-col items-center justify-center relative group transition-all hover:border-red-500/40 shadow-inner"
                  style={{ background: PRODUCT_THEME.surfaceMuted, borderColor: isDragging ? T.redBright : "var(--td-card-border)", aspectRatio: "1/1", transform: isDragging ? "scale(1.03)" : undefined }}
                  onDragOver={(e) => { e.preventDefault(); if (!isDragging) setIsDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); applyImageFile(e.dataTransfer.files?.[0]); }}
                >
                  {formData.imagen ? (
                    <>
                      <img src={formData.imagen} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                        <Camera size={24} className="text-white" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-white">Cambiar</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 transition-colors" style={{ color: T.textMuted }}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-1" style={{ background: PRODUCT_THEME.surfaceSoft }}>
                        <Upload size={20} />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-center">Subir<br/>Imagen</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    style={{ fontSize: 0 }}
                    onChange={(e) => applyImageFile(e.target.files?.[0])}
                  />
                </div>

                <div className="flex-1 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Nombre del Producto</label>
                    <input 
                      type="text" value={formData.nombre} 
                      onChange={e => setFormData({...formData, nombre: e.target.value})}
                      className="w-full px-4 py-3 rounded-2xl outline-none" style={T.input}
                      placeholder="Ej. Funko Pop Goku SSJ"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>SKU / Código</label>
                      <div className="relative group">
                        <input 
                          type="text" value={formData.sku} 
                          onChange={e => setFormData({...formData, sku: e.target.value})}
                          className="w-full pl-4 pr-12 py-3 rounded-2xl outline-none uppercase" style={T.input}
                          placeholder="ESCANEÉ O ESCRIBA"
                        />
                        <button
                          type="button"
                          title="Generar código (sin lector)"
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl hover:text-red-500 hover:bg-red-500/10 transition-all"
                          style={{ color: T.textMuted }}
                          onClick={() => setFormData({ ...formData, sku: generateBarcode() })}
                        >
                          <Scan size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Categoría</label>
                      <div className="flex gap-2">
                        <select 
                          value={formData.categoria} 
                          onChange={e => setFormData({...formData, categoria: e.target.value})}
                          className="flex-1 px-4 py-3 rounded-2xl outline-none appearance-none" style={T.input}
                        >
                          <option value="">Elige categoría</option>
                          {categorias.filter(c => c !== "Todo").map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            const newCat = prompt("Ingrese el nombre de la nueva categoría:");
                            if (newCat) {
                              onAddCategoria(newCat);
                              setFormData({...formData, categoria: newCat});
                            }
                          }}
                          className="p-3 rounded-2xl transition-all shrink-0"
                          style={SECONDARY_BUTTON}
                        >
                          <Plus size={18} style={{ color: T.redBright }} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Proveedor</label>
                  <div className="flex gap-2">
                    <select 
                      value={formData.proveedor} 
                      onChange={e => setFormData({...formData, proveedor: e.target.value})}
                      className="flex-1 px-4 py-3 rounded-2xl outline-none appearance-none" style={T.input}
                    >
                      <option value="">Elige proveedor</option>
                      {proveedores.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button 
                      type="button"
                      onClick={() => {
                        const newProv = prompt("Ingrese el nombre del nuevo proveedor:");
                        if (newProv) {
                          onAddProveedor(newProv);
                          setFormData({...formData, proveedor: newProv});
                        }
                      }}
                      className="p-3 rounded-2xl transition-all shrink-0"
                      style={SECONDARY_BUTTON}
                    >
                      <Plus size={18} style={{ color: T.redBright }} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "precios" && (
            <div className="space-y-6">
              {canViewCost && (
                <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl" style={{ background: PRODUCT_THEME.surfaceSoft, border: PRODUCT_THEME.borderSubtle }}>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest ml-1 flex items-center gap-1" style={{ color: T.redBright }}>
                      <CheckCircle2 size={10} /> Costo Real
                    </label>
                    <input
                      type="number" value={formData.costo || ''}
                      placeholder="0"
                      onChange={e => setFormData({...formData, costo: parseFloat(e.target.value) || 0})}
                      className="w-full px-4 py-3 rounded-2xl outline-none" style={T.input}
                    />
                  </div>
                  {formData.tipo === "libro" && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>Porcentaje de Ganancia</label>
                      <input 
                        type="number" value={formData.porcentajeLibro}
                        onChange={e => {
                          const pct = parseFloat(e.target.value);
                          const cost = formData.costo || 0;
                          setFormData({...formData, porcentajeLibro: pct, precioA: cost * (1 + pct/100)});
                        }}
                        className="w-full px-4 py-3 rounded-2xl outline-none border border-amber-500/30" style={T.input}
                        placeholder="%"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Niveles de precio: 3 principales (Normal/Socio/Mayorista) en el
                  primer row, D/E en el segundo. 5 en un row quedaban apretados. */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>{PRICE_FORM_LABELS[0]}</label>
                  <input
                    type="number" value={formData.precioA || ''}
                    placeholder="0"
                    onChange={e => setFormData({...formData, precioA: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-2xl outline-none font-black" style={{ ...T.input, color: T.redBright }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>{PRICE_FORM_LABELS[1]}</label>
                  <input
                    type="number" value={formData.precioB || ''}
                    placeholder="0"
                    onChange={e => setFormData({...formData, precioB: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-2xl outline-none" style={T.input}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>{PRICE_FORM_LABELS[2]}</label>
                  <input
                    type="number" value={formData.precioC || ''}
                    placeholder="0"
                    onChange={e => setFormData({...formData, precioC: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-2xl outline-none" style={T.input}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>{PRICE_FORM_LABELS[3]}</label>
                  <input
                    type="number" value={formData.precioD || ''}
                    placeholder="0"
                    onChange={e => setFormData({...formData, precioD: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-2xl outline-none" style={T.input}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>{PRICE_FORM_LABELS[4]}</label>
                  <input
                    type="number" value={formData.precioE || ''}
                    placeholder="0"
                    onChange={e => setFormData({...formData, precioE: parseFloat(e.target.value) || 0})}
                    className="w-full px-4 py-3 rounded-2xl outline-none" style={T.input}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 p-4 rounded-2xl" style={{ background: PRODUCT_THEME.surfaceSoft, border: PRODUCT_THEME.borderSubtle }}>
                <p className="text-[9px] font-black uppercase tracking-widest opacity-50">Métodos de pago aceptados</p>
                <div className="flex items-center gap-6 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox" checked={formData.allowCash ?? true}
                      onChange={e => setFormData({ ...formData, allowCash: e.target.checked })}
                      className="w-4 h-4 accent-green-500"
                    />
                    <span className="text-xs font-bold" style={{ color: T.textPrimary }}>Efectivo</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox" checked={formData.allowCard ?? true}
                      onChange={e => setFormData({ ...formData, allowCard: e.target.checked })}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <span className="text-xs font-bold" style={{ color: T.textPrimary }}>Tarjeta</span>
                  </label>
                  {!formData.allowCash && !formData.allowCard && (
                    <span className="text-[10px] font-bold text-red-400">Selecciona al menos uno</span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox" checked={formData.esUnico}
                    onChange={e => setFormData({ ...formData, esUnico: e.target.checked })}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span className="text-xs font-bold" style={{ color: T.textPrimary }}>Pieza Única (No Resurtible)</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "promociones" && (
            <ProductPromotionsTab productId={product?.id ?? null} />
          )}

          {activeTab === "inventario" && (() => {
            const assigned = formData.stockUbicaciones ?? [];
            const assignedIds = new Set(assigned.map(u => u.warehouseId));
            const available = locations.filter(l => !assignedIds.has(l.warehouseId));

            function handleAddLocation() {
              if (addWarehouseId === '') return;
              const loc = locations.find(l => l.warehouseId === addWarehouseId);
              if (!loc) return;
              const qty = typeof addQty === 'number' ? addQty : 0;
              const newEntry: StockUbicacion = {
                warehouseId: loc.warehouseId,
                ubicacion: loc.name,
                quantity: qty, stock: qty, total: qty,
                comprometido: 0, disponibleVenta: qty,
                detalle: { bodega: qty, tienda: 0, danado: 0, preventa: 0, enCamino: 0 },
              };
              setFormData(prev => ({ ...prev, stockUbicaciones: [...(prev.stockUbicaciones ?? []), newEntry] }));
              setAddWarehouseId('');
              setAddQty('');
            }

            return (
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest ml-1" style={{ color: T.textMuted }}>
                  Existencias por Almacén / Tienda
                </label>

                {/* No warehouses at all */}
                {locations.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-8 rounded-2xl" style={{ background: PRODUCT_THEME.surfaceMuted, border: `1px dashed var(--td-card-border)` }}>
                    <Warehouse size={28} style={{ color: T.textMuted }} />
                    <p className="text-xs text-center" style={{ color: T.textMuted }}>
                      No hay almacenes ni tiendas configurados.<br />
                      <span style={{ color: T.textMuted }}>Ve a <strong>Tiendas</strong> para crear uno primero.</span>
                    </p>
                  </div>
                )}

                {/* Add form */}
                {locations.length > 0 && available.length > 0 && (
                  <div className="flex gap-2 items-end p-4 rounded-2xl" style={{ background: PRODUCT_THEME.surfaceMuted, border: PRODUCT_THEME.borderSubtle }}>
                    <div className="flex-1">
                      <label className="text-[9px] font-black uppercase tracking-widest block mb-1.5" style={{ color: T.textMuted }}>Almacén / Tienda</label>
                      <select
                        value={addWarehouseId}
                        onChange={e => setAddWarehouseId(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl outline-none text-sm"
                        style={T.input}
                      >
                        <option value="">Selecciona...</option>
                        {available.map(l => (
                          <option key={l.warehouseId} value={l.warehouseId}>
                            {l.name}{l.store ? ` — ${l.store}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ width: 90 }}>
                      <label className="text-[9px] font-black uppercase tracking-widest block mb-1.5" style={{ color: T.textMuted }}>Cantidad</label>
                      <input
                        type="number" min={0}
                        value={addQty}
                        placeholder="0"
                        onChange={e => setAddQty(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                        onKeyDown={e => e.key === 'Enter' && handleAddLocation()}
                        className="w-full px-3 py-2 rounded-xl outline-none text-center font-bold"
                        style={T.input}
                      />
                    </div>
                    <button
                      onClick={handleAddLocation}
                      disabled={addWarehouseId === ''}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                      style={addWarehouseId !== '' ? T.btnRed : { ...T.input, opacity: 0.4, cursor: 'not-allowed' }}
                    >
                      <Plus size={13} />
                      Agregar
                    </button>
                  </div>
                )}

                {/* All warehouses already added */}
                {locations.length > 0 && available.length === 0 && assigned.length > 0 && (
                  <p className="text-xs px-1" style={{ color: T.textMuted }}>
                    Todos los almacenes/tiendas ya están asignados.
                  </p>
                )}

                {/* Required warning for new product */}
                {!product && assigned.length === 0 && locations.length > 0 && (
                  <p className="text-[11px] px-1" style={{ color: "rgba(255,100,70,0.7)" }}>
                    * Requerido — agrega al menos una ubicación con stock.
                  </p>
                )}

                {/* Assigned list */}
                {assigned.map((loc, idx) => {
                  const meta = locations.find(l => l.warehouseId === loc.warehouseId);
                  const qty = loc.quantity ?? loc.stock ?? 0;
                  return (
                    <div key={idx} className="flex items-center gap-3 p-4 rounded-2xl" style={{ background: PRODUCT_THEME.surfaceMuted, border: PRODUCT_THEME.borderSubtle }}>
                      {/* Icon */}
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: PRODUCT_THEME.surfaceSoft }}>
                        <Warehouse size={14} style={{ color: T.textSecondary }} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black" style={{ color: T.textPrimary }}>{loc.ubicacion}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {meta?.type && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest"
                              style={{
                                background: meta.type === 'bodega' ? "rgba(245,158,11,0.12)" : meta.type === 'central' ? "rgba(100,160,255,0.12)" : "rgba(100,220,130,0.12)",
                                color: meta.type === 'bodega' ? "#D97706" : meta.type === 'central' ? "#88AAFF" : "#55CC88",
                              }}>
                              {warehouseTypeLabel(meta.type)}
                            </span>
                          )}
                          {meta?.store && (
                            <span className="text-[10px]" style={{ color: T.textMuted }}>{meta.store}</span>
                          )}
                        </div>
                      </div>

                      {/* Qty input */}
                      <input
                        type="number" min={0}
                        value={qty || ''}
                        placeholder="0"
                        onChange={e => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          const next = [...assigned];
                          next[idx] = { ...next[idx]!, quantity: val, stock: val, total: val, disponibleVenta: val, detalle: { bodega: val, tienda: 0, danado: 0, preventa: 0, enCamino: 0 } };
                          setFormData(prev => ({ ...prev, stockUbicaciones: next }));
                        }}
                        className="w-20 px-2 py-1.5 rounded-xl text-center outline-none font-bold text-sm"
                        style={T.input}
                      />

                      {/* Delete */}
                      <button
                        onClick={() => setFormData(prev => ({ ...prev, stockUbicaciones: assigned.filter((_, i) => i !== idx) }))}
                        title="Eliminar ubicación"
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-red-500/20 hover:text-red-400"
                        style={{ color: T.textSecondary, flexShrink: 0 }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div className="p-6 flex items-center justify-between gap-4" style={{ borderTop: PRODUCT_THEME.borderPanel }}>
           {canManage && product ? (
             <div className="flex items-center gap-2">
               <input
                  type="checkbox" checked={formData.desactivado}
                  onChange={e => setFormData({...formData, desactivado: e.target.checked})}
                  className="w-4 h-4 accent-gray-500"
                />
                <span className="text-xs font-bold text-gray-500">Desactivar Producto (Baja)</span>
             </div>
           ) : <div />}
           <div className="flex gap-3">
             {isAdmin && product && (
               <button
                 onClick={() => onDelete?.(formData as Producto)}
                 className="px-5 py-2.5 rounded-full text-sm font-bold transition-all border border-red-500/30 hover:bg-red-500/10"
                 style={{ color: '#ef4444' }}
               >
                 Eliminar
               </button>
             )}
             <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-full text-sm font-bold transition-all"
              style={SECONDARY_BUTTON}
            >
              Cancelar
            </button>
            {(() => {
              const canSave = !!formData.nombre?.trim() && (formData.precioA ?? 0) > 0 && (!!product || (formData.stockUbicaciones ?? []).length > 0);
              return (
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  className="flex items-center gap-2 px-8 py-2.5 text-sm font-bold transition-all shadow-lg shadow-red-500/20"
                  style={{
                    ...T.btnRed,
                    opacity: canSave ? 1 : 0.4,
                    cursor: canSave ? "pointer" : "not-allowed",
                    transform: "none",
                  }}
                >
                  <Save size={16} />
                  Guardar Cambios
                </button>
              );
            })()}
           </div>
        </div>
      </div>
    </div>
  );
}

// ─── App Principal ────────────────────────────────────────────────────────────
export function ProductsPage() {
  const [pageSection, setPageSection] = useState<'productos' | 'tomos'>('productos');
  const [search, setSearch] = useState("");
  const [selectedCat] = useState("Todo");
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">(
    () => (localStorage.getItem('tadaima-products-view') ?? 'list') as "grid" | "list"
  );
  // Modal rápido de stock por tienda (productos o tomos/mangas).
  const [stockModalProduct, setStockModalProduct] = useState<{ id: number; name: string; kind?: "product" | "manga" } | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [mangaSearch, setMangaSearch] = useState('');
  const [mangaSorting, setMangaSorting] = useState<SortingState>([]);
  const [mangaPagination, setMangaPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  
  const { refreshProductCount } = useActiveStore();
  const { user } = useAuth();
  const isAdmin     = isAdminRole(user?.roles);
  const isGerente   = isManagerRole(user?.roles);
  // Admin (admin/owner/super_admin/dueño) siempre ve costos.
  // Gerente/cajero solo si admin les activó el flag desde Inicio → Permisos.
  const canViewCost = isAdmin || !!user?.can_view_cost;
  // gerente puede ver/usar la mayoría del panel pero sin costos reales
  const canManage   = isAdmin || isGerente;
  // Cajero puede dar de alta productos nuevos, pero no editar existentes ni borrar
  const canEdit     = canManage; // admin + gerente
  const canNotify   = !isAdmin && !!user?.store_id;

  // Cajero/no-admin: forzar filtro a su tienda asignada (no debe ver productos de otras sucursales)
  useEffect(() => {
    if (!user) return;
    if (!isAdmin && user.store_id != null && selectedStoreId !== user.store_id) {
      setSelectedStoreId(user.store_id);
    }
  }, [user, isAdmin]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Producto | undefined>(undefined);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [showMangaModal, setShowMangaModal] = useState(false);
  const [editingManga, setEditingManga] = useState<Manga | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Producto | null>(null);
  const [viewingManga, setViewingManga] = useState<Manga | null>(null);
  const [alertingKey, setAlertingKey] = useState<string | null>(null);
  const [notifiedKeys, setNotifiedKeys] = useState<Record<string, boolean>>({});
  const [showTopSellers, setShowTopSellers] = useState(false);
  const [showLowStock, setShowLowStock] = useState(false);
  const [showOutStock, setShowOutStock] = useState(false);
  const [showNoCost, setShowNoCost] = useState(false);
  const [selectedForWhatsapp, setSelectedForWhatsapp] = useState<number[]>([]);

  const queryClient = useQueryClient();
  // Polling casi-live (Joel 2026-06-12): solo mientras el TAB correspondiente
  // está visible y la tab del browser enfocada — productos/tomos creados en
  // otra máquina aparecen solos, sin refrescar y sin señal visual (la lista
  // solo cambia si hay algo nuevo).
  const LIVE_POLL_MS = 20_000;
  const productsQuery = useProductsQuery(selectedStoreId, {
    refetchIntervalMs: pageSection === 'tomos' ? false : LIVE_POLL_MS,
  });
  // Librerías: se cargan al entrar a su tab, PERO también en background una vez
  // que el catálogo de productos terminó de cargar → al dar clic en "Tomos" ya
  // están en cache (instantáneo). El spinner de tomos sigue gateado a su tab,
  // así que el prefetch no muestra "Cargando" en la vista de productos.
  const mangasQuery = useMangasQuery(selectedStoreId, {
    enabled: pageSection === 'tomos' || productsQuery.isSuccess,
    refetchIntervalMs: pageSection === 'tomos' ? LIVE_POLL_MS : false,
  });
  const storesQuery = useStoresQuery({ active: true, enabled: isAdmin });
  const warehousesQuery = useWarehousesQuery({ active: true });

  // Categorías y proveedores desde el backend (antes hardcodeados). Esto
  // evita que aparezcan opciones que el usuario nunca creó y asegura que las
  // recién creadas se reflejen tras invalidar.
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => getCategories(),
    staleTime: 5 * 60_000,
  });
  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => getSuppliers(),
    staleTime: 5 * 60_000,
  });
  const categoriasData = categoriesQuery.data ?? [];
  const categorias = ["Todo", ...categoriasData.map(c => c.name)];
  const categoriaIdByName = useMemo(
    () => new Map(categoriasData.map(c => [c.name, c.id] as [string, number])),
    [categoriasData]
  );
  const proveedores = (suppliersQuery.data ?? []).map(s => s.name);
  const proveedorIdByName = useMemo(
    () => new Map((suppliersQuery.data ?? []).map(s => [s.name, s.id] as [string, number])),
    [suppliersQuery.data]
  );

  const handleAddCategoria = useCallback(async (name: string): Promise<void> => {
    try {
      await createCategory({ name });
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'No se pudo crear la categoría';
      toast.error(msg);
    }
  }, [queryClient]);

  const handleAddProveedor = useCallback(async (name: string): Promise<void> => {
    try {
      await createSupplier({ name });
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'No se pudo crear el proveedor';
      toast.error(msg);
    }
  }, [queryClient]);

  const products = useMemo(
    // GET /products devuelve TODO (incluye mangas — la Caja los necesita).
    // El tab "Productos" solo muestra los normales; los tomos viven en su
    // tab "Tomos / Manga". Sin este filtro un tomo recién creado aparecía
    // duplicado como producto normal (QA Joel 2026-06-11).
    () => (productsQuery.data?.data ?? [])
      .filter(p => (p.product_type ?? 'product') !== 'manga')
      .map(apiProductToProducto),
    [productsQuery.data]
  );
  const stockMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of productsQuery.data?.data ?? []) map.set(p.id, p.stock_total);
    return map;
  }, [productsQuery.data]);
  // Desglose Exhibición/Bodega — solo viene cuando la query está scopeada a una
  // tienda (selectedStoreId != null). Exhibición = vendible en Caja; Bodega = atrás.
  const exhibicionMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of productsQuery.data?.data ?? []) if (p.stock_exhibicion != null) map.set(p.id, p.stock_exhibicion);
    return map;
  }, [productsQuery.data]);
  const bodegaMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of productsQuery.data?.data ?? []) if (p.stock_bodega != null) map.set(p.id, p.stock_bodega);
    return map;
  }, [productsQuery.data]);
  const mangas = mangasQuery.data ?? [];
  const stores = storesQuery.data ?? [];
  const locations = useMemo(
    () => (warehousesQuery.data ?? [])
      // RBAC: gerente/cajero solo ve y edita inventario de las bodegas de su
      // tienda. Antes el modal Editar Producto le mostraba el stock de todas
      // las sucursales (bug QA Web 5).
      .filter(w => isAdmin || w.store?.id === user?.store_id)
      .map(w => ({
        warehouseId: w.id,
        name: w.name,
        store: w.store?.name ?? '',
        type: w.type,
      })),
    [warehousesQuery.data, isAdmin, user?.store_id]
  );
  const loading = productsQuery.isPending;
  const mangasLoading = pageSection === 'tomos' && mangasQuery.isPending;
  const apiError = productsQuery.error
    ? ((productsQuery.error as { message?: string }).message ?? 'Error al cargar productos')
    : null;

  const invalidateProducts = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.products.all }),
    [queryClient]
  );
  const invalidateMangas = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.mangas.all }),
    [queryClient]
  );

  /**
   * Resuelve el id de categoría desde el nombre seleccionado. Si el nombre no
   * existe aún en el catálogo (recién creado con "+" y el refetch no llegó), lo
   * crea on-the-fly y usa el id devuelto — así no se pierde por una carrera de
   * timing al guardar el producto.
   */
  const resolveCategoryId = async (nombre: string): Promise<number | null> => {
    const name = (nombre ?? '').trim();
    if (!name || name === 'Todo') return null;
    const existing = categoriaIdByName.get(name);
    if (existing !== undefined) return existing;
    try {
      const created = await createCategory({ name });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      return created.id;
    } catch {
      return null;
    }
  };

  /** Igual que resolveCategoryId pero para proveedores. */
  const resolveSupplierId = async (nombre: string): Promise<number | null> => {
    const name = (nombre ?? '').trim();
    if (!name) return null;
    const existing = proveedorIdByName.get(name);
    if (existing !== undefined) return existing;
    try {
      const created = await createSupplier({ name });
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      return created.id;
    } catch {
      return null;
    }
  };

  const handleSaveProduct = async (p: Producto, imageFile?: File): Promise<void> => {
    const isNew = !products.some(item => item.id === p.id);

    setIsModalOpen(false);
    setEditingProduct(undefined);

    // Resuelve (o crea on-the-fly) los ids de categoría y proveedor desde el
    // nombre — robusto contra la carrera de timing del "+" recién tecleado.
    const [categoryId, supplierId] = await Promise.all([
      resolveCategoryId(p.categoria),
      resolveSupplierId(p.proveedor),
    ]);

    if (isNew) {
      // Toast persistente mientras se crea: el modal se cierra al instante y sin
      // esto la tabla se ve vacía/stale sin señal de que algo está pasando.
      const creatingToastId = toast.loading(`Creando "${p.nombre}"…`);
      createProduct({
        name: p.nombre,
        sku: p.sku,
        cost: p.costo,
        active: !p.desactivado,
        allow_cash: p.allowCash,
        allow_card: p.allowCard,
        category_id: categoryId,
        supplier_id: supplierId,
        prices: {
          price_1: p.precioA,
          ...(p.precioB !== undefined && p.precioB > 0 ? { price_2: p.precioB } : {}),
          ...(p.precioC !== undefined && p.precioC > 0 ? { price_3: p.precioC } : {}),
          ...(p.precioD !== undefined && p.precioD > 0 ? { price_4: p.precioD } : {}),
          ...(p.precioE !== undefined && p.precioE > 0 ? { price_5: p.precioE } : {}),
        },
      }).then(async (created) => {
        // Upload image if provided
        if (imageFile) {
          await uploadProductImage(created.id, imageFile).catch(() => {
            toast.error('Producto creado, pero no se pudo subir la imagen.');
          });
        }
        // Save inventory per warehouse now that we have the real product id
        const assignments = p.stockUbicaciones.filter(
          loc => loc.warehouseId !== undefined && loc.warehouseId > 0
        );
        await Promise.allSettled(
          assignments.map(loc =>
            updateInventory(created.id, loc.warehouseId!, {
              quantity: loc.quantity ?? 0,
            })
          )
        );
        void refreshProductCount();
        // Esperar la invalidación (refetch de queries activas) antes del toast
        // de éxito: cuando sale el ✓ el registro ya está visible en la tabla
        // y en el catálogo de Caja (comparten el prefijo products.all).
        await invalidateProducts();
        toast.success(`Producto "${p.nombre}" creado`, { id: creatingToastId });
      }).catch((err: unknown) => {
        const { title, detail } = formatApiError(err, 'No se pudo crear el producto');
        toast.error(title, { id: creatingToastId, description: detail || undefined, duration: 8000 });
        void invalidateProducts();
      });
    } else {
      // Persist product field changes to backend
      void updateProduct(p.id, {
        name: p.nombre,
        sku: p.sku,
        cost: p.costo,
        active: !p.desactivado,
        allow_cash: p.allowCash,
        allow_card: p.allowCard,
        category_id: categoryId,
        supplier_id: supplierId,
        prices: {
          price_1: p.precioA,
          ...(p.precioB !== undefined && p.precioB > 0 ? { price_2: p.precioB } : {}),
          ...(p.precioC !== undefined && p.precioC > 0 ? { price_3: p.precioC } : {}),
          ...(p.precioD !== undefined && p.precioD > 0 ? { price_4: p.precioD } : {}),
          ...(p.precioE !== undefined && p.precioE > 0 ? { price_5: p.precioE } : {}),
        },
      }).then(async () => {
        if (imageFile) {
          // Delete existing images before uploading the new one
          await Promise.allSettled(p.imageIds.map(id => removeProductImage(p.id, id)));
          void uploadProductImage(p.id, imageFile)
            .then(() => toast.success(`Producto "${p.nombre}" actualizado`))
            .catch(() => { toast.error('Producto actualizado, pero no se pudo subir la imagen.'); })
            .finally(() => void invalidateProducts());
        } else {
          void invalidateProducts();
          toast.success(`Producto "${p.nombre}" actualizado`);
        }
      }).catch((err: unknown) => {
        const msg = (err as { message?: string }).message ?? 'Error al actualizar producto';
        toast.error(msg);
        void invalidateProducts();
      });

      // Persist inventory changes per warehouse to backend
      for (const loc of p.stockUbicaciones) {
        if (loc.warehouseId !== undefined && loc.warehouseId > 0) {
          void updateInventory(p.id, loc.warehouseId, {
            quantity: loc.quantity ?? loc.stock ?? 0,
          }).catch((err: unknown) => {
            const msg = (err as { message?: string }).message ?? 'Error al actualizar stock';
            toast.error(`Stock no actualizado en ${loc.ubicacion}: ${msg}`);
          });
        }
      }
    }
  };

  const [deleteTarget, setDeleteTarget] = React.useState<Producto | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  // Modo del delete: "soft" = borrar solo si no tiene ventas/apartados.
  //                  "force" = borrar TODO incluyendo ventas, apartados, traspasos.
  const [deleteMode, setDeleteMode] = React.useState<"soft" | "force">("soft");
  // Confirmación extra para force: el cajero debe tipear el nombre del producto.
  const [forceConfirmText, setForceConfirmText] = React.useState("");

  const handleDeleteProduct = async (): Promise<void> => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      if (deleteMode === "force") {
        await forceDeleteProduct(deleteTarget.id);
      } else {
        await deleteProduct(deleteTarget.id);
      }
      void invalidateProducts();
      setIsModalOpen(false);
      setEditingProduct(undefined);
      setDeleteTarget(null);
      setDeleteMode("soft");
      setForceConfirmText("");
      toast.success(deleteMode === "force" ? 'Producto y todo su historial eliminados.' : 'Producto eliminado.');
      void refreshProductCount();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'No se pudo eliminar el producto.';
      // En modo soft, si el backend rechaza por relaciones, sugerimos cambiar a force.
      toast.error(msg + (deleteMode === "soft" ? " Cambia a 'Borrar TODO' si quieres eliminarlo de todos modos." : ""));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleToggleWhatsappSelection = (id: number) => {
    setSelectedForWhatsapp(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const sendWhatsappReport = () => {
    if (selectedForWhatsapp.length === 0) return;
    const selectedProds = products.filter(p => selectedForWhatsapp.includes(p.id));
    let message = "Hola Administrador, los siguientes productos tienen bajo stock y necesitan resurtirse:\n\n";
    selectedProds.forEach(p => {
      const stock = getTotalStock(p.id);
      message += `• ${p.nombre} (SKU: ${p.sku}) - Stock: ${stock} pzas\n`;
    });
    
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  const handleEdit = useCallback((p: Producto) => {
    setEditingProduct(p);
    setIsModalOpen(true);
  }, []);

  const storeLabel = useMemo(() => {
    if (selectedStoreId) {
      return stores.find(s => s.id === selectedStoreId)?.name ?? 'Tienda';
    }
    return user?.store?.name ?? 'Tu tienda';
  }, [selectedStoreId, stores, user?.store?.name]);

  const handleNotify = useCallback(async (
    productId: number,
    stock: number,
    kind: "product" | "manga",
    label: string,
  ) => {
    if (!canNotify) return;

    const key = `${kind}:${productId}`;
    setAlertingKey(key);
    try {
      const result = await sendStockAlert({ product_id: productId, stock, kind });
      setNotifiedKeys(prev => ({ ...prev, [key]: true }));
      window.dispatchEvent(new Event("tadaima:notifications-changed"));
      toast.success(
        result.created_or_updated > 1
          ? `Aviso actualizado para ${result.created_or_updated} destinatarios.`
          : `Aviso enviado por ${label}.`,
      );
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'No se pudo enviar el aviso de stock.';
      toast.error(msg);
    } finally {
      setAlertingKey(null);
    }
  }, [canNotify]);

  const openProductDetails = useCallback((p: Producto) => {
    setViewingProduct(p);
  }, []);

  const openMangaDetails = useCallback((m: Manga) => {
    setViewingManga(m);
  }, []);

  const handleCreateNew = useCallback(() => {
    setShowTypeSelector(true);
  }, []);

  const handleViewMode = useCallback((mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem('tadaima-products-view', mode);
  }, []);

  // Single source of truth for stock — reads from inventory API, NOT from stockUbicaciones
  const getTotalStock = useCallback((productId: number): number => {
    return stockMap.get(productId) ?? 0;
  }, [stockMap]);

  const columns = useMemo(() => [
    columnHelper.accessor('nombre', {
      header: 'Producto',
      cell: info => {
        const img = info.row.original.imagen;
        return (
          <div className="flex items-center gap-3">
            {img && <ProductThumb src={img} alt={info.getValue()} />}
            <div className="min-w-0">
              <p className="text-sm font-bold truncate max-w-[200px]" style={{ color: T.textPrimary }}>{info.getValue()}</p>
              <p className="text-[10px] font-mono" style={{ color: T.textMuted }}>{info.row.original.sku}</p>
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor('precioA', {
      header: 'Precio',
      cell: info => <span className="text-sm font-black" style={{ color: '#00CC66' }}>{fmt(info.getValue())}</span>,
    }),
    // Desglose Exhibición/Bodega — solo cuando hay una tienda en scope (gerente/
    // cajero, o admin con tienda filtrada). Exhibición = vendible en Caja.
    ...(selectedStoreId !== null ? [
      columnHelper.display({
        id: 'exhibicion',
        header: 'Exhibición',
        cell: info => {
          const val = exhibicionMap.get(info.row.original.id) ?? 0;
          return (
            <span className="text-sm font-black" style={{ color: val <= 0 ? T.redBright : '#00CC66' }}
              title="Vendible en Caja (front de la tienda)">{val}</span>
          );
        },
      }),
      columnHelper.display({
        id: 'bodega',
        header: 'Bodega',
        cell: info => {
          const val = bodegaMap.get(info.row.original.id) ?? 0;
          return (
            <span className="text-sm font-black" style={{ color: val > 0 ? '#F59E0B' : T.textMuted }}
              title="Backstock atrás (no vendible — muévelo a Exhibición)">{val}</span>
          );
        },
      }),
    ] : []),
    columnHelper.accessor(
      row => getTotalStock(row.id),
      {
        id: 'stock',
        header: selectedStoreId !== null ? 'Stock (suma)' : 'Stock Total',
        cell: info => {
          // No asignado a esta tienda (sin inventario) → badge ámbar en vez de "0".
          // La sucursal le agrega stock con el botón "Agregar stock".
          if (selectedStoreId !== null && info.row.original.isAssigned === false) {
            return (
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full whitespace-nowrap"
                style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}
                title="Este producto no tiene inventario en esta tienda — agrégale stock">
                No asignado
              </span>
            );
          }
          const val    = info.getValue() as number;
          const unico  = info.row.original.esUnico;
          const low    = val <= 10;
          const empty  = val <= 0;

          let color = T.textPrimary;
          if (empty)              color = T.redBright;
          else if (low && !unico) color = T.redBright;
          else if (low &&  unico) color = '#FFAA00';

          return (
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black" style={{ color }}>{val}</span>
              {low && !empty && unico  && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: '#FFAA00', background: 'rgba(255,170,0,0.12)', border: '1px solid rgba(255,170,0,0.25)' }}>único</span>}
              {low && !empty && !unico && <AlertTriangle size={11} color={T.redBright} />}
            </div>
          );
        },
      }
    ),
    // Desglose por tienda — solo cuando admin ve "Todas las tiendas".
    // Para gerente/cajero o admin con tienda filtrada no aparece (sería redundante).
    ...(isAdmin && selectedStoreId === null ? [
      columnHelper.display({
        id: 'porTienda',
        header: 'Por tienda',
        cell: info => {
          const ubicaciones = (info.row.original.stockUbicaciones ?? [])
            .filter(u => u.ubicacion); // skip placeholders sin nombre
          if (ubicaciones.length === 0) {
            return <span className="text-[10px] font-bold" style={{ color: T.textMuted }}>—</span>;
          }
          return (
            <div className="flex flex-wrap gap-1.5 max-w-[280px]">
              {ubicaciones.map((u, idx) => {
                const qty = u.quantity ?? 0;
                const isOut = qty === 0;
                const isLow = qty > 0 && qty <= 10;
                const color = isOut ? T.redBright : isLow ? '#FFAA00' : '#00CC66';
                const bg = isOut ? 'rgba(204,34,0,0.12)' : isLow ? 'rgba(255,170,0,0.10)' : 'rgba(0,180,90,0.10)';
                return (
                  <div
                    key={`${u.warehouseId ?? idx}-${u.ubicacion}`}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black"
                    style={{ background: bg, border: `1px solid ${color}33`, color }}
                    title={`${u.ubicacion}: ${qty} unidades`}
                  >
                    <span style={{ opacity: 0.7, fontWeight: 700 }}>{u.ubicacion.replace(/^Tienda\s+\d+\s*[—-]?\s*/i, '')}</span>
                    <span>{qty}</span>
                  </div>
                );
              })}
            </div>
          );
        },
      }),
    ] : []),
    columnHelper.accessor(
      row => {
        if (row.desactivado) return 'inactivo';
        if (selectedStoreId !== null && row.isAssigned === false) return 'no_asignado';
        const stock = getTotalStock(row.id);
        if (stock <= 0) return 'sin_stock';
        if (stock <= 10 && !row.esUnico) return 'bajo_stock';
        if (stock <= 10 &&  row.esUnico) return 'unico_bajo';
        return 'activo';
      },
      {
        id: 'estado',
        header: 'Estado',
        cell: info => {
          const val = info.getValue() as string;
          const cfg = {
            activo:     { label: 'Activo',       color: '#00CC66',   bg: 'rgba(0,180,90,0.15)'   },
            inactivo:   { label: 'Inactivo',      color: T.textMuted, bg: PRODUCT_THEME.surfaceSoft },
            no_asignado:{ label: 'No asignado',   color: '#F59E0B',   bg: 'rgba(245,158,11,0.12)' },
            sin_stock:  { label: 'Sin Stock',     color: T.redBright, bg: 'rgba(204,34,0,0.15)'   },
            bajo_stock: { label: 'Bajo Stock',    color: T.redBright, bg: 'rgba(204,34,0,0.12)'   },
            unico_bajo: { label: 'Único — agotándose', color: '#FFAA00', bg: 'rgba(255,170,0,0.1)' },
          } as const;
          const s = cfg[val as keyof typeof cfg] ?? cfg.activo;
          return (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black whitespace-nowrap" style={{ color: s.color, background: s.bg }}>
              {s.label}
            </span>
          );
        },
      }
    ),
    columnHelper.display({
      id: 'acciones',
      header: '',
      enableSorting: false,
      cell: info => {
        const p = info.row.original;
        const stock = getTotalStock(p.id);

        if (canEdit) {
          return (
            <div className="flex items-center gap-2 justify-end">
              {!isAdmin && (
                <button
                  onClick={e => { e.stopPropagation(); void handleNotify(p.id, stock, "product", p.nombre); }}
                  className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-1.5"
                  style={notifiedKeys[`product:${p.id}`]
                    ? { color: "#22c55e", border: "1px solid rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.10)" }
                    : SECONDARY_BUTTON}
                  title="Notificar stock bajo"
                >
                  {alertingKey === `product:${p.id}` ? <Loader2 size={11} className="animate-spin" /> : <AlertTriangle size={11} />}
                  {notifiedKeys[`product:${p.id}`] ? "Avisado" : "Avisar"}
                </button>
              )}
              <button
                onClick={e => { e.stopPropagation(); setStockModalProduct({ id: p.id, name: p.nombre }); }}
                className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all hover:bg-emerald-500/10 hover:text-emerald-300 flex items-center gap-1.5"
                style={p.isAssigned === false
                  ? { color: '#F59E0B', border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.10)' }
                  : SECONDARY_BUTTON}
                title={p.isAssigned === false ? "Agregar stock a esta tienda" : "Editar stock por tienda"}
              >
                <Warehouse size={11} />
                {p.isAssigned === false ? "Agregar stock" : "Stock"}
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleEdit(p); }}
                className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
                style={SECONDARY_BUTTON}
              >
                Editar
              </button>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={e => { e.stopPropagation(); openProductDetails(p); }}
              className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
              style={SECONDARY_BUTTON}
            >
              Ver
            </button>
            {canNotify && (
              <button
                onClick={e => { e.stopPropagation(); void handleNotify(p.id, stock, "product", p.nombre); }}
                className="px-3 py-1.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-1.5"
                style={notifiedKeys[`product:${p.id}`]
                  ? { color: "#22c55e", border: "1px solid rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.10)" }
                  : SECONDARY_BUTTON}
              >
                {alertingKey === `product:${p.id}` ? <Loader2 size={11} className="animate-spin" /> : <AlertTriangle size={11} />}
                {notifiedKeys[`product:${p.id}`] ? "Avisado" : "Avisar"}
              </button>
            )}
          </div>
        );
      },
    }),
  ], [handleEdit, getTotalStock, canEdit, isAdmin, selectedStoreId, exhibicionMap, bodegaMap, canNotify, handleNotify, openProductDetails, alertingKey, notifiedKeys]);


  // Memoize filtered so the array reference is stable between renders that don't change
  // the filter state. Without this, every render creates a new array reference →
  // TanStack's autoResetPageIndex fires → setPagination → infinite loop.
  const filtered = useMemo(() => {
    if (showTopSellers) return [...products].sort((a, b) => b.ventasTotales - a.ventasTotales).slice(0, 50);
    if (showOutStock)   return products.filter(p => !p.esUnico && getTotalStock(p.id) === 0);
    if (showLowStock)   return products.filter(p => !p.esUnico && getTotalStock(p.id) > 0 && getTotalStock(p.id) <= 10);
    if (showNoCost)     return products.filter(p => !p.costo || p.costo <= 0);
    const q = search.toLowerCase();
    return products.filter(p => {
      // Match por nombre, SKU o código de barras — el scanner USB teclea el
      // valor en este input y matcheamos contra los 3 campos.
      const matchesSearch =
        p.nombre.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q);
      const matchesCat = selectedCat === 'Todo' || p.categoria === selectedCat;
      return matchesSearch && matchesCat;
    });
  }, [products, search, selectedCat, showTopSellers, showLowStock, showOutStock, showNoCost, getTotalStock]);

  // ─── TanStack Table (lista mode) ─────────────────────────────────────────────
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // ─── Manga / Tomos table ───────────────────────────────────────────────────
  const mangaColumns = useMemo(() => [
    mangaColumnHelper.accessor('name', {
      header: 'Serie',
      cell: info => {
        const m = info.row.original;
        return (
          <div className="flex items-center gap-3">
            {m.image_url ? (
              <img
                src={m.image_url}
                alt={m.name}
                className="shrink-0 w-10 h-10 rounded-xl object-cover"
                style={{ minWidth: 40, border: PRODUCT_THEME.borderSubtle }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="shrink-0 w-10 h-10 rounded-xl flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg,#990000,#CC2200)', minWidth: 40 }}>
                {m.volume_number != null ? (
                  <>
                    <span style={{ fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.78)', lineHeight: 1 }}>VOL</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{m.volume_number}</span>
                  </>
                ) : (
                  <BookOpen size={14} color="rgba(255,255,255,0.7)" />
                )}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold truncate max-w-[180px]" style={{ color: T.textPrimary }}>{info.getValue()}</p>
                {m.volume_number != null && (
                  <span
                    className="text-[9px] font-black px-1.5 py-0.5 rounded shrink-0"
                    style={{
                      background: 'rgba(204,34,0,0.15)',
                      color: '#FF6644',
                      border: '1px solid rgba(204,34,0,0.3)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Vol. {m.volume_number}
                  </span>
                )}
              </div>
              {m.code && <p className="text-[10px] font-mono mt-0.5" style={{ color: T.textMuted }}>{m.code}</p>}
            </div>
          </div>
        );
      },
    }),
    mangaColumnHelper.accessor('editorial', {
      header: 'Editorial',
      cell: info => <span className="text-xs" style={{ color: T.textSecondary }}>{info.getValue() ?? '—'}</span>,
    }),
    mangaColumnHelper.accessor('genre', {
      header: 'Género',
      cell: info => info.getValue()
        ? <span className="px-2.5 py-1 rounded-full text-[10px] font-black" style={{ background: 'rgba(204,34,0,0.1)', color: T.redBright }}>{info.getValue()}</span>
        : <span style={{ color: T.textMuted }}>—</span>,
    }),
    mangaColumnHelper.accessor('public_price', {
      header: 'Precio',
      cell: info => <span className="text-sm font-black" style={{ color: '#00CC66' }}>{fmt(info.getValue())}</span>,
    }),
    ...(canViewCost ? [mangaColumnHelper.accessor('cost', {
      header: 'Costo',
      cell: info => <span className="text-sm font-bold" style={{ color: T.textSecondary }}>{fmt(info.getValue())}</span>,
    })] : []),
    mangaColumnHelper.accessor('stock', {
      header: 'Stock',
      cell: info => {
        // No asignado a esta tienda (sin inventario) → badge ámbar.
        if (info.row.original.is_assigned === false) {
          return (
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full whitespace-nowrap"
              style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}
              title="Sin inventario en esta tienda — agrégale stock">
              No asignado
            </span>
          );
        }
        const val = info.getValue();
        const empty = val <= 0;
        const low   = val > 0 && val <= 5;
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-black" style={{ color: empty ? T.redBright : low ? '#FFAA00' : T.textPrimary }}>{val}</span>
            {low  && <AlertTriangle size={11} color="#FFAA00" />}
            {empty && <AlertTriangle size={11} color={T.redBright} />}
          </div>
        );
      },
    }),
    mangaColumnHelper.accessor('active', {
      header: 'Estado',
      cell: info => {
        const active = info.getValue();
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black" style={{ color: active ? '#00CC66' : T.textMuted, background: active ? 'rgba(0,180,90,0.15)' : PRODUCT_THEME.surfaceSoft }}>
            {active ? 'Activo' : 'Inactivo'}
          </span>
        );
      },
    }),
    mangaColumnHelper.display({
      id: 'acciones',
      header: '',
      cell: info => {
        const m = info.row.original;
        const stock = m.stock ?? 0;

        if (canEdit) {
          return (
            <div className="flex items-center gap-2 justify-end">
              {!isAdmin && (
                <button
                  onClick={e => { e.stopPropagation(); void handleNotify(m.id, stock, "manga", m.name); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
                  style={notifiedKeys[`manga:${m.id}`]
                    ? { color: "#22c55e", border: "1px solid rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.10)" }
                    : SECONDARY_BUTTON}
                  title="Notificar stock bajo"
                >
                  {alertingKey === `manga:${m.id}` ? <Loader2 size={11} className="animate-spin" /> : <AlertTriangle size={11} />}
                  {notifiedKeys[`manga:${m.id}`] ? "Avisado" : "Avisar"}
                </button>
              )}
              <button
                onClick={e => { e.stopPropagation(); setStockModalProduct({ id: m.id, name: `${m.name}${m.volume_number != null ? ` Vol. ${m.volume_number}` : ""}`, kind: "manga" }); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all hover:bg-emerald-500/10 hover:text-emerald-300"
                style={m.is_assigned === false
                  ? { color: '#F59E0B', border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.10)' }
                  : SECONDARY_BUTTON}
                title={m.is_assigned === false ? "Agregar stock a esta tienda" : "Editar stock por tienda"}
              >
                <Warehouse size={11} />
                {m.is_assigned === false ? "Agregar stock" : "Stock"}
              </button>
              <button
                onClick={e => { e.stopPropagation(); setEditingManga(m); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
                style={SECONDARY_BUTTON}
                title="Editar tomo"
              >
                <Pencil size={11} />
                Editar
              </button>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={e => { e.stopPropagation(); openMangaDetails(m); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
              style={SECONDARY_BUTTON}
            >
              Ver
            </button>
            {canNotify && (
              <button
                onClick={e => { e.stopPropagation(); void handleNotify(m.id, stock, "manga", m.name); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all"
                style={notifiedKeys[`manga:${m.id}`]
                  ? { color: "#22c55e", border: "1px solid rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.10)" }
                  : SECONDARY_BUTTON}
              >
                {alertingKey === `manga:${m.id}` ? <Loader2 size={11} className="animate-spin" /> : <AlertTriangle size={11} />}
                {notifiedKeys[`manga:${m.id}`] ? "Avisado" : "Avisar"}
              </button>
            )}
          </div>
        );
      },
    }),
  ], [canViewCost, canEdit, isAdmin, canNotify, handleNotify, openMangaDetails, alertingKey, notifiedKeys]);

  const filteredMangas = useMemo(() => {
    let list = mangas;
    // Tab "Por agotarse" / "Agotados" — solo aplica cuando estamos en sección tomos.
    if (pageSection === 'tomos') {
      if (showOutStock) {
        list = list.filter(m => (m.stock ?? 0) === 0);
      } else if (showLowStock) {
        list = list.filter(m => (m.stock ?? 0) > 0 && (m.stock ?? 0) <= 10);
      }
    }
    if (!mangaSearch.trim()) return list;
    const q = mangaSearch.toLowerCase();
    return list.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.editorial ?? '').toLowerCase().includes(q) ||
      (m.genre ?? '').toLowerCase().includes(q) ||
      (m.code ?? '').toLowerCase().includes(q)
    );
  }, [mangas, mangaSearch, showLowStock, showOutStock, pageSection]);

  const mangaTable = useReactTable({
    data: filteredMangas,
    columns: mangaColumns,
    state: { sorting: mangaSorting, pagination: mangaPagination },
    onSortingChange: setMangaSorting,
    onPaginationChange: setMangaPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (loading) {
    return <ProductsSkeleton viewMode={viewMode} bgGrad={T.bgGrad} />;
  }

  return (
    <div className="min-h-screen p-6 md:p-8" style={{ background: T.bgGrad }}>
      {apiError !== null && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/60 border border-red-500/40 text-red-300 text-sm font-medium">
          Error al cargar productos: {apiError}
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight" style={{ color: T.textPrimary }}>
              Almacén <span style={{ color: T.redBright }}>Tadaima</span>
            </h1>
            <div className="flex p-1 rounded-xl ml-2 shadow-inner" style={{ background: PRODUCT_THEME.surfaceStrong, border: PRODUCT_THEME.borderSubtle }}>
              <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${canManage ? 'bg-red-600 text-white shadow-lg' : ''}`} style={!canManage ? { color: T.textMuted } : undefined}>
                {canManage ? (isGerente ? "Gerente" : "Admin") : "Almacén"}
              </span>
            </div>
          </div>
          <p className="text-sm mt-1" style={{ color: T.textSecondary }}>Gestión multi-ubicación y catálogo avanzado</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Tabs Por agotarse + Agotados — respetan el filtro de tienda activo
              (selectedStoreId). Admin con "Todas las tiendas" ve totales globales;
              al elegir una tienda específica el conteo y la tabla se filtran a ella. */}
          {(() => {
            const isProductos = pageSection === 'productos';
            const lowStockCount = isProductos
              ? products.filter(p => !p.esUnico && getTotalStock(p.id) > 0 && getTotalStock(p.id) <= 10).length
              : mangas.filter(m => (m.stock ?? 0) > 0 && (m.stock ?? 0) <= 10).length;
            const outStockCount = isProductos
              ? products.filter(p => !p.esUnico && getTotalStock(p.id) === 0).length
              : mangas.filter(m => (m.stock ?? 0) === 0).length;
            return (
              <>
                {lowStockCount > 0 && (
                  <button
                    onClick={() => { setShowLowStock(v => !v); setShowOutStock(false); setShowTopSellers(false); setShowNoCost(false); }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all hover:scale-[1.02] active:scale-95"
                    style={{
                      background: showLowStock ? "rgba(245,158,11,0.18)" : "rgba(245,158,11,0.08)",
                      border: `1px solid ${showLowStock ? "rgba(245,158,11,0.6)" : "rgba(245,158,11,0.25)"}`,
                      color: "#F59E0B",
                    }}
                    title={selectedStoreId
                      ? `Productos con stock 1–10 en ${stores.find(s => s.id === selectedStoreId)?.name ?? "esta tienda"}`
                      : "Productos con stock 1–10 (suma de todas las tiendas — selecciona una tienda específica para ver el detalle por tienda)"}
                  >
                    <AlertTriangle size={13} />
                    Por agotarse
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white">{lowStockCount}</span>
                  </button>
                )}
                {outStockCount > 0 && (
                  <button
                    onClick={() => { setShowOutStock(v => !v); setShowLowStock(false); setShowTopSellers(false); setShowNoCost(false); }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all hover:scale-[1.02] active:scale-95"
                    style={{
                      background: showOutStock ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.08)",
                      border: `1px solid ${showOutStock ? "rgba(239,68,68,0.6)" : "rgba(239,68,68,0.25)"}`,
                      color: "#EF4444",
                    }}
                    title={selectedStoreId
                      ? `Productos sin stock en ${stores.find(s => s.id === selectedStoreId)?.name ?? "esta tienda"}`
                      : "Productos sin stock (en TODAS las tiendas — selecciona una tienda específica para ver agotados solo en ella)"}
                  >
                    <PackageX size={13} />
                    Agotados
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-red-500 text-white">{outStockCount}</span>
                  </button>
                )}
              </>
            );
          })()}

          {/* Cost stats visible only to users with can_view_cost */}
          {canViewCost && (() => {
            const noCostCount = products.filter(p => !p.costo || p.costo <= 0).length;
            const valorInvertido = products.reduce((acc, p) => acc + (p.costo || 0) * getTotalStock(p.id), 0);
            return (
              <>
                {noCostCount > 0 && (
                  <button
                    onClick={() => { setShowNoCost(v => !v); setShowTopSellers(false); setShowLowStock(false); setShowOutStock(false); }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all hover:scale-[1.02] active:scale-95"
                    style={{
                      background: showNoCost ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.08)",
                      border: `1px solid ${showNoCost ? "rgba(239,68,68,0.5)" : "rgba(239,68,68,0.2)"}`,
                      color: "#EF4444",
                    }}
                    title="Productos sin costo registrado"
                  >
                    <DollarSign size={13} />
                    Sin costo
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-red-500 text-white">{noCostCount}</span>
                  </button>
                )}
                <button
                  onClick={() => { setShowTopSellers(v => !v); setShowLowStock(false); setShowOutStock(false); setShowNoCost(false); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all hover:scale-[1.02] active:scale-95"
                  style={{
                    background: showTopSellers ? "rgba(170,102,255,0.15)" : "rgba(170,102,255,0.08)",
                    border: `1px solid ${showTopSellers ? "rgba(170,102,255,0.5)" : "rgba(170,102,255,0.2)"}`,
                    color: "#AA66FF",
                  }}
                >
                  <TrendingUp size={13} />
                  Más vendidos
                </button>
                <div className="flex flex-col items-end shrink-0">
                  <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: T.textMuted }}>Valor invertido</p>
                  <p className="text-sm font-black" style={{ color: "#00CC66" }}>{fmt(valorInvertido)}</p>
                </div>
              </>
            );
          })()}
          {/* 'Buscar nuevos' comentado — React Query refetcha en background
              (refetchOnMount + refetchOnWindowFocus) y las mutaciones invalidan
              el cache. El cajero/gerente ve productos nuevos sin tener que
              forzar refresh manual. Decisión Joel 2026-05-21. */}
          {false && !isAdmin && (
            <button
              onClick={() => {
                void invalidateProducts();
                void invalidateMangas();
                toast.success("Buscando productos nuevos…");
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold transition-all hover:scale-[1.02] active:scale-95 shrink-0"
              style={{ ...T.glassMd, color: T.textMuted, borderRadius: 14 }}
              title="Forzar refresh para ver productos nuevos cargados por admin"
            >
              <RefreshCw size={14} />
              Buscar nuevos
            </button>
          )}
          <button
            onClick={handleCreateNew}
            className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-red-500/20 shrink-0"
            style={T.btnRed}
          >
            <Plus size={16} />
            Alta de Producto
          </button>
        </div>
      </div>

      {/* Page section tabs: Productos | Tomos + store filter */}
      <div className="flex items-center gap-2 mb-5">
        {([
          { id: 'productos' as const, label: 'Productos', icon: Package },
          { id: 'tomos' as const,    label: 'Tomos / Manga Nacional', icon: BookOpen },
        ]).map(s => (
          <button
            key={s.id}
            onClick={() => {
              setPageSection(s.id);
              if (s.id === 'tomos' && mangas.length === 0) void invalidateMangas();
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all"
            style={pageSection === s.id ? T.chipActive : { ...T.glassMd, color: T.textMuted }}
          >
            <s.icon size={15} />
            {s.label}
          </button>
        ))}
        {isAdmin && stores.length > 0 && (
          <select
            value={selectedStoreId ?? ''}
            onChange={e => setSelectedStoreId(e.target.value ? Number(e.target.value) : null)}
            className="ml-auto px-4 py-2.5 rounded-2xl text-sm font-bold outline-none shrink-0 transition-all focus:ring-1 focus:ring-red-500/30"
            style={{ ...T.input, minWidth: '160px' }}
          >
            <option value="">Todas las tiendas</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {pageSection === 'productos' && <>
      {/* Search + view toggle. Input scanner-ready: auto-focus al entrar, Enter
          limpia para preparar el siguiente escaneo, match contra nombre/SKU/barcode. */}
      <div className="flex flex-col md:flex-row items-center gap-4 mb-4">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: T.textMuted }} />
          <input
            type="text"
            placeholder="Escanea o busca · nombre, SKU o código de barras"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={e => {
              // Enter del scanner: NO borrar (antes se vaciaba el input y daba
              // sensación de "regresa todos"). Si no hay match, avisar al
              // usuario con toast claro mostrando el código que leyó.
              // Limpieza explícita: tecla Escape o botón ✕.
              if (e.key === "Enter") {
                const term = search.trim();
                if (term && filtered.length === 0) {
                  toast.warning(`No se encontró "${term}"`);
                }
              }
              if (e.key === "Escape") setSearch("");
            }}
            autoFocus
            className="w-full pl-11 pr-4 py-3 rounded-2xl text-sm outline-none transition-all focus:ring-1 focus:ring-red-500/30 shadow-inner"
            style={T.input}
          />
        </div>
        <div className="flex p-1 rounded-2xl shrink-0" style={{ background: PRODUCT_THEME.surfaceMuted, border: PRODUCT_THEME.borderSubtle }}>
          {(["list", "grid"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleViewMode(mode)}
              className="px-5 py-2 rounded-xl text-xs font-bold transition-all"
              style={viewMode === mode ? T.chipActive : { color: T.textMuted }}
            >
              {mode === "list" ? "Tabla" : "Cuadrícula"}
            </button>
          ))}
        </div>
      </div>

      {/* Result label + active filter chip */}
      <div className="flex items-center gap-3 mb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: T.textMuted }}>
          {showTopSellers ? `Top 50 Más Vendidos` : showOutStock ? "Productos Agotados" : showLowStock ? "Por Agotarse" : showNoCost ? "Sin Costo" : `${filtered.length} Productos`}
        </p>
        {selectedStoreId && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border" style={{ background: 'rgba(204,34,0,0.08)', border: '1px solid rgba(204,34,0,0.2)', color: T.redBright }}>
            {stores.find(s => s.id === selectedStoreId)?.name ?? 'Tienda'}
          </div>
        )}
        {(showTopSellers || showLowStock || showOutStock || showNoCost) && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setShowTopSellers(false); setShowLowStock(false); setShowOutStock(false); setShowNoCost(false); setSelectedForWhatsapp([]); }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all border border-red-500/20"
            >
              <X size={10} /> Quitar Filtro
            </button>
            {showLowStock && selectedForWhatsapp.length > 0 && (
              <button
                onClick={sendWhatsappReport}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-green-500 text-white hover:bg-green-600 transition-all shadow-lg shadow-green-500/20"
              >
                <MessageCircle size={12} /> WhatsApp ({selectedForWhatsapp.length})
              </button>
            )}
          </div>
        )}
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {filtered.map((p) => {
            const totalStock = getTotalStock(p.id);
            const totalComprometido = 0; // committed stock not available from inventory API yet
            const disponible = totalStock - totalComprometido;
            const priceRows = [
              { level: "a", price: p.precioA },
              { level: "b", price: p.precioB },
              { level: "c", price: p.precioC },
              { level: "d", price: p.precioD },
              { level: "e", price: p.precioE },
            ].filter((row): row is { level: "a" | "b" | "c" | "d" | "e"; price: number } => Number(row.price) > 0);
            const priceCount = priceRows.length;
            const lowStock = disponible > 0 && disponible <= 10 && !p.esUnico;
            const unicoLow = disponible > 0 && disponible <= 10 && p.esUnico;

            return (
              <div
                key={p.id}
                onClick={() => {
                  if (showLowStock) return handleToggleWhatsappSelection(p.id);
                  if (canEdit) return handleEdit(p);
                  return openProductDetails(p);
                }}
                className={`group relative rounded-[32px] overflow-hidden transition-all hover:translate-y-[-6px] cursor-pointer ${p.desactivado ? 'grayscale opacity-60' : ''} ${showLowStock && selectedForWhatsapp.includes(p.id) ? 'ring-4 ring-green-500' : ''}`}
                style={T.glassMd}
              >
                {/* Botón Stock — flotante, solo visible en hover. Detiene propagación
                    para que no abra el modal de edición completo. */}
                {canEdit && !showLowStock && (
                  <button
                    onClick={e => { e.stopPropagation(); setStockModalProduct({ id: p.id, name: p.nombre }); }}
                    className={`absolute bottom-2 left-2 z-20 flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${p.isAssigned === false ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    style={p.isAssigned === false
                      ? { background: "rgba(245,158,11,0.9)", color: "#fff", border: "1px solid rgba(245,158,11,0.5)" }
                      : { background: "rgba(16,185,129,0.85)", color: "#fff", border: "1px solid rgba(16,185,129,0.4)" }}
                    title={p.isAssigned === false ? "Agregar stock a esta tienda" : "Editar stock por tienda"}
                  >
                    <Warehouse size={11} />
                    {p.isAssigned === false ? "Agregar stock" : "Stock"}
                  </button>
                )}
                {p.imagen ? (
                  /* ── Con imagen ── */
                  <>
                    <div className="aspect-square relative overflow-hidden bg-black/20">
                      <img
                        src={p.imagen}
                        alt={p.nombre}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-60" />
                      <div className="absolute top-2 left-2 flex flex-col items-start gap-1 z-10">
                        {p.soloEfectivo && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#D97706] text-white">Solo Efectivo</span>}
                      </div>
                      <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10">
                        {p.isAssigned === false ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black text-white" style={{ background: 'rgba(245,158,11,0.9)' }}>No asignado</span>
                        ) : (<>
                          {disponible > 0 && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black text-white ${lowStock ? 'bg-red-600/90' : unicoLow ? 'bg-[#D97706]' : 'bg-black/65 backdrop-blur-md'}`}>
                              {disponible} disp.
                            </span>
                          )}
                          {unicoLow && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#D97706]/80 text-white">único</span>}
                          {disponible <= 0 && !p.esUnico && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-600/90 text-white">Sin Stock</span>}
                        </>)}
                      </div>
                    </div>
                    <div className="p-4 pt-3 flex flex-col gap-3">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: T.textMuted }}>{p.sku}</p>
                      <h3 className="font-black text-base leading-snug line-clamp-2 min-h-[2.75rem]" style={{ color: T.textPrimary }}>{p.nombre}</h3>
                      <div className="flex flex-col gap-2">
                        {priceRows.map(({ level, price }) => {
                          const rgb = PRICE_LEVEL_RGB[level];
                          return (
                            <div
                              key={`${p.id}-${level}`}
                              className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5"
                              style={{
                                background: `rgba(${rgb},0.10)`,
                                border: `1px solid rgba(${rgb},0.30)`,
                              }}
                            >
                              <span
                                className="text-[11px] font-black uppercase tracking-[0.14em]"
                                style={{ color: `rgba(${rgb},0.92)` }}
                              >
                                {PRICE_LEVEL_LABELS[level]}
                              </span>
                              <span className="text-[1.9rem] leading-none font-black tabular-nums" style={{ color: PRICE_LEVEL_COLORS[level] }}>
                                {fmt(price)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between pt-3" style={{ borderTop: PRODUCT_THEME.borderSubtle }}>
                        <div className="flex flex-wrap gap-1.5">
                          {priceCount > 1 && <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ border: PRODUCT_THEME.borderSubtle, color: T.textMuted, background: PRODUCT_THEME.surfaceSoft }}>{priceCount} precios</span>}
                          {p.categoria && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold truncate max-w-[120px]" style={{ border: PRODUCT_THEME.borderSubtle, color: T.textSecondary, background: PRODUCT_THEME.surfaceSoft }}>{p.categoria}</span>}
                        </div>
                        <div className="px-3 py-1 rounded-full text-[11px] font-black" style={{ background: lowStock ? T.redBright : unicoLow ? '#D97706' : "rgba(30,120,60,0.8)", color: "#fff" }}>{disponible} disp.</div>
                      </div>
                    </div>
                  </>
                ) : (
                  /* ── Sin imagen — layout compacto ── */
                  <div className="p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: T.textMuted }}>{p.sku}</p>
                        <h3 className="font-black text-base leading-snug line-clamp-3" style={{ color: T.textPrimary }}>{p.nombre}</h3>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <div className="px-2.5 py-1 rounded-full text-[10px] font-black" style={{ background: p.isAssigned === false ? "rgba(245,158,11,0.9)" : disponible <= 0 ? T.redBright : lowStock ? T.redBright : unicoLow ? "#D97706" : "rgba(30,120,60,0.8)", color: "#fff" }}>
                          {p.isAssigned === false ? "No asignado" : disponible <= 0 ? "Sin stock" : `${disponible} disp.`}
                        </div>
                        {unicoLow && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: '#FFAA00', background: 'rgba(255,170,0,0.12)', border: '1px solid rgba(255,170,0,0.25)' }}>único</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {p.soloEfectivo && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#D97706]/20 text-[#D97706]">Solo Efectivo</span>}
                      {priceCount > 1 && <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ border: PRODUCT_THEME.borderSubtle, color: T.textMuted, background: PRODUCT_THEME.surfaceSoft }}>{priceCount} precios</span>}
                    </div>
                    <div className="flex flex-col gap-2">
                      {priceRows.map(({ level, price }) => {
                        const rgb = PRICE_LEVEL_RGB[level];
                        return (
                          <div
                            key={`${p.id}-${level}`}
                            className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5"
                            style={{
                              background: `rgba(${rgb},0.10)`,
                              border: `1px solid rgba(${rgb},0.30)`,
                            }}
                          >
                            <span
                              className="text-[11px] font-black uppercase tracking-[0.14em]"
                              style={{ color: `rgba(${rgb},0.92)` }}
                            >
                              {PRICE_LEVEL_LABELS[level]}
                            </span>
                            <span className="text-[1.55rem] leading-none font-black tabular-nums" style={{ color: PRICE_LEVEL_COLORS[level] }}>
                              {fmt(price)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between pt-2" style={{ borderTop: PRODUCT_THEME.borderSubtle }}>
                      {p.categoria ? <span className="text-[10px] font-bold truncate max-w-[120px]" style={{ color: T.textMuted }}>{p.categoria}</span> : <span />}
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: T.textMuted }}>
                        {priceCount === 1 ? "1 precio" : `${priceCount} precios`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[32px] overflow-hidden shadow-2xl flex flex-col" style={T.glass}>
          {/* ── Table con sticky header. maxHeight calc para que el body
              scrollee dentro del card sin empujar paginación abajo. ── */}
          <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
            <table className="w-full text-left border-collapse">
              <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id} style={{ borderBottom: PRODUCT_THEME.borderSubtle, background: PRODUCT_THEME.tableHead }}>
                    {headerGroup.headers.map(header => (
                      <th
                        key={header.id}
                        className="px-6 py-5 text-[10px] font-black uppercase tracking-widest select-none whitespace-nowrap"
                        style={{
                          color: T.textMuted,
                          cursor: header.column.getCanSort() ? 'pointer' : 'default',
                          background: PRODUCT_THEME.tableHead,
                        }}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className="flex items-center gap-1.5">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            header.column.getIsSorted() === 'asc' ? (
                              <ArrowUp size={11} style={{ color: T.redBright }} />
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <ArrowDown size={11} style={{ color: T.redBright }} />
                            ) : (
                              <ArrowUpDown size={11} style={{ opacity: 0.3 }} />
                            )
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-16 text-center text-sm" style={{ color: T.textMuted }}>
                      {productsQuery.isFetching ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin" />
                          Actualizando catálogo…
                        </span>
                      ) : (
                        'No hay productos que coincidan con el filtro.'
                      )}
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map(row => (
                    <tr
                      key={row.id}
                      onClick={canEdit ? () => handleEdit(row.original) : () => openProductDetails(row.original)}
                      className="group transition-colors cursor-pointer"
                      style={{ borderBottom: PRODUCT_THEME.borderSubtle }}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-6 py-4">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          <div
            className="flex items-center justify-between px-6 py-4 gap-4 flex-wrap"
            style={{ borderTop: PRODUCT_THEME.borderSubtle, background: PRODUCT_THEME.tableFoot }}
          >
            <span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>
              {filtered.length} productos · página {table.getState().pagination.pageIndex + 1} de {Math.max(1, table.getPageCount())}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="p-2 rounded-xl transition-all disabled:opacity-30"
                style={SECONDARY_BUTTON}
                title="Primera página"
              >
                <ChevronsLeft size={15} />
              </button>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="p-2 rounded-xl transition-all disabled:opacity-30"
                style={SECONDARY_BUTTON}
                title="Página anterior"
              >
                <ChevronLeft size={15} />
              </button>

              {/* Page numbers */}
              {Array.from({ length: table.getPageCount() }, (_, i) => i)
                .filter(i => Math.abs(i - table.getState().pagination.pageIndex) <= 2)
                .map(i => (
                  <button
                    key={i}
                    onClick={() => table.setPageIndex(i)}
                    className="w-8 h-8 rounded-xl text-xs font-bold transition-all"
                    style={
                      i === table.getState().pagination.pageIndex
                        ? { background: T.redBright, color: '#fff' }
                        : { color: T.textMuted, background: 'transparent' }
                    }
                  >
                    {i + 1}
                  </button>
                ))}

              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="p-2 rounded-xl transition-all disabled:opacity-30"
                style={SECONDARY_BUTTON}
                title="Página siguiente"
              >
                <ChevronRight size={15} />
              </button>
              <button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="p-2 rounded-xl transition-all disabled:opacity-30"
                style={SECONDARY_BUTTON}
                title="Última página"
              >
                <ChevronsRight size={15} />
              </button>

              <select
                value={table.getState().pagination.pageSize}
                onChange={e => table.setPageSize(Number(e.target.value))}
                className="ml-2 px-2 py-1 rounded-xl text-xs font-bold outline-none"
                style={T.input}
              >
                {[10, 20, 50, 100].map(size => (
                  <option key={size} value={size}>{size} / página</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (() => {
        const close = () => { if (!deleteLoading) { setDeleteTarget(null); setDeleteMode("soft"); setForceConfirmText(""); } };
        const isForce = deleteMode === "force";
        const forceConfirmed = !isForce || forceConfirmText.trim().toLowerCase() === deleteTarget.nombre.trim().toLowerCase();
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={close} />
            <div className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl transition-all" style={{ background: "var(--td-panel-bg)", border: `1px solid ${isForce ? 'rgba(239,68,68,0.7)' : 'rgba(239,68,68,0.3)'}` }}>
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 animate-pulse" style={{ background: isForce ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.12)' }}>
                  <AlertTriangle size={26} className="text-red-400" />
                </div>
                <div>
                  <h3 className="font-black text-lg uppercase tracking-wider" style={{ color: T.textPrimary }}>
                    {isForce ? '⚠️ Borrado total' : 'Eliminar producto'}
                  </h3>
                  <p className="text-xs mt-1" style={{ color: T.textSecondary }}>Esta acción <span className="text-red-400 font-bold">NO se puede deshacer</span>.</p>
                </div>
              </div>

              <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p className="font-bold text-sm" style={{ color: T.textPrimary }}>{deleteTarget.nombre}</p>
                <p className="text-[10px] mt-0.5" style={{ color: T.textSecondary }}>SKU: {deleteTarget.sku || "—"}</p>
              </div>

              {/* Radio: elegir modo */}
              <div className="space-y-2 mb-4">
                <label className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all ${!isForce ? 'bg-amber-500/10 border border-amber-500/30' : ''}`} style={!isForce ? undefined : { background: PRODUCT_THEME.surfaceMuted, border: PRODUCT_THEME.borderSubtle }}>
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={!isForce}
                    onChange={() => { setDeleteMode("soft"); setForceConfirmText(""); }}
                    disabled={deleteLoading}
                    className="mt-0.5 accent-amber-500"
                  />
                  <div className="flex-1">
                    <p className="font-black text-sm" style={{ color: T.textPrimary }}>Solo el producto</p>
                    <p className="text-[11px] mt-0.5" style={{ color: T.textSecondary }}>
                      Elimina imágenes, inventario y precios. <strong className="text-amber-400">Si tiene ventas o apartados activos, fallará</strong> y tendrás que cambiar a "Borrar TODO".
                    </p>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all ${isForce ? 'bg-red-500/10 border border-red-500/40' : ''}`} style={isForce ? undefined : { background: PRODUCT_THEME.surfaceMuted, border: PRODUCT_THEME.borderSubtle }}>
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={isForce}
                    onChange={() => setDeleteMode("force")}
                    disabled={deleteLoading}
                    className="mt-0.5 accent-red-500"
                  />
                  <div className="flex-1">
                    <p className="font-black text-sm" style={{ color: T.textPrimary }}>⚠️ Borrar TODO (también ventas e historial)</p>
                    <p className="text-[11px] mt-0.5" style={{ color: T.textSecondary }}>
                      Borra el producto Y todo lo relacionado: <strong className="text-red-400">ventas históricas, apartados, traspasos, inventario y precios</strong>. Datos contables se perderán.
                    </p>
                  </div>
                </label>
              </div>

              {/* Confirmación tipeada para modo force */}
              {isForce && (
                <div className="mb-4">
                  <p className="text-[11px] font-bold text-red-400 mb-2 uppercase tracking-wider">
                    Para confirmar, tipea el nombre del producto:
                  </p>
                  <input
                    type="text"
                    value={forceConfirmText}
                    onChange={e => setForceConfirmText(e.target.value)}
                    placeholder={deleteTarget.nombre}
                    disabled={deleteLoading}
                    className="w-full px-3 py-2 rounded-xl text-sm font-bold border outline-none transition-all"
                    style={{ ...T.input, borderColor: forceConfirmed ? '#10b981' : 'rgba(239,68,68,0.4)', color: forceConfirmed ? '#10b981' : T.textPrimary }}
                  />
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={close}
                  disabled={deleteLoading}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
                  style={SECONDARY_BUTTON}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteProduct}
                  disabled={deleteLoading || !forceConfirmed}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  style={{ background: isForce ? '#b91c1c' : '#ef4444' }}
                >
                  {deleteLoading ? <><Loader2 size={14} className="animate-spin" /> Eliminando…</> : isForce ? '🗑 Borrar TODO' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      </>}

      {/* ── Tomos / Manga section ──────────────────────────────────────── */}
      {pageSection === 'tomos' && (
        <>
          {/* Tomos header row */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: T.textMuted }}>
              {filteredMangas.length} tomo{filteredMangas.length !== 1 ? 's' : ''}
            </p>
            {canEdit && (
              <button
                onClick={() => setShowMangaModal(true)}
                className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-red-500/20"
                style={T.btnRed}
              >
                <Plus size={15} />
                Alta de Tomos
              </button>
            )}
          </div>

          {/* Search bar — scanner-ready: enfoca al entrar y Enter limpia para
              el siguiente escaneo. Match contra serie/editorial/género/ISBN/barcode. */}
          <div className="flex flex-col md:flex-row items-center gap-4 mb-4">
            <div className="relative flex-1 w-full">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: T.textMuted }} />
              <input
                type="text"
                placeholder="Escanea o busca · serie, editorial, género, ISBN"
                value={mangaSearch}
                onChange={e => setMangaSearch(e.target.value)}
                onKeyDown={e => {
                  // Enter NO borra (antes vaciaba y daba sensación de "regresa
                  // todos"). Si no hay match avisar con el código que leyó.
                  if (e.key === "Enter") {
                    const term = mangaSearch.trim();
                    if (term && filteredMangas.length === 0) {
                      toast.warning(`No se encontró "${term}"`);
                    }
                  }
                  if (e.key === "Escape") setMangaSearch("");
                }}
                autoFocus
                className="w-full pl-11 pr-4 py-3 rounded-2xl text-sm outline-none transition-all focus:ring-1 focus:ring-red-500/30 shadow-inner"
                style={T.input}
              />
            </div>
          </div>

          {mangasLoading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 size={20} className="animate-spin" style={{ color: T.redBright }} />
              <span className="text-sm" style={{ color: T.textMuted }}>Cargando tomos…</span>
            </div>
          ) : (
            <div className="rounded-[32px] overflow-hidden shadow-2xl flex flex-col" style={T.glass}>
              <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
                <table className="w-full text-left border-collapse">
                  <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                    {mangaTable.getHeaderGroups().map(hg => (
                      <tr key={hg.id} style={{ borderBottom: PRODUCT_THEME.borderSubtle, background: PRODUCT_THEME.tableHead }}>
                        {hg.headers.map(header => (
                          <th
                            key={header.id}
                            className="px-6 py-5 text-[10px] font-black uppercase tracking-widest select-none whitespace-nowrap"
                            style={{ color: T.textMuted, cursor: header.column.getCanSort() ? 'pointer' : 'default', background: PRODUCT_THEME.tableHead }}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <div className="flex items-center gap-1.5">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {header.column.getCanSort() && (
                                header.column.getIsSorted() === 'asc' ? <ArrowUp size={11} style={{ color: T.redBright }} />
                                : header.column.getIsSorted() === 'desc' ? <ArrowDown size={11} style={{ color: T.redBright }} />
                                : <ArrowUpDown size={11} style={{ opacity: 0.3 }} />
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {mangaTable.getRowModel().rows.length === 0 ? (
                      <tr>
                        <td colSpan={mangaColumns.length} className="px-6 py-16 text-center text-sm" style={{ color: T.textMuted }}>
                          {mangasQuery.isFetching ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 size={14} className="animate-spin" />
                              Actualizando tomos…
                            </span>
                          ) : mangas.length === 0 ? 'No hay tomos registrados aún.' : 'Sin resultados para esa búsqueda.'}
                        </td>
                      </tr>
                    ) : (
                      mangaTable.getRowModel().rows.map(row => (
                        <tr
                          key={row.id}
                          className="group transition-colors cursor-pointer"
                          style={{ borderBottom: PRODUCT_THEME.borderSubtle }}
                          onClick={() => canEdit ? setEditingManga(row.original) : openMangaDetails(row.original)}
                        >
                          {row.getVisibleCells().map(cell => (
                            <td key={cell.id} className="px-6 py-4">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination — idéntica a productos */}
              <div className="flex items-center justify-between px-6 py-4 gap-4 flex-wrap" style={{ borderTop: PRODUCT_THEME.borderSubtle, background: PRODUCT_THEME.tableFoot }}>
                <span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>
                  {filteredMangas.length} tomos · página {mangaTable.getState().pagination.pageIndex + 1} de {Math.max(1, mangaTable.getPageCount())}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => mangaTable.setPageIndex(0)} disabled={!mangaTable.getCanPreviousPage()} className="p-2 rounded-xl transition-all disabled:opacity-30" style={SECONDARY_BUTTON}><ChevronsLeft size={15} /></button>
                  <button onClick={() => mangaTable.previousPage()} disabled={!mangaTable.getCanPreviousPage()} className="p-2 rounded-xl transition-all disabled:opacity-30" style={SECONDARY_BUTTON}><ChevronLeft size={15} /></button>
                  {Array.from({ length: mangaTable.getPageCount() }, (_, i) => i)
                    .filter(i => Math.abs(i - mangaTable.getState().pagination.pageIndex) <= 2)
                    .map(i => (
                      <button key={i} onClick={() => mangaTable.setPageIndex(i)} className="w-8 h-8 rounded-xl text-xs font-bold transition-all"
                        style={i === mangaTable.getState().pagination.pageIndex ? { background: T.redBright, color: '#fff' } : { color: T.textMuted }}>
                        {i + 1}
                      </button>
                    ))}
                  <button onClick={() => mangaTable.nextPage()} disabled={!mangaTable.getCanNextPage()} className="p-2 rounded-xl transition-all disabled:opacity-30" style={SECONDARY_BUTTON}><ChevronRight size={15} /></button>
                  <button onClick={() => mangaTable.setPageIndex(mangaTable.getPageCount() - 1)} disabled={!mangaTable.getCanNextPage()} className="p-2 rounded-xl transition-all disabled:opacity-30" style={SECONDARY_BUTTON}><ChevronsRight size={15} /></button>
                  <select value={mangaTable.getState().pagination.pageSize} onChange={e => mangaTable.setPageSize(Number(e.target.value))} className="ml-2 px-2 py-1 rounded-xl text-xs font-bold outline-none" style={T.input}>
                    {[10, 20, 50].map(s => <option key={s} value={s}>{s} / página</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showTypeSelector && (
        <ProductTypeSelectorModal
          onClose={() => setShowTypeSelector(false)}
          onSelectNormal={() => {
            setShowTypeSelector(false);
            setEditingProduct(undefined);
            setIsModalOpen(true);
          }}
          onSelectManga={() => {
            setShowTypeSelector(false);
            setShowMangaModal(true);
          }}
        />
      )}

      {isModalOpen && (
        <ProductModal
          isAdmin={isAdmin}
          canViewCost={canViewCost}
          canManage={canManage}
          onClose={() => { setIsModalOpen(false); setEditingProduct(undefined); }}
          onSave={handleSaveProduct}
          onDelete={(p) => setDeleteTarget(p)}
          {...(editingProduct !== undefined ? { product: editingProduct } : {})}
          categorias={categorias}
          onAddCategoria={(c) => { void handleAddCategoria(c); }}
          proveedores={proveedores}
          onAddProveedor={(p) => { void handleAddProveedor(p); }}
          locations={locations}
        />
      )}

      {viewingProduct && (
        <ProductDetailModal
          product={viewingProduct}
          stock={getTotalStock(viewingProduct.id)}
          storeLabel={storeLabel}
          canViewCost={canViewCost}
          highlightStoreId={user?.store_id}
          onClose={() => setViewingProduct(null)}
          canNotify={canNotify}
          sending={alertingKey === `product:${viewingProduct.id}`}
          notified={!!notifiedKeys[`product:${viewingProduct.id}`]}
          onNotify={() => void handleNotify(viewingProduct.id, getTotalStock(viewingProduct.id), "product", viewingProduct.nombre)}
        />
      )}

      {showMangaModal && (
        <MangaBatchModal
          onClose={() => setShowMangaModal(false)}
          onSuccess={() => {
            // Post-unificación: los mangas viven en `products` con type='manga'.
            // Invalidamos AMBOS caches: el legacy de mangas (tab Tomos) y el de
            // products (Caja/scan/catálogo lo necesitan para ver el manga nuevo).
            void invalidateMangas();
            void invalidateProducts();
            toast.success('Tomos registrados correctamente');
            setPageSection('tomos');
          }}
          locations={locations}
          canViewCost={canViewCost}
        />
      )}

      {viewingManga && (
        <MangaDetailModal
          manga={viewingManga}
          storeLabel={storeLabel}
          canViewCost={canViewCost}
          highlightStoreId={user?.store_id}
          onClose={() => setViewingManga(null)}
          canNotify={canNotify}
          sending={alertingKey === `manga:${viewingManga.id}`}
          notified={!!notifiedKeys[`manga:${viewingManga.id}`]}
          onNotify={() => void handleNotify(viewingManga.id, viewingManga.stock ?? 0, "manga", viewingManga.name)}
        />
      )}

      {editingManga && (
        <MangaEditModal
          manga={editingManga}
          onClose={() => setEditingManga(null)}
          onSuccess={_updated => {
            void invalidateMangas();
            void invalidateProducts();
            setEditingManga(null);
            toast.success('Tomo actualizado.');
          }}
          onDeleted={() => {
            void invalidateMangas();
            void invalidateProducts();
            setEditingManga(null);
            toast.success('Tomo eliminado.');
          }}
          canViewCost={canViewCost}
          isAdmin={isAdmin}
          locations={locations}
        />
      )}

      {/* Modal rápido de stock por tienda (productos o tomos/mangas). */}
      {stockModalProduct && (
        <QuickStockModal
          productId={stockModalProduct.id}
          productName={stockModalProduct.name}
          kind={stockModalProduct.kind ?? "product"}
          onClose={() => setStockModalProduct(null)}
        />
      )}

    </div>
  );
}
