import { useEffect, useMemo, useState } from "react";
import { Printer, Download, RotateCcw, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight, Shield, User as UserIcon, Users, X, LayoutGrid, List } from "lucide-react";
import { useAuth } from "@tadaima/auth";
import { isAdmin as isAdminRole } from "@/lib/permisos";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

// ─── Datos del walkthrough ────────────────────────────────────────────────────

type Status = "pending" | "ok" | "warn" | "ko";

interface Item {
  id: string;
  label: string;
  /** Detalle más largo opcional, hint para el demo */
  hint?: string;
}

interface Section {
  id: string;
  title: string;
  items: Item[];
}

interface RoleGroup {
  role: "admin" | "gerente" | "cajero";
  title: string;
  icon: React.ElementType;
  color: string;
  sections: Section[];
}

const WALKTHROUGH: RoleGroup[] = [
  {
    role: "admin",
    title: "Administrador",
    icon: Shield,
    color: "#E0221A",
    sections: [
      {
        id: "admin-inicio",
        title: "Inicio · Dashboard",
        items: [
          { id: "admin-kpi", label: "Row KPIs del día (Ventas, Apartados, Stock crítico)", hint: "Visible solo admin" },
          { id: "admin-setup", label: "Setup wizard (primeros pasos)", hint: "Aparece si no hay tiendas" },
          { id: "admin-secciones", label: "Bento de Operaciones / Inventario / Sistema" },
        ],
      },
      {
        id: "admin-productos",
        title: "Productos regulares",
        items: [
          { id: "admin-prod-alta", label: "Alta de producto con costo + precios + métodos de pago" },
          { id: "admin-prod-edit", label: "Edición incluye costo (gerente/cajero NO ven costo)" },
          { id: "admin-prod-stock", label: "Modal QuickStock por tienda" },
          { id: "admin-prod-delete", label: "Borrado normal + Force-delete admin (cleanup GCS + cascada)" },
          { id: "admin-prod-search", label: "Search por nombre/SKU/barcode con toast si no encuentra" },
        ],
      },
      {
        id: "admin-mangas",
        title: "Tomos / Librería",
        items: [
          { id: "admin-manga-alta", label: "Alta batch (lote completo con margen %)" },
          { id: "admin-manga-edit", label: "Editar tomo con Margen % y costo real visible" },
          { id: "admin-manga-vol", label: "Vol. N visible en lista (badge rojo al lado del nombre)" },
          { id: "admin-manga-stock", label: "Agregar tienda nueva al inventario desde el modal" },
        ],
      },
      {
        id: "admin-caja",
        title: "Caja",
        items: [
          { id: "admin-caja-abrir", label: "Abrir caja con efectivo inicial" },
          { id: "admin-caja-tab", label: "Multi-tab Caja Principal + Venta 2/3/4/5" },
          { id: "admin-caja-mixto", label: "Cobro mixto: tarjeta + efectivo + dólares" },
          { id: "admin-caja-folio", label: "Cargar folio tipando PREV- en buscador (cache RQ)" },
          { id: "admin-caja-scanner", label: "Scanner USB HID + cámara (QR + Code128 + EAN13)" },
          { id: "admin-caja-scan-no-suma", label: "Re-escanear NO suma (qty=1 fresh, +/- manual)" },
          { id: "admin-caja-dolares", label: "Cambio bilingüe USD/MXN con TC del día" },
          { id: "admin-caja-cash-only", label: "Producto cash_only restringe toda la venta a Efectivo/Dólares", hint: "¿Quieres cobro split por método? Decisión cliente." },
          { id: "admin-caja-cliente", label: "Asignar cliente (manual + scan TAD socio Tadaima)" },
          { id: "admin-caja-quitar", label: "Quitar cliente con ✕ del footer" },
          { id: "admin-caja-conflict", label: "Reanudar sesión propia / forzar cierre ajena (admin)" },
          { id: "admin-caja-comision", label: "Comisión terminal absorbida por tienda (no se cobra al cliente)" },
        ],
      },
      {
        id: "admin-ventas",
        title: "Ventas",
        items: [
          { id: "admin-ventas-lista", label: "Lista de Ventas con scroll interno + columna Vendedor" },
          { id: "admin-ventas-prod", label: "Por Producto con bar de ranking" },
          { id: "admin-ventas-reporte", label: "Tab Reporte del Día con secciones A-F" },
          { id: "admin-ventas-ganancia", label: "Sección Ganancia Bruta · Solo Admin con margen %" },
          { id: "admin-ventas-pdf", label: "Imprimir + Exportar PDF (jsPDF + autoTable)" },
          { id: "admin-ventas-flujo", label: "Tab Flujo de Caja Semanal (chart Recharts)" },
        ],
      },
      {
        id: "admin-preventas",
        title: "Preventas",
        items: [
          { id: "admin-prev-catalogos", label: "Tab Catálogos (admin only): crear/editar/cerrar/cancelar" },
          { id: "admin-prev-stock", label: "Stock por tienda en catálogo (pre_sale_catalog_store_limits)" },
          { id: "admin-prev-image", label: "Imagen del catálogo (5MB, GCS)" },
          { id: "admin-prev-folios", label: "Tab Folios con filtros (Pendiente / Listo / Entregado / Vencido)" },
          { id: "admin-prev-difusion", label: "Tab Difusión (broadcast WhatsApp/email)" },
          { id: "admin-prev-vencidos", label: "Tab Vencidos" },
        ],
      },
      {
        id: "admin-traslados",
        title: "Traslados",
        items: [
          { id: "admin-traslado-solicitar", label: "Solicitar (pending hasta confirmar)" },
          { id: "admin-traslado-completar", label: "Completar ahora (solo admin)" },
        ],
      },
      {
        id: "admin-reportes",
        title: "Reportes (Admin only)",
        items: [
          { id: "admin-rep-sales", label: "Ventas con 7 presets de fecha" },
          { id: "admin-rep-products", label: "Top productos" },
          { id: "admin-rep-customers", label: "Clientes" },
          { id: "admin-rep-cash", label: "Sesiones de caja con descuadre" },
        ],
      },
      {
        id: "admin-sistema",
        title: "Sistema",
        items: [
          { id: "admin-tiendas", label: "Tiendas (CRUD)" },
          { id: "admin-users", label: "Usuarios + Roles + Borrar" },
          { id: "admin-permisos", label: "Permisos granulares (can_view_cost por usuario)" },
          { id: "admin-categorias", label: "Categorías y métodos de pago" },
          { id: "admin-terminales", label: "Terminales con comisión %" },
          { id: "admin-settings", label: "Tipo de cambio + config global" },
        ],
      },
      {
        id: "admin-auditoria",
        title: "Auditoría",
        items: [
          { id: "admin-audit-product", label: "Logs de mutaciones (product.created/updated/deleted)" },
          { id: "admin-audit-manga", label: "Logs de mangas" },
          { id: "admin-audit-inventory", label: "Logs de ajustes de stock con delta" },
          { id: "admin-audit-cash", label: "Logs de force-close de sesiones" },
        ],
      },
    ],
  },
  {
    role: "gerente",
    title: "Gerente",
    icon: Users,
    color: "#10b981",
    sections: [
      {
        id: "ger-inicio",
        title: "Inicio · Dashboard",
        items: [
          { id: "ger-cajeros", label: "Cajeros conectados de su tienda (avatar + tiempo + badge)" },
          { id: "ger-cortes", label: "Cortes de hoy con 4 KPIs (Sesiones/Ventas/Entradas/Salidas)" },
          { id: "ger-detalle", label: "Click en sesión abre detalle con opción imprimir" },
          { id: "ger-sin-kpi", label: "NO ve row KPIs admin (es repetitivo con Cortes)" },
          { id: "ger-acciones", label: "Acciones rápidas: Abrir Caja + Productos" },
        ],
      },
      {
        id: "ger-nav",
        title: "Navegación lateral",
        items: [
          { id: "ger-no-tiendas", label: "NO ve Tiendas (usa switcher del header)" },
          { id: "ger-no-reportes", label: "NO ve Reportes (info financiera global solo admin)" },
        ],
      },
      {
        id: "ger-productos",
        title: "Productos",
        items: [
          { id: "ger-prod-edit", label: "Crear + editar productos (sin costo)" },
          { id: "ger-prod-stock", label: "QuickStock limitado a su tienda (otras tiendas ocultas)" },
          { id: "ger-prod-no-force", label: "NO puede force-delete" },
        ],
      },
      {
        id: "ger-mangas",
        title: "Tomos / Librería",
        items: [
          { id: "ger-manga-edit", label: "Editar con Margen % SIEMPRE visible (decisión Joel 25-may)" },
          { id: "ger-manga-stock-mia", label: "Tab Inventario solo muestra su tienda" },
          { id: "ger-manga-agregar", label: "Puede agregar inventario nuevo a su tienda" },
        ],
      },
      {
        id: "ger-caja",
        title: "Caja",
        items: [
          { id: "ger-caja-flujo", label: "Mismo flujo que admin (sin row KPIs)" },
          { id: "ger-caja-folio", label: "Buscar PREV- en input principal" },
          { id: "ger-caja-quitar", label: "Quitar cliente con ✕" },
          { id: "ger-caja-reanudar", label: "Reanudar sesión propia si quedó abierta" },
          { id: "ger-caja-no-forzar", label: "NO puede forzar cierre de sesión ajena (solo admin)" },
        ],
      },
      {
        id: "ger-ventas",
        title: "Ventas",
        items: [
          { id: "ger-ventas-tienda", label: "Solo ve ventas de su tienda" },
          { id: "ger-ventas-vendedor", label: "Columna Vendedor visible (sabe quién vendió cada ticket)" },
          { id: "ger-ventas-reporte", label: "Tab Reporte del Día SIN Ganancia Bruta" },
          { id: "ger-ventas-flujo", label: "Tab Flujo de Caja Semanal visible" },
        ],
      },
      {
        id: "ger-preventas",
        title: "Preventas",
        items: [
          { id: "ger-prev-disponibles", label: "Tab Disponibles (read-only, sin Catálogos)" },
          { id: "ger-prev-folios", label: "Tab Folios + Difusión + Vencidos" },
          { id: "ger-prev-no-catalogos", label: "NO ve Catálogos (gestión solo admin)" },
        ],
      },
      {
        id: "ger-traslados",
        title: "Traslados",
        items: [
          { id: "ger-traslado-solicitar", label: "Solo Solicitar (admin destino confirma)" },
          { id: "ger-traslado-no-completar", label: "NO ve botón Completar ahora" },
        ],
      },
    ],
  },
  {
    role: "cajero",
    title: "Cajero",
    icon: UserIcon,
    color: "#60a5fa",
    sections: [
      {
        id: "caj-inicio",
        title: "Inicio · Mi Perfil",
        items: [
          { id: "caj-perfil", label: "Avatar + datos read-only + tienda asignada" },
          { id: "caj-cortes", label: "Botón Mis Cortes (últimos 90 días) con detalle + imprimir" },
        ],
      },
      {
        id: "caj-productos",
        title: "Productos / Tomos",
        items: [
          { id: "caj-prod-view", label: "Vista detalle read-only (nombre, precio, stock de SU tienda)" },
          { id: "caj-prod-avisar", label: "Botón Avisar → notifica a gerente + admins" },
          { id: "caj-prod-alta", label: "Alta de producto rápida (sin force, sin costo)" },
        ],
      },
      {
        id: "caj-caja",
        title: "Caja (su día a día)",
        items: [
          { id: "caj-abrir", label: "Abrir caja con efectivo inicial" },
          { id: "caj-scan-fresh", label: "Re-escanear el MISMO producto NO suma" },
          { id: "caj-scan-folio", label: "Tipear PREV- carga folio con items + cliente" },
          { id: "caj-cliente-tad", label: "Scan TAD socio Tadaima auto-asigna cliente" },
          { id: "caj-quitar-cliente", label: "Quitar cliente con ✕ si se equivocó" },
          { id: "caj-cobro-mixto", label: "Cobro mixto (efectivo + tarjeta + dólares + transferencia)" },
          { id: "caj-cobro-usd", label: "Cobrar en Dólares con $100 USD → ve cambio bilingüe" },
          { id: "caj-cerrar", label: "Cerrar caja con declarado vs esperado" },
        ],
      },
      {
        id: "caj-ventas",
        title: "Ventas",
        items: [
          { id: "caj-ventas-mias", label: "Solo ve SUS ventas (RBAC backend)" },
          { id: "caj-ventas-reimprimir", label: "Botón Ticket para reimprimir" },
          { id: "caj-ventas-devolver", label: "Botón Devolver con confirmación" },
        ],
      },
      {
        id: "caj-preventas",
        title: "Preventas",
        items: [
          { id: "caj-prev-disponibles", label: "Disponibles para vender (catálogos publicados)" },
          { id: "caj-prev-folios", label: "Folios + Difusión + Vencidos" },
        ],
      },
    ],
  },
];

