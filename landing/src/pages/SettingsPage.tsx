import { useState, useEffect, useCallback } from "react";
import {
  Settings, Globe, Terminal, Save,
  Eye, EyeOff, Database, RefreshCw,
  Loader2, CheckCircle2, AlertCircle,
  ExternalLink, Info, Clock, Search,
  Shield, ChevronLeft, ChevronRight, User,
  Building2, Hash, Mail, Phone, MapPin,
} from "lucide-react";
import { motion as Motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  batchUpdateSystemSettings,
  getSystemLogs, getCatalogSettings, updateCatalogSettings,
  getCompanies, updateCompany,
} from "@tadaima/api";
import type { SystemSettingsMap, SystemLog, CatalogSettings, Company } from "@tadaima/api";
import { useActiveStore } from "@/contexts/StoreContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSystemSettingsQuery } from "@/hooks/queries/useSystemSettings";
import { queryKeys } from "@/lib/queryKeys";

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG = "var(--td-page-bg)";
const GLASS: React.CSSProperties = {
  background: "var(--td-panel-bg)",
  backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  border: "1px solid var(--td-panel-border)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)",
};

type Tab = "empresa" | "general" | "catalog" | "logs";

// Known setting keys managed in the UI
const SETTING_KEYS = ["app_name", "currency", "timezone", "maintenance_mode", "exchange_rate"] as const;
type SettingKey = (typeof SETTING_KEYS)[number];

const SETTING_META: Record<SettingKey, { label: string; placeholder: string; type: "text" | "toggle" | "select" | "number" }> = {
  app_name:         { label: "Nombre de la Empresa",     placeholder: "Tadaima Collectibles",   type: "text" },
  currency:         { label: "Moneda Predeterminada",     placeholder: "MXN",                     type: "text" },
  timezone:         { label: "Zona Horaria",              placeholder: "America/Mexico_City",      type: "text" },
  maintenance_mode: { label: "Modo de Mantenimiento",     placeholder: "",                        type: "toggle" },
  exchange_rate:    { label: "Tipo de Cambio (USD→MXN)", placeholder: "17.50",                   type: "number" },
};

