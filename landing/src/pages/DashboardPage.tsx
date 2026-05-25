import { useState } from "react";
import { useTodayLocal, daysAgoLocal, getTodayLocal } from "@/lib/date";
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
  Shield, Settings, ArrowLeftRight, Users, ImageIcon, Wallet,
  Clock, RefreshCw,
} from "lucide-react";
import { primaryRole, isCashier } from "@/lib/permisos";
import { UserAvatar } from "@/components/UserAvatar";
import { AvatarPicker } from "@/components/AvatarPicker";
import { CashCloseSummaryModal } from "@/components/cash/CashCloseSummaryModal";
import { useQueryClient } from "@tanstack/react-query";
import { getCashReport, type CashSessionReport } from "@tadaima/api";
import { useOnlineUsersQuery } from "@/hooks/queries/useUsers";

// ─── Design tokens ────────────────────────────────────────────────────────────
const RED     = "var(--td-red)";
const RED_DIM = "var(--td-red-dim)";
const RED_BRD = "var(--td-red-brd)";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n || 0);

// `useTodayLocal`, `getTodayLocal`, `daysAgoLocal` viven en @/lib/date para
// reusarse en SalesPage, ReportsPage, SellPage. Antes este archivo tenía un
// `const today = new Date().toISOString().split("T")[0]` a nivel módulo que
// se evaluaba una sola vez al cargar el bundle — quedaba stale al cruzar
// medianoche y además daba la fecha UTC (no la local del navegador).

