import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@tadaima/auth";
import { useActiveStore } from "@/contexts/StoreContext";
import { getLayaways, getSalesReport, getInventoryReport, getUsers } from "@tadaima/api";
import { useQuery } from "@tanstack/react-query";
import { useWarehousesQuery } from "@/hooks/queries/useWarehouses";
import { queryKeys } from "@/lib/queryKeys";
import type { Store } from "@tadaima/api";
import {
  ShoppingCart, Package, Store as StoreIcon, AlertTriangle, LayoutDashboard,
  Boxes, CheckCircle2, Lock, ArrowRight,
  TrendingUp, Bookmark, PackageX, Loader2, X,
  Shield, Settings, ArrowLeftRight, Users,
} from "lucide-react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const RED     = "var(--td-red)";
const RED_DIM = "var(--td-red-dim)";
const RED_BRD = "var(--td-red-brd)";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n || 0);

const today = new Date().toISOString().split("T")[0];

// ─── KPI state ────────────────────────────────────────────────────────────────
interface KPIData {
  salesCount: number;
  salesRevenue: number;
  activeLayaways: number;
  lowStockCount: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SetupStepProps {
  n: number;
  title: string;
  desc: string;
  required: boolean;
  done: boolean;
}

function SetupStep({ n, title, desc, required, done }: SetupStepProps) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
      <div className="shrink-0 mt-0.5">
        {done ? (
          <CheckCircle2 size={18} className="text-green-400" />
        ) : (
          <div className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold border border-white/20 text-white/40">
            {n}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${done ? "text-white/40 line-through" : "text-white/80"}`}>
            {title}
          </span>
          {!required && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-white/7 text-white/30">
              Opcional
            </span>
          )}
          {required && !done && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#E0221A]/12 text-red-400/80">
              Requerido
            </span>
          )}
        </div>
        <p className="text-[11px] text-white/30 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}


interface ActionCardProps {
  icon: React.ElementType;
  title: string;
  desc: string;
  onClick: () => void;
  accent?: boolean;
  disabled?: boolean;
}

function ActionCard({ icon: Icon, title, desc, onClick, accent = false, disabled = false }: ActionCardProps) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`glass-dark rounded-2xl p-5 flex flex-col gap-3 w-44 text-left transition-all relative overflow-hidden ${
        disabled ? "cursor-not-allowed" : "cursor-pointer hover:scale-[1.03] active:scale-100"
      }`}
      style={{ border: "1px solid var(--td-panel-border)", opacity: disabled ? 0.45 : 1 }}
    >
      {disabled && (
        <div className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center bg-white/8">
          <Lock size={10} className="text-white/40" />
        </div>
      )}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{
          background: accent && !disabled ? RED_DIM : "var(--td-panel-bg)",
          border: `1px solid ${accent && !disabled ? RED_BRD : "var(--td-panel-border)"}`,
        }}>
        <Icon size={18} style={{ color: accent && !disabled ? RED : "var(--td-icon-inactive)" }} />
      </div>
      <div>
        <div className="text-sm font-semibold text-white/85">{title}</div>
        <div className="text-[11px] text-white/30 mt-0.5">{desc}</div>
      </div>
    </div>
  );
}

interface NoStoreBannerProps {
  isAdmin: boolean;
  onGoToStores: () => void;
}

function NoStoreBanner({ isAdmin, onGoToStores }: NoStoreBannerProps) {
  return (
    <div className="rounded-2xl p-5 flex items-start gap-4 mb-8 max-w-lg"
      style={{ background: "linear-gradient(135deg, rgba(224,34,26,0.12) 0%, rgba(180,20,10,0.07) 100%)", border: `1px solid ${RED_BRD}` }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: RED_DIM, border: `1px solid ${RED_BRD}` }}>
        <AlertTriangle size={18} style={{ color: "#FF6644" }} />
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-white/85 mb-1">Necesitas una tienda para comenzar</div>
        <p className="text-xs text-white/40 leading-relaxed">
          {isAdmin
            ? "Productos y Caja estarán disponibles una vez que registres al menos una tienda o sucursal."
            : "No hay tiendas configuradas en el sistema. Contacta al administrador para continuar."}
        </p>
        {isAdmin && (
          <button onClick={onGoToStores}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-80 transition-opacity"
            style={{ background: "linear-gradient(135deg, #BB1100 0%, #FF3322 100%)" }}>
            Crear primera tienda <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

interface StorePickerModalProps {
  stores: Store[];
  isLoading: boolean;
  onSelect: (s: Store) => void;
  onClose: () => void;
}

function StorePickerModal({ stores, isLoading, onSelect, onClose }: StorePickerModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={onClose}>
      <div className="rounded-2xl p-6 w-80 shadow-2xl"
        style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: RED_DIM, border: `1px solid ${RED_BRD}` }}>
              <StoreIcon size={16} style={{ color: RED }} />
            </div>
            <div>
              <div className="text-sm font-semibold text-white/85">Seleccionar Tienda</div>
              <div className="text-[11px] text-white/30">Para abrir la caja</div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
        {isLoading ? (
          <p className="text-xs text-white/40 text-center py-6">Cargando tiendas...</p>
        ) : (
          <div className="flex flex-col gap-2">
            {stores.map(s => (
              <button key={s.id} onClick={() => onSelect(s)}
                className="w-full text-left px-4 py-3 rounded-xl transition-colors hover:bg-white/10 text-sm font-medium text-white/75"
                style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KPICardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string | undefined;
  color: string;
  colorDim: string;
  loading: boolean;
  onClick?: (() => void) | undefined;
}

function KPICard({ icon: Icon, label, value, sub, color, colorDim, loading, onClick }: KPICardProps) {
  return (
    <div
      onClick={onClick}
      className={`flex-1 min-w-[160px] rounded-2xl p-5 flex flex-col gap-3 ${onClick ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
      style={{
        background: `linear-gradient(135deg, ${colorDim} 0%, rgba(0,0,0,0.3) 100%)`,
        border: `1px solid ${color}30`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${color}20`, border: `1px solid ${color}30` }}>
          <Icon size={16} style={{ color }} />
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: `${color}80` }}>
          {label}
        </span>
      </div>
      {loading ? (
        <Loader2 size={20} className="animate-spin text-white/20" />
      ) : (
        <>
          <div className="text-2xl font-black text-white">{value}</div>
          {sub && <div className="text-[10px] font-bold text-white/30">{sub}</div>}
        </>
      )}
    </div>
  );
}

// ─── Bento helpers ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", marginBottom: "12px" }}>
      {children}
    </p>
  );
}

interface DashCardProps {
  icon: React.ElementType;
  title: string;
  desc?: string | undefined;
  value?: string | number | undefined;
  onClick: () => void;
  accent?: boolean | undefined;
  disabled?: boolean | undefined;
}

function DashCard({ icon: Icon, title, desc, value, onClick, accent = false, disabled = false }: DashCardProps) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLDivElement).style.transform = "scale(1.02)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "scale(1)"; }}
      style={{
        background: accent ? "linear-gradient(135deg, #BB1100 0%, #FF3322 100%)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${accent ? "rgba(204,34,0,0.35)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: "16px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "transform 0.15s ease",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {value !== undefined && (
        <div style={{ position: "absolute", top: "14px", right: "14px", fontSize: "20px", fontWeight: 900, color: accent ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.75)", lineHeight: 1 }}>
          {value}
        </div>
      )}
      <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: accent ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)", border: `1px solid ${accent ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.09)"}`, flexShrink: 0 }}>
        <Icon size={18} style={{ color: accent ? "#fff" : "rgba(255,255,255,0.45)" }} />
      </div>
      <div>
        <div style={{ fontSize: "13px", fontWeight: 700, color: accent ? "#fff" : "rgba(255,255,255,0.82)", lineHeight: 1.2 }}>{title}</div>
        {desc && <div style={{ fontSize: "11px", color: accent ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.28)", marginTop: "3px" }}>{desc}</div>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeStore, stores, setActiveStore, isLoading: storesLoading, productCount } = useActiveStore();

  const [showPicker, setShowPicker]         = useState(false);

  const isAdmin     = user?.roles?.includes("admin") ?? false;
  const firstName   = user?.name?.split(" ")[0] ?? "Usuario";
  const hasStores   = !storesLoading && stores.length > 0;
  const hasProducts = (productCount ?? 0) > 0;

  const warehousesQuery = useWarehousesQuery({ active: true });
  const warehouseCount = isAdmin ? (warehousesQuery.data?.length ?? null) : null;
  const hasWarehouses = warehouseCount !== null && warehouseCount > 0;

  const usersQuery = useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: () => getUsers(),
    enabled: isAdmin,
  });
  const userCount = usersQuery.data?.length ?? null;

  const showSetup = isAdmin && !hasStores;

  // KPI sub-queries — cached per active store
  const kpiStoreId = activeStore?.id;
  const salesKpiQuery = useQuery({
    queryKey: ['dashboard', 'kpi', 'sales', kpiStoreId, today],
    queryFn: () => getSalesReport({ from: today as string, to: today as string, store_id: kpiStoreId! }),
    enabled: !!kpiStoreId,
  });
  const layawaysKpiQuery = useQuery({
    queryKey: ['dashboard', 'kpi', 'layaways', kpiStoreId],
    queryFn: () => getLayaways({ status: "active", store_id: kpiStoreId!, per_page: 1 }),
    enabled: !!kpiStoreId,
  });
  const lowStockKpiQuery = useQuery({
    queryKey: ['dashboard', 'kpi', 'lowStock', kpiStoreId],
    queryFn: () => getInventoryReport({ store_id: kpiStoreId!, low_stock: true, threshold: 5 }),
    enabled: !!kpiStoreId,
  });
  const kpi: KPIData | null = activeStore
    ? {
        salesCount:     salesKpiQuery.data?.summary.total_count    ?? 0,
        salesRevenue:   salesKpiQuery.data?.summary.total_revenue  ?? 0,
        activeLayaways: layawaysKpiQuery.data?.pagination.total    ?? 0,
        lowStockCount:  lowStockKpiQuery.data?.summary.total_skus  ?? 0,
      }
    : null;
  const kpiLoading = !!activeStore && (salesKpiQuery.isPending || layawaysKpiQuery.isPending || lowStockKpiQuery.isPending);

  function handleCaja() {
    if (activeStore) navigate("/caja");
    else setShowPicker(true);
  }

  function handleSelectStore(store: Store) {
    setActiveStore(store);
    setShowPicker(false);
    navigate("/caja");
  }

  return (
    <div className="min-h-screen app-bg p-10">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <LayoutDashboard size={16} className="text-white/25" />
          <span className="text-xs font-medium text-white/25">Dashboard</span>
        </div>
        <h1 className="text-3xl font-bold text-white/85">Hola, {firstName}</h1>
        <p className="text-sm text-white/35 mt-1">
          {!hasStores ? "Configura el sistema para empezar a operar" : "¿Qué quieres hacer hoy?"}
        </p>
      </div>

      {/* No-store alert */}
      {!storesLoading && !hasStores && (
        <NoStoreBanner isAdmin={isAdmin} onGoToStores={() => navigate("/stores")} />
      )}

      {/* ── KPIs del día ──────────────────────────────────────────────────── */}
      {activeStore && (
        <div className="mb-8">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-3">
            Hoy · {activeStore.name}
          </p>
          <div className="flex gap-4 flex-wrap">
            <KPICard
              icon={TrendingUp}
              label="Ventas del día"
              value={kpi ? fmt(kpi.salesRevenue) : "—"}
              sub={kpi ? `${kpi.salesCount} transacciones` : undefined}
              color="#E0221A"
              colorDim="rgba(224,34,26,0.08)"
              loading={kpiLoading}
              onClick={() => navigate("/sales")}
            />
            <KPICard
              icon={Bookmark}
              label="Apartados activos"
              value={kpi ? String(kpi.activeLayaways) : "—"}
              sub={kpi && kpi.activeLayaways > 0 ? "pendientes de entrega" : undefined}
              color="#F59E0B"
              colorDim="rgba(245,158,11,0.08)"
              loading={kpiLoading}
              onClick={() => navigate("/layaways")}
            />
            <KPICard
              icon={PackageX}
              label="Stock crítico"
              value={kpi ? String(kpi.lowStockCount) : "—"}
              sub={kpi && kpi.lowStockCount > 0 ? "productos con ≤ 5 unidades" : kpi ? "Todo en orden" : undefined}
              color={kpi && kpi.lowStockCount > 0 ? "#F97316" : "#34D399"}
              colorDim={kpi && kpi.lowStockCount > 0 ? "rgba(249,115,22,0.08)" : "rgba(52,211,153,0.06)"}
              loading={kpiLoading}
              onClick={() => navigate("/reports")}
            />
          </div>
        </div>
      )}

      {/* ── Admin view ────────────────────────────────────────────────────── */}
      {isAdmin ? (
        <>
          {showSetup && (
            <div className="glass-dark rounded-2xl p-6 mb-8 max-w-lg"
              style={{ border: `1px solid ${RED_BRD}` }}>
              <p className="text-xs font-semibold text-white/60 mb-4">Primeros pasos</p>
              <SetupStep n={1} title="Agrega una tienda" required done={hasStores}
                desc="Registra al menos una sucursal o punto de venta" />
              <SetupStep n={2} title="Agrega un almacén" required={false} done={hasWarehouses}
                desc="Por defecto se crea uno central — puedes agregar más" />
              <SetupStep n={3} title="Alta de productos" required done={false}
                desc="Registra los productos o artículos que vas a vender" />
              <SetupStep n={4} title="Asigna inventario" required done={false}
                desc="Define el stock en almacén o tienda para cada producto" />
            </div>
          )}

          {/* Operaciones */}
          <div className="mb-8">
            <SectionLabel>Operaciones</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" }}>
              <DashCard
                icon={ShoppingCart}
                title="Caja"
                desc={!hasStores ? "Requiere una tienda" : !hasProducts ? "Requiere productos" : activeStore ? activeStore.name : "Selecciona tienda"}
                onClick={handleCaja}
                accent
                disabled={!hasStores || !hasProducts}
              />
              <DashCard
                icon={TrendingUp}
                title="Ventas"
                value={kpi?.salesCount}
                desc={kpi ? fmt(kpi.salesRevenue) : undefined}
                onClick={() => navigate("/sales")}
              />
              <DashCard
                icon={Bookmark}
                title="Preventas"
                value={kpi?.activeLayaways}
                onClick={() => navigate("/pre-sales")}
              />
              <DashCard
                icon={Users}
                title="Clientes"
                onClick={() => navigate("/clients")}
              />
            </div>
          </div>

          {/* Inventario */}
          <div className="mb-8">
            <SectionLabel>Inventario</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" }}>
              <DashCard
                icon={Package}
                title="Productos"
                value={hasStores ? (productCount ?? undefined) : undefined}
                desc={hasStores ? "Ver catálogo" : "Requiere una tienda"}
                onClick={() => navigate("/products")}
                disabled={!hasStores}
              />
              <DashCard
                icon={ArrowLeftRight}
                title="Traslados"
                onClick={() => navigate("/transfers")}
              />
              <DashCard
                icon={Boxes}
                title="Bodegas"
                value={warehouseCount ?? undefined}
                onClick={() => navigate("/admin")}
              />
              <DashCard
                icon={PackageX}
                title="Reportes"
                onClick={() => navigate("/reports")}
              />
            </div>
          </div>

          {/* Sistema */}
          <div className="mb-8">
            <SectionLabel>Sistema</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" }}>
              <DashCard
                icon={StoreIcon}
                title="Tiendas"
                value={storesLoading ? undefined : stores.length}
                onClick={() => navigate("/stores")}
              />
              <DashCard
                icon={Users}
                title="Usuarios"
                value={userCount ?? undefined}
                onClick={() => navigate("/admin")}
              />
              <DashCard
                icon={Shield}
                title="Roles"
                onClick={() => navigate("/admin")}
              />
              <DashCard
                icon={Settings}
                title="Configuración"
                onClick={() => navigate("/settings")}
              />
            </div>
          </div>
        </>
      ) : (
        /* Cajero */
        <div className="flex gap-4 flex-wrap">
          <ActionCard
            icon={ShoppingCart}
            title="Abrir Caja"
            desc={
              !hasStores   ? "Sin tiendas disponibles" :
              !hasProducts ? "Sin productos"           :
              activeStore  ? activeStore.name          : "Selecciona una tienda"
            }
            onClick={handleCaja}
            accent
            disabled={!hasStores || !hasProducts}
          />
          <ActionCard
            icon={Package}
            title="Productos"
            desc={hasStores ? "Ver catálogo" : "Sin tiendas disponibles"}
            onClick={() => navigate("/products")}
            disabled={!hasStores}
          />
        </div>
      )}

      {showPicker && (
        <StorePickerModal
          stores={stores}
          isLoading={storesLoading}
          onSelect={handleSelectStore}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
