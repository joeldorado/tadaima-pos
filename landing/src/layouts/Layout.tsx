// @ts-nocheck — scaffolding de tienda-T, se reescribe en Fases 9–14
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@tadaima/auth";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ShoppingCart, Package, LogOut, Home, Store,
  Users, Receipt, UserCircle2, ClipboardList, ArrowLeftRight, ShoppingBasket, BarChart2,
  Settings, Sun, Moon, PackageSearch, Wallet, KeyRound,
  ChevronDown, ChevronRight, PanelLeftClose, TriangleAlert,
} from "lucide-react";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";
import { UserAvatar } from "@/components/UserAvatar";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
// ADR-014: ExpiringDraftsModal desactivado — el carrito vive client-side, no
// hay drafts en vivo que expirar. Componente preservado en repo por si se
// vuelve al modelo server-authoritative.
// import { ExpiringDraftsModal } from "@/components/ExpiringDraftsModal";
import { useEffect, useState } from "react";
import { primaryRole, canAccessPage, type PageKey } from "@/lib/permisos";
import { useActiveStore } from "@/contexts/StoreContext";
import { useQueryClient } from "@tanstack/react-query";
import { getProductsLight, apiClient, type CashSessionReport } from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";
import { useActiveSessionQuery } from "@/hooks/queries/useCashSession";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { CloseCashModal } from "@/components/cash/CloseCashModal";
import { CashCloseSummaryModal } from "@/components/cash/CashCloseSummaryModal";
import { toLocalYmd, getTodayLocal } from "@/lib/date";

interface NavLeaf {
  to: string;
  label: string;
  icon: typeof Home;
  page: PageKey;
  exact?: boolean;
}
interface NavGroup {
  group: true;
  key: string;
  label: string;
  icon: typeof Home;
  children: NavLeaf[];
}
type NavEntry = NavLeaf | NavGroup;

// Árbol de navegación. Caja se maneja aparte (CTA primario rojo). Agrupación
// pedida por Ruben (2026-07-15): "Ventas" contiene Historial+Cortes+Reportes;
// "Inventario" contiene Existencias+Traslados. El resto queda suelto.
const NAV_TREE: NavEntry[] = [
  { to: "/", label: "Inicio", icon: Home, page: "inicio", exact: true },
  {
    group: true, key: "ventas", label: "Ventas", icon: Receipt,
    children: [
      // "Historial" en vez de "Ventas" para no chocar con el nombre del grupo.
      { to: "/sales",   label: "Historial", icon: Receipt,   page: "sales"     },
      { to: "/cortes",  label: "Cortes",    icon: Wallet,    page: "cash_cuts" },
      { to: "/reports", label: "Reportes",  icon: BarChart2, page: "reports"   },
    ],
  },
  { to: "/clients",   label: "Clientes",  icon: UserCircle2,  page: "clients"  },
  { to: "/pre-sales", label: "Preventas", icon: ClipboardList, page: "presales" },
  { to: "/products",  label: "Productos", icon: Package,      page: "products" },
  {
    group: true, key: "inventario", label: "Inventario", icon: PackageSearch,
    children: [
      { to: "/buscar-tiendas", label: "Existencias", icon: PackageSearch, page: "stock_search" },
      { to: "/transfers",      label: "Traslados",   icon: ArrowLeftRight, page: "transfers"   },
    ],
  },
  { to: "/insumos", label: "Insumos", icon: ShoppingBasket, page: "supplies" },
];

const NAV_BY_ROLE: Record<string, PageKey[]> = {
  admin:   ["inicio", "products", "stock_search", "sales", "cash_cuts", "clients", "presales", "transfers", "supplies", "reports"],
  // Gerente: sin Tiendas. Solo gestiona la suya; el switcher del header basta
  // para alternar entre tiendas asignadas. La página /stores es CRUD admin.
  // Reportes habilitado para gerente (verificará permisos/scope en backend)
  // "Cajas" (cortes de caja) visible a los 3 roles — backend acota por rol.
  gerente: ["inicio", "products", "stock_search", "sales", "cash_cuts", "clients", "presales", "transfers", "supplies", "reports"],
  // Cajero: sin Tiendas, con Preventas para ver catálogos disponibles +
  // difusión + vencidos de su sucursal. "Buscar en Tiendas" para localizar stock.
  cajero:  ["inicio", "products", "stock_search", "sales", "cash_cuts", "presales", "supplies"],
  unknown: ["inicio"],
};