// "Hace Xm" — `last_seen_at` viene en ISO desde backend (touch al hit del middleware)
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60)   return `hace ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)   return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)     return `hace ${hours}h`;
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

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
  const queryClient = useQueryClient();
  // Fecha local reactiva: cambia automáticamente al cruzar medianoche y dispara
  // re-fetch de las queries del día (KPIs admin + Cortes de hoy del gerente).
  const today = useTodayLocal();
  const { activeStore, stores, setActiveStore, isLoading: storesLoading, productCount } = useActiveStore();

  const [showPicker, setShowPicker]         = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  // Mis Cortes — cajero ve histórico de sus propias sesiones cerradas
  const [showMyCutsModal, setShowMyCutsModal] = useState(false);
  const [selectedCut, setSelectedCut] = useState<CashSessionReport | null>(null);

  const role = primaryRole(user?.roles);
  const isGerente = role === "gerente";
  const isAdmin     = user?.roles?.includes("admin") ?? false;

  // Cajero: dashboard simple "Mi Perfil" — avatar editable, datos read-only
  // y acceso a sus cortes de caja. Sin KPIs ni setup global.
  // Query de cortes propios del cajero (RBAC backend ya lo limita a su user_id).
  const myCutsQuery = useQuery({
    queryKey: ['my-cuts', user?.id],
    queryFn: () => getCashReport({
      // últimos 90 días — rango razonable para que vea su historial
      from: daysAgoLocal(90),
      to:   getTodayLocal(),
    }),
    enabled: role === "cajero" && showMyCutsModal && !!user?.id,
    staleTime: 30_000,
  });
  const myCuts = myCutsQuery.data?.sessions ?? [];
  const fmtMoney = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (role === "cajero") {
    return (
      <div className="min-h-screen app-bg p-10 flex flex-col items-center justify-center">
        <div className="w-full max-w-md p-8 rounded-3xl"
          style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-card-border)" }}>
          <div className="flex flex-col items-center text-center gap-5">
            <UserAvatar name={user?.name ?? ""} avatarUrl={user?.avatar_url ?? null} size={96} />
            <div>
              <p style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", color: "var(--td-text-ghost)" }}>
                Mi Perfil
              </p>
              <h1 className="text-2xl font-black mt-2" style={{ color: "var(--td-text-hi)" }}>
                {user?.name ?? "—"}
              </h1>
              <p className="text-xs mt-1" style={{ color: "var(--td-text-md)" }}>
                {user?.email}
              </p>
              {user?.store?.name && (
                <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full"
                  style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)" }}>
                  <StoreIcon size={11} style={{ color: "var(--td-text-ghost)" }} />
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--td-text-md)" }}>
                    {user.store.name}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => setShowAvatarPicker(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-95"
                style={{
                  background: "linear-gradient(135deg,#CC2200,#FF4422)",
                  color: "#fff", fontSize: 11,
                  textTransform: "uppercase", letterSpacing: "0.12em",
                }}
              >
                <ImageIcon size={13} />
                {user?.avatar_url ? "Cambiar foto" : "Elegir foto"}
              </button>
              <button
                onClick={() => setShowMyCutsModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-95"
                style={{
                  background: "var(--td-card-bg)",
                  border: "1px solid var(--td-card-border)",
                  color: "var(--td-text-hi)", fontSize: 11,
                  textTransform: "uppercase", letterSpacing: "0.12em",
                }}
              >
                <Wallet size={13} />
                Mis Cortes
              </button>
            </div>
            <button
              onClick={() => navigate("/caja")}
              className="text-[10px] font-bold uppercase tracking-widest mt-2"
              style={{ color: "var(--td-text-ghost)" }}
            >
              ← Volver a Caja
            </button>
          </div>
        </div>
        {showAvatarPicker && user && (
          <AvatarPicker
            userId={user.id}
            userName={user.name}
            currentAvatarUrl={user.avatar_url ?? null}
            open
            onClose={() => setShowAvatarPicker(false)}
            onSaved={() => {
              void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
              // Forzar refetch del /auth/me para que el contexto refresque el avatar
              window.dispatchEvent(new Event("tadaima:auth-refresh"));
              setShowAvatarPicker(false);
            }}
          />
        )}

        {/* Modal Mis Cortes — lista de sesiones del cajero (últimos 90 días).
            Click en una abre CashCloseSummaryModal con detalle + opción imprimir. */}
        {showMyCutsModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div onClick={() => setShowMyCutsModal(false)}
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)" }} />
            <div style={{
              position: "relative",
              background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)",
              borderRadius: 24, padding: 24, width: "100%", maxWidth: 520,
              maxHeight: "85vh", display: "flex", flexDirection: "column",
            }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: "var(--td-text-hi)" }}>Mis Cortes de Caja</h3>
                  <p style={{ margin: "2px 0 0", fontSize: 10, fontWeight: 700, color: "var(--td-text-ghost)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
                    Últimos 90 días · {myCuts.length} sesiones
                  </p>
                </div>
                <button onClick={() => setShowMyCutsModal(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--td-text-ghost)", padding: 4 }}>
                  <X size={18} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {myCutsQuery.isFetching ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin" style={{ color: "#E0221A" }} />
                  </div>
                ) : myCuts.length === 0 ? (
                  <div className="text-center py-12" style={{ color: "var(--td-text-ghost)", fontSize: 12 }}>
                    Sin cortes aún. Aparecerán aquí cuando cierres caja.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {myCuts.map(s => {
                      const isClosed = s.status === "closed";
                      const diff = s.difference ?? 0;
                      const isMatch = isClosed && Math.abs(diff) < 0.01;
                      const isShort = isClosed && diff < -0.01;
                      const statusColor = !isClosed ? "#FFAA00" : isMatch ? "#10b981" : isShort ? "#DC2626" : "#f59e0b";
                      const statusBg    = !isClosed ? "rgba(255,170,0,0.1)" : isMatch ? "rgba(16,185,129,0.1)" : isShort ? "rgba(220,38,38,0.1)" : "rgba(245,158,11,0.1)";
                      const statusLabel = !isClosed ? "Abierta" : isMatch ? "Cuadra ✓" : isShort ? "Falta" : "Sobra";
                      return (
                        <button
                          key={s.id}
                          onClick={() => setSelectedCut(s)}
                          className="text-left transition-colors"
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "12px 14px", borderRadius: 14,
                            background: "var(--td-card-bg)",
                            border: "1px solid var(--td-card-border)",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{
                            width: 38, height: 38, borderRadius: 10,
                            background: statusBg, border: `1px solid ${statusColor}33`,
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
                            {isMatch ? <CheckCircle2 size={16} color={statusColor} /> : <AlertTriangle size={16} color={statusColor} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "var(--td-text-hi)" }}>
                              #{s.id} · {s.register.name}
                            </p>
                            <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--td-text-ghost)" }}>
                              {new Date(s.opened_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                              {s.closed_at && ` → ${new Date(s.closed_at).toLocaleString("es-MX", { timeStyle: "short" })}`}
                              {" · "}{s.sales_count} ventas
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "var(--td-text-hi)" }}>
                              {fmtMoney(s.total_sales)}
                            </p>
                            <span style={{
                              display: "inline-block", marginTop: 2,
                              padding: "1px 6px", borderRadius: 5,
                              fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em",
                              background: statusBg, color: statusColor, border: `1px solid ${statusColor}40`,
                            }}>{statusLabel}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedCut && (
          <CashCloseSummaryModal
            session={selectedCut}
            open
            onClose={() => setSelectedCut(null)}
          />
        )}
      </div>
    );
  }
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

  // KPI sub-queries — cached per active store.
  // Gerente NO ve la row de KPIs (es repetitiva con "Cortes de hoy" + "Cajeros
  // conectados" más abajo), así que deshabilitamos los fetches para evitar
  // requests inútiles.
  const kpiStoreId = activeStore?.id;
  const kpiEnabled = !!kpiStoreId && !isGerente;
  const salesKpiQuery = useQuery({
    queryKey: ['dashboard', 'kpi', 'sales', kpiStoreId, today],
    queryFn: () => getSalesReport({ from: today as string, to: today as string, store_id: kpiStoreId! }),
    enabled: kpiEnabled,
  });
  const layawaysKpiQuery = useQuery({
    queryKey: ['dashboard', 'kpi', 'layaways', kpiStoreId],
    queryFn: () => getLayaways({ status: "active", store_id: kpiStoreId!, per_page: 1 }),
    enabled: kpiEnabled,
  });
  const lowStockKpiQuery = useQuery({
    queryKey: ['dashboard', 'kpi', 'lowStock', kpiStoreId],
    queryFn: () => getInventoryReport({ store_id: kpiStoreId!, low_stock: true, threshold: 5 }),
    enabled: kpiEnabled,
  });
  const kpi: KPIData | null = activeStore
    ? {
        salesCount:     salesKpiQuery.data?.summary.total_count    ?? 0,
        salesRevenue:   salesKpiQuery.data?.summary.total_revenue  ?? 0,
        activeLayaways: layawaysKpiQuery.data?.pagination.total    ?? 0,
        lowStockCount:  lowStockKpiQuery.data?.summary.total_skus  ?? 0,
      }
    : null;
  // Cuando las queries están disabled (gerente), isPending queda true permanente.
  // Filtramos por kpiEnabled para no mostrar spinner eterno.
  const kpiLoading = kpiEnabled && (salesKpiQuery.isPending || layawaysKpiQuery.isPending || lowStockKpiQuery.isPending);

  // ── Gerente: cajeros conectados + cortes del día ─────────────────────────────
  // Backend (RBAC) ya filtra ambos endpoints a la tienda del gerente, pero pasamos
  // activeStore.id explícito para que el cache RQ se segmente por tienda.
  const onlineUsersQuery = useOnlineUsersQuery(activeStore?.id ?? null, { enabled: isGerente && !!activeStore });
  const dailyCashQuery = useQuery({
    queryKey: ['gerente-daily-cash', activeStore?.id, today],
    queryFn: () => getCashReport({ from: today as string, to: today as string, store_id: activeStore!.id }),
    enabled: isGerente && !!activeStore,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Map user_id → última sesión abierta hoy (para badge "En caja #N")
  const openSessionByUser = new Map<number, CashSessionReport>();
  for (const s of (dailyCashQuery.data?.sessions ?? [])) {
    if (s.status === "open" && !openSessionByUser.has(s.user.id)) {
      openSessionByUser.set(s.user.id, s);
    }
  }

  // "Cajeros conectados" = unión de dos señales (con dedupe por user.id):
  //  1. /users/online → quien hizo request en últimos 2 min (filtrado a rol cajero)
  //  2. Cualquiera con caja abierta hoy → señal más fuerte de presencia.
  // Sin (2) un cajero con la pestaña en background pierde el heartbeat de 90s y
  // se sale del threshold de 2 min, aunque obviamente está trabajando.
  // /users/online retorna roles como objetos Spatie {id, name, ...} (no strings),
  // así que normalizo antes de pasar a `isCashier()` que espera string[].
  type CashierEntry = {
    id: number;
    name: string;
    avatar_url: string | null;
    last_seen_at: string | null;
  };
  const cashierMap = new Map<number, CashierEntry>();
  for (const u of (onlineUsersQuery.data ?? [])) {
    const raw = (u.roles ?? []) as unknown as Array<string | { name?: string }>;
    const roleNames = raw.map(r => typeof r === "string" ? r : (r?.name ?? "")).filter(Boolean);
    if (!isCashier(roleNames)) continue;
    cashierMap.set(u.id, {
      id: u.id,
      name: u.name,
      avatar_url: u.avatar_url,
      last_seen_at: u.last_seen_at,
    });
  }
  for (const [userId, session] of openSessionByUser) {
    if (cashierMap.has(userId)) continue;
    cashierMap.set(userId, {
      id: userId,
      name: session.user.name,
      avatar_url: null,
      last_seen_at: session.opened_at,
    });
  }
  const onlineCashiers = Array.from(cashierMap.values());

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
      {/* Para gerente: ocultos. Los KPIs son repetitivos respecto a "Cortes
          de hoy" + "Cajeros conectados" que vienen abajo. Admin sigue viendo
          el row porque tiene visión cross-tienda y no tiene secciones abajo. */}
      {activeStore && !isGerente && (
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
        /* Gerente */
        <>
          {/* Cajeros conectados — lista compacta de la tienda activa */}
          {isGerente && activeStore && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <SectionLabel>Cajeros conectados · {activeStore.name}</SectionLabel>
                <button
                  onClick={() => onlineUsersQuery.refetch()}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
                  style={{ color: "var(--td-text-ghost)" }}
                  title="Refrescar"
                >
                  <RefreshCw size={11} className={onlineUsersQuery.isFetching ? "animate-spin" : ""} />
                  Refrescar
                </button>
              </div>
              {onlineUsersQuery.isPending ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={18} className="animate-spin text-white/30" />
                </div>
              ) : onlineCashiers.length === 0 ? (
                <div className="glass-dark rounded-2xl p-6 text-center" style={{ border: "1px solid var(--td-panel-border)" }}>
                  <Users size={20} className="mx-auto mb-2 text-white/25" />
                  <p className="text-xs text-white/40">Ningún cajero conectado en este momento.</p>
                  <p className="text-[10px] text-white/25 mt-1">Aparecen aquí cuando inician sesión en el POS.</p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
                  {onlineCashiers.map(u => {
                    const openSession = openSessionByUser.get(u.id);
                    const hasOpenCash = !!openSession;
                    return (
                      <div
                        key={u.id}
                        className="rounded-2xl p-4 flex items-center gap-3"
                        style={{
                          background: hasOpenCash
                            ? "linear-gradient(135deg, rgba(16,185,129,0.10) 0%, rgba(0,0,0,0.3) 100%)"
                            : "rgba(255,255,255,0.04)",
                          border: `1px solid ${hasOpenCash ? "rgba(16,185,129,0.30)" : "var(--td-panel-border)"}`,
                        }}
                      >
                        <div className="relative shrink-0">
                          <UserAvatar name={u.name} avatarUrl={u.avatar_url} size={44} />
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full"
                            style={{
                              background: "#10b981",
                              border: "2px solid var(--td-card-bg, #1a1a1a)",
                              boxShadow: "0 0 0 1px rgba(16,185,129,0.4)",
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-white/85 truncate">{u.name}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Clock size={10} className="text-white/30" />
                            <span className="text-[10px] font-semibold text-white/40">
                              {hasOpenCash
                                ? `Abrió caja ${new Date(openSession.opened_at).toLocaleTimeString("es-MX", { timeStyle: "short" })}`
                                : timeAgo(u.last_seen_at)}
                            </span>
                          </div>
                          {hasOpenCash ? (
                            <button
                              onClick={() => setSelectedCut(openSession)}
                              className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-opacity hover:opacity-80"
                              style={{ background: "rgba(16,185,129,0.16)", color: "#10b981", border: "1px solid rgba(16,185,129,0.35)" }}
                            >
                              <Wallet size={9} />
                              En caja · {openSession.register.name}
                            </button>
                          ) : (
                            <span className="mt-1.5 inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider"
                              style={{ background: "rgba(255,255,255,0.05)", color: "var(--td-text-ghost)", border: "1px solid var(--td-panel-border)" }}>
                              Sin caja abierta
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Cortes de hoy — sesiones de hoy de mi tienda, agrupadas visualmente por cajero */}
          {isGerente && activeStore && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <SectionLabel>Cortes de hoy · {activeStore.name}</SectionLabel>
                <button
                  onClick={() => dailyCashQuery.refetch()}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
                  style={{ color: "var(--td-text-ghost)" }}
                  title="Refrescar"
                >
                  <RefreshCw size={11} className={dailyCashQuery.isFetching ? "animate-spin" : ""} />
                  Refrescar
                </button>
              </div>

              {/* Totales del día */}
              {dailyCashQuery.data && dailyCashQuery.data.sessions.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--td-panel-border)" }}>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Sesiones</p>
                    <p className="text-lg font-black text-white mt-1">{dailyCashQuery.data.summary.total_sessions}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: "rgba(224,34,26,0.08)", border: "1px solid rgba(224,34,26,0.25)" }}>
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "rgba(224,34,26,0.7)" }}>Ventas del día</p>
                    <p className="text-lg font-black text-white mt-1">{fmt(dailyCashQuery.data.summary.total_sales)}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.25)" }}>
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "rgba(16,185,129,0.75)" }}>Entradas</p>
                    <p className="text-lg font-black text-white mt-1">{fmt(dailyCashQuery.data.summary.total_entradas)}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)" }}>
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "rgba(245,158,11,0.75)" }}>Salidas</p>
                    <p className="text-lg font-black text-white mt-1">{fmt(dailyCashQuery.data.summary.total_salidas)}</p>
                  </div>
                </div>
              )}

              {dailyCashQuery.isPending ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={18} className="animate-spin text-white/30" />
                </div>
              ) : (dailyCashQuery.data?.sessions.length ?? 0) === 0 ? (
                <div className="glass-dark rounded-2xl p-6 text-center" style={{ border: "1px solid var(--td-panel-border)" }}>
                  <Wallet size={20} className="mx-auto mb-2 text-white/25" />
                  <p className="text-xs text-white/40">Sin cortes hoy todavía.</p>
                  <p className="text-[10px] text-white/25 mt-1">Aparecen aquí en cuanto un cajero abra o cierre caja.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {dailyCashQuery.data!.sessions.map(s => {
                    const isClosed = s.status === "closed";
                    const diff = s.difference ?? 0;
                    const isMatch = isClosed && Math.abs(diff) < 0.01;
                    const isShort = isClosed && diff < -0.01;
                    const statusColor = !isClosed ? "#FFAA00" : isMatch ? "#10b981" : isShort ? "#DC2626" : "#f59e0b";
                    const statusBg    = !isClosed ? "rgba(255,170,0,0.10)" : isMatch ? "rgba(16,185,129,0.10)" : isShort ? "rgba(220,38,38,0.10)" : "rgba(245,158,11,0.10)";
                    const statusLabel = !isClosed ? "Abierta" : isMatch ? "Cuadra ✓" : isShort ? `Falta ${fmt(Math.abs(diff))}` : `Sobra ${fmt(diff)}`;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedCut(s)}
                        className="text-left transition-colors hover:bg-white/5"
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "12px 14px", borderRadius: 14,
                          background: "var(--td-card-bg)",
                          border: "1px solid var(--td-card-border)",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{
                          width: 38, height: 38, borderRadius: 10,
                          background: statusBg, border: `1px solid ${statusColor}33`,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          {isMatch ? <CheckCircle2 size={16} color={statusColor} /> : <AlertTriangle size={16} color={statusColor} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "var(--td-text-hi)" }}>
                            {s.user.name} · {s.register.name}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--td-text-ghost)" }}>
                            {new Date(s.opened_at).toLocaleTimeString("es-MX", { timeStyle: "short" })}
                            {s.closed_at && ` → ${new Date(s.closed_at).toLocaleTimeString("es-MX", { timeStyle: "short" })}`}
                            {" · "}{s.sales_count} ventas
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "var(--td-text-hi)" }}>
                            {fmt(s.total_sales)}
                          </p>
                          <span style={{
                            display: "inline-block", marginTop: 2,
                            padding: "1px 6px", borderRadius: 5,
                            fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em",
                            background: statusBg, color: statusColor, border: `1px solid ${statusColor}40`,
                          }}>{statusLabel}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Acceso rápido — Caja + Productos */}
          <div className="mb-8">
            <SectionLabel>Acciones rápidas</SectionLabel>
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
          </div>
        </>
      )}

      {showPicker && (
        <StorePickerModal
          stores={stores}
          isLoading={storesLoading}
          onSelect={handleSelectStore}
          onClose={() => setShowPicker(false)}
        />
      )}

      {selectedCut && (
        <CashCloseSummaryModal
          session={selectedCut}
          open
          onClose={() => setSelectedCut(null)}
        />
      )}
    </div>
  );
}
