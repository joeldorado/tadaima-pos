import { useState, useEffect, useMemo, useRef } from "react";
import {
  Truck, Plus, Search,
  CheckCircle2, Clock, X, ArrowRight,
  Loader2, Package, Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  createTransfer, completeTransfer, cancelTransfer,
  getProducts, getInventory,
} from "@tadaima/api";
import type { InventoryItem, Transfer, Warehouse } from "@tadaima/api";
import { useQueryClient } from "@tanstack/react-query";
import { useTransfersQuery } from "@/hooks/queries/useTransfers";
import { useWarehousesQuery } from "@/hooks/queries/useWarehouses";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@tadaima/auth";
import { isAdmin as isAdminRole, isManager as isManagerRole } from "@/lib/permisos";

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
  btnRed: {
    background: "linear-gradient(135deg, #CC2200 0%, #FF4422 100%)",
    borderRadius: "9999px",
    border: "1px solid rgba(255,120,90,0.3)",
    boxShadow: "0 0 28px rgba(204,34,0,0.45), 0 6px 18px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,180,160,0.25)",
    color: "#ffffff",
  } as React.CSSProperties,
  input: {
    background: "var(--td-input-bg)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid var(--td-input-border)",
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.08)",
    color: "var(--td-input-text)",
  } as React.CSSProperties,
  divider: "1px solid var(--td-divider)",
  softText: "var(--muted-foreground)",
  panelText: "var(--foreground)",
  panelBg: "color-mix(in srgb, var(--card) 88%, transparent)",
  fieldBg: "color-mix(in srgb, var(--card) 76%, var(--background) 24%)",
  fieldBorder: "color-mix(in srgb, var(--border) 88%, transparent)",
  routeChip: "color-mix(in srgb, var(--accent) 82%, transparent)",
  softButton: {
    background: "color-mix(in srgb, var(--card) 72%, var(--background) 28%)",
    border: "1px solid color-mix(in srgb, var(--border) 82%, transparent)",
    color: "var(--foreground)",
  } as React.CSSProperties,
};

// ─── Types ────────────────────────────────────────────────────────────────────
type FilterStatus = "all" | "pending" | "completed" | "cancelled";

interface DraftItem {
  product_id: number;
  name: string;
  sku: string;
  quantity: number;
  quantityInput: string;
}

interface ItemStockSnapshot {
  fromAvailable: number | null;
  toAvailable: number | null;
  loading: boolean;
}

interface ProductSearchResult {
  id: number;
  name: string;
  sku: string;
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function getStatusInfo(status: Transfer["status"]) {
  switch (status) {
    case "pending":   return { bg: "rgba(255,170,0,0.15)",  color: "#FFAA00", icon: Clock,        label: "Pendiente"  };
    case "completed": return { bg: "rgba(0,204,102,0.15)",  color: "#00CC66", icon: CheckCircle2, label: "Completado" };
    case "cancelled": return { bg: "rgba(255,68,34,0.15)",  color: "#FF4422", icon: X,            label: "Cancelado"  };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export function TransfersPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Flujo de negocio 2026-06-11:
  // - Solo admin y gerente pueden usar esta pantalla.
  // - Gerente puede solicitar viendo stock de TODAS las tiendas.
  // - Solo admin puede completar/cancelar traslados.
  const isAdminUser = isAdminRole(user?.roles ?? []);
  const isManagerUser = isManagerRole(user?.roles ?? []);
  const currentUserId = user?.id ?? null;
  const canRequestTransfers = isAdminUser || isManagerUser;
  const canApproveTransfers = isAdminUser;
  const canCancelTransfer = (transfer: Transfer) => {
    if (isAdminUser) return true;
    return isManagerUser && currentUserId !== null && transfer.user_id === currentUserId;
  };
  const transfersQuery = useTransfersQuery({ per_page: 100 });
  const warehousesQuery = useWarehousesQuery({ active: true });
  const transfers: Transfer[] = transfersQuery.data?.data ?? [];
  const warehouses: Warehouse[] = warehousesQuery.data ?? [];
  const loading = transfersQuery.isPending || warehousesQuery.isPending;
  const invalidateTransfers = () => queryClient.invalidateQueries({ queryKey: queryKeys.transfers.all });
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [saving, setSaving]             = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});

  const [searchQuery, setSearchQuery]   = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  // New transfer form
  const [fromWhId, setFromWhId] = useState<string>("");
  const [toWhId, setToWhId]     = useState<string>("");
  const [notes, setNotes]       = useState("");
  const [items, setItems]       = useState<DraftItem[]>([]);
  const [transferMode, setTransferMode] = useState<"pending" | "complete">("pending");
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // Product search inside modal
  const [productSearch, setProductSearch]     = useState("");
  const [productResults, setProductResults]   = useState<ProductSearchResult[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [itemStock, setItemStock] = useState<Record<number, ItemStockSnapshot>>({});
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [selectedProductInventory, setSelectedProductInventory] = useState<InventoryItem[]>([]);
  const [selectedProductInventoryLoading, setSelectedProductInventoryLoading] = useState(false);
  const [draftQtyInput, setDraftQtyInput] = useState("1");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalRequestedUnits = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  useEffect(() => {
    if (transfersQuery.error || warehousesQuery.error) {
      toast.error("Error al cargar transferencias");
    }
  }, [transfersQuery.error, warehousesQuery.error]);

  // Auto-pick first two warehouses once they load (if not already set)
  useEffect(() => {
    if (warehouses.length === 0) return;
    setFromWhId(prev => prev || String(warehouses[0]!.id));
    if (warehouses.length >= 2) {
      setToWhId(prev => prev || String(warehouses[1]!.id));
    }
  }, [warehouses]);

  // ─── Product search (debounced) ────────────────────────────────────────────
  const handleProductSearchChange = (val: string) => {
    setProductSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!val.trim()) { setProductResults([]); return; }
    searchTimeout.current = setTimeout(() => {
      setProductSearching(true);
      getProducts({ search: val, per_page: 8 })
        .then(res => setProductResults(res.data.map(p => ({ id: p.id, name: p.name, sku: p.sku }))))
        .catch(() => { /* silently ignore */ })
        .finally(() => setProductSearching(false));
    }, 300);
  };

