// @ts-nocheck — scaffolding de tienda-T, se reescribe en Fases 9–14
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@tadaima/auth";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ShoppingCart, Package, LogOut, Home, Store,
  Users, Receipt, UserCircle2, ClipboardList, ArrowLeftRight, BarChart2,
  Settings, Sun, Moon,
} from "lucide-react";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";
import { useState } from "react";

const adminNavItems = [
  { to: "/",          label: "Inicio",    icon: Home,          exact: true },
  { to: "/products",  label: "Productos", icon: Package },
  { to: "/sales",     label: "Ventas",    icon: Receipt },
  { to: "/clients",   label: "Clientes",  icon: UserCircle2 },
  { to: "/pre-sales", label: "Preventas", icon: ClipboardList },
  { to: "/transfers", label: "Traslados", icon: ArrowLeftRight },
  { to: "/reports",   label: "Reportes",  icon: BarChart2 },
];

const staffNavItems = [
  { to: "/",          label: "Inicio",    icon: Home,          exact: true },
  { to: "/stores",    label: "Tiendas",   icon: Store },
  { to: "/products",  label: "Productos", icon: Package },
  { to: "/sales",     label: "Ventas",    icon: Receipt },
  { to: "/clients",   label: "Clientes",  icon: UserCircle2 },
  { to: "/pre-sales", label: "Preventas", icon: ClipboardList },
  { to: "/transfers", label: "Traslados", icon: ArrowLeftRight },
  { to: "/reports",   label: "Reportes",  icon: BarChart2 },
  { to: "/settings",  label: "Config",    icon: Settings },
];

export function Layout() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout }  = useAuth();
  const { theme, toggleTheme } = useTheme();

  const isAdmin = user?.roles?.some(r =>
    ["admin","super_admin","owner","dueño"].includes(r.toLowerCase())
  ) ?? false;
  const navItems = isAdmin ? adminNavItems : staffNavItems;

  const [showUserMenu, setShowUserMenu] = useState(false);

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
        className="glass-dark w-[76px] flex flex-col items-center py-5 gap-4 shrink-0 relative z-10 animate-in fade-in slide-in-from-left duration-300"
      >

        {/* Logo */}
        <div
          className="flex items-center justify-center mb-2"
          style={{
            background: "#fff",
            borderRadius: "10px",
            padding: "5px 7px",
            width: "52px",
            boxShadow: "0 0 18px rgba(204,34,0,0.4), 0 4px 10px rgba(0,0,0,0.25)",
            border: "1px solid rgba(204,34,0,0.15)",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 900, color: "var(--td-red)", letterSpacing: "-0.02em", display: "block" }}>
            Tadaima
          </span>
        </div>

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
            className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
            style={{
              background: showUserMenu ? "var(--td-red-dim)" : "var(--td-panel-bg)",
              border: `1px solid ${showUserMenu ? "var(--td-red-brd)" : "var(--td-panel-border)"}`,
              color: "var(--td-red)",
            }}
            title={user?.name ?? ""}
          >
            {initials}
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

              {/* Settings */}
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
    </div>
  );
}
