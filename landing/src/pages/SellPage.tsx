import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, ShoppingBag, X, Plus, Minus, Check, SlidersHorizontal,
  ScanLine, Zap, Loader2, Settings2, Smartphone,
  AlertTriangle, ArrowLeftRight, Maximize2, LayoutGrid,
  Tag, ChevronDown, ChevronUp, ChevronRight, ArrowLeft,
  Users, UserPlus, User, Phone, AlertCircle,
  TriangleAlert, PackageX, Bookmark, Calendar, PackageCheck, ClipboardList, Banknote,
  Truck, CheckCircle2, Printer, History, Receipt,
} from "lucide-react";
import { ImageWithFallback } from "@/components/figma/ImageWithFallback";
import { ProductCatalogModal } from "@/components/ProductCatalogModal";
import { PreSaleDifusionPanel } from "@/components/presales/PreSaleDifusionPanel";
const tadaimaLogo = null // TODO: replace with real logo asset
import { toast } from "sonner";
import { getProducts, getDraft, createDraft, addDraftItem, updateDraftItem, removeDraftItem, createSale, getPrice, getActiveSession, openSession, closeSession, getCashRegisters, createLayaway, getPaymentMethods, getCustomers, createCustomer, searchExternalCustomers, getSystemSettings, getInventory, getPreSaleCatalogs, getPreSaleOrders, getPreSaleOrder, createPreSaleOrder, addPreSaleOrderPayment, updatePreSaleOrderStatus, markPreSaleOrderItemDelivered, getSales, getTerminals, storageUrl } from "@tadaima/api";
import type { CashSession, CashRegisterInfo, PaymentMethod as ApiPaymentMethod, PreSaleCatalog, PreSaleOrder, PreSaleOrderItem, SaleDetail, Terminal, ExternalCardLookup } from "@tadaima/api";
type HistorialEntry = { type: 'sale'; data: SaleDetail } | { type: 'presale'; data: PreSaleOrder };
import { useCartDraftStore } from "@/stores/cartDraftStore";
import { useActiveStore } from "@/contexts/StoreContext";
import { useAuth } from "@tadaima/auth";
import { motion as Motion, AnimatePresence } from "motion/react";

// API_BASE removed — using @tadaima/api (Laravel backend)

// ─── Types ────────────────────────────────────────────────────────────────────
type PriceLevel = "a" | "b" | "c" | "d" | "e";
type PaymentMethod = "Efectivo" | "Dólares" | "Tarjeta" | "Transferencia";

interface Product {
  id: string;
  name: string;
  sku: string;
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
}