const STATUS_LABELS: Record<Status, string> = {
  pending: "Pendiente",
  ok: "OK",
  warn: "Con cambios",
  ko: "No funciona",
};

const STATUS_STYLES: Record<Status, { bg: string; border: string; color: string }> = {
  pending: { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.10)", color: "var(--td-text-md)" },
  ok:      { bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.35)",  color: "#10b981" },
  warn:    { bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.4)",   color: "#f59e0b" },
  ko:      { bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.4)",    color: "#f87171" },
};

interface ItemState {
  status: Status;
  notes: string;
}

const STORAGE_KEY = "tadaima:demo-walkthrough:v1";

// ─── Componente ───────────────────────────────────────────────────────────────

export function DemoWalkthroughPage() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.roles);

  const [state, setState] = useState<Record<string, ItemState>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [collapsedRoles, setCollapsedRoles] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  /** "mapa" = bento por rol (default, ideal para demo). "lista" = vista anterior, ideal para imprimir. */
  const [viewMode, setViewMode] = useState<"mapa" | "lista">("mapa");
  /** Rol activo en vista mapa (tabs). */
  const [activeRole, setActiveRole] = useState<"admin" | "gerente" | "cajero">("admin");
  /** Sección expandida inline en vista mapa (solo una a la vez para no llenar pantalla). */
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* quota / disabled */ }
  }, [state]);

  // Stats
  const stats = useMemo(() => {
    const all = WALKTHROUGH.flatMap(r => r.sections.flatMap(s => s.items));
    const total = all.length;
    let ok = 0, warn = 0, ko = 0, pending = 0;
    all.forEach(item => {
      const st = state[item.id]?.status ?? "pending";
      if (st === "ok") ok++;
      else if (st === "warn") warn++;
      else if (st === "ko") ko++;
      else pending++;
    });
    const progress = total === 0 ? 0 : ((ok + warn + ko) / total) * 100;
    return { total, ok, warn, ko, pending, progress };
  }, [state]);

  if (!isAdmin) return <Navigate to="/" replace />;

  const setStatus = (id: string, status: Status) =>
    setState(prev => ({ ...prev, [id]: { ...(prev[id] ?? { notes: "" }), status } }));
  const setNotes = (id: string, notes: string) =>
    setState(prev => ({ ...prev, [id]: { ...(prev[id] ?? { status: "pending" }), notes } }));

  const handleReset = () => {
    if (!window.confirm("¿Resetear todos los checks y notas?")) return;
    setState({});
    toast.success("Walkthrough reseteado");
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `walkthrough-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const toggleRole = (role: string) => {
    setCollapsedRoles(prev => {
      const n = new Set(prev);
      n.has(role) ? n.delete(role) : n.add(role);
      return n;
    });
  };
  const toggleSection = (id: string) => {
    setCollapsedSections(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  /** Stats agregados por sección (para el bento) */
  const sectionStats = (section: Section) => {
    const total = section.items.length;
    let ok = 0, warn = 0, ko = 0, pending = 0;
    section.items.forEach(it => {
      const st = state[it.id]?.status ?? "pending";
      if (st === "ok") ok++;
      else if (st === "warn") warn++;
      else if (st === "ko") ko++;
      else pending++;
    });
    const done = ok + warn + ko;
    const progress = total === 0 ? 0 : (done / total) * 100;
    // Color dominante: rojo si hay ko, ámbar si hay warn pero no ko, verde si todo ok, gris si pendiente
    const dominantColor = ko > 0 ? "#f87171" : warn > 0 ? "#f59e0b" : (ok === total && total > 0) ? "#10b981" : "rgba(255,255,255,0.25)";
    return { total, ok, warn, ko, pending, done, progress, dominantColor };
  };

  const activeRoleGroup = WALKTHROUGH.find(r => r.role === activeRole)!;

  return (
    <div className="min-h-screen app-bg p-8 print:p-4 print:bg-white">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-bg { background: white !important; color: black !important; }
          .demo-section { page-break-inside: avoid; }
          textarea { border: 1px solid #ccc !important; background: white !important; color: black !important; }
        }
      `}</style>

      {/* Header */}
      <div className="mb-6 print:mb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 print:text-gray-500">
              Walkthrough · Demo Cliente
            </p>
            <h1 className="text-2xl font-black mt-1 text-white print:text-black">
              Tadaima POS · Revisión por Rol
            </h1>
            <p className="text-xs text-white/40 mt-1 print:text-gray-600">
              {new Date().toLocaleDateString("es-MX", { dateStyle: "full" })} · Marca cada item, anota cambios, imprime al final.
            </p>
          </div>

          <div className="flex items-center gap-2 no-print flex-wrap">
            {/* Toggle vista: Mapa (bento, default) vs Lista (cascada para imprimir) */}
            <div className="flex items-center gap-0 rounded-xl overflow-hidden" style={{ border: "1px solid var(--td-panel-border)" }}>
              <button onClick={() => setViewMode("mapa")}
                className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all"
                style={{
                  background: viewMode === "mapa" ? "linear-gradient(135deg, #CC2200, #FF4422)" : "var(--td-panel-bg)",
                  color: viewMode === "mapa" ? "#fff" : "var(--td-text-md)",
                }}>
                <LayoutGrid size={12} /> Mapa
              </button>
              <button onClick={() => setViewMode("lista")}
                className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all"
                style={{
                  background: viewMode === "lista" ? "linear-gradient(135deg, #CC2200, #FF4422)" : "var(--td-panel-bg)",
                  color: viewMode === "lista" ? "#fff" : "var(--td-text-md)",
                }}>
                <List size={12} /> Lista
              </button>
            </div>
            <button onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-white/10"
              style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", color: "var(--td-text-md)" }}>
              <RotateCcw size={12} /> Reset
            </button>
            <button onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-white/10"
              style={{ background: "var(--td-panel-bg)", border: "1px solid var(--td-panel-border)", color: "var(--td-text-md)" }}>
              <Download size={12} /> JSON
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-[1.02]"
              style={{ background: "linear-gradient(135deg, #CC2200, #FF4422)", border: "1px solid rgba(255,120,90,0.3)", color: "#fff" }}>
              <Printer size={12} /> Imprimir
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatChip label="Total" value={stats.total} color="rgba(255,255,255,0.5)" />
          <StatChip label="Pendientes" value={stats.pending} color="rgba(255,255,255,0.4)" />
          <StatChip label="OK" value={stats.ok} color="#10b981" />
          <StatChip label="Con cambios" value={stats.warn} color="#f59e0b" />
          <StatChip label="No funciona" value={stats.ko} color="#f87171" />
        </div>

        {/* Progress bar */}
        <div className="mt-3 w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="h-full transition-all duration-300" style={{
            width: `${stats.progress}%`,
            background: "linear-gradient(90deg, #10b981, #f59e0b 60%, #f87171 95%)",
          }} />
        </div>
      </div>

      {/* ════ VISTA MAPA — bento por rol con tabs ════════════════════════════ */}
      {/* En print siempre se renderiza vista lista (más limpia). */}
      <div className={viewMode === "mapa" ? "print:hidden" : "hidden"}>
        {/* Tabs por rol */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {WALKTHROUGH.map(role => {
            const Icon = role.icon;
            const active = activeRole === role.role;
            const roleStats = role.sections.reduce(
              (acc, s) => {
                s.items.forEach(it => {
                  const st = state[it.id]?.status ?? "pending";
                  if (st === "ok") acc.ok++;
                  else if (st === "warn") acc.warn++;
                  else if (st === "ko") acc.ko++;
                });
                acc.total += s.items.length;
                return acc;
              },
              { ok: 0, warn: 0, ko: 0, total: 0 },
            );
            return (
              <button
                key={role.role}
                onClick={() => { setActiveRole(role.role); setExpandedSection(null); }}
                className="flex items-center gap-3 px-5 py-3 rounded-2xl transition-all"
                style={{
                  background: active
                    ? `linear-gradient(135deg, ${role.color}22, ${role.color}08)`
                    : "rgba(255,255,255,0.02)",
                  border: `1px solid ${active ? role.color : "var(--td-panel-border)"}`,
                  boxShadow: active ? `0 0 0 1px ${role.color}33, 0 8px 24px ${role.color}11` : "none",
                  transform: active ? "translateY(-1px)" : "none",
                }}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{
                  background: active ? `${role.color}33` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${active ? `${role.color}66` : "var(--td-panel-border)"}`,
                }}>
                  <Icon size={16} style={{ color: active ? role.color : "var(--td-text-md)" }} />
                </div>
                <div className="text-left">
                  <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: active ? role.color : "var(--td-text-ghost)" }}>
                    Rol
                  </p>
                  <p className="text-sm font-black" style={{ color: active ? "#fff" : "var(--td-text-md)" }}>
                    {role.title}
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  {roleStats.ok > 0 && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
                      {roleStats.ok}
                    </span>
                  )}
                  {roleStats.warn > 0 && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                      {roleStats.warn}
                    </span>
                  )}
                  {roleStats.ko > 0 && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                      {roleStats.ko}
                    </span>
                  )}
                  <span className="text-[9px] font-bold" style={{ color: "var(--td-text-ghost)" }}>
                    /{roleStats.total}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Bento grid de secciones del rol activo */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {activeRoleGroup.sections.map(section => {
            const s = sectionStats(section);
            const isExpanded = expandedSection === section.id;
            return (
              <div
                key={section.id}
                className="rounded-2xl transition-all"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: `1px solid ${isExpanded ? activeRoleGroup.color + "55" : "var(--td-panel-border)"}`,
                  gridColumn: isExpanded ? "1 / -1" : "auto",
                }}
              >
                <button
                  onClick={() => setExpandedSection(prev => prev === section.id ? null : section.id)}
                  className="w-full text-left p-4 transition-colors hover:bg-white/[0.02] rounded-2xl"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-xs font-black uppercase tracking-widest flex-1" style={{ color: "var(--td-text-hi)" }}>
                      {section.title}
                    </p>
                    <span
                      className="w-2 h-2 rounded-full mt-1 shrink-0"
                      style={{ background: s.dominantColor, boxShadow: `0 0 0 3px ${s.dominantColor}22` }}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold" style={{ color: "var(--td-text-ghost)" }}>
                    <span>{s.done}/{s.total} revisados</span>
                    {s.warn > 0 && <span style={{ color: "#f59e0b" }}>· {s.warn} cambios</span>}
                    {s.ko > 0 && <span style={{ color: "#f87171" }}>· {s.ko} no funciona</span>}
                  </div>
                  {/* Mini progress bar */}
                  <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="h-full transition-all" style={{
                      width: `${s.progress}%`,
                      background: s.dominantColor,
                    }} />
                  </div>
                </button>

                {/* Expand inline: items con check + notas */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 space-y-2" style={{ borderTop: "1px solid var(--td-panel-border)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: activeRoleGroup.color }}>
                        {section.items.length} ítems
                      </p>
                      <button
                        onClick={() => setExpandedSection(null)}
                        className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-white/10"
                        style={{ color: "var(--td-text-ghost)" }}
                        title="Cerrar"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    {section.items.map(item => {
                      const itemState = state[item.id] ?? { status: "pending" as Status, notes: "" };
                      return (
                        <ChecklistItem
                          key={item.id}
                          item={item}
                          itemState={itemState}
                          onStatusChange={st => setStatus(item.id, st)}
                          onNotesChange={n => setNotes(item.id, n)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ════ VISTA LISTA — todos los roles en cascada, ideal para imprimir ═════ */}
      <div className={viewMode === "lista" ? "" : "hidden print:block"}>
      {WALKTHROUGH.map(role => {
        const Icon = role.icon;
        const isCollapsed = collapsedRoles.has(role.role);
        return (
          <div key={role.role} className="mb-6 demo-section">
            <button
              onClick={() => toggleRole(role.role)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl transition-colors hover:bg-white/[0.02] print:hover:bg-transparent"
              style={{
                background: `linear-gradient(135deg, ${role.color}11, transparent)`,
                border: `1px solid ${role.color}33`,
              }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: `${role.color}22`, border: `1px solid ${role.color}55` }}>
                <Icon size={18} style={{ color: role.color }} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: `${role.color}` }}>Rol</p>
                <h2 className="text-base font-black text-white print:text-black mt-0.5">{role.title}</h2>
              </div>
              <span className="text-[10px] text-white/40 print:hidden">{role.sections.length} secciones</span>
              <span className="print:hidden">
                {isCollapsed ? <ChevronRight size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
              </span>
            </button>

            {!isCollapsed && (
              <div className="mt-3 space-y-3">
                {role.sections.map(section => {
                  const secCollapsed = collapsedSections.has(section.id);
                  return (
                    <div key={section.id} className="rounded-2xl print:break-inside-avoid"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--td-panel-border)" }}>
                      <button
                        onClick={() => toggleSection(section.id)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left no-print"
                      >
                        <span className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--td-text-md)" }}>
                          {section.title}
                        </span>
                        {secCollapsed ? <ChevronRight size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
                      </button>
                      <div className="hidden print:block px-4 py-2">
                        <span className="text-xs font-black uppercase tracking-widest text-gray-700">{section.title}</span>
                      </div>

                      {(!secCollapsed || true /* siempre visible en print */) && (
                        <div className={`px-4 pb-4 space-y-2 ${secCollapsed ? "hidden print:block" : ""}`}>
                          {section.items.map(item => {
                            const itemState = state[item.id] ?? { status: "pending" as Status, notes: "" };
                            return (
                              <ChecklistItem
                                key={item.id}
                                item={item}
                                itemState={itemState}
                                onStatusChange={s => setStatus(item.id, s)}
                                onNotesChange={n => setNotes(item.id, n)}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      </div>

      {/* Footer */}
      <div className="mt-8 mb-4 p-4 rounded-2xl text-center print:border print:border-gray-300"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--td-panel-border)" }}>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/30 print:text-gray-600">
          Firma del cliente / fecha
        </p>
        <div className="mt-6 mb-1 mx-auto border-b border-white/20 print:border-gray-500" style={{ width: "60%", height: 1 }} />
      </div>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2"
      style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}33` }}>
      <p className="text-[8px] font-black uppercase tracking-widest" style={{ color }}>{label}</p>
      <p className="text-lg font-black text-white print:text-black mt-0.5">{value}</p>
    </div>
  );
}

function ChecklistItem({
  item, itemState, onStatusChange, onNotesChange,
}: {
  item: Item;
  itemState: ItemState;
  onStatusChange: (s: Status) => void;
  onNotesChange: (n: string) => void;
}) {
  const style = STATUS_STYLES[itemState.status];
  return (
    <div className="rounded-xl p-3 print:p-2 print:break-inside-avoid"
      style={{ background: style.bg, border: `1px solid ${style.border}` }}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white print:text-black">{item.label}</p>
          {item.hint && (
            <p className="text-[10px] mt-0.5 italic" style={{ color: style.color }}>{item.hint}</p>
          )}
        </div>

        <div className="flex items-center gap-1 no-print">
          <StatusButton current={itemState.status} target="ok" icon={CheckCircle2} color="#10b981"
            onClick={() => onStatusChange(itemState.status === "ok" ? "pending" : "ok")} />
          <StatusButton current={itemState.status} target="warn" icon={AlertTriangle} color="#f59e0b"
            onClick={() => onStatusChange(itemState.status === "warn" ? "pending" : "warn")} />
          <StatusButton current={itemState.status} target="ko" icon={XCircle} color="#f87171"
            onClick={() => onStatusChange(itemState.status === "ko" ? "pending" : "ko")} />
        </div>

        {/* Status badge for print */}
        <span className="hidden print:inline text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded"
          style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
          {STATUS_LABELS[itemState.status]}
        </span>
      </div>

      {/* Notes */}
      <textarea
        value={itemState.notes}
        onChange={e => onNotesChange(e.target.value)}
        placeholder="Notas del cliente…"
        rows={itemState.notes ? Math.max(2, itemState.notes.split("\n").length) : 1}
        className="w-full mt-2 rounded-lg px-3 py-2 text-xs outline-none resize-none print:bg-white print:text-black"
        style={{
          background: "rgba(0,0,0,0.25)",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.85)",
        }}
      />
    </div>
  );
}

function StatusButton({
  current, target, icon: Icon, color, onClick,
}: {
  current: Status;
  target: Status;
  icon: React.ElementType;
  color: string;
  onClick: () => void;
}) {
  const active = current === target;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110"
      style={{
        background: active ? `${color}22` : "transparent",
        border: `1px solid ${active ? color : "rgba(255,255,255,0.08)"}`,
      }}
      title={STATUS_LABELS[target]}
    >
      <Icon size={13} style={{ color: active ? color : "rgba(255,255,255,0.3)" }} />
    </button>
  );
}
