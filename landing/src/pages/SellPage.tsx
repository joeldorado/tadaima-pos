import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, ShoppingBag, X, Plus, Minus, Check, SlidersHorizontal,
  ScanLine, Zap, Loader2, Settings2, Smartphone,
  AlertTriangle, ArrowLeftRight, Maximize2, LayoutGrid,
  Tag, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, ArrowLeft, CreditCard, DollarSign,
  Users, UserPlus, User, Phone, AlertCircle,
  Mail,
  TriangleAlert, PackageX, Bookmark, Calendar, PackageCheck, ClipboardList, Banknote,
  Truck, CheckCircle2, Printer, History, Receipt, RefreshCw,
  ShoppingCart, Crown, Circle, Trash2, XCircle, Clock, Bell,
} from "lucide-react";
import { ImageWithFallback } from "@/components/figma/ImageWithFallback";
import { UserAvatar } from "@/components/UserAvatar";
import { ProductCatalogModal } from "@/components/ProductCatalogModal";
import { PreSaleDifusionPanel } from "@/components/presales/PreSaleDifusionPanel";
import { CameraScannerModal } from "@/components/CameraScannerModal";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useViewportMaxHeight } from "@/hooks/useViewportMaxHeight";
import { PaymentRestrictionBadge, getPayRestriction } from "@/components/ui/PaymentRestrictionBadge";
const tadaimaLogo = null // TODO: replace with real logo asset
import { toast } from "sonner";
import { getDraft, createDraft, addDraftItem, updateDraftItem, removeDraftItem, cancelDraft, createSale, getPrice, openSession, closeSession, forceCloseSession, getActiveSession, createLayaway, getCustomers, createCustomer, searchExternalCustomers, lookupCardCode, getInventory, getPreSaleCatalogs, getPreSaleOrder, createPreSaleOrder, addPreSaleOrderPayment, updatePreSaleOrderStatus, markPreSaleOrderItemDelivered, getPreSaleOrders, getSales, getProductsLight, storageUrl, getCashReport, sendPreSaleAssignAlert } from "@tadaima/api";
import type { OpenSessionConflict } from "@tadaima/api";
import type { CashSessionReport } from "@tadaima/api";
import { CashCloseSummaryModal } from "@/components/cash/CashCloseSummaryModal";
import { CortesModal } from "@/components/cash/CortesModal";
import { OpenSessionConflictModal } from "@/components/cash/OpenSessionConflictModal";
import { useQueryClient } from "@tanstack/react-query";
import { useProductsLightQuery, useProductsSearchQuery } from "@/hooks/queries/useProducts";
// ADR-014: useReservedStockQuery removido — carrito client-side, sin polling.
import { usePaymentMethodsQuery } from "@/hooks/queries/usePaymentMethods";
import { useTerminalsQuery } from "@/hooks/queries/useTerminals";
import { useActiveSessionQuery, useCashRegistersQuery, useActiveSessionsQuery } from "@/hooks/queries/useCashSession";
import { useOnlineUsersQuery } from "@/hooks/queries/useUsers";
import { useExchangeRateQuery } from "@/hooks/queries/useSystemSettings";
import { usePreSaleCatalogsQuery, usePreSaleOrdersQuery } from "@/hooks/queries/usePreSales";
import { useCustomersAllQuery } from "@/hooks/queries/useCustomers";
import { useTodayHistorialQuery } from "@/hooks/queries/useHistorial";
import { queryKeys } from "@/lib/queryKeys";
import { prependSaleToSalesCaches, prependPreSaleOrderToCaches, patchPreSaleOrderInCaches, decrementProductStockInCaches, invalidateAfterSale } from "@/lib/optimisticSale";
import { getTodayLocal } from "@/lib/date";
import { isValidEmail, isValidPhone } from "@/lib/validation";
import { PRICE_LEVEL_LABELS, PRICE_LEVEL_COLORS, PRICE_LEVEL_RGB } from "@/lib/priceLevels";
import type { CashSession, CashRegisterInfo, PaymentMethod as ApiPaymentMethod, PreSaleCatalog, PreSaleOrder, PreSaleOrderItem, SaleDetail, Terminal, ExternalCardLookup } from "@tadaima/api";
import type { HistorialEntry } from "@/hooks/queries/useHistorial";
import { useCartDraftStore } from "@/stores/cartDraftStore";
import { useActiveStore } from "@/contexts/StoreContext";
import { useAuth } from "@tadaima/auth";
import { isAdmin as isAdminRole } from "@/lib/permisos";
import { CancelTicketModal } from "@/components/cancel/CancelTicketModal";
import { motion as Motion, AnimatePresence } from "motion/react";

// API_BASE removed — using @tadaima/api (Laravel backend)

// ─── Types ────────────────────────────────────────────────────────────────────
type PriceLevel = "a" | "b" | "c" | "d" | "e";
type PaymentMethod = "Efectivo" | "Dólares" | "Tarjeta" | "Transferencia";

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  image?: string;
  price_a: number;
  price_b?: number;
  price_c?: number;
  price_d?: number;
  price_e?: number;
  stock?: number;
  stock_damaged?: number;
  stock_details?: {
    tienda: number;
    bodega: number;
    preventa: number;
    dañado: number;
  };
  payment_restriction?: string;
  allow_cash?: boolean;
  allow_card?: boolean;
  active?: boolean;
  product_type?: string;
  volume_number?: number | null;
}

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  points?: number;
  external_member_id?: string;
}

interface CartItem {
  product: Product;
  quantity: number;
  priceLevel: PriceLevel;
  isDamaged?: boolean;
  damagedPrice?: number;
  depositAmount?: number;
  isFromPreSale?: boolean;
  preSaleOrderItemId?: number; // id del PreSaleOrderItem en backend
  preSaleItemDelivered?: boolean;
  sellingCatalogId?: number; // ID del PreSaleCatalog que se está reservando
  unitLimit?: number; // límite de unidades por cliente (catálogo.preorder_limit)
  syncError?: boolean; // true si addDraftItem/updateDraftItem falló — bloquea checkout
}

interface Mesa {
  id: string;
  name: string;
  items: CartItem[];
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  isNewCustomer?: boolean;
  discount: number;
  paymentMethod: PaymentMethod;
  isPreventa: boolean;
  depositAmount: number;
  selectedTerminalId?: number;
  // La tienda SIEMPRE absorbe la comisión de tarjeta — campo conservado
  // por compatibilidad con código viejo, pero ya no se usa en cálculos.
  absorbCommission?: boolean;
  loadedPreSaleOrderId?: number; // folio de preventa cargado para liquidar en caja
  loadedPreSaleOrderCode?: string; // código PREV-XXXXX del folio cargado, para ticket
  // Lo que el cliente entregó en esta caja. Persiste por mesa: al cambiar entre
  // Caja 1/2/3 cada una recuerda su propio efectivo recibido (fix 2026-05-27).
  cashReceived?: string;
  // Dólares físicos recibidos (input híbrido). Reemplaza al método "Dólares"
  // del dropdown — el cobro siempre es Efectivo, y el cajero declara cuántos
  // USD entraron físicamente para calcular el faltante en pesos.
  cashReceivedUsd?: string;
  // true cuando el cajero activó "+ Dólares" en esta mesa. Default false → cada
  // venta nueva inicia en pesos (decisión Joel 2026-05-28).
  usdPrimaryMode?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n || 0);

const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  }).format(n || 0);

function getItemPrice(item: CartItem): number {
  const { product: p, priceLevel } = item;
  let base = p.price_a || 0;
  if (priceLevel === "b" && p.price_b) base = p.price_b;
  if (priceLevel === "c" && p.price_c) base = p.price_c;
  if (priceLevel === "d" && p.price_d) base = p.price_d;
  if (priceLevel === "e" && p.price_e) base = p.price_e;
  if (item.isDamaged && item.damagedPrice !== undefined && item.damagedPrice >= 0) {
    return item.damagedPrice;
  }
  return base;
}

function getPriceLevels(p: Product) {
  const levels: { level: PriceLevel; label: string; price: number }[] = [
    { level: "a", label: PRICE_LEVEL_LABELS.a, price: p.price_a || 0 },
  ];
  if (p.price_b && p.price_b > 0) levels.push({ level: "b", label: PRICE_LEVEL_LABELS.b, price: p.price_b });
  if (p.price_c && p.price_c > 0) levels.push({ level: "c", label: PRICE_LEVEL_LABELS.c, price: p.price_c });
  if (p.price_d && p.price_d > 0) levels.push({ level: "d", label: PRICE_LEVEL_LABELS.d, price: p.price_d });
  if (p.price_e && p.price_e > 0) levels.push({ level: "e", label: PRICE_LEVEL_LABELS.e, price: p.price_e });
  return levels;
}

function countPrices(p: Product): number {
  let n = 1;
  if (p.price_b && p.price_b > 0) n++;
  if (p.price_c && p.price_c > 0) n++;
  if (p.price_d && p.price_d > 0) n++;
  if (p.price_e && p.price_e > 0) n++;
  return n;
}

function toArray<T>(val: unknown): T[] {
  return Array.isArray(val) ? (val as T[]) : [];
}

// ─── Normalizador de producto ─────────────────────────────────────────────────
function normalizeProduct(raw: any): Product {
  let stock: number | undefined;
  let stock_details = { tienda: 0, bodega: 0, preventa: 0, dañado: 0 };

  if (Array.isArray(raw.stockUbicaciones) && raw.stockUbicaciones.length > 0) {
    stock = raw.stockUbicaciones.reduce(
      (s: number, u: any) => s + (u.detalle?.tienda ?? u.detalle?.disponibleVenta ?? 0),
      0
    );
    raw.stockUbicaciones.forEach((u: any) => {
      stock_details.tienda   += (u.detalle?.tienda ?? u.detalle?.disponibleVenta ?? 0);
      stock_details.bodega   += (u.detalle?.bodega ?? 0);
      stock_details.preventa += (u.detalle?.preventa ?? 0);
      stock_details.dañado   += (u.detalle?.dañado ?? u.detalle?.danado ?? 0);
    });
  } else if (typeof raw.stock === "number") {
    stock = raw.stock;
    stock_details.tienda = raw.stock;
  }

  return {
    id:                   raw.id,
    name:                 raw.nombre       ?? raw.name       ?? "",
    sku:                  raw.sku          ?? "",
    category:             raw.categoria    ?? raw.category   ?? "",
    image:                raw.imagen       ?? raw.image      ?? "",
    price_a:              raw.precioA      ?? raw.price_a    ?? 0,
    price_b:              raw.precioB      ?? raw.price_b,
    price_c:              raw.precioC      ?? raw.price_c,
    stock,
    stock_damaged:        stock_details.dañado,
    stock_details,
    active:               raw.desactivado  !== undefined ? !raw.desactivado : (raw.active ?? true),
    payment_restriction:  (raw.soloEfectivo || raw.payment_restriction === "cash_only")
                            ? "cash_only" : undefined,
    allow_cash:           raw.allow_cash ?? raw.allowCash ?? true,
    allow_card:           raw.allow_card ?? raw.allowCard ?? true,
  };
}

let _mc = 2;
// Tab 1 → "Caja Principal" (el turno del cajero), tabs 2..5 → "Venta N"
// (ventas paralelas para atender múltiples clientes a la vez).
const mesaLabel = (n: number): string => (n === 1 ? "Caja Principal" : `Venta ${n}`);
const makeMesa = (n?: number): Mesa => {
  const num = n !== undefined ? n : _mc++;
  return {
    id: `mesa-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: mesaLabel(num),
    items: [],
    discount: 0,
    paymentMethod: "Efectivo",
    isPreventa: false,
    depositAmount: 0,
    absorbCommission: true, // tienda siempre absorbe — nunca se cobra al cliente
    cashReceived: "",
    cashReceivedUsd: "",
    usdPrimaryMode: false,
  };
};

// ─── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "var(--td-page-bg)";
const PANEL  = "var(--td-panel-bg)";
const BORDER = "1px solid var(--td-panel-border)";
const RED    = "var(--td-red)";
const CARD   = "var(--td-card-bg)";
const CARD_B = "1px solid var(--td-card-border)";
const SOFT   = "var(--td-surface-soft)";
const MUTED  = "var(--td-surface-muted)";
const STRONG = "var(--td-surface-strong)";
const THI    = "var(--td-text-hi)";
const TMD    = "var(--td-text-md)";
const TLO    = "var(--td-text-lo)";

// ─── Component ────────────────────────────────────────────────────────────────
export function SellPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Usa el helper central: antes `includes("admin")` no detectaba
  // super_admin/owner/dueño y un dueño no veía el panel de cambiar tienda.
  const isAdmin = isAdminRole(user?.roles);
  const { activeStore, stores, setActiveStore, isLoading: storeLoading } = useActiveStore();

  const draftStore = useCartDraftStore();
  // Hidratar mesas desde snapshot persistido (sobrevive navegación entre páginas).
  // Si el snapshot está vacío/corrupto, arrancar con una mesa nueva.
  const initialMesas = useRef<Mesa[]>(
    (() => {
      const snap = draftStore.mesasSnapshot;
      if (Array.isArray(snap) && snap.length > 0) {
        // Normaliza labels antiguos ("Caja 1..5") al nuevo esquema
        // ("Caja Principal" / "Venta 2..5"). Preserva los items intactos.
        return (snap as Mesa[]).map((m, idx) => ({ ...m, name: mesaLabel(idx + 1) }));
      }
      return [makeMesa(1)];
    })()
  );
  const initialActiveId = useRef<string>(
    draftStore.activeMesaIdSnapshot ?? initialMesas.current[0].id
  );
  // Prevents concurrent createDraft calls for the same mesa
  const pendingDraftRef = useRef<Record<string, Promise<number>>>({});
  // Trackea addDraftItem en vuelo por mesa+producto. changeQty espera estos antes
  // de leer el itemId — evita el toast "Sincronizando…" cuando el usuario clickea
  // "+" rápido tras agregar el producto (race entre optimistic UI y respuesta server).
  const pendingItemAddRef = useRef<Record<string, Promise<number>>>({});
  // Prevents double-submit on checkout
  const isCheckoutLockedRef = useRef(false);

  const queryClient = useQueryClient();
  // Estados de modal declarados ANTES de las queries para condicionar el
  // polling (Joel 2026-06-12): el cajero solo pollea catálogo/preventas
  // mientras la ventana correspondiente está ABIERTA — al cerrarla se apaga.
  const [showCatalog, setShowCatalog] = useState(false);
  const [showPreSalesModal, setShowPreSalesModal] = useState(false);
  const LIVE_POLL_MS = 20_000;
  // IMPORTANTE: pasar activeStore.id para que el endpoint retorne stock POR TIENDA.
  // Sin esto, `stock_total` viene global (sumando todas las tiendas) y el cajero ve
  // 10 unidades en el catálogo cuando en su tienda hay 0 — al cobrar el backend
  // rechaza con "Stock insuficiente: Disponible 0".
  const productsQuery       = useProductsLightQuery(activeStore?.id, {
    refetchIntervalMs: showCatalog ? LIVE_POLL_MS : false,
  });
  // Decisión 2026-05-28 (Joel): quitado el prefetch agresivo de páginas 2..6
  // (`useBackgroundProductsPrefetch`). Antes traía 1000 productos extra al
  // abrir caja. Ahora solo top-200 + búsqueda server-side bajo demanda.
  // Invalidaciones tras venta refrescan cache automáticamente en bg.
  const paymentMethodsQuery = usePaymentMethodsQuery({ active: true });

  // Preventas cacheadas con React Query — antes openPreSalesModal hacía 2 fetches
  // cada vez que el cajero clickeaba "Preventas". Ahora se cargan una vez (al
  // montar SellPage) y se mantienen en cache. Botón "Actualizar" del SellPage
  // y handleOpenCash invalidan para forzar refetch.
  const preSaleCatalogsQuery = usePreSaleCatalogsQuery(
    { status: 'published', per_page: 200 },
    { refetchIntervalMs: showPreSalesModal ? LIVE_POLL_MS : false },
  );
  const preSaleOrdersQuery   = usePreSaleOrdersQuery(
    { per_page: 200 },
    { refetchIntervalMs: showPreSalesModal ? LIVE_POLL_MS : false },
  );

  // Clientes locales cacheados 1h. Filtro local instantáneo, Supabase como fallback.
  const customersAllQuery = useCustomersAllQuery(500);
  const allLocalCustomers = customersAllQuery.data ?? [];

  // Adapter: raw API → Customer del UI. Memoizado para no recrear array en cada render.
  const localCustomersUi: Customer[] = useMemo(() =>
    allLocalCustomers.map(c => ({
      id: String(c.id),
      name: c.name,
      phone: c.phone ?? undefined,
      email: c.email ?? undefined,
      points: c.points,
      external_member_id: c.external_member_id ?? undefined,
    })),
  [allLocalCustomers]);

  // Filtro client-side por nombre/teléfono/correo/external_member_id.
  const filterLocalCustomers = useCallback((q: string): Customer[] => {
    const term = q.trim().toLowerCase();
    if (!term) return localCustomersUi.slice(0, 50);
    return localCustomersUi.filter(c =>
      c.name.toLowerCase().includes(term) ||
      (c.phone ?? "").toLowerCase().includes(term) ||
      (c.email ?? "").toLowerCase().includes(term) ||
      (c.external_member_id ?? "").toLowerCase().includes(term)
    );
  }, [localCustomersUi]);
  const terminalsQuery      = useTerminalsQuery(
    activeStore?.id ? { store_id: activeStore.id, active: true } : undefined,
    { enabled: !!activeStore?.id }
  );
  const activeSessionQuery  = useActiveSessionQuery();
  const cashSession: CashSession | null = activeSessionQuery.data ?? null;
  const cashRegistersQuery  = useCashRegistersQuery(activeStore?.id, { enabled: !cashSession });
  const cashRegisters: CashRegisterInfo[] = cashRegistersQuery.data ?? [];
  // Sesiones abiertas en la tienda activa — solo el admin las muestra en la
  // pantalla "Caja cerrada" para saber quién está activo (cajero o gerente).
  const activeSessionsQuery = useActiveSessionsQuery(activeStore?.id ?? null, {
    enabled: !cashSession && !!activeStore?.id && isAdmin,
  });
  const activeSessionsInStore = activeSessionsQuery.data ?? [];

  // Sesiones abiertas TODAS las tiendas — admin las usa en el selector de
  // tienda para ver de un vistazo cuántos cajeros están activos en cada
  // sucursal antes de elegir. Solo se activa cuando admin aún no eligió tienda.
  const allActiveSessionsQuery = useActiveSessionsQuery(null, {
    enabled: !activeStore && isAdmin,
  });
  const allActiveSessions = allActiveSessionsQuery.data ?? [];
  // Map store_id -> { count, names[] } para renderizar badges + tooltip
  const activeSessionsByStore = useMemo(() => {
    const m = new Map<number, { count: number; sessions: typeof allActiveSessions }>();
    for (const s of allActiveSessions) {
      if (!s.store_id) continue;
      const entry = m.get(s.store_id) ?? { count: 0, sessions: [] };
      entry.count++;
      entry.sessions.push(s);
      m.set(s.store_id, entry);
    }
    return m;
  }, [allActiveSessions]);

  // Usuarios conectados (last_seen_at < 2 min) en TODAS las tiendas — admin
  // los usa en el selector para distinguir "logueado pero sin caja" de "caja
  // abierta vendiendo". Mismo query también se reusa en la pantalla Caja cerrada.
  const allOnlineUsersQuery = useOnlineUsersQuery(null, {
    enabled: !activeStore && isAdmin,
  });
  const allOnlineUsers = allOnlineUsersQuery.data ?? [];
  const onlineByStore = useMemo(() => {
    const m = new Map<number, typeof allOnlineUsers>();
    for (const u of allOnlineUsers) {
      if (!u.store_id) continue;
      const arr = m.get(u.store_id) ?? [];
      arr.push(u);
      m.set(u.store_id, arr);
    }
    return m;
  }, [allOnlineUsers]);

  // Usuarios conectados de la tienda activa — para mostrar en "Caja cerrada"
  // junto a las sesiones abiertas.
  const onlineUsersInStoreQuery = useOnlineUsersQuery(activeStore?.id ?? null, {
    enabled: !cashSession && !!activeStore?.id && isAdmin,
  });
  const onlineUsersInStore = onlineUsersInStoreQuery.data ?? [];
  const paymentMethods: ApiPaymentMethod[] = paymentMethodsQuery.data ?? [];
  const terminals: Terminal[] = terminalsQuery.data ?? [];

  const topProducts: Product[] = useMemo(() => {
    const list = productsQuery.data?.data ?? [];
    const priceAt = (p: typeof list[number], level: 1 | 2 | 3 | 4 | 5): number =>
      Number(p.prices?.[`price_${level}` as keyof typeof p.prices] ?? 0) || 0;
    return list
      .filter(p => p.active)
      .map(p => {
        return {
          id: String(p.id),
          name: p.name,
          sku: p.sku,
          barcode: p.barcode ?? undefined,
          category: String(p.category_id ?? ""),
          image: p.image ?? "",
          price_a: priceAt(p, 1),
          price_b: priceAt(p, 2) > 0 ? priceAt(p, 2) : undefined,
          price_c: priceAt(p, 3) > 0 ? priceAt(p, 3) : undefined,
          price_d: priceAt(p, 4) > 0 ? priceAt(p, 4) : undefined,
          price_e: priceAt(p, 5) > 0 ? priceAt(p, 5) : undefined,
          stock: typeof p.stock_total === "number" ? p.stock_total : undefined,
          // El endpoint /products?light=1 solo devuelve stock_total (escalar). Sin
          // este mapeo, el render del catálogo en SellPage muestra siempre
          // "TIENDA: 0 · PREVENTA: 0" porque lee `stock_details.tienda`.
          stock_details: typeof p.stock_total === "number"
            ? { tienda: p.stock_total, bodega: 0, preventa: 0, dañado: 0 }
            : undefined,
          active: p.active,
          // QA crítico 2026-06-08: sin estos flags, itemAcceptsMethod/payBlocked
          // siempre pasaban y un producto solo-efectivo se cobraba con tarjeta.
          allow_cash: p.allow_cash ?? true,
          allow_card: p.allow_card ?? true,
          payment_restriction: p.allow_card === false && p.allow_cash !== false ? "cash_only" : undefined,
          product_type: p.product_type ?? "product",
          volume_number: p.volume_number ?? null,
        } as Product;
      });
  }, [productsQuery.data]);

  const [showOpenCashModal, setShowOpenCashModal] = useState(false);
  const [openCashRegisterId, setOpenCashRegisterId] = useState<number | "">("");
  const [openCashAmount, setOpenCashAmount] = useState("");
  const [openingCash, setOpeningCash]       = useState(false);
  // Conflicto al abrir caja (existing session bloquea). UI muestra modal apropiado.
  const [openSessionConflict, setOpenSessionConflict] = useState<OpenSessionConflict | null>(null);
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const [showCloseCashModal, setShowCloseCashModal] = useState(false);
  const [closeCashAmount, setCloseCashAmount] = useState("");
  const [closingCashLoading, setClosingCashLoading] = useState(false);
  // Cuando se cierra caja exitosamente, se llena con el reporte de corte y
  // se muestra el modal de resumen. null = cerrado.
  const [cashCloseSummary, setCashCloseSummary] = useState<CashSessionReport | null>(null);
  const [customers, setCustomers]     = useState<Customer[]>([]);
  const loading = productsQuery.isPending;

  useEffect(() => {
    if (productsQuery.error) {
      const msg = (productsQuery.error as { message?: string }).message ?? "Error al cargar productos";
      toast.error(msg);
    }
  }, [productsQuery.error]);

  useEffect(() => {
    if (terminalsQuery.error) toast.error("Error al cargar terminales");
  }, [terminalsQuery.error]);

  // Auto-select first available cash register when registers load
  useEffect(() => {
    if (!cashSession && cashRegisters[0] && openCashRegisterId === "") {
      setOpenCashRegisterId(cashRegisters[0].id);
    }
  }, [cashSession, cashRegisters, openCashRegisterId]);
  const [mesas, setMesas]             = useState<Mesa[]>(initialMesas.current);
  const [activeMesaId, setActiveMesaId] = useState(initialActiveId.current);

  // Mover updMesa arriba — necesario para los wrappers per-mesa (cashReceived, etc.)
  // que viven más arriba que su definición original.
  const updMesa = useCallback((id: string, fn: (m: Mesa) => Mesa) =>
    setMesas(prev => prev.map(m => m.id === id ? fn(m) : m)), []);

  // Ref con el snapshot más reciente de mesas. Permite que callbacks async (ej.
  // addToCart después de awaitar un inFlight) lean la qty actual del UI sin
  // depender del closure capturado al inicio de la llamada (que ya está stale).
  const mesasRef = useRef<Mesa[]>(mesas);
  useEffect(() => { mesasRef.current = mesas; }, [mesas]);

  // Sincroniza el snapshot de mesas con localStorage en cada cambio.
  // Permite recuperar el carrito al navegar a otra página y volver.
  // Usa getState() en lugar de la instancia subscrita para evitar loop infinito.
  useEffect(() => {
    useCartDraftStore.getState().setMesasSnapshot(mesas, activeMesaId);
  }, [mesas, activeMesaId]);

  const [tc, setTc]           = useState(15.50);
  const [showTc, setShowTc]   = useState(false);
  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const [tcDraft, setTcDraft] = useState("15.50");

  const [search, setSearch]         = useState("");
  // Debounce the search so we don't fire a backend request on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const productsSearchQuery = useProductsSearchQuery(debouncedSearch, activeStore?.id);

  // Merge top 200 + search results into a single dedupe'd pool. Search results
  // bring in products that aren't in the top — they get filtered locally by
  // `filteredProds` along with the cached ones.
  const products: Product[] = useMemo(() => {
    const seen = new Set(topProducts.map(p => p.id));
    const searchData = productsSearchQuery.data?.data ?? [];
    const priceAt = (p: typeof searchData[number], level: 1 | 2 | 3 | 4 | 5): number =>
      Number(p.prices?.[`price_${level}` as keyof typeof p.prices] ?? 0) || 0;
    const extra: Product[] = searchData
      .filter(p => p.active && !seen.has(String(p.id)))
      .map(p => ({
        id: String(p.id),
        name: p.name,
        sku: p.sku,
        barcode: p.barcode ?? undefined,
        category: String(p.category_id ?? ""),
        image: p.image ?? "",
        price_a: priceAt(p, 1),
        price_b: priceAt(p, 2) > 0 ? priceAt(p, 2) : undefined,
        price_c: priceAt(p, 3) > 0 ? priceAt(p, 3) : undefined,
        price_d: priceAt(p, 4) > 0 ? priceAt(p, 4) : undefined,
        price_e: priceAt(p, 5) > 0 ? priceAt(p, 5) : undefined,
        stock: typeof p.stock_total === "number" ? p.stock_total : undefined,
        stock_details: typeof p.stock_total === "number"
          ? { tienda: p.stock_total, bodega: 0, preventa: 0, dañado: 0 }
          : undefined,
        active: p.active,
        allow_cash: p.allow_cash ?? true,
        allow_card: p.allow_card ?? true,
        payment_restriction: p.allow_card === false && p.allow_cash !== false ? "cash_only" : undefined,
        product_type: p.product_type ?? "product",
        volume_number: p.volume_number ?? null,
      }) as Product);
    return extra.length > 0 ? [...topProducts, ...extra] : topProducts;
  }, [topProducts, productsSearchQuery.data]);

  // showCatalog se declara arriba (junto a las queries) para condicionar el polling.
  const [selectedCat, setSelectedCat] = useState("Todo");
  const [showDiscount, setShowDiscount] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustDrop, setShowCustDrop]     = useState(false);
  const [requireCustomerFlash, setRequireCustomerFlash] = useState(false);
  const [isRegisteringCustomer, setIsRegisteringCustomer] = useState(false);
  const [extSearchResults, setExtSearchResults] = useState<ExternalCardLookup[]>([]);
  const [isWide, setIsWide]         = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  // cashReceived vive en la mesa activa (ver Mesa.cashReceived) — el wrapper
  // se define más abajo, después de derivar activeMesa.

  // ── Ticket / Historial ────────────────────────────────────────────────
  interface CompletedSaleData {
    id?: number; total: number; paymentMethod: string; customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    items: Array<{ name: string; quantity: number; price: number }>;
    soldAt: string;
    // contexto del punto de venta
    storeName?: string;
    cashierName?: string;
    amountReceived?: number;     // efectivo total ingresado en MXN (incluye USD * tc)
    amountReceivedUsd?: number;  // dólares físicos recibidos (informativo; ya van sumados en amountReceived)
    change?: number;             // cambio devuelto en MXN
    // preventa section (mixed ticket)
    preSaleCode?: string;
    preSaleItems?: Array<{ name: string; quantity: number; unitPrice: number }>;
    preSaleAnticipo?: number;
    preSaleIsLiquidation?: boolean; // true = liquidación de folio existente; false/undefined = anticipo/apartado nuevo
  }
  const PRINT_PREF_KEY = "tadaima_print_pref"; // 'auto' | 'ask' | 'never'
  const [lastCompletedSale, setLastCompletedSale] = useState<CompletedSaleData | null>(null);
  const [showPrintModal, setShowPrintModal]         = useState(false);
  // mesaId de la venta recién cobrada — si es una mesa secundaria (Venta 2..5)
  // se cierra automáticamente al terminar el flujo de impresión. La Caja
  // Principal nunca se cierra. Petición Joel 2026-05-21.
  const [pendingMesaCloseId, setPendingMesaCloseId] = useState<string | null>(null);
  const [printNeverAsk, setPrintNeverAsk]           = useState(false);
  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [showCortesModal, setShowCortesModal] = useState(false);
  // Max-height de la lista de tickets del Historial basado en el alto REAL de
  // la pantalla (mide su top vs window.innerHeight) → scroll interno garantizado
  // sin depender de la cadena flex (Joel 2026-06-13).
  const [historialListRef, historialListMaxH] = useViewportMaxHeight(20);
  // Historial del día vía React Query: cacheado + persistido en IndexedDB.
  // Apertura del modal instantánea con la última versión; background refetch
  // tras cada checkout/cancelación gracias a las invalidaciones.
  const historialQuery = useTodayHistorialQuery(activeStore?.id, { enabled: !!user });
  const historialEntries: HistorialEntry[] = historialQuery.data ?? [];
  // Spinner grande SOLO en la primera carga sin datos en cache. Si ya hay
  // ventas en memoria, el modal abre instantáneo y el refresco se muestra
  // como un indicador sutil abajo (historialRefreshing).
  const historialLoading = historialQuery.isLoading && historialEntries.length === 0;
  const historialRefreshing = historialQuery.isFetching && historialEntries.length > 0;
  // ADR-016 Fase 1 — filtro del historial. 'all' default; 'cancelled' muestra
  // solo ventas con status='returned' y preventas con status='cancelled'.
  const [historialFilter, setHistorialFilter] = useState<'all' | 'cancelled'>('all');
  // Buscador del historial full-screen: ticket #, folio, cliente, producto o método.
  const [historialSearch, setHistorialSearch] = useState("");
  const [expandedEntryKey, setExpandedEntryKey]     = useState<string | null>(null);
  // ADR-016 Fase 3 — qué ticket está siendo cancelado (modal)
  const [cancelTarget, setCancelTarget] = useState<
    | { kind: 'sale'; sale: SaleDetail }
    | { kind: 'presale'; order: PreSaleOrder }
    | null
  >(null);

  // ── Popup asignar cliente (escanear TAD\d+ o botón "Cliente" del toolbar) ──
  // Se abre cuando el scanner detecta un código TAD o cuando el cajero clickea
  // el botón User. Muestra datos del cliente y un solo botón "Asignar". Si la
  // mesa ya tiene cliente asignado, el scanner skipea silenciosamente.
  const [assignCustomerPopup, setAssignCustomerPopup] = useState<{
    mode: 'scan' | 'manual';
    candidate: { type: 'local'; customer: Customer } | { type: 'external'; ext: ExternalCardLookup } | null;
    search: string;
    searching: boolean;
    searchResults: { locales: Customer[]; externos: ExternalCardLookup[] };
    assigning: boolean;
    // Modo "crear nuevo cliente" dentro del popup manual
    createForm: { open: boolean; name: string; phone: string; email: string; saving: boolean };
  } | null>(null);

  // ── Modal acceso rápido a Clientes ──
  // Buscador local + fallback Supabase. Cada fila expande para mostrar ventas
  // y preventas del cliente (lazy fetch on expand para no traer todo al abrir).
  const [showClientsModal, setShowClientsModal]     = useState(false);
  const [clientsSearch, setClientsSearch]           = useState("");
  const [clientsLocal, setClientsLocal]             = useState<Customer[]>([]);
  const [clientsExternal, setClientsExternal]       = useState<ExternalCardLookup[]>([]);
  const [clientsSearching, setClientsSearching]     = useState(false);
  const [expandedClientId, setExpandedClientId]     = useState<number | null>(null);
  const [clientDetail, setClientDetail]             = useState<{ sales: SaleDetail[]; preSales: PreSaleOrder[]; loading: boolean } | null>(null);
  const [addingExternalId, setAddingExternalId]     = useState<string | null>(null);
  // Tracks mixed-checkout pairs: presale order + regular sale created in the same transaction
  const [mixedPairs, setMixedPairs] = useState<Array<{ preSaleOrderId: number; saleId: number }>>([]);

  // ── Modal unificado de Preventas ──
  // showPreSalesModal se declara arriba (junto a las queries) para condicionar el polling.
  const [preSalesTab, setPreSalesTab] = useState<'venta' | 'liquidar' | 'completadas' | 'vencidas' | 'difusion'>('venta');
  const [preSaleCatalogs, setPreSaleCatalogs] = useState<PreSaleCatalog[]>([]);
  const [preSaleOrdersPending, setPreSaleOrdersPending] = useState<PreSaleOrder[]>([]);
  const [preSaleOrdersDelivered, setPreSaleOrdersDelivered] = useState<PreSaleOrder[]>([]);
  const [preSaleOrdersExpired, setPreSaleOrdersExpired] = useState<PreSaleOrder[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  // Aviso "asigna esta preventa a mi tienda" — estado por catálogo para
  // deshabilitar el botón mientras envía y mostrar "Avisado ✓" después.
  const [presaleAlertState, setPresaleAlertState] = useState<Record<number, 'sending' | 'sent'>>({});

  const handlePresaleAssignAlert = async (catalog: PreSaleCatalog) => {
    if (presaleAlertState[catalog.id]) return;
    setPresaleAlertState(prev => ({ ...prev, [catalog.id]: 'sending' }));
    try {
      await sendPreSaleAssignAlert({ catalog_id: catalog.id });
      setPresaleAlertState(prev => ({ ...prev, [catalog.id]: 'sent' }));
      toast.success("Aviso enviado", { description: "Tu gerente y el admin recibirán la solicitud para habilitar esta preventa." });
    } catch (err: unknown) {
      setPresaleAlertState(prev => {
        const { [catalog.id]: _omit, ...rest } = prev;
        return rest;
      });
      toast.error((err as { message?: string })?.message ?? "No se pudo enviar el aviso");
    }
  };

  // ── Búsqueda rápida por folio ──
  const [folioInput, setFolioInput] = useState("");
  const [folioLoading, setFolioLoading] = useState(false);

  // ── Apartar desde POS ──
  const [showApartarModal, setShowApartarModal] = useState(false);
  const [apartarItemIdx, setApartarItemIdx] = useState(0);
  const [apartarDownPayment, setApartarDownPayment] = useState("");
  const [apartarPayMethodId, setApartarPayMethodId] = useState("");
  const [apartarExpiresAt, setApartarExpiresAt] = useState("");
  const [apartarNotes, setApartarNotes] = useState("");
  const [apartarProcessing, setApartarProcessing] = useState(false);

  // ── Escáner (lector USB HID + cámara) ──
  const [showCameraScanner, setShowCameraScanner] = useState(false);

  // Cambiado de HTMLDivElement a HTMLElement porque ahora vive en el sidebar
  // derecho (<aside>) en vez del antiguo footer (<div>). Sigue siendo el ancla
  // del "click fuera" para cerrar el popover del Tipo de Cambio.
  const tcRef              = useRef<HTMLElement>(null);
  const custRef            = useRef<HTMLDivElement>(null);
  const paymentMenuRef     = useRef<HTMLDivElement>(null);
  const [paymentMenuOpen, setPaymentMenuOpen] = useState(false);
  // Toggle del input de dólares dentro de Efectivo. Por default oculto — se
  // muestra cuando el cajero hace click en "+ Dólares" o cuando ya hay valor.
  // showUsdInput se deriva de la mesa activa — cada caja inicia en PESOS por
  // default, y USD solo cuando el cajero lo activa con "+ Dólares" (decisión
  // Joel 2026-05-28). Antes era useState global → la siguiente venta heredaba
  // el modo USD de la anterior aunque clearCart limpiara los inputs.
  const customerSearchRef  = useRef<HTMLInputElement>(null);
  const prodInputRef       = useRef<HTMLInputElement>(null);
  const cashInputRef       = useRef<HTMLInputElement>(null);

  // Auto-select store from active session when admin navigates to Caja con
  // sesión ya abierta (stores y session pueden cargar en cualquier orden).
  // IMPORTANTE: solo aplica si la sesión sigue OPEN. Si el admin acaba de
  // cerrar caja (setActiveStore(null) en handleCloseCash), no debemos
  // re-asignar la tienda desde la sesión recién cerrada — el admin necesita
  // ver el selector para elegir otra tienda.
  useEffect(() => {
    if (
      cashSession?.status === 'open' &&
      cashSession.register?.store_id &&
      !activeStore &&
      stores.length > 0
    ) {
      const match = stores.find(s => s.id === cashSession.register!.store_id);
      if (match) setActiveStore(match);
    }
  }, [cashSession, stores, activeStore]);

  // ── Exchange rate (USD→MXN) with live polling.
  // The query polls every 30s. When admin changes the rate from Settings on
  // another device, the cashier sees it within one poll window. We also
  // automatically update the in-use `tc` so that the cart recalculates live —
  // unless the cashier currently has the edit popover open.
  const exchangeRateQuery = useExchangeRateQuery();
  const exchangeRateServer = exchangeRateQuery.data ?? null;
  const lastSyncedRateRef = useRef<number | null>(null);

  useEffect(() => {
    if (exchangeRateServer == null) return;
    // Don't disturb the cashier while they're editing the rate locally.
    if (showTc) return;
    // First sync ever — silent.
    if (lastSyncedRateRef.current === null) {
      setTc(exchangeRateServer);
      setTcDraft(exchangeRateServer.toString());
      lastSyncedRateRef.current = exchangeRateServer;
      return;
    }
    if (Math.abs(exchangeRateServer - lastSyncedRateRef.current) > 0.0001) {
      setTc(exchangeRateServer);
      setTcDraft(exchangeRateServer.toString());
      lastSyncedRateRef.current = exchangeRateServer;
      toast.info(`Tipo de cambio actualizado: $${exchangeRateServer.toFixed(2)}`);
    }
  }, [exchangeRateServer, showTc]);

  // Validate persisted draft IDs on mount — clear stale entries (completed/cancelled/404)
  useEffect(() => {
    const entries = Object.entries(draftStore.draftIds);
    if (entries.length === 0) return;
    void Promise.all(
      entries.map(async ([mesaId, draftId]) => {
        try {
          const draft = await getDraft(draftId);
          if (draft.status !== "open") {
            draftStore.clearDraft(mesaId);
          }
        } catch {
          // Draft not found on server (404) or network error — clear stale entry
          draftStore.clearDraft(mesaId);
        }
      })
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (tcRef.current   && !tcRef.current.contains(e.target as Node))   setShowTc(false);
      if (custRef.current && !custRef.current.contains(e.target as Node)) setShowCustDrop(false);
      if (paymentMenuRef.current && !paymentMenuRef.current.contains(e.target as Node)) setPaymentMenuOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const activeMesa = useMemo(() => mesas.find(m => m.id === activeMesaId) ?? mesas[0], [mesas, activeMesaId]);

  // cashReceived es por caja: cada mesa guarda lo que el cliente entregó.
  // Antes era un useState global → al saltar entre Caja 1/2/3 se perdía lo
  // ingresado. Ahora persiste mientras la caja siga abierta con esos items.
  const cashReceived = activeMesa.cashReceived ?? "";
  const setCashReceived = useCallback((v: string | ((prev: string) => string)) => {
    updMesa(activeMesa.id, m => ({
      ...m,
      cashReceived: typeof v === 'function' ? (v as (p: string) => string)(m.cashReceived ?? "") : v,
    }));
  }, [activeMesa.id, updMesa]);

  // Input híbrido: dólares físicos recibidos (siempre dentro de Efectivo).
  const cashReceivedUsd = activeMesa.cashReceivedUsd ?? "";
  const setCashReceivedUsd = useCallback((v: string | ((prev: string) => string)) => {
    updMesa(activeMesa.id, m => ({
      ...m,
      cashReceivedUsd: typeof v === 'function' ? (v as (p: string) => string)(m.cashReceivedUsd ?? "") : v,
    }));
  }, [activeMesa.id, updMesa]);

  // Modo USD primario (cajero activó "+ Dólares"). Por mesa — cada venta nueva
  // inicia en pesos (default false en makeMesa + clearCart lo resetea).
  const showUsdInput = !!activeMesa.usdPrimaryMode;
  const setShowUsdInput = useCallback((v: boolean) => {
    updMesa(activeMesa.id, m => ({ ...m, usdPrimaryMode: v }));
  }, [activeMesa.id, updMesa]);

  // Una sola vez al hidratar: si la mesa viene con paymentMethod="Dólares"
  // de un snapshot anterior, normaliza a "Efectivo" (Dólares se eliminó del
  // dropdown 2026-05-28 y vive ahora dentro de Efectivo vía cashReceivedUsd).
  useEffect(() => {
    setMesas(prev => {
      const needsFix = prev.some(m => (m.paymentMethod as string) === "Dólares");
      if (!needsFix) return prev;
      return prev.map(m => (m.paymentMethod as string) === "Dólares"
        ? { ...m, paymentMethod: "Efectivo" as PaymentMethod }
        : m);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear cash input when cart is emptied
  useEffect(() => {
    if (activeMesa.items.length === 0) setCashReceived("");
  }, [activeMesa.items.length]);

  // Sincronizar el campo de búsqueda de cliente con la caja activa al cambiar de tab
  useEffect(() => {
    setCustomerSearch(activeMesa.customerName || "");
    setShowCustDrop(false);
  }, [activeMesaId]);

  // Live customer search (header preventa). Filtra local del cache RQ instant,
  // si no hay match y query ≥2 chars consulta Supabase como fallback.
  const [headerSearchingExternal, setHeaderSearchingExternal] = useState(false);
  useEffect(() => {
    setExtSearchResults([]);
    const local = filterLocalCustomers(customerSearch);
    setCustomers(local);
    if (local.length > 0 || customerSearch.trim().length < 2) {
      setHeaderSearchingExternal(false);
      return;
    }
    // 0 locales + query específica → consultar Supabase con leyenda visible.
    setHeaderSearchingExternal(true);
    const t = setTimeout(async () => {
      try {
        const exts = await searchExternalCustomers(customerSearch.trim());
        setExtSearchResults(exts);
      } catch {
        // silent
      } finally {
        setHeaderSearchingExternal(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch, filterLocalCustomers]);

  // ── Modal Clientes (acceso rápido) ─────────────────────────────────────────
  const openClientsModal = () => {
    setShowClientsModal(true);
    setClientsSearch("");
    setClientsLocal([]);
    setClientsExternal([]);
    setExpandedClientId(null);
    setClientDetail(null);
  };

  // Búsqueda debounced 300ms. Igual que el customerSearch del header de Caja:
  // local primero, si no hay match y la query es ≥2 chars dispara Supabase.
  useEffect(() => {
    if (!showClientsModal) return;
    // Filtro local instantáneo desde el cache RQ.
    const locales = filterLocalCustomers(clientsSearch);
    setClientsLocal(locales);
    setClientsExternal([]);
    if (locales.length > 0 || clientsSearch.trim().length < 2) {
      setClientsSearching(false);
      return;
    }
    // 0 locales + query específica → Supabase con leyenda.
    setClientsSearching(true);
    const t = setTimeout(async () => {
      try {
        const exts = await searchExternalCustomers(clientsSearch.trim());
        setClientsExternal(exts);
      } catch {
        // silent
      } finally {
        setClientsSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [clientsSearch, showClientsModal, filterLocalCustomers]);

  /** Expande un cliente y trae sus ventas + preventas (lazy). */
  const expandClient = async (cust: Customer) => {
    const idNum = Number(cust.id);
    if (expandedClientId === idNum) {
      setExpandedClientId(null);
      setClientDetail(null);
      return;
    }
    setExpandedClientId(idNum);
    setClientDetail({ sales: [], preSales: [], loading: true });
    try {
      const [salesRes, preSalesRes] = await Promise.allSettled([
        getSales({ customer_id: idNum, per_page: 20 } as Parameters<typeof getSales>[0]),
        getPreSaleOrders({ customer_id: idNum, per_page: 20 } as Parameters<typeof getPreSaleOrders>[0]),
      ]);
      setClientDetail({
        sales: salesRes.status === 'fulfilled' ? salesRes.value.data : [],
        preSales: preSalesRes.status === 'fulfilled' ? preSalesRes.value.data : [],
        loading: false,
      });
    } catch {
      setClientDetail({ sales: [], preSales: [], loading: false });
    }
  };

  /** Agrega un cliente externo (Supabase) a la BD local sin asignarlo al carrito. */
  const addExternalToDb = async (ext: ExternalCardLookup) => {
    setAddingExternalId(ext.external_member_id);
    try {
      const newCust = await createCustomer({
        name:               ext.name ?? ext.external_member_id,
        phone:              ext.phone ?? undefined,
        email:              ext.email || undefined,
        external_member_id: ext.external_member_id,
        loyalty_tier:       ext.nivel ?? undefined,
      });
      toast.success(`Cliente agregado: ${newCust.name}`);
      // Refresca la lista local mostrándolo arriba.
      setClientsLocal(prev => [{
        id: String(newCust.id), name: newCust.name,
        phone: newCust.phone ?? undefined, email: newCust.email ?? ext.email ?? undefined,
        points: newCust.points, external_member_id: ext.external_member_id,
      }, ...prev]);
      setClientsExternal(prev => prev.filter(e => e.external_member_id !== ext.external_member_id));
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    } catch {
      toast.error("No se pudo agregar al cliente");
    } finally {
      setAddingExternalId(null);
    }
  };

  // ── Popup asignar cliente (TAD scan o botón User toolbar) ──────────────────

  /**
   * Abre el popup en modo "scan": llega un código TAD del scanner. Busca
   * primero en BD local (por external_member_id), si no está consulta Supabase.
   * Si encuentra, muestra tarjeta + botón "Asignar". Si no, toast error.
   */
  const openCustomerScanPopup = async (code: string) => {
    setAssignCustomerPopup({
      mode: 'scan', candidate: null, search: code, searching: true,
      searchResults: { locales: [], externos: [] }, assigning: false,
      createForm: { open: false, name: "", phone: "", email: "", saving: false },
    });
    try {
      // Primero busca local por external_member_id (no recreates cliente existente).
      const localRes = await getCustomers({ search: code, per_page: 5 });
      const localList = Array.isArray(localRes) ? localRes : (localRes as { data: any[] }).data ?? [];
      const localMatch = localList.find((c: any) => c.external_member_id === code);
      if (localMatch) {
        const cust: Customer = {
          id: String(localMatch.id), name: localMatch.name,
          phone: localMatch.phone ?? undefined, email: localMatch.email ?? undefined,
          points: localMatch.points, external_member_id: code,
        };
        setAssignCustomerPopup(p => p ? { ...p, candidate: { type: 'local', customer: cust }, searching: false } : null);
        return;
      }
      // No en local → busca Supabase.
      const ext = await lookupCardCode(code);
      if (ext) {
        setAssignCustomerPopup(p => p ? { ...p, candidate: { type: 'external', ext }, searching: false } : null);
      } else {
        toast.error(`Tarjeta ${code} no encontrada en socios Tadaima.`);
        setAssignCustomerPopup(null);
      }
    } catch {
      toast.error("Error al consultar al socio. Reintenta.");
      setAssignCustomerPopup(null);
    }
  };

  /** Abre el popup en modo manual: cajero clickea botón User del toolbar. */
  const openCustomerManualPopup = () => {
    if (activeMesa.customerId) {
      toast.info("Esta venta ya tiene cliente. Quítalo desde el resumen si quieres cambiarlo.");
      return;
    }
    setAssignCustomerPopup({
      mode: 'manual', candidate: null, search: "", searching: false,
      searchResults: { locales: [], externos: [] }, assigning: false,
      createForm: { open: false, name: "", phone: "", email: "", saving: false },
    });
  };

  /** Búsqueda debounced del popup en modo manual. Local instant + Supabase fallback. */
  useEffect(() => {
    if (!assignCustomerPopup || assignCustomerPopup.mode !== 'manual') return;
    const q = assignCustomerPopup.search;
    // Filtro local instantáneo desde el cache RQ.
    const locales = filterLocalCustomers(q);
    setAssignCustomerPopup(p => p ? {
      ...p,
      searchResults: { locales, externos: [] },
      searching: false,
    } : null);

    if (locales.length > 0 || q.trim().length < 2) return;

    // 0 locales + query específica → Supabase con leyenda visible.
    setAssignCustomerPopup(p => p ? { ...p, searching: true } : null);
    const t = setTimeout(async () => {
      try {
        const externos = await searchExternalCustomers(q.trim());
        setAssignCustomerPopup(p => p ? {
          ...p,
          searchResults: { ...p.searchResults, externos },
          searching: false,
        } : null);
      } catch {
        setAssignCustomerPopup(p => p ? { ...p, searching: false } : null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [assignCustomerPopup?.search, assignCustomerPopup?.mode, filterLocalCustomers]);

  /** Asigna el candidato al mesa actual. Si es externo, primero lo crea en BD. */
  const confirmAssignCustomer = async (candidate: { type: 'local'; customer: Customer } | { type: 'external'; ext: ExternalCardLookup }) => {
    setAssignCustomerPopup(p => p ? { ...p, assigning: true } : null);
    try {
      if (candidate.type === 'local') {
        setCustomer(candidate.customer);
        toast.success(`Cliente asignado: ${candidate.customer.name}`);
      } else {
        const ext = candidate.ext;
        const newCust = await createCustomer({
          name:               ext.name ?? ext.external_member_id,
          phone:              ext.phone ?? undefined,
          email:              ext.email || undefined,
          external_member_id: ext.external_member_id,
          loyalty_tier:       ext.nivel ?? undefined,
        });
        const cust: Customer = {
          id: String(newCust.id), name: newCust.name,
          phone: newCust.phone ?? undefined, email: newCust.email ?? ext.email ?? undefined,
          points: newCust.points, external_member_id: ext.external_member_id,
        };
        setCustomer(cust);
        toast.success(`Socio Tadaima agregado y asignado: ${newCust.name}`);
        void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      }
      setAssignCustomerPopup(null);
    } catch {
      toast.error("No se pudo asignar al cliente.");
      setAssignCustomerPopup(p => p ? { ...p, assigning: false } : null);
    }
  };

  /** Crea un cliente nuevo desde el form inline del popup manual + lo asigna a la mesa. */
  const submitCreateCustomer = async () => {
    const p = assignCustomerPopup;
    if (!p) return;
    const name = p.createForm.name.trim();
    if (!name) {
      toast.error("Nombre requerido");
      return;
    }
    // Mismos regex compartidos que Sucursales/Usuarios (lib/validation.ts) —
    // el label inline ya avisa; esto cubre el submit por Enter.
    const phoneTrim = p.createForm.phone.trim();
    const emailTrim = p.createForm.email.trim();
    if (phoneTrim && !isValidPhone(phoneTrim)) {
      toast.error("Teléfono inválido: deben ser 10 dígitos (ej. 55 1234 5678)");
      return;
    }
    if (emailTrim && !isValidEmail(emailTrim)) {
      toast.error("Correo inválido (ej. cliente@correo.com)");
      return;
    }
    setAssignCustomerPopup(prev => prev ? { ...prev, createForm: { ...prev.createForm, saving: true } } : null);
    try {
      const newCust = await createCustomer({
        name,
        phone: phoneTrim || undefined,
        email: emailTrim || undefined,
      });
      const cust: Customer = {
        id: String(newCust.id), name: newCust.name,
        phone: newCust.phone ?? undefined, email: newCust.email ?? undefined,
        points: newCust.points,
      };
      setCustomer(cust);
      toast.success(`Cliente creado y asignado: ${newCust.name}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      setAssignCustomerPopup(null);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message) : "No se pudo crear el cliente";
      toast.error(msg);
      setAssignCustomerPopup(prev => prev ? { ...prev, createForm: { ...prev.createForm, saving: false } } : null);
    }
  };

  const handleAddExtCust = async (ext: ExternalCardLookup) => {
    try {
      const newCust = await createCustomer({
        name:               ext.name ?? ext.external_member_id,
        phone:              ext.phone ?? undefined,
        email:              ext.email || undefined,
        external_member_id: ext.external_member_id,
        loyalty_tier:       ext.nivel ?? undefined,
      });
      const custObj: Customer = {
        id: String(newCust.id),
        name: newCust.name,
        phone: newCust.phone ?? undefined,
        email: newCust.email ?? ext.email ?? undefined,
        points: newCust.points,
        external_member_id: ext.external_member_id,
      };
      setCustomers([custObj]);
      setExtSearchResults([]);
      setCustomer(custObj);
      toast.success(`Socio Tadaima agregado: ${newCust.name}`);
    } catch {
      toast.error("No se pudo agregar al socio");
    }
  };

  const addMesa = () => {
    // La caja main (1ra) es la principal — cada caja extra es una sub-caja para
    // vender a otro cliente. No tiene sentido abrir otra si la actual está vacía.
    if (!activeMesa || activeMesa.items.length === 0) {
      toast.warning("Agrega al menos un producto a la caja actual antes de abrir otra.", {
        icon: <ShoppingBag className="text-amber-500" size={16} />,
        style: { background: '#1a1400', color: '#fbbf24', border: '1px solid #78350f' },
      });
      return;
    }
    const m = makeMesa();
    setMesas(prev => [...prev, m]);
    setActiveMesaId(m.id);
  };

  // ─── Stock cross-caja (solo tabs del mismo browser, ADR-014) ────────────────
  // Lee el state local mesas[]. Tabs distintas del mismo browser comparten state
  // vía zustand persist + storage events. Cajeros en máquinas distintas NO se
  // ven entre sí durante el armado — la garantía real ocurre en el backend al
  // detonar el cobro (CheckoutService::reserveStock con lockForUpdate).
  const reservedInOtherMesas = useCallback((productId: string, excludeMesaId: string): number =>
    mesas
      .filter(m => m.id !== excludeMesaId)
      .reduce((s, m) => s + m.items
        .filter(i => i.product.id === productId && i.sellingCatalogId == null && !i.isFromPreSale)
        .reduce((q, i) => q + i.quantity, 0), 0), [mesas]);

  // Stock real disponible para la caja actual = stock total − reservado en otras cajas.
  const availableStockFor = useCallback((product: Product, currentMesaId: string): number | undefined => {
    const total = product.stock_details?.tienda ?? product.stock;
    if (total === undefined) return undefined;
    return Math.max(0, total - reservedInOtherMesas(product.id, currentMesaId));
  }, [reservedInOtherMesas]);

  const removeMesa = (id: string) => {
    if (mesas.length <= 1) return;
    setMesas(prev => {
      const next = prev.filter(m => m.id !== id);
      if (activeMesaId === id) setActiveMesaId(next[0].id);
      return next;
    });
  };

  /**
   * Agregar producto al carrito (ADR-014: client-authoritative cart).
   * Solo toca el state local `mesas[]` (persiste a localStorage vía zustand
   * snapshot). El backend se entera del carrito al detonar el cobro en
   * handleCheckout, no antes. Resultado: cero requests por click, sin race
   * conditions, multi-tab del mismo browser sigue sincronizando vía
   * BroadcastChannel del zustand persist.
   */
  /**
   * Agregar producto desde SCANNER. Reglas (Joel 2026-05-25):
   *  - Si el producto NO está en venta → crear fila con qty=1.
   *  - Si YA está en venta → NO sumar, NO crear fila duplicada. Toast info.
   *  - El cajero solo puede subir cantidad con +/− manual.
   *
   * Función separada de `addToCart` porque ese sí suma (es el comportamiento
   * normal de clicks en catálogo / preventas / etc).
   */
  const addScanToCart = (product: Product, priceLevel: PriceLevel = "a"): void => {
    const mesaId = activeMesa.id;
    const exists = activeMesa.items.some(i => i.product.id === product.id);
    if (exists) {
      toast.info(`${product.name} ya está en la venta · usa + para sumar`);
      return;
    }
    // Stock guard idéntico al de addToCart, pero antes de mutar.
    if (!activeMesa.isPreventa) {
      const available = availableStockFor(product, mesaId);
      if (available !== undefined && available < 1) {
        const reserved = reservedInOtherMesas(product.id, mesaId);
        toast.error(
          reserved > 0
            ? `Stock insuficiente: 0 disponible(s) (${reserved} reservado(s) en otra caja).`
            : `Stock insuficiente: sin unidades disponibles.`,
        );
        return;
      }
    }
    const unitPrice =
      priceLevel === "b" && product.price_b ? product.price_b :
      priceLevel === "c" && product.price_c ? product.price_c :
      priceLevel === "d" && product.price_d ? product.price_d :
      priceLevel === "e" && product.price_e ? product.price_e :
      product.price_a || 0;

    let actuallyAdded = false;
    updMesa(mesaId, m => {
      // Double-check dentro del updater por si hay race condition entre
      // dos escaneos concurrentes que pasaron el primer check.
      if (m.items.some(i => i.product.id === product.id)) return m;
      actuallyAdded = true;
      const newItem = {
        product, quantity: 1, priceLevel,
        ...(m.isPreventa ? { depositAmount: unitPrice } : {}),
      };
      const newItems = [...m.items, newItem];
      const willHaveCashOnly = newItems.some(i => i.product.payment_restriction === "cash_only");
      const newPaymentMethod =
        willHaveCashOnly && !["Efectivo", "Dólares"].includes(m.paymentMethod)
          ? "Efectivo" : m.paymentMethod;
      return { ...m, items: newItems, paymentMethod: newPaymentMethod };
    });
    if (actuallyAdded) toast.success(`Agregado: ${product.name}`);
  };

  const addToCart = (product: Product, priceLevel: PriceLevel = "a", quantity: number = 1) => {
    const mesaId = activeMesa.id;
    const preItem = activeMesa.items.find(i => i.product.id === product.id);
    const newQty = (preItem?.quantity ?? 0) + quantity;

    // Stock cross-caja (solo tabs del mismo browser): si otra caja ya tiene
    // este producto en su carrito, no pasarse del stock_total del catálogo.
    if (!activeMesa.isPreventa) {
      const available = availableStockFor(product, mesaId);
      if (available !== undefined && newQty > available) {
        const reserved = reservedInOtherMesas(product.id, mesaId);
        toast.error(
          reserved > 0
            ? `Stock insuficiente: ${available} disponible(s) (${reserved} reservado(s) en otra caja).`
            : `Stock insuficiente: solo quedan ${available} disponible(s).`,
        );
        return;
      }
    }

    const unitPrice =
      priceLevel === "b" && product.price_b ? product.price_b :
      priceLevel === "c" && product.price_c ? product.price_c :
      priceLevel === "d" && product.price_d ? product.price_d :
      priceLevel === "e" && product.price_e ? product.price_e :
      product.price_a || 0;

    updMesa(mesaId, m => {
      const ex = m.items.find(i => i.product.id === product.id);

      if (m.isPreventa) {
        const maxStock = product.stock_details?.preventa;
        if (maxStock !== undefined && ex && ex.quantity + quantity > maxStock) {
          toast.error(`Límite de preventa alcanzado: ${maxStock} unidad(es)`);
          return m;
        }
      }

      const newItems = ex
        ? m.items.map(i => i.product.id === product.id
            ? {
                ...i,
                quantity: i.quantity + quantity,
                ...(m.isPreventa ? { depositAmount: (i.depositAmount ?? 0) + unitPrice * quantity } : {}),
              }
            : i)
        : [...m.items, {
            product, quantity, priceLevel,
            ...(m.isPreventa ? { depositAmount: unitPrice * quantity } : {}),
          }];

      const willHaveCashOnly = newItems.some(i => i.product.payment_restriction === "cash_only");
      let newPaymentMethod = m.paymentMethod;
      if (willHaveCashOnly && !["Efectivo", "Dólares"].includes(m.paymentMethod)) {
        newPaymentMethod = "Efectivo";
        toast.info("Venta restringida a Efectivo/Dólares por artículos seleccionados", {
          icon: <AlertTriangle className="text-amber-500" size={16} />,
          style: { background: '#1a1400', color: '#fbbf24', border: '1px solid #78350f' }
        });
      }

      return { ...m, items: newItems, paymentMethod: newPaymentMethod };
    });
  };

  /**
   * Quitar producto del carrito (ADR-014: solo state local, sin sync server).
   */
  const removeFromCart = (pid: string) => {
    const mesaId = activeMesa.id;
    updMesa(mesaId, m => ({ ...m, items: m.items.filter(i => i.product.id !== pid) }));
  };

  /**
   * Cambiar cantidad de un item (+ / − en el carrito). ADR-014: solo state local.
   * Sin más toast "Sincronizando…" porque no hay nada que sincronizar — el server
   * se entera del carrito completo al detonar el cobro.
   */
  const changeQty = (pid: string, d: number) => {
    const mesaId = activeMesa.id;
    const currentItem = activeMesa.items.find(i => i.product.id === pid);
    if (!currentItem) return;
    const oldQty = currentItem.quantity;
    const newQty = oldQty + d;

    if (activeMesa.isPreventa) {
      const maxStock = currentItem.product.stock_details?.preventa;
      if (maxStock !== undefined && newQty > maxStock) {
        toast.error(`Límite de preventa: ${maxStock} unidad(es)`);
        return;
      }
    }

    if (d > 0 && currentItem.unitLimit !== undefined && newQty > currentItem.unitLimit) {
      toast.error(`Límite por cliente alcanzado: ${currentItem.unitLimit} unidad(es)`);
      return;
    }

    // Stock cross-tab (mismo browser): respeta lo que tienen otras cajas/mesas locales.
    if (d > 0 && !activeMesa.isPreventa && currentItem.sellingCatalogId == null && !currentItem.isFromPreSale) {
      const available = availableStockFor(currentItem.product, mesaId);
      if (available !== undefined && newQty > available) {
        const reserved = reservedInOtherMesas(currentItem.product.id, mesaId);
        toast.error(
          reserved > 0
            ? `Stock insuficiente: ${available} disponible(s) (${reserved} reservado(s) en otra caja).`
            : `Stock insuficiente: solo quedan ${available} disponible(s).`,
        );
        return;
      }
    }

    const unitPrice = currentItem.depositAmount != null && currentItem.quantity > 0
      ? currentItem.depositAmount / currentItem.quantity
      : getItemPrice(currentItem);

    updMesa(mesaId, m => ({
      ...m,
      items: m.items
        .map(i => i.product.id === pid
          ? {
              ...i,
              quantity: newQty,
              // Escala el anticipo proporcional cuando aplica:
              //  - modo preventa explícita (m.isPreventa)
              //  - item de catálogo en mixed-cart (sellingCatalogId)
              // Sin la segunda condición, +/- subía qty pero no escalaba
              // el depositAmount del catálogo y el total a cobrar quedaba
              // congelado en el anticipo inicial (bug reportado en QA).
              ...((m.isPreventa || i.sellingCatalogId != null) && i.depositAmount != null
                ? { depositAmount: Math.max(0, unitPrice * newQty) }
                : {}),
            }
          : i)
        .filter(i => i.quantity > 0),
    }));
  };

  const changeDeposit = (val: number) => updMesa(activeMesa.id, m => ({ ...m, depositAmount: val }));

  const changeLevel = (pid: string, level: PriceLevel) =>
    updMesa(activeMesa.id, m => ({ ...m, items: m.items.map(i => i.product.id === pid ? { ...i, priceLevel: level } : i) }));

  const toggleDamaged = (pid: string) =>
    updMesa(activeMesa.id, m => ({
      ...m,
      items: m.items.map(i => {
        if (i.product.id !== pid) return i;
        const willBeDamaged = !i.isDamaged;
        if (willBeDamaged && (i.product.stock_damaged ?? 0) <= 0) {
          toast.error("Este producto no tiene unidades dañadas registradas");
          return i;
        }
        // Al activar, pre-carga el precio actual como punto de partida
        const suggestedPrice = (() => {
          let base = i.product.price_a || 0;
          if (i.priceLevel === "b" && i.product.price_b) base = i.product.price_b;
          if (i.priceLevel === "c" && i.product.price_c) base = i.product.price_c;
          return base;
        })();
        return { ...i, isDamaged: willBeDamaged, damagedPrice: willBeDamaged ? suggestedPrice : undefined };
      }),
    }));

  const setDamagedPrice = (pid: string, price: number) =>
    updMesa(activeMesa.id, m => ({
      ...m,
      items: m.items.map(i => i.product.id === pid ? { ...i, damagedPrice: Math.max(0, price) } : i),
    }));



  // Política: preventas no aceptan Tarjeta (no podemos pasar la comisión al cliente
  // y el cobro físico se hace en mostrador con efectivo/transferencia). Detecta:
  //  - mesa marcada como preventa (catálogos en el carrito)
  //  - items de catálogo agregados con sellingCatalogId (mixed cart)
  //  - folio cargado para liquidación (isFromPreSale)
  const hasPreventaInCart = !!(activeMesa && (
    activeMesa.isPreventa
    || activeMesa.items.some(i => i.sellingCatalogId != null || i.isFromPreSale)
  ));

  const setPayment = (pm: PaymentMethod) => {
    if (pm === "Tarjeta" && hasPreventaInCart) {
      toast.error(
        "Esta venta incluye preventas. No se permite cobrar con Tarjeta · usa Efectivo, Dólares o Transferencia.",
        { duration: 5500 }
      );
      return;
    }
    // Tarjeta y Transferencia no usan campo de efectivo recibido — limpiarlo para
    // evitar que un monto residual (escrito antes en Dólares/Efectivo) se cuele al
    // ticket como "Recibido $100" cuando realmente se cobró el total con tarjeta.
    if (pm === "Tarjeta" || pm === "Transferencia") {
      setCashReceived("");
    }
    if (pm === "Tarjeta") {
      setShowTerminalModal(true);
    } else {
      updMesa(activeMesa.id, m => ({ ...m, paymentMethod: pm, selectedTerminalId: undefined }));
    }
  };

  const selectTerminal = (terminalId: number) => {
    updMesa(activeMesa.id, m => ({ ...m, paymentMethod: "Tarjeta", selectedTerminalId: terminalId }));
    setShowTerminalModal(false);
  };

  const togglePreventa = () => {
    const turningOn = !activeMesa.isPreventa;
    if (turningOn && activeMesa.paymentMethod === "Tarjeta") {
      toast.info(
        "Cambié el método de pago a Efectivo porque las preventas no se cobran con Tarjeta.",
        { duration: 5000 }
      );
    }
    updMesa(activeMesa.id, m => {
      const nextVal = !m.isPreventa;
      const nextPayment: PaymentMethod = (nextVal && m.paymentMethod === "Tarjeta") ? "Efectivo" : m.paymentMethod;
      // Reset items that don't have preventa stock if turning ON
      const nextItems = nextVal
        ? m.items.filter(i => (i.product.stock_details?.preventa || 0) > 0)
        : m.items;

      return {
        ...m,
        isPreventa: nextVal,
        paymentMethod: nextPayment,
        ...(nextPayment !== "Tarjeta" ? { selectedTerminalId: undefined } : {}),
        depositAmount: 0,
        items: nextItems,
      };
    });
    // Auto-open catalog in preventa mode so user picks products immediately
    if (turningOn) {
      setShowCatalog(true);
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    }
  };

  const toggleDiscount = (d: number) =>
    updMesa(activeMesa.id, m => ({ ...m, discount: m.discount === d ? 0 : d }));

  const setCustomer = (c: Customer) => {
    updMesa(activeMesa.id, m => ({
      ...m,
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone ?? "",
      customerEmail: c.email ?? "",
      isNewCustomer: false,
    }));
    setCustomerSearch(c.name);
    setShowCustDrop(false);
  };

  /**
   * Quitar cliente asignado a la venta activa. Disponible para todos los roles
   * mientras la caja está abierta y se está vendiendo — útil cuando el cajero
   * se equivocó de cliente o el cliente decidió no usar su credencial.
   *
   * Bloqueado solo cuando la venta es PREVENTA cargada de un folio existente
   * (el folio ya tiene customer_id en backend; quitarlo aquí lo desincronizaría
   * con la fila de pre_sale_orders).
   */
  const clearCustomer = () => {
    if (activeMesa.loadedPreSaleOrderId) {
      toast.error("No se puede quitar el cliente de un folio cargado.");
      return;
    }
    updMesa(activeMesa.id, m => ({
      ...m,
      customerId: undefined,
      customerName: undefined,
      customerPhone: "",
      customerEmail: "",
      isNewCustomer: false,
    }));
    setCustomerSearch("");
    toast.info("Cliente quitado de la venta");
  };

  /**
   * Vaciar carrito (ADR-014: solo state local). zustand snapshot persistido se
   * actualiza automáticamente vía el useEffect que escucha cambios de mesas[].
   */
  // ── Split por método de pago ──────────────────────────────────────────────
  /** True si el item se puede cobrar con `method`. Considera preventa (no
   * Tarjeta), cash_only y los flags allow_cash/allow_card del producto. */
  const itemAcceptsMethod = useCallback((item: CartItem, method: PaymentMethod): boolean => {
    const isCardMethod = method === "Tarjeta";
    // Preventa (catálogo) → no Tarjeta.
    if (item.sellingCatalogId != null) return !isCardMethod;
    // Producto cash_only → solo efectivo/dólares/transferencia.
    if (item.product.payment_restriction === "cash_only") return !isCardMethod;
    // Flags explícitos del producto.
    if (isCardMethod) return item.product.allow_card !== false;
    return item.product.allow_cash !== false;
  }, []);

  /** Método más razonable para cobrar un conjunto de items conflictivos. */
  const methodForItems = useCallback((items: CartItem[]): PaymentMethod => {
    const allCard = items.every(i =>
      i.sellingCatalogId == null &&
      i.product.payment_restriction !== "cash_only" &&
      i.product.allow_card !== false &&
      i.product.allow_cash === false  // realmente solo Tarjeta
    );
    if (allCard) return "Tarjeta";
    return "Efectivo";
  }, []);

  /**
   * Mueve los items que NO aceptan el método actual a otra caja libre (o crea
   * una nueva si todas están ocupadas). Copia el cliente y asigna el método
   * apropiado al destino. Útil cuando hay preventa + producto solo-tarjeta en
   * el mismo carrito (escenario que Joel reportó 2026-05-27).
   */
  const splitToOtherMesa = () => {
    const currentMethod = activeMesa.paymentMethod;
    // Excluye items vinculados a un folio cargado (isFromPreSale): no se pueden
    // mover sin romper la liquidación. Quedan en la mesa actual sí o sí.
    const movable = activeMesa.items.filter(i => !i.isFromPreSale);
    const compatible   = movable.filter(i =>  itemAcceptsMethod(i, currentMethod));
    const incompatible = movable.filter(i => !itemAcceptsMethod(i, currentMethod));

    if (incompatible.length === 0) {
      toast.info("No hay artículos con conflicto de método.");
      return;
    }
    if (compatible.length === 0) {
      toast.warning("Todos los artículos requieren otro método. Cámbialo arriba en lugar de mover.");
      return;
    }

    const targetMethod = methodForItems(incompatible);
    const existingFree = mesas.find(m => m.id !== activeMesa.id && m.items.length === 0);
    const target = existingFree ?? makeMesa(mesas.length + 1);
    const isNewMesa = !existingFree;

    const customerSnap = {
      customerId:    activeMesa.customerId,
      customerName:  activeMesa.customerName,
      customerPhone: activeMesa.customerPhone,
      customerEmail: activeMesa.customerEmail,
    };

    setMesas(prev => {
      const withTarget = isNewMesa ? [...prev, target] : prev;
      return withTarget.map(m => {
        if (m.id === activeMesa.id) {
          // Preserva items de folio cargado (isFromPreSale): no se pueden mover.
          const preserved = m.items.filter(i => i.isFromPreSale);
          // Si quedan items de folio, conserva el balance original (viene del
          // loadPreSaleOrder; no se recalcula desde items). Si no, suma deposits.
          const remainingDeposit = preserved.length > 0
            ? m.depositAmount
            : compatible.reduce((s, i) => s + (i.depositAmount ?? 0), 0);
          return { ...m, items: [...preserved, ...compatible], depositAmount: remainingDeposit };
        }
        if (m.id === target.id) {
          const hasPreventa = incompatible.some(i => i.sellingCatalogId != null);
          const deposit = incompatible.reduce((s, i) => s + (i.depositAmount ?? 0), 0);
          return {
            ...m,
            items: [...m.items, ...incompatible],
            paymentMethod: targetMethod,
            ...customerSnap,
            isPreventa: hasPreventa,
            depositAmount: deposit,
          };
        }
        return m;
      });
    });

    toast.success(
      `${incompatible.length} artículo(s) movido(s) a ${target.name} (${targetMethod})${isNewMesa ? ' — caja nueva' : ''}`,
      {
        icon: <ArrowLeftRight className="text-emerald-400" size={16} />,
        style: { background: '#052e16', color: '#86efac', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '14px' },
      }
    );
  };

  const clearCart = () => {
    const mesaId = activeMesa.id;
    updMesa(mesaId, m => ({
      ...m, items: [], customerId: undefined, customerName: undefined,
      customerPhone: "", customerEmail: "", isNewCustomer: false, discount: 0, depositAmount: 0,
      selectedTerminalId: undefined, absorbCommission: true,
      isPreventa: false, loadedPreSaleOrderId: undefined, loadedPreSaleOrderCode: undefined,
      cashReceived: "",
      cashReceivedUsd: "",
      usdPrimaryMode: false,
    }));
    // Defensa contra fuga de cliente entre ventas consecutivas (bug reportado
    // Joel 2026-05-27 en prod): reseteamos también todo el estado del popup
    // de asignar cliente y el dropdown de búsqueda. Sin esto, un popup abierto
    // o un search con texto pre-rellenaba la siguiente venta.
    setCustomerSearch("");
    setShowCustDrop(false);
    setRequireCustomerFlash(false);
    setAssignCustomerPopup(null);
  };

  const handleCreateCustomer = () => {
    if (!customerSearch.trim()) return;
    const name = customerSearch.trim();
    updMesa(activeMesa.id, m => ({ ...m, customerId: undefined, customerName: name, customerPhone: "", isNewCustomer: true }));
    setCustomerSearch(name);
    setShowCustDrop(false);
    toast.success(`Cliente "${name}" preparado para registro automático`, {
      icon: <UserPlus className="text-emerald-500" size={16} />,
      style: { background: '#061a10', color: '#10b981', border: '1px solid #064e3b' }
    });
  };

  const activeTerminal = useMemo(() => terminals.find(t => t.id === activeMesa.selectedTerminalId), [terminals, activeMesa.selectedTerminalId]);
  const hasAssignedCustomer = !!activeMesa.customerName?.trim();

  // Si el método quedó como "Tarjeta" desde localStorage pero no hay terminal
  // (la guardada ya no existe o nunca se eligió), abrimos el modal solo cuando
  // el cajero intente cobrar. No al cargar — sería ruidoso si llega y aún no
  // está listo. El badge "Elegir terminal" en el botón ya marca el faltante.
  // Auto-clear de selectedTerminalId zombie: si el id apunta a una terminal
  // que ya no existe en la lista, lo limpiamos.
  useEffect(() => {
    if (
      activeMesa?.paymentMethod === "Tarjeta"
      && activeMesa.selectedTerminalId
      && terminals.length > 0
      && !activeTerminal
    ) {
      updMesa(activeMesa.id, m => ({ ...m, selectedTerminalId: undefined }));
    }
  }, [activeTerminal, activeMesa?.paymentMethod, activeMesa?.selectedTerminalId, terminals.length]);

  // Mapas para el catálogo: stock disponible ajustado por reservas de otras cajas,
  // y desglose de qué está reservado en qué caja (para mostrar "2 en Caja 3" en cada card).
  const catalogAvailableStock = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const p of products) {
      const total = p.stock_details?.tienda ?? p.stock;
      if (total === undefined) continue;
      map[p.id] = Math.max(0, total - reservedInOtherMesas(p.id, activeMesa.id));
    }
    return map;
  }, [products, mesas, activeMesa.id, reservedInOtherMesas]);

  const catalogReservedByMesa = useMemo<Record<string, Array<{ mesaName: string; qty: number }>>>(() => {
    const map: Record<string, Array<{ mesaName: string; qty: number }>> = {};
    for (const m of mesas) {
      if (m.id === activeMesa.id) continue;
      for (const item of m.items) {
        if (item.sellingCatalogId != null || item.isFromPreSale) continue;
        const list = map[item.product.id] ?? (map[item.product.id] = []);
        const existing = list.find(e => e.mesaName === m.name);
        if (existing) existing.qty += item.quantity;
        else list.push({ mesaName: m.name, qty: item.quantity });
      }
    }
    return map;
  }, [mesas, activeMesa.id]);
  
  const subtotal       = useMemo(() => activeMesa.items.reduce((s, i) => s + getItemPrice(i) * i.quantity, 0), [activeMesa.items]);
  const discountAmt    = subtotal * (activeMesa.discount / 100);
  const totalBeforeComm = subtotal - discountAmt;
  const totalDeposit   = useMemo(() => activeMesa.items.reduce((s, i) => s + (i.depositAmount ?? 0), 0), [activeMesa.items]);
  const totalItems     = activeMesa.items.reduce((s, i) => s + i.quantity, 0);
  // Subtotal de ítems nuevos (no de preventa cargada) — usado en carrito mixto
  const newItemsSubtotal = useMemo(
    () => activeMesa.items.filter(i => !i.isFromPreSale).reduce((s, i) => s + getItemPrice(i) * i.quantity, 0),
    [activeMesa.items]
  );
  
  // Comisión interna: se calcula y se manda al backend para reportes,
  // pero NUNCA se suma al total que paga el cliente. La tienda absorbe siempre.
  const commissionAmt = useMemo(() => {
    if (activeMesa.paymentMethod !== "Tarjeta" || !activeTerminal) return 0;
    const baseAmount = activeMesa.isPreventa ? totalDeposit : totalBeforeComm;
    return baseAmount * (activeTerminal.commission_percent / 100);
  }, [activeMesa.paymentMethod, activeTerminal, totalBeforeComm, activeMesa.isPreventa, totalDeposit]);

  // Total a cobrar al cliente = subtotal − descuento. SIN comisión.
  const total = totalBeforeComm;

  // El monto real a cobrar en la transacción actual (sin comisión, la tienda absorbe).
  // Mixed cart (catálogo + regular sin modo preventa explícito): cobra regular + anticipos.
  const currentPayAmount = useMemo(() => {
    if (activeMesa.loadedPreSaleOrderId) {
      // Items de preventa ya vienen con precio proporcional al saldo → subtotal = balance + items nuevos
      return totalBeforeComm;
    }
    if (activeMesa.isPreventa) {
      // Modo preventa explícito: solo se cobran los anticipos.
      return totalDeposit;
    }
    // Cart mixto sin modo preventa: regular full price + anticipos de catálogo.
    const regularSubtotal = activeMesa.items
      .filter(i => i.sellingCatalogId == null)
      .reduce((s, i) => s + getItemPrice(i) * i.quantity, 0);
    const catalogDeposit = activeMesa.items
      .filter(i => i.sellingCatalogId != null)
      .reduce((s, i) => s + (i.depositAmount ?? 0), 0);
    return regularSubtotal + catalogDeposit;
  }, [activeMesa.loadedPreSaleOrderId, activeMesa.isPreventa, activeMesa.items, totalDeposit, totalBeforeComm]);
    
  const totalUSD       = tc > 0 ? currentPayAmount / tc : 0;

  // Bloqueo por método incompatible (QA crítico 2026-06-08): si CUALQUIER item
  // del carrito no acepta el método actual (solo-efectivo con Tarjeta, o
  // solo-tarjeta con Efectivo/Transferencia), el cobro se bloquea. Antes esta
  // variable existía pero no se usaba en ningún lado.
  const payBlocked = activeMesa.items.some(i => !itemAcceptsMethod(i, activeMesa.paymentMethod));

  const hasCatalogItems = activeMesa.items.some(i => i.sellingCatalogId != null);
  const checkoutDisabled = activeMesa.items.length === 0 || isProcessing || payBlocked ||
    (activeMesa.isPreventa && !activeMesa.loadedPreSaleOrderId && !hasCatalogItems && totalDeposit <= 0);

  const apartarDisabled = activeMesa.items.length === 0 || !activeMesa.customerId || apartarProcessing;

  // Sincroniza el state local de preventas desde el cache RQ. Sin esto, abrir
  // el modal disparaba 2 fetches cada vez. Ahora se hace 1 vez al montar y se
  // refresca al "Actualizar" o handleOpenCash invalida.
  useEffect(() => {
    if (preSaleCatalogsQuery.data) {
      setPreSaleCatalogs(preSaleCatalogsQuery.data.data);
    }
  }, [preSaleCatalogsQuery.data]);

  useEffect(() => {
    if (!preSaleOrdersQuery.data) return;
    const orders = preSaleOrdersQuery.data.data;
    const todayV = new Date(); todayV.setHours(0, 0, 0, 0);
    const hasExpiredActiveItem = (o: PreSaleOrder) =>
      (o.items ?? []).some(it =>
        it.catalog?.pickup_deadline &&
        it.catalog.status !== 'cancelled' &&
        it.catalog.status !== 'closed' &&
        it.catalog.status !== 'completed' &&
        new Date(it.catalog.pickup_deadline) < todayV
      );
    setPreSaleOrdersPending(orders.filter(o => o.status === 'pending' || o.status === 'ready'));
    setPreSaleOrdersDelivered(orders.filter(o => o.status === 'delivered'));
    setPreSaleOrdersExpired(orders.filter(o =>
      o.status !== 'delivered' && o.status !== 'cancelled' && hasExpiredActiveItem(o)
    ));
  }, [preSaleOrdersQuery.data]);

  const openPreSalesModal = (tab: 'venta' | 'liquidar' | 'completadas' | 'vencidas' | 'difusion' = 'venta') => {
    setPickerSearch("");
    setPreSalesTab(tab);
    setShowPreSalesModal(true);
    // Loading visible solo si las queries aún están cargando por primera vez.
    setPickerLoading(preSaleCatalogsQuery.isPending || preSaleOrdersQuery.isPending);
    // Refresca catálogos + folios al abrir para que reserved_count sea fresh —
    // evita el caso "card dice 1 disponible" pero backend rechaza con "0".
    void queryClient.invalidateQueries({ queryKey: queryKeys.preSaleCatalogs.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.preSaleOrders.all });
  };

  const searchByFolio = async (code: string) => {
    const query = code.trim();
    if (!query) return;
    setFolioLoading(true);
    try {
      const res = await getPreSaleOrders({ code: query, per_page: 10 });
      const found = res.data[0];
      if (found) {
        const detail = await getPreSaleOrder(found.id);
        await loadPreSaleOrderIntoCart(detail);
      } else {
        toast.error(`No se encontró el folio "${query}"`);
      }
    } catch {
      toast.error("Error al buscar la preventa");
    } finally {
      setFolioLoading(false);
    }
  };

  // Dedupe: ignora el mismo código si llega dentro de los 1500ms del último escaneo.
  // Cubre doble-lectura del HID, StrictMode y rebote físico del lector.
  // Subido de 500ms → 1500ms porque ciertos scanners siguen reportando duplicados a ~700-1200ms.
  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  // Maneja un código escaneado (USB HID o cámara). Rutea PREV-* → folio, sino → producto por SKU.
  const handleScannedCode = async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    // Dedup window 3s — defensiva contra lectores HID que emiten doble Enter,
    // o cajeros que escanean dos veces creyendo que la primera "no funcionó".
    // El cajero quiere qty=2 → debe usar +/- manual, no rescanear.
    if (lastScanRef.current.code === code && now - lastScanRef.current.at < 3000) {
      return;
    }
    lastScanRef.current = { code, at: now };
    if (/^PREV-\d+/i.test(code)) {
      toast.info(`Cargando folio ${code.toUpperCase()}…`);
      await searchByFolio(code.toUpperCase());
      return;
    }
    // Socio Tadaima (códigos TAD + dígitos en tarjetas de lealtad).
    if (/^TAD\d+$/i.test(code)) {
      // Si la mesa ya tiene cliente asignado, skip silencioso para evitar abrir
      // popup en cada re-escaneo accidental durante la misma venta.
      if (activeMesa.customerId) {
        toast.info("Esta venta ya tiene cliente asignado.");
        return;
      }
      await openCustomerScanPopup(code.toUpperCase());
      return;
    }
    // 1. Try local cache first (top 200 + background 1000 + previous searches).
    //    Scanner-origin: si ya está en venta, NO suma (los lectores HID pueden
    //    rebotar varias veces el mismo código → cajero usa +/- manualmente).
    //    Match por SKU o barcode (mangas/libros llegan por barcode).
    const lc = code.toLowerCase();
    const local = products.find(p =>
      p.sku.toLowerCase() === lc
      || (p.barcode ?? '').toLowerCase() === lc);
    if (local) {
      // addScanToCart maneja internamente el "ya está" → no duplicar ni sumar
      // y emite el toast apropiado (info o success).
      addScanToCart(local, "a");
      return;
    }
    // 2. Cache miss → hit backend directly (no debounce, scanner is an
    //    explicit action). Use the search query cache so a re-scan of the
    //    same SKU within 60s doesn't refetch.
    try {
      const fresh = await queryClient.fetchQuery({
        queryKey: [...queryKeys.products.all, 'light', 'search', code, activeStore?.id ?? null],
        queryFn: () => getProductsLight({
          search: code,
          per_page: 5,
          active: true,
          ...(activeStore?.id ? { store_id: activeStore.id } : {}),
        } as Parameters<typeof getProductsLight>[0]),
        staleTime: 60_000,
      });
      const exact = fresh.data.find(p =>
        p.sku.toLowerCase() === code.toLowerCase()
        || (p.barcode ?? '').toLowerCase() === code.toLowerCase()
      );
      if (exact) {
        const adapted: Product = {
          id: String(exact.id),
          name: exact.name,
          sku: exact.sku,
          barcode: exact.barcode ?? undefined,
          category: String(exact.category_id ?? ""),
          image: exact.image ?? "",
          price_a: Number(exact.prices?.price_1 ?? 0) || 0,
          price_b: Number(exact.prices?.price_2 ?? 0) > 0 ? Number(exact.prices.price_2) : undefined,
          price_c: Number(exact.prices?.price_3 ?? 0) > 0 ? Number(exact.prices.price_3) : undefined,
          price_d: Number(exact.prices?.price_4 ?? 0) > 0 ? Number(exact.prices.price_4) : undefined,
          price_e: Number(exact.prices?.price_5 ?? 0) > 0 ? Number(exact.prices.price_5) : undefined,
          stock: typeof exact.stock_total === "number" ? exact.stock_total : undefined,
          stock_details: typeof exact.stock_total === "number"
            ? { tienda: exact.stock_total, bodega: 0, preventa: 0, dañado: 0 }
            : undefined,
          active: exact.active,
        } as Product;
        // Scanner usa addScanToCart (nunca suma). Si ya está en venta, toast info.
        addScanToCart(adapted, "a");
        return;
      }
    } catch {
      // Network error — fall through to the "not found" path.
    }
    setSearch(code);
    toast.warning(`Sin coincidencias para "${code}"`);
  };

  // Lector USB HID activo siempre que estemos en SellPage y no haya un modal de form abierto.
  // El modal de cámara desactiva el HID para evitar doble lectura.
  useBarcodeScanner({
    onScan: code => { void handleScannedCode(code); },
    enabled: !showCameraScanner && !showCatalog && !showApartarModal && !showOpenCashModal && !showCloseCashModal,
  });

  const loadPreSaleOrderIntoCart = async (order: PreSaleOrder) => {
    if (!order.items?.length) {
      toast.error("Esta preventa no tiene productos para cargar");
      return;
    }
    const levelMap: Record<number, PriceLevel> = { 1: "a", 2: "b", 3: "c", 4: "d", 5: "e" };

    const toCartItem = (it: PreSaleOrderItem, delivered: boolean): CartItem => ({
      product: {
        id: String(it.product_id ?? `catalog-${it.pre_sale_catalog_id}`),
        name: it.catalog?.product_name ?? "Producto preventa",
        sku: "",
        category: "",
        price_a: it.unit_price,
      },
      quantity: it.quantity,
      priceLevel: levelMap[it.price_level] ?? "a",
      isFromPreSale: true,
      preSaleOrderItemId: it.id,
      preSaleItemDelivered: delivered,
    });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rawPending = order.items.filter(it =>
      it.status !== 'delivered' &&
      it.catalog?.status === 'arrived' &&
      !(it.catalog?.pickup_deadline && new Date(it.catalog.pickup_deadline) < today)
    );
    const deliveredItems: CartItem[] = order.items.filter(it => it.status === 'delivered').map(it => toCartItem(it, true));

    // Check stock for pending items that have a linked product
    const stockChecks = await Promise.all(
      rawPending.map(async it => {
        if (it.product_id == null) return { item: it, hasStock: true };
        try {
          const inv = await getInventory({ product_id: it.product_id });
          const hasStock = inv
            .filter(i => i.warehouse?.store?.id === activeStore?.id)
            .some(i => (i.quantity ?? 0) > 0);
          return { item: it, hasStock };
        } catch {
          return { item: it, hasStock: false };
        }
      })
    );

    const itemsWithStock = stockChecks.filter(s => s.hasStock).map(s => toCartItem(s.item, false));
    const skippedCount = stockChecks.filter(s => !s.hasStock).length;
    const preSaleItems = [...itemsWithStock, ...deliveredItems];

    if (!preSaleItems.length) {
      toast.error("No hay stock disponible en esta tienda para esta preventa");
      return;
    }

    if (skippedCount > 0) {
      toast.warning(`${skippedCount} producto(s) sin stock en esta tienda — no se agregaron a la venta`);
    }

    const balance = order.balance ?? order.total ?? 0;

    // Distribute balance proportionally across PENDING items; delivered show at $0
    const pendingTotal = itemsWithStock.reduce((s, i) => s + (i.product.price_a || 0) * i.quantity, 0);
    const ratio = pendingTotal > 0 ? balance / pendingTotal : 1;
    const balancedItems: CartItem[] = preSaleItems.map(i => ({
      ...i,
      product: {
        ...i.product,
        price_a: i.preSaleItemDelivered ? 0 : (i.product.price_a || 0) * ratio,
      },
    }));

    // Política: liquidación de preventa no se cobra con Tarjeta. Si la mesa
    // estaba en Tarjeta, forzar Efectivo + avisar.
    if (activeMesa.paymentMethod === "Tarjeta") {
      toast.info(
        "Cambié el método de pago a Efectivo porque las preventas no se cobran con Tarjeta.",
        { duration: 5000 }
      );
    }

    updMesa(activeMesa.id, m => ({
      ...m,
      paymentMethod: m.paymentMethod === "Tarjeta" ? "Efectivo" : m.paymentMethod,
      ...(m.paymentMethod === "Tarjeta" ? { selectedTerminalId: undefined } : {}),
      items: [...balancedItems, ...m.items.filter(i => !i.isFromPreSale)],
      loadedPreSaleOrderId: order.id,
      loadedPreSaleOrderCode: order.code,
      depositAmount: balance,
      customerId: order.customer ? String(order.customer.id) : m.customerId,
      customerName: order.customer?.name ?? m.customerName,
      customerPhone: order.customer?.phone ?? m.customerPhone,
      customerEmail: order.customer?.email ?? m.customerEmail,
    }));

    setShowPreSalesModal(false);
    setFolioInput("");
    toast.success(`Preventa ${order.code} cargada · Saldo: ${fmt(balance)}`);
  };

  // Adds a catalog item to the cart for reservation. Creates the PreSaleOrder at checkout.
  const addCatalogToCart = (catalog: PreSaleCatalog, priceLevel: PriceLevel = "a") => {
    const anticipo = catalog.advance_payment ?? 0;
    const catalogImg = catalog.image_url ?? (catalog.image_path ? storageUrl(catalog.image_path) : "");

    // Política: preventas no aceptan Tarjeta. Si la mesa estaba en Tarjeta, cambia
    // a Efectivo automáticamente y avisa al cajero (tomamos control como pidió Joel).
    if (activeMesa.paymentMethod === "Tarjeta") {
      toast.info(
        "Cambié el método de pago a Efectivo porque las preventas no se cobran con Tarjeta.",
        { duration: 5000 }
      );
    }

    // NO setear isPreventa: true a nivel mesa — el item ya viene con sellingCatalogId
    // y su propio depositAmount, así no contamina con anticipo a productos regulares.
    updMesa(activeMesa.id, m => {
      // Asegura que el método de pago no sea Tarjeta cuando entra una preventa.
      const safePayment: PaymentMethod = m.paymentMethod === "Tarjeta" ? "Efectivo" : m.paymentMethod;
      // Idempotente: si ya existe un item con el mismo sellingCatalogId, sumar qty
      // en lugar de duplicar la fila (bug típico al doble-click en la card del modal).
      const existing = m.items.find(i => i.sellingCatalogId === catalog.id);
      if (existing) {
        // Respeta el unitLimit del catálogo si está definido
        const limit = catalog.preorder_limit ?? Infinity;
        if (existing.quantity + 1 > limit) {
          toast.error(`Límite por cliente alcanzado: ${limit} unidad(es)`);
          return m;
        }
        return {
          ...m,
          paymentMethod: safePayment,
          ...(safePayment !== "Tarjeta" ? { selectedTerminalId: undefined } : {}),
          items: m.items.map(i => i.sellingCatalogId === catalog.id
            ? { ...i, quantity: i.quantity + 1, depositAmount: (i.depositAmount ?? 0) + anticipo }
            : i),
        };
      }

      const item: CartItem = {
        product: {
          id: `catalog-${catalog.id}`,
          name: catalog.product_name,
          sku: `PREV-${catalog.id}`,
          category: catalog.category?.name ?? "Preventa",
          image: catalogImg,
          price_a: catalog.price_1 ?? 0,
          ...(catalog.price_2 != null ? { price_b: catalog.price_2 } : {}),
          ...(catalog.price_3 != null ? { price_c: catalog.price_3 } : {}),
          ...(catalog.price_4 != null ? { price_d: catalog.price_4 } : {}),
          ...(catalog.price_5 != null ? { price_e: catalog.price_5 } : {}),
        },
        quantity: 1,
        priceLevel,
        depositAmount: anticipo,
        sellingCatalogId: catalog.id,
        ...(catalog.preorder_limit != null ? { unitLimit: catalog.preorder_limit } : {}),
      };
      return {
        ...m,
        paymentMethod: safePayment,
        ...(safePayment !== "Tarjeta" ? { selectedTerminalId: undefined } : {}),
        items: [...m.items, item],
      };
    });
    setShowPreSalesModal(false);
    toast.success(`${catalog.product_name} agregado a la venta · Anticipo mín.: ${fmt(anticipo)}`);

    // Preventa requiere cliente para cobrar. Si la mesa no tiene uno asignado,
    // abrir el popup de cliente para que el cajero lo asigne ahora (no al cobrar).
    if (!activeMesa.customerId) {
      // Delay mínimo para que el modal de preventas se cierre antes de abrir el otro.
      setTimeout(() => {
        setAssignCustomerPopup({
          mode: 'manual', candidate: null, search: "", searching: false,
          searchResults: { locales: [], externos: [] }, assigning: false,
          createForm: { open: false, name: "", phone: "", email: "", saving: false },
        });
      }, 150);
    }
  };

  const openApartarModal = () => {
    setApartarItemIdx(0);
    setApartarDownPayment("");
    setApartarPayMethodId(paymentMethods[0] ? String(paymentMethods[0].id) : "");
    setApartarExpiresAt("");
    setApartarNotes("");
    setShowApartarModal(true);
  };

  const handleApartar = async () => {
    if (!activeStore || !activeMesa.customerId) return;
    const item = activeMesa.items[apartarItemIdx];
    if (!item) return;
    const dp = parseFloat(apartarDownPayment) || 0;
    if (dp <= 0) { toast.error("El anticipo debe ser mayor a $0"); return; }
    setApartarProcessing(true);
    try {
      const layaway = await createLayaway({
        store_id: activeStore.id,
        customer_id: Number(activeMesa.customerId),
        product_id: Number(item.product.id),
        quantity: item.quantity,
        price: getItemPrice(item),
        down_payment: dp,
        payment_method_id: apartarPayMethodId ? Number(apartarPayMethodId) : undefined,
        expires_at: apartarExpiresAt || undefined,
        notes: apartarNotes || undefined,
      });
      // Remove the layawayed item from the cart
      await removeFromCart(item.product.id);
      // Stock changed → refresh products + reservedStock para que otras cajas
      // vean inmediatamente que ya no está reservado en este draft.
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.salesDrafts.all });
      setShowApartarModal(false);
      toast.success(`Apartado creado · Folio ${layaway.code ?? layaway.id}`, {
        style: { background: '#1a0a00', color: '#fff', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '16px' }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al crear el apartado";
      toast.error(msg);
    } finally {
      setApartarProcessing(false);
    }
  };

  const filteredProds = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      const name = (p.name ?? "").toLowerCase();
      const sku  = (p.sku  ?? "").toLowerCase();
      const matchesSearch = (!q || name.includes(q) || sku.includes(q));

      if (activeMesa.isPreventa) {
        return matchesSearch && (p.stock_details?.preventa || 0) > 0;
      }
      return matchesSearch;
    });
  }, [products, search, activeMesa.isPreventa]);

  /**
   * Detecta cuándo el cajero está buscando un folio de preventa (input
   * empieza con "PREV-" o "prev-"). En ese caso el dropdown del search
   * muestra folios matching en vez de productos.
   */
  const isFolioSearch = useMemo(() => /^prev-/i.test(search.trim()), [search]);

  /**
   * Folios que matchean el código tecleado por el cajero (cache RQ ya cargado
   * al abrir caja). Filtra cancelados + vencidos (no se pueden liquidar).
   * Mantiene pending/ready (para liquidar o ver pendientes de llegada) y
   * delivered (para reimpresión de ticket).
   */
  const filteredFolios = useMemo(() => {
    if (!isFolioSearch) return [];
    const q = search.trim().toLowerCase();
    const all = preSaleOrdersQuery.data?.data ?? [];
    return all
      .filter(o => o.status !== 'cancelled')
      .filter(o => o.code.toLowerCase().includes(q))
      .slice(0, 8);
  }, [isFolioSearch, search, preSaleOrdersQuery.data]);

  const filteredCusts = useMemo(() => {
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      (c.name ?? "").toLowerCase().includes(q) ||
      (c.external_member_id ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const handleOpenCash = async () => {
    // Modelo "una caja por persona" (ADR-017): el backend crea/reusa la caja
    // personal del usuario a partir de la TIENDA. Ya no exigimos un register_id
    // pre-existente — una tienda recién creada no tiene caja todavía y antes
    // eso bloqueaba abrir (huevo-gallina). Mandamos store_id; register_id es
    // un atajo opcional cuando ya existe la caja.
    const registerId = openCashRegisterId !== "" ? Number(openCashRegisterId) : cashRegisters[0]?.id;
    const storeId = activeStore?.id;
    if (!registerId && !storeId) {
      toast.error("Selecciona una tienda para abrir caja.");
      return;
    }
    const amount = parseFloat(openCashAmount) || 0;
    setOpeningCash(true);
    try {
      const result = await openSession({ storeId, registerId }, amount);

      // Conflicto: ya existe otra sesión que bloquea la apertura. Mostramos
      // modal apropiado y cerramos el de "Abrir Sesión de Caja". El handler
      // ResumeSession/SessionConflict decide qué hacer (continuar, forzar
      // cierre, cerrar y abrir nueva).
      if (!result.ok) {
        setOpenSessionConflict(result.conflict);
        setShowOpenCashModal(false);
        return;
      }
      const session = result.session;
      // Seed la cache con el response del POST en vez de invalidar — evita
      // el GET extra /cash/session (~1s en prod) y la UI flipea a "Caja
      // Abierta" en cuanto el modal se cierra.
      queryClient.setQueryData(['cash', 'activeSession'], session);
      setShowOpenCashModal(false);
      toast.success(`Caja abierta · $${amount.toFixed(0)} inicial`);

      // Refrescos pesados (TC + productos + preventas) en background al
      // próximo idle para no bloquear el flip de UI. Stock fresco igual
      // llega ~1-2s después sin que el cajero sienta el "thinking".
      // Sin esto el cajero puede entrar con cache de 24h y agregar al
      // carrito cantidades que el server rechazará al cobrar.
      const refreshHeavyCaches = (): void => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings.exchangeRate() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.preSaleCatalogs.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.preSaleOrders.all });
      };
      type IdleCallback = (cb: () => void, opts?: { timeout: number }) => number;
      const ric = (typeof window !== 'undefined'
        ? (window as unknown as { requestIdleCallback?: IdleCallback }).requestIdleCallback
        : undefined);
      if (ric) {
        ric(refreshHeavyCaches, { timeout: 500 });
      } else {
        setTimeout(refreshHeavyCaches, 0);
      }
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "Error al abrir caja";
      toast.error(msg);
    } finally {
      setOpeningCash(false);
    }
  };

  /** Continuar la sesión existente del usuario (no crea nueva, solo seedea cache). */
  const handleResumeOwnSession = async () => {
    if (!openSessionConflict) return;
    setResolvingConflict(true);
    try {
      // Fetch fresh active session — backend ya garantizó que existe y es del user.
      await queryClient.invalidateQueries({ queryKey: ['cash', 'activeSession'] });
      const refreshed = await queryClient.fetchQuery({
        queryKey: ['cash', 'activeSession'],
        queryFn: () => getActiveSession(),
      });
      if (refreshed) {
        queryClient.setQueryData(['cash', 'activeSession'], refreshed);
      }
      toast.success(`Continuando sesión #${openSessionConflict.existing_session.id}`);
      setOpenSessionConflict(null);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "No se pudo cargar la sesión";
      toast.error(msg);
    } finally {
      setResolvingConflict(false);
    }
  };

  /**
   * Cierra la sesión existente (propia en otra caja, o ajena con admin) y
   * abre una nueva en la caja solicitada. Reusa los inputs del modal anterior
   * (openCashRegisterId + openCashAmount).
   */
  const handleForceCloseAndReopen = async () => {
    if (!openSessionConflict) return;
    const sessionId = openSessionConflict.existing_session.id;
    setResolvingConflict(true);
    try {
      await forceCloseSession(sessionId);
      // Una vez cerrada la anterior, reintenta abrir la nueva con los mismos
      // parámetros que el modal original.
      const registerId = openCashRegisterId !== "" ? Number(openCashRegisterId) : cashRegisters[0]?.id;
      const storeId = activeStore?.id;
      const amount = parseFloat(openCashAmount) || 0;
      if (!registerId && !storeId) {
        toast.success("Sesión anterior cerrada. Vuelve a intentar abrir caja.");
        setOpenSessionConflict(null);
        return;
      }
      const result = await openSession({ storeId, registerId }, amount);
      if (!result.ok) {
        // Raro: cerramos una y aún hay otra. Mostrar el nuevo conflicto.
        setOpenSessionConflict(result.conflict);
        return;
      }
      queryClient.setQueryData(['cash', 'activeSession'], result.session);
      void queryClient.invalidateQueries({ queryKey: ['cash', 'activeSessions'] });
      void queryClient.invalidateQueries({ queryKey: ['cash', 'registers'] });
      toast.success(`Caja abierta · $${amount.toFixed(0)} inicial`);
      setOpenSessionConflict(null);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "Error al cerrar la sesión anterior";
      toast.error(msg);
    } finally {
      setResolvingConflict(false);
    }
  };

  const handleCloseCash = async () => {
    const amount = parseFloat(closeCashAmount) || 0;
    setClosingCashLoading(true);
    try {
      // Manda el día local del corte — el timestamp UTC del backend ya cae
      // en "mañana" después de las 11pm Tijuana (el corte se iba al día 12).
      const closedSession = await closeSession(amount, getTodayLocal());
      // Limpiar la caché de sesión activa SINCRÓNICAMENTE antes de cualquier
      // setState. El efecto de auto-asignación (línea ~553) lee `cashSession`
      // de la caché — si dejamos la versión vieja "open" y solo invalidamos,
      // el re-render entre setActiveStore(null) y el refetch reasigna la tienda
      // y el admin nunca ve el selector (síntoma: solo Tienda 1 sin hard reload).
      queryClient.setQueryData(['cash', 'activeSession'], null);
      void queryClient.invalidateQueries({ queryKey: ['cash'] });
      setShowCloseCashModal(false);
      setCloseCashAmount("");
      toast.success("Caja cerrada — corte registrado");

      // Trae el corte detallado del endpoint /reports/cash y abre el modal
      // de Corte de Caja con resumen + opción de imprimir.
      const today = new Date();
      const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      try {
        const report = await getCashReport({
          register_id: closedSession.register_id,
          from: localDate,
          to: localDate,
        });
        const match = report.sessions.find(x => x.id === closedSession.id);
        if (match) setCashCloseSummary(match);
      } catch {
        // Si el fetch falla, no rompemos el flujo de cierre — solo no abre el modal
      }

      if (isAdmin) {
        setActiveStore(null);
      }
    } catch {
      toast.error("Error al cerrar la caja");
    } finally {
      setClosingCashLoading(false);
    }
  };

  const doPrintTicket = (sale: CompletedSaleData) => {
    const win = window.open("", "_blank", "width=340,height=600");
    if (!win) return;

    const regularTotal = sale.items.reduce((s, i) => s + i.price * i.quantity, 0);
    // Formato clásico de ticket (Joel 2026-06-12): nombre en su línea y abajo
    // "cant × precio unitario" + importe. Antes salía "×2 $800" (importe de la
    // línea) y se leía como si cada pieza costara $800.
    const itemRows = (name: string, qty: number, unitPrice: number) => `
      <tr><td colspan="3" style="padding:3px 0 0;font-size:10px">${name}</td></tr>
      <tr><td colspan="2" style="padding:0 0 3px 8px;font-size:9px;color:#555">${qty} × ${fmt(unitPrice)}</td><td style="text-align:right;font-size:10px;font-weight:700;vertical-align:bottom;padding-bottom:3px">${fmt(unitPrice * qty)}</td></tr>`;
    const regularRows = sale.items.map(i => itemRows(i.name, i.quantity, i.price)).join("");

    // Saldo restante de la preventa (QA 2026-06-08): en anticipo nuevo es
    // total − anticipo; en liquidación el folio queda en ceros.
    const preSaleTotal = (sale.preSaleItems ?? []).reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const preSaleSaldo = sale.preSaleIsLiquidation ? 0 : Math.max(0, preSaleTotal - (sale.preSaleAnticipo ?? 0));
    const preSaleSection = sale.preSaleCode ? `
      <div class="divider"></div>
      <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">
        ★ PREVENTA · Folio ${sale.preSaleCode}
      </div>
      <table>
        <tbody>
          ${(sale.preSaleItems ?? []).map(i => itemRows(i.name, i.quantity, i.unitPrice)).join("")}
        </tbody>
        <tfoot>
          <tr><td colspan="2" style="font-size:9px;padding-top:4px">Total preventa</td><td style="text-align:right;font-size:10px;padding-top:4px">${fmt(preSaleTotal)}</td></tr>
          <tr><td colspan="2" style="font-size:9px">${sale.preSaleIsLiquidation ? "Liquidación pagada" : "Anticipo pagado"}</td><td style="text-align:right;font-size:10px;font-weight:900">${fmt(sale.preSaleAnticipo ?? 0)}</td></tr>
          <tr><td colspan="2" style="font-size:10px;font-weight:900">${preSaleSaldo > 0 ? "SALDO RESTANTE" : "SALDO"}</td><td style="text-align:right;font-size:11px;font-weight:900">${preSaleSaldo > 0 ? fmt(preSaleSaldo) : `${fmt(0)} ✓ LIQUIDADO`}</td></tr>
        </tfoot>
      </table>` : "";

    const regularSection = sale.items.length > 0 ? `
      ${sale.preSaleCode ? `<div class="divider"></div><div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">PRODUCTOS</div>` : ""}
      <table>
        <tbody>${regularRows}</tbody>
        ${!sale.preSaleCode ? `<tfoot><tr class="total-row"><td colspan="2">TOTAL</td><td style="text-align:right">${fmt(sale.total)}</td></tr></tfoot>` : ""}
      </table>` : "";

    const grandTotal = sale.preSaleCode ? `
      <div class="divider"></div>
      <table><tfoot>
        ${sale.preSaleAnticipo ? `<tr><td colspan="2" style="font-size:9px">Anticipo preventa</td><td style="text-align:right;font-size:9px">${fmt(sale.preSaleAnticipo)}</td></tr>` : ""}
        ${sale.items.length > 0 ? `<tr><td colspan="2" style="font-size:9px">Productos</td><td style="text-align:right;font-size:9px">${fmt(regularTotal)}</td></tr>` : ""}
        <tr><td colspan="2" style="font-size:9px;padding-top:4px">Subtotal</td><td style="text-align:right;font-size:9px;padding-top:4px">${fmt((sale.preSaleAnticipo ?? 0) + regularTotal)}</td></tr>
        <tr class="total-row"><td colspan="2">TOTAL COBRADO</td><td style="text-align:right">${fmt(sale.total)}</td></tr>
      </tfoot></table>` : "";

    // Efectivo siempre se mide en MXN. Si entró USD físico, lo desglosamos
    // para trazabilidad (Joel quiere que quede registro aunque contablemente
    // todo cuente como MXN).
    const usdNum  = sale.amountReceivedUsd ?? 0;
    const usdMxn  = usdNum * tc;
    const mxnPart = (sale.amountReceived ?? 0) - usdMxn;
    const paymentRows = `
      <tr><td>Método de pago</td><td style="text-align:right;font-weight:900">${sale.paymentMethod}</td></tr>
      ${sale.amountReceived != null ? `<tr><td>Recibido</td><td style="text-align:right">${fmt(sale.amountReceived)}</td></tr>` : ""}
      ${usdNum > 0 ? `<tr><td style="font-size:9px;color:#555">· Pesos</td><td style="text-align:right;font-size:9px;color:#555">${fmt(Math.max(0, mxnPart))}</td></tr>
      <tr><td style="font-size:9px;color:#555">· Dólares</td><td style="text-align:right;font-size:9px;color:#555">$${usdNum.toFixed(2)} USD <span style="color:#888">(≈ ${fmt(usdMxn)})</span></td></tr>` : ""}
      ${sale.change != null && sale.change > 0 ? `<tr><td style="font-weight:900">Cambio</td><td style="text-align:right;font-weight:900">${fmt(sale.change)}</td></tr>` : ""}
    `;

    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:11px;width:280px;padding:12px 8px}
    h2{font-size:16px;text-align:center;font-weight:900;margin-bottom:2px}.sub{font-size:9px;text-align:center;color:#555;margin-bottom:2px}
    .divider{border-top:1px dashed #000;margin:8px 0}table{width:100%;border-collapse:collapse}
    .total-row td{font-weight:900;font-size:13px;border-top:1px solid #000;padding-top:6px}
    .footer{text-align:center;font-size:9px;color:#555;margin-top:10px}
    @media print{@page{margin:0;size:58mm auto}body{width:58mm}}</style></head><body>
    <h2>TADAIMA</h2>
    <div class="sub">Manga & Hobby Store</div>
    ${sale.storeName ? `<div class="sub" style="font-weight:900;color:#000">${sale.storeName}</div>` : ""}
    <div class="divider"></div>
    <div style="font-size:9px;margin-bottom:6px">
      ${sale.id ? `<div>Ticket #${sale.id}</div>` : ""}
      <div>${new Date(sale.soldAt).toLocaleString("es-MX",{dateStyle:"short",timeStyle:"short"})}</div>
      ${sale.storeName ? `<div>Sucursal: ${sale.storeName}</div>` : ""}
      ${sale.cashierName ? `<div>Cajero: ${sale.cashierName}</div>` : ""}
      ${sale.customerName ? `<div>Cliente: ${sale.customerName}</div>` : ""}
      ${sale.customerPhone ? `<div>Tel: ${sale.customerPhone}</div>` : ""}
      ${sale.customerEmail ? `<div>Correo: ${sale.customerEmail}</div>` : ""}
    </div>
    ${preSaleSection}${regularSection}${grandTotal}
    <div class="divider"></div>
    <table style="font-size:10px">${paymentRows}</table>
    <div class="divider"></div><div class="footer">¡Gracias por tu compra!</div></body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };

  const triggerPrintFlow = (sale: CompletedSaleData) => {
    const pref = localStorage.getItem(PRINT_PREF_KEY) ?? "ask";
    if (pref === "auto") {
      doPrintTicket(sale);
      // Auto-print abre una ventana nueva; cerramos la mesa secundaria
      // un instante después para que setTimeout(print, 300) ya haya disparado.
      window.setTimeout(closePendingMesa, 500);
      return;
    }
    if (pref === "never") { closePendingMesa(); return; }
    setLastCompletedSale(sale);
    setPrintNeverAsk(false);
    setShowPrintModal(true);
  };

  /**
   * Cierra la mesa secundaria que se acaba de cobrar (Venta 2..5). La
   * Caja Principal no se cierra nunca. Se llama después del flujo de impresión
   * en los 3 caminos: auto-print, never-print y modal cerrado.
   */
  const closePendingMesa = () => {
    setPendingMesaCloseId(id => {
      if (!id) return null;
      const mesa = mesasRef.current.find(m => m.id === id);
      if (mesa && mesa.name !== "Caja Principal" && mesasRef.current.length > 1) {
        // Defer al siguiente tick para no chocar con el setState actual.
        window.setTimeout(() => removeMesa(id), 0);
      }
      return null;
    });
  };

  /**
   * Pareo mixto preventa↔venta. Antes vivía dentro de fetchHistorial; ahora
   * que el historial es React Query reactivo, recalculamos cada vez que la
   * data cambia (post-checkout, post-cancelación, refetch). Detección:
   *   1. `linked_sale_id` persistido en DB → fuente de verdad.
   *   2. Fallback heurístico (30s timestamp) para orders legacy sin linked_sale_id.
   */
  useEffect(() => {
    if (!historialEntries.length) {
      setMixedPairs([]);
      return;
    }
    const linkedSaleIds = new Set<number>();
    const detectedPairs: Array<{ preSaleOrderId: number; saleId: number }> = [];
    for (const entry of historialEntries) {
      if (entry.type !== 'presale') continue;
      if (entry.data.linked_sale_id != null) {
        detectedPairs.push({ preSaleOrderId: entry.data.id, saleId: entry.data.linked_sale_id });
        linkedSaleIds.add(entry.data.linked_sale_id);
      }
    }
    const usedSaleIds = new Set<number>(linkedSaleIds);
    for (const entry of historialEntries) {
      if (entry.type !== 'presale') continue;
      if (entry.data.linked_sale_id != null) continue;
      const orderTime = new Date(entry.data.created_at).getTime();
      for (const other of historialEntries) {
        if (other.type !== 'sale') continue;
        if (usedSaleIds.has(other.data.id!)) continue;
        const saleTime = new Date(other.data.sold_at || other.data.created_at).getTime();
        if (Math.abs(orderTime - saleTime) <= 30_000) {
          detectedPairs.push({ preSaleOrderId: entry.data.id, saleId: other.data.id! });
          usedSaleIds.add(other.data.id!);
          break;
        }
      }
    }
    setMixedPairs(detectedPairs);
  }, [historialEntries]);

  /** Refetch manual del historial (botón "Actualizar"). */
  const fetchHistorial = () => { void historialQuery.refetch(); };

  const openHistorial = () => {
    setShowHistorialModal(true);
    // React Query maneja el fetch automáticamente; si el cache es stale (>30s)
    // hace background refetch al re-render. No necesitamos disparar manualmente.
  };

  /**
   * Maneja errores del backend en checkout. Si el server retorna
   * "Stock insuficiente para 'X'. Disponible: N, solicitado: M.", auto-ajusta
   * la qty del item en el carrito al disponible real, invalida el cache de
   * productos para refrescar stock display, y muestra toast amarillo amigable.
   * Para otros errores, muestra toast.error genérico.
   */
  const handleCheckoutError = (msg: string) => {
    const stockMatch = msg.match(/Stock insuficiente para '([^']+)'\. Disponible: ([\d.]+), solicitado/);
    if (stockMatch) {
      const productName = stockMatch[1];
      const availableNum = Math.floor(parseFloat(stockMatch[2]));
      const mesaId = activeMesa.id;

      updMesa(mesaId, m => ({
        ...m,
        items: m.items
          .map(i => i.product.name === productName
            ? { ...i, quantity: availableNum }
            : i)
          .filter(i => i.quantity > 0),
      }));

      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });

      if (availableNum > 0) {
        toast.warning(
          `Stock de "${productName}" se actualizó a ${availableNum}. Ajustamos la venta — revisa y cobra de nuevo.`,
          {
            duration: 7000,
            style: { background: '#1a1400', color: '#fbbf24', border: '1px solid #78350f', borderRadius: '16px' },
          },
        );
      } else {
        toast.error(
          `"${productName}" sin stock disponible. Lo quitamos de la venta.`,
          {
            duration: 7000,
            style: { background: '#2d0a00', color: '#fff', border: '1px solid rgba(224,34,26,0.4)', borderRadius: '16px' },
          },
        );
      }
      return;
    }

    // Preventa: el backend devuelve "'X' solo tiene N unidades disponibles (límite: M)."
    // cuando el preorder_limit del catálogo ya se alcanzó. Auto-ajusta el item de
    // preventa-catálogo en el carrito al disponible real, igual que con productos.
    const presaleMatch = msg.match(/'([^']+)' solo tiene (\d+) unidades disponibles \(límite: \d+\)/);
    if (presaleMatch) {
      const productName = presaleMatch[1];
      const availableNum = parseInt(presaleMatch[2], 10);
      const mesaId = activeMesa.id;

      updMesa(mesaId, m => ({
        ...m,
        items: m.items
          .map(i => i.product.name === productName && i.sellingCatalogId != null
            ? { ...i, quantity: availableNum, depositAmount: availableNum > 0 ? ((i.depositAmount ?? 0) / Math.max(i.quantity, 1)) * availableNum : 0 }
            : i)
          .filter(i => i.quantity > 0),
      }));

      void queryClient.invalidateQueries({ queryKey: queryKeys.preSaleCatalogs.all });

      if (availableNum > 0) {
        toast.warning(
          `"${productName}" — quedan ${availableNum} unidades. Ajustamos la venta — revisa y cobra de nuevo.`,
          { duration: 7000, style: { background: '#1a1400', color: '#fbbf24', border: '1px solid #78350f', borderRadius: '16px' } },
        );
      } else {
        toast.error(
          `"${productName}" sin disponibilidad (límite alcanzado). Lo quitamos de la venta.`,
          { duration: 7000, style: { background: '#2d0a00', color: '#fff', border: '1px solid rgba(224,34,26,0.4)', borderRadius: '16px' } },
        );
      }
      return;
    }

    toast.error(msg);
  };

  const handleCheckout = async () => {
    if (!activeMesa.items.length) return;

    // Guard de método incompatible — también cubre los atajos de Enter que
    // llaman handleCheckout directo sin pasar por el disabled del botón.
    const incompatibles = activeMesa.items.filter(i => !itemAcceptsMethod(i, activeMesa.paymentMethod));
    if (incompatibles.length > 0) {
      const names = incompatibles.map(i => i.product.name).slice(0, 3).join(", ");
      toast.error(`No se puede cobrar con ${activeMesa.paymentMethod}: ${names}${incompatibles.length > 3 ? "…" : ""}. Cambia el método de pago o separa la venta.`, { duration: 6000 });
      return;
    }

    // Bug 10/15: bloquear checkout si algún item no se sincronizó con el backend.
    // Sin esto, el usuario verá un total en pantalla pero el draft del backend tiene
    // un subtotal distinto y el checkout fallará con "Los pagos no coinciden con el total".
    const desync = activeMesa.items.filter(i => i.syncError);
    if (desync.length > 0) {
      const names = desync.map(i => i.product.name).join(", ");
      toast.error(`Productos sin sincronizar: ${names}. Elimínalos y vuelve a agregarlos antes de cobrar.`, {
        duration: 7000,
        style: { background: '#2d0a00', color: '#fff', border: '1px solid rgba(224,34,26,0.4)', borderRadius: '16px' },
      });
      return;
    }

    // Tipo de cambio: ya está cacheado por 24h, fetched al abrir caja. No revalidamos
    // aquí para no gastar llamadas por cada venta — el admin actualiza por la noche
    // y el cajero lee al inicio del día. Si el admin necesita un cambio urgente en
    // medio del día puede reabrir caja o el cajero cerrar/abrir sesión.

    // ── LIQUIDAR PREVENTA CARGADA (con o sin productos nuevos / nuevas preventas) ──
    if (activeMesa.loadedPreSaleOrderId) {
      if (isCheckoutLockedRef.current) return;
      isCheckoutLockedRef.current = true;

      const PM_IDS: Record<string, number> = {
        "Efectivo": 1, "Dólares": 1, "Tarjeta": 2, "Transferencia": 4,
      };
      const payMethodId = PM_IDS[activeMesa.paymentMethod] ?? 1;
      const priceLevelMap: Record<PriceLevel, 1 | 2 | 3 | 4 | 5> = { a: 1, b: 2, c: 3, d: 4, e: 5 };

      // Split en 3 grupos: items a liquidar / productos regulares / catálogos de preventa nueva
      const liquidationItems = activeMesa.items.filter(i => i.isFromPreSale);
      const newCatalogItems  = activeMesa.items.filter(i => i.sellingCatalogId != null);
      const regularItems     = activeMesa.items.filter(i => !i.isFromPreSale && i.sellingCatalogId == null);

      const liquidationAmount = activeMesa.depositAmount || 0;
      const regularSubtotal   = regularItems.reduce((s, i) => s + getItemPrice(i) * i.quantity, 0);
      const newPreventaDeposit = newCatalogItems.reduce((s, i) => s + (i.depositAmount ?? 0), 0);

      try {
        setIsProcessing(true);

        // 1. Crear venta regular primero (si aplica). Si truena, no se liquida la preventa.
        let regularSaleId: number | undefined;
        if (regularItems.length > 0 && regularSubtotal > 0) {
          const directItems = regularItems
            .map(ci => ({
              product_id: parseInt(ci.product.id, 10),
              quantity: ci.quantity,
              price: ci.damagedPrice ?? getItemPrice(ci),
              price_level: (["a","b","c"].includes(ci.priceLevel) ? ci.priceLevel : "a") as "a" | "b" | "c",
              // Dañado → precio manual; el backend salta la validación de catálogo.
              ...(ci.isDamaged ? { is_damaged: true } : {}),
            }))
            .filter(i => !Number.isNaN(i.product_id));

          if (directItems.length > 0) {
            const saleResult = await createSale({
              items: directItems,
              store_id: activeStore?.id ?? 0,
              register_session_id: cashSession?.id,
              ...(activeMesa.customerId ? { customer_id: Number(activeMesa.customerId) } : {}),
              payments: [{
                payment_method_id: payMethodId,
                amount: regularSubtotal,
                ...(activeMesa.paymentMethod === "Tarjeta" && activeMesa.selectedTerminalId
                  ? { terminal_id: activeMesa.selectedTerminalId } : {}),
              }],
            });
            regularSaleId = saleResult?.id;
            // Escritura optimista: la respuesta del POST ya ES la fila que la
            // lista de Ventas va a traer — la insertamos al cache (con el
            // vendedor, que el endpoint de checkout no eager-loadea) y
            // descontamos stock sin esperar el refetch de 1-3s contra prod.
            prependSaleToSalesCaches(queryClient, {
              ...(saleResult as unknown as SaleDetail),
              user: user ? { id: Number(user.id), name: user.name ?? "" } : null,
            });
            decrementProductStockInCaches(queryClient, directItems);
          }
        }

        // 2. Crear nuevo folio de preventa (si aplica). Mismo principio: si truena, no liquidamos.
        let newOrderCode: string | undefined;
        if (newCatalogItems.length > 0) {
          if (!activeStore) throw new Error("Tienda no seleccionada");
          if (!activeMesa.customerId) throw new Error("Falta cliente para la nueva preventa");
          const newOrder = await createPreSaleOrder({
            store_id: activeStore.id,
            customer_id: Number(activeMesa.customerId),
            items: newCatalogItems.map(item => ({
              catalog_id: item.sellingCatalogId!,
              quantity: item.quantity,
              price_level: priceLevelMap[item.priceLevel],
            })),
            ...(newPreventaDeposit > 0 ? { advance_amount: newPreventaDeposit, payment_method_id: payMethodId } : {}),
            ...(regularSaleId != null ? { linked_sale_id: regularSaleId } : {}),
          });
          newOrderCode = newOrder.code;
          // Folio nuevo visible al instante en Folios/Ventas (mismo browser).
          prependPreSaleOrderToCaches(queryClient, newOrder, activeStore.id);
        }

        // 3. Liquidar la preventa cargada (al final → si algo trona arriba, queda sin liquidar)
        if (liquidationAmount > 0) {
          await addPreSaleOrderPayment(activeMesa.loadedPreSaleOrderId, {
            amount: liquidationAmount,
            payment_method_id: payMethodId,
          });
        }
        const deliveredOrder = await updatePreSaleOrderStatus(activeMesa.loadedPreSaleOrderId, { status: "delivered" });
        // Liquidación visible al instante: el folio cacheado pasa a delivered
        // (saldo 0) sin esperar el refetch. Solo copiamos los computados si el
        // endpoint los trae (dependen de relaciones cargadas).
        patchPreSaleOrderInCaches(queryClient, activeMesa.loadedPreSaleOrderId, {
          status: "delivered",
          ...(deliveredOrder?.paid_amount != null ? { paid_amount: deliveredOrder.paid_amount } : {}),
          balance: deliveredOrder?.balance ?? 0,
        });

        // Snapshots para ticket antes de limpiar
        const mesaId             = activeMesa.id;
        const customerNameSnap   = activeMesa.customerName;
        const customerPhoneSnap  = activeMesa.customerPhone;
        const customerEmailSnap  = activeMesa.customerEmail;
        const payMethodSnap      = activeMesa.paymentMethod;
        const liquidatedCodeSnap = activeMesa.loadedPreSaleOrderCode;
        const cashReceivedUsdSnap = parseFloat(cashReceivedUsd) || 0;
        const cashReceivedSnap    = (parseFloat(cashReceived) || 0) + cashReceivedUsdSnap * tc;

        setCashReceived("");
        clearCart();
        draftStore.clearDraft(mesaId);
        draftStore.clearDraftItems(mesaId);

        // 4. Ticket: items entregados (liquidados) + productos regulares
        const ticketTotal = liquidationAmount + regularSubtotal + newPreventaDeposit;
        const deliveredAndRegular = [
          ...liquidationItems.map(i => ({
            name: liquidatedCodeSnap ? `${i.product.name} (Folio ${liquidatedCodeSnap})` : i.product.name,
            quantity: i.quantity,
            price: getItemPrice(i),
          })),
          ...regularItems.map(i => ({
            name: i.product.name,
            quantity: i.quantity,
            price: getItemPrice(i),
          })),
        ];

        const mixedTicket: CompletedSaleData = {
          total: ticketTotal,
          paymentMethod: payMethodSnap,
          customerName: customerNameSnap,
          ...(customerPhoneSnap ? { customerPhone: customerPhoneSnap } : {}),
          ...(customerEmailSnap ? { customerEmail: customerEmailSnap } : {}),
          items: deliveredAndRegular,
          soldAt: new Date().toISOString(),
          storeName: activeStore?.name,
          cashierName: user?.name,
          amountReceived: cashReceivedSnap > 0 ? cashReceivedSnap : undefined,
          ...(cashReceivedUsdSnap > 0 ? { amountReceivedUsd: cashReceivedUsdSnap } : {}),
          // cashReceivedSnap ya está en MXN (incluye USD * tc). El cambio se calcula
          // directamente en pesos — se entrega siempre en MXN aunque haya recibido USD.
          change: cashReceivedSnap > ticketTotal ? cashReceivedSnap - ticketTotal : undefined,
          ...(newOrderCode ? {
            preSaleCode: newOrderCode,
            preSaleItems: newCatalogItems.map(i => ({
              name: i.product.name,
              quantity: i.quantity,
              unitPrice: getItemPrice(i),
            })),
            preSaleAnticipo: newPreventaDeposit,
          } : {}),
        };

        invalidateAfterSale(queryClient, { presale: true });
        setPendingMesaCloseId(mesaId);
        triggerPrintFlow(mixedTicket);

        const parts: string[] = [`Preventa liquidada · ${fmt(liquidationAmount)}`];
        if (regularSubtotal > 0) parts.push(`Venta ${fmt(regularSubtotal)}`);
        if (newOrderCode) parts.push(`Nuevo folio ${newOrderCode} · Anticipo ${fmt(newPreventaDeposit)}`);
        toast.success(parts.join(" · "), {
          style: { background: '#064e3b', color: '#fff', border: '1px solid #10b981', borderRadius: '16px' }
        });
      } catch (err: unknown) {
        const msg = err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message) : "Error al liquidar la preventa";
        handleCheckoutError(msg);
      } finally {
        setIsProcessing(false);
        isCheckoutLockedRef.current = false;
      }
      return;
    }

    // ── NUEVA PREVENTA (desde catálogo publicado) ─────────────────────────────
    // Se entra aquí si la mesa está en modo preventa explícito (toggle Preventa)
    // o si el carrito tiene items de catálogo aunque la mesa no esté marcada.
    if (activeMesa.isPreventa || hasCatalogItems) {
      if (!activeStore) return;
      if (isCheckoutLockedRef.current) return;
      isCheckoutLockedRef.current = true;

      let blocked = false;

      if (!activeMesa.customerId) {
        blocked = true;
        toast("Falta cliente para la preventa", {
          icon: <Users size={16} className="text-amber-400" />,
          description: "Selecciona o registra al cliente en el formulario que se abrió.",
          style: {
            background: "#1a1000",
            color: "#fbbf24",
            border: "1px solid rgba(245,158,11,0.35)",
            borderRadius: 16,
          },
          duration: 3500,
        });
        updMesa(activeMesa.id, m => ({ ...m, isNewCustomer: false }));
        setRequireCustomerFlash(true);
        setTimeout(() => setRequireCustomerFlash(false), 1800);
        // Abre el popup de asignar cliente directamente — el cajero puede
        // buscar/crear sin tener que ir al header. Toast queda encima (z más alto).
        setAssignCustomerPopup({
          mode: 'manual', candidate: null, search: "", searching: false,
          searchResults: { locales: [], externos: [] }, assigning: false,
          createForm: { open: false, name: "", phone: "", email: "", saving: false },
        });
      }

      const needsCash = activeMesa.paymentMethod === "Efectivo";
      // Efectivo híbrido: MXN + USD*tc, todo evaluado en pesos.
      const receivedInMxn = (parseFloat(cashReceived) || 0) + (parseFloat(cashReceivedUsd) || 0) * tc;
      if (needsCash && totalDeposit > 0 && receivedInMxn < totalDeposit) {
        blocked = true;
        toast("Ingresa el anticipo recibido", {
          icon: <Banknote size={16} className="text-red-400" />,
          description: `Se requieren al menos ${fmt(totalDeposit)} para registrar el anticipo (puedes combinar pesos y dólares a TC ${tc})`,
          style: {
            background: "#1a0000",
            color: "#f87171",
            border: "1px solid rgba(239,68,68,0.35)",
            borderRadius: 16,
          },
          duration: 3500,
        });
      }

      if (blocked) {
        isCheckoutLockedRef.current = false;
        return;
      }

      const PM_IDS: Record<string, number> = {
        "Efectivo": 1, "Dólares": 1, "Tarjeta": 2, "Transferencia": 4,
      };
      const payMethodId = PM_IDS[activeMesa.paymentMethod] ?? 1;
      const priceLevelMap: Record<PriceLevel, 1 | 2 | 3 | 4 | 5> = { a: 1, b: 2, c: 3, d: 4, e: 5 };

      try {
        setIsProcessing(true);

        // Split items: catalog items → createPreSaleOrder; regular items → createSale draft
        const catalogItems = activeMesa.items.filter(i => i.sellingCatalogId != null);
        const regularItems = activeMesa.items.filter(i => i.sellingCatalogId == null && !i.isFromPreSale);

        if (catalogItems.length === 0) {
          toast.error("No hay artículos de catálogo de preventa en la venta.");
          isCheckoutLockedRef.current = false;
          return;
        }

        // Deposit for catalog items only
        const catalogDeposit = catalogItems.reduce((s, i) => s + (i.depositAmount ?? 0), 0);

        // Create regular sale first so we can link it to the pre-sale order
        let regularSaleId: number | undefined;
        if (regularItems.length > 0) {
          const regularSubtotal = regularItems.reduce((s, i) => s + getItemPrice(i) * i.quantity, 0);
          const directItems = regularItems
            .map(ci => ({
              product_id: parseInt(ci.product.id, 10),
              quantity: ci.quantity,
              price: ci.damagedPrice ?? getItemPrice(ci),
              price_level: (["a","b","c"].includes(ci.priceLevel) ? ci.priceLevel : "a") as "a" | "b" | "c",
              // Dañado → precio manual; el backend salta la validación de catálogo.
              ...(ci.isDamaged ? { is_damaged: true } : {}),
            }))
            .filter(i => !Number.isNaN(i.product_id));

          if (directItems.length > 0 && regularSubtotal > 0) {
            const saleResult = await createSale({
              items: directItems,
              store_id: activeStore?.id ?? 0,
              register_session_id: cashSession?.id,
              ...(activeMesa.customerId ? { customer_id: Number(activeMesa.customerId) } : {}),
              payments: [{
                payment_method_id: payMethodId,
                amount: regularSubtotal,
                ...(activeMesa.paymentMethod === "Tarjeta" && activeMesa.selectedTerminalId
                  ? { terminal_id: activeMesa.selectedTerminalId } : {}),
              }],
            });
            regularSaleId = saleResult?.id;
            // Escritura optimista — venta visible en Ventas y stock descontado
            // en el catálogo al instante (el refetch de la invalidación
            // reconcilia con el servidor en background).
            prependSaleToSalesCaches(queryClient, {
              ...(saleResult as unknown as SaleDetail),
              user: user ? { id: Number(user.id), name: user.name ?? "" } : null,
            });
            decrementProductStockInCaches(queryClient, directItems);
          }
        }

        const order = await createPreSaleOrder({
          store_id: activeStore.id,
          customer_id: Number(activeMesa.customerId),
          items: catalogItems.map(item => ({
            catalog_id: item.sellingCatalogId!,
            quantity: item.quantity,
            price_level: priceLevelMap[item.priceLevel],
          })),
          ...(catalogDeposit > 0 ? { advance_amount: catalogDeposit, payment_method_id: payMethodId } : {}),
          ...(regularSaleId != null ? { linked_sale_id: regularSaleId } : {}),
        });

        // Folio nuevo (anticipo) visible al instante en Folios/Ventas.
        prependPreSaleOrderToCaches(queryClient, order, activeStore.id);

        // Keep in-memory pair for historial grouping in the same session
        if (regularSaleId != null) {
          setMixedPairs(prev => [...prev, { preSaleOrderId: order.id, saleId: regularSaleId! }]);
        }

        const mesaId = activeMesa.id;
        const customerNameSnap = activeMesa.customerName;
        const customerPhoneSnap = activeMesa.customerPhone;
        const customerEmailSnap = activeMesa.customerEmail;
        const payMethodSnap    = activeMesa.paymentMethod;
        const regularSubtotalFinal = regularItems.reduce((s, i) => s + getItemPrice(i) * i.quantity, 0);

        setCashReceived("");
        clearCart();
        draftStore.clearDraft(mesaId);
        draftStore.clearDraftItems(mesaId);

        const extraMsg = regularItems.length > 0 ? ` · Venta regular también registrada` : "";
        toast.success(
          `Preventa registrada · Folio ${order.code}${catalogDeposit > 0 ? ` · Anticipo ${fmt(catalogDeposit)}` : ""}${extraMsg}`,
          { style: { background: '#1a0800', color: '#fff', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '16px' } }
        );

        void queryClient.invalidateQueries({ queryKey: queryKeys.historial.all });
        const mixedReceivedUsd = parseFloat(cashReceivedUsd) || 0;
        const mixedReceived    = (parseFloat(cashReceived) || 0) + mixedReceivedUsd * tc;
        const mixedTotal = catalogDeposit + regularSubtotalFinal;
        const mixedTicket: CompletedSaleData = {
          total: mixedTotal,
          paymentMethod: payMethodSnap,
          customerName: customerNameSnap,
          ...(customerPhoneSnap ? { customerPhone: customerPhoneSnap } : {}),
          ...(customerEmailSnap ? { customerEmail: customerEmailSnap } : {}),
          items: regularItems.map(i => ({
            name: i.product.name,
            quantity: i.quantity,
            price: getItemPrice(i),
          })),
          soldAt: new Date().toISOString(),
          storeName: activeStore?.name,
          cashierName: user?.name,
          amountReceived: mixedReceived > 0 ? mixedReceived : undefined,
          ...(mixedReceivedUsd > 0 ? { amountReceivedUsd: mixedReceivedUsd } : {}),
          // Mismo fix USD/MXN que la rama de folio cargado.
          change: (() => {
            if (mixedReceived <= 0) return undefined;
            if (payMethodSnap === "Dólares") {
              const receivedMxn = mixedReceived * tc;
              return receivedMxn > mixedTotal ? (receivedMxn - mixedTotal) / tc : undefined;
            }
            return mixedReceived > mixedTotal ? mixedReceived - mixedTotal : undefined;
          })(),
          preSaleCode: order.code,
          preSaleItems: catalogItems.map(i => ({
            name: i.product.name,
            quantity: i.quantity,
            unitPrice: getItemPrice(i),
          })),
          preSaleAnticipo: catalogDeposit,
        };
        invalidateAfterSale(queryClient, { presale: true });
        setPendingMesaCloseId(mesaId);
        triggerPrintFlow(mixedTicket);
      } catch (err: unknown) {
        const msg = err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message) : "Error al registrar la preventa";
        handleCheckoutError(msg);
      } finally {
        setIsProcessing(false);
        isCheckoutLockedRef.current = false;
      }
      return;
    }

    // ── VENTA REGULAR ──────────────────────────────────────────────────────────

    // Guard: total must be positive (prevents $0 sales)
    if (total <= 0) {
      toast.error("El total debe ser mayor a $0");
      return;
    }

    if (activeMesa.paymentMethod === "Tarjeta" && !activeTerminal) {
      toast.error("Selecciona una terminal antes de cobrar con tarjeta.", {
        style: { background: '#1a0a00', color: '#fbbf24', border: '1px solid #78350f' },
      });
      return;
    }

    // Guard: prevent double-submit while a sale request is in flight
    if (isCheckoutLockedRef.current) return;

    // ADR-014: el carrito vive client-side; mandamos items directos al server.
    // No hay draft que recuperar/verificar. Si el server rechaza por stock o
    // pago, el carrito queda intacto para que el cajero ajuste.

    isCheckoutLockedRef.current = true;
    try {
      setIsProcessing(true);

      const PM_IDS: Record<string, number> = {
        "Efectivo":     1,
        "Dólares":      1,
        "Tarjeta":      2,
        "Transferencia": 4,
      };
      const paymentMethodId = PM_IDS[activeMesa.paymentMethod] ?? 1;

      // Snapshot cart before clearing (for ticket)
      const cartSnapshot = activeMesa.items.map(ci => ({
        name: ci.product.name,
        quantity: ci.quantity,
        price: ci.damagedPrice ?? ci.product[`price_${ci.priceLevel}` as keyof Product] as number ?? ci.product.price_a,
      }));
      const customerNameSnapshot = activeMesa.customerName;
      const customerPhoneSnapshot = activeMesa.customerPhone;
      const customerEmailSnapshot = activeMesa.customerEmail;
      const payMethodSnapshot = activeMesa.paymentMethod;
      // Solo Efectivo usa campo recibido (incluye USD híbrido convertido a MXN).
      // Tarjeta/Transferencia siempre 0 (defensa por si quedó algo).
      const isCashPay = activeMesa.paymentMethod === "Efectivo";
      const receivedUsdSnapshot = isCashPay ? (parseFloat(cashReceivedUsd) || 0) : 0;
      const receivedSnapshot    = isCashPay
        ? (parseFloat(cashReceived) || 0) + receivedUsdSnapshot * tc
        : 0;
      // Cambio en MXN: receivedSnapshot ya está en pesos.
      const changeSnapshot = receivedSnapshot > total ? receivedSnapshot - total : 0;

      // Items reales (no preventa-catálogo, no folio cargado). En esta rama
      // (venta regular sin folio cargado) todos los items son regulares.
      const saleItems = activeMesa.items
        .filter(i => i.sellingCatalogId == null && !i.isFromPreSale)
        .map(ci => ({
          product_id: parseInt(ci.product.id, 10),
          quantity: ci.quantity,
          price: ci.damagedPrice ?? getItemPrice(ci),
          price_level: (["a","b","c"].includes(ci.priceLevel) ? ci.priceLevel : "a") as "a" | "b" | "c",
          // Dañado → precio manual; el backend salta la validación de catálogo.
          ...(ci.isDamaged ? { is_damaged: true } : {}),
        }))
        .filter(i => !Number.isNaN(i.product_id));

      if (saleItems.length === 0) {
        toast.error("No hay productos válidos para cobrar.");
        return;
      }

      const saleResult = await createSale({
        items: saleItems,
        store_id: activeStore?.id ?? 0,
        register_session_id: cashSession?.id,
        ...(activeMesa.customerId ? { customer_id: Number(activeMesa.customerId) } : {}),
        payments: [{
          payment_method_id: paymentMethodId,
          amount: total,
          ...(activeMesa.paymentMethod === "Tarjeta" && activeMesa.selectedTerminalId
            ? { terminal_id: activeMesa.selectedTerminalId } : {}),
        }],
      });

      // Escritura optimista — la venta aparece en la lista de Ventas y el
      // stock baja en el catálogo de Caja al soltar el botón, sin esperar el
      // refetch de 1-3s contra prod (la invalidación de abajo reconcilia).
      prependSaleToSalesCaches(queryClient, {
        ...(saleResult as unknown as SaleDetail),
        user: user ? { id: Number(user.id), name: user.name ?? "" } : null,
      });
      decrementProductStockInCaches(queryClient, saleItems);

      toast.success(`¡Venta registrada! ${fmt(total)}`);
      const mesaId = activeMesa.id;
      setCashReceived("");
      clearCart();

      // Trigger print flow
      const completedSale: CompletedSaleData = {
        id: saleResult?.id,
        total,
        paymentMethod: payMethodSnapshot,
        customerName: customerNameSnapshot,
        ...(customerPhoneSnapshot ? { customerPhone: customerPhoneSnapshot } : {}),
        ...(customerEmailSnapshot ? { customerEmail: customerEmailSnapshot } : {}),
        items: cartSnapshot,
        soldAt: new Date().toISOString(),
        storeName: activeStore?.name,
        cashierName: user?.name,
        amountReceived: receivedSnapshot > 0 ? receivedSnapshot : undefined,
        ...(receivedUsdSnapshot > 0 ? { amountReceivedUsd: receivedUsdSnapshot } : {}),
        change: changeSnapshot > 0 ? changeSnapshot : undefined,
      };
      invalidateAfterSale(queryClient);
      setPendingMesaCloseId(mesaId);
      triggerPrintFlow(completedSale);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message) : "Error al procesar la venta";
      handleCheckoutError(msg);
    } finally {
      setIsProcessing(false);
      isCheckoutLockedRef.current = false;
    }
  };

  // Guard: admin with multiple stores must pick one before entering Caja
  if (!storeLoading && !activeStore) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-6" style={{ background: BG }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(224,34,26,0.1)", border: "1px solid rgba(224,34,26,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ShoppingBag size={32} color="rgba(224,34,26,0.7)" />
        </div>
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "var(--td-text-hi)" }}>Selecciona una tienda</p>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--td-text-ghost)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em" }}>
            ¿Desde qué sucursal vas a cobrar?
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 320 }}>
          {stores.length === 0 ? (
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--td-text-ghost)" }}>Sin tiendas asignadas — contacta al administrador</p>
          ) : (
            stores.map(s => {
              const entry = activeSessionsByStore.get(s.id);
              const count = entry?.count ?? 0;
              const sessions = entry?.sessions ?? [];
              // Conectados pero SIN caja abierta — los que están logueados
              // (last_seen_at < 2 min) pero no aparecen en sesiones de caja.
              const onlineInStore = onlineByStore.get(s.id) ?? [];
              const sessionUserIds = new Set(sessions.map(x => x.user_id));
              const onlineOnly = onlineInStore.filter(u => !sessionUserIds.has(u.id));
              // Tooltip nativo con la lista de cajeros — útil para admin antes
              // de seleccionar la tienda. La tienda ya es la fila, y la caja
              // personal incluye el nombre, así que basta "usuario · hora".
              const titleLines = [
                ...sessions.map(x => `🟢 ${x.user_name ?? `Usuario ${x.user_id}`} · ${new Date(x.opened_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`),
                ...onlineOnly.map(u => `🔵 ${u.name} · conectado, sin caja`),
              ];
              const title = titleLines.length > 0 ? titleLines.join("\n") : "Sin actividad";
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveStore(s)}
                  title={isAdmin ? title : undefined}
                  style={{
                    padding: "14px 20px", borderRadius: 16, cursor: "pointer", textAlign: "left",
                    background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)",
                    color: "var(--td-text-hi)", fontSize: 14, fontWeight: 700,
                    transition: "all 0.15s",
                    display: "flex", alignItems: "center", gap: 12,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(224,34,26,0.12)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(224,34,26,0.3)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--td-card-bg)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--td-card-border)"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {s.name}
                    {s.address && <span style={{ display: "block", fontSize: 10, color: "var(--td-text-ghost)", marginTop: 2 }}>{s.address}</span>}
                  </div>
                  {/* Badges — solo admin. Verde con dot pulsante = caja abierta.
                      Azul = cajero conectado (logueado) sin abrir caja todavía.
                      Si todavía no llega la primera respuesta, dice "Verificando". */}
                  {isAdmin && (() => {
                    const isLoading = allActiveSessionsQuery.isPending || allOnlineUsersQuery.isPending;
                    if (isLoading) {
                      return (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "4px 10px", borderRadius: 999,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid var(--td-card-border)",
                          flexShrink: 0,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--td-text-ghost)" }} />
                          <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--td-text-ghost)" }}>
                            Verificando…
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {count > 0 && (
                          <div style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "4px 10px", borderRadius: 999,
                            background: "rgba(16,185,129,0.12)",
                            border: "1px solid rgba(16,185,129,0.3)",
                          }}>
                            <span className="animate-pulse" style={{
                              width: 6, height: 6, borderRadius: 999,
                              background: "#10b981", boxShadow: "0 0 8px rgba(16,185,129,0.6)",
                            }} />
                            <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#10b981" }}>
                              {count === 1 ? "1 caja" : `${count} cajas`}
                            </span>
                          </div>
                        )}
                        {onlineOnly.length > 0 && (
                          <div style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "4px 10px", borderRadius: 999,
                            background: "rgba(59,130,246,0.10)",
                            border: "1px solid rgba(59,130,246,0.3)",
                          }} title="Conectados pero sin abrir caja">
                            <span className="animate-pulse" style={{
                              width: 6, height: 6, borderRadius: 999,
                              background: "#3b82f6", boxShadow: "0 0 8px rgba(59,130,246,0.6)",
                            }} />
                            <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#3b82f6" }}>
                              +{onlineOnly.length} conectado{onlineOnly.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        )}
                        {count === 0 && onlineOnly.length === 0 && (
                          <div style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "4px 10px", borderRadius: 999,
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid var(--td-card-border)",
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--td-text-ghost)" }} />
                            <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--td-text-ghost)" }}>
                              Sin actividad
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </button>
              );
            })
          )}
          {isAdmin && allActiveSessionsQuery.isFetching && (
            <p style={{ textAlign: "center", fontSize: 9, color: "var(--td-text-ghost)", fontWeight: 700, marginTop: 4 }}>
              Actualizando estado de cajas…
            </p>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3" style={{ background: BG }}>
        <Loader2 size={28} className="animate-spin" style={{ color: RED }} />
        <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.3em", color: "var(--td-text-ghost)", textTransform: "uppercase" }}>
          Cargando POS...
        </p>
      </div>
    );
  }

  /* ── GATE: verificando sesión de caja ─────────────────────────────────────
     Solo bloqueamos con activeSessionQuery — es la única que decide ruteo
     (Caja Abierta vs Caja Cerrada). Las queries de cajeros activos /
     online users se cargan en background y el card "Cajeros activos en la
     tienda" tiene su propio loading inline ("Cargando cajeros…"). Antes
     bloqueábamos por las 3, lo que mantenía al admin 3+ segundos en este
     spinner cuando /cash/active-sessions o /users/online iban lentos. */
  const verifyingSession = activeSessionQuery.isPending;
  if (verifyingSession) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ background: BG }}>
        <Loader2 size={36} className="animate-spin" style={{ color: RED }} />
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "var(--td-text-hi)" }}>
            Verificando sesión de caja
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 10, fontWeight: 700, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.18em" }}>
            {activeStore?.name ?? "Cargando…"}
          </p>
        </div>
      </div>
    );
  }

  /* ── GATE: sin caja abierta ────────────────────────────────────────────── */
  if (!cashSession) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-8" style={{ background: BG }}>
        {/* Mascota: Pikachu sobre Pokébola para el estado de caja cerrada.
            Pixel-art flotando con glow rojo de marca (sin caja, para que el
            sprite se vea limpio y combine con el estilo). */}
        <img
          src="/pikachu-caja.gif"
          alt="Caja cerrada"
          width={150}
          style={{
            width: 150,
            height: "auto",
            imageRendering: "pixelated",
            filter: "drop-shadow(0 10px 26px rgba(224,34,26,0.35))",
          }}
        />

        {/* Text */}
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--td-text-hi)", letterSpacing: "-0.02em" }}>
            Caja cerrada
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--td-text-ghost)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em" }}>
            {activeStore ? activeStore.name : "Sin tienda activa"} · Abre una sesión para comenzar a vender
          </p>
        </div>

        {/* Acciones: Abrir Caja + Cambiar tienda (solo admin con >1 tienda).
            Joel pidió que el back vaya pegado al CTA, no flotante arriba. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => setShowOpenCashModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "16px 40px", borderRadius: 20, cursor: "pointer",
              background: "linear-gradient(135deg, #BB1100 0%, #E0221A 100%)",
              border: "1px solid rgba(255,80,50,0.3)",
              boxShadow: "0 0 40px rgba(224,34,26,0.3), 0 8px 24px rgba(0,0,0,0.4)",
              color: "#fff", fontSize: 14, fontWeight: 900,
              textTransform: "uppercase", letterSpacing: "0.15em",
            }}
          >
            <Zap size={18} />
            Abrir Caja
          </button>

          {isAdmin && stores.length > 1 && (
            <button
              onClick={() => setActiveStore(null)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "16px 24px", borderRadius: 20, cursor: "pointer",
                background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)",
                color: "var(--td-text-md)", fontSize: 12, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: "0.15em",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(224,34,26,0.4)"; (e.currentTarget as HTMLButtonElement).style.color = "#E0221A"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--td-card-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--td-text-md)"; }}
            >
              <ChevronLeft size={14} />
              Cambiar tienda
            </button>
          )}
        </div>

        {/* Cajeros activos en la tienda — solo visible para admin.
            Tarjeta visual con dot pulsante, hora de apertura y "hace X min" para
            que el admin sepa de un vistazo quién está vendiendo en su sucursal.
            Bajo eso, los "conectados sin caja" (logueados pero no han abierto
            caja todavía). Poll 30s.

            Estados:
            - cargando (sin datos previos) → skeleton de 2 filas con 'Cargando cajeros…'
            - con datos → render normal (caja abiertas + conectados)
            - sin datos y sin loading → no se renderiza */}
        {isAdmin && (() => {
          const onlineOnlyInStore = onlineUsersInStore.filter(u => !activeSessionsInStore.some(s => s.user_id === u.id));
          const isLoadingCashiers = activeSessionsQuery.isFetching || onlineUsersInStoreQuery.isFetching;
          const hasContent = activeSessionsInStore.length > 0 || onlineOnlyInStore.length > 0;
          if (!hasContent && !isLoadingCashiers) return null;
          if (isLoadingCashiers && !hasContent) {
            return (
              <div style={{
                display: "flex", flexDirection: "column", gap: 10,
                padding: "16px 18px", borderRadius: 20,
                background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)",
                minWidth: 320, maxWidth: 420,
                boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, borderBottom: "1px solid var(--td-divider)" }}>
                  <Loader2 size={12} className="animate-spin" style={{ color: "var(--td-text-ghost)" }} />
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--td-text-ghost)" }}>
                    Cargando cajeros…
                  </p>
                </div>
                {[0, 1].map(i => (
                  <div key={`sk-cash-${i}`} className="animate-pulse" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 999, background: SOFT, flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ height: 10, width: 110, borderRadius: 999, background: STRONG }} />
                      <div style={{ height: 8, width: 80, borderRadius: 999, background: SOFT }} />
                    </div>
                    <div style={{ width: 50, height: 10, borderRadius: 999, background: SOFT }} />
                  </div>
                ))}
              </div>
            );
          }
          // hasContent — caemos al bloque siguiente que ya tiene el render real
          return null;
        })()}
        {isAdmin && (activeSessionsInStore.length > 0 || onlineUsersInStore.filter(u => !activeSessionsInStore.some(s => s.user_id === u.id)).length > 0) && (() => {
          const onlineOnlyInStore = onlineUsersInStore.filter(u => !activeSessionsInStore.some(s => s.user_id === u.id));
          const fmtSince = (iso: string): string => {
            const diffMin = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
            if (diffMin < 1) return "hace un momento";
            if (diffMin < 60) return `hace ${diffMin} min`;
            const h = Math.floor(diffMin / 60);
            const m = diffMin % 60;
            return m === 0 ? `hace ${h}h` : `hace ${h}h ${m}min`;
          };
          return (
            <div style={{
              display: "flex", flexDirection: "column", gap: 10,
              padding: "16px 18px", borderRadius: 20,
              background: "var(--td-card-bg)", border: "1px solid rgba(16,185,129,0.25)",
              minWidth: 320, maxWidth: 420,
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}>
              {activeSessionsInStore.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, borderBottom: "1px solid var(--td-divider)" }}>
                    <span className="animate-pulse" style={{
                      width: 8, height: 8, borderRadius: 999,
                      background: "#10b981", boxShadow: "0 0 10px rgba(16,185,129,0.7)",
                    }} />
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", color: "#10b981" }}>
                      {activeSessionsInStore.length === 1 ? "1 caja abierta ahora" : `${activeSessionsInStore.length} cajas abiertas ahora`}
                    </p>
                  </div>
                  {activeSessionsInStore.map(s => {
                    const userName = s.user_name ?? `Usuario ${s.user_id}`;
                    const opened = new Date(s.opened_at);
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <UserAvatar name={userName} avatarUrl={s.user_avatar_url} size={32} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "var(--td-text-hi)" }}>
                            {userName}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 9, fontWeight: 600, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            Su caja · ${(s.opening_cash ?? 0).toFixed(0)} inicial
                          </p>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: "var(--td-text-md)" }}>
                            {opened.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 9, color: "var(--td-text-ghost)", fontWeight: 700 }}>
                            {fmtSince(s.opened_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              {/* Conectados sin abrir caja — separados visualmente con divisor
                  y dot azul para distinguirlos de los que están vendiendo. */}
              {onlineOnlyInStore.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: activeSessionsInStore.length > 0 ? 8 : 0, paddingBottom: 8, borderTop: activeSessionsInStore.length > 0 ? "1px solid var(--td-divider)" : "none", borderBottom: "1px solid var(--td-divider)" }}>
                    <span className="animate-pulse" style={{
                      width: 8, height: 8, borderRadius: 999,
                      background: "#3b82f6", boxShadow: "0 0 10px rgba(59,130,246,0.7)",
                    }} />
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", color: "#3b82f6" }}>
                      {onlineOnlyInStore.length === 1 ? "1 conectado · sin caja" : `${onlineOnlyInStore.length} conectados · sin caja`}
                    </p>
                  </div>
                  {onlineOnlyInStore.map(u => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <UserAvatar name={u.name} avatarUrl={u.avatar_url} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "var(--td-text-hi)" }}>
                          {u.name}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 9, fontWeight: 600, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                          {u.roles?.[0] ?? "Usuario"} · sin caja abierta
                        </p>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <p style={{ margin: "0", fontSize: 9, color: "var(--td-text-ghost)", fontWeight: 700 }}>
                          {u.last_seen_at ? fmtSince(u.last_seen_at) : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })()}

        {/* Modal: Conflicto al abrir caja (sesión propia o ajena bloqueando). */}
        {openSessionConflict && (
          <OpenSessionConflictModal
            conflict={openSessionConflict}
            currentUserId={user?.id ?? null}
            isAdmin={isAdmin}
            busy={resolvingConflict}
            onClose={() => setOpenSessionConflict(null)}
            onResume={handleResumeOwnSession}
            onForceClose={handleForceCloseAndReopen}
          />
        )}

        {/* Modal: Abrir caja */}
        {showOpenCashModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }} onClick={() => setShowOpenCashModal(false)} />
            <div style={{ position: "relative", background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", borderRadius: 24, padding: 28, minWidth: 340, maxWidth: 400, width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
                <h3 style={{ color: "var(--td-text-hi)", fontSize: 16, fontWeight: 900, margin: 0 }}>Abrir Sesión de Caja</h3>
                <button onClick={() => setShowOpenCashModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--td-text-ghost)", padding: 4 }}>
                  <X size={18} />
                </button>
              </div>
              {!!activeStore && (() => {
                // Modelo "una caja por persona" (ADR-017): la caja ES tu sesión.
                // El backend la nombra "{usuario} · {tienda}", así que aquí
                // mostramos ese mismo nombre compuesto (la sesión aún no existe).
                // Se muestra aunque la tienda no tenga caja todavía: el backend
                // la crea al abrir. Varios usuarios abren su propia caja en la
                // misma tienda en paralelo; no hay "Ocupada por X" ni bloqueo.
                const cajaLabel = `${user?.name ?? "Caja"}${activeStore?.name ? ` · ${activeStore.name}` : ""}`;
                return (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--td-text-ghost)", marginBottom: 6 }}>Tu Caja</label>
                    <div style={{ width: "100%", background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 14, color: "var(--td-input-text)", padding: "10px 14px", fontSize: 13, boxSizing: "border-box" as const }}>
                      {cajaLabel}
                    </div>
                  </div>
                );
              })()}
              <div style={{ marginBottom: 22 }}>
                <label style={{ display: "block", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--td-text-ghost)", marginBottom: 6 }}>Efectivo Inicial en Caja ($MXN)</label>
                <input
                  type="number" min={0} step={1} value={openCashAmount} onChange={e => setOpenCashAmount(e.target.value)}
                  placeholder="0" autoFocus
                  style={{ width: "100%", background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 14, color: "var(--td-input-text)", padding: "10px 14px", fontSize: 18, fontWeight: 900, outline: "none", boxSizing: "border-box" as const }}
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowOpenCashModal(false)} style={{ flex: 1, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 12, color: "var(--td-text-lo)", padding: "10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
                <button onClick={() => { void handleOpenCash(); }} disabled={openingCash}
                  style={{ flex: 2, background: "linear-gradient(135deg,#BB1100,#FF3322)", border: "none", borderRadius: 12, color: "#fff", padding: "10px", fontSize: 12, fontWeight: 900, cursor: openingCash ? "not-allowed" : "pointer", opacity: openingCash ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  {openingCash ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {openingCash ? "Abriendo..." : "Abrir Caja"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden relative" style={{ background: BG, color: "var(--td-text-hi)", fontFamily: "inherit" }}>

      {/* Overlay de bloqueo total durante checkout. Tapa toda la Caja para evitar
          doble click, cambios al carrito, o cambio de método mientras se cobra. */}
      {isProcessing && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
        >
          <div
            className="flex flex-col items-center gap-4 px-10 py-8 rounded-3xl"
            style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}
          >
            <div className="w-14 h-14 rounded-2xl bg-[#E0221A]/15 border border-[#E0221A]/40 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-[#E0221A]" />
            </div>
            <div className="text-center">
              <p className="text-sm font-black uppercase tracking-widest" style={{ color: THI }}>Procesando venta</p>
              <p className="text-[11px] font-bold mt-1" style={{ color: TLO }}>No cierres ni cambies de pantalla</p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ TOP TABS (CAJAS) ══════════════════════════════════ */}
      <div
        className="flex items-center shrink-0 overflow-x-auto no-scrollbar"
        style={{ height: 48, background: "var(--td-panel-bg)" }}
      >
        <div className="flex items-center h-full px-6 gap-3 shrink-0" style={{ borderRight: CARD_B }}>
          <ShoppingBag size={18} className="text-[#E0221A]" />
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: THI }}>
              Caja · {activeStore?.name ?? "Sin tienda"}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: TLO }}>
              {user?.name?.split(" ")[0] ?? "—"}
            </span>
          </div>
        </div>

        {mesas.map((m, idx) => (
          <div
            key={m.id}
            onClick={() => setActiveMesaId(m.id)}
            className="group relative flex items-center h-full px-5 cursor-pointer transition-all"
            style={{ 
              background: activeMesaId === m.id ? "rgba(224,34,26,0.08)" : "transparent",
              minWidth: 120,
              borderRight: CARD_B,
            }}
          >
            {activeMesaId === m.id && (
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#E0221A]" />
            )}
            <span 
              className="text-[10px] font-black uppercase tracking-widest truncate mr-4"
              style={{ color: activeMesaId === m.id ? "var(--td-text-hi)" : "var(--td-text-ghost)" }}
            >
              {m.name}
            </span>
            {mesas.length > 1 && (
              <button 
                onClick={(e) => { e.stopPropagation(); removeMesa(m.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded-md transition-all ml-auto"
                style={{ color: TLO, background: SOFT }}
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}

        <button 
          onClick={addMesa}
          className="flex items-center justify-center h-full px-6 hover:bg-[#E0221A]/10 text-[#E0221A] transition-colors"
          style={{ borderRight: CARD_B }}
          title="Nueva venta paralela"
        >
          <Plus size={16} strokeWidth={3} />
        </button>

        <div className="ml-auto flex items-center h-full gap-0" style={{ borderLeft: CARD_B }}>
          <button
            onClick={() => { void openHistorial(); }}
            className="h-full px-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors"
            style={{ color: TLO, borderRight: CARD_B }}
            title="Ver historial de ventas de esta sesión"
          >
            <History size={13} />
            Historial
          </button>
          <button
            onClick={() => setShowCortesModal(true)}
            className="h-full px-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors"
            style={{ color: TLO, borderRight: CARD_B }}
            title="Ver cortes de caja (según tu rol)"
          >
            <Clock size={13} />
            Cortes
          </button>
          {/* Botón 'Clientes' del top header oculto — redundante con el
              botón 'Cliente' del toolbar al lado de Preventas que ya cubre
              asignar cliente a la venta. Para buscar histórico de un cliente
              específico se llega vía menú Clientes del sidebar. Joel 2026-05-21 */}
          {false && (
            <button
              onClick={openClientsModal}
              className="h-full px-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors border-r border-white/5"
              title="Buscar clientes y ver sus tickets / preventas"
            >
              <User size={13} />
              Clientes
            </button>
          )}
          {/* Cancelar Venta movido a la barra de buscadores (junto a Catálogo,
              Preventas, Cliente, Escanear) y solo visible cuando hay productos. */}
          <button
            onClick={() => { setCloseCashAmount(""); setShowCloseCashModal(true); }}
            className="h-full px-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors"
            style={{ color: "rgba(245,158,11,0.7)" }}
            title={`Cerrar sesión: ${cashSession?.register?.name ?? "Caja"} · Abierta ${cashSession?.opened_at ? new Date(cashSession.opened_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : ""}`}
          >
            <X size={12} />
            Cerrar Caja
          </button>
        </div>
      </div>

      {/* ── Modal: Cerrar caja / Corte ────────────────────────────────────── */}
      {showCloseCashModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)" }} onClick={() => setShowCloseCashModal(false)} />
          <div style={{ position: "relative", background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", borderRadius: 28, padding: 32, minWidth: 380, maxWidth: 460, width: "100%" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <h3 style={{ color: "var(--td-text-hi)", fontSize: 17, fontWeight: 900, margin: 0 }}>Corte de Caja</h3>
                <p style={{ color: "var(--td-text-ghost)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", margin: "4px 0 0" }}>
                  {cashSession?.register?.name ?? "Caja"} · Apertura {cashSession?.opened_at ? new Date(cashSession.opened_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—"}
                </p>
              </div>
              <button onClick={() => setShowCloseCashModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--td-text-ghost)", padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Session info */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Cajero",          value: cashSession?.user?.name ?? "—" },
                { label: "Efectivo inicial", value: `$${(cashSession?.opening_cash ?? 0).toLocaleString("es-MX")}` },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 14, padding: "12px 16px" }}>
                  <p style={{ margin: 0, fontSize: 9, fontWeight: 900, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 900, color: "var(--td-text-hi)" }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Closing cash input */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--td-text-ghost)", marginBottom: 8 }}>
                Efectivo en Caja al Cierre ($MXN)
              </label>
              <input
                type="number" min={0} step={1} value={closeCashAmount}
                onChange={e => setCloseCashAmount(e.target.value)}
                placeholder="0" autoFocus
                style={{ width: "100%", background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 14, color: "var(--td-input-text)", padding: "12px 16px", fontSize: 22, fontWeight: 900, outline: "none", boxSizing: "border-box" as const }}
              />
              <p style={{ margin: "8px 0 0", fontSize: 10, color: "var(--td-text-ghost)", fontWeight: 600 }}>
                Este valor se compara contra el dinero físico esperado en caja. Las ventas con tarjeta sí salen en reportes y tickets, pero no cuentan para el faltante o sobrante del cajón.
              </p>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowCloseCashModal(false)} style={{ flex: 1, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 14, color: "var(--td-text-lo)", padding: "12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Cancelar
              </button>
              <button
                onClick={() => { void handleCloseCash(); }}
                disabled={closingCashLoading}
                style={{ flex: 2, background: "linear-gradient(135deg, #7A3800, #F59E0B)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 14, color: "#fff", padding: "12px", fontSize: 12, fontWeight: 900, cursor: closingCashLoading ? "not-allowed" : "pointer", opacity: closingCashLoading ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {closingCashLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {closingCashLoading ? "Cerrando..." : "Confirmar Corte"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* ══════════════════ MAIN CART AREA ══════════════════════════════════ */}
        <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden" style={{ background: "var(--td-card-bg)", isolation: "isolate" }}>

          {/* Fondo decorativo: Charizard VOLANDO detrás del carrito. El contenedor
              maneja posición (centrado + baja con los items) + blur/opacidad; la
              imagen vuela: entra desde arriba (-500), baja con overshoot y sube a su
              posición, luego flota en su sitio. z-index:-1 lo manda atrás, sin eventos. */}
          <style>{`
            @keyframes td-charizard-in {
              0%   { transform: translateY(-500px); }
              65%  { transform: translateY(20px); }
              82%  { transform: translateY(-8px); }
              100% { transform: translateY(0); }
            }
            @keyframes td-charizard-hover {
              0%, 100% { transform: translateY(0); }
              50%      { transform: translateY(44px); }
            }
          `}</style>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              top: 120,
              width: 300,
              transform: `translate(-50%, ${Math.min(activeMesa.items.length * 56, 360)}px)`,
              transition: "transform 0.55s cubic-bezier(0.16,1,0.3,1), filter 0.5s ease, opacity 0.5s ease",
              // Sin items: nítido y visible (se ve completo). Con items: blur sutil de fondo.
              filter: activeMesa.items.length === 0 ? "blur(0px)" : "blur(7px)",
              opacity: activeMesa.items.length === 0 ? 0.95 : 0.18,
              pointerEvents: "none",
              zIndex: -1,
            }}
          >
            <img
              src="/charizard-bg.gif"
              alt=""
              style={{
                width: 300,
                display: "block",
                imageRendering: "pixelated",
                // Vuela hacia adentro una vez, luego flota infinito (efecto vuelo).
                animation: "td-charizard-in 1.9s cubic-bezier(0.16,1,0.3,1) both, td-charizard-hover 4.5s ease-in-out 1.9s infinite",
              }}
            />
          </div>

          {/* ── Barra de info de caja ─────────────────────────────────────────── */}
          <div className="shrink-0 flex items-center justify-between px-5 py-2" style={{ background: "var(--td-panel-bg)", borderBottom: CARD_B }}>
            <div className="flex items-center gap-5">
              {activeStore && (
                <div className="flex items-center gap-1.5">
                  <span style={{ fontSize: 9, fontWeight: 700, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Tienda</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--td-text-md)" }}>{activeStore.name}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cajero</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--td-text-md)" }}>{user?.name?.split(" ")[0] ?? "—"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Fecha</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--td-text-md)" }}>
                  {new Date().toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg"
                style={{ fontSize: 9, background: "rgba(74,222,128,0.08)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.18)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em" }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block", boxShadow: "0 0 6px rgba(74,222,128,0.8)" }} />
                {cashSession.register?.name ?? "Caja Activa"}
              </div>
            </div>
          </div>

          {/* Buscadores Principales */}
          <div className="p-4 space-y-3">
            <div className="flex flex-col gap-3">
              {/* Bloque cliente: solo visible en preventa (ahí es required).
                  En venta regular se asigna desde el botón "Cliente" del toolbar
                  o automáticamente al escanear código TAD\d+ de socio Tadaima. */}
              {activeMesa.isPreventa && (
              <div className={`rounded-[24px] border px-4 py-4 transition-all ${
                hasAssignedCustomer
                  ? "border-emerald-500/20 bg-emerald-500/[0.05]"
                  : "border-amber-500/25 bg-amber-500/[0.05]"
              }`}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-2xl flex items-center justify-center border ${
                        activeMesa.isPreventa
                          ? hasAssignedCustomer
                            ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                            : "border-amber-400/30 bg-amber-500/10 text-amber-300"
                          : "border-white/10 bg-white/[0.05] text-white/70"
                      }`}>
                        <User size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: THI }}>
                          {activeMesa.isPreventa ? "Paso 1 · Cliente de la preventa" : "Cliente del ticket"}
                        </p>
                        <p className="text-[11px] font-bold mt-0.5" style={{ color: TLO }}>
                          {activeMesa.isPreventa
                            ? "Busca, escanea o registra al cliente antes de cobrar el anticipo."
                            : "Opcional para la venta regular, útil para historial y ticket."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`shrink-0 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                      activeMesa.isPreventa
                        ? hasAssignedCustomer
                          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
                          : "border-amber-400/25 bg-amber-500/10 text-amber-300"
                        : ""
                    }`}
                    style={!activeMesa.isPreventa ? { border: CARD_B, background: hasAssignedCustomer ? MUTED : SOFT, color: hasAssignedCustomer ? THI : TLO } : undefined}
                  >
                    {activeMesa.isPreventa
                      ? hasAssignedCustomer ? "Cliente asignado" : "Requerido"
                      : hasAssignedCustomer ? "Cliente seleccionado" : "Sin cliente"}
                  </div>
                </div>

                {activeMesa.isPreventa && (
                  <div className="flex p-1 rounded-2xl w-fit mb-3" style={{ background: SOFT, border: CARD_B }}>
                    <button 
                      onClick={() => updMesa(activeMesa.id, m => ({ ...m, isNewCustomer: false }))}
                      className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!activeMesa.isNewCustomer ? 'bg-[#E0221A] text-white shadow-lg' : ''}`}
                      style={activeMesa.isNewCustomer ? { color: TLO } : undefined}
                    >
                      <Users size={14} />
                      Buscar existente
                    </button>
                    <button 
                      onClick={() => updMesa(activeMesa.id, m => ({ ...m, isNewCustomer: true, customerId: undefined, customerPhone: m.customerPhone || "" }))}
                      className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeMesa.isNewCustomer ? 'bg-amber-500 text-black shadow-lg' : ''}`}
                      style={!activeMesa.isNewCustomer ? { color: TLO } : undefined}
                    >
                      <UserPlus size={14} />
                      Dar de alta
                    </button>
                  </div>
                )}

                {(activeMesa.isPreventa && activeMesa.isNewCustomer) ? (
                  <div className="flex flex-col gap-2.5 w-full">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                      <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500/60">
                          <User size={15} />
                        </div>
                        <input
                          type="text"
                          placeholder="Nombre completo *"
                          value={activeMesa.customerName || ""}
                          onChange={e => updMesa(activeMesa.id, m => ({ ...m, customerName: e.target.value }))}
                          className="w-full bg-amber-500/5 border border-amber-500/30 rounded-2xl pl-11 pr-4 py-2.5 text-sm font-bold text-white placeholder:text-amber-500/30 focus:border-amber-500/50 outline-none transition-all"
                        />
                      </div>
                      <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500/60">
                          <Phone size={15} />
                        </div>
                        <input
                          type="tel"
                          placeholder="WhatsApp / teléfono"
                          value={activeMesa.customerPhone || ""}
                          onChange={e => updMesa(activeMesa.id, m => ({ ...m, customerPhone: e.target.value }))}
                          className={`w-full bg-amber-500/5 border rounded-2xl pl-11 pr-4 py-2.5 text-sm font-bold text-white placeholder:text-amber-500/30 outline-none transition-all ${activeMesa.customerPhone?.trim() && !isValidPhone(activeMesa.customerPhone) ? "border-red-500/60 focus:border-red-500/80" : "border-amber-500/30 focus:border-amber-500/50"}`}
                        />
                      </div>
                      <button
                        onClick={() => {
                          updMesa(activeMesa.id, m => ({ ...m, isNewCustomer: false, customerName: undefined, customerPhone: "", customerEmail: "" }));
                          setCustomerSearch("");
                        }}
                        className="flex items-center justify-center px-3 rounded-2xl transition-all"
                        style={{ background: SOFT, border: CARD_B, color: TLO }}
                        title="Cancelar registro"
                      >
                        <X size={15} />
                      </button>
                    </div>
                    {/* Label de error inline — regex compartido con Sucursales/Usuarios (Joel 2026-06-12) */}
                    {activeMesa.customerPhone?.trim() && !isValidPhone(activeMesa.customerPhone) && (
                      <p className="text-[10px] font-bold text-red-400 ml-1 -mt-1">Teléfono inválido — deben ser 10 dígitos (ej. 55 1234 5678)</p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                      <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500/40">
                          <Mail size={14} />
                        </div>
                        <input
                          type="email"
                          placeholder="Correo electrónico (opcional)"
                          value={activeMesa.customerEmail || ""}
                          onChange={e => updMesa(activeMesa.id, m => ({ ...m, customerEmail: e.target.value }))}
                          className={`w-full bg-amber-500/5 border rounded-2xl pl-10 pr-4 py-2.5 text-sm font-bold text-white placeholder:text-amber-500/25 outline-none transition-all ${activeMesa.customerEmail?.trim() && !isValidEmail(activeMesa.customerEmail) ? "border-red-500/60 focus:border-red-500/80" : "border-amber-500/20 focus:border-amber-500/40"}`}
                        />
                      </div>
                      <button
                        disabled={isRegisteringCustomer || !activeMesa.customerName?.trim()
                          || !!(activeMesa.customerPhone?.trim() && !isValidPhone(activeMesa.customerPhone))
                          || !!(activeMesa.customerEmail?.trim() && !isValidEmail(activeMesa.customerEmail))}
                        onClick={async () => {
                          if (!activeMesa.customerName?.trim()) return;
                          if (activeMesa.customerPhone?.trim() && !isValidPhone(activeMesa.customerPhone)) return;
                          if (activeMesa.customerEmail?.trim() && !isValidEmail(activeMesa.customerEmail)) return;
                          setIsRegisteringCustomer(true);
                          try {
                            const newCust = await createCustomer({
                              name: activeMesa.customerName.trim(),
                              phone: activeMesa.customerPhone?.trim() || undefined,
                              email: activeMesa.customerEmail?.trim() || undefined,
                            });
                            updMesa(activeMesa.id, m => ({
                              ...m,
                              customerId: String(newCust.id),
                              customerName: newCust.name,
                              customerPhone: newCust.phone ?? "",
                              customerEmail: newCust.email ?? "",
                              isNewCustomer: false,
                            }));
                            setCustomerSearch(newCust.name);
                            toast.success(`Cliente registrado: ${newCust.name}`, {
                              style: {
                                background: '#052e16',
                                color: '#86efac',
                                border: '1px solid rgba(74,222,128,0.3)',
                                borderRadius: '14px',
                              },
                            });
                          } catch {
                            toast.error("No se pudo registrar el cliente");
                          } finally {
                            setIsRegisteringCustomer(false);
                          }
                        }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500 text-black text-[11px] font-black uppercase tracking-widest hover:bg-amber-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        {isRegisteringCustomer ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                        {isRegisteringCustomer ? "Guardando…" : "Guardar cliente"}
                      </button>
                    </div>
                    {activeMesa.customerEmail?.trim() && !isValidEmail(activeMesa.customerEmail) && (
                      <p className="text-[10px] font-bold text-red-400 ml-1 -mt-1">Correo inválido (ej. cliente@correo.com)</p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="relative flex-1" ref={custRef}>
                      <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${requireCustomerFlash ? "text-amber-400" : ""}`} style={!requireCustomerFlash ? { color: TLO } : undefined}>
                        <Search size={16} />
                      </div>
                      <input
                        ref={customerSearchRef}
                        type="text"
                        placeholder={requireCustomerFlash ? "Escribe nombre o teléfono del cliente…" : "Busca por nombre, teléfono, correo o código de tarjeta…"}
                        value={customerSearch}
                        onChange={e => { setCustomerSearch(e.target.value); setShowCustDrop(true); }}
                        onFocus={() => { setShowCustDrop(true); setRequireCustomerFlash(false); }}
                        className={`w-full rounded-2xl pl-12 pr-4 py-3 text-sm font-bold outline-none transition-all ${
                          requireCustomerFlash
                            ? "bg-amber-400/8 border-2 border-amber-400 ring-4 ring-amber-400/20 placeholder:text-amber-400/60 animate-pulse"
                            : ""
                        }`}
                        style={!requireCustomerFlash ? { background: SOFT, border: CARD_B, color: THI } : undefined}
                      />

                      <AnimatePresence>
                        {showCustDrop && customerSearch.length > 0 && (
                          <Motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute top-full left-0 right-0 mt-2 z-[100] rounded-2xl overflow-hidden shadow-2xl max-h-[300px] overflow-y-auto no-scrollbar"
                            style={{ background: "var(--td-popup-bg)", border: BORDER }}
                          >
                            {filteredCusts.length === 0 ? (
                          <div className="p-4 flex flex-col items-center gap-3">
                                {headerSearchingExternal && (
                                  <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                                    <Loader2 size={14} className="animate-spin text-amber-400" />
                                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                                      Buscando en socios Tadaima…
                                    </p>
                                  </div>
                                )}
                                {!headerSearchingExternal && extSearchResults.length === 0 && (
                                  <p className="text-xs font-bold uppercase tracking-widest text-center" style={{ color: TLO }}>No se encontró en la base local</p>
                                )}
                                {extSearchResults.length > 0 && (
                                  <div className="w-full space-y-1">
                                    <p className="text-[9px] font-black text-red-400/70 uppercase tracking-widest px-1 pb-1">Socios Tadaima</p>
                                    {extSearchResults.map(ext => (
                                      <button
                                        key={ext.external_member_id}
                                        type="button"
                                        onClick={() => handleAddExtCust(ext)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-red-600/8 border border-red-500/20 hover:bg-red-600/18 transition-all text-left"
                                      >
                                        <div className="w-8 h-8 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center text-[10px] font-black text-red-400 shrink-0">
                                          {(ext.name ?? "?").charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-black truncate" style={{ color: THI }}>{ext.name}</p>
                                          <p className="text-[10px]" style={{ color: TLO }}>{ext.external_member_id}{ext.phone ? ` · ${ext.phone}` : ""}{ext.email ? ` · ${ext.email}` : ""}</p>
                                        </div>
                                        <span className="text-[10px] font-black text-red-400 uppercase tracking-wider shrink-0">Agregar</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {activeMesa.isPreventa && (
                                  <button 
                                    onClick={() => {
                                      updMesa(activeMesa.id, m => ({ ...m, isNewCustomer: true, customerName: customerSearch, customerPhone: "" }));
                                      setShowCustDrop(false);
                                    }}
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 font-black text-[10px] uppercase tracking-widest hover:bg-amber-500/20 transition-all"
                                  >
                                    <UserPlus size={14} />
                                    Registrar como nuevo
                                  </button>
                                )}
                              </div>
                            ) : (
                              filteredCusts.map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => setCustomer(c)}
                                  className="w-full text-left px-5 py-4 transition-colors group"
                                  style={{ borderBottom: "1px solid var(--td-divider)" }}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-black group-hover:text-[#E0221A] transition-colors truncate" style={{ color: THI }}>{c.name}</p>
                                      <p className="text-[10px] truncate" style={{ color: TLO }}>
                                        {c.phone || "Sin tel."}
                                        {c.email ? ` · ${c.email}` : ""}
                                      </p>
                                    </div>
                                    {c.external_member_id && (
                                      <span className="text-[9px] font-black text-red-400/70 uppercase tracking-widest shrink-0">
                                        Socio
                                      </span>
                                    )}
                                  </div>
                                </button>
                              ))
                            )}
                          </Motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <p className="text-[10px] font-bold px-1" style={{ color: TLO }}>
                      Primero busca en tu base local; si no existe, intentamos encontrarlo en socios Tadaima o lo damos de alta aquí mismo.
                    </p>

                    {requireCustomerFlash && (
                      <div className="flex items-center gap-2 px-1">
                        <AlertCircle size={12} className="text-amber-400 shrink-0" />
                        <span className="text-[11px] font-black text-amber-400 animate-pulse">
                          Busca o registra al cliente antes de apartar
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {hasAssignedCustomer && (
                  <div className="mt-3 rounded-2xl px-4 py-3" style={{ border: CARD_B, background: MUTED }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-[0.16em]" style={{ color: TLO }}>
                          Cliente asignado a esta {activeMesa.isPreventa ? "preventa" : "venta"}
                        </p>
                        <p className="text-sm font-black mt-1 truncate" style={{ color: THI }}>
                          {activeMesa.customerName}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] font-bold" style={{ color: TMD }}>
                          {activeMesa.customerPhone && <span className="flex items-center gap-1"><Phone size={11} /> {activeMesa.customerPhone}</span>}
                          {activeMesa.customerEmail && <span className="flex items-center gap-1"><Mail size={11} /> {activeMesa.customerEmail}</span>}
                          {activeMesa.customerId && <span className="text-emerald-400/70">Registrado</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            customerSearchRef.current?.focus();
                            setShowCustDrop(true);
                          }}
                          className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                          style={{ border: CARD_B, background: SOFT, color: TMD }}
                        >
                          Cambiar
                        </button>
                        <button
                          onClick={clearCustomer}
                          disabled={!!activeMesa.loadedPreSaleOrderId}
                          className="px-3 py-2 rounded-xl border border-red-500/20 bg-red-500/10 text-[10px] font-black uppercase tracking-widest text-red-300 hover:bg-red-500/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          title={activeMesa.loadedPreSaleOrderId ? "Folio cargado — no se puede quitar el cliente" : "Quitar cliente"}
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* Buscador de Productos (Manual) */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: TLO }}>
                  <Plus size={16} />
                </div>
                <input
                  ref={prodInputRef}
                  type="text"
                  placeholder="Añadir producto, escanear código o tipear folio (PREV-…)"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key !== "Enter") return;
                    // Si el cajero tecleó un folio PREV-NNN, busca y carga la
                    // preventa. Prioridad al cache local; si no, query backend.
                    if (isFolioSearch) {
                      e.preventDefault();
                      const code = search.trim().toUpperCase();
                      const localMatch = filteredFolios.find(o => o.code.toUpperCase() === code)
                        ?? (filteredFolios.length === 1 ? filteredFolios[0] : null);
                      if (localMatch) {
                        getPreSaleOrder(localMatch.id)
                          .then(detail => loadPreSaleOrderIntoCart(detail))
                          .then(() => setSearch(""))
                          .catch(() => toast.error("Error al cargar la preventa"));
                      } else {
                        // No está en cache → backend lookup (handles "no encontrado")
                        void searchByFolio(code).then(() => setSearch(""));
                      }
                      return;
                    }
                    // Enter en escaneo / búsqueda de producto: si hay un único match exacto, lo agrega y limpia.
                    if (filteredProds.length === 0) return;
                    e.preventDefault();
                    const exact = filteredProds.find(p => p.sku === search.trim()) ?? (filteredProds.length === 1 ? filteredProds[0] : null);
                    if (!exact) return;
                    void addToCart(exact, "a");
                    setSearch("");
                  }}
                  className="w-full rounded-2xl pl-12 pr-4 py-2.5 text-sm font-bold outline-none transition-all shadow-inner"
                  style={{ background: SOFT, border: CARD_B, color: THI }}
                />
                
                {/* Resultados de búsqueda rápidos */}
                {search.length > 0 && (
                  <div className="absolute top-full left-0 mt-2 z-[110] rounded-2xl overflow-hidden shadow-2xl max-h-[360px] overflow-y-auto no-scrollbar" style={{ background: "var(--td-popup-bg)", border: BORDER, minWidth: 620, maxWidth: "90vw" }}>
                    {isFolioSearch ? (
                      filteredFolios.length === 0 ? (
                        <div className="p-4 text-center text-xs font-bold uppercase tracking-widest" style={{ color: TLO }}>
                          Sin folios que empiecen con "{search.trim()}"
                          <p className="text-[10px] mt-1 normal-case tracking-normal" style={{ color: TLO }}>Enter para buscar en backend</p>
                        </div>
                      ) : (
                        filteredFolios.map(o => {
                          const isReady     = o.status === 'ready';
                          const isPending   = o.status === 'pending';
                          const isDelivered = o.status === 'delivered';
                          const itemsCount  = (o.items ?? []).reduce((s, it) => s + (it.quantity ?? 0), 0);
                          const statusLabel = isDelivered ? 'Liquidado' : isReady ? 'Listo · Liquidar' : isPending ? 'Pendiente de llegada' : (o.status ?? '');
                          const statusColor = isDelivered ? '#22c55e' : isReady ? '#10b981' : isPending ? '#f59e0b' : '#6b7280';
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => {
                                getPreSaleOrder(o.id)
                                  .then(detail => loadPreSaleOrderIntoCart(detail))
                                  .then(() => setSearch(""))
                                  .catch(() => toast.error("Error al cargar la preventa"));
                              }}
                              className="w-full px-5 py-4 flex items-center gap-4 text-left transition-colors"
                              style={{ borderBottom: "1px solid var(--td-panel-border)" }}
                            >
                              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{
                                background: `${statusColor}1A`,
                                border: `1px solid ${statusColor}55`,
                              }}>
                                <Bookmark size={18} style={{ color: statusColor }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{o.code}</span>
                                  <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: `${statusColor}22`, color: statusColor }}>
                                    {statusLabel}
                                  </span>
                                </div>
                                <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--td-text-md)" }}>
                                  {o.customer?.name ?? "Sin cliente"}
                                  {itemsCount > 0 && <span style={{ color: "var(--td-text-ghost)" }}> · {itemsCount} item{itemsCount === 1 ? "" : "s"}</span>}
                                </p>
                                <p className="text-[10px] mt-0.5" style={{ color: "var(--td-text-ghost)" }}>
                                  Anticipo {fmt(o.paid_amount ?? 0)} de {fmt(o.total ?? 0)}
                                  {o.balance != null && o.balance > 0 && (
                                    <span style={{ color: "#f59e0b", marginLeft: 6 }}>· Por cobrar {fmt(o.balance)}</span>
                                  )}
                                </p>
                              </div>
                            </button>
                          );
                        })
                      )
                    ) : filteredProds.length === 0 ? (
                        <div className="p-4 text-center text-xs font-bold uppercase tracking-widest" style={{ color: TLO }}>No se encontró el producto</div>
                    ) : (
                      filteredProds.map(p => (
                        <div
                          key={p.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => { void addToCart(p, "a"); setSearch(""); }}
                          onKeyDown={e => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              void addToCart(p, "a");
                              setSearch("");
                            }
                          }}
                          className="w-full px-5 py-4 flex items-center gap-5 group cursor-pointer transition-colors"
                          style={{ borderBottom: "1px solid var(--td-panel-border)" }}
                        >
                          <ImageWithFallback src={p.image || ""} className="w-16 h-16 rounded-xl object-cover shrink-0 shadow-lg" style={{ background: MUTED }} />

                          <div className="flex-1 min-w-0">
                            <p className="text-base font-black text-white truncate" style={{ color: "var(--td-text-hi)" }}>
                              {p.name}
                              {p.volume_number != null && (
                                <span style={{
                                  marginLeft: 8, padding: "1px 7px", borderRadius: 6, verticalAlign: "middle",
                                  fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em",
                                  color: "#60A5FA", background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.3)",
                                }}>
                                  Tomo {p.volume_number}
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] uppercase tracking-[0.15em] mt-0.5" style={{ color: "var(--td-text-ghost)" }}>{p.sku}</p>

                            {/* Restricción de pago — pill notorio (Joel 2026-06-13)
                                para que el cajero vea de inmediato si el artículo
                                solo acepta efectivo o solo tarjeta. */}
                            {getPayRestriction(p) && (
                              <div className="mt-2">
                                <PaymentRestrictionBadge restriction={getPayRestriction(p)} size="md" />
                              </div>
                            )}

                            {/* Stock Breakdown */}
                            <div className="flex gap-3 mt-2 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${!activeMesa.isPreventa ? 'bg-emerald-500' : ''}`} style={activeMesa.isPreventa ? { background: "var(--td-card-border)" } : undefined} />
                                <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: !activeMesa.isPreventa ? THI : TLO }}>Tienda: {p.stock_details?.tienda || 0}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${activeMesa.isPreventa ? 'bg-amber-500 animate-pulse' : 'bg-amber-500/20'}`} />
                                <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: activeMesa.isPreventa ? "#f59e0b" : TLO }}>Preventa: {p.stock_details?.preventa || 0}</span>
                              </div>
                              {(p.stock_details?.dañado ?? 0) > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <TriangleAlert size={10} className="text-orange-400" />
                                  <span className="text-[11px] font-black uppercase tracking-widest text-orange-400">
                                    Dañado: {p.stock_details?.dañado || 0}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Precios — un row grande por nivel ASIGNADO (Joel
                              2026-06-10: 1=Normal, 2=Socio, 3=Mayorista; antes
                              decían "Precio A/B/C" en 8px). Click agrega al
                              carrito en ese nivel; stopPropagation evita
                              doble-fire del onClick del row. */}
                          <div className="flex flex-col gap-1.5 items-stretch shrink-0 min-w-[150px]">
                            {getPriceLevels(p).map(lvl => {
                              // Color de identidad por nivel (Normal=verde,
                              // Socio=ámbar, Mayorista=azul) — Joel 2026-06-11.
                              const rgb = PRICE_LEVEL_RGB[lvl.level];
                              return (
                                <button
                                  key={lvl.level}
                                  onClick={e => { e.stopPropagation(); void addToCart(p, lvl.level); setSearch(""); }}
                                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border transition-colors"
                                  style={{ background: `rgba(${rgb},0.07)`, borderColor: `rgba(${rgb},0.25)` }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `rgba(${rgb},0.16)`; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `rgba(${rgb},0.07)`; }}
                                  title={`Agregar a ${lvl.label}`}
                                >
                                  <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: `rgba(${rgb},0.9)` }}>
                                    {lvl.label}
                                  </span>
                                  <span className="text-lg font-black" style={{ color: PRICE_LEVEL_COLORS[lvl.level] }}>
                                    {fmt(lvl.price)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Botón Catálogo — al abrir, invalida products para traer stock fresco
                  del backend. Evita el caso "UI dice 10, server dice 0". */}
              <button
                onClick={() => {
                  setShowCatalog(true);
                  void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
                }}
                className="flex items-center gap-2 px-5 rounded-2xl transition-all font-black uppercase tracking-widest text-[10px]"
                style={{ background: SOFT, border: CARD_B, color: TMD }}
                title="Ver catálogo completo"
              >
                <LayoutGrid size={16} />
                Catálogo
              </button>

              {/* Botón unificado Preventas */}
              <button
                onClick={() => void openPreSalesModal('venta')}
                className={`flex items-center gap-2 px-5 rounded-2xl border transition-all font-black uppercase tracking-widest text-[10px] ${
                  activeMesa.isPreventa
                    ? "bg-amber-500 border-amber-400 text-black"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:text-amber-300 hover:bg-amber-500/15"
                }`}
                title="Gestionar preventas"
              >
                <ClipboardList size={16} />
                Preventas
              </button>

              {/* Botón Cliente — asigna cliente a esta venta. Buscador manual o
                  espera que el cajero escanee una tarjeta TAD (auto-asigna). */}
              <button
                onClick={openCustomerManualPopup}
                className={`flex items-center gap-3 px-5 rounded-2xl border transition-all font-black uppercase tracking-widest text-[10px] ${
                  activeMesa.customerId
                    ? "bg-emerald-500/[0.08] border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/[0.12]"
                    : ""
                }`}
                style={!activeMesa.customerId ? { background: SOFT, border: CARD_B, color: TMD } : undefined}
                title={activeMesa.customerId ? `Asignado: ${activeMesa.customerName}` : "Asignar cliente o socio Tadaima"}
              >
                <User size={16} />
                {activeMesa.customerId ? "Cliente ✓" : "Cliente"}
              </button>

              {/* Botón Escanear (cámara) — OCULTO en desktop/laptop/PC.
                  Las tiendas usan scanner USB-HID conectado físicamente; abrir la
                  webcam en una laptop o PC es ruido (pide permisos, abre LED, etc).
                  El lector USB HID sigue activo globalmente vía useBarcodeScanner. */}
              {false && (
                <button
                  onClick={() => setShowCameraScanner(true)}
                  className="flex items-center gap-3 px-6 rounded-2xl bg-[#E0221A]/[0.08] border border-[#E0221A]/20 text-[#E0221A] hover:bg-[#E0221A]/[0.12] transition-all font-black uppercase tracking-widest text-[10px]"
                  title="Escanear con cámara (folio PREV, SKU o tarjeta TAD)"
                >
                  <ScanLine size={18} />
                  Escanear
                </button>
              )}

              {/* Cancelar Venta — solo visible si hay productos. Vacía toda la venta:
                  items, cliente, descuento, terminal, folio cargado. Sin pegar al backend. */}
              {activeMesa.items.length > 0 && (
                <button
                  onClick={clearCart}
                  className="flex items-center gap-2 px-5 rounded-2xl transition-all font-black uppercase tracking-widest text-[10px]"
                  style={{ background: SOFT, border: CARD_B, color: TMD }}
                  title="Vaciar todos los productos y el cliente de esta venta"
                >
                  <X size={14} />
                  Cancelar Venta
                </button>
              )}
            </div>
          </div>

          {/* Info banner: múltiples productos en preventa */}
          {activeMesa.isPreventa && activeMesa.items.length > 1 && (
            <div className="px-4 pb-2">
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5">
                <Tag size={12} className="text-amber-400 shrink-0" />
                <p className="text-[9px] font-bold text-amber-400/80">
                  <strong>{activeMesa.items.length} apartados independientes</strong> se crearán — uno por producto, con folio y entrega separados.
                </p>
              </div>
            </div>
          )}

          {/* Lista de Items del Carrito */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">
            {activeMesa.items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-20 gap-4">
                <div className="w-24 h-24 rounded-full border-2 border-dashed flex items-center justify-center" style={{ borderColor: "var(--td-card-border)" }}>
                  <ShoppingBag size={40} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-black uppercase tracking-[0.2em]" style={{ color: THI }}>Sin productos</p>
                  <p className="text-[10px] font-bold mt-1" style={{ color: TMD }}>Escanea o busca un producto para iniciar la venta</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {activeMesa.items.map((item, idx) => (
                  (() => {
                    const hasItemImage = !!item.product.image?.trim();
                    const shouldHideImageSlot = !hasItemImage;
                    const priceLevels = getPriceLevels(item.product);
                    const unitPrice = getItemPrice(item);
                    const lineTotal = unitPrice * item.quantity;
                    const activePriceLabel = PRICE_LEVEL_LABELS[item.priceLevel] ?? "Precio";
                    const activePriceColor = item.isDamaged ? "#F97316" : (PRICE_LEVEL_COLORS[item.priceLevel] ?? "var(--td-text-hi)");
                    const activePriceRgb = item.isDamaged ? "249,115,22" : (PRICE_LEVEL_RGB[item.priceLevel] ?? "255,255,255");

                    return (
                  <Motion.div 
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={`${item.product.id}-${item.priceLevel}`}
                    className={`group rounded-2xl p-4 flex items-center gap-4 transition-all border ${
                      item.preSaleItemDelivered
                        ? "bg-emerald-500/[0.04] border-emerald-500/15 opacity-50"
                        : item.isDamaged
                          ? "bg-orange-500/[0.06] border-orange-500/25 hover:bg-orange-500/[0.10]"
                          : ""
                    }`}
                    style={!item.preSaleItemDelivered && !item.isDamaged ? { background: SOFT, borderColor: "var(--td-card-border)" } : undefined}
                  >
                    {/* Las preventas nuevas suelen no tener imagen; si no existe, no reservamos ese espacio */}
                    {!shouldHideImageSlot && (
                      <div className="relative shrink-0">
                        <ImageWithFallback src={item.product.image || ""} className="w-14 h-14 rounded-xl object-cover" style={{ background: MUTED }} />
                        {item.isDamaged && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center shadow-lg">
                            <TriangleAlert size={10} className="text-white" strokeWidth={3} />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-black truncate leading-tight" style={{ color: THI }}>{item.product.name}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: TLO }}>{item.product.sku}</p>
                        {item.isFromPreSale && !item.preSaleItemDelivered && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[7px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1">
                            <PackageCheck size={8} />
                            Pendiente
                          </span>
                        )}
                        {item.preSaleItemDelivered && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[7px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                            <Check size={8} />
                            Entregado
                          </span>
                        )}
                        <PaymentRestrictionBadge restriction={getPayRestriction(item.product)} size="sm" />
                        {activeMesa.paymentMethod === "Tarjeta" && item.product.allow_card === false && (
                          <span className="px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-[7px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1">
                            <TriangleAlert size={8} />
                            No acepta tarjeta
                          </span>
                        )}
                        {(activeMesa.paymentMethod === "Efectivo" || activeMesa.paymentMethod === "Dólares") && item.product.allow_cash === false && (
                          <span className="px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-[7px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1">
                            <TriangleAlert size={8} />
                            No acepta efectivo
                          </span>
                        )}
                        {item.isDamaged && (
                          <span className="px-1.5 py-0.5 rounded bg-orange-500/15 border border-orange-500/30 text-[7px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1">
                            <PackageX size={8} />
                            Dañado
                          </span>
                        )}
                      </div>

                      {/* Botón Dañado */}
                      {(item.product.stock_damaged ?? 0) > 0 && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          <button
                            onClick={() => toggleDamaged(item.product.id)}
                            className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                              item.isDamaged
                                ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                                : ""
                            }`}
                            style={!item.isDamaged ? { borderColor: "var(--td-card-border)", color: TLO } : undefined}
                          >
                            <TriangleAlert size={9} />
                            Dañado
                          </button>
                        </div>
                      )}

                      {/* ── Anticipo individual (solo items de preventa: catálogo o ya cargados de orden) ── */}
                      {(item.sellingCatalogId != null || item.isFromPreSale) && (() => {
                        const itemTotal = lineTotal;
                        const dep = item.depositAmount ?? 0;
                        const full = dep >= itemTotal && itemTotal > 0;
                        return (
                          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: TLO }}>
                              Anticipo
                            </span>
                            <span className={`flex items-center gap-1 rounded-xl px-3 py-1 border ${full ? "bg-emerald-500/15 border-emerald-400/30" : "bg-amber-400/15 border-amber-400/35"}`}>
                              <span className={`text-[13px] font-black ${full ? "text-emerald-300" : "text-amber-300"}`}>
                                {fmt(dep)}
                              </span>
                            </span>
                            <span className="text-[9px] font-black" style={{ color: TLO }}>
                              de {fmt(itemTotal)}
                            </span>
                            {full && (
                              <span className="text-[9px] font-black text-emerald-400 flex items-center gap-1">
                                <Check size={9} /> Liquidado
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Input de precio dañado */}
                      {item.isDamaged && (
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <span className="text-[9px] font-black text-orange-400/60 uppercase tracking-widest">Precio a cobrar:</span>
                          <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/30 rounded-xl px-3 py-1">
                            <span className="text-[11px] font-black text-orange-400/60">$</span>
                            <input
                              type="number"
                              min={0}
                              value={item.damagedPrice ?? ""}
                              onChange={e => setDamagedPrice(item.product.id, parseFloat(e.target.value) || 0)}
                              className="w-20 bg-transparent outline-none text-sm font-black text-orange-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-orange-400/30"
                              placeholder="0"
                            />
                          </div>
                          {/* Precio original tachado */}
                          {(() => {
                            let base = item.product.price_a || 0;
                            if (item.priceLevel === "b" && item.product.price_b) base = item.product.price_b;
                            if (item.priceLevel === "c" && item.product.price_c) base = item.product.price_c;
                            const saving = base - (item.damagedPrice ?? base);
                            return (
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] line-through font-bold" style={{ color: TLO }}>{fmt(base)}</span>
                                {saving > 0 && (
                                  <span className="text-[9px] font-black text-orange-400/70 bg-orange-500/10 px-1.5 py-0.5 rounded">
                                    -{fmt(saving)}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          <span className="text-[8px] text-orange-400/30 font-bold ml-auto">
                            stock dañado: {item.product.stock_damaged}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-3 self-stretch">
                      {!item.isFromPreSale && priceLevels.length > 0 && (
                        <div className="w-[188px] self-center">
                          <div className="relative">
                            <select
                              value={item.priceLevel}
                              onChange={e => changeLevel(item.product.id, e.target.value as PriceLevel)}
                              className="w-full appearance-none rounded-2xl px-4 py-3 pr-10 text-[11px] font-black uppercase tracking-[0.14em] outline-none transition-colors"
                              style={{
                                color: activePriceColor,
                                border: `1px solid rgba(${activePriceRgb},0.32)`,
                                background: `rgba(${activePriceRgb},0.12)`,
                              }}
                            >
                              {priceLevels.map(lvl => (
                                <option key={lvl.level} value={lvl.level}>
                                  {lvl.label} {fmt(lvl.price)}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: activePriceColor }} />
                          </div>
                        </div>
                      )}

                      {item.isFromPreSale ? (
                        <div className="flex h-[54px] w-[84px] items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/5">
                          <span className="text-lg font-black text-amber-300">{item.quantity}</span>
                        </div>
                      ) : (
                        <div className="flex h-[54px] items-center gap-3 rounded-2xl px-3" style={{ border: CARD_B, background: MUTED }}>
                          <button
                            onClick={() => { void changeQty(item.product.id, -1); }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                            style={{ color: TLO, background: SOFT }}
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-8 text-center text-base font-black" style={{ color: THI }}>{item.quantity}</span>
                          <button
                            onClick={() => { void changeQty(item.product.id, 1); }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                            style={{ color: TLO, background: SOFT }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      )}

                      <div className="min-w-[118px] text-center">
                      {item.sellingCatalogId != null ? (() => {
                        const anticipo = item.depositAmount ?? 0;
                        return (
                          <>
                            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: TLO }}>
                              Anticipo
                            </p>
                            <p className="text-[28px] leading-none font-black text-amber-300" title="Anticipo a cobrar ahora">
                              {fmt(anticipo)}
                            </p>
                            <p className="mt-1 text-center text-[13px] font-black" style={{ color: TMD }}>
                              {item.quantity} × {fmt(unitPrice)}
                            </p>
                            <p className="text-[10px] font-black mt-0.5" style={{ color: TLO }}>
                              de {fmt(lineTotal)}
                            </p>
                          </>
                        );
                      })() : (
                        <>
                          <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: TMD }}>
                            Subtotal
                          </p>
                          <p className={`text-[30px] leading-none font-black ${item.isDamaged ? "text-orange-400" : item.isFromPreSale ? "text-amber-400/70" : "text-white"}`}>
                            {fmt(lineTotal)}
                          </p>
                          <p className="mt-1 text-center text-[14px] font-black" style={{ color: TMD }}>
                            {item.quantity} × {fmt(unitPrice)}
                          </p>
                          {!item.isFromPreSale && item.isDamaged && (
                            <p className="text-[10px] font-black uppercase tracking-widest mt-0.5" style={{ color: TLO }}>
                              Precio base {activePriceLabel}
                            </p>
                          )}
                        </>
                      )}

                      {/* Aviso de stock bajo (solo venta regular, ≤5 unidades restantes en la tienda). */}
                      {item.sellingCatalogId == null && !item.isFromPreSale && !item.isDamaged && (() => {
                        const available = availableStockFor(item.product, activeMesa.id);
                        if (available === undefined) return null;
                        const remaining = available - item.quantity;
                        if (remaining < 0 || remaining > 5) return null;
                        const isOut = remaining === 0;
                        return (
                          <p
                            className={`text-[10px] font-black mt-0.5 ${isOut ? "text-[#E0221A]" : "text-amber-400"}`}
                            title={isOut ? "No queda más stock en esta tienda" : "Pocas unidades disponibles"}
                          >
                            {isOut ? "Sin más stock" : `Quedan ${remaining}`}
                          </p>
                        );
                      })()}

                      {item.isDamaged && (() => {
                        const { product: p, priceLevel } = item;
                        let base = p.price_a || 0;
                        if (priceLevel === "b" && p.price_b) base = p.price_b;
                        if (priceLevel === "c" && p.price_c) base = p.price_c;
                        const original = base * item.quantity;
                        const actual   = (item.damagedPrice ?? base) * item.quantity;
                        return original !== actual ? (
                          <p className="text-[9px] line-through" style={{ color: TLO }}>{fmt(original)}</p>
                        ) : null;
                      })()}
                      {item.isFromPreSale && item.preSaleOrderItemId && activeMesa.loadedPreSaleOrderId && (
                        <button
                          onClick={() => {
                            const newStatus = item.preSaleItemDelivered ? 'pending' : 'delivered';
                            void markPreSaleOrderItemDelivered(activeMesa.loadedPreSaleOrderId!, item.preSaleOrderItemId!, newStatus)
                              .then(() => {
                                updMesa(activeMesa.id, m => ({
                                  ...m,
                                  items: m.items.map(i =>
                                    i.preSaleOrderItemId === item.preSaleOrderItemId
                                      ? { ...i, preSaleItemDelivered: newStatus === 'delivered', product: { ...i.product, price_a: newStatus === 'delivered' ? 0 : i.product.price_a } }
                                      : i
                                  ),
                                }));
                              })
                              .catch(() => toast.error("No se pudo actualizar el estado"));
                          }}
                          className={`text-[10px] font-bold mt-1 transition-colors ${item.preSaleItemDelivered ? "text-emerald-500/60 hover:text-white/40" : "text-white/20 hover:text-emerald-500"}`}
                        >
                          {item.preSaleItemDelivered ? "↩ Pendiente" : "✓ Entregado"}
                        </button>
                      )}
                      </div>

                      {!item.preSaleItemDelivered && (
                        <button
                          onClick={() => { void removeFromCart(item.product.id); }}
                          className="inline-flex h-[54px] min-w-[118px] items-center justify-center gap-1.5 self-center rounded-2xl border border-[#E0221A]/25 bg-[#E0221A]/10 px-4 text-[12px] font-black text-[#FF8A80] transition-colors hover:bg-[#E0221A]/16 hover:text-white"
                        >
                          <Trash2 size={13} />
                          Borrar
                        </button>
                      )}
                    </div>
                  </Motion.div>
                    );
                  })()
                ))}
              </div>
            )}
          </div>

        </div>
        {/* ↑ cierra columna IZQUIERDA (cart). El antiguo footer 3-col se movió
            a la columna DERECHA como sidebar vertical sticky (estilo Square POS). */}

        {/* ══════════════════ SIDEBAR DERECHA (PANEL DE COBRO) ══════════════════
            Layout vertical apilado: Total → Cliente → Método → Efectivo → Cambio → Cobrar.
            Ancho fijo en desktop para que el cajero vea siempre el mismo footprint
            sin importar cuántos items entren al carrito. El área scrolleable interna
            asegura que el botón Cobrar y el cambio queden siempre visibles. */}
        <aside
          ref={tcRef}
          className="hidden md:flex shrink-0 w-[420px] xl:w-[460px] flex-col"
          style={{ background: "var(--td-panel-bg)", borderLeft: CARD_B }}
          aria-label="Panel de cobro"
        >
          {/* Contenedor scrolleable: contenido alineado al FONDO (justify-end)
              para que crezca de abajo hacia arriba. Cuando solo hay TOTAL, el
              espacio sobrante queda arriba; cuando se agrega cash input + cambio,
              el contenido empuja hacia arriba quedando siempre pegado al footer.
              Decisión Joel 2026-05-28: "que crezca de abajo para arriba". */}
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto no-scrollbar px-5 py-5 justify-end">

              {/* ── Sección 1: Resumen monetario · Total centrado horizontal ── */}
              <div className="flex flex-col gap-4">

                {/* Subtotal + modifiers — only when they differ from total */}
                {(discountAmt > 0 || (activeMesa.paymentMethod === "Tarjeta" && activeTerminal)) && (
                  <div className="flex flex-col gap-0.5 pb-1" style={{ borderBottom: CARD_B }}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: TLO }}>Subtotal</p>
                      <p className="text-sm font-black" style={{ color: TMD }}>{fmt(subtotal)}</p>
                    </div>
                    {discountAmt > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <button
                          onClick={() => setShowDiscount(!showDiscount)}
                          className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest transition-colors"
                          style={{ color: TLO }}
                        >
                          <Tag size={9} className="text-[#E0221A]" /> % Desc. <ChevronDown size={9} />
                        </button>
                        <p className="text-sm font-black text-emerald-500">-{fmt(discountAmt)}</p>
                      </div>
                    )}
                    {activeMesa.paymentMethod === "Tarjeta" && activeTerminal && isAdmin && (
                      <div className="flex items-center justify-between gap-3">
                        <button
                          onClick={() => setShowTerminalModal(true)}
                          className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest transition-colors"
                          style={{ color: TLO }}
                          title="Comisión interna — la tienda absorbe, no se cobra al cliente"
                        >
                          <Smartphone size={9} className="text-emerald-500" />
                          Comisión {activeTerminal.commission_percent}% <ChevronDown size={9} />
                        </button>
                        <p className="text-[10px] font-bold italic" style={{ color: TLO }}>
                          {fmt(commissionAmt)} interna
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Total — always, prominent. Centrado horizontal (decisión
                    Joel 2026-05-28). En Dólares muestra USD arriba y MXN debajo. */}
                <div className="text-center">
                  <p className="text-xs font-black uppercase tracking-widest" style={{ color: TMD }}>
                    {activeMesa.loadedPreSaleOrderId ? "Total a Cobrar" : activeMesa.isPreventa ? "Total de la Venta" : "Total a Pagar"}
                    {activeMesa.paymentMethod === "Dólares" && (
                      <span className="ml-2 text-emerald-500/80">· en USD</span>
                    )}
                  </p>
                  {activeMesa.paymentMethod === "Dólares" ? (
                    <>
                      <p className="text-[2.5rem] font-black text-emerald-400 leading-none mt-1 tabular-nums">
                        ${totalUSD.toFixed(2)} <span className="text-base font-black text-emerald-500/70 ml-1">USD</span>
                      </p>
                      <p className="text-xs font-black mt-1.5 tabular-nums" style={{ color: TLO }}>
                        {fmt(currentPayAmount)} MXN · TC {tc.toFixed(2)}
                      </p>
                    </>
                  ) : (
                    <p className="text-[2.5rem] font-black leading-none mt-1 tabular-nums" style={{ color: THI }}>{fmt(currentPayAmount)}</p>
                  )}
                </div>

                {/* Bloque cliente movido a su propia columna del footer cuando hay
                    cliente asignado — más legible y deja espacio para el total. */}

                {/* New preventa: anticipo + saldo */}
                {!activeMesa.loadedPreSaleOrderId && activeMesa.isPreventa && activeMesa.items.length > 0 && (
                  <div className="flex flex-col gap-0.5 pt-1" style={{ borderTop: CARD_B }}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/70">
                        Anticipo{activeMesa.items.length > 1 ? ` (${activeMesa.items.length})` : ""}
                      </p>
                      <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 rounded-md px-1.5 py-0.5">
                        <span className="text-amber-400 font-black text-xs">$</span>
                        <span className="text-amber-400 font-black text-sm">{totalDeposit.toLocaleString("es-MX")}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: TLO }}>Saldo</p>
                      <p className={`text-sm font-black ${(totalBeforeComm - totalDeposit) > 0 ? "text-red-400" : "text-green-400"}`}>
                        {fmt(Math.max(0, totalBeforeComm - totalDeposit))}
                      </p>
                    </div>
                  </div>
                )}

                {/* Loaded preventa breakdown */}
                {activeMesa.loadedPreSaleOrderId && (
                  <div className="flex flex-col gap-0.5 pt-1" style={{ borderTop: CARD_B }}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1">
                        <PackageCheck size={9} /> Anticipo
                      </p>
                      <p className="text-sm font-black text-amber-400">{fmt(activeMesa.depositAmount || 0)}</p>
                    </div>
                    {newItemsSubtotal > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: TMD }}>+ Items</p>
                        <p className="text-sm font-black" style={{ color: TMD }}>{fmt(newItemsSubtotal)}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* USD conversion — deshabilitado, solo se usa como flag de método */}
                {/* {activeMesa.paymentMethod === "Dólares" && (
                  <div
                    className="flex items-center justify-between gap-3 cursor-pointer group pt-0.5"
                    onClick={() => { setTcDraft(tc.toString()); setShowTc(true); }}
                  >
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 group-hover:text-white/50 transition-colors flex items-center gap-1">
                      TC: {tc.toFixed(2)} <Settings2 size={8} />
                    </p>
                    <p className="text-lg font-black text-emerald-500 group-hover:text-emerald-400 transition-colors">{fmtUSD(totalUSD)}</p>
                  </div>
                )} */}

              {/* Botón split: cuando hay items que no aceptan el método actual
                  Y hay items que sí lo aceptan, ofrece mover los conflictivos
                  a otra caja libre con el método correcto. */}
              {(() => {
                // Solo cuentan items movibles (no isFromPreSale — esos están
                // atados al folio cargado y no se pueden mover sin romper el link).
                const movable = activeMesa.items.filter(i => !i.isFromPreSale);
                const incompatibleCount = movable.filter(i => !itemAcceptsMethod(i, activeMesa.paymentMethod)).length;
                const compatibleCount   = movable.length - incompatibleCount;
                if (incompatibleCount === 0 || compatibleCount === 0) return null;
                return (
                  <button
                    type="button"
                    onClick={splitToOtherMesa}
                    className="w-full mb-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
                    style={{
                      background: 'rgba(245,158,11,0.10)',
                      border: '1px solid rgba(245,158,11,0.35)',
                      color: '#fbbf24',
                    }}
                    title={`Mover los ${incompatibleCount} artículo(s) que no aceptan ${activeMesa.paymentMethod} a otra caja con su método correcto`}
                  >
                    <ArrowLeftRight size={12} />
                    Mover {incompatibleCount} artículo{incompatibleCount === 1 ? '' : 's'} a otra caja
                  </button>
                );
              })()}

              {/* Payment dropdown movido al final del sidebar — ahora vive en
                  la fila final junto al botón COBRAR (4/8). Decisión Joel
                  2026-05-28: el botón rojo glow grande arriba "hacía ruido"
                  visualmente con el Total / Cliente. */}
              {/* fin Sección 1: Resumen monetario */}
              </div>

              {/* ── Sección 2: Cliente asignado (solo visible cuando hay cliente) ──
                  Separador horizontal sutil para marcar el cambio de sección. */}
              {hasAssignedCustomer && (
                <>
                  <div className="h-px w-full" style={{ background: "var(--td-divider)" }} />
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                        <User size={18} className="text-emerald-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black uppercase tracking-widest text-emerald-500/90">
                          Cliente
                        </p>
                        <p className="text-lg font-black truncate leading-tight" style={{ color: THI }} title={activeMesa.customerName ?? ""}>
                          {activeMesa.customerName}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 mt-1.5 pl-9">
                      {activeMesa.customerPhone && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold truncate" style={{ color: TMD }} title={activeMesa.customerPhone}>
                          <Phone size={10} style={{ color: TLO }} className="flex-shrink-0" />
                          <span className="truncate">{activeMesa.customerPhone}</span>
                        </div>
                      )}
                      {activeMesa.customerEmail && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold truncate" style={{ color: TMD }} title={activeMesa.customerEmail}>
                          <Mail size={10} style={{ color: TLO }} className="flex-shrink-0" />
                          <span className="truncate">{activeMesa.customerEmail}</span>
                        </div>
                      )}
                      {(() => {
                        // Código TAD del socio Tadaima (si existe)
                        const ext = localCustomersUi.find(c => c.id === String(activeMesa.customerId))?.external_member_id;
                        return ext ? (
                          <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-400/80 truncate" title={ext}>
                            <Bookmark size={10} className="text-amber-400/60 flex-shrink-0" />
                            <span className="truncate">{ext}</span>
                          </div>
                        ) : null;
                      })()}
                    </div>

                    {/* Acciones del cliente: Cambiar + Quitar. Bloqueadas en
                        folio cargado (loadedPreSaleOrderId) porque rompería el
                        link con `pre_sale_orders.customer_id` del backend. */}
                    {!activeMesa.loadedPreSaleOrderId && (
                      <div className="flex items-center gap-1.5 mt-2 pl-9">
                        <button
                          type="button"
                          onClick={() => {
                            // Limpia el cliente actual y abre el popup en modo
                            // manual para buscar/asignar otro. Sin esto el
                            // customerSearch quedaba con el nombre viejo y daba
                            // sensación de "no se puede cambiar".
                            clearCustomer();
                            setAssignCustomerPopup({
                              mode: 'manual',
                              candidate: null,
                              search: "",
                              searching: false,
                              searchResults: { locales: [], externos: [] },
                              assigning: false,
                              createForm: { open: false, name: "", phone: "", email: "", saving: false },
                            });
                          }}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors hover:bg-emerald-500/15"
                          style={{ color: "#10b981", border: "1px solid rgba(16,185,129,0.40)", background: "rgba(16,185,129,0.08)" }}
                          title="Cambiar a otro cliente"
                        >
                          <RefreshCw size={13} className="text-emerald-500" />
                          Cambiar
                        </button>
                        <button
                          type="button"
                          onClick={clearCustomer}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors hover:bg-red-500/15"
                          style={{ color: "#ef4444", border: "1px solid rgba(239,68,68,0.40)", background: "rgba(239,68,68,0.08)" }}
                          title="Quitar cliente de esta venta"
                        >
                          <Trash2 size={13} className="text-red-500" />
                          Quitar
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="h-px w-full" style={{ background: "var(--td-divider)" }} />

              {/* ── Sección 3: Cobro (Efectivo/Tarjeta) + botón COBRAR ──
                  Antes era una columna `flex-1 pl-4` lado a lado del total; ahora
                  va apilada debajo del bloque anterior y ocupa todo el ancho del sidebar.
                  La fila interna `flex gap-2` se mantiene por si en el futuro
                  reaparece el folio buscador a la derecha. */}
              <div className={`flex flex-col gap-3 transition-opacity duration-200 ${activeMesa.items.length === 0 ? "opacity-30 pointer-events-none" : ""}`}>

                {/* Row: cash input. (Antes podía haber un folio searcher al lado.) */}
                <div className="flex gap-2">

                  {/* Cash input — solo para Efectivo. "Dólares" como método se eliminó.
                      Ahora vive como input secundario opcional dentro de Efectivo: el
                      cajero puede declarar USD físicos recibidos → suma como MXN al
                      total (vía TC) para calcular el faltante o cambio. */}
                  {activeMesa.paymentMethod === "Efectivo" && (() => {
                    const receivedMxn   = parseFloat(cashReceived)    || 0;
                    const receivedUsd   = parseFloat(cashReceivedUsd) || 0;
                    const usdAsMxn      = receivedUsd * tc;
                    const totalReceived = receivedMxn + usdAsMxn;
                    const cambio        = totalReceived - currentPayAmount;
                    // Modo USD primario: al click "+ Dólares" se esconde pesos.
                    // Pesos reaparece SOLO si USD no alcanza a cubrir el total
                    // (cajero completa con pesos el faltante).
                    // Toggle PURO de moneda: la vista (pesos/dólares) la decide
                    // solo el toggle, no si ya hay USD ingresado. Ambos montos
                    // (cashReceived + cashReceivedUsd) se conservan al alternar,
                    // así el pago mixto sigue: ingresas USD, cambias a pesos y
                    // completas. Un solo grid a la vez (antes se apilaban dos).
                    const usdPrimary    = showUsdInput;
                    const showPesos     = !usdPrimary;
                    // ¿Falta cubrir el total? (para el aviso "completa con…").
                    const faltaCubrir   = Math.max(0, currentPayAmount - totalReceived);

                    // Cambio en dual currency cuando se cobró con USD.
                    const cambioUsd = cambio > 0 && receivedUsd > 0 ? cambio / tc : 0;

                    return (
                      <div className="flex flex-col gap-2 flex-1 min-w-0">

                        {/* ── USD primario (bloque verde, input dominante) ─────── */}
                        {usdPrimary && (
                          <div className="flex flex-col gap-2 rounded-2xl p-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.28)' }}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400">
                                Dólares recibidos · TC {tc.toFixed(2)}
                              </span>
                              {/* Toggle a pesos — siempre visible (conserva el USD ingresado). */}
                              <button
                                type="button"
                                onClick={() => setShowUsdInput(false)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors"
                                style={{ background: 'var(--td-card-bg)', border: '1px solid var(--td-card-border)', color: 'var(--td-text-hi)' }}
                                title="Cambiar a pesos"
                              >⇄ A pesos</button>
                            </div>
                            {/* Mixto: ya hay pesos ingresados en la otra vista. */}
                            {(parseFloat(cashReceived) || 0) > 0 && (
                              <p className="text-[10px] font-bold" style={{ color: TLO }}>+ {fmt(parseFloat(cashReceived) || 0)} en pesos ya ingresados</p>
                            )}
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-xl text-emerald-500/80 pointer-events-none">US$</span>
                              <input
                                autoFocus
                                type="number" min="0" step="0.01"
                                value={cashReceivedUsd}
                                onChange={e => setCashReceivedUsd(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter" && totalReceived >= currentPayAmount) void handleCheckout();
                                }}
                                placeholder="0.00"
                                className="w-full text-center rounded-xl py-3 pl-14 pr-4 text-4xl font-black placeholder-emerald-500/15 focus:outline-none transition-all tabular-nums"
                                style={{ background: "var(--td-input-bg)", border: "2px solid rgba(16,185,129,0.40)", color: "var(--td-input-text)" }}
                              />
                              {receivedUsd > 0 && (
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-base font-black text-emerald-400 pointer-events-none tabular-nums">
                                  ≈ {fmt(usdAsMxn)}
                                </span>
                              )}
                            </div>
                            {/* Presets USD cuadrados — todas las denominaciones
                                de billetes US (1, 5, 10, 20, 50, 100). 3×2 grid
                                con aspect-square para que los números respiren
                                y el cajero no se equivoque al tap (Joel 2026-05-28). */}
                            <div className="grid grid-cols-3 gap-2">
                              {[1, 5, 10, 20, 50, 100].map(amt => (
                                <button
                                  key={amt}
                                  onClick={() => setCashReceivedUsd(prev => ((parseFloat(prev) || 0) + amt).toString())}
                                  className="aspect-square rounded-2xl font-black text-2xl transition-colors tabular-nums flex flex-col items-center justify-center gap-0.5"
                                  style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.28)', color: '#34d399' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.24)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.12)'; }}
                                >
                                  <span className="text-[10px] font-bold text-emerald-500/60 uppercase tracking-wider leading-none">US$</span>
                                  <span className="leading-none">{amt}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ── PESOS (vista por toggle) ─────────────────────────── */}
                        {showPesos && (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: TLO }}>Pesos recibidos</span>
                              {/* Toggle a dólares — siempre visible (conserva los pesos ingresados). */}
                              <button
                                type="button"
                                onClick={() => setShowUsdInput(true)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors"
                                style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)', color: '#34d399' }}
                                title={`Cambiar a dólares (TC ${tc.toFixed(2)})`}
                              >⇄ A dólares</button>
                            </div>
                            {/* Mixto: ya hay USD ingresados en la otra vista + cuánto falta. */}
                            {receivedUsd > 0 && (
                              <div className="rounded-xl px-4 py-2 flex items-center justify-between" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' }}>
                                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                                  US${receivedUsd.toFixed(2)} ≈ {fmt(usdAsMxn)} · faltan
                                </span>
                                <span className="text-lg font-black text-amber-400 tabular-nums">{fmt(faltaCubrir)}</span>
                              </div>
                            )}
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-2xl pointer-events-none" style={{ color: "var(--td-placeholder)" }}>$</span>
                              <input
                                ref={cashInputRef}
                                autoFocus={receivedUsd > 0}
                                type="number" min="0" step="0.01"
                                value={cashReceived}
                                onChange={e => setCashReceived(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter") {
                                    if (totalReceived >= currentPayAmount || (cashReceived === "" && cashReceivedUsd === "")) void handleCheckout();
                                  }
                                }}
                                placeholder="0.00"
                                className="w-full text-center rounded-xl py-3 pl-10 pr-4 text-4xl font-black focus:outline-none transition-all tabular-nums"
                                style={{ background: "var(--td-input-bg)", border: "2px solid var(--td-input-border)", color: "var(--td-input-text)" }}
                                onFocus={e => { e.currentTarget.style.borderColor = "rgba(224,34,26,0.55)"; }}
                                onBlur={e  => { e.currentTarget.style.borderColor = "var(--td-input-border)"; }}
                              />
                            </div>
                            {/* Presets pesos cuadrados — billetes MX (20, 50,
                                100, 200, 500, 1000) + monedas grandes opcional.
                                3×2 grid con aspect-square. Joel 2026-05-28:
                                "cuadrado los numeros en espacio para que no se equivoque". */}
                            <div className="grid grid-cols-3 gap-2">
                              {[20, 50, 100, 200, 500, 1000].map(amt => (
                                <button
                                  key={amt}
                                  onClick={() => setCashReceived(prev => ((parseFloat(prev) || 0) + amt).toString())}
                                  className="aspect-square rounded-2xl font-black text-2xl transition-all tabular-nums flex flex-col items-center justify-center gap-0.5"
                                  style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", color: "var(--td-text-hi)" }}
                                  onMouseEnter={e => { e.currentTarget.style.background = "var(--td-hover-bg)"; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = "var(--td-card-bg)"; }}
                                >
                                  <span className="text-[10px] font-bold opacity-50 uppercase tracking-wider leading-none">MXN</span>
                                  <span className="leading-none">${amt}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* (El toggle dólar⇄pesos vive en el header de cada vista,
                            mismo lugar y mismo grid — ya no hay botón "+ Dólares"
                            aparte ni grids apilados.) */}

                        {/* ── CAMBIO / FALTA — dual currency cuando hubo USD ──── */}
                        {totalReceived > 0 && (
                          <div className={`rounded-xl px-4 py-3 flex items-center justify-between border-2 ${cambio >= 0 ? "bg-emerald-500/12 border-emerald-500/35" : "bg-red-500/12 border-red-500/35"}`}>
                            <span className={`text-xs font-black uppercase tracking-widest ${cambio >= 0 ? "text-emerald-400/90" : "text-red-400/90"}`}>
                              {cambio >= 0 ? "Cambio" : "Falta"}
                            </span>
                            <div className="text-right">
                              <p className={`text-3xl font-black leading-none tabular-nums ${cambio >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {fmt(Math.abs(cambio))}
                              </p>
                              {/* Cambio dual: si cobró con USD, ofrece el equivalente
                                  en dólares (útil si decide regresarle parte en USD). */}
                              {cambio > 0 && cambioUsd > 0 && (
                                <p className="text-[11px] font-bold text-emerald-400/70 mt-1 tabular-nums">
                                  ≈ US${cambioUsd.toFixed(2)}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Buscar preventa: comentado. El folio se carga via scanner (códigos
                      PREV-N) o desde el modal Preventas → tab Apartadas. Mantenemos el
                      state folioInput por si se reactiva más adelante. */}
                  {/* <div className="flex flex-col gap-1 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Buscar preventa</p>
                    <input type="text" value={folioInput} onChange={e => setFolioInput(e.target.value)} ... />
                    <button onClick={() => { void searchByFolio(folioInput); }}>Buscar</button>
                  </div> */}
                </div>

              </div>
              {/* ↑ cierra Sección 3 interna (solo cash input + presets).
                  La fila Efectivo + Cobrar baja al FOOTER STICKY del sidebar
                  (sibling del scroll wrapper) para no scrollear con el resto. */}
            </div>
            {/* ↑ cierra el SCROLL WRAPPER del sidebar */}

            {/* ── FOOTER STICKY: Método (4/12) + Cobrar (8/12) ────────────────
                Pinned al fondo del sidebar. `shrink-0` para no comprimirse
                cuando el scroll wrapper de arriba ocupa todo el flex-1.
                Joel 2026-05-28: "baja esa parte al footer" — Efectivo + Cobrar
                siempre visibles, no requieren scroll del cajero. */}
            <div
              className={`shrink-0 px-5 py-4 transition-opacity duration-200 ${activeMesa.items.length === 0 ? "opacity-30 pointer-events-none" : ""}`}
              style={{ borderTop: "1px solid var(--td-panel-border)", background: "var(--td-panel-bg)" }}
            >
              <div className="grid grid-cols-12 gap-2">

                  {/* Método de pago — col-span-4. Dropdown sutil (border-only,
                      sin glow) para que Cobrar siga siendo el CTA dominante. */}
                  <div className="col-span-4 relative" ref={paymentMenuRef}>
                    {(() => {
                      const active = activeMesa.paymentMethod;
                      const allOptions: PaymentMethod[] = ["Efectivo", "Tarjeta", "Transferencia"];
                      // Icono por método (Joel 2026-06-12): se distingue de un
                      // vistazo si el cobro es con tarjeta o efectivo.
                      const methodIcon = (pm: PaymentMethod, cls: string) => {
                        if (pm === "Tarjeta") return <CreditCard size={13} className={cls} />;
                        if (pm === "Transferencia") return <ArrowLeftRight size={13} className={cls} />;
                        if (pm === "Dólares") return <DollarSign size={13} className={cls} />;
                        return <Banknote size={13} className={cls} />;
                      };
                      const renderLabel = (pm: PaymentMethod, isActive: boolean) => (
                        <div className="flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-widest leading-none shrink-0">
                          {methodIcon(pm, isActive ? 'text-white' : 'text-[#E0221A]')}
                          {pm}
                        </div>
                      );
                      return (
                        <>
                          <div className="flex w-full h-[52px] rounded-2xl overflow-hidden" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", color: "var(--td-text-hi)" }}>
                            <button
                              onClick={() => setPaymentMenuOpen(o => !o)}
                              className="flex-1 min-w-0 flex items-center justify-center gap-1.5 transition-colors"
                              onMouseEnter={e => { e.currentTarget.style.background = "var(--td-hover-bg)"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                            >
                              {renderLabel(active, false)}
                              {/* Menú abre HACIA ARRIBA porque vive al fondo del sidebar.
                                  Chevron: cerrado = ↑ (apunta hacia arriba indicando
                                  "abre arriba"), abierto = ↓ (apunta abajo indicando
                                  "colapsar abajo"). */}
                              <ChevronUp size={11} className={`opacity-50 transition-transform ${paymentMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {active === "Efectivo" && isAdmin && (
                              <button
                                onClick={() => { setTcDraft(tc.toString()); setShowTc(!showTc); }}
                                className="w-9 border-l flex items-center justify-center transition-colors"
                                style={{ borderColor: "var(--td-card-border)", color: "var(--td-text-md)" }}
                                onMouseEnter={e => { e.currentTarget.style.background = "var(--td-hover-bg)"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                                title={`Editar tipo de cambio (actual ${tc.toFixed(2)})`}
                              >
                                <SlidersHorizontal size={13} />
                              </button>
                            )}
                            {active === "Tarjeta" && (
                              // Decisión Joel 2026-06-12: el nombre de la terminal NO
                              // cabe sin apretar todo → el botón dice solo "Tarjeta" y
                              // la terminal queda como icono compacto: lectora + ✓ verde
                              // si hay asignada (nombre en tooltip), ⚠ ámbar si falta.
                              <button
                                onClick={(e) => { e.stopPropagation(); setPaymentMenuOpen(false); setShowTerminalModal(true); }}
                                className={`px-2.5 border-l flex items-center gap-1 transition-colors shrink-0 ${activeTerminal ? "" : "animate-pulse"}`}
                                style={{ borderColor: "var(--td-card-border)", color: activeTerminal ? "var(--td-text-md)" : "#FFAA00" }}
                                onMouseEnter={e => { e.currentTarget.style.background = "var(--td-hover-bg)"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                                title={activeTerminal ? `Terminal: ${activeTerminal.name} — clic para cambiar` : "Elegir terminal para cobrar con tarjeta"}
                              >
                                <Smartphone size={12} />
                                {activeTerminal ? (
                                  <Check size={10} className="text-emerald-500" strokeWidth={4} />
                                ) : (
                                  <AlertTriangle size={10} />
                                )}
                                <ChevronDown size={9} className="opacity-60 shrink-0" />
                              </button>
                            )}
                          </div>

                          {/* Menú UP (sale hacia arriba porque la fila está al fondo) */}
                          <AnimatePresence>
                            {paymentMenuOpen && (
                              <Motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 8 }}
                                transition={{ duration: 0.12 }}
                                className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-2xl overflow-hidden"
                                style={{ background: "var(--td-popup-bg)", backdropFilter: "blur(20px)", border: "1px solid var(--td-popup-border)" }}
                              >
                                {allOptions.filter(pm => pm !== active).map(pm => {
                                  // Bloquea la opción si ALGÚN item del carrito no acepta ese
                                  // método (preventa/cash_only → no Tarjeta; allow_cash=false →
                                  // no Efectivo). Mismo criterio que payBlocked y el guard del
                                  // backend. Antes referenciaba `hasCashOnly`, variable que
                                  // nunca existió → ReferenceError al abrir el menú (QA 06-12).
                                  const isBlocked = activeMesa.items.some(i => !itemAcceptsMethod(i, pm));
                                  return (
                                    <button
                                      key={pm}
                                      onClick={() => { if (!isBlocked) { setPayment(pm); setPaymentMenuOpen(false); } }}
                                      disabled={isBlocked}
                                      className={`w-full h-[44px] px-3 flex items-center justify-center border-b last:border-b-0 transition-all ${
                                        isBlocked ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                                      }`}
                                      style={{
                                        borderBottomColor: "var(--td-divider)",
                                        color: isBlocked ? "var(--td-text-ghost)" : "var(--td-text-md)",
                                        background: "transparent",
                                      }}
                                      onMouseEnter={e => {
                                        if (!isBlocked) {
                                          e.currentTarget.style.background = "var(--td-red-dim)";
                                          e.currentTarget.style.color = "var(--td-text-hi)";
                                        }
                                      }}
                                      onMouseLeave={e => {
                                        e.currentTarget.style.background = "transparent";
                                        e.currentTarget.style.color = isBlocked ? "var(--td-text-ghost)" : "var(--td-text-md)";
                                      }}
                                    >
                                      {isBlocked && <AlertTriangle size={11} className="text-amber-500 mr-1.5" />}
                                      {renderLabel(pm, false)}
                                    </button>
                                  );
                                })}
                              </Motion.div>
                            )}
                          </AnimatePresence>
                        </>
                      );
                    })()}

                    {/* Popover Tipo de Cambio (sale ARRIBA del botón método) */}
                    <AnimatePresence>
                      {showTc && (
                        <Motion.div
                          initial={{ opacity: 0, y: 20, scale: 0.8 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 20, scale: 0.8 }}
                          className="absolute bottom-full left-0 mb-3 z-[120] rounded-[40px] p-8 w-[320px] overflow-hidden"
                          style={{
                            background: "var(--td-popup-bg)",
                            backdropFilter: "blur(40px) saturate(180%)",
                            WebkitBackdropFilter: "blur(40px) saturate(180%)",
                            border: "1px solid var(--td-panel-border)",
                            boxShadow: "0 40px 100px rgba(0,0,0,0.8), inset 0 0 0 1px var(--td-panel-border)",
                          }}
                        >
                          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
                          <div className="relative z-10 space-y-6">
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: TLO }}>Exchange Rate</p>
                                <h4 className="text-xs font-black text-emerald-500 uppercase tracking-widest">USD / MXN</h4>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex-1 relative group">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={tcDraft}
                                  onChange={e => setTcDraft(e.target.value)}
                                  className="w-full rounded-[24px] px-6 py-5 text-4xl font-black outline-none focus:bg-emerald-500/5 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-inner"
                                  placeholder="0.00"
                                  autoFocus
                                  style={{ background: STRONG, border: "2px solid rgba(16,185,129,0.18)", color: THI }}
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                  <button onClick={() => setTcDraft(p => (parseFloat(p || "0") + 0.1).toFixed(2))} className="p-1 hover:text-emerald-500"><ChevronUp size={16} /></button>
                                  <button onClick={() => setTcDraft(p => Math.max(0, parseFloat(p || "0") - 0.1).toFixed(2))} className="p-1 hover:text-emerald-500"><ChevronDown size={16} /></button>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  const val = parseFloat(tcDraft);
                                  if (!isNaN(val) && val > 0) {
                                    setTc(val);
                                    setShowTc(false);
                                    toast.success(`TC: ${val.toFixed(2)}`, {
                                      style: { background: '#064e3b', color: '#fff', border: '1px solid #10b981', borderRadius: '16px' }
                                    });
                                  }
                                }}
                                className="w-20 h-20 shrink-0 bg-emerald-600 text-white rounded-[28px] flex items-center justify-center hover:bg-emerald-500 hover:scale-105 active:scale-95 transition-all shadow-[0_20px_40px_rgba(16,185,129,0.2)] group relative overflow-hidden"
                              >
                                <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent" />
                                <Check size={36} strokeWidth={4} className="relative z-10 group-hover:scale-110 transition-transform" />
                              </button>
                            </div>
                            <div className="pt-2 flex justify-center">
                              <span className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: "var(--td-text-ghost)" }}>Liquid Transaction</span>
                            </div>
                          </div>
                          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-emerald-500/5 rounded-full blur-[60px]" />
                          <div className="absolute -top-10 -left-10 w-40 h-40 bg-emerald-500/5 rounded-full blur-[60px]" />
                        </Motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Cobrar — col-span-8 (CTA dominante) */}
                  <div className="col-span-8">
                    {(() => {
                      const receivedMxn   = parseFloat(cashReceived)    || 0;
                      const receivedUsd   = parseFloat(cashReceivedUsd) || 0;
                      const totalReceived = receivedMxn + receivedUsd * tc;
                      const hasAnyCash    = receivedMxn > 0 || receivedUsd > 0;
                      const isInsufficient = activeMesa.paymentMethod === "Efectivo"
                        && hasAnyCash && totalReceived < currentPayAmount;
                      const label = isProcessing ? "Procesando..."
                        : isInsufficient ? "Falta efectivo"
                        : activeMesa.loadedPreSaleOrderId
                          ? (newItemsSubtotal > 0 ? "Cobrar" : "Liquidar")
                          : activeMesa.isPreventa
                            ? (totalDeposit >= totalBeforeComm ? "Liquidar" : "Apartar")
                            : "Cobrar";
                      return (
                        <button
                          disabled={checkoutDisabled || isInsufficient}
                          onClick={() => { void handleCheckout(); }}
                          className="w-full h-[52px] group relative flex items-center justify-center gap-2 rounded-2xl overflow-hidden transition-all disabled:opacity-30 disabled:grayscale"
                        >
                          <div className="absolute inset-0 bg-[#E0221A] group-hover:bg-[#f0221a] transition-colors" />
                          <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent" />
                          <Zap size={16} className="relative z-10 text-white animate-pulse" />
                          <span className="relative z-10 text-sm font-black uppercase tracking-widest text-white">{label}</span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
              {/* ↑ cierra wrapper del FOOTER STICKY (Método + Cobrar) */}
        </aside>
      </div>
      {/* ↑ cierra contenedor horizontal de 2 columnas (cart + sidebar) */}

      {/* Modal Terminales de Pago */}
      <AnimatePresence>
        {showTerminalModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <Motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowTerminalModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            <Motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative rounded-[32px] p-8 w-full max-w-md shadow-2xl overflow-hidden"
              style={{
                background: "var(--td-popup-bg)",
                backdropFilter: "blur(20px)",
                border: "1px solid var(--td-popup-border)",
                boxShadow: "0 0 100px rgba(0,0,0,0.8), inset 0 0 40px rgba(16,185,129,0.05)"
              }}
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
              
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-[0.2em]" style={{ color: THI }}>Terminales</h3>
                  <p className="text-[10px] font-black text-emerald-500/50 uppercase tracking-widest mt-1">Seleccione lectora de pago</p>
                </div>
                <button 
                  onClick={() => setShowTerminalModal(false)}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                  style={{ background: SOFT, color: TLO }}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto no-scrollbar pr-2">
                {terminals.length === 0 ? (
                  <div className="py-12 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: SOFT }}>
                      <Zap size={24} style={{ color: "var(--td-text-ghost)" }} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-ghost)" }}>No hay terminales configuradas</p>
                  </div>
                ) : (
                  terminals.map(t => (
                    <button
                      key={t.id}
                      onClick={() => selectTerminal(t.id)}
                      className={`w-full group relative flex items-center justify-between p-5 rounded-2xl border transition-all ${
                        activeMesa.selectedTerminalId === t.id ? 'bg-emerald-500/10 border-emerald-500/50 text-white' : ''
                      }`}
                      style={activeMesa.selectedTerminalId === t.id ? undefined : { background: SOFT, border: CARD_B, color: TMD }}
                    >
                      <div className="text-left">
                        <h4 className="font-black text-sm uppercase tracking-widest group-hover:translate-x-1 transition-transform" style={{ color: activeMesa.selectedTerminalId === t.id ? "#fff" : THI }}>{t.name}</h4>
                        <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest mt-1">{t.description || "Sin descripción"}</p>
                      </div>
                      <div className="text-right">
                        {isAdmin ? (
                          <>
                            <span className={`text-lg font-black transition-colors ${activeMesa.selectedTerminalId === t.id ? 'text-emerald-500' : ''}`} style={activeMesa.selectedTerminalId === t.id ? undefined : { color: "rgba(16,185,129,0.5)" }}>
                              {t.commission_percent}%
                            </span>
                            <p className="text-[8px] font-bold uppercase tracking-[0.2em] mt-0.5" style={{ color: "var(--td-text-ghost)" }}>Comisión</p>
                          </>
                        ) : (
                          activeMesa.selectedTerminalId === t.id && (
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Seleccionada</span>
                          )
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Re-busca terminales sin cerrar el modal (Joel 2026-06-12):
                  el admin da de alta una terminal en otra ventana/máquina y
                  el cajero la trae sin recargar la página. */}
              <button
                onClick={() => { void terminalsQuery.refetch(); }}
                disabled={terminalsQuery.isFetching}
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-emerald-500/30 bg-transparent text-emerald-400/80 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/10 hover:border-emerald-500/50 hover:text-emerald-400 transition-all disabled:opacity-50 disabled:cursor-default"
              >
                <RefreshCw size={12} className={terminalsQuery.isFetching ? "animate-spin" : ""} />
                {terminalsQuery.isFetching ? "Buscando…" : "Buscar terminales"}
              </button>

              {isAdmin && (
                <div className="mt-8 pt-6" style={{ borderTop: "1px solid var(--td-divider)" }}>
                  <div className="p-4 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/70">Política de comisión</p>
                    <p className="text-[9px] font-bold mt-1 leading-relaxed" style={{ color: TLO }}>
                      La tienda absorbe la comisión de tarjeta. El cliente solo paga el subtotal de la venta. La comisión se registra internamente para reportes.
                    </p>
                  </div>
                </div>
              )}
            </Motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Descuento */}
      <AnimatePresence>
        {showDiscount && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <Motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowDiscount(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            <Motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative rounded-[32px] p-8 w-full max-w-sm shadow-2xl overflow-hidden"
              style={{
                background: "var(--td-popup-bg)",
                backdropFilter: "blur(20px)",
                border: "1px solid var(--td-popup-border)",
                boxShadow: "0 0 100px rgba(0,0,0,0.8), inset 0 0 40px rgba(16,185,129,0.05)"
              }}
            >
              <h3 className="text-xl font-black uppercase tracking-[0.2em] mb-8 text-center" style={{ color: THI }}>Descuento</h3>
              <div className="grid grid-cols-2 gap-4">
                {[5, 10, 25, 50].map(pct => (
                  <button 
                    key={pct}
                    onClick={() => { toggleDiscount(pct); setShowDiscount(false); }}
                    className={`py-4 rounded-2xl border transition-all font-black ${
                      activeMesa.discount === pct 
                        ? 'bg-[#E0221A] text-white border-transparent' 
                        : ''
                      }`}
                    style={activeMesa.discount === pct ? undefined : { background: SOFT, border: CARD_B, color: TMD }}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <button
                onClick={() => { toggleDiscount(0); setShowDiscount(false); }}
                className="w-full mt-4 py-3 text-[10px] font-black uppercase tracking-widest transition-colors"
                style={{ color: TLO }}
              >
                Quitar Descuento
              </button>
            </Motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Full-screen: Modal Preventas (4 tabs) ───────────────────────────── */}
      <AnimatePresence>
        {showPreSalesModal && (() => {
          const TABS = [
            { key: 'difusion'    as const, label: 'Difusión',    count: 0,                             emptyMsg: '',                             accentColor: '#F59E0B', accentAlpha: 'rgba(245,158,11,' },
            { key: 'venta'       as const, label: 'Disponibles', count: preSaleCatalogs.length,        emptyMsg: 'No hay catálogos publicados',  accentColor: '#F59E0B', accentAlpha: 'rgba(245,158,11,' },
            { key: 'liquidar'    as const, label: 'Apartadas',   count: preSaleOrdersPending.length,   emptyMsg: 'No hay preventas apartadas',   accentColor: '#8B5CF6', accentAlpha: 'rgba(139,92,246,' },
            { key: 'completadas' as const, label: 'Liquidadas',  count: preSaleOrdersDelivered.length, emptyMsg: 'Sin preventas liquidadas',     accentColor: '#22C55E', accentAlpha: 'rgba(34,197,94,'  },
            { key: 'vencidas'    as const, label: 'Vencidas',    count: preSaleOrdersExpired.length,   emptyMsg: 'Sin preventas vencidas',       accentColor: '#EF4444', accentAlpha: 'rgba(239,68,68,'  },
          ];
          const activeTab = TABS.find(t => t.key === preSalesTab)!;
          const q = pickerSearch.toLowerCase();

          // ── Catalog card (tab "Disponibles") ──────────────────────────────
          const CatalogCard = ({ catalog }: { catalog: PreSaleCatalog }) => {
            const ac = activeTab.accentAlpha;
            const prices = [
              { price: catalog.price_1, level: "a" as PriceLevel },
              { price: catalog.price_2, level: "b" as PriceLevel },
              { price: catalog.price_3, level: "c" as PriceLevel },
              { price: catalog.price_4, level: "d" as PriceLevel },
              { price: catalog.price_5, level: "e" as PriceLevel },
            ].filter((x): x is { price: number; level: PriceLevel } => x.price != null && x.price > 0);

            const imgSrc = catalog.image_url ?? (catalog.image_path ? storageUrl(catalog.image_path) : null);

            // Disponibilidad por tienda — fuente única de verdad: store_limits.
            // Cambio Joel 2026-05-20: si la tienda activa no tiene entrada en
            // store_limits, NO se vende en esa tienda (antes había fallback al
            // preorder_limit global, lo que abría el catálogo en todas las tiendas
            // sin querer).
            const storeLimitRow = catalog.store_limits?.find(sl => sl.store_id === activeStore?.id);
            const limit = storeLimitRow?.limit_qty ?? 0;
            const reserved = activeStore?.id != null
              ? (catalog.reserved_by_store?.[String(activeStore.id)] ?? 0)
              : 0;
            const remaining = Math.max(0, limit - reserved);
            // Sin entrada en store_limits = el gerente/admin aún no habilita esta
            // tienda → "Sin asignar" (no es lo mismo que agotado: nunca tuvo cupo).
            const isSinAsignar = storeLimitRow === undefined;
            const isAgotado = !isSinAsignar && remaining <= 0;
            const isBlocked = isSinAsignar || isAgotado;
            const availabilityChip =
              remaining <= 0
                ? { color: "#FFFFFF", background: "#DC2626", border: "1px solid rgba(220,38,38,0.5)" }
                : remaining <= 5
                  ? { color: "#F59E0B", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.24)" }
                  : { color: "#10B981", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.28)" };

            return (
              <button
                onClick={() => { if (!isBlocked) addCatalogToCart(catalog); }}
                // Sin asignar NO usa disabled: el badge "Avisar" interno necesita
                // recibir clicks (un <button disabled> bloquea los hijos). El
                // onClick del card ya está guardado con isBlocked.
                disabled={isAgotado}
                title={isSinAsignar ? "Esta tienda no tiene cupo asignado para esta preventa. Presiona Avisar para pedir a tu gerente que la habilite." : undefined}
                style={{
                  textAlign: "left", borderRadius: 14,
                  background: isAgotado ? "rgba(224,34,26,0.03)" : "var(--td-card-bg)",
                  border: `1px solid ${isAgotado ? "rgba(224,34,26,0.25)" : "var(--td-card-border)"}`,
                  cursor: isBlocked ? "not-allowed" : "pointer",
                  padding: "14px",
                  display: "flex", flexDirection: "column", gap: 8,
                  transition: "border-color 0.15s, transform 0.1s",
                  opacity: isBlocked ? 0.55 : 1,
                }}
                onMouseEnter={e => { if (!isBlocked) { (e.currentTarget as HTMLButtonElement).style.borderColor = `${ac}0.4)`; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; } }}
                onMouseLeave={e => { if (!isBlocked) { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--td-card-border)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; } }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                  {isSinAsignar ? (() => {
                    const alertSt = presaleAlertState[catalog.id];
                    return (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 900, padding: "3px 8px", borderRadius: 20, color: "var(--td-text-ghost)", background: "rgba(148,163,184,0.12)", border: "1px solid rgba(148,163,184,0.25)" }}>
                          Sin asignar
                        </span>
                        <span
                          role="button"
                          onClick={e => { e.stopPropagation(); void handlePresaleAssignAlert(catalog); }}
                          title="Avisar al gerente y admin para que asignen cupo de esta preventa a tu tienda"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            fontSize: 10, fontWeight: 900, padding: "3px 8px", borderRadius: 20,
                            cursor: alertSt ? "default" : "pointer",
                            color: alertSt === 'sent' ? "#10b981" : "#F59E0B",
                            background: alertSt === 'sent' ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.12)",
                            border: `1px solid ${alertSt === 'sent' ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`,
                            opacity: alertSt === 'sending' ? 0.6 : 1,
                          }}
                        >
                          {alertSt === 'sending'
                            ? <Loader2 size={10} className="animate-spin" />
                            : alertSt === 'sent'
                              ? <CheckCircle2 size={10} />
                              : <Bell size={10} />}
                          {alertSt === 'sent' ? "Avisado" : "Avisar"}
                        </span>
                      </span>
                    );
                  })() : isAgotado ? (
                    <span style={{ fontSize: 10, fontWeight: 900, padding: "3px 8px", borderRadius: 20, color: "#fff", background: "#DC2626", border: "1px solid rgba(220,38,38,0.5)" }}>
                      Agotado
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 900, padding: "3px 8px", borderRadius: 20, color: availabilityChip.color, background: availabilityChip.background, border: availabilityChip.border }}>
                      {remaining !== null ? `${remaining} disponible${remaining === 1 ? "" : "s"}` : "Disponible"}
                    </span>
                  )}
                </div>
                {/* Thumbnail solo si hay imagen — cacheada por GCS (1 año immutable) +
                    Service Worker (Cache API). Sin imagen no se reserva espacio. */}
                {imgSrc && (
                  <img
                    src={imgSrc}
                    alt={catalog.product_name}
                    loading="lazy"
                    decoding="async"
                    style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 10, border: "1px solid var(--td-card-border)", background: STRONG }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <p style={{ margin: 0, fontSize: 14, fontWeight: 800, lineHeight: 1.3, color: "var(--td-text-hi)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {catalog.product_name}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "4px 0 0",
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--td-text-ghost)" }}>
                    Anticipo mín.
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, color: catalog.advance_payment > 0 ? "#F97316" : "var(--td-text-lo)" }}>
                    {catalog.advance_payment > 0 ? fmt(catalog.advance_payment) : "Sin anticipo"}
                  </span>
                </div>
                {catalog.preorder_limit != null && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "2px 0 0",
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--td-text-ghost)" }}>
                      Reservados
                    </span>
                    <span style={{ fontSize: 17, fontWeight: 900, color: "var(--td-text-hi)" }}>
                      {catalog.reserved_count ?? 0} / {catalog.preorder_limit}
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {prices.map(x => {
                    // Color de identidad por nivel (Normal=verde, Socio=ámbar,
                    // Mayorista=azul) + botón grande full-width — Joel 2026-06-11.
                    const rgb = PRICE_LEVEL_RGB[x.level];
                    return (
                      <button
                        key={x.level}
                        onClick={e => { e.stopPropagation(); if (!isBlocked) addCatalogToCart(catalog, x.level); }}
                        disabled={isBlocked}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                          width: "100%", padding: "7px 12px", borderRadius: 10,
                          cursor: isBlocked ? "not-allowed" : "pointer",
                          background: `rgba(${rgb},0.1)`, border: `1px solid rgba(${rgb},0.32)`,
                          transition: "background 0.12s", opacity: isBlocked ? 0.4 : 1,
                        }}
                        onMouseEnter={e => { if (!isBlocked) (e.currentTarget as HTMLElement).style.background = `rgba(${rgb},0.22)`; }}
                        onMouseLeave={e => { if (!isBlocked) (e.currentTarget as HTMLElement).style.background = `rgba(${rgb},0.1)`; }}
                      >
                        <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: `rgba(${rgb},0.9)` }}>
                          {PRICE_LEVEL_LABELS[x.level]}
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 900, color: PRICE_LEVEL_COLORS[x.level] }}>
                          {fmt(x.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </button>
            );
          };

          // ── Order card (tabs "Apartadas", "Liquidadas", "Vencidas") ───────
          const OrderCard = ({ order }: { order: PreSaleOrder }) => {
            const isVencida = preSalesTab === 'vencidas';
            const isDelivered = preSalesTab === 'completadas';
            const isAwaitingArrival = preSalesTab === 'liquidar' && order.status === 'pending';
            const isClickable = preSalesTab === 'liquidar' && !isAwaitingArrival;
            const balance = order.balance ?? order.total ?? 0;
            const ac = (isAwaitingArrival || isVencida) ? 'rgba(120,120,120,' : activeTab.accentAlpha;
            const itemColor = (isAwaitingArrival || isVencida) ? '#888' : activeTab.accentColor;
            const pendingItems = (order.items ?? []).filter(it => it.status !== 'delivered');
            const allItems = isDelivered ? (order.items ?? []) : [];

            return (
              <button
                disabled={!isClickable}
                onClick={() => {
                  if (!isClickable) return;
                  getPreSaleOrder(order.id)
                    .then(detail => loadPreSaleOrderIntoCart(detail))
                    .catch(() => toast.error("Error al cargar la preventa"));
                }}
                style={{ textAlign: "left", borderRadius: 14, background: isAwaitingArrival ? "var(--td-panel-bg)" : "var(--td-card-bg)", border: `1px solid ${isAwaitingArrival ? "var(--td-panel-border)" : "var(--td-card-border)"}`, cursor: isClickable ? "pointer" : "default", padding: "14px", display: "flex", flexDirection: "column", gap: 8, transition: "border-color 0.15s, transform 0.1s", opacity: isAwaitingArrival ? 0.6 : 1 }}
                onMouseEnter={e => { if (isClickable) { (e.currentTarget as HTMLButtonElement).style.borderColor = `${ac}0.4)`; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; } }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = isAwaitingArrival ? "var(--td-panel-border)" : "var(--td-card-border)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: itemColor }}>{order.code}</span>
                  {isVencida ? (
                    <span style={{ fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 20, color: "#EF4444", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", whiteSpace: "nowrap" }}>Vencida</span>
                  ) : isAwaitingArrival ? (
                    <span style={{ fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 20, color: "#888", background: "rgba(128,128,128,0.1)", border: "1px solid rgba(128,128,128,0.2)", whiteSpace: "nowrap" }}>Pendiente de arribo</span>
                  ) : isDelivered ? (
                    <span style={{ fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 20, color: "#22C55E", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>Liquidada</span>
                  ) : (
                    <span style={{ fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 20, color: itemColor, background: `${ac}0.12)`, border: `1px solid ${ac}0.2)` }}>Listo · Liquidar</span>
                  )}
                </div>
                {(order.items ?? []).length > 0 && (
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 800, lineHeight: 1.3, color: isAwaitingArrival || isVencida ? "var(--td-text-lo)" : "var(--td-text-hi)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {order.items![0]?.catalog?.product_name ?? "Preventa"}
                    {(order.items ?? []).length > 1 && ` (+${(order.items ?? []).length - 1} más)`}
                  </p>
                )}
                {order.customer && (
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "var(--td-text-lo)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{order.customer.name}</p>
                )}
                {pendingItems.length > 0 && !isDelivered && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "6px 8px", borderRadius: 8, background: `${ac}0.06)`, border: `1px solid ${ac}0.15)` }}>
                    {pendingItems.slice(0, 3).map(it => {
                      const catArrived = it.catalog?.status === 'arrived';
                      const todayOC = new Date(); todayOC.setHours(0, 0, 0, 0);
                      const catExpired = catArrived && !!it.catalog?.pickup_deadline && new Date(it.catalog.pickup_deadline) < todayOC;
                      return (
                        <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {catExpired
                            ? <AlertCircle size={9} style={{ color: "#EF4444", flexShrink: 0 }} />
                            : catArrived
                              ? <Truck size={9} style={{ color: "#F59E0B", flexShrink: 0 }} />
                              : <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#555", flexShrink: 0 }} />
                          }
                          <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: catExpired ? "#EF4444" : catArrived ? "var(--td-text-lo)" : "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {it.catalog?.product_name ?? "Producto"} ×{it.quantity}
                            {catExpired && <span style={{ marginLeft: 4, fontSize: 8, color: "#EF4444", fontWeight: 900 }}>· Vencido {it.catalog?.pickup_deadline ? new Date(it.catalog.pickup_deadline).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : ""}</span>}
                            {!catArrived && !catExpired && <span style={{ marginLeft: 4, fontSize: 8, color: "#444", fontStyle: "italic" }}>en camino</span>}
                          </p>
                        </div>
                      );
                    })}
                    {pendingItems.length > 3 && <p style={{ margin: 0, fontSize: 9, color: "var(--td-text-ghost)", fontWeight: 700 }}>+{pendingItems.length - 3} más</p>}
                  </div>
                )}
                {allItems.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {allItems.slice(0, 4).map(it => (
                      <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {it.status === 'delivered'
                          ? <CheckCircle2 size={9} style={{ color: "#22C55E", flexShrink: 0 }} />
                          : <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#888", flexShrink: 0 }} />
                        }
                        <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: it.status === 'delivered' ? "#22C55E" : "var(--td-text-ghost)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: it.status === 'delivered' ? "line-through" : "none" }}>
                          {it.catalog?.product_name ?? "Producto"} ×{it.quantity}
                        </p>
                      </div>
                    ))}
                    {allItems.length > 4 && <p style={{ margin: 0, fontSize: 9, color: "var(--td-text-ghost)", fontWeight: 700 }}>+{allItems.length - 4} más</p>}
                  </div>
                )}
                <div style={{ borderTop: `1px solid ${isAwaitingArrival || isVencida ? "var(--td-panel-border)" : "var(--td-card-border)"}`, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    {(order.paid_amount ?? 0) > 0 && <p style={{ margin: 0, fontSize: 9, color: "var(--td-text-ghost)", fontWeight: 700 }}>Anticipo {fmt(order.paid_amount ?? 0)}</p>}
                    <p style={{ margin: 0, fontSize: 9, color: "var(--td-text-ghost)", fontWeight: 700 }}>Total {fmt(order.total ?? 0)}</p>
                    {isVencida && order.pickup_deadline && (
                      <p style={{ margin: 0, fontSize: 9, color: "#EF4444", fontWeight: 800 }}>
                        Venció {new Date(order.pickup_deadline).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: isVencida ? "#EF4444" : isAwaitingArrival ? "#666" : (balance <= 0 ? "#22C55E" : itemColor) }}>{fmt(balance)}</p>
                </div>
              </button>
            );
          };

          return (
            <Motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: "fixed", inset: 0, zIndex: 300, background: "var(--td-popup-bg)", backdropFilter: "blur(24px)", display: "flex", flexDirection: "column" }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--td-panel-border)", background: "var(--td-panel-bg)", flexShrink: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${activeTab.accentAlpha}0.12)`, border: `1px solid ${activeTab.accentAlpha}0.2)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}>
                  <ClipboardList size={16} color={activeTab.accentColor} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "var(--td-text-hi)" }}>Preventas</p>
                  <p style={{ margin: 0, fontSize: 9, color: "var(--td-text-ghost)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                    {activeTab.label} · {activeTab.count} registro{activeTab.count !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: 4, background: "var(--td-card-bg)", borderRadius: 14, padding: 4, border: "1px solid var(--td-card-border)" }}>
                  {TABS.map(t => (
                    <button
                      key={t.key}
                      onClick={() => { setPreSalesTab(t.key); setPickerSearch(""); }}
                      style={{
                        padding: "6px 14px", borderRadius: 10, border: "none", cursor: "pointer",
                        fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em",
                        transition: "all 0.15s",
                        background: preSalesTab === t.key ? t.accentAlpha + "0.15)" : "transparent",
                        color: preSalesTab === t.key ? t.accentColor : "var(--td-text-ghost)",
                        boxShadow: preSalesTab === t.key ? `0 0 0 1px ${t.accentAlpha}0.3)` : "none",
                      }}
                    >
                      {t.label}
                      {t.count > 0 && (
                        <span style={{ marginLeft: 5, fontSize: 9, background: preSalesTab === t.key ? t.accentAlpha + "0.2)" : "var(--td-panel-bg)", padding: "1px 5px", borderRadius: 8 }}>
                          {t.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div style={{ position: "relative", width: 260 }}>
                  <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--td-text-ghost)", pointerEvents: "none" }} />
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    placeholder="Folio, cliente o producto..."
                    style={{ width: "100%", boxSizing: "border-box", background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 12, outline: "none", padding: "9px 14px 9px 36px", fontSize: 12, fontWeight: 700, color: "var(--td-input-text)" }}
                  />
                  {pickerSearch && <button onClick={() => setPickerSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--td-text-lo)", display: "flex" }}><X size={13} /></button>}
                </div>

                {/* Botón Actualizar — refresca SOLO el dominio de la tab activa para
                    minimizar tráfico. Disponibles/Difusión → catálogos. Apartadas/
                    Liquidadas/Vencidas → folios. */}
                {(() => {
                  const isCatalogsTab = preSalesTab === 'venta' || preSalesTab === 'difusion';
                  const isFetching = isCatalogsTab
                    ? preSaleCatalogsQuery.isFetching
                    : preSaleOrdersQuery.isFetching;
                  return (
                    <button
                      onClick={() => {
                        if (isCatalogsTab) {
                          void queryClient.invalidateQueries({ queryKey: queryKeys.preSaleCatalogs.all });
                          toast.success("Actualizando catálogos…");
                        } else {
                          void queryClient.invalidateQueries({ queryKey: queryKeys.preSaleOrders.all });
                          toast.success("Actualizando folios…");
                        }
                      }}
                      disabled={isFetching}
                      style={{
                        height: 36, padding: "0 14px", borderRadius: 10, flexShrink: 0,
                        background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)",
                        cursor: isFetching ? "default" : "pointer", display: "flex",
                        alignItems: "center", gap: 6, color: "var(--td-text-lo)",
                        fontSize: 11, fontWeight: 900, textTransform: "uppercase",
                        letterSpacing: "0.08em", opacity: isFetching ? 0.5 : 1,
                      }}
                      title={isCatalogsTab ? "Buscar nuevos catálogos" : "Buscar nuevos folios"}
                    >
                      <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
                      Actualizar
                    </button>
                  );
                })()}

                <button onClick={() => setShowPreSalesModal(false)} style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--td-text-lo)" }}>
                  <X size={16} />
                </button>
              </div>

              {/* Card grid */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
                {pickerLoading ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                    <Loader2 size={32} className="animate-spin" style={{ color: activeTab.accentColor, opacity: 0.5 }} />
                  </div>
                ) : preSalesTab === 'difusion' ? (
                  <div style={{ overflowY: "auto", height: "100%", padding: "4px 0" }}>
                    <PreSaleDifusionPanel />
                  </div>
                ) : preSalesTab === 'venta' ? (() => {
                  const filteredCatalogs = preSaleCatalogs.filter(c =>
                    !q || c.product_name.toLowerCase().includes(q) || (c.category?.name ?? "").toLowerCase().includes(q) || (c.supplier?.name ?? "").toLowerCase().includes(q)
                  );
                  return filteredCatalogs.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, opacity: 0.3 }}>
                      <ClipboardList size={40} color="var(--td-text-lo)" />
                      <p style={{ color: "var(--td-text-lo)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", margin: 0 }}>
                        {pickerSearch ? "Sin resultados" : activeTab.emptyMsg}
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                      {filteredCatalogs.map(c => <CatalogCard key={c.id} catalog={c} />)}
                    </div>
                  );
                })() : (() => {
                  const orderList = preSalesTab === 'liquidar' ? preSaleOrdersPending
                    : preSalesTab === 'completadas' ? preSaleOrdersDelivered
                    : preSaleOrdersExpired;
                  const filteredOrders = orderList.filter(o =>
                    !q || o.code.toLowerCase().includes(q)
                    || (o.customer?.name ?? "").toLowerCase().includes(q)
                    || (o.items ?? []).some(it => (it.catalog?.product_name ?? "").toLowerCase().includes(q))
                  );
                  return filteredOrders.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, opacity: 0.3 }}>
                      <ClipboardList size={40} color="var(--td-text-lo)" />
                      <p style={{ color: "var(--td-text-lo)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", margin: 0 }}>
                        {pickerSearch ? "Sin resultados" : activeTab.emptyMsg}
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                      {filteredOrders.map(o => <OrderCard key={o.id} order={o} />)}
                    </div>
                  );
                })()}
              </div>
            </Motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Modal: Apartar desde POS ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showApartarModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <Motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !apartarProcessing && setShowApartarModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <Motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md rounded-[32px] p-8 shadow-2xl overflow-hidden"
              style={{
                background: "var(--td-popup-bg)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(245,158,11,0.15)",
                boxShadow: "0 0 100px rgba(0,0,0,0.8), inset 0 0 40px rgba(245,158,11,0.03)"
              }}
            >
              {/* top glow line */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />

              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <Bookmark size={18} className="text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-[0.15em]" style={{ color: THI }}>Apartar Producto</h3>
                    <p className="text-[9px] font-black text-amber-500/50 uppercase tracking-widest mt-0.5">
                      {activeMesa.customerName ?? "cliente"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowApartarModal(false)}
                  disabled={apartarProcessing}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
                  style={{ background: SOFT, color: TLO }}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Product selection */}
                {activeMesa.items.length > 1 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: TLO }}>Producto a apartar</p>
                    <div className="space-y-2 max-h-[180px] overflow-y-auto no-scrollbar">
                      {activeMesa.items.map((item, idx) => (
                        <button
                          key={item.product.id}
                          onClick={() => setApartarItemIdx(idx)}
                          className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${
                            apartarItemIdx === idx
                              ? "bg-amber-500/10 border-amber-500/30"
                              : ""
                          }`}
                          style={apartarItemIdx === idx ? undefined : { background: SOFT, border: CARD_B }}
                        >
                          <div className={`w-2 h-2 rounded-full shrink-0 ${apartarItemIdx === idx ? "bg-amber-500" : ""}`} style={apartarItemIdx === idx ? undefined : { background: "var(--td-text-ghost)" }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black truncate" style={{ color: THI }}>{item.product.name}</p>
                            <p className="text-[9px] font-bold" style={{ color: TLO }}>{item.product.sku}</p>
                          </div>
                          <p className="text-sm font-black shrink-0" style={{ color: THI }}>{fmt(getItemPrice(item) * item.quantity)}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Selected product summary */}
                {activeMesa.items[apartarItemIdx] && (
                  <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: SOFT, border: CARD_B }}>
                    <ImageWithFallback
                      src={activeMesa.items[apartarItemIdx].product.image ?? ""}
                      className="w-12 h-12 rounded-xl object-cover bg-black shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black truncate" style={{ color: THI }}>{activeMesa.items[apartarItemIdx].product.name}</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TLO }}>{activeMesa.items[apartarItemIdx].product.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black" style={{ color: THI }}>{fmt(getItemPrice(activeMesa.items[apartarItemIdx]) * activeMesa.items[apartarItemIdx].quantity)}</p>
                      <p className="text-[9px] font-bold" style={{ color: TLO }}>total</p>
                    </div>
                  </div>
                )}

                {/* Down payment */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: TLO }}>Anticipo *</p>
                  <div className="flex items-center gap-3 bg-amber-500/5 border border-amber-500/20 rounded-2xl px-4 py-3">
                    <span className="text-amber-500 font-black text-lg">$</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="0.00"
                      value={apartarDownPayment}
                      onChange={e => setApartarDownPayment(e.target.value)}
                      className="flex-1 bg-transparent outline-none text-2xl font-black [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      style={{ color: THI }}
                    />
                    <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-ghost)" }}>MXN</span>
                  </div>
                  {activeMesa.items[apartarItemIdx] && parseFloat(apartarDownPayment) > 0 && (
                    <p className="text-[9px] font-bold text-amber-500/60 mt-1.5 text-right">
                      Saldo restante: {fmt(Math.max(0, getItemPrice(activeMesa.items[apartarItemIdx]) * activeMesa.items[apartarItemIdx].quantity - (parseFloat(apartarDownPayment) || 0)))}
                    </p>
                  )}
                </div>

                {/* Payment method */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: TLO }}>Forma de pago del anticipo</p>
                  <div className="grid grid-cols-2 gap-2">
                    {paymentMethods.map(pm => (
                      <button
                        key={pm.id}
                        onClick={() => setApartarPayMethodId(String(pm.id))}
                        className={`py-2.5 px-4 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                          apartarPayMethodId === String(pm.id)
                            ? "bg-amber-500/15 border-amber-500/40 text-amber-500"
                            : ""
                        }`}
                        style={apartarPayMethodId === String(pm.id) ? undefined : { background: SOFT, border: CARD_B, color: TLO }}
                      >
                        {pm.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Expiry date (optional) */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-2" style={{ color: TLO }}>
                    <Calendar size={10} />
                    Fecha límite de entrega <span className="normal-case font-bold" style={{ color: "var(--td-text-ghost)" }}>(opcional)</span>
                  </p>
                  <input
                    type="date"
                    value={apartarExpiresAt}
                    onChange={e => setApartarExpiresAt(e.target.value)}
                    min={getTodayLocal()}
                    className="w-full rounded-2xl px-4 py-2.5 text-sm font-bold outline-none focus:bg-amber-500/5 transition-all"
                    style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-input-text)", colorScheme: "light" }}
                  />
                </div>

                {/* Notes (optional) */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color: TLO }}>
                    Notas <span className="normal-case font-bold" style={{ color: "var(--td-text-ghost)" }}>(opcional)</span>
                  </p>
                  <input
                    type="text"
                    placeholder="Ej: Cliente pagará el viernes..."
                    value={apartarNotes}
                    onChange={e => setApartarNotes(e.target.value)}
                    className="w-full rounded-2xl px-4 py-2.5 text-sm font-bold outline-none transition-all"
                    style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-input-text)" }}
                  />
                </div>

                {/* Confirm button */}
                <button
                  disabled={apartarProcessing || !apartarDownPayment || parseFloat(apartarDownPayment) <= 0}
                  onClick={() => { void handleApartar(); }}
                  className="w-full relative flex items-center justify-center gap-3 py-4 rounded-[20px] overflow-hidden transition-all disabled:opacity-30 disabled:grayscale"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-600 to-amber-500" />
                  <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent" />
                  <Bookmark size={18} className="relative z-10 text-white" />
                  <span className="relative z-10 text-base font-black uppercase tracking-widest text-white">
                    {apartarProcessing ? "Creando apartado..." : "Confirmar Apartado"}
                  </span>
                </button>
              </div>
            </Motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Escáner de Cámara ──────────────────────────────────────────────── */}
      <CameraScannerModal
        open={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onDetected={code => {
          setShowCameraScanner(false);
          void handleScannedCode(code);
        }}
      />

      {/* ── Catálogo de Productos ──────────────────────────────────────────── */}
      {showCatalog && (
        <ProductCatalogModal
          products={products}
          onSelect={(p, level, qty) => { void addToCart(p, level ?? "a", qty ?? 1); }}
          onClose={() => setShowCatalog(false)}
          title={activeStore ? `Catálogo · ${activeStore.name}` : "Catálogo de Productos"}
          preventaMode={activeMesa.isPreventa}
          availableStock={catalogAvailableStock}
          reservedByMesa={catalogReservedByMesa}
          onRefresh={() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
            toast.success("Actualizando catálogo…");
          }}
          isRefreshing={productsQuery.isFetching}
        />
      )}

      {/* ── Modal: Imprimir Ticket ────────────────────────────────────────── */}
      {showPrintModal && lastCompletedSale && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
            onClick={() => { setShowPrintModal(false); closePendingMesa(); }} />
          <div style={{ position: "relative", background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", borderRadius: 28, padding: 28, width: "100%", maxWidth: 380 }}>
            {/* Icon + title */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(224,34,26,0.1)", border: "1px solid rgba(224,34,26,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Printer size={24} color="#E0221A" />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "var(--td-text-hi)" }}>¿Imprimir ticket?</p>
                <p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--td-text-ghost)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em" }}>
                  Venta · {fmt(lastCompletedSale.total)}
                </p>
              </div>
            </div>

            {/* Sale summary — incluye la preventa (anticipo/liquidación) cuando
                la venta es mixta, igual que el ticket impreso. Antes solo
                listaba `items` (productos) y el anticipo no aparecía aunque
                contara en el total → confundía (total $450 vs líneas $350). */}
            <div style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 16, padding: "12px 16px", marginBottom: 20, maxHeight: 200, overflowY: "auto" }}>
              {lastCompletedSale.preSaleCode && (
                <div style={{ paddingBottom: 6, marginBottom: 6, borderBottom: "1px solid var(--td-card-border)" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#E0221A" }}>
                    ★ Preventa · {lastCompletedSale.preSaleCode}
                  </p>
                  {(lastCompletedSale.preSaleItems ?? []).map((it, i) => (
                    <div key={`pv${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "2px 0" }}>
                      <span style={{ fontSize: 11, color: "var(--td-text-hi)", fontWeight: 700 }}>
                        {it.name}
                        {/* cant × unitario para no leer el importe como precio por pieza */}
                        <span style={{ display: "block", fontSize: 9, color: "var(--td-text-ghost)", fontWeight: 700 }}>{it.quantity} × {fmt(it.unitPrice)}</span>
                      </span>
                      <span style={{ fontSize: 10, color: "var(--td-text-ghost)", fontWeight: 700 }}>{fmt(it.unitPrice * it.quantity)}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 3 }}>
                    <span style={{ fontSize: 10, color: "var(--td-text-md)", fontWeight: 700 }}>
                      {lastCompletedSale.preSaleIsLiquidation ? "Liquidación" : "Anticipo"}
                    </span>
                    <span style={{ fontSize: 12, color: "#10b981", fontWeight: 900 }}>{fmt(lastCompletedSale.preSaleAnticipo ?? 0)}</span>
                  </div>
                </div>
              )}
              {lastCompletedSale.preSaleCode && lastCompletedSale.items.length > 0 && (
                <p style={{ margin: "0 0 4px", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--td-text-ghost)" }}>Productos</p>
              )}
              {lastCompletedSale.items.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "3px 0", borderBottom: i < lastCompletedSale.items.length - 1 ? "1px solid var(--td-card-border)" : "none" }}>
                  <span style={{ fontSize: 11, color: "var(--td-text-hi)", fontWeight: 700 }}>
                    {item.name}
                    <span style={{ display: "block", fontSize: 9, color: "var(--td-text-ghost)", fontWeight: 700 }}>{item.quantity} × {fmt(item.price)}</span>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--td-text-md)", fontWeight: 700 }}>{fmt(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>

            {/* Never ask checkbox */}
            <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, cursor: "pointer" }}>
              <input type="checkbox" checked={printNeverAsk} onChange={e => setPrintNeverAsk(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#E0221A", cursor: "pointer" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.1em", userSelect: "none" }}>
                No preguntar de nuevo
              </span>
            </label>

            {/* Preference hint when checkbox is checked */}
            {printNeverAsk && (
              <p style={{ fontSize: 9, color: "var(--td-text-ghost)", marginBottom: 14, fontWeight: 600 }}>
                Al imprimir → futuras ventas imprimirán automáticamente. Al omitir → no se imprimirá.
              </p>
            )}

            {/* Buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => {
                  if (printNeverAsk) localStorage.setItem(PRINT_PREF_KEY, "never");
                  setShowPrintModal(false);
                  // Mesa secundaria se cierra al cerrar el modal — sea omitir o imprimir.
                  closePendingMesa();
                }}
                style={{ flex: 1, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 14, color: "var(--td-text-lo)", padding: "11px", fontSize: 11, fontWeight: 900, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.1em" }}
              >
                Omitir
              </button>
              <button
                onClick={() => {
                  if (printNeverAsk) localStorage.setItem(PRINT_PREF_KEY, "auto");
                  doPrintTicket(lastCompletedSale);
                  setShowPrintModal(false);
                  // Espera medio segundo al setTimeout(print, 300) que abre la
                  // ventana del ticket antes de cerrar la mesa, para que el
                  // print no quede en estado raro si removeMesa cambia el active.
                  window.setTimeout(closePendingMesa, 500);
                }}
                style={{ flex: 2, background: "linear-gradient(135deg,#BB1100,#FF3322)", border: "none", borderRadius: 14, color: "#fff", padding: "11px", fontSize: 12, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}
              >
                <Printer size={14} />
                Imprimir
              </button>
            </div>

            {/* Reset pref link */}
            {localStorage.getItem(PRINT_PREF_KEY) && localStorage.getItem(PRINT_PREF_KEY) !== "ask" && (
              <button
                onClick={() => { localStorage.removeItem(PRINT_PREF_KEY); }}
                style={{ display: "block", width: "100%", marginTop: 12, background: "none", border: "none", fontSize: 9, color: "var(--td-text-ghost)", cursor: "pointer", textDecoration: "underline", textTransform: "uppercase", letterSpacing: "0.1em" }}
              >
                Restablecer preferencia de impresión
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Popup: asignar cliente a la venta actual (scan TAD o botón User) ─ */}
      {assignCustomerPopup && (() => {
        const p = assignCustomerPopup;
        const closePopup = () => setAssignCustomerPopup(null);
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }} onClick={closePopup} />
            <div style={{ position: "relative", background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", borderRadius: 24, width: "100%", maxWidth: 480, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: "1px solid var(--td-card-border)" }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <User size={18} color="#60A5FA" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "var(--td-text-hi)" }}>
                    {p.mode === 'scan' ? "Socio Tadaima detectado" : "Asignar cliente"}
                  </p>
                  <p style={{ margin: 0, fontSize: 10, color: "var(--td-text-ghost)", fontWeight: 700 }}>
                    {p.mode === 'scan' ? `Tarjeta ${p.search}` : "Busca por nombre, teléfono, correo o tarjeta"}
                  </p>
                </div>
                <button onClick={closePopup} style={{ width: 32, height: 32, borderRadius: 9, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--td-text-lo)" }}>
                  <X size={14} />
                </button>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
                {p.mode === 'scan' && (
                  <>
                    {p.searching && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
                        <Loader2 size={28} className="animate-spin" style={{ color: "#60A5FA" }} />
                      </div>
                    )}
                    {!p.searching && p.candidate && (
                      <div style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 14, padding: 16 }}>
                        <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "var(--td-text-hi)" }}>
                          {p.candidate.type === 'local' ? p.candidate.customer.name : (p.candidate.ext.name ?? p.candidate.ext.external_member_id)}
                        </p>
                        <div style={{ marginTop: 8, fontSize: 12, color: "var(--td-text-ghost)", lineHeight: 1.6 }}>
                          {p.candidate.type === 'local' ? (
                            <>
                              {p.candidate.customer.phone && <div>📞 {p.candidate.customer.phone}</div>}
                              {p.candidate.customer.email && <div>✉️ {p.candidate.customer.email}</div>}
                              <div style={{ marginTop: 6, color: "#10b981", fontWeight: 700 }}>Ya registrado en tu base</div>
                            </>
                          ) : (
                            <>
                              {p.candidate.ext.phone && <div>📞 {p.candidate.ext.phone}</div>}
                              {p.candidate.ext.email && <div>✉️ {p.candidate.ext.email}</div>}
                              {p.candidate.ext.nivel && <div>🏅 Nivel: {p.candidate.ext.nivel}</div>}
                              <div style={{ marginTop: 6, color: "#F59E0B", fontWeight: 700 }}>Se agregará a tu base al asignar</div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {p.mode === 'manual' && (
                  <>
                    <div style={{ position: "relative", marginBottom: 14 }}>
                      <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--td-text-ghost)" }} />
                      <input
                        type="text"
                        autoFocus
                        value={p.search}
                        onChange={e => setAssignCustomerPopup(prev => prev ? { ...prev, search: e.target.value } : null)}
                        placeholder="Nombre, teléfono, correo o tarjeta…"
                        style={{ width: "100%", boxSizing: "border-box", background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 12, outline: "none", padding: "10px 14px 10px 36px", fontSize: 13, fontWeight: 700, color: "var(--td-input-text)" }}
                      />
                    </div>
                    {p.searching && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 18, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, marginBottom: 8 }}>
                        <Loader2 size={16} className="animate-spin" style={{ color: "#F59E0B" }} />
                        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          Buscando en socios Tadaima…
                        </p>
                      </div>
                    )}
                    {!p.searching && p.search.trim() && p.searchResults.locales.length === 0 && p.searchResults.externos.length === 0 && (
                      <p style={{ textAlign: "center", color: "var(--td-text-ghost)", fontSize: 12, padding: 16 }}>Sin coincidencias en tu base ni en socios Tadaima</p>
                    )}
                    {p.searchResults.locales.map(c => (
                      <button
                        key={`local-${c.id}`}
                        onClick={() => { void confirmAssignCustomer({ type: 'local', customer: c }); }}
                        disabled={p.assigning}
                        style={{ width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 6, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 12, cursor: p.assigning ? "default" : "pointer", color: "var(--td-text-hi)" }}
                      >
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 900 }}>{c.name}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "var(--td-text-ghost)" }}>{[c.phone, c.email].filter(Boolean).join(" · ") || "—"}</p>
                      </button>
                    ))}
                    {p.searchResults.externos.length > 0 && (
                      <p style={{ margin: "14px 4px 6px", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#F59E0B" }}>
                        Socios Tadaima
                      </p>
                    )}
                    {p.searchResults.externos.map(ext => (
                      <button
                        key={`ext-${ext.external_member_id}`}
                        onClick={() => { void confirmAssignCustomer({ type: 'external', ext }); }}
                        disabled={p.assigning}
                        style={{ width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 6, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, cursor: p.assigning ? "default" : "pointer", color: "var(--td-text-hi)" }}
                      >
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 900 }}>{ext.name ?? ext.external_member_id}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "var(--td-text-ghost)" }}>{[ext.phone, ext.email].filter(Boolean).join(" · ") || ext.external_member_id}</p>
                      </button>
                    ))}
                  </>
                )}
              </div>

              {/* Footer STICKY — modo manual: botón "+ Crear cliente nuevo" / form expandido.
                  Antes vivía al final del scroll → en listas largas tenías que bajar a buscarlo.
                  Ahora está siempre visible arriba del borde inferior del popup. */}
              {p.mode === 'manual' && (
                <div style={{
                  borderTop: "1px solid var(--td-card-border)",
                  padding: p.createForm.open ? "12px 22px 16px" : "12px 22px",
                  background: p.createForm.open ? "rgba(96,165,250,0.04)" : "transparent",
                }}>
                  {!p.createForm.open ? (
                    <button
                      onClick={() => setAssignCustomerPopup(prev => prev ? {
                        ...prev,
                        createForm: { ...prev.createForm, open: true, name: prev.search.trim() },
                      } : null)}
                      style={{ width: "100%", padding: "12px 14px", borderRadius: 12, background: "rgba(96,165,250,0.10)", border: "1px dashed rgba(96,165,250,0.5)", color: "#60A5FA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}
                    >
                      <UserPlus size={15} />
                      Crear cliente nuevo
                    </button>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <p style={{ margin: 0, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#60A5FA" }}>Nuevo cliente</p>
                        <button
                          onClick={() => setAssignCustomerPopup(prev => prev ? { ...prev, createForm: { open: false, name: "", phone: "", email: "", saving: false } } : null)}
                          disabled={p.createForm.saving}
                          style={{ background: "transparent", border: "none", color: "var(--td-text-lo)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", cursor: p.createForm.saving ? "default" : "pointer" }}
                        >
                          ✕ Cancelar
                        </button>
                      </div>
                      {/* Nombre — full width, grande, autoFocus */}
                      <input
                        autoFocus
                        type="text"
                        value={p.createForm.name}
                        onChange={e => setAssignCustomerPopup(prev => prev ? { ...prev, createForm: { ...prev.createForm, name: e.target.value } } : null)}
                        onKeyDown={e => { if (e.key === "Enter" && p.createForm.name.trim() && !p.createForm.saving) void submitCreateCustomer(); }}
                        placeholder="Nombre del cliente *"
                        style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 10, padding: "11px 14px", fontSize: 14, fontWeight: 700, color: "var(--td-input-text)", outline: "none" }}
                      />
                      {/* Teléfono + Email en grid 2-col — compactos, ambos opcionales.
                          Validación inline (Joel 2026-06-12): borde + label rojo en
                          cuanto el dato es inválido; el botón se bloquea. */}
                      {(() => {
                        const popupPhoneBad = !!p.createForm.phone.trim() && !isValidPhone(p.createForm.phone);
                        const popupEmailBad = !!p.createForm.email.trim() && !isValidEmail(p.createForm.email);
                        const popupBlocked = p.createForm.saving || !p.createForm.name.trim() || popupPhoneBad || popupEmailBad;
                        const errStyle: React.CSSProperties = { margin: "4px 2px 0", fontSize: 10, fontWeight: 700, color: "#f87171" };
                        return (
                          <>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                              <div style={{ minWidth: 0 }}>
                                <input
                                  type="tel"
                                  value={p.createForm.phone}
                                  onChange={e => setAssignCustomerPopup(prev => prev ? { ...prev, createForm: { ...prev.createForm, phone: e.target.value } } : null)}
                                  onKeyDown={e => { if (e.key === "Enter" && p.createForm.name.trim() && !p.createForm.saving) void submitCreateCustomer(); }}
                                  placeholder="Teléfono"
                                  style={{ width: "100%", background: "var(--td-input-bg)", border: `1px solid ${popupPhoneBad ? "rgba(248,113,113,0.7)" : "var(--td-input-border)"}`, borderRadius: 10, padding: "9px 12px", fontSize: 12, fontWeight: 700, color: "var(--td-input-text)", outline: "none", minWidth: 0 }}
                                />
                                {popupPhoneBad && <p style={errStyle}>Teléfono inválido — 10 dígitos</p>}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <input
                                  type="email"
                                  value={p.createForm.email}
                                  onChange={e => setAssignCustomerPopup(prev => prev ? { ...prev, createForm: { ...prev.createForm, email: e.target.value } } : null)}
                                  onKeyDown={e => { if (e.key === "Enter" && p.createForm.name.trim() && !p.createForm.saving) void submitCreateCustomer(); }}
                                  placeholder="Correo"
                                  style={{ width: "100%", background: "var(--td-input-bg)", border: `1px solid ${popupEmailBad ? "rgba(248,113,113,0.7)" : "var(--td-input-border)"}`, borderRadius: 10, padding: "9px 12px", fontSize: 12, fontWeight: 700, color: "var(--td-input-text)", outline: "none", minWidth: 0 }}
                                />
                                {popupEmailBad && <p style={errStyle}>Correo inválido (ej. cliente@correo.com)</p>}
                              </div>
                            </div>
                            <button
                              onClick={() => { void submitCreateCustomer(); }}
                              disabled={popupBlocked}
                              style={{ marginTop: 2, padding: "11px 14px", borderRadius: 10, background: "#10b981", border: "none", color: "#fff", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", cursor: p.createForm.saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: popupBlocked ? 0.5 : 1 }}
                            >
                              {p.createForm.saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                              Crear y asignar
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Footer (solo modo scan con candidato) */}
              {p.mode === 'scan' && !p.searching && p.candidate && (
                <div style={{ display: "flex", gap: 10, padding: "14px 22px", borderTop: "1px solid var(--td-card-border)" }}>
                  <button
                    onClick={closePopup}
                    disabled={p.assigning}
                    style={{ flex: 1, padding: "11px 14px", borderRadius: 11, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", color: "var(--td-text-lo)", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", cursor: p.assigning ? "default" : "pointer", opacity: p.assigning ? 0.5 : 1 }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => { if (p.candidate) void confirmAssignCustomer(p.candidate); }}
                    disabled={p.assigning}
                    style={{ flex: 2, padding: "11px 14px", borderRadius: 11, background: "#10b981", border: "none", color: "#fff", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", cursor: p.assigning ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: p.assigning ? 0.6 : 1 }}
                  >
                    {p.assigning ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Asignar a esta venta
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Modal: Clientes (acceso rápido desde toolbar) ─────────────────── */}
      {showClientsModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowClientsModal(false)} />
          <div style={{ position: "relative", background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", borderRadius: 28, width: "100%", maxWidth: 720, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", borderBottom: "1px solid var(--td-card-border)" }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Users size={20} color="#60A5FA" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "var(--td-text-hi)" }}>Clientes</p>
                <p style={{ margin: 0, fontSize: 9, color: "var(--td-text-ghost)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  {clientsLocal.length} local{clientsLocal.length !== 1 ? "es" : ""}{clientsExternal.length > 0 ? ` · ${clientsExternal.length} socio${clientsExternal.length !== 1 ? "s" : ""} Tadaima` : ""}
                </p>
              </div>
              <button onClick={() => setShowClientsModal(false)} style={{ width: 36, height: 36, borderRadius: 10, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--td-text-lo)" }}>
                <X size={16} />
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--td-card-border)" }}>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--td-text-ghost)", pointerEvents: "none" }} />
                <input
                  type="text"
                  value={clientsSearch}
                  onChange={e => setClientsSearch(e.target.value)}
                  placeholder="Buscar por nombre, teléfono, correo o código de tarjeta…"
                  autoFocus
                  style={{ width: "100%", boxSizing: "border-box", background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 12, outline: "none", padding: "11px 14px 11px 38px", fontSize: 13, fontWeight: 700, color: "var(--td-input-text)" }}
                />
                {clientsSearch && (
                  <button onClick={() => setClientsSearch("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--td-text-lo)", display: "flex" }}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <p style={{ margin: "6px 2px 0", fontSize: 10, color: "var(--td-text-ghost)" }}>
                Primero busca en tu base local; si no encuentra y la query tiene 2+ caracteres, busca en socios Tadaima.
              </p>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
              {clientsSearching && clientsLocal.length === 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 18, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, marginBottom: 8 }}>
                  <Loader2 size={16} className="animate-spin" style={{ color: "#F59E0B" }} />
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Buscando en socios Tadaima…
                  </p>
                </div>
              )}

              {!clientsSearching && clientsLocal.length === 0 && clientsExternal.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: "var(--td-text-ghost)", fontSize: 12 }}>
                  {clientsSearch ? "Sin coincidencias en tu base ni en socios Tadaima" : "Sin clientes registrados"}
                </div>
              )}

              {/* Clientes locales */}
              {clientsLocal.map(c => {
                const idNum = Number(c.id);
                const isExpanded = expandedClientId === idNum;
                return (
                  <div key={`local-${c.id}`} style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 14, marginBottom: 8, overflow: "hidden" }}>
                    <button
                      onClick={() => { void expandClient(c); }}
                      style={{ width: "100%", padding: "12px 14px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, color: "var(--td-text-hi)" }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(96,165,250,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <User size={16} color="#60A5FA" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 900 }}>{c.name}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "var(--td-text-ghost)" }}>
                          {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                          {c.external_member_id ? " · Socio Tadaima" : ""}
                        </p>
                      </div>
                      <ChevronDown size={14} style={{ color: "var(--td-text-ghost)", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                    </button>

                    {isExpanded && clientDetail && (
                      <div style={{ padding: "12px 14px", borderTop: "1px solid var(--td-card-border)", background: "rgba(0,0,0,0.18)" }}>
                        {clientDetail.loading ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                            <Loader2 size={20} className="animate-spin" style={{ color: "#60A5FA" }} />
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div>
                              <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--td-text-ghost)" }}>
                                Tickets ({clientDetail.sales.length})
                              </p>
                              {clientDetail.sales.length === 0 ? (
                                <p style={{ margin: 0, fontSize: 11, color: "var(--td-text-ghost)" }}>Sin tickets</p>
                              ) : (
                                clientDetail.sales.slice(0, 10).map(s => (
                                  <div key={`s-${s.id}`} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, color: "var(--td-text-hi)" }}>
                                    <span>#{s.id} · {new Date(s.created_at).toLocaleDateString("es-MX")}</span>
                                    <span style={{ fontWeight: 900 }}>{fmt(s.total)}</span>
                                  </div>
                                ))
                              )}
                            </div>
                            <div>
                              <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--td-text-ghost)" }}>
                                Preventas ({clientDetail.preSales.length})
                              </p>
                              {clientDetail.preSales.length === 0 ? (
                                <p style={{ margin: 0, fontSize: 11, color: "var(--td-text-ghost)" }}>Sin preventas</p>
                              ) : (
                                clientDetail.preSales.slice(0, 10).map(p => (
                                  <div key={`p-${p.id}`} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, color: "var(--td-text-hi)" }}>
                                    <span>{p.code} · {p.status}</span>
                                    <span style={{ fontWeight: 900, color: "#F59E0B" }}>{fmt(p.total)}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Socios Tadaima externos (solo cuando no hay match local) */}
              {clientsExternal.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ margin: "0 0 8px 4px", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#F59E0B" }}>
                    Socios Tadaima (no en tu base)
                  </p>
                  {clientsExternal.map(ext => {
                    const adding = addingExternalId === ext.external_member_id;
                    return (
                      <div key={`ext-${ext.external_member_id}`} style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 14, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <User size={16} color="#F59E0B" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "var(--td-text-hi)" }}>
                            {ext.name ?? ext.external_member_id}
                          </p>
                          <p style={{ margin: 0, fontSize: 11, color: "var(--td-text-ghost)" }}>
                            {[ext.phone, ext.email].filter(Boolean).join(" · ") || ext.external_member_id}
                          </p>
                        </div>
                        <button
                          onClick={() => { void addExternalToDb(ext); }}
                          disabled={adding}
                          style={{ height: 32, padding: "0 14px", borderRadius: 10, background: "#F59E0B", border: "none", color: "#1a0a00", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", cursor: adding ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6, opacity: adding ? 0.6 : 1 }}
                        >
                          {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                          Agregar
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Historial de Ventas ────────────────────────────────────── */}
      {/* Corte de Caja — abre tras cerrar sesión exitosamente */}
      {cashCloseSummary && (
        <CashCloseSummaryModal
          session={cashCloseSummary}
          open
          onClose={() => setCashCloseSummary(null)}
        />
      )}

      {/* Ventana de Cortes — vista rápida desde la Caja (acotada por rol en backend) */}
      <CortesModal
        open={showCortesModal}
        onClose={() => setShowCortesModal(false)}
        storeId={activeStore?.id}
      />

      {/* ADR-016 Fase 3 — Modal de cancelación de ticket */}
      {cancelTarget && (
        <CancelTicketModal
          {...(cancelTarget.kind === 'sale'
            ? { kind: 'sale' as const, sale: cancelTarget.sale }
            : { kind: 'presale' as const, order: cancelTarget.order })}
          cashSessionId={cashSession?.id}
          onClose={() => setCancelTarget(null)}
          onSuccess={() => {
            setCancelTarget(null);
            // Cancelar devuelve stock y reversa caja — invalidación central
            // (historial, productos, inventario, ventas, folios, dashboards)
            // + el tab admin de cancelaciones.
            void queryClient.invalidateQueries({ queryKey: ['saleCancellations'] });
            invalidateAfterSale(queryClient, { presale: true });
          }}
        />
      )}

      {showHistorialModal && (
        /* Full-screen estilo dashboard (mismo patrón que el catálogo de
           Productos/Preventas) — el modal centrado de 560px se veía apretado
           con muchas ventas (Joel 2026-06-12). */
        <div style={{
          position: "fixed", inset: 0, zIndex: 400,
          background: "var(--td-popup-bg)",
          backdropFilter: "blur(24px)",
          display: "flex", flexDirection: "column",
        }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--td-panel-border)", background: "var(--td-panel-bg)", flexShrink: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(224,34,26,0.1)", border: "1px solid rgba(224,34,26,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <History size={18} color="#E0221A" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "var(--td-text-hi)" }}>Historial del Día</h3>
                <p style={{ margin: "2px 0 0", fontSize: 9, fontWeight: 700, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.15em", display: "flex", alignItems: "center", gap: 6 }}>
                  {activeStore?.name ?? "Tienda"} · {historialEntries.length} eventos hoy
                  {historialRefreshing && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#E0221A", opacity: 0.8 }}>
                      <Loader2 size={9} className="animate-spin" /> actualizando
                    </span>
                  )}
                </p>
              </div>

              {/* Buscador inteligente: ticket #, folio, cliente, producto, SKU o método */}
              <div style={{ position: "relative", width: 320 }}>
                <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--td-text-ghost)", pointerEvents: "none" }} />
                <input
                  type="text"
                  value={historialSearch}
                  onChange={e => setHistorialSearch(e.target.value)}
                  placeholder="Ticket, folio, cliente, producto, método…"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)",
                    borderRadius: 12, padding: "9px 12px 9px 34px",
                    fontSize: 12, color: "var(--td-input-text)", outline: "none",
                  }}
                />
                {historialSearch && (
                  <button onClick={() => setHistorialSearch("")}
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--td-text-ghost)", padding: 2 }}>
                    <X size={13} />
                  </button>
                )}
              </div>

              <button
                onClick={() => { void fetchHistorial(); }}
                title="Actualizar historial"
                style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 12, color: "var(--td-text-lo)", padding: "9px 14px", fontSize: 10, fontWeight: 900, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.12em", flexShrink: 0 }}
              >
                <RefreshCw size={13} className={historialRefreshing ? "animate-spin" : ""} />
                Actualizar
              </button>

              <button onClick={() => setShowHistorialModal(false)}
                title="Cerrar"
                style={{ width: 38, height: 38, borderRadius: 12, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", cursor: "pointer", color: "var(--td-text-lo)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <X size={17} />
              </button>
            </div>

            {/* Contenido centrado, ancho de lectura cómodo. height 100% +
                minHeight 0 EXPLÍCITOS en toda la cadena: sin esto el alto
                dependía del stretch implícito del flex y la lista del
                historial no scrolleaba (Joel 2026-06-11). */}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", justifyContent: "center" }}>
            <div style={{ width: "100%", maxWidth: 1000, height: "100%", padding: "16px 20px 20px", boxSizing: "border-box", display: "flex", flexDirection: "column", minHeight: 0 }}>

            {/* ADR-016 Fase 1 — Tabs/filtros del historial */}
            {(() => {
              const cancelledCount = historialEntries.filter(e => {
                if (e.type === 'sale') {
                  const s = e.data as SaleDetail;
                  return s.status === 'returned' || s.cancellation_status === 'partial';
                }
                return e.data.status === 'cancelled' || e.data.cancellation_status === 'partial';
              }).length;
              return (
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {(['all', 'cancelled'] as const).map(f => {
                    const isActive = historialFilter === f;
                    const label = f === 'all' ? 'Todas' : 'Canceladas';
                    const count = f === 'all' ? historialEntries.length : cancelledCount;
                    return (
                      <button
                        key={f}
                        onClick={() => setHistorialFilter(f)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 10,
                          fontSize: 10,
                          fontWeight: 900,
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          cursor: 'pointer',
                          background: isActive ? (f === 'cancelled' ? 'rgba(239,68,68,0.15)' : 'rgba(224,34,26,0.12)') : 'var(--td-card-bg)',
                          border: `1px solid ${isActive ? (f === 'cancelled' ? 'rgba(239,68,68,0.35)' : 'rgba(224,34,26,0.30)') : 'var(--td-card-border)'}`,
                          color: isActive ? (f === 'cancelled' ? '#f87171' : '#E0221A') : 'var(--td-text-lo)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 0.15s',
                        }}
                      >
                        {label}
                        <span style={{
                          background: isActive ? "var(--td-surface-strong)" : "var(--td-surface-soft)",
                          borderRadius: 999,
                          padding: '1px 6px',
                          fontSize: 9,
                        }}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* List — max-height anclado al alto real de la pantalla (mide su
                top vs window.innerHeight) para que el scroll se maneje SIEMPRE
                internamente, sin depender solo de la cadena flex. minHeight 0
                se mantiene como respaldo del flex. */}
            <div ref={historialListRef} className="td-scroll-visible" style={{ flex: 1, minHeight: 0, maxHeight: historialListMaxH, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4 }}>
              {historialLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
                  <Loader2 size={24} style={{ color: "#E0221A" }} className="animate-spin" />
                </div>
              ) : historialEntries.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, opacity: 0.3 }}>
                  <Receipt size={36} style={{ marginBottom: 8 }} />
                  <p style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em" }}>Sin eventos registrados hoy</p>
                </div>
              ) : (
                (() => {
                  // Build set of saleIds that are part of a mixed pair so we skip them as standalone
                  const pairedSaleIds = new Set(mixedPairs.map(p => p.saleId));

                  // ADR-016 Fase 1: aplica filtro de tab.
                  const tabEntries = historialFilter === 'cancelled'
                    ? historialEntries.filter(e => {
                        if (e.type === 'sale') {
                          const s = e.data as SaleDetail;
                          return s.status === 'returned' || s.cancellation_status === 'partial';
                        }
                        return e.data.status === 'cancelled' || e.data.cancellation_status === 'partial';
                      })
                    : historialEntries;

                  // Buscador: ticket #, folio, cliente, producto, SKU o método de pago.
                  const q = historialSearch.trim().toLowerCase();
                  const filteredEntries = !q ? tabEntries : tabEntries.filter(e => {
                    if (e.type === 'sale') {
                      const s = e.data as SaleDetail;
                      return String(s.id ?? '').includes(q)
                        || (s.customer?.name ?? '').toLowerCase().includes(q)
                        || (s.items ?? []).some(i =>
                          (i.product?.name ?? '').toLowerCase().includes(q)
                          || (i.product?.sku ?? '').toLowerCase().includes(q))
                        || (s.payments ?? []).some(p => (p.payment_method?.name ?? '').toLowerCase().includes(q));
                    }
                    const o = e.data;
                    return (o.code ?? '').toLowerCase().includes(q)
                      || (o.customer?.name ?? '').toLowerCase().includes(q)
                      || (o.items ?? []).some(i => (i.catalog?.product_name ?? '').toLowerCase().includes(q))
                      || (o.payments ?? []).some(p => (p.payment_method?.name ?? '').toLowerCase().includes(q));
                  });

                  if (filteredEntries.length === 0) {
                    return (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, opacity: 0.3 }}>
                        <Receipt size={36} style={{ marginBottom: 8 }} />
                        <p style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em" }}>
                          {q ? `Sin resultados para "${historialSearch.trim()}"` : historialFilter === 'cancelled' ? 'No hay cancelaciones hoy' : 'Sin eventos registrados hoy'}
                        </p>
                      </div>
                    );
                  }

                  return filteredEntries.map(entry => {
                  const entryKey = `${entry.type}-${entry.data.id}`;
                  const isOpen = expandedEntryKey === entryKey;

                  // ── VENTA PARTE DE UN PAR MIXTO → skip (la renderiza el bloque de preventa) ──
                  if (entry.type === 'sale' && pairedSaleIds.has(entry.data.id!)) return null;

                  // ── VENTA REGULAR ────────────────────────────────────────────
                  if (entry.type === 'sale') {
                    const sale = entry.data;
                    const first = sale.payments?.[0];
                    const method = first?.payment_method?.name ?? "Efectivo";
                    // Label corto: "Tarjeta débito/crédito" no cabe — basta "Tarjeta".
                    const methodLabel = /tarjeta/i.test(method) ? "Tarjeta" : method;
                    // Tarjeta NO se cancela/devuelve (la tienda pierde la comisión —
                    // decisión Joel 2026-06-10; el backend ya lo bloquea con 422).
                    // Ocultamos el botón para no invitar al error.
                    const hasCardPayment = (sale.payments ?? []).some(p => /tarjeta|card/i.test(p.payment_method?.name ?? ""));
                    const itemCount = sale.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
                    const dateStr = sale.sold_at || sale.created_at;
                    const discount = (sale as unknown as Record<string, unknown>).discount_amount as number | undefined;
                    return (
                      <div key={entryKey} style={{ background: "var(--td-card-bg)", border: `1px solid ${isOpen ? "rgba(224,34,26,0.3)" : "var(--td-card-border)"}`, borderRadius: 16, overflow: "hidden" }}>
                        <button onClick={() => setExpandedEntryKey(isOpen ? null : entryKey)}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                          <ChevronRight size={12} style={{ flexShrink: 0, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", color: isOpen ? "#E0221A" : "var(--td-text-ghost)" }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 9, fontWeight: 900, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.12em" }}>#{sale.id}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--td-text-hi)" }}>{new Date(dateStr).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</span>
                              {sale.customer?.name && <span style={{ fontSize: 10, color: "var(--td-text-ghost)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sale.customer.name}</span>}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{methodLabel}</span>
                              <span style={{ fontSize: 9, color: "var(--td-text-ghost)" }}>· {itemCount} art.</span>
                              {sale.status === "returned" && <span style={{ fontSize: 9, fontWeight: 900, color: "#f87171", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.30)", borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cancelada</span>}
                              {sale.status !== "returned" && sale.cancellation_status === "partial" && <span style={{ fontSize: 9, fontWeight: 900, color: "#fbbf24", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.30)", borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cancelada parcial</span>}
                            </div>
                          </div>
                          {/* Cancelada total: −$X en ROJO = lo que se regresó (el
                              total quedó en $0 por el edit-in-place y no decía
                              nada). SIMBÓLICO: no se suma a ningún total — el
                              corte ya lo descuenta (Joel 2026-06-12). */}
                          {sale.status === "returned" && (sale.cancelled_amount ?? 0) > 0 ? (
                            <span style={{ fontSize: 14, fontWeight: 900, color: "#f87171", flexShrink: 0 }}>−{fmt(sale.cancelled_amount ?? 0)}</span>
                          ) : (
                            <span style={{ fontSize: 14, fontWeight: 900, color: sale.status === "returned" ? "#f87171" : "var(--td-text-hi)", flexShrink: 0, textDecoration: sale.status === "returned" ? "line-through" : "none", opacity: sale.status === "returned" ? 0.6 : 1 }}>
                              {fmt(sale.total)}
                              {sale.cancellation_status === "partial" && (sale.cancelled_amount ?? 0) > 0 && (
                                <span style={{ display: "block", fontSize: 9, fontWeight: 800, color: "#f87171", textDecoration: "none" }}>−{fmt(sale.cancelled_amount ?? 0)} canc.</span>
                              )}
                            </span>
                          )}
                          <div onClick={e => { e.stopPropagation(); doPrintTicket({ id: sale.id, total: sale.total, paymentMethod: method, ...(sale.customer?.name ? { customerName: sale.customer.name } : {}), items: (sale.items || []).map(i => ({ name: i.product?.name || String(i.product_id), quantity: i.quantity, price: i.price })), soldAt: dateStr }); }}
                            role="button" title="Reimprimir ticket"
                            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 9, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--td-text-lo)" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(224,34,26,0.1)"; (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(224,34,26,0.3)"; (e.currentTarget as HTMLDivElement).style.color = "#E0221A"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--td-input-bg)"; (e.currentTarget as HTMLDivElement).style.borderColor = "var(--td-input-border)"; (e.currentTarget as HTMLDivElement).style.color = "var(--td-text-lo)"; }}>
                            <Printer size={13} />
                          </div>
                          {sale.status !== "returned" && !hasCardPayment && (
                            <div onClick={e => { e.stopPropagation(); setCancelTarget({ kind: 'sale', sale }); }}
                              role="button" title="Cancelar venta"
                              style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 9, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--td-text-lo)" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(239,68,68,0.12)"; (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(239,68,68,0.35)"; (e.currentTarget as HTMLDivElement).style.color = "#f87171"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--td-input-bg)"; (e.currentTarget as HTMLDivElement).style.borderColor = "var(--td-input-border)"; (e.currentTarget as HTMLDivElement).style.color = "var(--td-text-lo)"; }}>
                              <XCircle size={15} />
                            </div>
                          )}
                        </button>
                        {isOpen && (
                          <div style={{ borderTop: "1px solid var(--td-card-border)", padding: "12px 14px 14px", background: MUTED }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                              {(sale.items || []).length === 0
                                ? <p style={{ fontSize: 10, color: "var(--td-text-ghost)", textAlign: "center", padding: "8px 0" }}>Sin detalle</p>
                                : (sale.items || []).map((item, idx) => (
                                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: idx < (sale.items || []).length - 1 ? "1px solid var(--td-divider)" : "none" }}>
                                    <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "var(--td-text-hi)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.product?.name || `#${item.product_id}`}</span>
                                    {item.product?.sku && <span style={{ fontSize: 8, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.1em", flexShrink: 0 }}>{item.product.sku}</span>}
                                    <span style={{ fontSize: 10, color: "var(--td-text-ghost)", flexShrink: 0 }}>×{item.quantity}</span>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--td-text-md)", flexShrink: 0, width: 52, textAlign: "right" }}>{fmt(item.price)}</span>
                                    <span style={{ fontSize: 11, fontWeight: 900, color: "var(--td-text-hi)", flexShrink: 0, width: 62, textAlign: "right" }}>{fmt(item.price * item.quantity)}</span>
                                  </div>
                                ))}
                            </div>
                            {/* Detalle de lo cancelado (ADR-016) — snapshot + monto
                                regresado en rojo. Simbólico: el total ya lo descuenta. */}
                            {(sale.cancelled_items ?? []).length > 0 && (
                              <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 10, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                  <p style={{ margin: 0, fontSize: 8, fontWeight: 900, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.12em" }}>Cancelado · se regresó</p>
                                  <p style={{ margin: 0, fontSize: 12, fontWeight: 900, color: "#f87171" }}>−{fmt(sale.cancelled_amount ?? 0)}</p>
                                </div>
                                {(sale.cancelled_items ?? []).map((ci, ciIdx) => (
                                  <div key={ciIdx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0", borderTop: "1px solid rgba(239,68,68,0.12)" }}>
                                    <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: "var(--td-text-md)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ci.name}</span>
                                    <span style={{ fontSize: 9, color: "var(--td-text-ghost)", flexShrink: 0 }}>×{ci.quantity}</span>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: "var(--td-text-ghost)", flexShrink: 0, width: 52, textAlign: "right" }}>{fmt(ci.price)}</span>
                                    <span style={{ fontSize: 10, fontWeight: 900, color: "#f87171", flexShrink: 0, width: 66, textAlign: "right" }}>−{fmt(ci.line_total)}</span>
                                  </div>
                                ))}
                                <p style={{ margin: "4px 0 0", fontSize: 8, color: "var(--td-text-ghost)" }}>
                                  Ya descontado del total y del corte — no se resta dos veces.
                                </p>
                              </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, paddingTop: 8, borderTop: "1px solid var(--td-card-border)" }}>
                              {typeof discount === "number" && discount > 0 && <div style={{ textAlign: "right" }}><p style={{ margin: 0, fontSize: 8, fontWeight: 900, color: "var(--td-text-ghost)", textTransform: "uppercase" }}>Descuento</p><p style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 900, color: "#f59e0b" }}>-{fmt(discount)}</p></div>}
                              {(sale.payments || []).length > 1 && (sale.payments || []).map((pay, pi) => (
                                <div key={pi} style={{ textAlign: "right" }}><p style={{ margin: 0, fontSize: 8, fontWeight: 900, color: "var(--td-text-ghost)", textTransform: "uppercase" }}>{pay.payment_method?.name ?? "Pago"}</p><p style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 900, color: "var(--td-text-hi)" }}>{fmt(pay.amount)}</p></div>
                              ))}
                              <div style={{ textAlign: "right" }}><p style={{ margin: 0, fontSize: 8, fontWeight: 900, color: "var(--td-text-ghost)", textTransform: "uppercase" }}>Total</p><p style={{ margin: "2px 0 0", fontSize: 15, fontWeight: 900, color: "#E0221A" }}>{fmt(sale.total)}</p></div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // ── PREVENTA ORDER (standalone o parte de un par mixto) ─────────
                  const order = entry.data;
                  const paidAmt = order.paid_amount ?? 0;
                  const balance = order.balance ?? 0;
                  const orderItems = order.items ?? [];

                  // Check if this presale is paired with a regular sale
                  const pair = mixedPairs.find(p => p.preSaleOrderId === order.id);
                  const pairedSale = pair
                    ? (historialEntries.find(e => e.type === 'sale' && e.data.id === pair.saleId)?.data as SaleDetail | undefined)
                    : undefined;
                  const isMixed = pairedSale != null;
                  const regularMethod = pairedSale?.payments?.[0]?.payment_method?.name ?? "Efectivo";
                  const regularTotal = pairedSale?.total ?? 0;
                  const regularItems = pairedSale?.items ?? [];
                  const grandTotal = paidAmt + regularTotal;

                  return (
                    <div key={entryKey} style={{ background: isMixed ? "rgba(139,92,246,0.04)" : "rgba(245,158,11,0.04)", border: `1px solid ${isOpen ? (isMixed ? "rgba(139,92,246,0.45)" : "rgba(245,158,11,0.45)") : (isMixed ? "rgba(139,92,246,0.25)" : "rgba(245,158,11,0.2)")}`, borderRadius: 16, overflow: "hidden" }}>
                      <button onClick={() => setExpandedEntryKey(isOpen ? null : entryKey)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                        <ChevronRight size={12} style={{ flexShrink: 0, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", color: isOpen ? (isMixed ? "#a78bfa" : "#f59e0b") : (isMixed ? "rgba(139,92,246,0.5)" : "rgba(245,158,11,0.5)") }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 8, fontWeight: 900, color: isMixed ? "#a78bfa" : "#f59e0b", background: isMixed ? "rgba(139,92,246,0.12)" : "rgba(245,158,11,0.12)", border: `1px solid ${isMixed ? "rgba(139,92,246,0.3)" : "rgba(245,158,11,0.3)"}`, borderRadius: 999, padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.1em", flexShrink: 0 }}>
                              {isMixed ? "Mixto" : "Preventa"}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 900, color: isMixed ? "#a78bfa" : "#f59e0b", fontFamily: "monospace" }}>{order.code}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--td-text-hi)" }}>{new Date(order.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</span>
                            {order.customer?.name && <span style={{ fontSize: 10, color: "var(--td-text-ghost)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.customer.name}</span>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                            <span style={{ fontSize: 9, color: "var(--td-text-ghost)" }}>{orderItems.length} art. preventa{isMixed ? ` + ${regularItems.length} art. venta` : ""}</span>
                            {/* Status delivered (preventa 100% liquidada) resalta en verde */}
                            {order.status === "cancelled" ? (
                              <span style={{ fontSize: 9, fontWeight: 900, color: "#f87171", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.30)", borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cancelada</span>
                            ) : order.status === "delivered" ? (
                              <span style={{ fontSize: 9, fontWeight: 900, color: "#34d399", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Liquidada · {fmt(paidAmt)} cobrado</span>
                            ) : (
                              <>
                                {paidAmt > 0 && <span style={{ fontSize: 9, color: "#34d399", fontWeight: 700 }}>Anticipo {fmt(paidAmt)}</span>}
                                {paidAmt === 0 && !isMixed && <span style={{ fontSize: 9, color: "var(--td-text-ghost)", fontStyle: "italic" }}>Sin anticipo</span>}
                                {balance > 0 && !isMixed && <span style={{ fontSize: 9, color: "#f59e0b", fontWeight: 700 }}>Pendiente {fmt(balance)}</span>}
                              </>
                            )}
                            {isMixed && regularTotal > 0 && <span style={{ fontSize: 9, color: "#E0221A", fontWeight: 700 }}>Venta {fmt(regularTotal)}</span>}
                          </div>
                        </div>
                        {/* Monto grande = lo cobrado HOY, no el valor total de la preventa.
                            Para liquidada/anticipo: paid_amount (lo que entró a caja hoy).
                            Para mixto: anticipo de preventa + venta regular = grandTotal. */}
                        <span style={{ fontSize: 14, fontWeight: 900, color: order.status === "cancelled" ? "#f87171" : order.status === "delivered" ? "#34d399" : (isMixed ? "#a78bfa" : "#f59e0b"), flexShrink: 0, textDecoration: order.status === "cancelled" ? "line-through" : "none", opacity: order.status === "cancelled" ? 0.6 : 1 }} title={`Valor total de la preventa: ${fmt(order.total ?? 0)}`}>
                          {fmt(isMixed ? grandTotal : paidAmt)}
                        </span>
                        <div
                          onClick={e => {
                            e.stopPropagation();
                            doPrintTicket({
                              total: isMixed ? grandTotal : paidAmt,
                              paymentMethod: isMixed ? regularMethod : (order.payments?.[0]?.payment_method?.name ?? "Efectivo"),
                              ...(order.customer?.name ? { customerName: order.customer.name } : {}),
                              ...(order.customer?.phone ? { customerPhone: order.customer.phone } : {}),
                              ...(order.customer?.email ? { customerEmail: order.customer.email } : {}),
                              items: isMixed ? regularItems.map(i => ({ name: i.product?.name || String(i.product_id), quantity: i.quantity, price: i.price })) : [],
                              soldAt: order.created_at,
                              preSaleCode: order.code,
                              preSaleItems: orderItems.map(i => ({ name: i.catalog?.product_name ?? `Artículo #${i.id}`, quantity: i.quantity, unitPrice: i.unit_price })),
                              preSaleAnticipo: paidAmt,
                              // delivered → el ticket muestra "SALDO $0 ✓ LIQUIDADO"
                              preSaleIsLiquidation: order.status === "delivered",
                            });
                          }}
                          role="button" title="Imprimir ticket"
                          style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 9, background: isMixed ? "rgba(139,92,246,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${isMixed ? "rgba(139,92,246,0.2)" : "rgba(245,158,11,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: isMixed ? "rgba(139,92,246,0.6)" : "rgba(245,158,11,0.6)" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = isMixed ? "rgba(139,92,246,0.15)" : "rgba(245,158,11,0.15)"; (e.currentTarget as HTMLDivElement).style.color = isMixed ? "#a78bfa" : "#f59e0b"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isMixed ? "rgba(139,92,246,0.08)" : "rgba(245,158,11,0.08)"; (e.currentTarget as HTMLDivElement).style.color = isMixed ? "rgba(139,92,246,0.6)" : "rgba(245,158,11,0.6)"; }}>
                          <Printer size={13} />
                        </div>
                        {/* Liquidada (delivered) ya NO se puede cancelar: el botón
                            solo aparece para folios con anticipo pendiente
                            (Joel 2026-06-13). */}
                        {order.status !== "cancelled" && order.status !== "delivered" && (
                          <div onClick={e => { e.stopPropagation(); setCancelTarget({ kind: 'presale', order }); }}
                            role="button" title="Cancelar folio"
                            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 9, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(239,68,68,0.7)" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(239,68,68,0.18)"; (e.currentTarget as HTMLDivElement).style.color = "#f87171"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(239,68,68,0.08)"; (e.currentTarget as HTMLDivElement).style.color = "rgba(239,68,68,0.7)"; }}>
                            <XCircle size={15} />
                          </div>
                        )}
                      </button>
                      {isOpen && (
                        <div style={{ borderTop: `1px solid ${isMixed ? "rgba(139,92,246,0.15)" : "rgba(245,158,11,0.15)"}`, padding: "12px 14px 14px", background: MUTED }}>

                          {/* Preventa items section. El badge muestra lo COBRADO
                              (anticipo o liquidación) — no el precio total del
                              folio, que confundía (pagó $100 de anticipo, no $1,100). */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 6px", flexWrap: "wrap" }}>
                            <p style={{ margin: 0, fontSize: 8, fontWeight: 900, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.12em" }}>★ Preventa · {order.code}</p>
                            <span style={{ padding: "1px 8px", borderRadius: 8, fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", background: order.status === "delivered" ? "rgba(52,211,153,0.15)" : "rgba(245,158,11,0.15)", color: order.status === "delivered" ? "#34d399" : "#f59e0b", border: `1px solid ${order.status === "delivered" ? "rgba(52,211,153,0.3)" : "rgba(245,158,11,0.3)"}` }}>
                              {order.status === "delivered" ? "Liquidación" : "Anticipo"} {fmt(paidAmt)}
                            </span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                            {orderItems.length === 0
                              ? <p style={{ fontSize: 10, color: "var(--td-text-ghost)", textAlign: "center", padding: "8px 0" }}>Sin artículos</p>
                              : (() => {
                                  // Repartimos lo COBRADO (anticipo/liquidación = paidAmt) entre
                                  // los items proporcional a su precio, para que la columna de
                                  // montos sume el TOTAL COBRADO (ej. 100 preventa + 90 + 130 + 130 = 450).
                                  // El precio total del folio queda como referencia chica.
                                  const itemsSubtotal = orderItems.reduce((s, i) => s + (i.subtotal ?? 0), 0);
                                  return orderItems.map((item, idx) => {
                                    const itemPaid = itemsSubtotal > 0
                                      ? paidAmt * ((item.subtotal ?? 0) / itemsSubtotal)
                                      : (idx === 0 ? paidAmt : 0);
                                    return (
                                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: idx < orderItems.length - 1 ? "1px solid var(--td-divider)" : "none" }}>
                                        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "var(--td-text-hi)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.catalog?.product_name ?? `Artículo #${item.id}`}</span>
                                        <span style={{ fontSize: 8, color: item.status === "delivered" ? "#34d399" : "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>{item.status === "delivered" ? "Entregado" : "Pendiente"}</span>
                                        <span style={{ fontSize: 10, color: "var(--td-text-ghost)", flexShrink: 0 }}>×{item.quantity}</span>
                                        {/* Precio total del folio = referencia chica (NO es lo cobrado). */}
                                        <span style={{ fontSize: 9, fontWeight: 600, color: "var(--td-text-ghost)", flexShrink: 0, width: 76, textAlign: "right" }} title="Precio del producto — no es lo cobrado">precio {fmt(item.subtotal ?? 0)}</span>
                                        {/* Lo COBRADO de esta preventa — suma con los productos al total. */}
                                        <span style={{ fontSize: 11, fontWeight: 900, color: "#34d399", flexShrink: 0, width: 62, textAlign: "right" }} title="Lo cobrado (anticipo/liquidación)">{fmt(itemPaid)}</span>
                                      </div>
                                    );
                                  });
                                })()}
                          </div>

                          {/* Regular sale items section (only for mixed) */}
                          {isMixed && regularItems.length > 0 && (
                            <>
                              <p style={{ margin: "8px 0 6px", fontSize: 8, fontWeight: 900, color: "#E0221A", textTransform: "uppercase", letterSpacing: "0.12em" }}>Productos vendidos</p>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                                {regularItems.map((item, idx) => (
                                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: idx < regularItems.length - 1 ? "1px solid var(--td-divider)" : "none" }}>
                                    <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "var(--td-text-hi)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.product?.name || `#${item.product_id}`}</span>
                                    <span style={{ fontSize: 10, color: "var(--td-text-ghost)", flexShrink: 0 }}>×{item.quantity}</span>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--td-text-md)", flexShrink: 0, width: 52, textAlign: "right" }}>{fmt(item.price)}</span>
                                    <span style={{ fontSize: 11, fontWeight: 900, color: "var(--td-text-hi)", flexShrink: 0, width: 62, textAlign: "right" }}>{fmt(item.price * item.quantity)}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}

                          {/* Totals */}
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, paddingTop: 8, borderTop: `1px solid ${isMixed ? "rgba(139,92,246,0.15)" : "rgba(245,158,11,0.15)"}` }}>
                            {paidAmt > 0 && <div style={{ textAlign: "right" }}><p style={{ margin: 0, fontSize: 8, fontWeight: 900, color: "var(--td-text-ghost)", textTransform: "uppercase" }}>{order.status === "delivered" ? "Liquidación" : "Anticipo preventa"}</p><p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 900, color: "#34d399" }}>{fmt(paidAmt)}</p></div>}
                            {isMixed && regularTotal > 0 && <div style={{ textAlign: "right" }}><p style={{ margin: 0, fontSize: 8, fontWeight: 900, color: "var(--td-text-ghost)", textTransform: "uppercase" }}>Productos</p><p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 900, color: "#E0221A" }}>{fmt(regularTotal)}</p></div>}
                            {!isMixed && balance > 0 && <div style={{ textAlign: "right" }}><p style={{ margin: 0, fontSize: 8, fontWeight: 900, color: "var(--td-text-ghost)", textTransform: "uppercase" }}>Saldo</p><p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 900, color: "#f59e0b" }}>{fmt(balance)}</p></div>}
                            <div style={{ textAlign: "right" }}><p style={{ margin: 0, fontSize: 8, fontWeight: 900, color: "var(--td-text-ghost)", textTransform: "uppercase" }}>{isMixed ? "Total cobrado" : "Total preventa"}</p><p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 900, color: isMixed ? "#a78bfa" : "var(--td-text-hi)" }}>{fmt(isMixed ? grandTotal : (order.total ?? 0))}</p></div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                  });
                })()
              )}
            </div>

            </div>
            </div>
        </div>
      )}

      {/* ══════════════ ATAJOS FLOTANTES: OTRAS VENTAS ABIERTAS ══════════════ */}
      {/* Aparece solo si hay >1 mesa. Card flotante con filas tipo pill
          (icono + nombre + items). Antes vivía abajo-derecha "arribita del
          footer"; con el nuevo sidebar derecho de cobro se movió a abajo-IZQUIERDA
          para no traslaparse con el panel de cobro. Usa variables --td-* para
          adaptarse a light/dark theme. Las filas con items siempre rojas
          (mantienen contraste en ambos themes). */}
      {mesas.length > 1 && (
        <>
          <style>{`
            @keyframes td-shortcut-pulse {
              0%, 100% { box-shadow: 0 0 0 rgba(224,34,26,0); }
              50%      { box-shadow: 0 0 18px rgba(224,34,26,0.55); }
            }
          `}</style>
          <div
            style={{
              position: "fixed",
              bottom: 20,
              left: 20,
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minWidth: 210,
              background: "var(--td-popup-bg)",
              backdropFilter: "blur(14px)",
              border: "1px solid var(--td-popup-border)",
              borderRadius: 18,
              padding: 10,
              boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
            }}
          >
            {/* Header con label + contador de activas */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "2px 6px 6px",
                borderBottom: "1px solid var(--td-panel-border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ShoppingCart size={11} style={{ color: "var(--td-red)" }} />
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 900,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--td-red)",
                  }}
                >
                  Otras ventas
                </span>
              </div>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  color: "var(--td-text-ghost)",
                }}
              >
                {mesas.filter(m => m.id !== activeMesaId && m.items.length > 0).length}/{mesas.length - 1}
              </span>
            </div>

            {mesas
              .filter(m => m.id !== activeMesaId)
              .map(m => {
                const itemCount = m.items.reduce((s, i) => s + i.quantity, 0);
                const subtotal = m.items.reduce((s, i) => s + i.price * i.quantity, 0);
                const hasItems = itemCount > 0;
                const isPrincipal = m.name === "Caja Principal";
                const Icon = isPrincipal ? Crown : ShoppingCart;
                return (
                  <div
                    key={m.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveMesaId(m.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveMesaId(m.id); } }}
                    title={`Ir a ${m.name}${hasItems ? ` · ${itemCount} item${itemCount === 1 ? "" : "s"} · $${subtotal.toFixed(0)}` : " · vacía"}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      // Activas → rojo sólido (mismo contraste en light/dark).
                      // Vacías → fondo y bordes del theme para integrarse.
                      background: hasItems
                        ? "linear-gradient(135deg, #BB1100 0%, #FF3322 100%)"
                        : "var(--td-input-bg)",
                      border: hasItems
                        ? "1px solid rgba(255,120,80,0.5)"
                        : "1px solid var(--td-input-border)",
                      color: hasItems ? "#fff" : "var(--td-text-lo)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "transform 0.12s ease, background 0.15s",
                      animation: hasItems ? "td-shortcut-pulse 2.6s ease-in-out infinite" : undefined,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateX(-3px)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateX(0)"; }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        background: hasItems ? "rgba(255,255,255,0.20)" : "var(--td-panel-bg)",
                        border: hasItems ? "none" : "1px solid var(--td-panel-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        color: hasItems ? "#fff" : "var(--td-text-ghost)",
                      }}
                    >
                      <Icon size={15} strokeWidth={2.5} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, lineHeight: 1.15 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.04em" }}>
                        {m.name}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          opacity: hasItems ? 0.85 : 1,
                          color: hasItems ? "rgba(255,255,255,0.85)" : "var(--td-text-ghost)",
                        }}
                      >
                        {hasItems ? `${itemCount} item${itemCount === 1 ? "" : "s"} · $${subtotal.toFixed(0)}` : "Vacía"}
                      </span>
                    </div>
                    {hasItems ? (
                      <ChevronRight size={14} style={{ opacity: 0.9, color: hasItems ? "#fff" : "var(--td-text-ghost)" }} />
                    ) : (
                      <Circle size={6} fill="currentColor" style={{ opacity: 0.4, color: "var(--td-text-ghost)" }} />
                    )}
                    {/* Cancelar venta — solo en Venta 2..5, nunca en Caja Principal.
                        Si tiene items, pide confirmación para evitar borrar venta
                        en curso por accidente. */}
                    {!isPrincipal && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasItems) {
                            const ok = window.confirm(
                              `${m.name} tiene ${itemCount} item${itemCount === 1 ? "" : "s"} ($${subtotal.toFixed(0)}).\n\n¿Cancelar la venta? Los productos se perderán.`
                            );
                            if (!ok) return;
                          }
                          removeMesa(m.id);
                        }}
                        title={`Cancelar ${m.name}`}
                        aria-label={`Cancelar ${m.name}`}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: hasItems ? "rgba(0,0,0,0.18)" : "transparent",
                          border: hasItems ? "1px solid rgba(255,255,255,0.18)" : "1px solid var(--td-panel-border)",
                          color: hasItems ? "rgba(255,255,255,0.85)" : "var(--td-text-ghost)",
                          cursor: "pointer",
                          flexShrink: 0,
                          transition: "background 0.12s, color 0.12s",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "rgba(224,34,26,0.9)";
                          (e.currentTarget as HTMLButtonElement).style.color = "#fff";
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,80,50,0.6)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = hasItems ? "rgba(0,0,0,0.18)" : "transparent";
                          (e.currentTarget as HTMLButtonElement).style.color = hasItems ? "rgba(255,255,255,0.85)" : "var(--td-text-ghost)";
                          (e.currentTarget as HTMLButtonElement).style.borderColor = hasItems ? "rgba(255,255,255,0.18)" : "var(--td-panel-border)";
                        }}
                      >
                        <Trash2 size={12} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