interface Customer {
  id: string;
  name: string;
  phone?: string;
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
    { level: "a", label: "Precio A", price: p.price_a || 0 },
  ];
  if (p.price_b && p.price_b > 0) levels.push({ level: "b", label: "Precio B", price: p.price_b });
  if (p.price_c && p.price_c > 0) levels.push({ level: "c", label: "Precio C", price: p.price_c });
  if (p.price_d && p.price_d > 0) levels.push({ level: "d", label: "Precio D", price: p.price_d });
  if (p.price_e && p.price_e > 0) levels.push({ level: "e", label: "Precio E", price: p.price_e });
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
const makeMesa = (n?: number): Mesa => ({
  id: `mesa-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: `Caja ${n !== undefined ? n : _mc++}`,
  items: [],
  discount: 0,
  paymentMethod: "Efectivo",
  isPreventa: false,
  depositAmount: 0,
  absorbCommission: true, // tienda siempre absorbe — nunca se cobra al cliente
});

// ─── Design tokens ─────────────────────────────────────────────────────────────
const BG     = "var(--td-page-bg)";
const PANEL  = "var(--td-panel-bg)";
const BORDER = "1px solid var(--td-panel-border)";
const RED    = "var(--td-red)";
const RED_G  = "var(--td-red-g)";
const CARD   = "var(--td-card-bg)";
const CARD_B = "1px solid var(--td-card-border)";

const pill = (active: boolean) =>
  active
    ? { background: RED_G, color: "#fff", border: "1px solid var(--td-red-brd)" }
    : { background: "var(--td-input-bg)", color: "var(--td-text-lo)", border: "1px solid var(--td-input-border)" };

// ─── Component ────────────────────────────────────────────────────────────────
export function SellPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.roles?.includes("admin") ?? false;
  const { activeStore, stores, setActiveStore, isLoading: storeLoading } = useActiveStore();

  const draftStore = useCartDraftStore();
  // Hidratar mesas desde snapshot persistido (sobrevive navegación entre páginas).
  // Si el snapshot está vacío/corrupto, arrancar con una mesa nueva.
  const initialMesas = useRef<Mesa[]>(
    (() => {
      const snap = draftStore.mesasSnapshot;
      if (Array.isArray(snap) && snap.length > 0) {
        return snap as Mesa[];
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

  const [cashSession, setCashSession]       = useState<CashSession | null>(null);
  const [cashRegisters, setCashRegisters]   = useState<CashRegisterInfo[]>([]);
  const [showOpenCashModal, setShowOpenCashModal] = useState(false);
  const [openCashRegisterId, setOpenCashRegisterId] = useState<number | "">("");
  const [openCashAmount, setOpenCashAmount] = useState("");
  const [openingCash, setOpeningCash]       = useState(false);
  const [showCloseCashModal, setShowCloseCashModal] = useState(false);
  const [closeCashAmount, setCloseCashAmount] = useState("");
  const [closingCashLoading, setClosingCashLoading] = useState(false);
  const [products, setProducts]       = useState<Product[]>([]);
  const [customers, setCustomers]     = useState<Customer[]>([]);
  const [terminals, setTerminals]     = useState<Terminal[]>([]);
  const [loading, setLoading]         = useState(true);
  const [mesas, setMesas]             = useState<Mesa[]>(initialMesas.current);
  const [activeMesaId, setActiveMesaId] = useState(initialActiveId.current);

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
  const [showCatalog, setShowCatalog] = useState(false);
  const [selectedCat, setSelectedCat] = useState("Todo");
  const [showDiscount, setShowDiscount] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustDrop, setShowCustDrop]     = useState(false);
  const [requireCustomerFlash, setRequireCustomerFlash] = useState(false);
  const [isRegisteringCustomer, setIsRegisteringCustomer] = useState(false);
  const [extSearchResults, setExtSearchResults] = useState<ExternalCardLookup[]>([]);
  const [isWide, setIsWide]         = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cashReceived, setCashReceived] = useState("");

  // ── Ticket / Historial ────────────────────────────────────────────────
  interface CompletedSaleData {
    id?: number; total: number; paymentMethod: string; customerName?: string;
    items: Array<{ name: string; quantity: number; price: number }>;
    soldAt: string;
    // contexto del punto de venta
    storeName?: string;
    cashierName?: string;
    amountReceived?: number;  // efectivo / dólares ingresado por el cajero
    change?: number;          // cambio devuelto (puede ser en dólares si PM=Dólares)
    // preventa section (mixed ticket)
    preSaleCode?: string;
    preSaleItems?: Array<{ name: string; quantity: number; unitPrice: number }>;
    preSaleAnticipo?: number;
  }
  const PRINT_PREF_KEY = "tadaima_print_pref"; // 'auto' | 'ask' | 'never'
  const [lastCompletedSale, setLastCompletedSale] = useState<CompletedSaleData | null>(null);
  const [showPrintModal, setShowPrintModal]         = useState(false);
  const [printNeverAsk, setPrintNeverAsk]           = useState(false);
  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [historialEntries, setHistorialEntries]     = useState<HistorialEntry[]>([]);
  const [historialLoading, setHistorialLoading]     = useState(false);
  const [expandedEntryKey, setExpandedEntryKey]     = useState<string | null>(null);
  // Tracks mixed-checkout pairs: presale order + regular sale created in the same transaction
  const [mixedPairs, setMixedPairs] = useState<Array<{ preSaleOrderId: number; saleId: number }>>([]);

  // ── Modal unificado de Preventas ──
  const [showPreSalesModal, setShowPreSalesModal] = useState(false);
  const [preSalesTab, setPreSalesTab] = useState<'venta' | 'liquidar' | 'completadas' | 'vencidas' | 'difusion'>('venta');
  const [preSaleCatalogs, setPreSaleCatalogs] = useState<PreSaleCatalog[]>([]);
  const [preSaleOrdersPending, setPreSaleOrdersPending] = useState<PreSaleOrder[]>([]);
  const [preSaleOrdersDelivered, setPreSaleOrdersDelivered] = useState<PreSaleOrder[]>([]);
  const [preSaleOrdersExpired, setPreSaleOrdersExpired] = useState<PreSaleOrder[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

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
  const [paymentMethods, setPaymentMethods] = useState<ApiPaymentMethod[]>([]);

  const tcRef              = useRef<HTMLDivElement>(null);
  const custRef            = useRef<HTMLDivElement>(null);
  const customerSearchRef  = useRef<HTMLInputElement>(null);
  const prodInputRef       = useRef<HTMLInputElement>(null);
  const cashInputRef       = useRef<HTMLInputElement>(null);

  // Load active cash register session; if none, load available registers
  // Load global TC from system settings (reference only, cashier can override per session)
  useEffect(() => {
    getSystemSettings()
      .then(s => {
        const rate = parseFloat(s["exchange_rate"] ?? "");
        if (!isNaN(rate) && rate > 0) { setTc(rate); setTcDraft(rate.toString()); }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    getActiveSession()
      .then(session => {
        setCashSession(session);
        if (!session) {
          getCashRegisters(activeStore?.id)
            .then(regs => {
              setCashRegisters(regs);
              if (regs[0]) setOpenCashRegisterId(regs[0].id);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [activeStore?.id]);

  // Auto-select store from active session when admin navigates to Caja with
  // an already-open session (stores and session may load in any order).
  useEffect(() => {
    if (cashSession?.register?.store_id && !activeStore && stores.length > 0) {
      const match = stores.find(s => s.id === cashSession.register!.store_id);
      if (match) setActiveStore(match);
    }
  }, [cashSession, stores, activeStore]);

  // Load payment methods for the layaway-from-POS modal
  useEffect(() => {
    getPaymentMethods({ active: true })
      .then(pm => setPaymentMethods(pm))
      .catch(() => {});
  }, []);

  // Load terminals — refreshes when the active store changes
  useEffect(() => {
    if (!activeStore?.id) { setTerminals([]); return; }
    getTerminals({ store_id: activeStore.id, active: true })
      .then(setTerminals)
      .catch(() => toast.error("Error al cargar terminales"));
  }, [activeStore?.id]);

  useEffect(() => {
    getProducts({ active: true })
      .then(paginated => {
        // Adapt API Product → local Product shape used by SellPage UI
        const adapted = paginated.data.map(p => {
          const firstImage = p.images?.[0];
          const image = firstImage?.url ?? (firstImage?.image_path ? storageUrl(firstImage.image_path) : "");
          return {
            id: String(p.id),
            name: p.name,
            sku: p.sku,
            category: String(p.category_id ?? ""),
            image,
            price_a: getPrice(p, 1),
            price_b: getPrice(p, 2) > 0 ? getPrice(p, 2) : undefined,
            price_c: getPrice(p, 3) > 0 ? getPrice(p, 3) : undefined,
            price_d: getPrice(p, 4) > 0 ? getPrice(p, 4) : undefined,
            price_e: getPrice(p, 5) > 0 ? getPrice(p, 5) : undefined,
            stock: typeof p.stock_total === "number" ? p.stock_total : undefined,
            active: p.active,
          };
        });
        setProducts(adapted);
      })
      .catch((err: unknown) => {
        const msg = err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message) : "Error al cargar productos";
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  }, []);

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
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const activeMesa = useMemo(() => mesas.find(m => m.id === activeMesaId) ?? mesas[0], [mesas, activeMesaId]);

  // Clear cash input when cart is emptied
  useEffect(() => {
    if (activeMesa.items.length === 0) setCashReceived("");
  }, [activeMesa.items.length]);

  // Sincronizar el campo de búsqueda de cliente con la caja activa al cambiar de tab
  useEffect(() => {
    setCustomerSearch(activeMesa.customerName || "");
    setShowCustDrop(false);
  }, [activeMesaId]);

  // Live customer search with 300ms debounce — falls back to Supabase if no POS match
  useEffect(() => {
    setExtSearchResults([]);
    if (!customerSearch.trim()) {
      setCustomers([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await getCustomers({ search: customerSearch, per_page: 10 });
        const list = Array.isArray(res) ? res : (res as { data: any[] }).data ?? [];
        if (list.length > 0) {
          setCustomers(list.map((c: any) => ({
            id: String(c.id),
            name: c.name,
            phone: c.phone ?? undefined,
            points: c.points,
            external_member_id: c.external_member_id ?? undefined,
          })));
          return;
        }
        // No POS match — buscar en Supabase por nombre/ID/correo
        if (customerSearch.trim().length < 2) return;
        const exts = await searchExternalCustomers(customerSearch.trim());
        setExtSearchResults(exts);
      } catch {
        // silent
      }
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

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

  const updMesa = useCallback((id: string, fn: (m: Mesa) => Mesa) =>
    setMesas(prev => prev.map(m => m.id === id ? fn(m) : m)), []);

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

  // ─── Stock compartido entre cajas (client-side) ─────────────────────────────
  // Cuenta unidades del producto reservadas en otras cajas (excluye catálogos de
  // preventa, que no descuentan stock real porque aún no se ha hecho el pedido).
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

  const addToCart = async (product: Product, priceLevel: PriceLevel = "a", quantity: number = 1) => {
    // Capture pre-update quantity BEFORE updMesa — used for deterministic PATCH qty (HIGH #3)
    const mesaId = activeMesa.id;
    const preItem = activeMesa.items.find(i => i.product.id === product.id);
    const newQty = (preItem?.quantity ?? 0) + quantity;

    // Stock cross-caja: si otra caja ya reservó parte del stock, no permitir pasarse.
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

    // Unit price for deposit auto-fill
    const unitPrice =
      priceLevel === "b" && product.price_b ? product.price_b :
      priceLevel === "c" && product.price_c ? product.price_c :
      priceLevel === "d" && product.price_d ? product.price_d :
      priceLevel === "e" && product.price_e ? product.price_e :
      product.price_a || 0;

    // 1. Optimistic UI update
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
                // In preventa: grow deposit proportionally with the added units
                ...(m.isPreventa ? { depositAmount: (i.depositAmount ?? 0) + unitPrice * quantity } : {}),
              }
            : i)
        : [...m.items, {
            product, quantity, priceLevel,
            // In preventa: deposit = full price × qty (mandatory initial payment)
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

    // Resolve unit price for the chosen level
    const resolvePrice = (p: Product, lv: PriceLevel) =>
      lv === "b" && p.price_b ? p.price_b :
      lv === "c" && p.price_c ? p.price_c :
      lv === "d" && p.price_d ? p.price_d :
      lv === "e" && p.price_e ? p.price_e :
      p.price_a || 0;
    const resolvedPrice = resolvePrice(product, priceLevel);
    // When updating an existing item keep its original price level
    const existingLevel: PriceLevel = preItem?.priceLevel ?? priceLevel;
    const existingPrice = resolvePrice(product, existingLevel);

    // 2. Sync with backend: create draft on first item, then add/update item
    try {
      let draftId = draftStore.getDraftId(mesaId);

      if (draftId === undefined) {
        // Guard against concurrent draft creation for the same mesa
        if (!pendingDraftRef.current[mesaId]) {
          const storeId = activeStore?.id ?? 0;
          pendingDraftRef.current[mesaId] = createDraft(storeId, cashSession?.id)
            .then(d => {
              draftStore.setDraftId(mesaId, d.id);
              delete pendingDraftRef.current[mesaId];
              return d.id;
            })
            .catch((err: unknown) => {
              // Allow retry on next addToCart call — without this the mesa
              // gets stuck: the rejected promise stays truthy in the ref and
              // every subsequent await re-throws the same error.
              delete pendingDraftRef.current[mesaId];
              return Promise.reject(err);
            });
        }
        draftId = await pendingDraftRef.current[mesaId];
      }

      // Check if this product already has a draft item on the server
      const existingItemId = draftStore.getDraftItemId(mesaId, product.id);
      const pendingKey = `${mesaId}:${product.id}`;
      if (existingItemId !== undefined) {
        // Use pre-captured newQty — deterministic, not read from stale mesas[] snapshot
        const updated = await updateDraftItem(draftId, existingItemId, {
          quantity: newQty,
          price: existingPrice,
          price_level: existingLevel,
        });
        draftStore.setDraftItemId(mesaId, product.id, updated.id);
      } else {
        // Registramos el promise en el ref para que changeQty (botón +/−) pueda
        // esperar a que termine antes de leer el itemId. Sin esto, clics rápidos
        // disparaban el toast "Sincronizando…" porque el itemId aún no existía.
        const addPromise = addDraftItem(draftId, {
          product_id: parseInt(product.id, 10),
          quantity,
          price: resolvedPrice,
          price_level: priceLevel,
        }).then(item => {
          draftStore.setDraftItemId(mesaId, product.id, item.id);
          return item.id;
        });
        pendingItemAddRef.current[pendingKey] = addPromise;
        try {
          await addPromise;
        } finally {
          if (pendingItemAddRef.current[pendingKey] === addPromise) {
            delete pendingItemAddRef.current[pendingKey];
          }
        }
      }
      // Limpia syncError si el item ya está sincronizado correctamente
      updMesa(mesaId, m => ({
        ...m,
        items: m.items.map(i =>
          i.product.id === product.id && i.syncError ? { ...i, syncError: false } : i
        ),
      }));
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message) : "Error al sincronizar carrito";
      // Marca el item con syncError para que checkout pueda bloquear si quedan
      // items desincronizados. Evita el bug de "pagos no coinciden con el total".
      updMesa(mesaId, m => ({
        ...m,
        items: m.items.map(i =>
          i.product.id === product.id ? { ...i, syncError: true } : i
        ),
      }));
      toast.error(`⚠️ ${msg} — el producto no se sincronizó. Elimínalo y vuelve a agregarlo.`, {
        duration: 8000,
        style: { background: '#2d0a00', color: '#fff', border: '1px solid rgba(224,34,26,0.4)', borderRadius: '16px' },
      });
    }
  };

  const removeFromCart = async (pid: string) => {
    const mesaId = activeMesa.id;
    const draftId = draftStore.getDraftId(mesaId);
    const itemId  = draftStore.getDraftItemId(mesaId, pid);

    // Optimistic removal
    updMesa(mesaId, m => ({ ...m, items: m.items.filter(i => i.product.id !== pid) }));

    // Item nunca llegó al server draft (catálogo de preventa, folio cargado, syncError previo,
    // o draft expirado). La eliminación local es suficiente — no hay nada que sincronizar.
    if (draftId === undefined || itemId === undefined) {
      return;
    }

    try {
      await removeDraftItem(draftId, itemId);
      draftStore.clearDraftItem(mesaId, pid);
    } catch (err: unknown) {
      // Rollback: restore the item to the cart
      const removedItem = activeMesa.items.find(i => i.product.id === pid);
      if (removedItem) updMesa(mesaId, m => ({ ...m, items: [...m.items, removedItem] }));
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message) : "Error al eliminar del carrito";
      toast.error(msg);
    }
  };

  const changeQty = async (pid: string, d: number) => {
    const mesaId = activeMesa.id;

    // CRITICAL #1: read current item BEFORE updMesa — setState updaters run asynchronously,
    // so any variable mutated inside the updater is still at its initial value after the call.
    const currentItem = activeMesa.items.find(i => i.product.id === pid);
    if (!currentItem) return;
    const oldQty = currentItem.quantity;
    const oldDeposit = currentItem.depositAmount;
    const newQty = oldQty + d;

    // Validate preventa limit before optimistic update (only if stock data is available)
    if (activeMesa.isPreventa) {
      const maxStock = currentItem.product.stock_details?.preventa;
      if (maxStock !== undefined && newQty > maxStock) {
        toast.error(`Límite de preventa: ${maxStock} unidad(es)`);
        return;
      }
    }

    // Validate per-item unit limit (catálogo.preorder_limit) — solo aplica al subir cantidad
    if (d > 0 && currentItem.unitLimit !== undefined && newQty > currentItem.unitLimit) {
      toast.error(`Límite por cliente alcanzado: ${currentItem.unitLimit} unidad(es)`);
      return;
    }

    // Stock cross-caja: bloquear si otra caja ya reservó stock que no alcanza para el incremento.
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

    // Optimistic UI update — in preventa, scale deposit with quantity change
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
              ...(m.isPreventa && i.depositAmount != null
                ? { depositAmount: Math.max(0, unitPrice * newQty) }
                : {}),
            }
          : i)
        .filter(i => i.quantity > 0),
    }));

    // Rollback helper — restaura cantidad y deposit del item a su estado previo
    const rollback = (markSyncError: boolean) => {
      updMesa(mesaId, m => ({
        ...m,
        items: m.items
          .map(i => i.product.id === pid
            ? {
                ...i,
                quantity: oldQty,
                ...(oldDeposit !== undefined ? { depositAmount: oldDeposit } : {}),
                ...(markSyncError ? { syncError: true } : {}),
              }
            : i)
          .filter(i => i.quantity > 0),
      }));
    };

    // Si hay un addDraftItem en vuelo para este producto (usuario clickeó "+" justo
    // después de agregarlo desde el catálogo), esperar a que termine antes de leer
    // el itemId. Sin esto, el usuario ve el toast "Sincronizando…" en cada click rápido.
    const pendingAdd = pendingItemAddRef.current[`${mesaId}:${pid}`];
    if (pendingAdd) {
      try { await pendingAdd; } catch { /* el catch de addToCart ya marcó syncError */ }
    }

    const draftId = draftStore.getDraftId(mesaId);
    const itemId  = draftStore.getDraftItemId(mesaId, pid);
    if (draftId === undefined || itemId === undefined) {
      // Si el usuario está eliminando (newQty <= 0) un item que nunca llegó al server
      // (catálogo de preventa, folio cargado, syncError previo), la eliminación local
      // basta — el optimistic update ya filtró el item.
      if (newQty <= 0) return;
      // Si quiere incrementar/decrementar pero el item no está sincronizado, revertir
      // y avisar (probable race con createDraft en flight).
      rollback(false);
      toast.info("Sincronizando con el servidor… intenta de nuevo en un segundo.");
      return;
    }

    // Price captured from stable pre-update snapshot (MEDIUM #5)
    const price = getItemPrice(currentItem);
    const level = currentItem.priceLevel ?? "a";

    try {
      if (newQty <= 0) {
        await removeDraftItem(draftId, itemId);
        draftStore.clearDraftItem(mesaId, pid);
      } else {
        await updateDraftItem(draftId, itemId, { quantity: newQty, price, price_level: level });
      }
    } catch (err: unknown) {
      // Rollback optimistic UI y marca syncError para que checkout bloquee si quedan
      // items desincronizados — evita el toast "carrito no sincronizado" en checkout.
      rollback(true);
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message) : "Error al actualizar cantidad";
      toast.error(`${msg}. Cantidad revertida.`);
    }
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



  const setPayment = (pm: PaymentMethod) => {
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
    updMesa(activeMesa.id, m => {
      const nextVal = !m.isPreventa;
      const nextPayment = m.paymentMethod;
      // Reset items that don't have preventa stock if turning ON
      const nextItems = nextVal
        ? m.items.filter(i => (i.product.stock_details?.preventa || 0) > 0)
        : m.items;

      return { ...m, isPreventa: nextVal, paymentMethod: nextPayment, depositAmount: 0, items: nextItems };
    });
    // Auto-open catalog in preventa mode so user picks products immediately
    if (turningOn) {
      setShowCatalog(true);
    }
  };

  const toggleDiscount = (d: number) =>
    updMesa(activeMesa.id, m => ({ ...m, discount: m.discount === d ? 0 : d }));

  const setCustomer = (c: Customer) => {
    updMesa(activeMesa.id, m => ({ ...m, customerId: c.id, customerName: c.name, customerPhone: c.phone, isNewCustomer: false }));
    setCustomerSearch(c.name);
    setShowCustDrop(false);
  };

  const clearCart = () => {
    updMesa(activeMesa.id, m => ({
      ...m, items: [], customerId: undefined, customerName: undefined,
      customerPhone: "", customerEmail: "", isNewCustomer: false, discount: 0, depositAmount: 0,
      selectedTerminalId: undefined, absorbCommission: true,
      isPreventa: false, loadedPreSaleOrderId: undefined, loadedPreSaleOrderCode: undefined,
    }));
    setCustomerSearch("");
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

  const hasCashOnly = activeMesa.items.some(i => i.product.payment_restriction === "cash_only");
  const payBlocked  = hasCashOnly && !["Efectivo", "Dólares"].includes(activeMesa.paymentMethod);

  const hasCatalogItems = activeMesa.items.some(i => i.sellingCatalogId != null);
  const checkoutDisabled = activeMesa.items.length === 0 || isProcessing ||
    (activeMesa.isPreventa && !activeMesa.loadedPreSaleOrderId && !hasCatalogItems && totalDeposit <= 0);

  const apartarDisabled = activeMesa.items.length === 0 || !activeMesa.customerId || apartarProcessing;

  const openPreSalesModal = async (tab: 'venta' | 'liquidar' | 'completadas' | 'vencidas' | 'difusion' = 'venta') => {
    setPickerSearch("");
    setPreSalesTab(tab);
    setShowPreSalesModal(true);
    setPickerLoading(true);

    const [catalogsResult, ordersResult] = await Promise.allSettled([
      getPreSaleCatalogs({ status: 'published', per_page: 200 }),
      getPreSaleOrders({ per_page: 200 }),
    ]);

    if (catalogsResult.status === 'fulfilled') {
      setPreSaleCatalogs(catalogsResult.value.data);
    } else {
      toast.error("No se pudieron cargar los catálogos de preventa");
    }

    if (ordersResult.status === 'fulfilled') {
      const orders = ordersResult.value.data;
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
    } else {
      toast.error("No se pudieron cargar los folios de preventa");
    }

    setPickerLoading(false);
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
      toast.warning(`${skippedCount} producto(s) sin stock en esta tienda — no se cargaron al carrito`);
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

    updMesa(activeMesa.id, m => ({
      ...m,
      items: [...balancedItems, ...m.items.filter(i => !i.isFromPreSale)],
      loadedPreSaleOrderId: order.id,
      loadedPreSaleOrderCode: order.code,
      depositAmount: balance,
      customerId: order.customer ? String(order.customer.id) : m.customerId,
      customerName: order.customer?.name ?? m.customerName,
    }));

    setShowPreSalesModal(false);
    setFolioInput("");
    toast.success(`Preventa ${order.code} cargada · Saldo: ${fmt(balance)}`);
  };

  // Adds a catalog item to the cart for reservation. Creates the PreSaleOrder at checkout.
  const addCatalogToCart = (catalog: PreSaleCatalog, priceLevel: PriceLevel = "a") => {
    const anticipo = catalog.advance_payment ?? 0;

    const item: CartItem = {
      product: {
        id: `catalog-${catalog.id}`,
        name: catalog.product_name,
        sku: `PREV-${catalog.id}`,
        category: catalog.category?.name ?? "Preventa",
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

    // NO setear isPreventa: true a nivel mesa — el item ya viene con sellingCatalogId
    // y su propio depositAmount, así no contamina con anticipo a productos regulares.
    updMesa(activeMesa.id, m => ({
      ...m,
      items: [...m.items, item],
    }));
    setShowPreSalesModal(false);
    toast.success(`${catalog.product_name} al carrito · Anticipo mín.: ${fmt(anticipo)}`);
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

  const filteredCusts = useMemo(() => {
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      (c.name ?? "").toLowerCase().includes(q) ||
      (c.external_member_id ?? "").toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const handleOpenCash = async () => {
    const registerId = openCashRegisterId !== "" ? Number(openCashRegisterId) : cashRegisters[0]?.id;
    if (!registerId) {
      toast.error("No hay cajas disponibles para esta tienda. Crea una caja en Administración → Terminales.");
      return;
    }
    const amount = parseFloat(openCashAmount) || 0;
    setOpeningCash(true);
    try {
      const session = await openSession(registerId, amount);
      setCashSession(session);
      setShowOpenCashModal(false);
      toast.success(`Caja abierta · $${amount.toFixed(0)} inicial`);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "Error al abrir caja";
      toast.error(msg);
    } finally {
      setOpeningCash(false);
    }
  };

  const handleCloseCash = async () => {
    const amount = parseFloat(closeCashAmount) || 0;
    setClosingCashLoading(true);
    try {
      await closeSession(amount);
      setCashSession(null);
      setShowCloseCashModal(false);
      setCloseCashAmount("");
      toast.success("Caja cerrada — corte registrado");
      if (isAdmin) {
        setActiveStore(null);
      } else {
        getCashRegisters(activeStore?.id)
          .then(regs => { setCashRegisters(regs); if (regs[0]) setOpenCashRegisterId(regs[0].id); })
          .catch(() => {});
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

    const regularRows = sale.items.map(i =>
      `<tr><td style="padding:2px 0;font-size:10px">${i.name}</td><td style="text-align:center;padding:2px 4px;font-size:10px">×${i.quantity}</td><td style="text-align:right;font-size:10px">${fmt(i.price * i.quantity)}</td></tr>`
    ).join("");

    const preSaleSection = sale.preSaleCode ? `
      <div class="divider"></div>
      <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">
        ★ PREVENTA · Folio ${sale.preSaleCode}
      </div>
      <table>
        <tbody>
          ${(sale.preSaleItems ?? []).map(i =>
            `<tr><td style="padding:2px 0;font-size:10px">${i.name}</td><td style="text-align:center;padding:2px 4px;font-size:10px">×${i.quantity}</td><td style="text-align:right;font-size:10px">${fmt(i.unitPrice * i.quantity)}</td></tr>`
          ).join("")}
        </tbody>
        <tfoot>
          <tr><td colspan="2" style="font-size:9px;padding-top:4px">Anticipo pagado</td><td style="text-align:right;font-size:10px;font-weight:900;padding-top:4px">${fmt(sale.preSaleAnticipo ?? 0)}</td></tr>
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
        ${sale.items.length > 0 ? `<tr><td colspan="2" style="font-size:9px">Productos</td><td style="text-align:right;font-size:9px">${fmt(sale.items.reduce((s, i) => s + i.price * i.quantity, 0))}</td></tr>` : ""}
        <tr class="total-row"><td colspan="2">TOTAL COBRADO</td><td style="text-align:right">${fmt(sale.total)}</td></tr>
      </tfoot></table>` : "";

    const isCash = ["Efectivo", "Dólares"].includes(sale.paymentMethod);
    const paymentRows = `
      <tr><td>Método de pago</td><td style="text-align:right;font-weight:900">${sale.paymentMethod}</td></tr>
      ${sale.amountReceived != null ? `<tr><td>${sale.paymentMethod === "Dólares" ? "Recibido (USD)" : "Recibido"}</td><td style="text-align:right">${isCash && sale.paymentMethod !== "Dólares" ? fmt(sale.amountReceived) : `$${sale.amountReceived.toFixed(2)}`}</td></tr>` : ""}
      ${sale.change != null && sale.change > 0 ? `<tr><td style="font-weight:900">Cambio</td><td style="text-align:right;font-weight:900">${sale.paymentMethod === "Dólares" ? `$${sale.change.toFixed(2)} USD` : fmt(sale.change)}</td></tr>` : ""}
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
    if (pref === "auto") { doPrintTicket(sale); return; }
    if (pref === "never") return;
    setLastCompletedSale(sale);
    setPrintNeverAsk(false);
    setShowPrintModal(true);
  };

  const fetchHistorial = async () => {
    setHistorialLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const baseParams: Record<string, unknown> = { per_page: 50 };
      if (activeStore?.id) baseParams.store_id = activeStore.id;

      const [salesRes, ordersRes] = await Promise.all([
        getSales({ ...baseParams, from: today, to: today } as Parameters<typeof getSales>[0]),
        getPreSaleOrders({ ...(activeStore?.id ? { store_id: activeStore.id } : {}), from: today, to: today, per_page: 50 } as Parameters<typeof getPreSaleOrders>[0]),
      ]);

      const entries: HistorialEntry[] = [
        ...salesRes.data.map(d => ({ type: 'sale' as const, data: d })),
        ...ordersRes.data.map(d => ({ type: 'presale' as const, data: d })),
      ].sort((a, b) => {
        const dateA = a.type === 'sale' ? (a.data.sold_at || a.data.created_at) : a.data.created_at;
        const dateB = b.type === 'sale' ? (b.data.sold_at || b.data.created_at) : b.data.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      // Build pairs using the persisted linked_sale_id from the database.
      // Fall back to the 30s timestamp heuristic for legacy orders that
      // pre-date the linked_sale_id column.
      const linkedSaleIds = new Set<number>();
      const detectedPairs: Array<{ preSaleOrderId: number; saleId: number }> = [];

      for (const entry of entries) {
        if (entry.type !== 'presale') continue;
        if (entry.data.linked_sale_id != null) {
          detectedPairs.push({ preSaleOrderId: entry.data.id, saleId: entry.data.linked_sale_id });
          linkedSaleIds.add(entry.data.linked_sale_id);
        }
      }

      // Heuristic fallback for legacy orders without linked_sale_id
      const usedSaleIds = new Set<number>(linkedSaleIds);
      for (const entry of entries) {
        if (entry.type !== 'presale') continue;
        if (entry.data.linked_sale_id != null) continue;
        const orderTime = new Date(entry.data.created_at).getTime();
        for (const other of entries) {
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
      setHistorialEntries(entries);
    } catch { /* silently fail */ } finally {
      setHistorialLoading(false);
    }
  };

  const openHistorial = () => {
    setShowHistorialModal(true);
    if (historialEntries.length === 0) void fetchHistorial();
  };

  const handleCheckout = async () => {
    if (!activeMesa.items.length) return;

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
          const draftId = draftStore.getDraftId(activeMesa.id);
          if (draftId) {
            const saleResult = await createSale({
              draft_id: draftId,
              payments: [{
                payment_method_id: payMethodId,
                amount: regularSubtotal,
                ...(activeMesa.paymentMethod === "Tarjeta" && activeMesa.selectedTerminalId
                  ? { terminal_id: activeMesa.selectedTerminalId } : {}),
              }],
            });
            regularSaleId = saleResult?.id;
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
        }

        // 3. Liquidar la preventa cargada (al final → si algo trona arriba, queda sin liquidar)
        if (liquidationAmount > 0) {
          await addPreSaleOrderPayment(activeMesa.loadedPreSaleOrderId, {
            amount: liquidationAmount,
            payment_method_id: payMethodId,
          });
        }
        await updatePreSaleOrderStatus(activeMesa.loadedPreSaleOrderId, { status: "delivered" });

        // Snapshots para ticket antes de limpiar
        const mesaId             = activeMesa.id;
        const customerNameSnap   = activeMesa.customerName;
        const payMethodSnap      = activeMesa.paymentMethod;
        const liquidatedCodeSnap = activeMesa.loadedPreSaleOrderCode;
        const cashReceivedSnap   = parseFloat(cashReceived) || 0;

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
          items: deliveredAndRegular,
          soldAt: new Date().toISOString(),
          storeName: activeStore?.name,
          cashierName: user?.name,
          amountReceived: cashReceivedSnap > 0 ? cashReceivedSnap : undefined,
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

        setHistorialEntries([]);
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
        toast.error(msg);
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
          description: "Busca o registra al cliente antes de apartar",
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
        requestAnimationFrame(() => {
          customerSearchRef.current?.focus();
          if (customerSearch.length > 0) setShowCustDrop(true);
        });
      }

      const needsCash = ["Efectivo", "Dólares"].includes(activeMesa.paymentMethod);
      const receivedAmt = parseFloat(cashReceived) || 0;
      if (needsCash && totalDeposit > 0 && receivedAmt < totalDeposit) {
        blocked = true;
        toast("Ingresa el anticipo recibido", {
          icon: <Banknote size={16} className="text-red-400" />,
          description: `Se requieren al menos ${fmt(totalDeposit)} para registrar el anticipo`,
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
          toast.error("No hay artículos de catálogo de preventa en el carrito.");
          isCheckoutLockedRef.current = false;
          return;
        }

        // Deposit for catalog items only
        const catalogDeposit = catalogItems.reduce((s, i) => s + (i.depositAmount ?? 0), 0);

        // Create regular sale first so we can link it to the pre-sale order
        let regularSaleId: number | undefined;
        if (regularItems.length > 0) {
          const mesaId = activeMesa.id;
          const draftId = draftStore.getDraftId(mesaId);
          const regularSubtotal = regularItems.reduce((s, i) => s + getItemPrice(i) * i.quantity, 0);
          if (draftId && regularSubtotal > 0) {
            const saleResult = await createSale({
              draft_id: draftId,
              payments: [{
                payment_method_id: payMethodId,
                amount: regularSubtotal,
                ...(activeMesa.paymentMethod === "Tarjeta" && activeMesa.selectedTerminalId
                  ? { terminal_id: activeMesa.selectedTerminalId } : {}),
              }],
            });
            regularSaleId = saleResult?.id;
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

        // Keep in-memory pair for historial grouping in the same session
        if (regularSaleId != null) {
          setMixedPairs(prev => [...prev, { preSaleOrderId: order.id, saleId: regularSaleId! }]);
        }

        const mesaId = activeMesa.id;
        const customerNameSnap = activeMesa.customerName;
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

        setHistorialEntries([]);
        const mixedReceived = parseFloat(cashReceived) || 0;
        const mixedTotal = catalogDeposit + regularSubtotalFinal;
        const mixedTicket: CompletedSaleData = {
          total: mixedTotal,
          paymentMethod: payMethodSnap,
          customerName: customerNameSnap,
          items: regularItems.map(i => ({
            name: i.product.name,
            quantity: i.quantity,
            price: getItemPrice(i),
          })),
          soldAt: new Date().toISOString(),
          storeName: activeStore?.name,
          cashierName: user?.name,
          amountReceived: mixedReceived > 0 ? mixedReceived : undefined,
          change: mixedReceived > mixedTotal ? mixedReceived - mixedTotal : undefined,
          preSaleCode: order.code,
          preSaleItems: catalogItems.map(i => ({
            name: i.product.name,
            quantity: i.quantity,
            unitPrice: getItemPrice(i),
          })),
          preSaleAnticipo: catalogDeposit,
        };
        triggerPrintFlow(mixedTicket);
      } catch (err: unknown) {
        const msg = err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message) : "Error al registrar la preventa";
        toast.error(msg);
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

    let draftId = draftStore.getDraftId(activeMesa.id);

    // Auto-recovery: si el draft fue limpiado en backend (cleanup, restart, etc.)
    // pero el carrito en memoria tiene items, recrear draft + reañadir items.
    // Evita el "carrito no sincronizado" que reportó QA cuando el snapshot
    // sobrevive en localStorage pero el draft del servidor ya no existe.
    if (!draftId && activeMesa.items.length > 0) {
      try {
        toast("Recuperando carrito…", { duration: 1500 });
        const newDraft = await createDraft(activeStore?.id ?? 0, cashSession?.id);
        draftStore.setDraftId(activeMesa.id, newDraft.id);
        for (const ci of activeMesa.items) {
          // Catalog items no son products reales — los saltamos (van por createPreSaleOrder).
          if (ci.sellingCatalogId != null) continue;
          if (ci.isFromPreSale) continue;
          const productIdNum = parseInt(ci.product.id, 10);
          if (Number.isNaN(productIdNum)) continue;
          const resolvedPrice = ci.damagedPrice ?? getItemPrice(ci);
          const created = await addDraftItem(newDraft.id, {
            product_id: productIdNum,
            quantity: ci.quantity,
            price: resolvedPrice,
            // PriceLevel allows a..e, DraftPriceLevel solo a..c. Clamp d/e a 'a' (precio base).
            price_level: (["a", "b", "c"].includes(ci.priceLevel) ? ci.priceLevel : "a") as "a" | "b" | "c",
          });
          draftStore.setDraftItemId(activeMesa.id, ci.product.id, created.id);
        }
        draftId = newDraft.id;
      } catch (recoverErr: unknown) {
        const msg = recoverErr && typeof recoverErr === "object" && "message" in recoverErr
          ? String((recoverErr as { message: unknown }).message) : "No se pudo recuperar el carrito";
        toast.error(`${msg}. Elimina los productos y vuelve a agregarlos.`, {
          duration: 6000,
          style: { background: '#2d0a00', color: '#fff', border: '1px solid rgba(224,34,26,0.4)', borderRadius: '16px' },
        });
        return;
      }
    }

    if (!draftId) {
      toast.error("El carrito está vacío.", { duration: 3000 });
      return;
    }

    // Verificación final pre-checkout: el subtotal del draft en backend debe
    // coincidir con el subtotal de los items que SE sincronizan al draft
    // (excluyendo catálogos de preventa nueva, folios cargados, e items con syncError
    // — esos viajan por createPreSaleOrder/addPreSaleOrderPayment, no por createSale).
    try {
      const serverDraft = await getDraft(draftId);
      const serverSubtotal = serverDraft.subtotal ?? 0;
      const expectedServerSubtotal = activeMesa.items
        .filter(i => !i.isFromPreSale && i.sellingCatalogId == null && !i.syncError)
        .reduce((s, i) => s + getItemPrice(i) * i.quantity, 0);
      if (Math.abs(serverSubtotal - expectedServerSubtotal) > 0.01) {
        toast.error(
          `El carrito no está sincronizado: pantalla muestra ${fmt(expectedServerSubtotal)} pero el servidor tiene ${fmt(serverSubtotal)}. Elimina los productos y vuelve a agregarlos.`,
          { duration: 8000, style: { background: '#2d0a00', color: '#fff', border: '1px solid rgba(224,34,26,0.4)', borderRadius: '16px' } },
        );
        return;
      }
    } catch {
      // Si no se pudo verificar, dejamos pasar — el backend hará la validación final.
    }

    isCheckoutLockedRef.current = true;
    try {
      setIsProcessing(true);

      // Map UI payment method name → backend payment_method_id
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
      const payMethodSnapshot = activeMesa.paymentMethod;
      const receivedSnapshot = parseFloat(cashReceived) || 0;
      const changeSnapshot = receivedSnapshot > 0 ? receivedSnapshot - total : 0;

      const saleResult = await createSale({
        draft_id: draftId,
        payments: [{
          payment_method_id: paymentMethodId,
          amount: total,
          ...(activeMesa.paymentMethod === "Tarjeta" && activeMesa.selectedTerminalId
            ? { terminal_id: activeMesa.selectedTerminalId } : {}),
        }],
      });

      toast.success(`¡Venta registrada! ${fmt(total)}`);
      const mesaId = activeMesa.id;
      setCashReceived("");
      clearCart();
      draftStore.clearDraft(mesaId);
      draftStore.clearDraftItems(mesaId);

      // Trigger print flow
      const completedSale: CompletedSaleData = {
        id: saleResult?.id,
        total,
        paymentMethod: payMethodSnapshot,
        customerName: customerNameSnapshot,
        items: cartSnapshot,
        soldAt: new Date().toISOString(),
        storeName: activeStore?.name,
        cashierName: user?.name,
        amountReceived: receivedSnapshot > 0 ? receivedSnapshot : undefined,
        change: changeSnapshot > 0 ? changeSnapshot : undefined,
      };
      setHistorialEntries([]); // invalidate cache
      triggerPrintFlow(completedSale);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message) : "Error al procesar la venta";
      toast.error(msg);
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
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 240 }}>
          {stores.length === 0 ? (
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--td-text-ghost)" }}>Sin tiendas asignadas — contacta al administrador</p>
          ) : (
            stores.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveStore(s)}
                style={{
                  padding: "14px 24px", borderRadius: 16, cursor: "pointer", textAlign: "left",
                  background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)",
                  color: "var(--td-text-hi)", fontSize: 14, fontWeight: 700,
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(224,34,26,0.12)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(224,34,26,0.3)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--td-card-bg)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--td-card-border)"; }}
              >
                {s.name}
                {s.address && <span style={{ display: "block", fontSize: 10, color: "var(--td-text-ghost)", marginTop: 2 }}>{s.address}</span>}
              </button>
            ))
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

  /* ── GATE: sin caja abierta ────────────────────────────────────────────── */
  if (!cashSession) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-8" style={{ background: BG }}>
        {/* Icon */}
        <div style={{
          width: 96, height: 96, borderRadius: 28,
          background: "rgba(224,34,26,0.1)", border: "1px solid rgba(224,34,26,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ShoppingBag size={44} color="rgba(224,34,26,0.7)" />
        </div>

        {/* Text */}
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "var(--td-text-hi)", letterSpacing: "-0.02em" }}>
            Caja cerrada
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--td-text-ghost)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em" }}>
            {activeStore ? activeStore.name : "Sin tienda activa"} · Abre una sesión para comenzar a vender
          </p>
        </div>

        {/* Open button */}
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
              {cashRegisters.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--td-text-ghost)", marginBottom: 6 }}>Caja Registradora</label>
                  <select
                    value={openCashRegisterId}
                    onChange={e => setOpenCashRegisterId(e.target.value ? Number(e.target.value) : "")}
                    style={{ width: "100%", background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 14, color: "var(--td-input-text)", padding: "10px 14px", fontSize: 13, outline: "none", appearance: "none" as const, boxSizing: "border-box" as const }}
                  >
                    {cashRegisters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}
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
    <div className="flex flex-col h-full overflow-hidden" style={{ background: BG, color: "var(--td-text-hi)", fontFamily: "inherit" }}>

      {/* ══════════════════ TOP TABS (CAJAS) ══════════════════════════════════ */}
      <div
        className="flex items-center shrink-0 border-b border-white/5 overflow-x-auto no-scrollbar"
        style={{ height: 48, background: "var(--td-panel-bg)" }}
      >
        <div className="flex items-center h-full px-6 border-r border-white/5 gap-3 shrink-0">
          <ShoppingBag size={18} className="text-[#E0221A]" />
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Carrito</h2>
        </div>

        {mesas.map((m, idx) => (
          <div
            key={m.id}
            onClick={() => setActiveMesaId(m.id)}
            className="group relative flex items-center h-full px-5 cursor-pointer border-r border-white/5 transition-all"
            style={{ 
              background: activeMesaId === m.id ? "rgba(224,34,26,0.08)" : "transparent",
              minWidth: 120
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
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded-md transition-all ml-auto"
              >
                <X size={10} className="text-white/40" />
              </button>
            )}
          </div>
        ))}

        <button 
          onClick={addMesa}
          className="flex items-center justify-center h-full px-6 hover:bg-[#E0221A]/10 border-r border-white/5 text-[#E0221A] transition-colors"
          title="Nueva Caja"
        >
          <Plus size={16} strokeWidth={3} />
        </button>

        <div className="ml-auto flex items-center h-full gap-0 border-l border-white/5">
          <button
            onClick={() => { void openHistorial(); }}
            className="h-full px-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors border-r border-white/5"
            title="Ver historial de ventas de esta sesión"
          >
            <History size={13} />
            Historial
          </button>
          <button
            onClick={clearCart}
            className="h-full px-5 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors border-r border-white/5"
          >
            Vaciar Carrito
          </button>
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
                Este valor queda registrado en el reporte del turno junto a todas las ventas del periodo.
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
        <div className="flex-1 flex flex-col min-w-0" style={{ background: "var(--td-card-bg)" }}>

          {/* ── Barra de info de caja ─────────────────────────────────────────── */}
          <div className="shrink-0 flex items-center justify-between px-5 py-2 border-b border-white/[0.05]" style={{ background: "var(--td-panel-bg)" }}>
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
              {/* Selector de tipo de cliente (Solo en Preventa) */}
              {activeMesa.isPreventa && (
                <div className="flex bg-white/[0.04] p-1 rounded-2xl border border-white/10 w-fit">
                  <button 
                    onClick={() => updMesa(activeMesa.id, m => ({ ...m, isNewCustomer: false }))}
                    className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!activeMesa.isNewCustomer ? 'bg-[#E0221A] text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
                  >
                    <Users size={14} />
                    Cliente Existente
                  </button>
                  <button 
                    onClick={() => updMesa(activeMesa.id, m => ({ ...m, isNewCustomer: true, customerId: undefined, customerPhone: m.customerPhone || "" }))}
                    className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeMesa.isNewCustomer ? 'bg-amber-500 text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
                  >
                    <UserPlus size={14} />
                    Cliente Nuevo
                  </button>
                </div>
              )}

              {/* ── Búsqueda de cliente (siempre visible) o formulario Cliente Nuevo (solo en Preventa) ── */}
              {(activeMesa.isPreventa && activeMesa.isNewCustomer) ? (
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500/60">
                        <User size={15} />
                      </div>
                      <input
                        type="text"
                        placeholder="Nombre Completo *"
                        value={activeMesa.customerName || ""}
                        onChange={e => updMesa(activeMesa.id, m => ({ ...m, customerName: e.target.value }))}
                        className="w-full bg-amber-500/5 border border-amber-500/30 rounded-2xl pl-11 pr-4 py-2.5 text-sm font-bold text-white placeholder:text-amber-500/30 focus:border-amber-500/50 outline-none transition-all"
                      />
                    </div>
                    <div className="relative flex-1">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500/60">
                        <Phone size={15} />
                      </div>
                      <input
                        type="tel"
                        placeholder="WhatsApp / Teléfono"
                        value={activeMesa.customerPhone || ""}
                        onChange={e => updMesa(activeMesa.id, m => ({ ...m, customerPhone: e.target.value }))}
                        className="w-full bg-amber-500/5 border border-amber-500/30 rounded-2xl pl-11 pr-4 py-2.5 text-sm font-bold text-white placeholder:text-amber-500/30 focus:border-amber-500/50 outline-none transition-all"
                      />
                    </div>
                    <button
                      onClick={() => {
                        updMesa(activeMesa.id, m => ({ ...m, isNewCustomer: false, customerName: undefined, customerPhone: "", customerEmail: "" }));
                        setCustomerSearch("");
                      }}
                      className="flex items-center justify-center px-3 rounded-2xl bg-white/[0.04] border border-white/10 text-white/30 hover:text-white hover:bg-white/10 transition-all"
                      title="Cancelar registro"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500/40">
                        <span className="text-[10px] font-black">@</span>
                      </div>
                      <input
                        type="email"
                        placeholder="Email (opcional)"
                        value={activeMesa.customerEmail || ""}
                        onChange={e => updMesa(activeMesa.id, m => ({ ...m, customerEmail: e.target.value }))}
                        className="w-full bg-amber-500/5 border border-amber-500/20 rounded-2xl pl-9 pr-4 py-2.5 text-sm font-bold text-white placeholder:text-amber-500/25 focus:border-amber-500/40 outline-none transition-all"
                      />
                    </div>
                    <button
                      disabled={isRegisteringCustomer || !activeMesa.customerName?.trim()}
                      onClick={async () => {
                        if (!activeMesa.customerName?.trim()) return;
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
                            customerEmail: "",
                            isNewCustomer: false,
                          }));
                          setCustomerSearch("");
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
                      {isRegisteringCustomer ? "Guardando…" : "Agregar"}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Búsqueda de cliente existente ── */
                <div className="flex flex-col gap-1.5">
                <div className="flex gap-3">
                  <div className="relative flex-1" ref={custRef}>
                    <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${requireCustomerFlash ? "text-amber-400" : "text-white/20"}`}>
                      <Search size={16} />
                    </div>
                    <input
                      ref={customerSearchRef}
                      type="text"
                      placeholder={requireCustomerFlash ? "Escribe nombre o teléfono del cliente…" : "Nombre, teléfono, folio o código de tarjeta..."}
                      value={customerSearch}
                      onChange={e => { setCustomerSearch(e.target.value); setShowCustDrop(true); }}
                      onFocus={() => { setShowCustDrop(true); setRequireCustomerFlash(false); }}
                      className={`w-full rounded-2xl pl-12 pr-4 py-2.5 text-sm font-bold text-white outline-none transition-all ${
                        requireCustomerFlash
                          ? "bg-amber-400/8 border-2 border-amber-400 ring-4 ring-amber-400/20 placeholder:text-amber-400/60 animate-pulse"
                          : "bg-white/[0.04] border border-white/10 focus:border-white/20 focus:bg-white/[0.06] placeholder:text-white/20 shadow-inner"
                      }`}
                    />
                    {activeMesa.customerName && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-xl border border-white/10">
                        <span className="text-[10px] font-black text-white uppercase truncate max-w-[120px]">{activeMesa.customerName}</span>
                        <button onClick={() => { updMesa(activeMesa.id, m => ({ ...m, customerId: undefined, customerName: undefined })); setCustomerSearch(""); }} className="text-white/40 hover:text-white"><X size={14} /></button>
                      </div>
                    )}
                    
                    {/* Dropdown Clientes Existentes */}
                    <AnimatePresence>
                      {showCustDrop && customerSearch.length > 0 && (
                        <Motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute top-full left-0 right-0 mt-2 z-[100] border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[300px] overflow-y-auto no-scrollbar"
                          style={{ background: "var(--td-popup-bg)" }}
                        >
                          {filteredCusts.length === 0 ? (
                            <div className="p-4 flex flex-col items-center gap-3">
                              {extSearchResults.length === 0 && (
                                <p className="text-xs text-white/30 font-bold uppercase tracking-widest text-center">No se encontró al cliente</p>
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
                                        <p className="text-sm font-black text-white truncate">{ext.name}</p>
                                        <p className="text-[10px] text-white/35">{ext.external_member_id}{ext.phone ? ` · ${ext.phone}` : ""}</p>
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
                                  Registrar como Nuevo
                                </button>
                              )}
                            </div>
                          ) : (
                            filteredCusts.map(c => (
                              <button
                                key={c.id}
                                onClick={() => setCustomer(c)}
                                className="w-full text-left px-5 py-4 border-b border-white/5 hover:bg-white/5 transition-colors group"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-black text-white group-hover:text-[#E0221A] transition-colors">{c.name}</span>
                                  <span className="text-[10px] text-white/30">{c.phone || "Sin tel."}</span>
                                </div>
                              </button>
                            ))
                          )}
                        </Motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                </div>
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

            </div>

            {/* Buscador de Productos (Manual) */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20">
                  <Plus size={16} />
                </div>
                <input
                  ref={prodInputRef}
                  type="text"
                  placeholder="Añadir producto por nombre, SKU o escanear código..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => {
                    // Enter en escaneo / búsqueda: si hay un único match exacto, lo agrega y limpia.
                    if (e.key !== "Enter") return;
                    if (filteredProds.length === 0) return;
                    e.preventDefault();
                    const exact = filteredProds.find(p => p.sku === search.trim()) ?? (filteredProds.length === 1 ? filteredProds[0] : null);
                    if (!exact) return;
                    void addToCart(exact, "a");
                    setSearch("");
                  }}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-2xl pl-12 pr-4 py-2.5 text-sm font-bold text-white placeholder:text-white/20 focus:border-white/20 focus:bg-white/[0.06] outline-none transition-all shadow-inner"
                />
                
                {/* Resultados de búsqueda rápidos */}
                {search.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 z-[90] border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[300px] overflow-y-auto no-scrollbar" style={{ background: "var(--td-popup-bg)" }}>
                    {filteredProds.length === 0 ? (
                      <div className="p-4 text-center text-xs text-white/30 font-bold uppercase tracking-widest">No se encontró el producto</div>
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
                          className="w-full px-5 py-4 border-b border-white/5 flex items-center gap-5 group cursor-pointer hover:bg-white/[0.04] transition-colors"
                          style={{ borderBottom: "1px solid var(--td-panel-border)" }}
                        >
                          <ImageWithFallback src={p.image || ""} className="w-16 h-16 rounded-xl object-cover bg-black shrink-0 shadow-lg" />

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-white truncate" style={{ color: "var(--td-text-hi)" }}>{p.name}</p>
                            <p className="text-[10px] uppercase tracking-[0.15em] mt-0.5" style={{ color: "var(--td-text-ghost)" }}>{p.sku}</p>

                            {/* Stock Breakdown */}
                            <div className="flex gap-3 mt-2 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${!activeMesa.isPreventa ? 'bg-emerald-500' : 'bg-white/10'}`} />
                                <span className={`text-[9px] font-black uppercase tracking-widest ${!activeMesa.isPreventa ? 'text-white' : 'text-white/30'}`}>Tienda: {p.stock_details?.tienda || 0}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${activeMesa.isPreventa ? 'bg-amber-500 animate-pulse' : 'bg-amber-500/20'}`} />
                                <span className={`text-[9px] font-black uppercase tracking-widest ${activeMesa.isPreventa ? 'text-amber-500' : 'text-white/30'}`}>Preventa: {p.stock_details?.preventa || 0}</span>
                              </div>
                              {(p.stock_details?.dañado ?? 0) > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <TriangleAlert size={8} className="text-orange-400" />
                                  <span className="text-[9px] font-black uppercase tracking-widest text-orange-400">
                                    Dañado: {p.stock_details?.dañado || 0}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Price buttons — click each to add at that level. stopPropagation evita doble-fire del onClick del row. */}
                          <div className="flex flex-col gap-1 items-end shrink-0">
                            <button
                              onClick={e => { e.stopPropagation(); void addToCart(p, "a"); setSearch(""); }}
                              className="flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-white/10 transition-colors text-right"
                            >
                              <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--td-text-ghost)" }}>Precio A</span>
                              <p className="text-sm font-black" style={{ color: "var(--td-text-hi)" }}>{fmt(p.price_a)}</p>
                            </button>
                            {p.price_b && p.price_b > 0 && (
                              <button
                                onClick={e => { e.stopPropagation(); void addToCart(p, "b"); setSearch(""); }}
                                className="flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-amber-500/10 transition-colors text-right"
                              >
                                <span className="text-[8px] font-black uppercase tracking-widest text-amber-500/50">Precio B</span>
                                <p className="text-[11px] font-black text-amber-500">{fmt(p.price_b)}</p>
                              </button>
                            )}
                            {p.price_c && p.price_c > 0 && (
                              <button
                                onClick={e => { e.stopPropagation(); void addToCart(p, "c"); setSearch(""); }}
                                className="flex items-center gap-2 px-2.5 py-1 rounded-lg hover:bg-blue-500/10 transition-colors text-right"
                              >
                                <span className="text-[8px] font-black uppercase tracking-widest text-blue-500/40">Precio C</span>
                                <p className="text-[11px] font-black text-blue-500">{fmt(p.price_c)}</p>
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Botón Catálogo */}
              <button
                onClick={() => setShowCatalog(true)}
                className="flex items-center gap-2 px-5 rounded-2xl bg-white/[0.05] border border-white/10 text-white/50 hover:text-white hover:bg-white/[0.08] transition-all font-black uppercase tracking-widest text-[10px]"
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

              {/* Botón Escanear Producto */}
              <button
                onClick={() => {
                  prodInputRef.current?.focus();
                  toast.info("Escáner de producto activo. Lea el código de barras.");
                }}
                className="flex items-center gap-3 px-6 rounded-2xl bg-[#E0221A]/[0.08] border border-[#E0221A]/20 text-[#E0221A] hover:bg-[#E0221A]/[0.12] transition-all font-black uppercase tracking-widest text-[10px]"
              >
                <ScanLine size={18} />
                Escanear
              </button>
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
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-white flex items-center justify-center">
                  <ShoppingBag size={40} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-black uppercase tracking-[0.2em]">Carrito Vacío</p>
                  <p className="text-[10px] font-bold mt-1 text-white/50">Escané o busque un producto para comenzar</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {activeMesa.items.map((item, idx) => (
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
                          : "bg-white/[0.03] border-white/5 hover:bg-white/[0.06]"
                    }`}
                  >
                    {/* Imagen con badge dañado */}
                    <div className="relative shrink-0">
                      <ImageWithFallback src={item.product.image || ""} className="w-14 h-14 rounded-xl object-cover bg-black" />
                      {item.isDamaged && (
                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center shadow-lg">
                          <TriangleAlert size={10} className="text-white" strokeWidth={3} />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-black text-white truncate">{item.product.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">{item.product.sku}</p>
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
                        {item.product.payment_restriction === "cash_only" && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[7px] font-black text-amber-500 uppercase tracking-widest">
                            Solo Efectivo
                          </span>
                        )}
                        {/* Advertencia cuando el método de pago activo no está permitido en este producto */}
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
                      
                      {/* Price Levels */}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {getPriceLevels(item.product).map(lvl => (
                          <button
                            key={lvl.level}
                            onClick={() => changeLevel(item.product.id, lvl.level)}
                            className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border transition-all"
                            style={item.priceLevel === lvl.level ? pill(true) : pill(false)}
                          >
                            {lvl.label} {fmt(lvl.price)}
                          </button>
                        ))}

                        {/* Botón Dañado */}
                        {(item.product.stock_damaged ?? 0) > 0 && (
                          <button
                            onClick={() => toggleDamaged(item.product.id)}
                            className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                              item.isDamaged
                                ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                                : "border-white/10 text-white/25 hover:border-orange-500/40 hover:text-orange-400/70"
                            }`}
                          >
                            <TriangleAlert size={9} />
                            Dañado
                          </button>
                        )}
                      </div>

                      {/* ── Anticipo individual (solo items de preventa: catálogo o ya cargados de orden) ── */}
                      {(item.sellingCatalogId != null || item.isFromPreSale) && (() => {
                        const itemTotal = getItemPrice(item) * item.quantity;
                        const dep = item.depositAmount ?? 0;
                        const full = dep >= itemTotal && itemTotal > 0;
                        return (
                          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                              Anticipo
                            </span>
                            <span className={`flex items-center gap-1 rounded-xl px-3 py-1 border ${full ? "bg-emerald-500/15 border-emerald-400/30" : "bg-amber-400/15 border-amber-400/35"}`}>
                              <span className={`text-[13px] font-black ${full ? "text-emerald-300" : "text-amber-300"}`}>
                                {fmt(dep)}
                              </span>
                            </span>
                            <span className="text-[9px] font-black text-white/30">
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
                                <span className="text-[9px] text-white/20 line-through font-bold">{fmt(base)}</span>
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

                    {item.isFromPreSale ? (
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl border border-amber-500/20 bg-amber-500/5">
                        <span className="text-sm font-black text-amber-400/60">{item.quantity}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 bg-black/40 p-1.5 rounded-xl border border-white/5">
                        <button
                          onClick={() => { void changeQty(item.product.id, -1); }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors text-white/40"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center text-sm font-black text-white">{item.quantity}</span>
                        <button
                          onClick={() => { void changeQty(item.product.id, 1); }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors text-white/40"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    )}

                    <div className="text-right min-w-[100px]">
                      {item.sellingCatalogId != null ? (() => {
                        const anticipo = item.depositAmount ?? 0;
                        const lineTotal = getItemPrice(item) * item.quantity;
                        return (
                          <>
                            <p className="text-sm font-black text-amber-300" title="Anticipo a cobrar ahora">
                              {fmt(anticipo)}
                            </p>
                            <p className="text-[9px] font-black text-white/30 mt-0.5">
                              de {fmt(lineTotal)}
                            </p>
                          </>
                        );
                      })() : (
                        <p className={`text-sm font-black ${item.isDamaged ? "text-orange-400" : item.isFromPreSale ? "text-amber-400/70" : "text-white"}`}>
                          {fmt(getItemPrice(item) * item.quantity)}
                        </p>
                      )}
                      {item.isDamaged && (() => {
                        const { product: p, priceLevel } = item;
                        let base = p.price_a || 0;
                        if (priceLevel === "b" && p.price_b) base = p.price_b;
                        if (priceLevel === "c" && p.price_c) base = p.price_c;
                        const original = base * item.quantity;
                        const actual   = (item.damagedPrice ?? base) * item.quantity;
                        return original !== actual ? (
                          <p className="text-[9px] text-white/20 line-through">{fmt(original)}</p>
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
                      {!item.preSaleItemDelivered && (
                        <button
                          onClick={() => { void removeFromCart(item.product.id); }}
                          className="text-[10px] font-bold text-white/20 hover:text-[#E0221A] mt-1 transition-colors block"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </Motion.div>
                ))}
              </div>
            )}
          </div>

          {/* ══════════════════ FOOTER (RESUMEN + PAGOS) ══════════════════════════════════ */}
          <div className="border-t border-white/10 px-5 py-3" style={{ background: "var(--td-panel-bg)" }} ref={tcRef}>
            {/* ── 3-col: amounts | payment | action ── */}
            <div className="flex items-stretch gap-0">

              {/* ── Col 1: Money summary ── */}
              <div className="flex flex-col justify-center gap-1.5 min-w-[170px] pr-4">

                {/* Subtotal + modifiers — only when they differ from total */}
                {(discountAmt > 0 || (activeMesa.paymentMethod === "Tarjeta" && activeTerminal)) && (
                  <div className="flex flex-col gap-0.5 pb-1 border-b border-white/[0.06]">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Subtotal</p>
                      <p className="text-sm font-black text-white/50">{fmt(subtotal)}</p>
                    </div>
                    {discountAmt > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <button
                          onClick={() => setShowDiscount(!showDiscount)}
                          className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors"
                        >
                          <Tag size={9} className="text-[#E0221A]" /> % Desc. <ChevronDown size={9} />
                        </button>
                        <p className="text-sm font-black text-emerald-500">-{fmt(discountAmt)}</p>
                      </div>
                    )}
                    {activeMesa.paymentMethod === "Tarjeta" && activeTerminal && (
                      <div className="flex items-center justify-between gap-3">
                        <button
                          onClick={() => setShowTerminalModal(true)}
                          className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors"
                          title="Comisión interna — la tienda absorbe, no se cobra al cliente"
                        >
                          <Smartphone size={9} className="text-emerald-500" />
                          Comisión {activeTerminal.commission_percent}% <ChevronDown size={9} />
                        </button>
                        <p className="text-[10px] font-bold text-white/30 italic">
                          {fmt(commissionAmt)} interna
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Total — always, prominent */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30">
                    {activeMesa.loadedPreSaleOrderId ? "Total a Cobrar" : activeMesa.isPreventa ? "Total de la Venta" : "Total a Pagar"}
                  </p>
                  <p className="text-[2rem] font-black text-white leading-none">{fmt(currentPayAmount)}</p>
                </div>

                {/* New preventa: anticipo + saldo */}
                {!activeMesa.loadedPreSaleOrderId && activeMesa.isPreventa && activeMesa.items.length > 0 && (
                  <div className="flex flex-col gap-0.5 pt-1 border-t border-white/[0.06]">
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
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Saldo</p>
                      <p className={`text-sm font-black ${(totalBeforeComm - totalDeposit) > 0 ? "text-red-400" : "text-green-400"}`}>
                        {fmt(Math.max(0, totalBeforeComm - totalDeposit))}
                      </p>
                    </div>
                  </div>
                )}

                {/* Loaded preventa breakdown */}
                {activeMesa.loadedPreSaleOrderId && (
                  <div className="flex flex-col gap-0.5 pt-1 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1">
                        <PackageCheck size={9} /> Anticipo
                      </p>
                      <p className="text-sm font-black text-amber-400">{fmt(activeMesa.depositAmount || 0)}</p>
                    </div>
                    {newItemsSubtotal > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">+ Items</p>
                        <p className="text-sm font-black text-white/40">{fmt(newItemsSubtotal)}</p>
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
              </div>

              <div className="w-px self-stretch bg-white/[0.06]" />

              {/* ── Col 2: Payment methods ── */}
              <div className="flex items-center px-4">
                <div className="grid grid-cols-2 gap-1.5 w-[260px]">
                  {(["Efectivo", "Dólares", "Tarjeta", "Transferencia"] as PaymentMethod[]).map(pm => {
                    const isActive = activeMesa.paymentMethod === pm;
                    const isBlocked = hasCashOnly && (pm === "Tarjeta" || pm === "Transferencia");

                    if (pm === "Dólares") {
                      return (
                        <div key={pm} className="relative">
                          <div className={`flex w-full h-[38px] rounded-xl border transition-all overflow-hidden ${
                            isActive
                              ? 'bg-[#E0221A] text-white border-transparent shadow-[0_0_20px_rgba(224,34,26,0.3)]'
                              : 'bg-white/[0.03] text-white/40 border-white/5 hover:bg-white/[0.06] hover:text-white'
                          } ${isBlocked ? 'opacity-20 cursor-not-allowed pointer-events-none' : ''}`}>
                            <button
                              onClick={() => !isBlocked && setPayment(pm)}
                              disabled={isBlocked}
                              className="flex-1 flex flex-col items-center justify-center gap-0.5 group"
                            >
                              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest">
                                {/* <span>$</span> */} DÓLARES
                              </div>
                              <span className={`text-[10px] font-black tracking-wider transition-all ${
                                isActive ? 'text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'text-emerald-500/40'
                              }`}>
                                TC: {tc.toFixed(2)}
                              </span>
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  if (isBlocked) return;
                                  setTcDraft(tc.toString());
                                  setShowTc(!showTc);
                                }}
                                disabled={isBlocked}
                                className={`w-12 border-l flex items-center justify-center transition-all ${
                                  isActive ? 'border-white/20 hover:bg-white/10' : 'border-white/5 hover:bg-white/5'
                                }`}
                              >
                                <SlidersHorizontal size={14} className={isActive ? 'text-white' : 'text-white/20'} />
                              </button>
                            )}
                          </div>

                          {/* Popover Tipo de Cambio */}
                          <AnimatePresence>
                            {showTc && (
                              <Motion.div
                                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 20, scale: 0.8 }}
                                className="absolute bottom-full left-0 mb-6 z-[120] rounded-[40px] p-8 w-[320px] overflow-hidden"
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
                                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Exchange Rate</p>
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
                                        className="w-full bg-black/40 border-2 border-emerald-500/10 rounded-[24px] px-6 py-5 text-4xl font-black text-white outline-none focus:border-emerald-500/40 focus:bg-emerald-500/5 transition-all placeholder:text-white/5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-inner"
                                        placeholder="0.00"
                                        autoFocus
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
                                    <span className="text-[10px] font-black text-white/10 uppercase tracking-[0.4em]">Liquid Transaction</span>
                                  </div>
                                </div>
                                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-emerald-500/5 rounded-full blur-[60px]" />
                                <div className="absolute -top-10 -left-10 w-40 h-40 bg-emerald-500/5 rounded-full blur-[60px]" />
                              </Motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={pm}
                        onClick={() => !isBlocked && setPayment(pm)}
                        disabled={isBlocked}
                        className={`relative h-[38px] px-4 rounded-xl border transition-all font-black uppercase tracking-widest text-[11px] flex flex-col items-center justify-center gap-0 overflow-hidden ${
                          isActive
                            ? 'bg-[#E0221A] text-white border-transparent shadow-[0_0_20px_rgba(224,34,26,0.3)]'
                            : 'bg-white/[0.03] text-white/40 border-white/5 hover:bg-white/[0.06] hover:text-white'
                        } ${isBlocked ? 'opacity-20 cursor-not-allowed grayscale' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          {pm === "Efectivo" && <Zap size={14} className={isActive ? 'text-white' : 'text-[#E0221A]'} />}
                          {isBlocked && <AlertTriangle size={12} className="text-amber-500 animate-pulse" />}
                          {pm}
                        </div>
                        {isActive && pm === "Tarjeta" && activeTerminal && (
                          <span className="text-[7px] font-black opacity-60 uppercase tracking-widest mt-0.5">
                            {activeTerminal.name} ({activeTerminal.commission_percent}%)
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="w-px self-stretch bg-white/[0.06]" />

              {/* ── Col 3: Cash + folio side-by-side, then checkout button ── */}
              <div className={`flex flex-col gap-2 flex-1 pl-4 transition-opacity duration-200 ${activeMesa.items.length === 0 ? "opacity-30 pointer-events-none" : ""}`}>

                {/* Row: cash input (left half) + folio (right half) */}
                <div className="flex gap-2 flex-1">

                  {/* Cash input — only for Efectivo / Dólares */}
                  {(activeMesa.paymentMethod === "Efectivo" || activeMesa.paymentMethod === "Dólares") && (
                    <div className="flex flex-col gap-1 flex-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">
                        {activeMesa.paymentMethod === "Dólares" ? "USD recibido" : "Efectivo recibido"}
                      </p>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-base text-white/30 pointer-events-none">$</span>
                        <input
                          ref={cashInputRef}
                          type="number"
                          min="0"
                          step="0.01"
                          value={cashReceived}
                          onChange={e => setCashReceived(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const received = parseFloat(cashReceived) || 0;
                              const threshold = activeMesa.paymentMethod === "Dólares" ? currentPayAmount / tc : currentPayAmount;
                              if (received >= threshold || cashReceived === "") void handleCheckout();
                            }
                          }}
                          placeholder="0.00"
                          className="w-full text-center rounded-xl py-2 pl-6 pr-3 text-xl font-black placeholder-white/20 focus:outline-none transition-all"
                          style={{
                            background: "var(--td-input-bg)",
                            border: "1px solid var(--td-input-border)",
                            color: "var(--td-input-text)",
                          }}
                          onFocus={e => { e.currentTarget.style.border = "1px solid rgba(224,34,26,0.5)"; }}
                          onBlur={e => { e.currentTarget.style.border = "1px solid var(--td-input-border)"; }}
                        />
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {(activeMesa.paymentMethod === "Dólares" ? [20, 50, 100, 200] : [50, 100, 200, 500]).map(amt => (
                          <button
                            key={amt}
                            onClick={() => setCashReceived(prev => ((parseFloat(prev) || 0) + amt).toString())}
                            className="py-1 rounded-lg font-black text-[10px] transition-all"
                            style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", color: "var(--td-text-lo)" }}
                            onMouseEnter={e => { e.currentTarget.style.background = "var(--td-hover-bg)"; e.currentTarget.style.color = "var(--td-text-hi)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "var(--td-card-bg)"; e.currentTarget.style.color = "var(--td-text-lo)"; }}
                          >
                            ${amt}
                          </button>
                        ))}
                      </div>
                      {(() => {
                        const receivedNum = parseFloat(cashReceived) || 0;
                        const totalInCurrency = activeMesa.paymentMethod === "Dólares" ? currentPayAmount / tc : currentPayAmount;
                        const fmtChange = activeMesa.paymentMethod === "Dólares" ? fmtUSD : fmt;
                        const cambio = receivedNum - totalInCurrency;
                        if (receivedNum <= 0) return null;
                        return (
                          <div className={`rounded-lg px-3 py-1 flex items-center justify-between border ${cambio >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{cambio >= 0 ? "Cambio" : "Falta"}</span>
                            <span className={`text-sm font-black ${cambio >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtChange(Math.abs(cambio))}</span>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Folio / preventa search */}
                  <div className="flex flex-col gap-1 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Buscar preventa</p>
                    <input
                      type="text"
                      value={folioInput}
                      onChange={e => setFolioInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { void searchByFolio(folioInput); } }}
                      placeholder="Folio PS-XXXX"
                      className="w-full rounded-xl py-2 px-3 text-[11px] font-black uppercase tracking-widest placeholder:normal-case placeholder:font-normal placeholder:tracking-normal focus:outline-none transition-all"
                      style={{ background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", color: "var(--td-input-text)" }}
                      onFocus={e => { e.currentTarget.style.border = "1px solid rgba(245,158,11,0.5)"; }}
                      onBlur={e => { e.currentTarget.style.border = "1px solid var(--td-input-border)"; }}
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { void searchByFolio(folioInput); }}
                        disabled={!folioInput.trim() || folioLoading}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl border transition-all disabled:opacity-30 text-[10px] font-black uppercase tracking-widest"
                        style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: "#F59E0B" }}
                      >
                        {folioLoading ? <Loader2 size={12} className="animate-spin" /> : <ScanLine size={12} />}
                        Buscar
                      </button>
                      <button
                        onClick={() => { void openPreSalesModal('liquidar'); }}
                        className="flex items-center justify-center px-3 py-1.5 rounded-xl border transition-all bg-white/[0.03] border-white/10 text-white/30 hover:text-white/60 hover:bg-white/[0.06]"
                      >
                        <PackageCheck size={13} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Checkout button — full width */}
                {(() => {
                  const receivedNum = parseFloat(cashReceived) || 0;
                  const totalInCurrency = activeMesa.paymentMethod === "Dólares" ? currentPayAmount / tc : currentPayAmount;
                  const isInsufficient = (activeMesa.paymentMethod === "Efectivo" || activeMesa.paymentMethod === "Dólares")
                    && receivedNum > 0 && receivedNum < totalInCurrency;
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
                      className="w-full group relative flex items-center justify-center gap-2 py-3 rounded-[18px] overflow-hidden transition-all disabled:opacity-30 disabled:grayscale"
                    >
                      <div className="absolute inset-0 bg-[#E0221A] group-hover:bg-[#f0221a] transition-colors" />
                      <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent" />
                      <Zap size={16} className="relative z-10 text-white animate-pulse" />
                      <span className="relative z-10 text-[13px] font-black uppercase tracking-widest text-white">{label}</span>
                    </button>
                  );
                })()}

              </div>
            </div>
          </div>
        </div>
      </div>
      
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
              className="relative border border-white/10 rounded-[32px] p-8 w-full max-w-md shadow-2xl overflow-hidden"
              style={{
                background: "var(--td-popup-bg)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 0 100px rgba(0,0,0,0.8), inset 0 0 40px rgba(16,185,129,0.05)"
              }}
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
              
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-[0.2em]">Terminales</h3>
                  <p className="text-[10px] font-black text-emerald-500/50 uppercase tracking-widest mt-1">Seleccione lectora de pago</p>
                </div>
                <button 
                  onClick={() => setShowTerminalModal(false)}
                  className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto no-scrollbar pr-2">
                {terminals.length === 0 ? (
                  <div className="py-12 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto">
                      <Zap size={24} className="text-white/10" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No hay terminales configuradas</p>
                  </div>
                ) : (
                  terminals.map(t => (
                    <button
                      key={t.id}
                      onClick={() => selectTerminal(t.id)}
                      className={`w-full group relative flex items-center justify-between p-5 rounded-2xl border transition-all ${
                        activeMesa.selectedTerminalId === t.id 
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-white' 
                          : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/[0.08] hover:border-white/10 hover:text-white'
                      }`}
                    >
                      <div className="text-left">
                        <h4 className="font-black text-sm uppercase tracking-widest group-hover:translate-x-1 transition-transform">{t.name}</h4>
                        <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest mt-1">{t.description || "Sin descripción"}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-lg font-black ${activeMesa.selectedTerminalId === t.id ? 'text-emerald-500' : 'text-white/20 group-hover:text-emerald-500/50'} transition-colors`}>
                          {t.commission_percent}%
                        </span>
                        <p className="text-[8px] font-bold opacity-20 uppercase tracking-[0.2em] mt-0.5">Comisión</p>
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-white/5">
                <div className="p-4 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/70">Política de comisión</p>
                  <p className="text-[9px] font-bold text-white/40 mt-1 leading-relaxed">
                    La tienda absorbe la comisión de tarjeta. El cliente solo paga el subtotal del carrito. La comisión se registra internamente para reportes.
                  </p>
                </div>
              </div>
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
              className="relative border border-white/10 rounded-[32px] p-8 w-full max-w-sm shadow-2xl overflow-hidden"
              style={{
                background: "var(--td-popup-bg)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 0 100px rgba(0,0,0,0.8), inset 0 0 40px rgba(16,185,129,0.05)"
              }}
            >
              <h3 className="text-xl font-black text-white uppercase tracking-[0.2em] mb-8 text-center">Descuento</h3>
              <div className="grid grid-cols-2 gap-4">
                {[5, 10, 25, 50].map(pct => (
                  <button 
                    key={pct}
                    onClick={() => { toggleDiscount(pct); setShowDiscount(false); }}
                    className={`py-4 rounded-2xl border transition-all font-black ${
                      activeMesa.discount === pct 
                        ? 'bg-[#E0221A] text-white border-transparent' 
                        : 'bg-white/[0.04] text-white/40 border-white/5 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <button
                onClick={() => { toggleDiscount(0); setShowDiscount(false); }}
                className="w-full mt-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-colors"
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

            return (
              <button
                onClick={() => addCatalogToCart(catalog)}
                style={{ textAlign: "left", borderRadius: 14, background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", cursor: "pointer", padding: "14px", display: "flex", flexDirection: "column", gap: 8, transition: "border-color 0.15s, transform 0.1s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = `${ac}0.4)`; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--td-card-border)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--td-text-ghost)" }}>
                    {catalog.category?.name ?? "Preventa"}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 20, color: "#F59E0B", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
                    Disponible
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 800, lineHeight: 1.3, color: "var(--td-text-hi)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {catalog.product_name}
                </p>
                {catalog.preorder_limit != null && (
                  <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: "var(--td-text-lo)" }}>
                    {catalog.reserved_count ?? 0} / {catalog.preorder_limit} reservados
                  </p>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {prices.map((x, i) => (
                    <button
                      key={x.level}
                      onClick={e => { e.stopPropagation(); addCatalogToCart(catalog, x.level); }}
                      style={{ fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 6, cursor: "pointer", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", color: "#F59E0B", transition: "background 0.12s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(245,158,11,0.25)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(245,158,11,0.12)"; }}
                    >
                      P{i + 1} {fmt(x.price)}
                    </button>
                  ))}
                </div>
                <div style={{ borderTop: "1px solid var(--td-card-border)", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <p style={{ margin: 0, fontSize: 9, color: "var(--td-text-ghost)", fontWeight: 700 }}>
                    {catalog.advance_payment > 0 ? `Anticipo mín. ${fmt(catalog.advance_payment)}` : "Sin anticipo mínimo"}
                  </p>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#F59E0B" }}>{fmt(catalog.price_1 ?? 0)}</p>
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
                    <h3 className="text-lg font-black text-white uppercase tracking-[0.15em]">Apartar Producto</h3>
                    <p className="text-[9px] font-black text-amber-500/50 uppercase tracking-widest mt-0.5">
                      {activeMesa.customerName ?? "cliente"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowApartarModal(false)}
                  disabled={apartarProcessing}
                  className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Product selection */}
                {activeMesa.items.length > 1 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Producto a apartar</p>
                    <div className="space-y-2 max-h-[180px] overflow-y-auto no-scrollbar">
                      {activeMesa.items.map((item, idx) => (
                        <button
                          key={item.product.id}
                          onClick={() => setApartarItemIdx(idx)}
                          className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${
                            apartarItemIdx === idx
                              ? "bg-amber-500/10 border-amber-500/30"
                              : "bg-white/[0.03] border-white/5 hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full shrink-0 ${apartarItemIdx === idx ? "bg-amber-500" : "bg-white/20"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-white truncate">{item.product.name}</p>
                            <p className="text-[9px] text-white/30 font-bold">{item.product.sku}</p>
                          </div>
                          <p className="text-sm font-black text-white shrink-0">{fmt(getItemPrice(item) * item.quantity)}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Selected product summary */}
                {activeMesa.items[apartarItemIdx] && (
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/5">
                    <ImageWithFallback
                      src={activeMesa.items[apartarItemIdx].product.image ?? ""}
                      className="w-12 h-12 rounded-xl object-cover bg-black shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-white truncate">{activeMesa.items[apartarItemIdx].product.name}</p>
                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{activeMesa.items[apartarItemIdx].product.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-white">{fmt(getItemPrice(activeMesa.items[apartarItemIdx]) * activeMesa.items[apartarItemIdx].quantity)}</p>
                      <p className="text-[9px] text-white/30 font-bold">total</p>
                    </div>
                  </div>
                )}

                {/* Down payment */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Anticipo *</p>
                  <div className="flex items-center gap-3 bg-amber-500/5 border border-amber-500/20 rounded-2xl px-4 py-3">
                    <span className="text-amber-500 font-black text-lg">$</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="0.00"
                      value={apartarDownPayment}
                      onChange={e => setApartarDownPayment(e.target.value)}
                      className="flex-1 bg-transparent outline-none text-2xl font-black text-white placeholder:text-white/10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">MXN</span>
                  </div>
                  {activeMesa.items[apartarItemIdx] && parseFloat(apartarDownPayment) > 0 && (
                    <p className="text-[9px] font-bold text-amber-500/60 mt-1.5 text-right">
                      Saldo restante: {fmt(Math.max(0, getItemPrice(activeMesa.items[apartarItemIdx]) * activeMesa.items[apartarItemIdx].quantity - (parseFloat(apartarDownPayment) || 0)))}
                    </p>
                  )}
                </div>

                {/* Payment method */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Forma de pago del anticipo</p>
                  <div className="grid grid-cols-2 gap-2">
                    {paymentMethods.map(pm => (
                      <button
                        key={pm.id}
                        onClick={() => setApartarPayMethodId(String(pm.id))}
                        className={`py-2.5 px-4 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                          apartarPayMethodId === String(pm.id)
                            ? "bg-amber-500/15 border-amber-500/40 text-amber-500"
                            : "bg-white/[0.03] border-white/5 text-white/30 hover:text-white hover:bg-white/[0.06]"
                        }`}
                      >
                        {pm.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Expiry date (optional) */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2 flex items-center gap-2">
                    <Calendar size={10} />
                    Fecha límite de entrega <span className="text-white/20 normal-case font-bold">(opcional)</span>
                  </p>
                  <input
                    type="date"
                    value={apartarExpiresAt}
                    onChange={e => setApartarExpiresAt(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-amber-500/30 focus:bg-amber-500/5 transition-all [color-scheme:dark]"
                  />
                </div>

                {/* Notes (optional) */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">
                    Notas <span className="text-white/20 normal-case font-bold">(opcional)</span>
                  </p>
                  <input
                    type="text"
                    placeholder="Ej: Cliente pagará el viernes..."
                    value={apartarNotes}
                    onChange={e => setApartarNotes(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-2.5 text-sm font-bold text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all"
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
        />
      )}

      {/* ── Modal: Imprimir Ticket ────────────────────────────────────────── */}
      {showPrintModal && lastCompletedSale && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowPrintModal(false)} />
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

            {/* Sale summary */}
            <div style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)", borderRadius: 16, padding: "12px 16px", marginBottom: 20, maxHeight: 160, overflowY: "auto" }}>
              {lastCompletedSale.items.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: i < lastCompletedSale.items.length - 1 ? "1px solid var(--td-card-border)" : "none" }}>
                  <span style={{ fontSize: 11, color: "var(--td-text-hi)", fontWeight: 700 }}>{item.name} ×{item.quantity}</span>
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

      {/* ── Modal: Historial de Ventas ────────────────────────────────────── */}
      {showHistorialModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowHistorialModal(false)} />
          <div style={{ position: "relative", background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", borderRadius: 28, padding: 28, width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(224,34,26,0.1)", border: "1px solid rgba(224,34,26,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <History size={18} color="#E0221A" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "var(--td-text-hi)" }}>Historial del Día</h3>
                  <p style={{ margin: "2px 0 0", fontSize: 9, fontWeight: 700, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.15em" }}>
                    {activeStore?.name ?? "Tienda"} · {historialEntries.length} eventos hoy
                  </p>
                </div>
              </div>
              <button onClick={() => setShowHistorialModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--td-text-ghost)", padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
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

                  return historialEntries.map(entry => {
                  const entryKey = `${entry.type}-${entry.data.id}`;
                  const isOpen = expandedEntryKey === entryKey;

                  // ── VENTA PARTE DE UN PAR MIXTO → skip (la renderiza el bloque de preventa) ──
                  if (entry.type === 'sale' && pairedSaleIds.has(entry.data.id!)) return null;

                  // ── VENTA REGULAR ────────────────────────────────────────────
                  if (entry.type === 'sale') {
                    const sale = entry.data;
                    const first = sale.payments?.[0];
                    const method = first?.payment_method?.name ?? "Efectivo";
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
                              <span style={{ fontSize: 9, fontWeight: 700, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{method}</span>
                              <span style={{ fontSize: 9, color: "var(--td-text-ghost)" }}>· {itemCount} art.</span>
                              {sale.status === "returned" && <span style={{ fontSize: 8, fontWeight: 900, color: "#f59e0b", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 999, padding: "1px 6px" }}>Devuelta</span>}
                            </div>
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 900, color: "var(--td-text-hi)", flexShrink: 0 }}>{fmt(sale.total)}</span>
                          <div onClick={e => { e.stopPropagation(); doPrintTicket({ id: sale.id, total: sale.total, paymentMethod: method, customerName: sale.customer?.name, items: (sale.items || []).map(i => ({ name: i.product?.name || String(i.product_id), quantity: i.quantity, price: i.price })), soldAt: dateStr }); }}
                            role="button" title="Reimprimir ticket"
                            style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 9, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--td-text-lo)" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(224,34,26,0.1)"; (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(224,34,26,0.3)"; (e.currentTarget as HTMLDivElement).style.color = "#E0221A"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--td-input-bg)"; (e.currentTarget as HTMLDivElement).style.borderColor = "var(--td-input-border)"; (e.currentTarget as HTMLDivElement).style.color = "var(--td-text-lo)"; }}>
                            <Printer size={13} />
                          </div>
                        </button>
                        {isOpen && (
                          <div style={{ borderTop: "1px solid var(--td-card-border)", padding: "12px 14px 14px", background: "rgba(0,0,0,0.15)" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                              {(sale.items || []).length === 0
                                ? <p style={{ fontSize: 10, color: "var(--td-text-ghost)", textAlign: "center", padding: "8px 0" }}>Sin detalle</p>
                                : (sale.items || []).map((item, idx) => (
                                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: idx < (sale.items || []).length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                    <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "var(--td-text-hi)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.product?.name || `#${item.product_id}`}</span>
                                    {item.product?.sku && <span style={{ fontSize: 8, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.1em", flexShrink: 0 }}>{item.product.sku}</span>}
                                    <span style={{ fontSize: 10, color: "var(--td-text-ghost)", flexShrink: 0 }}>×{item.quantity}</span>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--td-text-md)", flexShrink: 0, width: 52, textAlign: "right" }}>{fmt(item.price)}</span>
                                    <span style={{ fontSize: 11, fontWeight: 900, color: "var(--td-text-hi)", flexShrink: 0, width: 62, textAlign: "right" }}>{fmt(item.price * item.quantity)}</span>
                                  </div>
                                ))}
                            </div>
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
                            {paidAmt > 0 && <span style={{ fontSize: 9, color: "#34d399", fontWeight: 700 }}>Anticipo {fmt(paidAmt)}</span>}
                            {isMixed && regularTotal > 0 && <span style={{ fontSize: 9, color: "#E0221A", fontWeight: 700 }}>Venta {fmt(regularTotal)}</span>}
                            {balance > 0 && !isMixed && <span style={{ fontSize: 9, color: "#f59e0b", fontWeight: 700 }}>Saldo {fmt(balance)}</span>}
                            {order.status === "delivered" && <span style={{ fontSize: 8, fontWeight: 900, color: "#34d399", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 999, padding: "1px 6px" }}>Liquidada</span>}
                          </div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 900, color: isMixed ? "#a78bfa" : "#f59e0b", flexShrink: 0 }}>{fmt(isMixed ? grandTotal : (order.total ?? 0))}</span>
                        <div
                          onClick={e => {
                            e.stopPropagation();
                            doPrintTicket({
                              total: isMixed ? grandTotal : paidAmt,
                              paymentMethod: isMixed ? regularMethod : (order.payments?.[0]?.payment_method?.name ?? "Efectivo"),
                              customerName: order.customer?.name,
                              items: isMixed ? regularItems.map(i => ({ name: i.product?.name || String(i.product_id), quantity: i.quantity, price: i.price })) : [],
                              soldAt: order.created_at,
                              preSaleCode: order.code,
                              preSaleItems: orderItems.map(i => ({ name: i.catalog?.product_name ?? `Artículo #${i.id}`, quantity: i.quantity, unitPrice: i.unit_price })),
                              preSaleAnticipo: paidAmt,
                            });
                          }}
                          role="button" title="Imprimir ticket"
                          style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 9, background: isMixed ? "rgba(139,92,246,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${isMixed ? "rgba(139,92,246,0.2)" : "rgba(245,158,11,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: isMixed ? "rgba(139,92,246,0.6)" : "rgba(245,158,11,0.6)" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = isMixed ? "rgba(139,92,246,0.15)" : "rgba(245,158,11,0.15)"; (e.currentTarget as HTMLDivElement).style.color = isMixed ? "#a78bfa" : "#f59e0b"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isMixed ? "rgba(139,92,246,0.08)" : "rgba(245,158,11,0.08)"; (e.currentTarget as HTMLDivElement).style.color = isMixed ? "rgba(139,92,246,0.6)" : "rgba(245,158,11,0.6)"; }}>
                          <Printer size={13} />
                        </div>
                      </button>
                      {isOpen && (
                        <div style={{ borderTop: `1px solid ${isMixed ? "rgba(139,92,246,0.15)" : "rgba(245,158,11,0.15)"}`, padding: "12px 14px 14px", background: "rgba(0,0,0,0.15)" }}>

                          {/* Preventa items section */}
                          <p style={{ margin: "0 0 6px", fontSize: 8, fontWeight: 900, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.12em" }}>★ Preventa · {order.code}</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                            {orderItems.length === 0
                              ? <p style={{ fontSize: 10, color: "var(--td-text-ghost)", textAlign: "center", padding: "8px 0" }}>Sin artículos</p>
                              : orderItems.map((item, idx) => (
                                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: idx < orderItems.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                  <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "var(--td-text-hi)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.catalog?.product_name ?? `Artículo #${item.id}`}</span>
                                  <span style={{ fontSize: 8, color: item.status === "delivered" ? "#34d399" : "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>{item.status === "delivered" ? "Entregado" : "Pendiente"}</span>
                                  <span style={{ fontSize: 10, color: "var(--td-text-ghost)", flexShrink: 0 }}>×{item.quantity}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--td-text-md)", flexShrink: 0, width: 52, textAlign: "right" }}>{fmt(item.unit_price)}</span>
                                  <span style={{ fontSize: 11, fontWeight: 900, color: "var(--td-text-hi)", flexShrink: 0, width: 62, textAlign: "right" }}>{fmt(item.subtotal)}</span>
                                </div>
                              ))}
                          </div>

                          {/* Regular sale items section (only for mixed) */}
                          {isMixed && regularItems.length > 0 && (
                            <>
                              <p style={{ margin: "8px 0 6px", fontSize: 8, fontWeight: 900, color: "#E0221A", textTransform: "uppercase", letterSpacing: "0.12em" }}>Productos vendidos</p>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                                {regularItems.map((item, idx) => (
                                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: idx < regularItems.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
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
                            {paidAmt > 0 && <div style={{ textAlign: "right" }}><p style={{ margin: 0, fontSize: 8, fontWeight: 900, color: "var(--td-text-ghost)", textTransform: "uppercase" }}>Anticipo preventa</p><p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 900, color: "#34d399" }}>{fmt(paidAmt)}</p></div>}
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

            {/* Refresh */}
            <button
              onClick={() => { void fetchHistorial(); }}
              style={{ marginTop: 14, background: "var(--td-input-bg)", border: "1px solid var(--td-input-border)", borderRadius: 14, color: "var(--td-text-lo)", padding: "10px", fontSize: 10, fontWeight: 900, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.12em", width: "100%" }}
            >
              Actualizar historial
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