  const availableOriginWarehouses = useMemo(() => {
    return selectedProductInventory
      .filter(row => row.quantity > 0 && row.warehouse !== null)
      .map(row => ({
        id: row.warehouse_id,
        name: row.warehouse?.name ?? "Bodega",
        quantity: row.quantity,
      }));
  }, [selectedProductInventory]);

  const selectedProductFromAvailable = useMemo(
    () => availableOriginWarehouses.find(row => String(row.id) === fromWhId)?.quantity ?? 0,
    [availableOriginWarehouses, fromWhId],
  );

  const selectedProductToAvailable = useMemo(
    () => selectedProductInventory.find(row => String(row.warehouse_id) === toWhId)?.quantity ?? 0,
    [selectedProductInventory, toWhId],
  );

  const resetDraftComposer = () => {
    setSelectedProduct(null);
    setSelectedProductInventory([]);
    setDraftQtyInput("1");
    setProductSearch("");
    setProductResults([]);
  };

  const clearSearchComposer = () => {
    setSelectedProduct(null);
    setSelectedProductInventory([]);
    setDraftQtyInput("1");
    setProductSearch("");
    setProductResults([]);
  };

  const handleSelectProduct = async (prod: ProductSearchResult) => {
    setSelectedProduct(prod);
    setSelectedProductInventoryLoading(true);
    setDraftQtyInput("1");
    setProductSearch(prod.name);
    setProductResults([]);

    try {
      const inventoryRows = await getInventory({ product_id: prod.id });
      setSelectedProductInventory(inventoryRows);

      const originOptions = inventoryRows
        .filter(row => row.quantity > 0)
        .map(row => String(row.warehouse_id));

      if (!originOptions.includes(fromWhId)) {
        setFromWhId(originOptions[0] ?? "");
      }

      if (toWhId && (toWhId === fromWhId || !warehouses.some(w => String(w.id) === toWhId))) {
        setToWhId("");
      }
    } catch {
      setSelectedProductInventory([]);
      toast.error("No se pudo cargar inventario del producto");
    } finally {
      setSelectedProductInventoryLoading(false);
    }

  };

  const loadItemStock = async (productId: number, originId: string, destinationId: string) => {
    setItemStock(prev => ({
      ...prev,
      [productId]: {
        fromAvailable: prev[productId]?.fromAvailable ?? null,
        toAvailable: prev[productId]?.toAvailable ?? null,
        loading: true,
      },
    }));

    const [fromRows, toRows] = await Promise.all([
      originId
        ? getInventory({ product_id: productId, warehouse_id: Number(originId) })
        : Promise.resolve([]),
      destinationId
        ? getInventory({ product_id: productId, warehouse_id: Number(destinationId) })
        : Promise.resolve([]),
    ]);

    const snapshot = {
      fromAvailable: fromRows[0]?.quantity ?? 0,
      toAvailable: toRows[0]?.quantity ?? 0,
      loading: false,
    };

    setItemStock(prev => ({ ...prev, [productId]: snapshot }));
    return snapshot;
  };

  const addSelectedProductToTransfer = async () => {
    if (!selectedProduct) {
      toast.error("Selecciona un artículo");
      return;
    }

    if (!fromWhId) {
      toast.error("Selecciona almacén origen");
      return;
    }

    if (!toWhId) {
      toast.error("Selecciona almacén destino");
      return;
    }

    const parsedQty = Number(draftQtyInput);
    if (!Number.isFinite(parsedQty) || parsedQty < 1) {
      toast.error("Ingresa una cantidad válida");
      return;
    }

    try {
      const stock = await loadItemStock(selectedProduct.id, fromWhId, toWhId);

      setItems(prev => {
        const existing = prev.find(i => i.product_id === selectedProduct.id);
        const nextQty = parsedQty;

        if (stock.fromAvailable < 1) {
          toast.error(`"${selectedProduct.name}" no tiene stock en el origen seleccionado`);
          return prev;
        }

        if (nextQty > stock.fromAvailable) {
          toast.error(`Máximo disponible para mover: ${stock.fromAvailable}`);
          return prev;
        }

        if (existing) {
          return prev.map(i =>
            i.product_id === selectedProduct.id
              ? { ...i, quantity: nextQty, quantityInput: String(nextQty) }
              : i
          );
        }

        return [
          ...prev,
          {
            product_id: selectedProduct.id,
            name: selectedProduct.name,
            sku: selectedProduct.sku,
            quantity: nextQty,
            quantityInput: String(nextQty),
          },
        ];
      });
    } catch {
      toast.error("No se pudo consultar el stock del producto");
    }

    clearSearchComposer();
  };

