// @ts-nocheck — scaffolding de tienda-T, se reescribe en Fases 9–14
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@tadaima/auth";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ShoppingCart, Package, LogOut, Home, Store,
  Users, Receipt, UserCircle2, ClipboardList, ArrowLeftRight, BarChart2,
  Settings, Sun, Moon, PackageSearch, Wallet,
} from "lucide-react";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";
import { UserAvatar } from "@/components/UserAvatar";
// ADR-014: ExpiringDraftsModal desactivado — el carrito vive client-side, no
// hay drafts en vivo que expirar. Componente preservado en repo por si se
// vuelve al modelo server-authoritative.
// import { ExpiringDraftsModal } from "@/components/ExpiringDraftsModal";
import { useEffect, useState } from "react";
import { primaryRole, canAccessPage, type PageKey } from "@/lib/permisos";
import { useActiveStore } from "@/contexts/StoreContext";
import { useQueryClient } from "@tanstack/react-query";
import { getProductsLight, apiClient } from "@tadaima/api";
import { queryKeys } from "@/lib/queryKeys";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  page: PageKey;
  exact?: boolean;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { to: "/",          label: "Inicio",    icon: Home,            page: "inicio",    exact: true },
  { to: "/stores",    label: "Tiendas",   icon: Store,           page: "stores"    },
  { to: "/products",  label: "Productos", icon: Package,         page: "products"  },
  { to: "/buscar-tiendas", label: "Existencias", icon: PackageSearch, page: "stock_search" },
  { to: "/sales",     label: "Ventas",    icon: Receipt,         page: "sales"     },
  { to: "/cortes",    label: "Cortes",    icon: Wallet,          page: "cash_cuts" },
  { to: "/clients",   label: "Clientes",  icon: UserCircle2,     page: "clients"   },
  { to: "/pre-sales", label: "Preventas", icon: ClipboardList,   page: "presales"  },
  { to: "/transfers", label: "Traslados", icon: ArrowLeftRight,  page: "transfers" },
  { to: "/reports",   label: "Reportes",  icon: BarChart2,       page: "reports"   },
  { to: "/settings",  label: "Config",    icon: Settings,        page: "settings"  },
];

const NAV_BY_ROLE: Record<string, PageKey[]> = {
  admin:   ["inicio", "products", "stock_search", "sales", "cash_cuts", "clients", "presales", "transfers", "reports"],
  // Gerente: sin Tiendas. Solo gestiona la suya; el switcher del header basta
  // para alternar entre tiendas asignadas. La página /stores es CRUD admin.
  // Reportes habilitado para gerente (verificará permisos/scope en backend)
  // "Cajas" (cortes de caja) visible a los 3 roles — backend acota por rol.
  gerente: ["inicio", "products", "stock_search", "sales", "cash_cuts", "clients", "presales", "transfers", "reports"],
  // Cajero: sin Tiendas, con Preventas para ver catálogos disponibles +
  // difusión + vencidos de su sucursal. "Buscar en Tiendas" para localizar stock.
  cajero:  ["inicio", "products", "stock_search", "sales", "cash_cuts", "presales"],
  unknown: ["inicio"],
};