export function SettingsPage() {
  const { activeStore } = useActiveStore();

  const [activeTab, setActiveTab] = useState<Tab>("empresa");

  const queryClient = useQueryClient();

  // ── Empresa ───────────────────────────────────────────────────────────────
  const companiesQuery = useQuery({
    queryKey: ['companies', 'list'],
    queryFn: () => getCompanies(),
  });
  const company: Company | null = companiesQuery.data?.[0] ?? null;
  const companyLoading = companiesQuery.isPending;
  const [companyDraft, setCompanyDraft] = useState<Partial<Company>>({});
  const [companySaving, setCompanyS]    = useState(false);

  useEffect(() => {
    if (company) setCompanyDraft(company);
  }, [company]);

  useEffect(() => {
    if (companiesQuery.error) toast.error("Error al cargar empresa");
  }, [companiesQuery.error]);

  const saveCompany = async () => {
    if (!company) return;
    setCompanyS(true);
    try {
      const updated = await updateCompany(company.id, {
        name: companyDraft.name,
        rfc: companyDraft.rfc ?? undefined,
        address: companyDraft.address ?? undefined,
        phone: companyDraft.phone ?? undefined,
        email: companyDraft.email ?? undefined,
      });
      setCompanyDraft(updated);
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast.success("Empresa actualizada");
    } catch {
      toast.error("Error al guardar empresa");
    } finally {
      setCompanyS(false);
    }
  };

  // ── General Settings ──────────────────────────────────────────────────────
  const settingsQuery = useSystemSettingsQuery();
  const settings: SystemSettingsMap = settingsQuery.data ?? {};
  const settingsLoading = settingsQuery.isPending;
  const [settingsDraft, setDraft] = useState<SystemSettingsMap>({});
  const [settingsSaving, setSS]   = useState(false);

  useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data);
  }, [settingsQuery.data]);

  useEffect(() => {
    if (settingsQuery.error) toast.error("Error al cargar configuración");
  }, [settingsQuery.error]);

  // ── Catalog Settings ──────────────────────────────────────────────────────
  const [catalog, setCatalog]       = useState<CatalogSettings | null>(null);
  const [catalogDraft, setCatDraft] = useState<Partial<CatalogSettings>>({});
  const [catalogLoading, setCL]     = useState(false);
  const [catalogSaving, setCS]      = useState(false);

  // ── System Logs ───────────────────────────────────────────────────────────
  const [logs, setLogs]             = useState<SystemLog[]>([]);
  const [logsLoading, setLL]        = useState(false);
  const [logsPage, setLogsPage]     = useState(1);
  const [logsTotalPages, setLTP]    = useState(1);
  const [logsTotal, setLogsTotal]   = useState(0);
  const [logSearch, setLogSearch]   = useState("");

  // ── Load catalog settings when tab becomes active ─────────────────────────
  useEffect(() => {
    if (activeTab !== "catalog" || !activeStore) return;
    setCL(true);
    getCatalogSettings(activeStore.id)
      .then(cs => { setCatalog(cs); setCatDraft(cs); })
      .catch(() => toast.error("Error al cargar catálogo"))
      .finally(() => setCL(false));
  }, [activeTab, activeStore]);

  // ── Load logs ─────────────────────────────────────────────────────────────
  const fetchLogs = useCallback((page: number, search: string) => {
    setLL(true);
    getSystemLogs({ page, per_page: 30, search: search || undefined })
      .then(res => {
        setLogs(res.data);
        setLTP(res.pagination.last_page);
        setLogsTotal(res.pagination.total);
      })
      .catch(() => toast.error("Error al cargar logs"))
      .finally(() => setLL(false));
  }, []);

  useEffect(() => {
    if (activeTab !== "logs") return;
    fetchLogs(logsPage, logSearch);
  }, [activeTab, logsPage, fetchLogs]);   // intentionally exclude logSearch — refreshed by button

  // ── Save general settings ─────────────────────────────────────────────────
  const saveSettings = async () => {
    setSS(true);
    try {
      const updated = await batchUpdateSystemSettings(settingsDraft);
      setDraft(updated);
      // Invalidate both the general settings map and the derived exchange rate
      // so cashiers see the new value within the next poll window or immediately
      // if they're on the same client.
      void queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings.all });
      toast.success("Configuración guardada");
    } catch {
      toast.error("Error al guardar configuración");
    } finally {
      setSS(false);
    }
  };

  // ── Save catalog settings ─────────────────────────────────────────────────
  const saveCatalog = async () => {
    if (!activeStore || !catalog) return;
    setCS(true);
    try {
      const updated = await updateCatalogSettings(activeStore.id, {
        catalog_url: catalogDraft.catalog_url ?? null,
        show_price:  catalogDraft.show_price  ?? catalog.show_price,
        show_stock:  catalogDraft.show_stock  ?? catalog.show_stock,
      });
      setCatalog(updated);
      setCatDraft(updated);
      toast.success("Catálogo actualizado");
    } catch {
      toast.error("Error al guardar catálogo");
    } finally {
      setCS(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof Settings }[] = [
    { id: "empresa", label: "Empresa",           icon: Building2 },
    { id: "general", label: "Configuración",     icon: Shield    },
    { id: "catalog", label: "Catálogo Online",   icon: Globe     },
    { id: "logs",    label: "Logs del Sistema",  icon: Terminal  },
  ];

  return (
    <div className="min-h-screen p-8 space-y-8" style={{ background: BG }}>

      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Control del <span className="text-[#E0221A]">Sistema</span>
          </h1>
          <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mt-1">
            Configuración global · Catálogo · Trazabilidad
          </p>
        </div>
        <Settings size={32} className="text-white/10" />
      </header>

      <div className="flex flex-col lg:flex-row gap-8">

        {/* Sidebar */}
        <nav className="w-full lg:w-60 flex flex-col gap-2 shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`p-4 rounded-2xl flex items-center gap-4 transition-all border text-left ${
                activeTab === tab.id
                  ? "bg-[#E0221A] border-[#E0221A]/50 text-white shadow-xl shadow-[#E0221A]/20"
                  : "bg-white/[0.03] border-white/5 text-white/40 hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              <tab.icon size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}

          {/* API status badge */}
          <div className="mt-6 p-5 rounded-2xl border border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-white/20 mb-3">
              <Database size={12} />
              Servidor
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-white/50">Laravel API</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
            </div>
            {activeStore && (
              <p className="text-[9px] text-white/20 font-bold mt-2 truncate">
                Tienda: {activeStore.name}
              </p>
            )}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">

            {/* ── TAB: Empresa ─────────────────────────────────────────────── */}
            {activeTab === "empresa" && (
              <Motion.div
                key="empresa"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="p-8 rounded-[32px]" style={GLASS}>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#E0221A]">
                      <Building2 size={20} />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-white uppercase tracking-[0.1em]">Información de la Empresa</h2>
                      <p className="text-[9px] font-black uppercase text-white/20 tracking-widest mt-0.5">Datos fiscales y de contacto</p>
                    </div>
                  </div>

                  {companyLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 size={24} className="animate-spin text-white/20" />
                    </div>
                  ) : !company ? (
                    <div className="py-16 text-center text-white/20">
                      <Building2 size={32} className="mx-auto mb-4" />
                      <p className="text-xs font-black uppercase tracking-widest">No hay empresa registrada</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {([
                          { key: "name"    as const, label: "Nombre Comercial",   icon: Building2 },
                          { key: "rfc"     as const, label: "RFC",                icon: Hash      },
                          { key: "email"   as const, label: "Correo Electrónico", icon: Mail      },
                          { key: "phone"   as const, label: "Teléfono",           icon: Phone     },
                          { key: "address" as const, label: "Dirección",          icon: MapPin    },
                        ]).map(({ key, label, icon: Icon }) => (
                          <div key={key} className="space-y-2">
                            <label className="text-[9px] font-black text-white/30 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                              <Icon size={10} />
                              {label}
                            </label>
                            <input
                              type="text"
                              value={String(companyDraft[key] ?? "")}
                              onChange={e => setCompanyDraft(d => ({ ...d, [key]: e.target.value }))}
                              className="w-full px-5 py-3.5 rounded-2xl outline-none border border-white/5 bg-white/[0.03] font-bold text-sm text-white placeholder:text-white/15 focus:border-[#E0221A]/30 focus:bg-white/[0.06] transition-all"
                            />
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={saveCompany}
                        disabled={companySaving}
                        className="flex items-center gap-3 px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest text-[10px] text-white transition-all disabled:opacity-50"
                        style={{
                          background: "linear-gradient(135deg, #BB1100 0%, #E0221A 100%)",
                          boxShadow: "0 0 24px rgba(224,34,26,0.25)",
                        }}
                      >
                        {companySaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        Guardar Cambios
                      </button>
                    </div>
                  )}
                </div>
              </Motion.div>
            )}

            {/* ── TAB: General ────────────────────────────────────────────── */}
            {activeTab === "general" && (
              <Motion.div
                key="general"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="p-8 rounded-[32px]" style={GLASS}>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#E0221A]">
                      <Shield size={20} />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-white uppercase tracking-[0.1em]">Configuración General</h2>
                      <p className="text-[9px] font-black uppercase text-white/20 tracking-widest mt-0.5">Ajustes globales del sistema</p>
                    </div>
                  </div>

                  {settingsLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 size={24} className="animate-spin text-white/20" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Text settings */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {(["app_name", "currency", "timezone"] as SettingKey[]).map(key => (
                          <div key={key} className="space-y-2">
                            <label className="text-[9px] font-black text-white/30 uppercase tracking-widest ml-1">
                              {SETTING_META[key].label}
                            </label>
                            <input
                              type="text"
                              value={settingsDraft[key] ?? ""}
                              onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                              placeholder={SETTING_META[key].placeholder}
                              className="w-full px-5 py-3.5 rounded-2xl outline-none border border-white/5 bg-white/[0.03] font-bold text-sm text-white placeholder:text-white/15 focus:border-[#E0221A]/30 focus:bg-white/[0.06] transition-all"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Tipo de Cambio */}
                      <div className="flex items-center justify-between p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10">
                        <div className="flex items-center gap-4">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0 text-sm font-black">
                            $
                          </div>
                          <div>
                            <p className="text-sm font-black text-white">Tipo de Cambio USD → MXN</p>
                            <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-0.5">
                              Referencia global para todas las cajas · se muestra solo como referencia del día
                            </p>
                          </div>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={settingsDraft["exchange_rate"] ?? ""}
                          onChange={e => setDraft(d => ({ ...d, exchange_rate: e.target.value }))}
                          placeholder="17.50"
                          className="w-28 text-right px-4 py-2 rounded-xl outline-none border border-emerald-500/20 bg-emerald-500/5 font-black text-lg text-emerald-400 placeholder:text-white/15 focus:border-emerald-500/40 focus:bg-emerald-500/10 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>

                      {/* Maintenance toggle */}
                      <div className="flex items-center justify-between p-5 rounded-2xl bg-[#E0221A]/5 border border-[#E0221A]/10">
                        <div className="flex items-center gap-4">
                          <div className="w-9 h-9 rounded-xl bg-[#E0221A]/10 flex items-center justify-center text-[#E0221A] shrink-0">
                            <Info size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-white">Modo de Mantenimiento</p>
                            <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-0.5">
                              Bloquea nuevas ventas, solo consultas
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            setDraft(d => ({
                              ...d,
                              maintenance_mode: d["maintenance_mode"] === "1" ? "0" : "1",
                            }))
                          }
                          className={`relative w-12 h-6 rounded-full border transition-all ${
                            settingsDraft["maintenance_mode"] === "1"
                              ? "bg-[#E0221A] border-[#E0221A]/50"
                              : "bg-white/5 border-white/10"
                          }`}
                        >
                          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                            settingsDraft["maintenance_mode"] === "1" ? "left-7" : "left-1"
                          }`} />
                        </button>
                      </div>

                      {/* Save button */}
                      <button
                        onClick={saveSettings}
                        disabled={settingsSaving}
                        className="flex items-center gap-3 px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest text-[10px] text-white transition-all disabled:opacity-50"
                        style={{
                          background: "linear-gradient(135deg, #BB1100 0%, #E0221A 100%)",
                          boxShadow: "0 0 24px rgba(224,34,26,0.25)",
                        }}
                      >
                        {settingsSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        Guardar Cambios
                      </button>
                    </div>
                  )}
                </div>
              </Motion.div>
            )}

            {/* ── TAB: Catalog ─────────────────────────────────────────────── */}
            {activeTab === "catalog" && (
              <Motion.div
                key="catalog"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="p-8 rounded-[32px]" style={GLASS}>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#E0221A]">
                      <Globe size={20} />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-white uppercase tracking-[0.1em]">Catálogo Online</h2>
                      <p className="text-[9px] font-black uppercase text-white/20 tracking-widest mt-0.5">
                        {activeStore ? activeStore.name : "Selecciona una tienda"}
                      </p>
                    </div>
                  </div>

                  {!activeStore ? (
                    <div className="py-16 text-center opacity-30">
                      <Globe size={32} className="mx-auto mb-4" />
                      <p className="text-xs font-black uppercase tracking-widest">Sin tienda activa</p>
                    </div>
                  ) : catalogLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 size={24} className="animate-spin text-white/20" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* URL del catálogo */}
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-widest ml-1">
                          Slug del Catálogo Público
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={catalogDraft.catalog_url ?? ""}
                            onChange={e => setCatDraft(d => ({ ...d, catalog_url: e.target.value }))}
                            placeholder="tadaima-mx"
                            className="w-full px-5 py-3.5 pr-12 rounded-2xl outline-none border border-white/5 bg-white/[0.03] font-bold text-sm text-white placeholder:text-white/15 focus:border-[#E0221A]/30 transition-all"
                          />
                          <ExternalLink size={14} className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20" />
                        </div>
                        {catalog?.public_url && (
                          <p className="text-[9px] font-bold text-white/20 ml-1">
                            URL pública: <span className="text-emerald-500/60">{catalog.public_url}</span>
                          </p>
                        )}
                      </div>

                      {/* Toggles */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {([
                          { key: "show_price" as const, label: "Mostrar Precios", desc: "Precios visibles en la web pública", icon: Eye, iconOff: EyeOff },
                          { key: "show_stock" as const, label: "Mostrar Stock",   desc: "Indica si hay unidades disponibles", icon: CheckCircle2, iconOff: AlertCircle },
                        ]).map(({ key, label, desc, icon: IconOn, iconOff: IconOff }) => {
                          const active = catalogDraft[key] ?? false;
                          return (
                            <div key={key} className="flex items-center justify-between p-5 rounded-2xl bg-white/[0.02] border border-white/5">
                              <div>
                                <p className="text-xs font-black text-white">{label}</p>
                                <p className="text-[9px] font-bold text-white/30 mt-0.5">{desc}</p>
                              </div>
                              <button
                                onClick={() => setCatDraft(d => ({ ...d, [key]: !d[key] }))}
                                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                                  active ? "bg-[#E0221A] text-white" : "bg-white/5 text-white/20"
                                }`}
                              >
                                {active ? <IconOn size={17} /> : <IconOff size={17} />}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {catalog?.updated_at && (
                        <p className="text-[9px] text-white/20 font-bold">
                          Última actualización: {new Date(catalog.updated_at).toLocaleString("es-MX")}
                        </p>
                      )}

                      <button
                        onClick={saveCatalog}
                        disabled={catalogSaving}
                        className="flex items-center gap-3 px-8 py-3.5 rounded-2xl font-black uppercase tracking-widest text-[10px] text-white transition-all disabled:opacity-50"
                        style={{
                          background: "linear-gradient(135deg, #BB1100 0%, #E0221A 100%)",
                          boxShadow: "0 0 24px rgba(224,34,26,0.25)",
                        }}
                      >
                        {catalogSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        Guardar Catálogo
                      </button>
                    </div>
                  )}
                </div>
              </Motion.div>
            )}

            {/* ── TAB: Logs ────────────────────────────────────────────────── */}
            {activeTab === "logs" && (
              <Motion.div
                key="logs"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {/* Toolbar */}
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                    <input
                      type="text"
                      value={logSearch}
                      onChange={e => setLogSearch(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { setLogsPage(1); fetchLogs(1, logSearch); }}}
                      placeholder="Buscar acción o descripción..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white/[0.03] border border-white/5 text-sm font-bold text-white placeholder:text-white/20 outline-none focus:border-white/15 transition-all"
                    />
                  </div>
                  <button
                    onClick={() => { setLogsPage(1); fetchLogs(1, logSearch); }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/[0.04] border border-white/10 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    <RefreshCw size={13} className={logsLoading ? "animate-spin" : ""} />
                    Buscar
                  </button>
                </div>

                <div className="p-6 rounded-[32px]" style={GLASS}>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#E0221A]">
                        <Terminal size={16} />
                      </div>
                      <div>
                        <h2 className="text-sm font-black text-white uppercase tracking-[0.1em]">Logs de Actividad</h2>
                        <p className="text-[9px] text-white/20 font-black uppercase tracking-widest mt-0.5">
                          {logsTotal.toLocaleString()} registros totales
                        </p>
                      </div>
                    </div>
                  </div>

                  {logsLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 size={24} className="animate-spin text-white/20" />
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="py-16 text-center opacity-20">
                      <Database size={28} className="mx-auto mb-4" />
                      <p className="text-xs font-black uppercase tracking-widest">Sin registros</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {logs.map(log => (
                        <div
                          key={log.id}
                          className="flex gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors"
                        >
                          <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-white/20 shrink-0">
                            <Clock size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-4 mb-1">
                              <span className="text-[10px] font-black uppercase text-[#E0221A] tracking-wider truncate">
                                {log.action}
                              </span>
                              <span className="text-[9px] font-bold text-white/20 shrink-0">
                                {new Date(log.created_at).toLocaleString("es-MX")}
                              </span>
                            </div>
                            {log.description && (
                              <p className="text-xs font-bold text-white/70 truncate">{log.description}</p>
                            )}
                            {log.user && (
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <User size={9} className="text-white/20" />
                                <span className="text-[9px] font-black uppercase text-white/20 tracking-widest">
                                  {log.user.name}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pagination */}
                  {logsTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/5">
                      <button
                        disabled={logsPage <= 1}
                        onClick={() => setLogsPage(p => p - 1)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white disabled:opacity-30 text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        <ChevronLeft size={13} /> Anterior
                      </button>
                      <span className="text-[10px] font-black text-white/30">
                        Pág. {logsPage} / {logsTotalPages}
                      </span>
                      <button
                        disabled={logsPage >= logsTotalPages}
                        onClick={() => setLogsPage(p => p + 1)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white disabled:opacity-30 text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        Siguiente <ChevronRight size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </Motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
