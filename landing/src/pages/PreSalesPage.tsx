import React, { useState, useEffect, useMemo, useRef, useContext } from "react";
import {
  Plus, Search, X, CheckCircle2, AlertCircle,
  PackageCheck, CreditCard,
  ShoppingBag, Loader2, ScanLine, UserPlus,
  Users, Phone, Package,
  Minus, Trash2, QrCode, ArrowRight,
  Clock, Check, MessageCircle,
  Wallet, TrendingUp, ChevronRight,
  XCircle, PackageOpen, History,
  DollarSign,
} from "lucide-react";
import { motion as Motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  getPreSales, getPreSalePayments, createPreSale, addPreSalePayment,
  updatePreSaleStatus, getCustomers, createCustomer, getProducts,
  lookupCardCode, searchExternalCustomers, getPreSaleOrders, getPreSaleCatalogs,
} from "@tadaima/api";
import type { PreSaleCatalog, ExternalCardLookup } from "@tadaima/api";
import { LiquidateModal } from "@/components/presales/LiquidateModal";
import type {
  PreSale as ApiPreSale,
  PreSalePayment as ApiPreSalePayment,
  Customer as ApiCustomer,
  Product as ApiProduct,
} from "@tadaima/api";
import { useActiveStore } from "@/contexts/StoreContext";
import { ImageWithFallback } from "@/components/figma/ImageWithFallback";
import { useAuth } from "@tadaima/auth";
import { PreSalesOpsPanel } from "@/components/presales/PreSalesOpsPanel";
import { PreSaleCatalogsPanel } from "@/components/presales/PreSaleCatalogsPanel";
import { PreSaleOrdersPanel } from "@/components/presales/PreSaleOrdersPanel";
import { PreSaleDifusionPanel } from "@/components/presales/PreSaleDifusionPanel";
import { AdminStoreFilter } from "@/components/presales/AdminStoreFilter";

// ─── Paleta Tadaima ───────────────────────────────────────────────────────────
const T = {
  bgGrad: "var(--td-page-bg)",
  glass: {
    background: "var(--td-panel-bg)",
    backdropFilter: "blur(28px) saturate(160%)",
    WebkitBackdropFilter: "blur(28px) saturate(160%)",
    border: "1px solid var(--td-panel-border)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04)",
  } as React.CSSProperties,
  glassMd: {
    background: "var(--td-card-bg)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid var(--td-card-border)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
  } as React.CSSProperties,
  textPrimary: "var(--td-text-hi)",
  textSecondary: "var(--td-text-md)",
  textMuted: "var(--td-text-lo)",
  redBright: "#FF4422",
  redGlow: "rgba(204,34,0,0.45)",
  redGlowSm: "rgba(204,34,0,0.22)",
  btnRed: {
    background: "linear-gradient(135deg, #CC2200 0%, #FF4422 100%)",
    borderRadius: "9999px",
    border: "1px solid rgba(255,120,90,0.3)",
    boxShadow: "0 0 28px rgba(204,34,0,0.45), 0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,180,160,0.25)",
    color: "#ffffff",
  } as React.CSSProperties,
};

// ─── UI Types ─────────────────────────────────────────────────────────────────
type UIStatus = "abierta" | "confirmada" | "cancelada" | "entregada" | "vencida";
type CustomerMode = "search" | "new";

interface CustomerUI {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  external_member_id?: string;
}

interface ProductUI {
  id: number;
  name: string;
  sku: string;
  image: string;
  price_a: number;
  price_b: number;
  price_c: number;
  stock: number;
}

interface CartItem {
  id: string;
  product_id: number;
  product_name: string;
  product_image: string;
  product_sku: string;
  quantity: number;
  price: number;
  price_level: "A" | "B" | "C";
  price_a: number;
  price_b: number;
  price_c: number;
  max_stock: number;
  deposit_amount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n || 0);

/** Map API status → display status */
function apiStatusToUI(status: string): UIStatus {
  switch (status) {
    case "live":      return "abierta";
    case "ready":     return "confirmada";
    case "completed": return "entregada";
    case "cancelled": return "cancelada";
    case "expired":   return "vencida";
    default:          return "abierta";
  }
}

function normalizeApiProduct(p: ApiProduct): ProductUI {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    image: "",
    price_a: Number(p.prices?.price_1 ?? 0) || 0,
    price_b: Number(p.prices?.price_2 ?? 0) || 0,
    price_c: Number(p.prices?.price_3 ?? 0) || 0,
    stock: p.stock_total ?? 0,
  };
}

function normalizeApiCustomer(c: ApiCustomer): CustomerUI {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone ?? undefined,
    email: c.email ?? undefined,
    external_member_id: c.external_member_id ?? undefined,
  };
}