export function Layout() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout }  = useAuth();
  const { theme, toggleTheme } = useTheme();

  const role = primaryRole(user?.roles);
  const allowedPages = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.unknown;
  const navItems = ALL_NAV_ITEMS.filter(item => allowedPages.includes(item.page));

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

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "U";

  return (
    <div
      className="flex h-screen overflow-hidden app-bg"
      onClick={() => setShowUserMenu(false)}
    >
      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside
        // z-20: el menú del avatar (z-50) vive DENTRO del stacking context del
        // aside (glass-dark = backdrop-filter); las secciones del Dashboard son
        // `relative z-10` y al venir después en el DOM tapaban el popup
        // (QA Joel 2026-06-11). Los modales (z-50+, fixed) siguen por encima.
        className="glass-dark w-[76px] flex flex-col items-center py-5 gap-4 shrink-0 relative z-20 animate-in fade-in slide-in-from-left duration-300"
      >

        {/* Logo */}
        <div
          className="flex items-center justify-center mb-2"
          style={{
            background: "#fff",
            borderRadius: "10px",
            padding: "4px",
            width: "52px",
            height: "52px",
            boxShadow: "0 0 18px rgba(204,34,0,0.4), 0 4px 10px rgba(0,0,0,0.25)",
            border: "1px solid rgba(204,34,0,0.15)",
            overflow: "hidden",
          }}
        >
          <img
            src="/tadaima-logo.jpeg"
            alt="Tadaima"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            onError={e => {
              // Fallback al texto si la imagen no carga.
              const el = e.currentTarget;
              el.style.display = "none";
              const fallback = el.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = "block";
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 900, color: "var(--td-red)", letterSpacing: "-0.02em", display: "none" }}>
            Tadaima
          </span>
        </div>

        {/* Tienda activa (#id + iniciales, tooltip = nombre completo) + rol */}
        {(activeStore || roleBadge) && (
          <div
            className="flex flex-col items-center gap-0.5 -mt-2"
            title={activeStore?.name ?? ""}
          >
            {activeStore && (
              <span style={{
                fontSize: 10, fontWeight: 900, lineHeight: 1,
                padding: "3px 8px", borderRadius: 8,
                color: "var(--td-red)",
                background: "rgba(224,34,26,0.10)",
                border: "1px solid rgba(224,34,26,0.25)",
              }}>
                #{activeStore.id}
              </span>
            )}
            {storeInitials && (
              <span style={{
                fontSize: 9, fontWeight: 800, lineHeight: 1.4,
                letterSpacing: "0.12em",
                color: "var(--td-text-lo)",
              }}>
                {storeInitials}
              </span>
            )}
            {roleBadge && (
              <span style={{
                fontSize: 8, fontWeight: 900, lineHeight: 1,
                padding: "2px 6px", borderRadius: 6, marginTop: 1,
                textTransform: "uppercase", letterSpacing: "0.08em",
                color: roleBadge.color,
                background: roleBadge.bg,
                border: `1px solid ${roleBadge.border}`,
              }}>
                {roleBadge.label}
              </span>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="w-8 h-px" style={{ background: "var(--td-divider)" }} />

        {/* Nav */}
        <nav
          className="flex flex-col items-center gap-1 flex-1 overflow-y-auto w-full pb-2"
          style={{ scrollbarWidth: "none" }}
        >
          {navItems.map(({ to, label, icon: Icon, exact }) => (
            <NavLink key={to} to={to} end={exact} className="flex flex-col items-center gap-1">
              {({ isActive }) => (
                <>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                    style={
                      isActive
                        ? {
                            background: "var(--td-nav-active-bg)",
                            border: "1px solid var(--td-nav-active-border)",
                            boxShadow: "var(--td-nav-active-shadow)",
                          }
                        : { background: "transparent", border: "1px solid transparent" }
                    }
                  >
                    <Icon
                      size={18}
                      strokeWidth={isActive ? 2.3 : 1.8}
                      style={{ color: isActive ? "var(--td-icon-active)" : "var(--td-icon-inactive)" }}
                    />
                  </div>
                  <span style={{
                    fontSize: "9px",
                    fontWeight: isActive ? 700 : 600,
                    color: isActive ? "var(--td-nav-active-label)" : "var(--td-text-lo)",
                    transition: "color 0.18s",
                  }}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          {/* Caja */}
          <NavLink to="/caja" className="flex flex-col items-center gap-1">
            {({ isActive }) => (
              <>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                  style={
                    isActive
                      ? { background: "var(--td-nav-active-bg)", border: "1px solid var(--td-nav-active-border)", boxShadow: "var(--td-nav-active-shadow)" }
                      : { background: "transparent", border: "1px solid transparent" }
                  }
                >
                  <ShoppingCart size={18} strokeWidth={isActive ? 2.3 : 1.8} style={{ color: isActive ? "var(--td-icon-active)" : "var(--td-icon-inactive)" }} />
                </div>
                <span style={{ fontSize: "9px", fontWeight: isActive ? 700 : 600, color: isActive ? "var(--td-nav-active-label)" : "var(--td-text-lo)", transition: "color 0.18s" }}>
                  Caja
                </span>
              </>
            )}
          </NavLink>
        </nav>

        {/* Notifications */}
        <NotificationBadge />

        {/* Avatar + user menu */}
        <div
          className="relative flex flex-col items-center shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => setShowUserMenu(v => !v)}
            className="rounded-full transition-all"
            style={{
              background: "transparent",
              border: `1px solid ${showUserMenu ? "var(--td-red-brd)" : "var(--td-panel-border)"}`,
              padding: 0,
            }}
            title={user?.name ?? ""}
          >
            <UserAvatar
              name={user?.name ?? ""}
              avatarUrl={user?.avatar_url}
              size={36}
            />
          </button>

          {showUserMenu && (
            <div
              className="absolute bottom-11 left-12 z-50 rounded-xl overflow-hidden shadow-2xl"
              style={{
                background: "var(--td-popup-bg)",
                border: "1px solid var(--td-popup-border)",
                minWidth: 192,
              }}
            >
              {/* User info */}
              <div style={{
                padding: "11px 14px 8px",
                borderBottom: "1px solid var(--td-divider)",
              }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: "var(--td-text-hi)", margin: 0 }}>
                  {user?.name}
                </p>
                <p style={{ fontSize: 10, color: "var(--td-text-ghost)", margin: "2px 0 0" }}>
                  {user?.email}
                </p>
              </div>

              {/* Settings — solo si el rol tiene acceso a esa página
                  (admin). Cajero/gerente no ven la opción. */}
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

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2 justify-between transition-colors"
                style={{
                  color: "var(--td-text-md)",
                  background: "transparent",
                  borderTop: "1px solid var(--td-divider)",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--td-hover-bg)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span className="flex items-center gap-2">
                  {isDark
                    ? <Sun size={12} style={{ color: "var(--td-text-lo)" }} />
                    : <Moon size={12} style={{ color: "var(--td-text-lo)" }} />
                  }
                  {isDark ? "Modo Claro" : "Modo Oscuro"}
                </span>
                {/* Toggle switch pill */}
                <div className={`td-toggle-track${isDark ? "" : " on"}`}>
                  <div className="td-toggle-thumb" />
                </div>
              </button>

              {/* Logout */}
              <button
                onClick={() => { setShowUserMenu(false); void handleLogout(); }}
                className="w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2 transition-colors"
                style={{
                  color: "var(--td-red)",
                  background: "transparent",
                  borderTop: "1px solid var(--td-divider)",
                }}
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

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* ADR-014: <ExpiringDraftsModal /> desactivado — carrito client-side. */}
    </div>
  );
}