const isPathActive = (pathname: string, to: string, exact?: boolean): boolean =>
  exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

// ─── Icon-rail (modo colapsado): icono + etiqueta 9px, como el rail original ──
function RailLeaf({ to, end, label, Icon }: { to: string; end?: boolean; label: string; Icon: typeof Home }) {
  return (
    <NavLink to={to} end={end} className="flex flex-col items-center gap-1" title={label}>
      {({ isActive }) => (
        <>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
            style={isActive
              ? { background: "var(--td-nav-active-bg)", border: "1px solid var(--td-nav-active-border)", boxShadow: "var(--td-nav-active-shadow)" }
              : { background: "transparent", border: "1px solid transparent" }}
          >
            <Icon size={18} strokeWidth={isActive ? 2.3 : 1.8} style={{ color: isActive ? "var(--td-icon-active)" : "var(--td-icon-inactive)" }} />
          </div>
          <span style={{ fontSize: "9px", fontWeight: isActive ? 700 : 600, color: isActive ? "var(--td-nav-active-label)" : "var(--td-text-lo)", transition: "color 0.18s" }}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

// ─── Grupo en modo colapsado: icono + chevron, hijos inline al abrir ──────────
// Mismo concepto de dropdown que el modo ancho (pedido Joel 2026-07-16: "mantén
// ese mismo dropdown sin scroll") — cerrado por default para que el rail quede
// corto; el grupo con la ruta activa se abre solo.
function RailGroup({ group, isOpen, onToggle, pathname }: { group: NavGroup; isOpen: boolean; onToggle: () => void; pathname: string }) {
  const Icon = group.icon;
  const hasActiveChild = group.children.some(c => isPathActive(pathname, c.to, c.exact));
  return (
    <div className="flex flex-col items-center w-full">
      <button
        onClick={onToggle}
        title={group.label}
        className="flex flex-col items-center gap-1"
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
      >
        <div
          className="relative w-10 h-10 rounded-xl flex items-center justify-center transition-all"
          style={hasActiveChild && !isOpen
            ? { background: "var(--td-nav-active-bg)", border: "1px solid var(--td-nav-active-border)" }
            : { background: "transparent", border: "1px solid transparent" }}
        >
          <Icon size={18} strokeWidth={hasActiveChild ? 2.3 : 1.8} style={{ color: hasActiveChild ? "var(--td-icon-active)" : "var(--td-icon-inactive)" }} />
          <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-3.5 h-3.5 rounded-full" style={{ background: "var(--td-card-bg)", border: "1px solid var(--td-divider)" }}>
            {isOpen
              ? <ChevronDown size={9} strokeWidth={3} style={{ color: "var(--td-text-lo)" }} />
              : <ChevronRight size={9} strokeWidth={3} style={{ color: "var(--td-text-lo)" }} />}
          </span>
        </div>
        <span style={{ fontSize: "9px", fontWeight: hasActiveChild ? 700 : 600, color: hasActiveChild ? "var(--td-nav-active-label)" : "var(--td-text-lo)" }}>
          {group.label}
        </span>
      </button>
      {isOpen && (
        <div className="flex flex-col items-center gap-1 mt-1 mb-0.5 py-1 rounded-xl w-[56px]" style={{ background: "var(--td-hover-bg)" }}>
          {group.children.map(c => (
            <RailLeaf key={c.to} to={c.to} end={c.exact} label={c.label} Icon={c.icon} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ancha (modo expandido): fila icono + etiqueta ────────────────────
function WideLeaf({ to, end, label, Icon, indent }: { to: string; end?: boolean; label: string; Icon: typeof Home; indent?: boolean }) {
  return (
    <NavLink to={to} end={end} className="block w-full">
      {({ isActive }) => (
        <div
          className="flex items-center gap-3 rounded-xl transition-all"
          style={{
            padding: indent ? "8px 12px 8px 18px" : "9px 12px",
            background: isActive ? "var(--td-nav-active-bg)" : "transparent",
            border: `1px solid ${isActive ? "var(--td-nav-active-border)" : "transparent"}`,
            boxShadow: isActive ? "var(--td-nav-active-shadow)" : "none",
          }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--td-hover-bg)"; }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
        >
          <Icon size={indent ? 16 : 18} strokeWidth={isActive ? 2.3 : 1.8} style={{ color: isActive ? "var(--td-icon-active)" : "var(--td-icon-inactive)", flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 600, color: isActive ? "var(--td-nav-active-label)" : "var(--td-text-md)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {label}
          </span>
        </div>
      )}
    </NavLink>
  );
}

function WideGroup({ group, isOpen, onToggle, pathname }: { group: NavGroup; isOpen: boolean; onToggle: () => void; pathname: string }) {
  const Icon = group.icon;
  const hasActiveChild = group.children.some(c => isPathActive(pathname, c.to, c.exact));
  return (
    <div className="w-full">
      <button
        onClick={onToggle}
        className="flex items-center gap-3 w-full rounded-xl transition-all"
        style={{ padding: "9px 12px", background: "transparent", border: "1px solid transparent" }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--td-hover-bg)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <Icon size={18} strokeWidth={hasActiveChild ? 2.3 : 1.8} style={{ color: hasActiveChild ? "var(--td-icon-active)" : "var(--td-icon-inactive)", flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: hasActiveChild ? 700 : 600, color: hasActiveChild ? "var(--td-nav-active-label)" : "var(--td-text-md)" }}>
          {group.label}
        </span>
        {isOpen
          ? <ChevronDown size={15} style={{ color: "var(--td-text-lo)", flexShrink: 0 }} />
          : <ChevronRight size={15} style={{ color: "var(--td-text-lo)", flexShrink: 0 }} />}
      </button>
      {isOpen && (
        <div className="flex flex-col gap-0.5 mt-0.5 mb-1" style={{ marginLeft: 22, borderLeft: "1px solid var(--td-divider)", paddingLeft: 4 }}>
          {group.children.map(c => (
            <WideLeaf key={c.to} to={c.to} end={c.exact} label={c.label} Icon={c.icon} indent />
          ))}
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout }  = useAuth();
  const { theme, toggleTheme } = useTheme();

  const role = primaryRole(user?.roles);
  const allowedPages = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.unknown;

  // Árbol filtrado por rol: hojas por permiso; grupo con 0 hijos visibles se
  // oculta, con 1 hijo cae a link directo (no vale la pena un desplegable).
  const visibleEntries: NavEntry[] = [];
  for (const entry of NAV_TREE) {
    if ("group" in entry) {
      const kids = entry.children.filter(c => allowedPages.includes(c.page));
      if (kids.length === 0) continue;
      if (kids.length === 1) visibleEntries.push(kids[0]);
      else visibleEntries.push({ ...entry, children: kids });
    } else if (allowedPages.includes(entry.page)) {
      visibleEntries.push(entry);
    }
  }

  // Rail colapsado (icon-rail) vs ancho, persistido. Grupos abiertos persistidos;
  // por defecto un grupo se abre si contiene la ruta activa (a menos que el
  // usuario lo haya cerrado explícitamente).
  const [railCollapsed, setRailCollapsed] = useState(() => localStorage.getItem("tadaima-nav-collapsed") === "1");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("tadaima-nav-groups") || "{}"); } catch { return {}; }
  });
  useEffect(() => { localStorage.setItem("tadaima-nav-collapsed", railCollapsed ? "1" : "0"); }, [railCollapsed]);
  useEffect(() => { localStorage.setItem("tadaima-nav-groups", JSON.stringify(openGroups)); }, [openGroups]);
  const toggleGroup = (key: string) => setOpenGroups(p => ({ ...p, [key]: !p[key] }));

  // Chip de tienda bajo el logo: #id + iniciales del nombre. Con varios users
  // de la misma tienda en pantalla (QA multi-ventana) permite confirmar de un
  // vistazo que ambos están en la MISMA tienda (Joel 2026-06-11).
  const { activeStore } = useActiveStore();
  const storeInitials = (activeStore?.name ?? "")
    .split(/[\s\-_·]+/)
    .filter(Boolean)
    .map(w => w[0]!.toUpperCase())
    .slice(0, 4)
    .join("");

  // Rol visible bajo el chip de tienda — con varias ventanas de QA abiertas
  // (gerente + cajero de la misma tienda) se distingue al instante quién es
  // quién (Joel 2026-06-11). Color por rol: admin rojo, gerente ámbar,
  // cajero azul.
  const ROLE_BADGE: Record<string, { label: string; color: string; bg: string; border: string }> = {
    admin:   { label: "Admin",   color: "#F87171", bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.3)" },
    gerente: { label: "Gerente", color: "#F59E0B", bg: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.3)" },
    cajero:  { label: "Cajero",  color: "#60A5FA", bg: "rgba(96,165,250,0.10)",  border: "rgba(96,165,250,0.3)" },
  };
  const roleBadge = ROLE_BADGE[role];

  // Prefetch top 200 productos light en cuanto hay sesión, antes de que el
  // cajero navegue a Caja. Cuando llegue allí ya está cacheado.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!user) return;
    void queryClient.prefetchQuery({
      queryKey: [...queryKeys.products.all, 'light', 'top', { active: true, sort: 'top' }],
      queryFn: () => getProductsLight({ active: true, sort: 'top', per_page: 200, page: 1 } as Parameters<typeof getProductsLight>[0]),
      staleTime: 24 * 60 * 60_000,
    });
  }, [user, queryClient]);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Heartbeat — el backend (middleware TouchLastSeen) actualiza last_seen_at
  // en CUALQUIER request. Con el cajero activamente vendiendo (queries, polls)
  // ya se mantiene "conectado" sin esfuerzo extra. Para cubrir el caso idle
  // (cajero deja la pestaña abierta sin interactuar) hacemos un GET cada 90s
  // a /auth/me — basta para mantenerlo "online" en el threshold de 2 min.
  useEffect(() => {
    if (!user) return;
    const tick = () => {
      void apiClient.get('/auth/me').catch(() => { /* token caduco → AuthContext maneja */ });
    };
    const id = window.setInterval(tick, 90_000);
    return () => window.clearInterval(id);
  }, [user?.id]);

  const isDark = theme === "dark";

  // ── Guard de logout: con caja abierta NO se sale sin hacer el corte ──────
  // La sesión activa vive en cache RQ ['cash','activeSession'] (poll 60s);
  // montarla aquí la hace visible en TODAS las páginas, no solo en Caja.
  const activeSessionQuery = useActiveSessionQuery();
  const cashSession = activeSessionQuery.data ?? null;
  const isStaleSession = !!cashSession?.opened_at &&
    toLocalYmd(new Date(cashSession.opened_at)) < getTodayLocal();
  const [showLogoutCorte, setShowLogoutCorte] = useState(false);
  const [logoutCorteReport, setLogoutCorteReport] = useState<CashSessionReport | null>(null);

  const finishLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const handleLogout = async () => {
    // Refresca la sesión antes de decidir (la caché puede tener 60s de edad).
    const fresh = await activeSessionQuery.refetch().then(r => r.data ?? null).catch(() => cashSession);
    if (fresh) {
      setShowLogoutCorte(true);
      return;
    }
    await finishLogout();
  };

  const railWidth = railCollapsed ? "76px" : "216px";

  // ── Caja en pantalla angosta: menú FLOTANTE (drawer overlay) ──────────────
  // < 1024px en /caja, la sidebar fija aplasta el carrito + panel de cobro
  // (QA Joel 2026-07-16). Se oculta y un botón flotante (logo) la abre como
  // drawer encima del contenido. Fuera de /caja no cambia nada.
  const isCajaRoute = location.pathname === "/caja" || location.pathname.startsWith("/caja/");
  const narrowViewport = useMediaQuery("(max-width: 1023px)");
  const overlayMode = isCajaRoute && narrowViewport;
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => { setDrawerOpen(false); }, [location.pathname, overlayMode]);

  // ── Aviso global de caja de días anteriores (visible en TODAS las páginas) ──
  const staleOpenedLabel = cashSession?.opened_at
    ? new Date(cashSession.opened_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
    : "";
  const stalePill = isStaleSession ? (
    <button
      onClick={() => navigate("/caja")}
      title={`Tu caja sigue abierta desde el ${staleOpenedLabel}. Haz el corte.`}
      data-testid="stale-cash-pill"
      className={`flex items-center justify-center transition-all ${railCollapsed ? "flex-col gap-1 py-1" : "gap-2 w-full px-3 py-2 rounded-xl"}`}
      style={{ background: railCollapsed ? "transparent" : "rgba(245,158,11,0.12)", border: railCollapsed ? "none" : "1px solid rgba(245,158,11,0.35)", cursor: "pointer" }}
    >
      <TriangleAlert size={railCollapsed ? 18 : 14} style={{ color: "#F59E0B" }} className="animate-pulse" />
      {!railCollapsed && (
        <span style={{ fontSize: 10, fontWeight: 800, color: "#F59E0B", textAlign: "left", lineHeight: 1.2 }}>
          Caja abierta desde el {staleOpenedLabel} — haz corte
        </span>
      )}
    </button>
  ) : null;

  // ── Caja: CTA primario, en ambos modos ──────────────────────────────────────
  const CajaCTA = railCollapsed ? (
    <NavLink to="/caja" className="flex flex-col items-center gap-1" title="Caja">
      {({ isActive }) => (
        <>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
            style={isActive
              ? { background: "var(--td-red)", border: "1px solid var(--td-red)", boxShadow: "0 0 0 1px rgba(224,34,26,0.35), 0 6px 16px rgba(224,34,26,0.45)" }
              : { background: "rgba(224,34,26,0.12)", border: "1px solid rgba(224,34,26,0.45)", boxShadow: "0 0 14px rgba(224,34,26,0.18)" }}>
            <ShoppingCart size={19} strokeWidth={isActive ? 2.5 : 2.1} style={{ color: isActive ? "#fff" : "var(--td-red)" }} />
          </div>
          <span style={{ fontSize: "9px", fontWeight: 800, color: "var(--td-red)" }}>Caja</span>
        </>
      )}
    </NavLink>
  ) : (
    <NavLink to="/caja" className="block w-full">
      {({ isActive }) => (
        <div className="flex items-center gap-3 rounded-xl transition-all"
          style={{
            padding: "11px 12px",
            background: isActive ? "var(--td-red)" : "rgba(224,34,26,0.12)",
            border: `1px solid ${isActive ? "var(--td-red)" : "rgba(224,34,26,0.45)"}`,
            boxShadow: isActive ? "0 6px 16px rgba(224,34,26,0.45)" : "0 0 14px rgba(224,34,26,0.15)",
          }}>
          <ShoppingCart size={19} strokeWidth={2.3} style={{ color: isActive ? "#fff" : "var(--td-red)", flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: isActive ? "#fff" : "var(--td-red)" }}>Caja</span>
        </div>
      )}
    </NavLink>
  );

  return (
    <div
      className="flex h-screen overflow-hidden app-bg"
      onClick={() => setShowUserMenu(false)}
    >
      {/* ── Backdrop del drawer (solo Caja angosta con menú abierto) ─────────── */}
      {overlayMode && drawerOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside
        // z-20: el menú del avatar (z-50) vive DENTRO del stacking context del
        // aside (glass-dark = backdrop-filter); las secciones del Dashboard son
        // `relative z-10` y al venir después en el DOM tapaban el popup
        // (QA Joel 2026-06-11). Los modales (z-50+, fixed) siguen por encima.
        // En overlayMode (Caja < 1024px) la sidebar sale del flow: oculta por
        // default, y como drawer fixed encima del contenido cuando drawerOpen.
        className={`glass-dark flex-col shrink-0 animate-in fade-in slide-in-from-left duration-300 ${railCollapsed ? "items-center px-0" : "px-3"} py-5 ${
          overlayMode
            ? (drawerOpen ? "flex fixed inset-y-0 left-0 z-50" : "hidden")
            : "flex relative z-20"
        }`}
        style={{ width: railWidth, transition: "width 0.2s ease", ...(overlayMode && drawerOpen ? { boxShadow: "8px 0 32px rgba(0,0,0,0.45)" } : {}) }}
      >

        {/* Header: logo + (modo ancho) wordmark + toggle */}
        <div className={`flex items-center ${railCollapsed ? "justify-center" : "justify-between"} w-full mb-3`}>
          <div className={`flex items-center gap-2 ${railCollapsed ? "" : "px-1"}`}>
            {/* El logo ES el toggle de colapsar/expandir (pedido Joel 2026-07-16) */}
            <div
              className="flex items-center justify-center"
              role="button"
              tabIndex={0}
              onClick={() => setRailCollapsed(v => !v)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setRailCollapsed(v => !v); }}
              title={railCollapsed ? "Expandir menú" : "Colapsar menú"}
              style={{ background: "#fff", borderRadius: "10px", padding: "4px", width: railCollapsed ? "52px" : "40px", height: railCollapsed ? "52px" : "40px", boxShadow: "0 0 18px rgba(204,34,0,0.4), 0 4px 10px rgba(0,0,0,0.25)", border: "1px solid rgba(204,34,0,0.15)", overflow: "hidden", flexShrink: 0, cursor: "pointer" }}
            >
              <img
                src="/tadaima-logo.jpeg"
                alt="Tadaima"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                onError={e => {
                  const el = e.currentTarget;
                  el.style.display = "none";
                  const fallback = el.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = "block";
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 900, color: "var(--td-red)", letterSpacing: "-0.02em", display: "none" }}>Tadaima</span>
            </div>
            {!railCollapsed && (
              <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", color: "var(--td-text-hi)" }}>Tadaima</span>
            )}
          </div>
          {!railCollapsed && (
            <button
              onClick={() => setRailCollapsed(true)}
              title="Colapsar menú"
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{ background: "transparent", border: "1px solid transparent", color: "var(--td-text-lo)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--td-hover-bg)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <PanelLeftClose size={17} />
            </button>
          )}
        </div>

        {/* Tienda activa (#id + iniciales/nombre) + rol */}
        {(activeStore || roleBadge) && (
          railCollapsed ? (
            <div className="flex flex-col items-center gap-0.5 mb-2" title={activeStore?.name ?? ""}>
              {activeStore && (
                <span style={{ fontSize: 10, fontWeight: 900, lineHeight: 1, padding: "3px 8px", borderRadius: 8, color: "var(--td-red)", background: "rgba(224,34,26,0.10)", border: "1px solid rgba(224,34,26,0.25)" }}>#{activeStore.id}</span>
              )}
              {storeInitials && (
                <span style={{ fontSize: 9, fontWeight: 800, lineHeight: 1.4, letterSpacing: "0.12em", color: "var(--td-text-lo)" }}>{storeInitials}</span>
              )}
              {roleBadge && (
                <span style={{ fontSize: 8, fontWeight: 900, lineHeight: 1, padding: "2px 6px", borderRadius: 6, marginTop: 1, textTransform: "uppercase", letterSpacing: "0.08em", color: roleBadge.color, background: roleBadge.bg, border: `1px solid ${roleBadge.border}` }}>{roleBadge.label}</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full mb-3 px-1" title={activeStore?.name ?? ""}>
              {activeStore && (
                <span style={{ fontSize: 10, fontWeight: 900, lineHeight: 1, padding: "3px 7px", borderRadius: 7, color: "var(--td-red)", background: "rgba(224,34,26,0.10)", border: "1px solid rgba(224,34,26,0.25)", flexShrink: 0 }}>#{activeStore.id}</span>
              )}
              <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 800, color: "var(--td-text-md)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{activeStore?.name ?? ""}</span>
              {roleBadge && (
                <span style={{ fontSize: 8, fontWeight: 900, lineHeight: 1, padding: "2px 6px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.08em", color: roleBadge.color, background: roleBadge.bg, border: `1px solid ${roleBadge.border}`, flexShrink: 0 }}>{roleBadge.label}</span>
              )}
            </div>
          )
        )}

        {/* Divider */}
        <div className={railCollapsed ? "w-8 h-px mb-2" : "w-full h-px mb-2"} style={{ background: "var(--td-divider)" }} />

        {/* Nav */}
        <nav
          className={`flex flex-col ${railCollapsed ? "items-center gap-1" : "gap-0.5"} flex-1 overflow-y-auto w-full pb-2`}
          style={{ scrollbarWidth: "none" }}
        >
          {railCollapsed ? (
            <>
              {/* Inicio primero, Caja segundo, luego grupos (dropdown inline) y hojas */}
              {visibleEntries[0] && !("group" in visibleEntries[0]) && (
                <RailLeaf to={visibleEntries[0].to} end={visibleEntries[0].exact} label={visibleEntries[0].label} Icon={visibleEntries[0].icon} />
              )}
              {CajaCTA}
              {stalePill}
              {visibleEntries.slice(1).map(e => (
                "group" in e ? (
                  <RailGroup
                    key={e.key}
                    group={e}
                    isOpen={openGroups[e.key] !== undefined ? openGroups[e.key] : e.children.some(c => isPathActive(location.pathname, c.to, c.exact))}
                    onToggle={() => toggleGroup(e.key)}
                    pathname={location.pathname}
                  />
                ) : (
                  <RailLeaf key={e.to} to={e.to} end={e.exact} label={e.label} Icon={e.icon} />
                )
              ))}
            </>
          ) : (
            <>
              {/* Inicio primero, Caja segundo, luego grupos/hojas */}
              {visibleEntries[0] && !("group" in visibleEntries[0]) && (
                <WideLeaf to={visibleEntries[0].to} end={visibleEntries[0].exact} label={visibleEntries[0].label} Icon={visibleEntries[0].icon} />
              )}
              {CajaCTA}
              {stalePill}
              {visibleEntries.slice(1).map(e => (
                "group" in e ? (
                  <WideGroup
                    key={e.key}
                    group={e}
                    isOpen={openGroups[e.key] !== undefined ? openGroups[e.key] : e.children.some(c => isPathActive(location.pathname, c.to, c.exact))}
                    onToggle={() => toggleGroup(e.key)}
                    pathname={location.pathname}
                  />
                ) : (
                  <WideLeaf key={e.to} to={e.to} end={e.exact} label={e.label} Icon={e.icon} />
                )
              ))}
            </>
          )}

        </nav>

        {/* Notifications */}
        <NotificationBadge />

        {/* Avatar + user menu */}
        <div
          className={`relative flex ${railCollapsed ? "flex-col items-center" : "items-center gap-2 w-full px-1"} shrink-0`}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => setShowUserMenu(v => !v)}
            className="rounded-full transition-all shrink-0"
            style={{ background: "transparent", border: `1px solid ${showUserMenu ? "var(--td-red-brd)" : "var(--td-panel-border)"}`, padding: 0 }}
            title={user?.name ?? ""}
          >
            <UserAvatar name={user?.name ?? ""} avatarUrl={user?.avatar_url} size={36} />
          </button>
          {!railCollapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: "var(--td-text-hi)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.name}</p>
              <p style={{ fontSize: 10, color: "var(--td-text-ghost)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email}</p>
            </div>
          )}

          {showUserMenu && (
            <div
              className={`absolute ${railCollapsed ? "bottom-11 left-12" : "bottom-14 left-1"} z-50 rounded-xl overflow-hidden shadow-2xl`}
              style={{ background: "var(--td-popup-bg)", border: "1px solid var(--td-popup-border)", minWidth: 192 }}
            >
              {/* User info */}
              <div style={{ padding: "11px 14px 8px", borderBottom: "1px solid var(--td-divider)" }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: "var(--td-text-hi)", margin: 0 }}>{user?.name}</p>
                <p style={{ fontSize: 10, color: "var(--td-text-ghost)", margin: "2px 0 0" }}>{user?.email}</p>
              </div>

              {/* Settings — solo si el rol tiene acceso (admin). */}
              {canAccessPage(user?.roles, "settings") && (
                <button
                  onClick={() => { setShowUserMenu(false); navigate("/settings"); }}
                  className="w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2 transition-colors"
                  style={{ color: "var(--td-text-md)", background: "transparent" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--td-hover-bg)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <Settings size={12} style={{ color: "var(--td-text-lo)" }} />
                  Configuración
                </button>
              )}

              {/* Cambiar contraseña — todos los roles. */}
              <button
                onClick={() => { setShowUserMenu(false); setShowChangePassword(true); }}
                className="w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2 transition-colors"
                style={{ color: "var(--td-text-md)", background: "transparent", borderTop: "1px solid var(--td-divider)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--td-hover-bg)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <KeyRound size={12} style={{ color: "var(--td-text-lo)" }} />
                Cambiar contraseña
              </button>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2 justify-between transition-colors"
                style={{ color: "var(--td-text-md)", background: "transparent", borderTop: "1px solid var(--td-divider)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--td-hover-bg)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span className="flex items-center gap-2">
                  {isDark ? <Sun size={12} style={{ color: "var(--td-text-lo)" }} /> : <Moon size={12} style={{ color: "var(--td-text-lo)" }} />}
                  {isDark ? "Modo Claro" : "Modo Oscuro"}
                </span>
                <div className={`td-toggle-track${isDark ? "" : " on"}`}>
                  <div className="td-toggle-thumb" />
                </div>
              </button>

              {/* Logout */}
              <button
                onClick={() => { setShowUserMenu(false); void handleLogout(); }}
                className="w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2 transition-colors"
                style={{ color: "var(--td-red)", background: "transparent", borderTop: "1px solid var(--td-divider)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--td-hover-bg)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <LogOut size={12} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Botón flotante para abrir el menú (Caja angosta) ─────────────────── */}
      {overlayMode && !drawerOpen && (
        <button
          onClick={() => setDrawerOpen(true)}
          title="Abrir menú"
          aria-label="Abrir menú"
          data-testid="floating-menu-btn"
          className="fixed left-3 z-40 flex items-center justify-center bottom-4 max-[767px]:bottom-24"
          style={{ width: 44, height: 44, background: "#fff", borderRadius: 12, padding: 4, border: "1px solid rgba(204,34,0,0.2)", boxShadow: "0 0 18px rgba(204,34,0,0.35), 0 6px 16px rgba(0,0,0,0.35)", cursor: "pointer", overflow: "hidden" }}
        >
          <img src="/tadaima-logo.jpeg" alt="Menú" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </button>
      )}

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* ADR-014: <ExpiringDraftsModal /> desactivado — carrito client-side. */}

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}

      {/* ── Guard de logout: corte obligatorio con caja abierta ─────────────── */}
      {showLogoutCorte && cashSession && (
        <CloseCashModal
          session={cashSession}
          title="Cierra tu caja para salir"
          reason="Tienes la caja abierta. Haz el corte con el conteo de efectivo y después se cerrará tu sesión."
          onClosed={(report) => {
            setShowLogoutCorte(false);
            if (report) {
              // Muestra el resumen del corte (con opción de imprimir) y al
              // cerrarlo completa el logout.
              setLogoutCorteReport(report);
            } else {
              void finishLogout();
            }
          }}
          onCancel={() => setShowLogoutCorte(false)}
        />
      )}
      {logoutCorteReport && (
        <CashCloseSummaryModal
          session={logoutCorteReport}
          onClose={() => {
            setLogoutCorteReport(null);
            void finishLogout();
          }}
        />
      )}
    </div>
  );
}