function priceLevelNum(level: "A" | "B" | "C"): number {
  return level === "A" ? 1 : level === "B" ? 2 : 3;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function PreSalesPage() {
  const { activeStore, stores } = useActiveStore();
  const { user } = useAuth();
  const isAdmin = user?.roles?.some(r =>
    ["admin","super_admin","owner","dueño"].includes(r.toLowerCase())
  ) ?? false;
  const [adminTab, setAdminTab] = useState<"folios" | "difusion" | "catalogos">("folios");
  const [foliosPendingCount, setFoliosPendingCount] = useState<number | null>(null);
  const [arrivedCatalogs, setArrivedCatalogs] = useState<PreSaleCatalog[]>([]);
  const [arrivedLoading, setArrivedLoading] = useState(false);
  const [storeFilter, setStoreFilter] = useState<number | "all">("all");
  const [preSales, setPreSales]     = useState<ApiPreSale[]>([]);
  const [loading, setLoading]       = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<UIStatus | "all">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);


  // ── Datos para el modal ────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<CustomerUI[]>([]);
  const [products, setProducts]   = useState<ProductUI[]>([]);
  const [loadingModal, setLoadingModal] = useState(false);

  // ── Estado del modal de nueva preventa ─────────────────────────────────────
  const [custMode, setCustMode]             = useState<CustomerMode>("search");
  const [custSearch, setCustSearch]         = useState("");
  const [showCustDrop, setShowCustDrop]     = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerUI | null>(null);
  const [isScanning, setIsScanning]         = useState(false);
  const [scanInput, setScanInput]           = useState("");
  const [newCustName, setNewCustName]       = useState("");
  const [newCustPhone, setNewCustPhone]     = useState("");
  const [newCustEmail, setNewCustEmail]     = useState("");
  const [pendingExtId,  setPendingExtId]    = useState<string | null>(null);
  const [pendingExtNivel, setPendingExtNivel] = useState<string | null>(null);
  const [extSearchResults, setExtSearchResults] = useState<ExternalCardLookup[]>([]);
  const [prodSearch, setProdSearch]         = useState("");
  const [showProdDrop, setShowProdDrop]     = useState(false);
  const [cartItems, setCartItems]           = useState<CartItem[]>([]);
  const [notes, setNotes]                   = useState("");

  // ── Estado del panel de detalle ────────────────────────────────────────────
  const [detailPreSale, setDetailPreSale]   = useState<ApiPreSale | null>(null);
  const [detailPayments, setDetailPayments] = useState<ApiPreSalePayment[]>([]);
  const [isDetailOpen, setIsDetailOpen]     = useState(false);
  const [loadingDetail, setLoadingDetail]   = useState(false);

  // Abono form
  const [isAbonoOpen, setIsAbonoOpen]     = useState(false);
  const [abonoAmount, setAbonoAmount]     = useState<number | "">("");
  const [abonoMethod, setAbonoMethod]     = useState("Efectivo");
  const [abonoNote, setAbonoNote]         = useState("");
  const [savingAbono, setSavingAbono]     = useState(false);

  // Confirmación de acciones
  const [confirmAction, setConfirmAction] = useState<"cancel" | "deliver" | null>(null);
  const [cancelReason, setCancelReason]   = useState("");

  // Liquidate modal
  const [liquidatePreSale, setLiquidatePreSale] = useState<ApiPreSale | null>(null);

  // Refs
  const custDropRef  = useRef<HTMLDivElement>(null);
  const prodDropRef  = useRef<HTMLDivElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch preventas ────────────────────────────────────────────────────────
  const fetchPreSales = async (storeId?: number) => {
    try {
      setLoading(true);
      const res = await getPreSales(storeId ? { store_id: storeId } : undefined);
      setPreSales(res.data);
    } catch {
      toast.error("Error al sincronizar preventas");
    } finally {
      setLoading(false);
    }
  };

  // Un solo efecto que espera al user y reacciona al filtro de tienda
  useEffect(() => {
    if (!user) return;
    const storeId = isAdmin
      ? (storeFilter !== "all" ? storeFilter : undefined)
      : (user.store_id ?? undefined);
    fetchPreSales(storeId);
  }, [user?.id, isAdmin, storeFilter]);

  // ── Catálogos llegados (tab comentado, lógica deshabilitada) ──────────────
  // useEffect(() => {
  //   if (adminTab !== "llegados") return;
  //   setArrivedLoading(true);
  //   getPreSaleCatalogs({ status: 'arrived', per_page: 200 })
  //     .then(res => setArrivedCatalogs(res.data))
  //     .catch(() => toast.error("No se pudieron cargar los catálogos llegados"))
  //     .finally(() => setArrivedLoading(false));
  // }, [adminTab]);

  // ── Count de folios pendientes para badge ──────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const storeId = !isAdmin && user.store_id ? user.store_id : undefined;
    Promise.allSettled([
      getPreSaleOrders({ status: 'pending', per_page: 1, ...(storeId ? { store_id: storeId } : {}) }),
      getPreSaleOrders({ status: 'ready',   per_page: 1, ...(storeId ? { store_id: storeId } : {}) }),
    ]).then(([p, r]) => {
      const pCount = p.status === 'fulfilled' ? p.value.pagination.total : 0;
      const rCount = r.status === 'fulfilled' ? r.value.pagination.total : 0;
      setFoliosPendingCount(pCount + rCount);
    });
  }, [user?.id, isAdmin]);

  // ── Abrir panel de detalle ──────────────────────────────────────────────────
  const openDetail = async (ps: ApiPreSale) => {
    setDetailPreSale(ps);
    setDetailPayments([]);
    setIsDetailOpen(true);
    setIsAbonoOpen(false);
    setAbonoAmount("");
    setAbonoMethod("Efectivo");
    setAbonoNote("");
    setConfirmAction(null);
    setCancelReason("");
    setLoadingDetail(true);
    try {
      const payments = await getPreSalePayments(ps.id);
      setDetailPayments(payments);
    } catch {
      toast.error("Error al cargar historial de pagos");
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeDetail = () => {
    setIsDetailOpen(false);
    setDetailPreSale(null);
    setDetailPayments([]);
    setIsAbonoOpen(false);
    setConfirmAction(null);
  };

  // ── Registrar abono ────────────────────────────────────────────────────────
  const handleAddAbono = async () => {
    if (!detailPreSale) return;
    const amount  = Number(abonoAmount);
    const balance = detailPreSale.balance ?? 0;
    if (!amount || amount <= 0) { toast.error("Ingresa un monto válido"); return; }
    if (amount > balance) {
      toast.error(`El abono no puede exceder el saldo pendiente (${fmt(balance)})`);
      return;
    }
    setSavingAbono(true);
    try {
      const updatedPS = await addPreSalePayment(detailPreSale.id, {
        amount,
        payment_method_id: 1, // Efectivo/Dólares → ID 1
        notes: abonoNote.trim() || undefined,
      });
      setDetailPreSale(updatedPS);
      setPreSales(prev => prev.map(p => p.id === updatedPS.id ? updatedPS : p));
      // Reload payment history
      const payments = await getPreSalePayments(detailPreSale.id);
      setDetailPayments(payments);
      setIsAbonoOpen(false);
      setAbonoAmount("");
      setAbonoNote("");
      const isLiquidacion = (updatedPS.balance ?? 0) <= 0;
      if (isLiquidacion) {
        toast.success("¡Saldo liquidado completamente! Ya puede entregarse.");
      } else {
        toast.success(`Abono de ${fmt(amount)} registrado con éxito`);
      }
    } catch {
      toast.error("Error al registrar abono");
    } finally {
      setSavingAbono(false);
    }
  };

  // ── Cambiar status ─────────────────────────────────────────────────────────
  const handleStatusChange = async (newUIStatus: "entregada" | "cancelada") => {
    if (!detailPreSale) return;
    const apiStatus = newUIStatus === "entregada" ? "completed" : "cancelled";
    try {
      const updated = await updatePreSaleStatus(detailPreSale.id, {
        status: apiStatus,
        cancel_reason: cancelReason || undefined,
      });
      setDetailPreSale(updated);
      setPreSales(prev => prev.map(p => p.id === updated.id ? updated : p));
      setConfirmAction(null);
      setCancelReason("");
      if (newUIStatus === "entregada") {
        toast.success("¡Preventa entregada con éxito!");
      } else {
        toast.success("Preventa cancelada. El cupo ha sido devuelto a Preventas.");
      }
    } catch {
      toast.error("Error al actualizar estado");
    }
  };

  // ── Fetch clientes y productos al abrir modal ──────────────────────────────
  const openModal = async () => {
    setIsModalOpen(true);
    resetModal();
    if (customers.length > 0 && products.length > 0) return;
    setLoadingModal(true);
    try {
      const [custRes, prodRes] = await Promise.all([
        getCustomers({ per_page: 200 }),
        getProducts({ per_page: 200 }),
      ]);
      setCustomers(custRes.data.map(normalizeApiCustomer));
      setProducts(prodRes.data.map(normalizeApiProduct));
    } catch {
      toast.error("Error al cargar datos");
    } finally {
      setLoadingModal(false);
    }
  };

  const resetModal = () => {
    setCustMode("search");
    setCustSearch("");
    setSelectedCustomer(null);
    setNewCustName("");
    setNewCustPhone("");
    setCartItems([]);
    setNotes("");
    setProdSearch("");
    setIsScanning(false);
    setScanInput("");
  };

  const closeModal = () => { setIsModalOpen(false); resetModal(); };

  // ── Click fuera ────────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (custDropRef.current && !custDropRef.current.contains(e.target as Node)) setShowCustDrop(false);
      if (prodDropRef.current && !prodDropRef.current.contains(e.target as Node)) setShowProdDrop(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // ── Filtros autocomplete cliente ───────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    const q = custSearch.toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.external_member_id || "").toLowerCase().includes(q)
    ).slice(0, 8);
  }, [customers, custSearch]);

  // Supabase fallback cuando el buscador de clientes no encuentra en POS
  useEffect(() => {
    setExtSearchResults([]);
    const q = custSearch.trim();
    if (!q || q.length < 2 || filteredCustomers.length > 0) return;
    const t = setTimeout(async () => {
      try {
        const exts = await searchExternalCustomers(q);
        setExtSearchResults(exts);
      } catch { /* silencioso */ }
    }, 400);
    return () => clearTimeout(t);
  }, [custSearch, filteredCustomers.length]);

  const handleAddExtSearchCustomer = async (ext: ExternalCardLookup) => {
    try {
      const newCust = await createCustomer({
        name:               ext.name ?? ext.external_member_id,
        phone:              ext.phone ?? undefined,
        email:              ext.email || undefined,
        external_member_id: ext.external_member_id,
        loyalty_tier:       ext.nivel ?? undefined,
      });
      const ui = normalizeApiCustomer(newCust);
      setCustomers(prev => [ui, ...prev]);
      setSelectedCustomer(ui);
      setCustSearch(ui.name);
      setShowCustDrop(false);
      setExtSearchResults([]);
      toast.success(`Socio Tadaima agregado: ${ui.name}`);
    } catch {
      toast.error("No se pudo agregar al socio");
    }
  };

  // ── Filtros autocomplete producto ──────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const conStock = products.filter(p => p.stock > 0);
    const q = prodSearch.toLowerCase();
    if (!q) return conStock.slice(0, 8);
    return conStock.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q)
    ).slice(0, 8);
  }, [products, prodSearch]);

  // ── Escáner simulado ───────────────────────────────────────────────────────
  const handleScan = () => {
    setIsScanning(true);
    setTimeout(() => scanInputRef.current?.focus(), 100);
  };

  const processScan = async (code: string) => {
    if (!code.trim()) return;
    const trimmed = code.trim().toUpperCase();

    // 1. Match local list by external_member_id first, then phone/id
    const localFound = customers.find(c =>
      (c.external_member_id && c.external_member_id.toUpperCase() === trimmed) ||
      c.phone === code.trim() ||
      String(c.id) === code.trim()
    );
    if (localFound) {
      setSelectedCustomer(localFound);
      setCustSearch(localFound.name);
      setIsScanning(false);
      setScanInput("");
      toast.success(`Cliente encontrado: ${localFound.name}`);
      return;
    }

    // 2. Lookup in Supabase via backend
    const ext = await lookupCardCode(trimmed);
    setIsScanning(false);
    setScanInput("");

    if (!ext) {
      toast.error("Membresía no encontrada — registra al cliente como nuevo");
      setCustMode("new");
      return;
    }

    // 3. Match by email in local list
    const byEmail = ext.email
      ? customers.find(c => c.email?.toLowerCase() === ext.email!.toLowerCase())
      : null;
    if (byEmail) {
      setSelectedCustomer(byEmail);
      setCustSearch(byEmail.name);
      toast.success(`Tarjeta Tadaima: ${byEmail.name}`);
      return;
    }

    // 4. New member — auto-create in POS and select immediately
    try {
      const newCust = await createCustomer({
        name:               ext.name ?? trimmed,
        phone:              ext.phone ?? undefined,
        email:              ext.email || undefined,
        external_member_id: trimmed,
        loyalty_tier:       ext.nivel ?? undefined,
      });
      const ui = normalizeApiCustomer(newCust);
      setCustomers(prev => [ui, ...prev]);
      setSelectedCustomer(ui);
      setCustSearch(ui.name);
      setCustMode("search");
      toast.success(`Socio Tadaima registrado: ${ui.name}`);
    } catch {
      // Auto-create failed (e.g. duplicate key) — pre-fill form as fallback
      setCustMode("new");
      setNewCustName(ext.name ?? "");
      setNewCustPhone(ext.phone ?? "");
      setNewCustEmail(ext.email ?? "");
      setPendingExtId(trimmed);
      setPendingExtNivel(ext.nivel ?? null);
      toast.info("Completa los datos del cliente para continuar");
    }
  };

  // ── Agregar producto al carrito ────────────────────────────────────────────
  const addProduct = (prod: ProductUI) => {
    const maxStock = prod.stock;
    const existing = cartItems.find(i => i.product_id === prod.id);
    if (existing) {
      if (existing.quantity >= maxStock) {
        toast.error(`Stock máximo en preventa: ${maxStock} unidad${maxStock !== 1 ? "es" : ""}`);
        return;
      }
      setCartItems(prev => prev.map(i =>
        i.product_id === prod.id ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      if (maxStock === 0) {
        toast.error("Sin stock disponible en preventa para este producto");
        return;
      }
      setCartItems(prev => [...prev, {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        product_id: prod.id,
        product_name: prod.name,
        product_image: prod.image,
        product_sku: prod.sku,
        quantity: 1,
        price: prod.price_a,
        price_level: "A" as const,
        price_a: prod.price_a,
        price_b: prod.price_b,
        price_c: prod.price_c,
        max_stock: maxStock,
        deposit_amount: 0,
      }]);
    }
    setProdSearch("");
    setShowProdDrop(false);
  };

  const changeQty = (id: string, d: number) =>
    setCartItems(prev =>
      prev.map(i => {
        if (i.id !== id) return i;
        const next = i.quantity + d;
        if (next > i.max_stock) {
          toast.error(`Límite de stock en preventa: ${i.max_stock} unidad${i.max_stock !== 1 ? "es" : ""}`);
          return i;
        }
        return { ...i, quantity: Math.max(1, next) };
      })
    );

  const changePrice = (id: string, level: "A" | "B" | "C") =>
    setCartItems(prev =>
      prev.map(i => {
        if (i.id !== id) return i;
        const price = level === "A" ? i.price_a : level === "B" ? i.price_b : i.price_c;
        if (price === 0) { toast.error(`Precio ${level} no configurado para este producto`); return i; }
        return { ...i, price_level: level, price };
      })
    );

  const removeItem = (id: string) =>
    setCartItems(prev => prev.filter(i => i.id !== id));

  const changeItemDeposit = (id: string, amount: number) =>
    setCartItems(prev =>
      prev.map(i => {
        if (i.id !== id) return i;
        const itemTotal = i.price * i.quantity;
        const clamped = Math.max(0, Math.min(amount, itemTotal));
        return { ...i, deposit_amount: clamped };
      })
    );

  // ── Totales ────────────────────────────────────────────────────────────────
  const totalAmount  = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalDeposit = cartItems.reduce((s, i) => s + i.deposit_amount, 0);
  const remaining    = Math.max(0, totalAmount - totalDeposit);

  // ── Guardar preventa ───────────────────────────────────────────────────────
  const handleSave = async () => {
    const custName = custMode === "search" ? selectedCustomer?.name : newCustName.trim();
    if (!custName) { toast.error("Selecciona o registra un cliente"); return; }
    if (cartItems.length === 0) { toast.error("Agrega al menos un producto"); return; }

    try {
      let customerId = selectedCustomer?.id;
      if (custMode === "new" && newCustName.trim()) {
        const newCust = await createCustomer({
          name:               newCustName.trim(),
          phone:              newCustPhone.trim() || undefined,
          email:              newCustEmail.trim() || undefined,
          external_member_id: pendingExtId ?? undefined,
          loyalty_tier:       pendingExtNivel ?? undefined,
        });
        customerId = newCust.id;
        setCustomers(prev => [normalizeApiCustomer(newCust), ...prev]);
        setPendingExtId(null);
        setPendingExtNivel(null);
        toast.success(`Cliente "${newCustName}" registrado`);
      }

      if (!activeStore) {
        toast.error("Selecciona una tienda antes de crear la preventa");
        return;
      }
      const storeId = activeStore.id;
      const createdPreSales: ApiPreSale[] = [];

      for (const item of cartItems) {
        const ps = await createPreSale({
          store_id:          storeId,
          customer_id:       customerId,
          product_name:      item.product_name,
          reserved_quantity: item.quantity,
          advance_payment:   item.deposit_amount || undefined,
          items: [{
            product_id:  item.product_id,
            quantity:    item.quantity,
            price:       item.price,
            price_level: priceLevelNum(item.price_level),
          }],
        });
        createdPreSales.push(ps);

        // Register advance payment if given (backend may already record it via advance_payment)
        if (item.deposit_amount > 0) {
          try {
            await addPreSalePayment(ps.id, {
              amount:            item.deposit_amount,
              payment_method_id: 1,
              notes:             "Anticipo al apartar",
            });
          } catch {
            // Non-critical — pre-sale was created successfully
          }
        }
      }

      if (createdPreSales.length > 0) {
        const n = createdPreSales.length;
        toast.success(`${n} apartado${n !== 1 ? "s" : ""} registrado${n !== 1 ? "s" : ""} — ¡Inventario reservado!`);
        setPreSales(prev => [...createdPreSales, ...prev]);
        closeModal();
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar preventas");
    }
  };

  // ── Pre-sales filtradas solo por tienda (para los stats cards) ────────────
  const statsPreSales = useMemo(() =>
    isAdmin && storeFilter !== "all"
      ? preSales.filter(ps => ps.store_id === storeFilter)
      : preSales,
  [preSales, isAdmin, storeFilter]);

  // ── Filtro lista ───────────────────────────────────────────────────────────
  const filteredPreSales = useMemo(() =>
    preSales.filter(ps => {
      if (isAdmin && storeFilter !== "all" && ps.store_id !== storeFilter) return false;
      const custName = ps.customer?.name ?? "";
      const matchSearch =
        custName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(ps.id).includes(searchTerm);

      const uiStatus      = apiStatusToUI(ps.status);
      const effectiveStatus = (ps.status === "live" && (ps.balance ?? 0) <= 0) ? "confirmada" : uiStatus;
      const matchStatus   = statusFilter === "all" || effectiveStatus === statusFilter;

      return matchSearch && matchStatus;
    }), [preSales, searchTerm, statusFilter, isAdmin, storeFilter]);

  // ── Días transcurridos desde la creación ───────────────────────────────────
  const getDaysOpen = (createdAt: string) =>
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);

  const isExpiring = (ps: ApiPreSale) =>
    getDaysOpen(ps.created_at) >= 7 &&
    ps.status === "live" &&
    (ps.balance ?? 0) > 0;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto p-8 space-y-8 no-scrollbar" style={{ background: T.bgGrad }}>

      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", color: T.textPrimary }}>
            Preventas <span style={{ color: T.redBright }}>Tadaima</span>
          </h1>
          <div style={{ display: "flex", padding: 4, borderRadius: 12, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", background: isAdmin ? "#CC2200" : "transparent", color: isAdmin ? "#fff" : "rgba(255,255,255,0.3)" }}>Admin</span>
            <span style={{ padding: "3px 10px", borderRadius: 8, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", background: !isAdmin ? "#CC2200" : "transparent", color: !isAdmin ? "#fff" : "rgba(255,255,255,0.3)" }}>Vendedor</span>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: T.textSecondary }}>Gestión de catálogos y folios de preventa</p>
      </div>

      {/* Tab navigation */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {([
          { id: "catalogos", label: "Catálogos",   adminOnly: true  },
          { id: "folios",    label: "Folios",       adminOnly: false },
          // { id: "llegados",  label: "Llegados",    adminOnly: false },
          { id: "difusion",  label: "Difusión",    adminOnly: false },
        ] as const).filter(t => !t.adminOnly || isAdmin).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setAdminTab(id)}
            style={{
              padding: "10px 22px",
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 900,
              textTransform: "uppercase" as const,
              letterSpacing: "0.12em",
              cursor: "pointer",
              border: "1px solid",
              background: adminTab === id
                ? "linear-gradient(135deg, #CC2200 0%, #FF4422 100%)"
                : "rgba(255,255,255,0.05)",
              borderColor: adminTab === id
                ? "rgba(255,120,90,0.3)"
                : "var(--td-panel-border)",
              color: adminTab === id ? "#fff" : "var(--td-text-lo)",
              boxShadow: adminTab === id ? "0 0 20px rgba(204,34,0,0.3)" : "none",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {label}
              {id === "folios" && foliosPendingCount !== null && foliosPendingCount > 0 && (
                <span style={{
                  background: adminTab === "folios" ? "rgba(255,255,255,0.25)" : "#E0221A",
                  color: "#fff",
                  borderRadius: 9999,
                  fontSize: 9,
                  fontWeight: 900,
                  padding: "1px 6px",
                  lineHeight: "16px",
                  minWidth: 18,
                  textAlign: "center",
                }}>
                  {foliosPendingCount}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Folios tab — catalog-based PreSaleOrders */}
      {adminTab === "folios" && <PreSaleOrdersPanel />}

      {/* Llegados tab — comentado, no se ocupa por ahora */}

      {/* Difusión tab */}
      {adminTab === "difusion" && <PreSaleDifusionPanel />}

      {/* Catálogos tab */}
      {isAdmin && adminTab === "catalogos" && <PreSaleCatalogsPanel />}

      {false && (<>

      {/* Command bar — título · stats · acciones en un solo row */}
      {(() => {
        const active   = statsPreSales.filter(p => !["cancelled","completed"].includes(p.status));
        const toPickup = statsPreSales.filter(p => p.status === "ready" || (p.status === "live" && (p.balance ?? 0) <= 0));
        const balance  = active.reduce((a, p) => a + (p.balance ?? 0), 0);
        const paid     = active.reduce((a, p) => a + (p.paid_amount ?? 0), 0);
        const stats = [
          { label: "Activas",     val: String(active.length),   icon: ShoppingBag,  accent: T.textPrimary },
          { label: "Por Recoger", val: String(toPickup.length), icon: PackageCheck, accent: "var(--td-red)" },
          { label: "Por Cobrar",  val: fmt(balance),            icon: CreditCard,   accent: "#B45309" },
          { label: "Recaudado",   val: fmt(paid),               icon: TrendingUp,   accent: "#15803D" },
        ];
        const sep = (
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--td-panel-border)", flexShrink: 0, margin: "4px 0" }} />
        );
        return (
          <header style={{
            ...T.glass,
            borderRadius: 20,
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap" as const,
          }}>
            {/* Título */}
            <div style={{ flexShrink: 0 }}>
              <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", color: T.textPrimary, margin: 0, lineHeight: 1.1, whiteSpace: "nowrap" as const }}>
                Control de <span style={{ color: T.redBright }}>Preventas</span>
              </h1>
              <p style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.16em", color: T.textMuted, margin: "3px 0 0", whiteSpace: "nowrap" as const }}>
                Apartados · Resurtidos
              </p>
            </div>

            {sep}

            {/* Stats pills */}
            <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" as const, minWidth: 0 }}>
              {stats.map((s, i) => (
                <div key={i} style={{
                  background: "var(--td-card-bg)",
                  border: "1px solid var(--td-card-border)",
                  borderRadius: 12,
                  padding: "7px 13px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flex: "1 1 110px",
                  minWidth: 110,
                }}>
                  <s.icon size={13} style={{ color: s.accent, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 7.5, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: T.textMuted, margin: 0 }}>{s.label}</p>
                    <p style={{ fontSize: 13, fontWeight: 900, color: s.accent, margin: 0, lineHeight: 1.15 }}>{s.val}</p>
                  </div>
                </div>
              ))}
            </div>

            {sep}

            {/* Acciones */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <button
                onClick={openModal}
                style={{
                  ...T.btnRed,
                  padding: "8px 18px",
                  fontSize: 10,
                  fontWeight: 900,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.1em",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  whiteSpace: "nowrap" as const,
                }}
              >
                <Plus size={13} strokeWidth={3} />
                Nueva Preventa
              </button>
            </div>
          </header>
        );
      })()}

      {/* Filtros + lista */}
      <div className="space-y-4">
        <div className="flex gap-4 items-center">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/45 group-focus-within:text-red-500 transition-colors" size={18} />
            <input
              type="text"
              placeholder="Buscar por cliente o folio..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-3xl outline-none border border-white/5 bg-white/5 text-sm font-bold text-white focus:border-red-500/30 transition-all"
            />
          </div>
          {isAdmin && (
            <AdminStoreFilter value={storeFilter} onChange={setStoreFilter} />
          )}
          <div className="flex p-1 rounded-2xl bg-white/5 border border-white/5">
            {(["all", "abierta", "confirmada", "entregada", "vencida"] as const).map(s => {
              const filterLabels: Record<string, string> = {
                all: "Todas", abierta: "Con Saldo", confirmada: "Por Recolectar", entregada: "Entregadas", vencida: "Vencidas",
              };
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                    statusFilter === s ? "bg-red-600 text-white shadow-lg" : "text-white/30 hover:text-white/60"
                  }`}
                >
                  {filterLabels[s]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Banner alerta preventas vencidas */}
        {preSales.filter(isExpiring).length > 0 && (
          <div className="flex items-center gap-4 px-5 py-3 rounded-2xl border border-amber-500/25 bg-amber-500/8">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
              <Clock size={14} className="text-amber-400 animate-pulse" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                {preSales.filter(isExpiring).length} preventa{preSales.filter(isExpiring).length !== 1 ? "s" : ""} con más de 7 días sin liquidar
              </p>
              <p className="text-[9px] font-bold text-amber-400/50 mt-0.5">
                Al cancelarlas, el anticipo se registrará automáticamente como Saldo a Favor del cliente.
              </p>
            </div>
            <button
              onClick={() => setStatusFilter("abierta")}
              className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 text-[9px] font-black uppercase tracking-widest hover:bg-amber-500/25 transition-all shrink-0"
            >
              Ver
            </button>
          </div>
        )}

        {/* Label de tienda seleccionada */}
        {isAdmin && storeFilter !== "all" && (
          <div className="flex items-center gap-2 px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--td-text-lo)" }}>
              {stores.find(s => s.id === storeFilter)?.name ?? "Tienda"}
            </span>
          </div>
        )}

        <div className="rounded-[40px] overflow-hidden border border-white/5 flex flex-col" style={{ ...T.glass, maxHeight: "calc(100vh - 380px)", minHeight: 200 }}>
          {loading ? (
            <div className="p-20 flex flex-col items-center justify-center gap-4">
              <Loader2 size={32} className="animate-spin text-red-500" />
              <p className="text-xs font-black uppercase tracking-widest text-white/45">Sincronizando...</p>
            </div>
          ) : filteredPreSales.length === 0 ? (
            <div className="p-20 flex flex-col items-center justify-center gap-4">
              <AlertCircle size={32} className="text-white/45" />
              <p className="text-xs font-black uppercase tracking-widest text-white/45">Sin preventas registradas</p>
            </div>
          ) : (
            <div className="overflow-y-auto flex-1 no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-white/5" style={{ background: "var(--td-panel-bg)" }}>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-white/30">Folio</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-white/30">Cliente</th>
                  {isAdmin && storeFilter === "all" && <th className="p-6 text-[10px] font-black uppercase tracking-widest text-white/30">Tienda</th>}
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-white/30">Productos</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-white/30">Monto / Saldo</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-white/30">Estado</th>
                  <th className="p-6 text-right" />
                </tr>
              </thead>
              <tbody>
                {filteredPreSales.map(ps => {
                  const custName     = ps.customer?.name ?? "Sin nombre";
                  const psBalance    = ps.balance ?? 0;
                  const psTotal      = ps.total ?? 0;
                  const uiStatus     = apiStatusToUI(ps.status);
                  const effectiveUI  = (ps.status === "live" && psBalance <= 0) ? "confirmada" : uiStatus;

                  return (
                  <tr
                    key={ps.id}
                    onClick={() => openDetail(ps)}
                    className={`border-b border-white/5 hover:bg-white/[0.03] transition-all cursor-pointer ${detailPreSale?.id === ps.id && isDetailOpen ? "bg-red-500/5" : ""} ${
                      isExpiring(ps) ? "bg-amber-500/[0.03]" : ""
                    }`}
                    style={
                      detailPreSale?.id === ps.id && isDetailOpen
                        ? { borderLeft: "3px solid #FF4422" }
                        : isExpiring(ps)
                        ? { borderLeft: "3px solid rgba(245,158,11,0.4)" }
                        : {}
                    }
                  >
                    <td className="p-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-black text-white font-mono">#{String(ps.id).padStart(6, "0")}</span>
                        <span className="text-[9px] font-bold text-white/45 uppercase">
                          {new Date(ps.created_at).toLocaleDateString("es-MX")}
                        </span>
                        {(ps.status === "live" || ps.status === "ready") && (() => {
                          const days = getDaysOpen(ps.created_at);
                          const warn = days >= 7 && psBalance > 0;
                          return (
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider w-fit ${
                              warn
                                ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                                : "bg-white/[0.03] text-white/45 border border-white/5"
                            }`}>
                              <Clock size={7} className={warn ? "animate-pulse" : ""} />
                              {days}d
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center text-[10px] font-black text-red-500">
                          {custName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white/90">{custName}</span>
                        </div>
                      </div>
                    </td>
                    {isAdmin && storeFilter === "all" && (
                      <td className="p-6">
                        <span className="text-xs font-bold text-white/50">
                          {stores.find(s => s.id === ps.store_id)?.name ?? <span className="text-white/20">—</span>}
                        </span>
                      </td>
                    )}
                    <td className="p-6">
                      <span className="text-xs font-bold text-white/40">
                        {ps.items?.length ?? 0} {(ps.items?.length ?? 0) === 1 ? "artículo" : "artículos"}
                      </span>
                    </td>
                    <td className="p-6">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-white">{fmt(psTotal)}</span>
                        <span className={`text-[10px] font-black uppercase ${psBalance > 0 ? "text-red-500" : "text-green-500"}`}>
                          {psBalance > 0 ? `Resta ${fmt(psBalance)}` : "Pagado Total"}
                        </span>
                      </div>
                    </td>
                    <td className="p-6">
                      <StatusBadge status={effectiveUI} />
                    </td>
                    <td className="p-6 text-right">
                      <ChevronRight
                        size={16}
                        className={`transition-colors ${detailPreSale?.id === ps.id && isDetailOpen ? "text-red-500" : "text-white/15"}`}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL NUEVA PREVENTA
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <Motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
              onClick={closeModal}
            />

            <Motion.div
              initial={{ scale: 0.93, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.93, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 22, stiffness: 300 }}
              className="relative w-full max-w-3xl rounded-[40px] border border-white/10 flex flex-col shadow-2xl overflow-hidden"
              style={{ background: "var(--td-popup-bg)", backdropFilter: "blur(40px)", maxHeight: "92vh" }}
            >
              {/* Header modal */}
              <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">Registrar Apartado</h2>
                  <p className="text-[10px] font-black text-white/45 uppercase tracking-widest mt-0.5">
                    Nueva preventa · Folio automático
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="w-9 h-9 rounded-2xl bg-white/5 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Cuerpo scrollable */}
              <div className="overflow-y-auto flex-1 p-8 space-y-6" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--td-divider) transparent" }}>

                {loadingModal && (
                  <div className="flex items-center justify-center gap-3 py-4">
                    <Loader2 size={18} className="animate-spin text-red-500" />
                    <span className="text-xs font-black text-white/30 uppercase tracking-widest">Cargando datos...</span>
                  </div>
                )}

                {/* ── SECCIÓN CLIENTE ─────────────────────────────────────────── */}
                <section className="rounded-[28px] border border-white/5 overflow-visible" style={{ background: "var(--td-card-bg)" }}>
                  {/* Tabs cliente */}
                  <div className="flex border-b border-white/5 rounded-t-[28px] overflow-hidden">
                    <button
                      onClick={() => { setCustMode("search"); setSelectedCustomer(null); setCustSearch(""); }}
                      className={`flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${
                        custMode === "search"
                          ? "text-white border-b-2 border-red-500 bg-red-500/5"
                          : "text-white/50 hover:text-white/50"
                      }`}
                    >
                      <Users size={12} />
                      Cliente existente
                    </button>
                    <button
                      onClick={() => { setCustMode("new"); setSelectedCustomer(null); setCustSearch(""); }}
                      className={`flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${
                        custMode === "new"
                          ? "text-white border-b-2 border-red-500 bg-red-500/5"
                          : "text-white/50 hover:text-white/50"
                      }`}
                    >
                      <UserPlus size={12} />
                      Cliente nuevo
                    </button>
                  </div>

                  <div className="p-5">
                    {custMode === "search" ? (
                      <div className="space-y-3">
                        {selectedCustomer ? (
                          <div className="flex items-center gap-4 px-4 py-3 rounded-2xl border border-green-500/25 bg-green-500/5">
                            <div className="w-10 h-10 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center text-sm font-black text-red-400">
                              {selectedCustomer.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-black text-white">{selectedCustomer.name}</p>
                              {selectedCustomer.phone && (
                                <span className="text-[10px] font-bold text-white/40 flex items-center gap-1">
                                  <Phone size={9} />{selectedCustomer.phone}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Check size={14} className="text-green-500" />
                              <button
                                onClick={() => { setSelectedCustomer(null); setCustSearch(""); }}
                                className="text-white/45 hover:text-white/60 transition-colors ml-2"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <div className="relative flex-1" ref={custDropRef}>
                                <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/45" />
                                <input
                                  type="text"
                                  placeholder="Nombre o teléfono..."
                                  value={custSearch}
                                  onChange={e => { setCustSearch(e.target.value); setShowCustDrop(true); }}
                                  onFocus={() => setShowCustDrop(true)}
                                  className="w-full pl-10 pr-4 py-3 rounded-2xl outline-none border border-white/7 bg-white/5 text-sm font-bold text-white placeholder-white/20 focus:border-red-500/30 transition-all"
                                />
                                <AnimatePresence>
                                  {showCustDrop && filteredCustomers.length > 0 && (
                                    <Motion.div
                                      initial={{ opacity: 0, y: -6 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, y: -6 }}
                                      className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl overflow-hidden"
                                      style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-panel-border)", boxShadow: "0 16px 48px rgba(0,0,0,0.25)" }}
                                    >
                                      {filteredCustomers.map(c => (
                                        <button
                                          key={c.id}
                                          onClick={() => { setSelectedCustomer(c); setCustSearch(c.name); setShowCustDrop(false); }}
                                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                                        >
                                          <div className="w-8 h-8 rounded-full bg-red-600/20 flex items-center justify-center text-[10px] font-black text-red-400 shrink-0">
                                            {c.name.charAt(0).toUpperCase()}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-white truncate">{c.name}</p>
                                            <p className="text-[9px] text-white/30 font-bold">{c.phone || "Sin teléfono"}</p>
                                          </div>
                                        </button>
                                      ))}
                                    </Motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                              <button
                                onClick={handleScan}
                                className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-white/8 bg-white/5 text-white/40 hover:text-white hover:bg-white/10 hover:border-red-500/30 transition-all text-[10px] font-black uppercase tracking-wider shrink-0"
                              >
                                <ScanLine size={14} />
                                Escanear
                              </button>
                            </div>

                            <AnimatePresence>
                              {extSearchResults.length > 0 && !isScanning && (
                                <Motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="space-y-1.5">
                                    <p className="text-[9px] font-black text-red-400/70 uppercase tracking-widest px-1">Socios Tadaima</p>
                                    {extSearchResults.map(ext => (
                                      <button
                                        key={ext.external_member_id}
                                        type="button"
                                        onClick={() => handleAddExtSearchCustomer(ext)}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-red-500/20 bg-red-600/8 hover:bg-red-600/15 transition-all text-left"
                                      >
                                        <div className="w-8 h-8 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center text-[10px] font-black text-red-400 shrink-0">
                                          {(ext.name ?? "?").charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-black text-white truncate">{ext.name}</p>
                                          <p className="text-[10px] text-white/35">{ext.external_member_id}{ext.phone ? ` · ${ext.phone}` : ""}</p>
                                        </div>
                                        <span className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-wider shrink-0">Agregar</span>
                                      </button>
                                    ))}
                                  </div>
                                </Motion.div>
                              )}
                            </AnimatePresence>

                            <AnimatePresence>
                              {isScanning && (
                                <Motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-red-500/30 bg-red-500/5">
                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                                    <QrCode size={14} className="text-red-400 shrink-0" />
                                    <input
                                      ref={scanInputRef}
                                      type="text"
                                      placeholder="Pasa la tarjeta o ingresa el código..."
                                      value={scanInput}
                                      onChange={e => setScanInput(e.target.value)}
                                      onKeyDown={e => { if (e.key === "Enter") processScan(scanInput); }}
                                      className="flex-1 bg-transparent outline-none text-sm font-bold text-white placeholder-red-500/30"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => processScan(scanInput)}
                                      className="px-3 py-1 rounded-xl bg-red-600 text-white text-[10px] font-black shrink-0"
                                    >
                                      OK
                                    </button>
                                    <button onClick={() => { setIsScanning(false); setScanInput(""); }} className="text-white/45 hover:text-white/60">
                                      <X size={14} />
                                    </button>
                                  </div>
                                  <p className="text-[9px] text-white/45 font-bold text-center mt-1">
                                    Presiona Enter o haz clic en OK después de escanear
                                  </p>
                                </Motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-1">
                            Nombre completo *
                          </label>
                          <input
                            type="text"
                            value={newCustName}
                            onChange={e => setNewCustName(e.target.value)}
                            placeholder="Ej. Juan Pérez"
                            className="w-full px-4 py-3 rounded-2xl outline-none border border-white/7 bg-white/5 font-bold text-white placeholder-white/20 focus:border-red-500/30 transition-all"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-1 flex items-center gap-1">
                            <MessageCircle size={9} />
                            WhatsApp (10 dígitos)
                          </label>
                          <input
                            type="tel"
                            value={newCustPhone}
                            onChange={e => setNewCustPhone(e.target.value)}
                            placeholder="5512345678"
                            maxLength={10}
                            className="w-full px-4 py-3 rounded-2xl outline-none border border-white/7 bg-white/5 font-bold text-white placeholder-white/20 focus:border-red-500/30 transition-all"
                          />
                        </div>
                        <div className="col-span-2 px-4 py-2.5 rounded-2xl bg-amber-500/5 border border-amber-500/15 flex items-center gap-2">
                          <AlertCircle size={12} className="text-amber-400 shrink-0" />
                          <p className="text-[10px] font-bold text-amber-400/70">
                            El cliente se registrará automáticamente en el sistema al confirmar el apartado.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* ── SECCIÓN PRODUCTOS ───────────────────────────────────────── */}
                <section className="rounded-[28px] border border-white/5 overflow-visible" style={{ background: "var(--td-card-bg)" }}>
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                    <div>
                      <h3 className="text-xs font-black uppercase text-red-500 tracking-widest">
                        Productos del Apartado
                      </h3>
                      <p className="text-[9px] font-bold text-white/50 mt-0.5">
                        Cada producto genera un folio independiente
                      </p>
                    </div>
                    {cartItems.length > 0 && (
                      <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border border-red-500/30 bg-red-500/10 text-red-400">
                        {cartItems.length} apartado{cartItems.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  <div className="p-5 space-y-3">
                    <div className="relative" ref={prodDropRef}>
                      <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/45 z-10" />
                      <input
                        type="text"
                        placeholder="Buscar producto por nombre o SKU..."
                        value={prodSearch}
                        onChange={e => { setProdSearch(e.target.value); setShowProdDrop(true); }}
                        onFocus={() => setShowProdDrop(true)}
                        className="w-full pl-10 pr-4 py-3 rounded-2xl outline-none border border-white/7 bg-white/5 text-sm font-bold text-white placeholder-white/20 focus:border-red-500/30 transition-all"
                      />
                      <AnimatePresence>
                        {showProdDrop && filteredProducts.length > 0 && (
                          <Motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl overflow-hidden"
                            style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-panel-border)", boxShadow: "0 16px 48px rgba(0,0,0,0.25)" }}
                          >
                            {filteredProducts.map(p => {
                              const inCart    = cartItems.find(i => i.product_id === p.id);
                              const availQty  = p.stock - (inCart?.quantity ?? 0);
                              return (
                              <button
                                key={p.id}
                                onClick={() => addProduct(p)}
                                disabled={availQty <= 0}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <div className="w-9 h-9 rounded-xl overflow-hidden bg-white/5 shrink-0">
                                  <ImageWithFallback src={p.image || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-white truncate">{p.name}</p>
                                  <p className="text-[9px] text-white/30 font-bold font-mono">{p.sku}</p>
                                </div>
                                <div className="text-right shrink-0 space-y-0.5">
                                  <p className="text-sm font-black text-white">{fmt(p.price_a)}</p>
                                  {p.price_b > 0 && (
                                    <p className="text-[9px] text-white/30">B: {fmt(p.price_b)}</p>
                                  )}
                                  <p className={`text-[9px] font-black uppercase tracking-wider ${
                                    availQty <= 0 ? "text-red-500/70" : availQty <= 3 ? "text-amber-400/70" : "text-white/50"
                                  }`}>
                                    {availQty <= 0 ? "Sin stock" : `${availQty} disp.`}
                                  </p>
                                </div>
                              </button>
                              );
                            })}
                          </Motion.div>
                        )}
                        {showProdDrop && filteredProducts.length === 0 && prodSearch && (
                          <Motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl overflow-hidden px-4 py-3"
                            style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-panel-border)" }}
                          >
                            <p className="text-xs text-white/30 font-bold">Sin resultados para "{prodSearch}"</p>
                          </Motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Banner: aviso de preventas individuales */}
                    {cartItems.length > 1 && (
                      <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border border-amber-500/20 bg-amber-500/5">
                        <PackageCheck size={14} className="text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-[10px] font-bold text-amber-400/80 leading-relaxed">
                          Se crearán <strong className="text-amber-400">{cartItems.length} folios independientes</strong> — uno por producto. Define el anticipo individual de cada artículo abajo.
                        </p>
                      </div>
                    )}

                    {cartItems.length > 0 && (
                      <div className="space-y-2">
                        {cartItems.map(item => {
                          const itemTotal     = item.price * item.quantity;
                          const itemRemaining = Math.max(0, itemTotal - item.deposit_amount);
                          return (
                          <div key={item.id} className="rounded-2xl border border-white/5 bg-white/[0.03] overflow-hidden">
                            {/* Fila principal */}
                            <div className="flex items-center gap-3 px-4 py-3">
                              <div className="w-9 h-9 rounded-xl overflow-hidden bg-white/5 shrink-0">
                                <ImageWithFallback src={item.product_image} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{item.product_name}</p>
                                <p className="text-[9px] font-bold text-white/30 font-mono">{item.product_sku}</p>
                                {/* ── Selector de nivel de precio ── */}
                                <div className="flex gap-1 mt-1.5 flex-wrap">
                                  {(["A", "B", "C"] as const).map(lvl => {
                                    const lvlPrice   = lvl === "A" ? item.price_a : lvl === "B" ? item.price_b : item.price_c;
                                    const active      = item.price_level === lvl;
                                    const unavailable = lvlPrice === 0;
                                    return (
                                      <button
                                        key={lvl}
                                        disabled={unavailable}
                                        onClick={() => changePrice(item.id, lvl)}
                                        title={unavailable ? `Precio ${lvl} no configurado` : `Precio ${lvl}: ${fmt(lvlPrice)}`}
                                        className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider transition-all border ${
                                          unavailable
                                            ? "border-white/5 text-white/15 cursor-not-allowed opacity-40"
                                            : active
                                            ? "border-red-500/60 bg-red-500/20 text-red-400"
                                            : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/70"
                                        }`}
                                      >
                                        {lvl} · {unavailable ? "—" : fmt(lvlPrice)}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => changeQty(item.id, -1)}
                                  className="w-6 h-6 rounded-full bg-white/7 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                                >
                                  <Minus size={9} />
                                </button>
                                <span className="w-6 text-center text-sm font-black text-white">{item.quantity}</span>
                                <button
                                  onClick={() => changeQty(item.id, 1)}
                                  disabled={item.quantity >= item.max_stock}
                                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                                    item.quantity >= item.max_stock
                                      ? "bg-white/3 text-white/15 cursor-not-allowed"
                                      : "bg-white/7 text-white/50 hover:text-white"
                                  }`}
                                >
                                  <Plus size={9} />
                                </button>
                              </div>
                              <div className="w-24 text-right shrink-0">
                                <p className="text-sm font-black text-white">{fmt(itemTotal)}</p>
                                <p className="text-[9px] text-white/45">{fmt(item.price)} c/u</p>
                                <p className={`text-[8px] font-black uppercase tracking-wider mt-0.5 ${
                                  item.quantity >= item.max_stock ? "text-red-500/60" : "text-white/15"
                                }`}>
                                  {item.quantity}/{item.max_stock} prev.
                                </p>
                              </div>
                              <button
                                onClick={() => removeItem(item.id)}
                                className="text-white/15 hover:text-red-500 transition-colors shrink-0"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            {/* ── Fila de anticipo individual ── */}
                            <div className="flex items-center gap-3 px-4 py-2.5 border-t border-white/5 bg-green-500/[0.03]">
                              <Wallet size={11} className="text-green-500/50 shrink-0" />
                              <span className="text-[9px] font-black text-white/30 uppercase tracking-widest shrink-0">Anticipo:</span>
                              <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-1 flex-1 max-w-[140px]">
                                <span className="text-[11px] font-black text-green-400/60">$</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={itemTotal}
                                  value={item.deposit_amount || ""}
                                  onChange={e => changeItemDeposit(item.id, parseFloat(e.target.value) || 0)}
                                  placeholder="0"
                                  className="w-full bg-transparent outline-none text-sm font-black text-green-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-green-400/30"
                                />
                              </div>
                              <div className="flex items-center gap-2 ml-auto">
                                {item.deposit_amount > 0 ? (
                                  <>
                                    <span className="text-[9px] font-black text-white/50">Resta:</span>
                                    <span className={`text-[10px] font-black ${itemRemaining > 0 ? "text-red-400" : "text-green-400"}`}>
                                      {itemRemaining > 0 ? fmt(itemRemaining) : "✓ Pagado"}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-[9px] font-bold text-white/15 italic">Sin anticipo</span>
                                )}
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}

                    {cartItems.length === 0 && (
                      <div className="py-6 flex flex-col items-center gap-2 opacity-20">
                        <Package size={28} />
                        <p className="text-[10px] font-black uppercase tracking-widest">Busca y agrega productos</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* ── RESUMEN FINANCIERO ──────────────────────────────────────── */}
                <section className="rounded-[28px] border border-white/5 overflow-hidden" style={{ background: "var(--td-card-bg)" }}>
                  <div className="px-5 py-4 border-b border-white/5">
                    <h3 className="text-xs font-black uppercase text-red-500 tracking-widest">Resumen Financiero</h3>
                  </div>

                  <div className="p-5 space-y-4">
                    {cartItems.length > 0 ? (
                      <div className="space-y-2">
                        {cartItems.map(item => {
                          const it  = item.price * item.quantity;
                          const dep = item.deposit_amount;
                          const pct = it > 0 ? Math.min(100, (dep / it) * 100) : 0;
                          return (
                            <div key={item.id} className="flex items-center gap-3">
                              <div className="w-28 shrink-0">
                                <p className="text-[9px] font-bold text-white/40 truncate">{item.product_name}</p>
                              </div>
                              <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${pct}%`,
                                    background: pct >= 100 ? "linear-gradient(90deg, #22c55e, #4ade80)" : "linear-gradient(90deg, #CC2200, #FF4422)",
                                  }}
                                />
                              </div>
                              <div className="w-28 text-right shrink-0 flex justify-end gap-2 items-center">
                                <span className="text-[9px] font-black text-green-400">{fmt(dep)}</span>
                                <span className="text-[8px] text-white/45">/</span>
                                <span className="text-[9px] font-bold text-white/30">{fmt(it)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-white/45 text-center py-2">Agrega productos para ver el resumen</p>
                    )}

                    {totalAmount > 0 && (
                      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/5">
                        <div className="rounded-2xl bg-white/[0.03] border border-white/5 px-4 py-3 text-center">
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/50 mb-1">Total</p>
                          <p className="text-base font-black text-white">{fmt(totalAmount)}</p>
                        </div>
                        <div className="rounded-2xl bg-green-500/5 border border-green-500/15 px-4 py-3 text-center">
                          <p className="text-[8px] font-black uppercase tracking-widest text-green-500/50 mb-1">Anticipo</p>
                          <p className="text-base font-black text-green-400">{fmt(totalDeposit)}</p>
                        </div>
                        <div className={`rounded-2xl px-4 py-3 text-center border ${remaining > 0 ? "bg-red-500/5 border-red-500/15" : "bg-green-500/5 border-green-500/20"}`}>
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/50 mb-1">Saldo</p>
                          <p className={`text-base font-black italic ${remaining > 0 ? "text-red-400" : "text-green-400"}`}>
                            {remaining > 0 ? fmt(remaining) : "✓ Cubierto"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Notas opcionales */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-white/45 uppercase tracking-widest ml-1">Notas (opcional)</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Fecha de entrega, descripción del producto, preferencias del cliente..."
                    rows={2}
                    className="w-full px-4 py-3 rounded-2xl outline-none border border-white/5 bg-white/[0.02] text-sm font-bold text-white placeholder-white/15 focus:border-red-500/20 transition-all resize-none"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-5 border-t border-white/5 flex gap-4 shrink-0" style={{ background: "var(--td-panel-bg)" }}>
                <button
                  onClick={closeModal}
                  className="flex-1 py-4 rounded-[20px] font-black text-[11px] uppercase tracking-widest border border-white/8 text-white/50 hover:text-white/50 transition-all"
                >
                  Descartar
                </button>
                <button
                  onClick={handleSave}
                  disabled={cartItems.length === 0 || (!selectedCustomer && !newCustName.trim())}
                  className="flex-[2] py-4 rounded-[20px] font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-30"
                  style={T.btnRed}
                >
                  <ArrowRight size={14} />
                  {cartItems.length > 1
                    ? `Confirmar ${cartItems.length} Apartados`
                    : "Confirmar y Generar Folio"}
                </button>
              </div>
            </Motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
          PANEL DETALLE PREVENTA — Slide-over derecho
      ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isDetailOpen && detailPreSale && (
          <>
            {/* Overlay */}
            <Motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm"
              onClick={closeDetail}
            />

            {/* Panel flotante */}
            <Motion.div
              initial={{ x: "110%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "110%", opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed z-[95] flex flex-col"
              style={{
                top: 12,
                right: 12,
                bottom: 12,
                width: "min(440px, calc(100vw - 24px))",
                borderRadius: 24,
                background: "var(--td-popup-bg)",
                backdropFilter: "blur(40px)",
                border: "1px solid var(--td-panel-border)",
                boxShadow: "-12px 0 60px rgba(0,0,0,0.35), 0 8px 40px rgba(0,0,0,0.25)",
              }}
            >
              {/* ── Header del panel ───────────────────────────────────────── */}
              <div className="px-5 py-4 border-b shrink-0" style={{ borderColor: "var(--td-panel-border)", background: "var(--td-card-bg)", borderRadius: "24px 24px 0 0" }}>
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-600/30 to-red-900/30 border border-red-500/25 flex items-center justify-center text-sm font-black text-red-400 shrink-0">
                    {(detailPreSale.customer?.name ?? "?").charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black leading-tight" style={{ color: "var(--td-text-hi)" }}>{detailPreSale.customer?.name ?? "Sin nombre"}</p>
                      <StatusBadge status={
                        (detailPreSale.status === "live" && (detailPreSale.balance ?? 0) <= 0)
                          ? "confirmada"
                          : apiStatusToUI(detailPreSale.status)
                      } />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-[9px] font-black font-mono" style={{ color: "var(--td-text-lo)" }}>
                        #{String(detailPreSale.id).padStart(6, "0")}
                      </span>
                      <span className="text-[9px] font-bold flex items-center gap-1" style={{ color: "var(--td-text-lo)" }}>
                        <Clock size={8} />
                        {new Date(detailPreSale.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                      {(detailPreSale.status === "live" || detailPreSale.status === "ready") && (() => {
                        const days = getDaysOpen(detailPreSale.created_at);
                        const warn = days >= 7 && (detailPreSale.balance ?? 0) > 0;
                        return (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider ${
                            warn ? "bg-amber-500/15 text-amber-400 border border-amber-500/25" : "bg-white/[0.03] text-white/45 border border-white/5"
                          }`}>
                            {warn && <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />}
                            {days}d {warn ? "· vence" : ""}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <button
                    onClick={closeDetail}
                    className="w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0"
                    style={{ background: "var(--td-input-bg)", color: "var(--td-text-lo)" }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* ── Cuerpo scrollable ────────────────────────────────────────── */}
              <div
                className="flex-1 overflow-y-auto px-5 py-4 space-y-4 no-scrollbar"
                style={{ scrollbarWidth: "thin", scrollbarColor: "var(--td-divider) transparent" }}
              >
                {loadingDetail && (
                  <div className="flex items-center justify-center gap-3 py-6">
                    <Loader2 size={18} className="animate-spin text-red-500" />
                    <span className="text-xs font-black text-white/30 uppercase tracking-widest">Cargando historial...</span>
                  </div>
                )}

                {/* Productos del apartado */}
                <section>
                  <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-white/50 mb-3 flex items-center gap-2">
                    <Package size={10} className="text-red-500" />
                    Productos del Apartado
                  </h3>
                  <div className="space-y-2">
                    {(detailPreSale.items || []).map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/5"
                        style={{ background: "var(--td-card-bg)" }}
                      >
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 shrink-0 flex items-center justify-center">
                          <Package size={16} className="text-white/45" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{item.product?.name ?? detailPreSale.product_name}</p>
                          {item.product?.sku && <p className="text-[9px] font-bold text-white/30 font-mono">{item.product.sku}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-white">{fmt(item.price * item.quantity)}</p>
                          <p className="text-[9px] text-white/50">{item.quantity}× {fmt(item.price)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Resumen financiero */}
                <section className="rounded-[24px] border border-white/5 overflow-hidden" style={{ background: "var(--td-card-bg)" }}>
                  <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
                    <TrendingUp size={11} className="text-red-500" />
                    <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-white/50">Resumen Financiero</h3>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-white/40">Total del apartado</span>
                      <span className="text-sm font-black text-white">{fmt(detailPreSale.total ?? 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-white/40">Total abonado</span>
                      <span className="text-sm font-black text-green-400">{fmt(detailPreSale.paid_amount ?? 0)}</span>
                    </div>
                    {/* Barra de progreso */}
                    <div className="space-y-1">
                      <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(100, (detailPreSale.total ?? 0) > 0 ? ((detailPreSale.paid_amount ?? 0) / (detailPreSale.total ?? 1)) * 100 : 0)}%`,
                            background: (detailPreSale.balance ?? 0) === 0
                              ? "linear-gradient(90deg, #22c55e, #4ade80)"
                              : "linear-gradient(90deg, #CC2200, #FF4422)",
                          }}
                        />
                      </div>
                      <p className="text-[9px] font-black text-white/45 text-right">
                        {(detailPreSale.total ?? 0) > 0
                          ? Math.min(100, Math.round(((detailPreSale.paid_amount ?? 0) / (detailPreSale.total ?? 1)) * 100))
                          : 0}% abonado
                      </p>
                    </div>
                    <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                      <span className="text-xs font-black text-white/40 uppercase tracking-widest">Saldo pendiente</span>
                      <span className={`text-2xl font-black italic ${(detailPreSale.balance ?? 0) > 0 ? "text-red-400" : "text-green-400"}`}>
                        {fmt(detailPreSale.balance ?? 0)}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Historial de pagos */}
                <section>
                  <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-white/50 mb-3 flex items-center gap-2">
                    <History size={10} className="text-red-500" />
                    Historial de Pagos
                    <span className="ml-auto text-[9px] font-black text-white/45 bg-white/5 px-2 py-0.5 rounded-full">
                      {detailPayments.length} {detailPayments.length === 1 ? "pago" : "pagos"}
                    </span>
                  </h3>

                  {detailPayments.length === 0 && !loadingDetail && (
                    <div className="flex flex-col items-center gap-2 py-8 opacity-20">
                      <Wallet size={24} />
                      <p className="text-[9px] font-black uppercase tracking-widest">Sin pagos registrados</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {detailPayments.map((pay, i) => (
                      <Motion.div
                        key={pay.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/5"
                        style={{ background: "var(--td-card-bg)" }}
                      >
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/10 border border-blue-500/20">
                          <DollarSign size={14} className="text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white capitalize">Abono</span>
                            <span className="text-[9px] font-black text-white/30 bg-white/5 px-1.5 py-0.5 rounded-md">
                              {pay.payment_method?.name ?? "Efectivo"}
                            </span>
                          </div>
                          {pay.notes && (
                            <p className="text-[9px] text-white/30 font-bold truncate mt-0.5">{pay.notes}</p>
                          )}
                          <p className="text-[9px] text-white/45 font-bold mt-0.5">
                            {new Date(pay.created_at).toLocaleDateString("es-MX", {
                              day: "2-digit", month: "short",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <span className="text-sm font-black shrink-0 text-white">
                          +{fmt(pay.amount)}
                        </span>
                      </Motion.div>
                    ))}
                  </div>
                </section>

                {/* Formulario de abono (colapsible) */}
                <AnimatePresence>
                  {isAbonoOpen && detailPreSale.status !== "cancelled" && detailPreSale.status !== "completed" && (
                    <Motion.section
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-[24px] border border-red-500/20 overflow-hidden" style={{ background: "rgba(204,34,0,0.04)" }}>
                        <div className="px-5 py-3 border-b border-red-500/10 flex items-center justify-between">
                          <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-red-400 flex items-center gap-2">
                            <Wallet size={10} />Registrar Abono
                          </h3>
                          <button onClick={() => setIsAbonoOpen(false)} className="text-white/45 hover:text-white/50 transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="p-5 space-y-4">
                          {/* Monto */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Monto del abono *</label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-green-400/50 text-lg">$</span>
                              <input
                                type="number"
                                value={abonoAmount}
                                onChange={e => setAbonoAmount(e.target.value === "" ? "" : parseFloat(e.target.value))}
                                placeholder="0"
                                min={1}
                                max={detailPreSale.balance ?? 0}
                                className="w-full pl-8 pr-4 py-3 rounded-2xl bg-green-500/5 border border-green-500/20 font-black text-xl text-green-400 outline-none focus:border-green-500/40"
                              />
                            </div>
                            {(detailPreSale.balance ?? 0) > 0 && (
                              <button
                                onClick={() => setAbonoAmount(detailPreSale.balance ?? 0)}
                                className="text-[9px] font-black text-red-400/70 hover:text-red-400 uppercase tracking-wider transition-colors"
                              >
                                Liquidar saldo completo → {fmt(detailPreSale.balance ?? 0)}
                              </button>
                            )}
                          </div>
                          {/* Método — Preventas solo aceptan Efectivo o Dólares */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-widest flex items-center gap-1.5">
                              Método de pago
                              <span className="text-[8px] font-black text-amber-500/60 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">Solo Efectivo/Dólares</span>
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              {["Efectivo", "Dólares"].map(m => (
                                <button
                                  key={m}
                                  onClick={() => setAbonoMethod(m)}
                                  className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border flex items-center justify-center gap-2 ${
                                    abonoMethod === m
                                      ? "bg-red-600 border-red-500 text-white shadow-[0_0_20px_rgba(204,34,0,0.3)]"
                                      : "bg-white/5 border-white/5 text-white/30 hover:text-white/60 hover:bg-white/[0.08]"
                                  }`}
                                >
                                  {m === "Dólares" ? <DollarSign size={12} /> : <Wallet size={12} />}
                                  {m}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Nota */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Nota (opcional)</label>
                            <input
                              type="text"
                              value={abonoNote}
                              onChange={e => setAbonoNote(e.target.value)}
                              placeholder="Referencia, observación..."
                              className="w-full px-4 py-2.5 rounded-2xl outline-none border border-white/7 bg-white/5 text-sm font-bold text-white placeholder-white/15 focus:border-red-500/20"
                            />
                          </div>
                          {/* Botón confirmar abono */}
                          <button
                            onClick={handleAddAbono}
                            disabled={savingAbono || !abonoAmount || Number(abonoAmount) <= 0}
                            className="w-full py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-30"
                            style={T.btnRed}
                          >
                            {savingAbono
                              ? <><Loader2 size={14} className="animate-spin" />Guardando...</>
                              : <><Check size={14} />Confirmar Abono{abonoAmount ? ` de ${fmt(Number(abonoAmount))}` : ""}</>
                            }
                          </button>
                        </div>
                      </div>
                    </Motion.section>
                  )}
                </AnimatePresence>

              </div>{/* fin cuerpo scrollable */}

              {/* ── Footer acciones ─────────────────────────────────────────── */}
              {(detailPreSale.status === "live" || detailPreSale.status === "ready") && (
                <div className="px-5 py-4 shrink-0 space-y-2 relative" style={{ borderTop: "1px solid var(--td-panel-border)", background: "rgba(0,0,0,0.25)", borderRadius: "0 0 24px 24px" }}>
                  {/* Diálogo de confirmación flotante (cancelar / entregar) */}
                  <AnimatePresence>
                    {confirmAction && (
                      <Motion.section
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-[calc(100%+8px)] left-4 right-4 z-10"
                      >
                        <div className="rounded-[24px] border overflow-hidden shadow-2xl backdrop-blur-xl"
                          style={{
                            background: confirmAction === "cancel" ? "rgba(220,38,38,0.15)" : "rgba(34,197,94,0.15)",
                            borderColor: confirmAction === "cancel" ? "rgba(220,38,38,0.3)" : "rgba(34,197,94,0.3)",
                          }}
                        >
                          <div className="p-5 space-y-4">
                            <div className="flex items-start gap-3">
                              {confirmAction === "cancel"
                                ? <XCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
                                : <PackageOpen size={20} className="text-green-400 shrink-0 mt-0.5" />
                              }
                              <div>
                                <p className="text-sm font-black text-white">
                                  {confirmAction === "cancel" ? "¿Cancelar este apartado?" : "¿Confirmar entrega al cliente?"}
                                </p>
                                <p className="text-[10px] font-bold text-white/50 mt-0.5">
                                  {confirmAction === "cancel"
                                    ? "El apartado se marcará como cancelado. Esta acción no puede deshacerse."
                                    : `${detailPreSale.customer?.name ?? "El cliente"} se llevará su(s) producto(s). El folio quedará cerrado.`
                                  }
                                </p>
                              </div>
                            </div>
                            {confirmAction === "cancel" && (
                              <input
                                type="text"
                                value={cancelReason}
                                onChange={e => setCancelReason(e.target.value)}
                                placeholder="Motivo de cancelación (opcional)..."
                                className="w-full px-4 py-2.5 rounded-2xl outline-none border border-white/7 bg-white/5 text-sm font-bold text-white placeholder-white/15 focus:border-red-500/20"
                              />
                            )}
                            <div className="flex gap-3">
                              <button
                                onClick={() => setConfirmAction(null)}
                                className="flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/8 text-white/30 hover:text-white/60 transition-all bg-black/40"
                              >
                                Volver
                              </button>
                              <button
                                onClick={() => handleStatusChange(confirmAction === "cancel" ? "cancelada" : "entregada")}
                                className={`flex-[2] py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                                  confirmAction === "cancel"
                                    ? "bg-red-600 text-white border border-red-500 hover:bg-red-500"
                                    : "bg-green-600 text-white border border-green-500 hover:bg-green-500"
                                }`}
                              >
                                {confirmAction === "cancel"
                                  ? <><XCircle size={13} />Sí, cancelar</>
                                  : <><CheckCircle2 size={13} />Confirmar Entrega</>
                                }
                              </button>
                            </div>
                          </div>
                        </div>
                      </Motion.section>
                    )}
                  </AnimatePresence>

                  {!isAbonoOpen && !confirmAction && (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        {/* Abonar */}
                        <button
                          onClick={() => { setIsAbonoOpen(true); setConfirmAction(null); }}
                          className="py-3 rounded-[18px] font-black text-[9px] uppercase tracking-wider flex flex-col items-center gap-1.5 transition-all border border-white/8 bg-white/[0.03] text-white/40 hover:text-white hover:bg-white/8"
                        >
                          <Wallet size={16} />
                          Abonar
                        </button>

                        {/* Liquidar y Entregar */}
                        <button
                          onClick={() => {
                            setLiquidatePreSale(detailPreSale);
                            setIsAbonoOpen(false);
                            setConfirmAction(null);
                          }}
                          className="py-3 rounded-[18px] font-black text-[9px] uppercase tracking-wider flex flex-col items-center gap-1.5 transition-all border border-green-500/30 bg-green-500/8 text-green-400 hover:bg-green-500/15"
                        >
                          <PackageOpen size={16} />
                          {(detailPreSale.balance ?? 0) > 0 ? "Liquidar" : "Entregar"}
                        </button>

                        {/* Cancelar */}
                        <button
                          onClick={() => { setConfirmAction("cancel"); setIsAbonoOpen(false); }}
                          className="py-3 rounded-[18px] font-black text-[9px] uppercase tracking-wider flex flex-col items-center gap-1.5 transition-all border border-white/5 text-white/15 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5"
                        >
                          <XCircle size={16} />
                          Cancelar
                        </button>
                      </div>

                      {(detailPreSale.balance ?? 0) > 0 && (
                        <p className="text-[8px] text-white/15 font-black text-center uppercase tracking-wider">
                          Registra todos los abonos para habilitar la entrega
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Alerta >7 días para preventas abiertas */}
              {isExpiring(detailPreSale) && (
                <div className="mx-7 mb-0 mt-0 px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 flex items-start gap-3 shrink-0">
                  <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                      Preventa abierta {getDaysOpen(detailPreSale.created_at)} días
                    </p>
                    <p className="text-[9px] font-bold text-amber-400/60 mt-0.5">
                      Si se cancela, el anticipo de {fmt(detailPreSale.paid_amount ?? 0)} se registrará automáticamente como Saldo a Favor del cliente.
                    </p>
                  </div>
                </div>
              )}

              {/* Estado final (completed / cancelled) */}
              {(detailPreSale.status === "completed" || detailPreSale.status === "cancelled") && (
                <div className={`px-7 py-4 border-t shrink-0 flex items-start gap-3 ${
                  detailPreSale.status === "completed"
                    ? "border-green-500/15 bg-green-500/5"
                    : "border-white/5 bg-white/[0.01]"
                }`}>
                  {detailPreSale.status === "completed" ? (
                    <>
                      <CheckCircle2 size={18} className="text-green-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-black text-green-400">Apartado entregado al cliente</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle size={18} className="text-white/45 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-black text-white/30">Apartado cancelado</p>
                        {(detailPreSale.paid_amount ?? 0) > 0 && (
                          <p className="text-[9px] font-black text-amber-400/70 mt-1.5 flex items-center gap-1.5">
                            <Wallet size={9} />
                            {fmt(detailPreSale.paid_amount ?? 0)} registrado como Saldo a Favor
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </Motion.div>
          </>
        )}
      </AnimatePresence>

      {/* LiquidateModal */}
      {liquidatePreSale && (
        <LiquidateModal
          preSale={liquidatePreSale}
          onClose={() => setLiquidatePreSale(null)}
          onSuccess={completed => {
            setLiquidatePreSale(null);
            setDetailPreSale(completed);
            setPreSales(prev => prev.map(p => p.id === completed.id ? completed : p));
            closeDetail();
          }}
        />
      )}

      </>)}

    </div>
  );
}

// ─── Badge de status ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: UIStatus }) {
  const map: Record<UIStatus, { color: string; bg: string; label: string }> = {
    abierta:    { color: "#EF4444", bg: "rgba(239,68,68,0.08)",   label: "Con Saldo"      },
    confirmada: { color: "#F59E0B", bg: "rgba(245,158,11,0.08)",  label: "Por Recolectar" },
    entregada:  { color: "#22C55E", bg: "rgba(34,197,94,0.08)",   label: "Entregada"      },
    cancelada:  { color: "#6B7280", bg: "rgba(107,114,128,0.08)", label: "Cancelada"      },
    vencida:    { color: "#8B5CF6", bg: "rgba(139,92,246,0.08)",  label: "Vencida"        },
  };
  const s = map[status] ?? map.abierta;
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest"
      style={{ color: s.color, background: s.bg }}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