  const removeItem = (productId: number) => {
    setItems(prev => prev.filter(i => i.product_id !== productId));
    setItemStock(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const updateItemQtyInput = (productId: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    setItems(prev => prev.map(i => i.product_id === productId ? { ...i, quantityInput: value } : i));
  };

  const commitItemQtyInput = (productId: number) => {
    setItems(prev => prev.map(i => {
      if (i.product_id !== productId) return i;
      const parsed = Number(i.quantityInput);
      const maxAvailable = itemStock[productId]?.fromAvailable;
      if (!Number.isFinite(parsed) || parsed < 1) {
        return { ...i, quantityInput: String(i.quantity) };
      }
      if (typeof maxAvailable === "number" && parsed > maxAvailable) {
        toast.error(`Solo hay ${maxAvailable} pza(s) disponibles en origen`);
        return { ...i, quantity: maxAvailable, quantityInput: String(maxAvailable) };
      }
      return { ...i, quantity: parsed, quantityInput: String(parsed) };
    }));
  };

  const setItemQtyToMax = (productId: number) => {
    const maxAvailable = itemStock[productId]?.fromAvailable;
    if (typeof maxAvailable !== "number" || maxAvailable < 1) {
      toast.error("No hay stock disponible en origen");
      return;
    }

    setItems(prev => prev.map(item =>
      item.product_id === productId
        ? { ...item, quantity: maxAvailable, quantityInput: String(maxAvailable) }
        : item
    ));
  };

  const resetModal = () => {
    setItems([]);
    setItemStock({});
    resetDraftComposer();
    setTransferMode("pending");
    setCurrentStep(1);
    setNotes("");
  };

  // ─── Actions ───────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!fromWhId || !toWhId)       { toast.error("Selecciona origen y destino"); return; }
    if (fromWhId === toWhId)        { toast.error("Origen y destino no pueden ser iguales"); return; }
    if (items.length === 0)         { toast.error("Agrega al menos un producto"); return; }
    if (transferMode === "complete" && !canApproveTransfers) {
      toast.error("Solo Admin puede completar transferencias");
      return;
    }
    const itemWithoutStock = items.find(item => {
      const available = itemStock[item.product_id]?.fromAvailable;
      return typeof available === "number" && available < 1;
    });
    if (itemWithoutStock) {
      toast.error(`"${itemWithoutStock.name}" no tiene stock disponible en origen`);
      return;
    }
    const itemOverLimit = items.find(item => {
      const available = itemStock[item.product_id]?.fromAvailable;
      return typeof available === "number" && item.quantity > available;
    });
    if (itemOverLimit) {
      const available = itemStock[itemOverLimit.product_id]?.fromAvailable ?? 0;
      toast.error(`"${itemOverLimit.name}" excede el stock disponible (${available})`);
      return;
    }
    setSaving(true);
    let createdTransfer: Transfer | null = null;
    try {
      createdTransfer = await createTransfer({
        from_warehouse_id: Number(fromWhId),
        to_warehouse_id:   Number(toWhId),
        notes:             notes.trim() || undefined,
        items:             items.map(i => ({ product_id: i.product_id, quantity: Math.max(1, Number(i.quantityInput) || i.quantity) })),
      });

      if (transferMode === "complete") {
        await completeTransfer(createdTransfer.id);
      }

      void invalidateTransfers();
      toast.success(transferMode === "complete" ? "Transferencia completada" : "Transferencia creada");
      setIsModalOpen(false);
      resetModal();
    } catch {
      if (createdTransfer) {
        void invalidateTransfers();
        toast.error("La transferencia se creó, pero no se pudo completar automáticamente");
      } else {
        toast.error(transferMode === "complete" ? "Error al completar transferencia" : "Error al crear transferencia");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (id: number) => {
    if (!canApproveTransfers) {
      toast.error("Solo Admin puede completar transferencias");
      return;
    }
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await completeTransfer(id);
      void invalidateTransfers();
      toast.success("Transferencia completada — inventario actualizado");
    } catch {
      toast.error("Error al completar transferencia");
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleCancel = async (id: number) => {
    const transfer = transfers.find(item => item.id === id);
    const allowed = transfer ? canCancelTransfer(transfer) : false;
    if (!allowed) {
      toast.error("Solo Admin o el gerente creador pueden cancelar esta transferencia");
      return;
    }
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await cancelTransfer(id);
      void invalidateTransfers();
      toast.success("Transferencia cancelada");
    } catch {
      toast.error("Error al cancelar transferencia");
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  // ─── Derived state ─────────────────────────────────────────────────────────
  const filteredTransfers = useMemo(() => {
    return transfers.filter(t => {
      const from = t.from_warehouse?.name ?? "";
      const to   = t.to_warehouse?.name ?? "";
      const matchesSearch = String(t.id).includes(searchQuery) ||
                            from.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            to.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === "all" || t.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [transfers, searchQuery, filterStatus]);

  const destinationWarehouses = useMemo(() => {
    return warehouses
      .filter(w => String(w.id) !== fromWhId)
      .map(warehouse => ({
        ...warehouse,
        quantity: selectedProductInventory.find(row => row.warehouse_id === warehouse.id)?.quantity ?? 0,
      }));
  }, [warehouses, fromWhId, selectedProductInventory]);

  useEffect(() => {
    if (fromWhId && toWhId === fromWhId) {
      setToWhId("");
    }
  }, [fromWhId, toWhId]);

  useEffect(() => {
    if (!selectedProduct) return;
    if (availableOriginWarehouses.length === 0) {
      setFromWhId("");
      return;
    }
    if (!availableOriginWarehouses.some(option => String(option.id) === fromWhId)) {
      setFromWhId(String(availableOriginWarehouses[0]!.id));
    }
  }, [selectedProduct, availableOriginWarehouses, fromWhId]);

  useEffect(() => {
    if (items.length === 0) {
      setItemStock({});
      return;
    }

    void Promise.all(items.map(async (item) => {
      try {
        const stock = await loadItemStock(item.product_id, fromWhId, toWhId);
        setItems(prev => prev.map(current => {
          if (current.product_id !== item.product_id) return current;
          if (stock.fromAvailable < 1) return current;
          if (current.quantity > stock.fromAvailable) {
            return {
              ...current,
              quantity: stock.fromAvailable,
              quantityInput: String(stock.fromAvailable),
            };
          }
          return current;
        }));
      } catch {
        // keep current item editable; create action will still re-check limits
      }
    }));
  }, [fromWhId, toWhId, items.map(item => item.product_id).join(",")]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: T.bgGrad }}>

      {canRequestTransfers ? (
      <>

      {/* ── Navbar ──────────────────────────────────────────────────────────── */}
      <header className="min-h-20 shrink-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 sm:gap-4 px-4 sm:px-6 lg:px-8 py-3 z-20 relative" style={{ borderBottom: T.divider }}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
            <Truck size={24} style={{ color: T.redBright }} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2" style={{ color: T.textPrimary }}>
              MOVIMIENTOS <span style={{ color: T.redBright }}>DE STOCK</span>
            </h1>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40" style={{ color: T.textSecondary }}>
              Logística y Resurtido Tadaima
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto justify-center flex items-center gap-2 px-5 sm:px-6 py-3 font-black text-[11px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
          style={T.btnRed}
        >
          <Plus size={16} strokeWidth={3} />
          Nueva Transferencia
        </button>
      </header>

      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">

        {/* ── Lista ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 custom-scrollbar">

          {/* Search + filter */}
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 sm:gap-6">
            <div className="flex-1 relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2" size={18} style={{ color: T.textMuted }} />
              <input
                type="text"
                placeholder="Buscar transferencia..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-4 rounded-[20px] outline-none border transition-all font-bold text-sm"
                style={T.input}
              />
            </div>
            <div className="flex items-center gap-1.5 p-1.5 rounded-[22px] bg-white/5 border border-white/5 overflow-x-auto">
              {(["all", "pending", "completed", "cancelled"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-5 py-2.5 rounded-[16px] text-[10px] font-black uppercase tracking-wider transition-all ${
                    filterStatus === s ? "bg-red-600 text-white" : "text-white/30 hover:bg-white/5"
                  }`}
                >
                  {s === "all" ? "Todos" : s === "pending" ? "Pendientes" : s === "completed" ? "Completados" : "Cancelados"}
                </button>
              ))}
            </div>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 gap-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-20 gap-4">
                <Loader2 size={32} className="animate-spin text-red-500" />
                <p className="text-xs font-black uppercase tracking-widest text-white/20">Sincronizando almacenes...</p>
              </div>
            ) : filteredTransfers.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-20 gap-4">
                <Package size={36} className="text-white/10" />
                <p className="text-xs font-black uppercase tracking-widest text-white/20">Sin transferencias</p>
              </div>
            ) : filteredTransfers.map(trf => {
              const s = getStatusInfo(trf.status);
              const StatusIcon = s.icon;
              const busy = actionLoading[trf.id] ?? false;
              return (
                <motion.div
                  key={trf.id}
                  layout
                  className="group rounded-[28px] sm:rounded-[32px] border border-white/5 overflow-hidden flex flex-col lg:flex-row"
                  style={T.glass}
                >
                  <div className="w-2 shrink-0" style={{ background: s.color }} />
                  <div className="flex-1 p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">

                    {/* ID + status */}
                    <div className="w-full lg:w-40 shrink-0 space-y-3">
                      <p className="text-lg font-black text-white">#{trf.id}</p>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest" style={{ background: s.bg, color: s.color }}>
                        <StatusIcon size={12} />
                        {s.label}
                      </div>
                    </div>

                    {/* Route */}
                    <div className="w-full lg:flex-1 flex items-center justify-between lg:px-8 py-2 lg:py-0 border-y lg:border-y-0 lg:border-x border-white/5">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">Origen</span>
                        <span className="text-sm font-bold text-white">{trf.from_warehouse?.name ?? "—"}</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <ArrowRight size={14} className="text-white/20" />
                        <span className="text-[9px] font-black text-white/20">{trf.items?.length ?? "—"} SKU</span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[9px] font-black text-green-500 uppercase tracking-widest">Destino</span>
                        <span className="text-sm font-bold text-white">{trf.to_warehouse?.name ?? "—"}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="w-full lg:w-52 shrink-0 flex flex-col items-start lg:items-end gap-3">
                      <p className="text-[10px] font-bold text-white/40">{trf.created_at.split("T")[0]}</p>
                      {trf.status === "pending" && canApproveTransfers && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => void handleComplete(trf.id)}
                            disabled={busy}
                            className="text-[10px] font-black uppercase px-3 py-1.5 rounded-xl transition-all hover:scale-105 disabled:opacity-40"
                            style={{ background: "rgba(0,204,102,0.15)", color: "#00CC66" }}
                          >
                            {busy ? <Loader2 size={10} className="animate-spin" /> : "Completar"}
                          </button>
                          {canCancelTransfer(trf) && (
                            <button
                              onClick={() => void handleCancel(trf.id)}
                              disabled={busy}
                              className="text-[10px] font-black uppercase px-3 py-1.5 rounded-xl transition-all hover:scale-105 disabled:opacity-40"
                              style={{ background: "rgba(255,68,34,0.12)", color: "#FF4422" }}
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      )}

                      {trf.status === "pending" && !canApproveTransfers && canCancelTransfer(trf) && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => void handleCancel(trf.id)}
                            disabled={busy}
                            className="text-[10px] font-black uppercase px-3 py-1.5 rounded-xl transition-all hover:scale-105 disabled:opacity-40"
                            style={{ background: "rgba(255,68,34,0.12)", color: "#FF4422" }}
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className="w-full xl:w-80 shrink-0 border-t xl:border-t-0 xl:border-l border-white/5 p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 bg-white/[0.02] backdrop-blur-3xl overflow-y-auto">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500">Logística Tadaima</p>
            <h3 className="text-lg font-black text-white">Estado de Flujo</h3>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {([
              { label: "Pendientes",  val: transfers.filter(t => t.status === "pending").length,   color: "#FFAA00", icon: Clock        },
              { label: "Completados", val: transfers.filter(t => t.status === "completed").length, color: "#00CC66", icon: CheckCircle2 },
              { label: "Cancelados",  val: transfers.filter(t => t.status === "cancelled").length, color: "#FF4422", icon: X            },
            ] as const).map((stat, i) => (
              <div key={i} className="p-5 rounded-3xl border border-white/5 bg-white/5">
                <div className="flex items-center justify-between mb-3">
                  <stat.icon size={18} style={{ color: stat.color }} />
                  <span className="text-2xl font-black italic text-white/90">{stat.val}</span>
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/30">{stat.label}</p>
              </div>
            ))}
          </div>


        </div>
      </div>
      </>
      ) : (
        <div className="p-10">
          <div className="max-w-xl rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-black uppercase tracking-wide text-white">Acceso restringido</h2>
            <p className="mt-2 text-sm text-white/70">
              Esta pantalla solo esta disponible para perfiles Admin y Gerente.
            </p>
          </div>
        </div>
      )}

      {/* ── Modal: Nueva Transferencia ───────────────────────────────────── */}
      {isModalOpen && canRequestTransfers && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-[#07070a]/90 backdrop-blur-2xl"
            onClick={() => { setIsModalOpen(false); resetModal(); }}
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[95vw] max-w-6xl rounded-[26px] sm:rounded-[40px] lg:rounded-[48px] flex flex-col shadow-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden"
            style={T.glass}
          >
            {/* Header */}
            <div className="relative px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex flex-col gap-3 shrink-0" style={{ borderBottom: `1px solid ${T.fieldBorder}` }}>
              {/* Botón cerrar — esquina superior derecha */}
              <button
                onClick={() => { setIsModalOpen(false); resetModal(); }}
                className="absolute top-4 right-4 w-9 h-9 rounded-xl flex items-center justify-center transition-colors z-10"
                style={{ background: T.routeChip, color: T.softText, border: `1px solid ${T.fieldBorder}` }}
              >
                <X size={18} />
              </button>
              <div className="min-w-0 flex-1 pr-12">
                <h2 className="text-2xl font-black uppercase tracking-tighter" style={{ color: T.panelText }}>Nueva Transferencia</h2>
                <div className="mt-2 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="flex items-center gap-3 overflow-x-auto pb-1">
                    {[
                      { step: 1 as const, label: "Datos" },
                      { step: 2 as const, label: "Revisión" },
                    ].map(({ step, label }) => {
                      const isActive = currentStep === step;
                      const isDone = currentStep > step;
                      return (
                        <button
                          key={step}
                          type="button"
                          onClick={() => {
                            if (step === 1) setCurrentStep(1);
                            if (step === 2 && items.length > 0) setCurrentStep(2);
                          }}
                        className="flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] transition-colors"
                          style={{
                            background: isActive ? T.routeChip : "transparent",
                            color: isActive ? T.panelText : T.softText,
                            border: `1px solid ${isActive ? T.fieldBorder : "transparent"}`,
                            opacity: isDone || isActive ? 1 : 0.55,
                          }}
                        >
                          <span
                            className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black"
                            style={{
                              background: isActive ? T.redBright : T.fieldBg,
                              color: isActive ? "#fff" : T.panelText,
                              border: `1px solid ${T.fieldBorder}`,
                            }}
                          >
                            {isDone ? "✓" : step}
                          </span>
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTransferMode("pending")}
                      className="rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors"
                      style={transferMode === "pending"
                        ? { background: T.redBright, color: "#fff", border: `1px solid ${T.fieldBorder}` }
                        : { ...T.softButton }}
                    >
                      Solicitar
                    </button>
                    {/* "Completar ahora" mueve stock inmediatamente, sin que la
                        tienda destino confirme la recepción. Solo admin debe
                        poder hacer eso — gerente solo solicita y el admin
                        confirma del otro lado. Decisión Joel 2026-05-25. */}
                    {isAdminUser && (
                      <button
                        type="button"
                        onClick={() => setTransferMode("complete")}
                        className="rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors"
                        style={transferMode === "complete"
                          ? { background: "#0f9d68", color: "#fff", border: `1px solid ${T.fieldBorder}` }
                          : { ...T.softButton, color: T.softText }}
                      >
                        Completar ahora
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-6 lg:p-8 xl:p-10 flex flex-col gap-6 overflow-y-auto custom-scrollbar">

              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="rounded-[28px] p-5" style={{ background: T.panelBg, border: `1px solid ${T.fieldBorder}` }}>
                    <p className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: T.softText }}>Paso 1</p>
                    <h3 className="mt-1 text-xl font-black" style={{ color: T.panelText }}>Datos</h3>

                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-[minmax(260px,1.45fr)_minmax(190px,1fr)_minmax(190px,1fr)_110px_96px_128px] xl:grid-cols-[minmax(220px,1.35fr)_minmax(170px,1fr)_minmax(170px,1fr)_96px_88px_116px] gap-3 xl:gap-4 items-end">
                      <div className="space-y-2 relative">
                        <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.softText }}>Buscar artículo</label>
                        <input
                          type="text"
                          value={productSearch}
                          onChange={e => handleProductSearchChange(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") e.preventDefault();
                          }}
                          placeholder="Nombre o SKU..."
                          className="w-full p-4 rounded-2xl text-sm outline-none"
                          style={{ background: T.fieldBg, border: `1px solid ${T.fieldBorder}`, color: T.panelText }}
                        />
                        {productSearching && (
                          <Loader2 size={14} className="absolute right-4 top-[42px] animate-spin" style={{ color: T.softText }} />
                        )}
                        {productResults.length > 0 && (
                          <div className="absolute top-full mt-2 w-full rounded-2xl overflow-hidden z-10" style={{ ...T.glassMd, border: `1px solid ${T.fieldBorder}` }}>
                            {productResults.map(prod => (
                              <button
                                key={prod.id}
                                type="button"
                                onClick={() => { void handleSelectProduct(prod); }}
                                className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
                                style={{ color: T.panelText }}
                              >
                                <div>
                                  <p className="text-xs font-bold">{prod.name}</p>
                                  <p className="text-[9px] font-black uppercase" style={{ color: T.softText }}>{prod.sku}</p>
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: T.redBright }}>Elegir</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.softText }}>Origen</label>
                        <select
                          value={fromWhId}
                          onChange={e => setFromWhId(e.target.value)}
                          disabled={!selectedProduct}
                          className="w-full p-4 pr-10 rounded-2xl outline-none text-sm font-semibold"
                          style={{ background: T.fieldBg, border: `1px solid ${T.fieldBorder}`, color: T.panelText, opacity: selectedProduct ? 1 : 0.6 }}
                        >
                          <option value="" className="bg-[var(--card)]">Seleccionar…</option>
                          {availableOriginWarehouses.map(option => (
                            <option key={option.id} value={option.id} className="bg-[var(--card)]">
                              {option.name} · {option.quantity}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.softText }}>Destino</label>
                        <select
                          value={toWhId}
                          onChange={e => setToWhId(e.target.value)}
                          disabled={!selectedProduct || !fromWhId}
                          className="w-full p-4 pr-10 rounded-2xl outline-none text-sm font-semibold"
                          style={{ background: T.fieldBg, border: `1px solid ${T.fieldBorder}`, color: T.panelText, opacity: selectedProduct && fromWhId ? 1 : 0.6 }}
                        >
                          <option value="" className="bg-[var(--card)]">Seleccionar…</option>
                          {destinationWarehouses.map(w => (
                            <option key={w.id} value={w.id} className="bg-[var(--card)]">{w.name} · {w.quantity}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.softText }}>Cantidad</label>
                        <input
                          type="number"
                          min={1}
                          max={Math.max(1, selectedProductFromAvailable)}
                          value={draftQtyInput}
                          onChange={e => setDraftQtyInput(e.target.value)}
                          className="w-full p-4 rounded-2xl outline-none font-black text-center text-lg"
                          style={{ background: T.fieldBg, border: `1px solid ${T.fieldBorder}`, color: T.panelText }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => setDraftQtyInput(String(Math.max(1, selectedProductFromAvailable)))}
                        className="h-[54px] w-full sm:w-auto rounded-2xl px-4 text-[10px] font-black uppercase tracking-wider"
                        style={T.softButton}
                      >
                        Todo
                      </button>

                      <button
                        type="button"
                        onClick={() => { void addSelectedProductToTransfer(); }}
                        className="h-[54px] w-full sm:w-auto rounded-2xl px-5 text-[10px] font-black uppercase tracking-wider"
                        style={{ background: T.redBright, color: "#fff", border: `1px solid ${T.fieldBorder}` }}
                      >
                        Agregar
                      </button>
                    </div>

                    {selectedProduct && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {fromWhId !== "" && (
                          <span className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider" style={{ ...T.softButton, color: T.softText }}>
                            Disponible en origen: {selectedProductFromAvailable}
                          </span>
                        )}
                        {toWhId !== "" && (
                          <span className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider" style={{ ...T.softButton, color: T.softText }}>
                            Stock en destino: {selectedProductToAvailable}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-[28px] p-5" style={{ background: T.panelBg, border: `1px solid ${T.fieldBorder}` }}>
                    <p className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: T.softText }}>Artículos</p>
                    <h3 className="mt-1 text-lg font-black" style={{ color: T.panelText }}>Artículos</h3>

                    <div className="mt-4 hidden lg:grid grid-cols-[minmax(180px,1.25fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(160px,1fr)_140px_48px] xl:grid-cols-[minmax(220px,1.35fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_150px_48px] gap-4 px-4 text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: T.softText }}>
                      <span className="text-left">Artículo</span>
                      <span className="text-center">Origen</span>
                      <span className="text-center">Destino</span>
                      <span className="text-center">Quedarían en</span>
                      <span className="text-center">Cantidad</span>
                      <span className="text-center"></span>
                    </div>

                    <div className="mt-3 space-y-3 max-h-[420px] overflow-y-auto custom-scrollbar">
                      {items.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 gap-2 rounded-2xl" style={{ background: T.fieldBg, border: `1px solid ${T.fieldBorder}` }}>
                          <Package size={22} style={{ color: T.softText }} />
                          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.softText }}>Todavía no agregas artículos</p>
                        </div>
                      )}
                      {items.map(item => (
                        <div
                          key={item.product_id}
                          className="grid grid-cols-1 lg:grid-cols-[minmax(180px,1.25fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(160px,1fr)_140px_48px] xl:grid-cols-[minmax(220px,1.35fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_150px_48px] gap-3 xl:gap-4 items-center rounded-2xl p-4 xl:px-5"
                          style={{ background: T.fieldBg, border: `1px solid ${T.fieldBorder}` }}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate" style={{ color: T.panelText }}>{item.name}</p>
                            <p className="text-[9px] font-black uppercase" style={{ color: T.softText }}>{item.sku}</p>
                          </div>
                          <div className="text-xs font-bold truncate lg:text-center" style={{ color: T.panelText }}>
                            <span className="mr-1 lg:hidden text-[10px] uppercase" style={{ color: T.softText }}>Origen:</span>
                            {warehouses.find(w => String(w.id) === fromWhId)?.name ?? "—"}
                          </div>
                          <div className="text-xs font-bold truncate lg:text-center" style={{ color: T.panelText }}>
                            <span className="mr-1 lg:hidden text-[10px] uppercase" style={{ color: T.softText }}>Destino:</span>
                            {warehouses.find(w => String(w.id) === toWhId)?.name ?? "—"}
                          </div>
                          {/* Proyección tras el traslado: origen pierde, destino gana */}
                          <div className="lg:text-center space-y-1">
                            <span className="lg:hidden text-[10px] font-black uppercase" style={{ color: T.softText }}>Quedarían en: </span>
                            {(() => {
                              const fromNow = itemStock[item.product_id]?.fromAvailable ?? null;
                              const toNow   = itemStock[item.product_id]?.toAvailable   ?? null;
                              const fromAfter = fromNow !== null ? fromNow - item.quantity : null;
                              const toAfter   = toNow   !== null ? toNow   + item.quantity : null;
                              return (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[11px] font-black" style={{ color: fromAfter !== null && fromAfter < 0 ? "#FF4422" : T.panelText }}>
                                    {warehouses.find(w => String(w.id) === fromWhId)?.name?.split("—")[1]?.trim() ?? "Origen"}: {fromAfter !== null ? fromAfter : "—"}
                                  </span>
                                  <span className="text-[11px] font-black" style={{ color: "#00CC66" }}>
                                    {warehouses.find(w => String(w.id) === toWhId)?.name?.split("—")[1]?.trim() ?? "Destino"}: {toAfter !== null ? toAfter : "—"}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-2 lg:justify-center">
                            <button
                              type="button"
                              onClick={() => setItemQtyToMax(item.product_id)}
                              className="rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider"
                              style={T.softButton}
                            >
                              Todo
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={item.quantityInput}
                              onChange={e => updateItemQtyInput(item.product_id, e.target.value)}
                              onBlur={() => commitItemQtyInput(item.product_id)}
                              className="w-16 rounded-lg text-center font-black text-sm outline-none py-1.5"
                              style={{ background: T.panelBg, border: `1px solid ${T.fieldBorder}`, color: T.redBright }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(item.product_id)}
                            className="transition-colors lg:justify-self-center"
                            style={{ color: T.softText }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
                  <div className="rounded-[28px] p-5 flex flex-col min-h-[380px]" style={{ background: T.panelBg, border: `1px solid ${T.fieldBorder}` }}>
                    <div className="mb-4 shrink-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: T.softText }}>Paso 2</p>
                      <h3 className="mt-1 text-xl font-black" style={{ color: T.panelText }}>Revisa y ajusta</h3>
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1">
                      {items.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 gap-2 rounded-2xl h-full" style={{ background: T.fieldBg, border: `1px solid ${T.fieldBorder}` }}>
                          <Package size={22} style={{ color: T.softText }} />
                          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: T.softText }}>Todavía no agregas artículos</p>
                        </div>
                      )}
                      {items.map(item => (
                        <div
                          key={item.product_id}
                          className="p-4 rounded-2xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4"
                          style={{ background: T.fieldBg, border: `1px solid ${T.fieldBorder}` }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate" style={{ color: T.panelText }}>{item.name}</p>
                            <p className="text-[9px] uppercase font-black" style={{ color: T.softText }}>{item.sku}</p>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <span className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide" style={{ background: T.routeChip, color: T.panelText, border: `1px solid ${T.fieldBorder}` }}>
                                Origen: {itemStock[item.product_id]?.loading ? "..." : (itemStock[item.product_id]?.fromAvailable ?? "—")}
                              </span>
                              <span className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide" style={{ background: T.routeChip, color: T.panelText, border: `1px solid ${T.fieldBorder}` }}>
                                Destino: {itemStock[item.product_id]?.loading ? "..." : (itemStock[item.product_id]?.toAvailable ?? "—")}
                              </span>
                            </div>
                          </div>
                          <div className="w-full sm:w-auto flex items-center gap-2 sm:gap-3 justify-between sm:justify-start shrink-0">
                            <button
                              type="button"
                              onClick={() => setItemQtyToMax(item.product_id)}
                              className="rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider"
                              style={T.softButton}
                            >
                              Todo
                            </button>
                            <div className="min-w-[52px] text-center">
                              <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: T.softText }}>
                                {item.quantity} / {itemStock[item.product_id]?.fromAvailable ?? "—"}
                              </p>
                              <p className="text-[8px] font-black uppercase tracking-wider" style={{ color: T.softText }}>
                                actual/max
                              </p>
                            </div>
                            <input
                              type="number"
                              min={1}
                              value={item.quantityInput}
                              onChange={e => updateItemQtyInput(item.product_id, e.target.value)}
                              onBlur={() => commitItemQtyInput(item.product_id)}
                              className="w-16 rounded-lg text-center font-black text-sm outline-none py-1.5"
                              style={{ background: T.panelBg, border: `1px solid ${T.fieldBorder}`, color: T.redBright }}
                            />
                            <button
                              type="button"
                              onClick={() => removeItem(item.product_id)}
                              className="transition-colors"
                              style={{ color: T.softText }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-[28px] p-5" style={{ background: T.panelBg, border: `1px solid ${T.fieldBorder}` }}>
                      <p className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: T.softText }}>Resumen</p>
                      <div className="mt-3 flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-[9px] font-black uppercase tracking-[0.24em]" style={{ color: T.softText }}>Origen</p>
                          <p className="truncate text-sm font-black" style={{ color: T.panelText }}>
                            {warehouses.find(w => String(w.id) === fromWhId)?.name ?? "Sin origen"}
                          </p>
                        </div>
                        <ArrowRight size={16} style={{ color: T.redBright }} />
                        <div className="min-w-0 flex-1 text-right">
                          <p className="text-[9px] font-black uppercase tracking-[0.24em]" style={{ color: T.softText }}>Destino</p>
                          <p className="truncate text-sm font-black" style={{ color: T.panelText }}>
                            {warehouses.find(w => String(w.id) === toWhId)?.name ?? "Sin destino"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider" style={{ background: T.routeChip, color: T.panelText, border: `1px solid ${T.fieldBorder}` }}>
                          {items.length} artículo(s)
                        </span>
                        <span className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider" style={{ background: T.routeChip, color: T.panelText, border: `1px solid ${T.fieldBorder}` }}>
                          {totalRequestedUnits} unidad(es)
                        </span>
                        <span className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider" style={{ background: T.routeChip, color: T.panelText, border: `1px solid ${T.fieldBorder}` }}>
                          {transferMode === "complete" ? "Completar ahora" : "Solicitar"}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-[28px] p-5 space-y-3" style={{ background: T.panelBg, border: `1px solid ${T.fieldBorder}` }}>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: T.softText }}>Notas</p>
                        <h3 className="mt-1 text-lg font-black" style={{ color: T.panelText }}>Contexto opcional</h3>
                      </div>
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        rows={8}
                        placeholder="Observaciones de la transferencia..."
                        className="w-full resize-none p-4 rounded-2xl text-sm outline-none"
                        style={{ background: T.fieldBg, border: `1px solid ${T.fieldBorder}`, color: T.panelText }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col sm:flex-row gap-3 sm:gap-5 shrink-0" style={{ borderTop: `1px solid ${T.fieldBorder}`, background: T.panelBg }}>
              <button
                onClick={() => {
                  if (currentStep > 1) {
                    setCurrentStep(1);
                    return;
                  }
                  setIsModalOpen(false);
                  resetModal();
                }}
                className="flex-1 py-5 rounded-[24px] font-black text-[11px] uppercase transition-colors"
                style={{ background: T.routeChip, color: T.panelText, border: `1px solid ${T.fieldBorder}` }}
              >
                {currentStep > 1 ? "Atrás" : "Cancelar"}
              </button>
              {currentStep === 1 && (
                <button
                  type="button"
                  onClick={() => items.length > 0 ? setCurrentStep(2) : toast.error("Agrega al menos un artículo")}
                  className="flex-[1.5] py-5 rounded-[24px] font-black text-[11px] uppercase transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                  style={T.btnRed}
                >
                  Revisar transferencia
                </button>
              )}
              {currentStep === 2 && (
                <button
                  onClick={() => void handleCreate()}
                  disabled={saving}
                  className="flex-[1.5] py-5 rounded-[24px] font-black text-[11px] uppercase transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={T.btnRed}
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {transferMode === "complete" ? "Transferir y completar" : "Solicitar transferencia"}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
